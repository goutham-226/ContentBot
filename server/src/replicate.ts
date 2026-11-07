// Minimal Replicate HTTP client: start a prediction, wait for it, return the output.
// https://replicate.com/docs/reference/http

import { CanceledError, runContext, throwIfCanceled } from './runContext.ts';

const API_BASE = process.env.REPLICATE_API_BASE ?? 'https://api.replicate.com/v1';
const POLL_MS = 2000;
const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;

export const MODELS = {
  llm: process.env.REPLICATE_LLM_MODEL ?? 'google/gemini-2.5-flash',
  // FLUX.2 [klein] 4B: ~$0.001 per megapixel, with up to 5 reference images.
  image: process.env.REPLICATE_IMAGE_MODEL ?? 'black-forest-labs/flux-2-klein-4b',
  video: process.env.REPLICATE_VIDEO_MODEL ?? 'minimax/h3-highspeed',
  voice: process.env.REPLICATE_VOICE_MODEL ?? 'qwen/qwen3-tts',
  // 768-dimension vectors; knowledge_chunks.embedding must match.
  embedding: 'replicate/all-mpnet-base-v2',
};

const EMBED_BATCH = 32;

export class ReplicateError extends Error {}

type Prediction = {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output: unknown;
  error: string | null;
  urls?: { get?: string };
};

function token(): string {
  const value = process.env.REPLICATE_API_TOKEN;
  if (!value) throw new ReplicateError('Replicate isn’t set up yet: add REPLICATE_API_TOKEN to .env.');
  return value;
}

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, ...init.headers },
    signal: AbortSignal.timeout(90_000),
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body && typeof body === 'object' && 'detail' in body ? String(body.detail) : res.statusText;
    throw new ReplicateError(`Replicate returned ${res.status}: ${detail}`);
  }
  return body as T;
}

// Replicate throttles low-credit accounts (6 predictions a minute, one at a
// time). The first 429 switches prediction creation to one every
// THROTTLED_GAP_MS, queued in order, and the request is retried.
const THROTTLED_GAP_MS = 10_500;
const MAX_THROTTLE_RETRIES = 12;
let createGapMs = 0;
let lastCreate = 0;
let createQueue: Promise<void> = Promise.resolve();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function createSlot(): Promise<void> {
  createQueue = createQueue.then(async () => {
    const wait = lastCreate + createGapMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastCreate = Date.now();
  });
  return createQueue;
}

// Official models run by name; community models (like the embedding model)
// need a version id, looked up once and cached.
const versions = new Map<string, string>();

async function latestVersion(model: string): Promise<string> {
  const cached = versions.get(model);
  if (cached) return cached;
  const info = await api<{ latest_version?: { id?: string } | null }>(`${API_BASE}/models/${model}`);
  const id = info.latest_version?.id;
  if (!id) throw new ReplicateError(`${model} has no published version.`);
  versions.set(model, id);
  return id;
}

async function startPrediction(model: string, input: Record<string, unknown>): Promise<Prediction> {
  const init = { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'wait=60' } };
  if (!versions.has(model)) {
    try {
      return await api<Prediction>(`${API_BASE}/models/${model}/predictions`, { ...init, body: JSON.stringify({ input }) });
    } catch (err) {
      if (!(err instanceof ReplicateError && err.message.startsWith('Replicate returned 404'))) throw err;
    }
  }
  const version = await latestVersion(model);
  return api<Prediction>(`${API_BASE}/predictions`, { ...init, body: JSON.stringify({ version, input }) });
}

async function createPrediction(model: string, input: Record<string, unknown>): Promise<Prediction> {
  for (let attempt = 0; ; attempt++) {
    await createSlot();
    throwIfCanceled(); // may have been cancelled while queued
    try {
      return await startPrediction(model, input);
    } catch (err) {
      const throttled = err instanceof ReplicateError && err.message.startsWith('Replicate returned 429');
      if (!throttled || attempt >= MAX_THROTTLE_RETRIES) throw err;
      createGapMs = THROTTLED_GAP_MS;
      const resetsIn = Number(/resets in ~(\d+)s/.exec(err.message)?.[1] ?? 10);
      await sleep(resetsIn * 1000 + Math.random() * 1000);
    }
  }
}

// Stops a prediction on Replicate (so it stops billing). Best effort.
export async function cancelPrediction(id: string) {
  await api(`${API_BASE}/predictions/${id}/cancel`, { method: 'POST' }).catch(() => {});
}

async function predict(model: string, input: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
  throwIfCanceled();
  const ctx = runContext.getStore();
  let prediction = await createPrediction(model, input);
  ctx?.predictions.add(prediction.id);
  try {
    const deadline = Date.now() + timeoutMs;
    while (prediction.status === 'starting' || prediction.status === 'processing') {
      if (ctx?.canceled) {
        await cancelPrediction(prediction.id);
        throw new CanceledError();
      }
      if (Date.now() > deadline) throw new ReplicateError(`${model} took too long.`);
      await new Promise((r) => setTimeout(r, POLL_MS));
      prediction = await api<Prediction>(prediction.urls?.get ?? `${API_BASE}/predictions/${prediction.id}`);
    }
  } finally {
    ctx?.predictions.delete(prediction.id);
  }
  throwIfCanceled();
  if (prediction.status !== 'succeeded') {
    throw new ReplicateError(`${model} ${prediction.status}: ${prediction.error ?? 'no details'}`);
  }
  return prediction.output;
}

// Uploads bytes to Replicate's file store so they can be passed as model inputs.
export async function uploadFile(data: Buffer, contentType: string, filename: string): Promise<string> {
  const form = new FormData();
  form.append('content', new Blob([new Uint8Array(data)], { type: contentType }), filename);
  const file = await api<{ urls: { get: string } }>(`${API_BASE}/files`, { method: 'POST', body: form });
  return file.urls.get;
}

