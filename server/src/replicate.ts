// Minimal Replicate HTTP client: start a prediction, wait for it, return the output.
// https://replicate.com/docs/reference/http

import { CanceledError, runContext, throwIfCanceled } from './runContext.ts';

const API_BASE = process.env.REPLICATE_API_BASE ?? 'https://api.replicate.com/v1';
const POLL_MS = 2000;
const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;

export const MODELS = {
  llm: process.env.REPLICATE_LLM_MODEL ?? 'qwen/qwen3-7-plus',
  // Researches topics (articles and openly licensed book summaries) and writes
  // the clips' scripts. Falls back to the LLM chain.
  writer: process.env.REPLICATE_WRITER_MODEL ?? 'openai/gpt-5-nano',
  // GPT Image 2 at low quality, with reference images.
  image: process.env.REPLICATE_IMAGE_MODEL ?? 'openai/gpt-image-2',
  // MiniMax H3 Lite, always at 480P (its lowest resolution, to keep costs
  // down). Takes reference images, videos and audio. Pruna is its backup.
  video: process.env.REPLICATE_VIDEO_MODEL ?? 'minimax/h3-lite',
  premiumVideo: process.env.REPLICATE_PREMIUM_VIDEO_MODEL ?? 'bytedance/seedance-2.5',
  voice: process.env.REPLICATE_VOICE_MODEL ?? 'qwen/qwen3-tts',
  // Looks at images, e.g. to check whether a character portrait is a realistic person.
  vision: process.env.REPLICATE_VISION_MODEL ?? 'google/gemini-2.5-flash',
  // Embeddings run locally: see embeddings.ts.
};

// Backups, tried in order when a model fails.
export const BACKUPS = {
  llm: ['deepseek-ai/deepseek-v3.1', 'google/gemini-2.5-flash'],
  // FLUX.2 [klein] 4B and 9B, then Pruna (P-Image Edit with references, P-Image without).
  image: ['black-forest-labs/flux-2-klein-4b', 'black-forest-labs/flux-2-klein-9b', 'prunaai/p-image-edit'],
  // Pruna's reference-to-video model (built on MiniMax H3), only after H3 Lite
  // has failed VIDEO_TRIES times. Unlike MiniMax it takes a start frame
  // together with reference images and audio.
  video: ['prunaai/p-video-2-pro-reference'],
  // When Seedance fails a premium scene (premium is off for now): H3 Lite,
  // then Pruna, as 15 s halves.
  premiumVideo: [MODELS.video, 'prunaai/p-video-2-pro-reference'],
};
const VIDEO_TRIES = 2;
// H3 Lite can sit in Replicate's queue; after this long without starting, the
// clip goes to Pruna instead.
const VIDEO_START_TIMEOUT_MS = 5 * 60_000;
const VIDEO_RESOLUTION = '480P'; // H3 Lite's lowest; always sent, as its default is 768P
const PRUNA_RESOLUTION = '480p';
const PRUNA_MODE = 'cost'; // one GPU: slower, cheaper than 'speed'

export class ReplicateError extends Error {}

// A prediction that sat in Replicate's queue too long without starting. It's
// cancelled (nothing was billed), and withFallback moves straight on to the
// next model instead of queueing on the same one again.
export class NotStartedError extends ReplicateError {}

// Failures another model can't fix: no token, a bad token, or no Replicate credit.
function isAccountProblem(err: unknown): boolean {
  return err instanceof ReplicateError
    && /^Replicate (isn’t set up|returned 40[12])/.test(err.message);
}

const shortName = (model: string) => model.split('/')[1] ?? model;

// Runs `job` on each model in turn (each `tries` times), moving on only when
// the model itself fails. Each switch shows up in the run's thinking trail.
export async function withFallback<T>(
  chain: { model: string; tries: number }[],
  task: string,
  job: (model: string) => Promise<T>,
): Promise<T> {
  let lastError: unknown = new ReplicateError(`No model available for ${task}.`);
  for (const [i, { model, tries }] of chain.entries()) {
    for (let attempt = 1; attempt <= tries; attempt++) {
      try {
        return await job(model);
      } catch (err) {
        if (err instanceof CanceledError || isAccountProblem(err)) throw err;
        lastError = err;
        const reason = err instanceof Error ? err.message : String(err);
        console.warn(`${model} failed (${task}, try ${attempt}/${tries}): ${reason}`);
        const retry = attempt < tries && !(err instanceof NotStartedError);
        const next = retry ? model : chain[i + 1]?.model;
        if (next) {
          await runContext.getStore()?.notify?.(
            next === model
              ? `${shortName(model)} failed ${task}, trying again`
              : `${shortName(model)} failed ${task}, switching to ${shortName(next)}`,
            reason,
          ).catch(() => {});
        }
        if (!retry) break;
      }
    }
  }
  throw lastError;
}

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