export async function download(url: string): Promise<{ data: Buffer; contentType: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new ReplicateError(`Couldn’t download the result (${res.status}).`);
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > MAX_DOWNLOAD_BYTES) throw new ReplicateError('The result was too large to save.');
  return { data, contentType: res.headers.get('content-type') ?? 'application/octet-stream' };
}

// Gemini names its length limit differently and can "think" first; thinking is
// off because these prompts are structured extraction and writing, and it
// keeps runs fast and cheap. Other models (e.g. Qwen) take max_tokens.
function textInput(model: string, prompt: string, maxTokens: number): Record<string, unknown> {
  if (model.startsWith('google/gemini')) {
    return { prompt, max_output_tokens: maxTokens, temperature: 0.7, thinking_budget: 0 };
  }
  return { prompt, max_tokens: maxTokens, temperature: 0.7 };
}

export async function generateText(prompt: string, maxTokens = 2048): Promise<string> {
  const output = await predict(MODELS.llm, textInput(MODELS.llm, prompt, maxTokens), 5 * 60_000);
  return Array.isArray(output) ? output.join('') : String(output ?? '');
}

// Each image model family names its inputs differently.
function imageInput(model: string, prompt: string, references: string[], aspectRatio: string, megapixels: 1 | 2) {
  if (model.includes('flux-2-klein')) {
    return {
      prompt,
      ...(references.length > 0 && { images: references.slice(0, 5) }),
      aspect_ratio: aspectRatio,
      output_megapixels: String(megapixels),
      output_format: 'jpg',
    };
  }
  if (model.includes('flux-2')) {
    return {
      prompt,
      ...(references.length > 0 && { input_images: references.slice(0, 8) }),
      aspect_ratio: aspectRatio,
      resolution: `${megapixels} MP`,
      output_format: 'jpg',
    };
  }
  // Seedream
  return {
    prompt,
    ...(references.length > 0 && { image_input: references.slice(0, 14) }),
    size: '2K',
    aspect_ratio: aspectRatio,
    sequential_image_generation: 'disabled',
  };
}

// Returns the generated image's (temporary) URL. 1 MP is plenty for 768p video
// references; banners and character sheets ask for 2 MP.
export async function generateImage(
  prompt: string,
  references: string[],
  aspectRatio = '9:16',
  megapixels: 1 | 2 = 1,
): Promise<string> {
  const output = await predict(MODELS.image, imageInput(MODELS.image, prompt, references, aspectRatio, megapixels), 5 * 60_000);
  const url = Array.isArray(output) ? output[0] : output;
  if (typeof url !== 'string') throw new ReplicateError('The image model returned no image.');
  return url;
}

// Returns the voiceover's (temporary) URL. Qwen3-TTS is the best value on
// Replicate (~$0.02 per 1,000 characters). A preset speaker keeps the voice
// identical across scenes and videos; the style instruction only changes the
// delivery (pace, energy, emotion), not who is speaking.
export async function generateSpeech(text: string, speaker: string, styleInstruction = ''): Promise<string> {
  const output = await predict(
    MODELS.voice,
    {
      text,
      mode: 'custom_voice',
      speaker,
      language: 'auto',
      ...(styleInstruction && { style_instruction: styleInstruction }),
    },
    5 * 60_000,
  );
  const url = Array.isArray(output) ? output[0] : output;
  if (typeof url !== 'string') throw new ReplicateError('The voice model returned no audio.');
  return url;
}

// MiniMax H3's reference rules: up to 9 images; up to 3 videos and 3 audio
// clips, each 2–15 s and at most 15 s of each in total; audio only alongside
// an image or video. URLs must be publicly fetchable, so only Replicate output
// links work (uploads to the Files API need auth). Callers check durations.
export const VIDEO_LIMITS = { images: 9, videos: 3, audio: 3, minClipSeconds: 2, maxTotalSeconds: 15 };

// Returns the generated video's (temporary) URL. References must be public
// URLs, so pass Replicate output links straight from the same run. Reference
// video seconds are billed like output seconds.
export async function generateVideo(
  prompt: string,
  references: { images: string[]; audio: string[]; videos: string[] },
  duration: number,
): Promise<string> {
  const visual = references.images.length > 0 || references.videos.length > 0;
  const output = await predict(
    MODELS.video,
    {
      prompt,
      duration,
      ratio: '9:16',
      ...(references.images.length > 0 && { reference_image_urls: references.images.slice(0, VIDEO_LIMITS.images) }),
      ...(references.videos.length > 0 && { reference_video_urls: references.videos.slice(0, VIDEO_LIMITS.videos) }),
      ...(visual && references.audio.length > 0 && { reference_audio_urls: references.audio.slice(0, VIDEO_LIMITS.audio) }),
    },
    20 * 60_000,
  );
  const url = Array.isArray(output) ? output[0] : output;
  if (typeof url !== 'string') throw new ReplicateError('The video model returned no video.');
  return url;
}

export async function embed(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const output = await predict(
      MODELS.embedding,
      { text_batch: JSON.stringify(texts.slice(i, i + EMBED_BATCH)) },
      3 * 60_000,
    );
    if (!Array.isArray(output)) throw new ReplicateError('The embedding model returned nothing.');
    for (const item of output) {
      const v: unknown = item && typeof item === 'object' && 'embedding' in item ? item.embedding : null;
      if (!Array.isArray(v)) throw new ReplicateError('The embedding model returned an unexpected result.');
      vectors.push(v.map(Number));
    }
  }
  return vectors;
}