// Official models run by name; community models
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

// `startTimeoutMs`: give up (and cancel) if the prediction hasn't started by then.
async function predict(
  model: string, input: Record<string, unknown>, timeoutMs: number, startTimeoutMs?: number,
): Promise<unknown> {
  throwIfCanceled();
  const ctx = runContext.getStore();
  let prediction = await createPrediction(model, input);
  ctx?.predictions.add(prediction.id);
  try {
    const deadline = Date.now() + timeoutMs;
    const startDeadline = startTimeoutMs === undefined ? Infinity : Date.now() + startTimeoutMs;
    while (prediction.status === 'starting' || prediction.status === 'processing') {
      if (ctx?.canceled) {
        await cancelPrediction(prediction.id);
        throw new CanceledError();
      }
      if (prediction.status === 'starting' && Date.now() > startDeadline) {
        await cancelPrediction(prediction.id);
        throw new NotStartedError(`${model} didn’t start within ${Math.round((startTimeoutMs ?? 0) / 60_000)} minutes.`);
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
  const tooLarge = () => new ReplicateError('The result was too large to save.');
  if (Number(res.headers.get('content-length') ?? 0) > MAX_DOWNLOAD_BYTES) {
    await res.body?.cancel().catch(() => {});
    throw tooLarge();
  }
  // Read in chunks, giving up as soon as it's over the limit.
  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_DOWNLOAD_BYTES) {
      await reader.cancel().catch(() => {});
      throw tooLarge();
    }
    chunks.push(value);
  }
  return { data: Buffer.concat(chunks), contentType: res.headers.get('content-type') ?? 'application/octet-stream' };
}

// Gemini names its length limit differently and can "think" first; thinking is
// off because these prompts are structured extraction and writing, and it
// keeps runs fast and cheap. Other models (Qwen, DeepSeek) take max_tokens.
function textInput(model: string, prompt: string, maxTokens: number): Record<string, unknown> {
  // GPT-5 has no temperature. Low reasoning lets it plan an explanation that
  // holds together; the budget is doubled so the thinking can't crowd out the answer.
  if (model.startsWith('openai/gpt-5')) {
    return { prompt, max_completion_tokens: maxTokens * 2, reasoning_effort: 'low' };
  }
  if (model.startsWith('google/gemini')) {
    return { prompt, max_output_tokens: maxTokens, temperature: 0.7, thinking_budget: 0 };
  }
  return { prompt, max_tokens: maxTokens, temperature: 0.7 };
}

// The LLM first, then its backups. Callers that check the answer (e.g. for
// valid JSON) pass their own job to withFallback with this chain.
export const LLM_CHAIN = [MODELS.llm, ...BACKUPS.llm].map((model) => ({ model, tries: 1 }));
// Research and script writing: the writer first, then the LLM chain.
export const WRITER_CHAIN = [MODELS.writer, MODELS.llm, ...BACKUPS.llm].map((model) => ({ model, tries: 1 }));

export async function generateText(prompt: string, maxTokens = 2048, model = MODELS.llm): Promise<string> {
  const output = await predict(model, textInput(model, prompt, maxTokens), 5 * 60_000);
  return Array.isArray(output) ? output.join('') : String(output ?? '');
}

// Asks the vision model about images (data: URLs or public links). Low
// temperature, since callers use it to classify.
export async function generateTextFromImages(prompt: string, images: string[], maxTokens = 64): Promise<string> {
  const output = await predict(
    MODELS.vision,
    { prompt, images, max_output_tokens: maxTokens, temperature: 0, thinking_budget: 0 },
    2 * 60_000,
  );
  return Array.isArray(output) ? output.join('') : String(output ?? '');
}

// Each image model family names its inputs differently.
function imageInput(model: string, prompt: string, references: string[], aspectRatio: string, megapixels: 1 | 2) {
  if (model.startsWith('openai/gpt-image')) {
    return {
      prompt,
      ...(references.length > 0 && { input_images: references.slice(0, 10) }),
      aspect_ratio: aspectRatio,
      quality: 'low',
      background: 'opaque',
      output_format: 'jpeg',
      number_of_images: 1,
    };
  }
  if (model.includes('flux-2-klein')) {
    return {
      prompt,
      ...(references.length > 0 && { images: references.slice(0, 5) }),
      aspect_ratio: aspectRatio,
      // 4B calls it output_megapixels, 9B megapixels.
      [model.endsWith('-4b') ? 'output_megapixels' : 'megapixels']: String(megapixels),
      output_format: 'jpg',
    };
  }
  if (model === 'prunaai/p-image-edit' || model === 'prunaai/p-image') {
    return { prompt, aspect_ratio: aspectRatio, ...(references.length > 0 && { images: references.slice(0, 5) }) };
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
  // P-Image Edit needs references; P-Image draws from the prompt alone.
  const chain = [MODELS.image, ...BACKUPS.image]
    .map((model) => (model === 'prunaai/p-image-edit' && references.length === 0 ? 'prunaai/p-image' : model))
    .map((model) => ({ model, tries: 1 }));
  return withFallback(chain, 'drawing an image', async (model) => {
    const output = await predict(model, imageInput(model, prompt, references, aspectRatio, megapixels), 5 * 60_000);
    const url = Array.isArray(output) ? output[0] : output;
    if (typeof url !== 'string') throw new ReplicateError(`${model} returned no image.`);
    return url;
  });
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
// video seconds are billed like output seconds. MiniMax can't combine a start
// frame with references, so it gets the previous clip as a reference video;
// the Pruna backup opens on `firstFrame` (the previous clip's last frame)
// instead, which costs far less than a reference video.
// Seedance 2.5 (premium): up to 30 reference images and 10 audio clips, 30 s of
// audio in all. Reference videos would quadruple the price per second, and a
// first frame can't be combined with references, so neither is sent.
export const PREMIUM_LIMITS = { images: 30, audio: 10, maxAudioSeconds: 30 };
// Always Seedance's lowest resolution (the user's choice, to keep costs down).
const PREMIUM_RESOLUTION = '480p';
const PREMIUM_TRIES = 2;

// One premium clip. Its prompt labels the references as [Image1]… and [Audio1]…
// in the order given here.
export async function generatePremiumVideo(
  prompt: string,
  references: { images: string[]; audio: string[] },
  duration: number,
): Promise<string> {
  const images = references.images.slice(0, PREMIUM_LIMITS.images);
  // Seedance needs an image or video reference alongside any reference audio.
  const audio = images.length > 0 ? references.audio.slice(0, PREMIUM_LIMITS.audio) : [];
  return withFallback([{ model: MODELS.premiumVideo, tries: PREMIUM_TRIES }], 'rendering the premium clip', async (model) => {
    const output = await predict(model, {
      prompt,
      duration: Math.min(Math.max(duration, 4), 30),
      resolution: PREMIUM_RESOLUTION,
      aspect_ratio: '9:16',
      generate_audio: true,
      watermark: false,
      ...(images.length > 0 && { reference_images: images }),
      ...(audio.length > 0 && { reference_audios: audio }),
    }, 30 * 60_000);
    const url = Array.isArray(output) ? output[0] : output;
    if (typeof url !== 'string') throw new ReplicateError(`${model} returned no video.`);
    return url;
  });
}

export async function generateVideo(
  prompt: string,
  references: { images: string[]; audio: string[]; videos: string[]; firstFrame?: string | null },
  duration: number,
  models: string[] = [MODELS.video, ...BACKUPS.video], // the first gets VIDEO_TRIES tries
): Promise<string> {
  const { firstFrame } = references;
  const videos = references.videos.slice(0, VIDEO_LIMITS.videos);
  // Both models need a reference image or video alongside any reference audio.
  const visual = references.images.length > 0 || videos.length > 0;
  const audio = visual ? references.audio.slice(0, VIDEO_LIMITS.audio) : [];
  const chain = models.map((model, i) => ({ model, tries: i === 0 ? VIDEO_TRIES : 1 }));
  return withFallback(chain, 'rendering the clip', async (model) => {
    const pruna = model.startsWith('prunaai/');
    // Pruna counts the start frame as one of its 9 reference images.
    const images = references.images.slice(0, VIDEO_LIMITS.images - (pruna && firstFrame ? 1 : 0));
    const input = pruna
      ? {
          prompt,
          duration: Math.min(Math.max(duration, 5), 15),
          aspect_ratio: '9:16',
          resolution: PRUNA_RESOLUTION,
          mode: PRUNA_MODE,
          ...(firstFrame && { first_frame_image: firstFrame }),
          ...(images.length > 0 && { image: images }),
          ...(!firstFrame && videos.length > 0 && { video: videos }),
          ...(audio.length > 0 && { audio }),
        }
      : {
          prompt,
          duration: Math.min(Math.max(duration, 4), 15), // H3 Lite takes 4–15 s
          ratio: '9:16',
          resolution: VIDEO_RESOLUTION,
          ...(images.length > 0 && { reference_image_urls: images }),
          ...(videos.length > 0 && { reference_video_urls: videos }),
          ...(audio.length > 0 && { reference_audio_urls: audio }),
        };
    const output = await predict(model, input, 20 * 60_000, pruna ? undefined : VIDEO_START_TIMEOUT_MS);
    const url = Array.isArray(output) ? output[0] : output;
    if (typeof url !== 'string') throw new ReplicateError(`${model} returned no video.`);
    return url;
  });
}
