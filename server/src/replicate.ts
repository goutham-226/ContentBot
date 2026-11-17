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
  // Kling 4.0 at 720p (its lowest): 30 s clips with the speech, sound effects
  // and lip-sync generated in the clip itself, from the bot's character images
  // and the previous clip as references.
  video: process.env.REPLICATE_VIDEO_MODEL ?? 'kwaivgi/kling-v4.0',
  // Looks at images, e.g. to check whether a character portrait is a realistic person.
  vision: process.env.REPLICATE_VISION_MODEL ?? 'google/gemini-2.5-flash',
  // Embeddings run locally: see embeddings.ts.
};

// Backups, tried in order when a model fails.
export const BACKUPS = {
  llm: ['deepseek-ai/deepseek-v3.1', 'google/gemini-2.5-flash'],
  // FLUX.2 [klein] 4B and 9B, then Pruna (P-Image Edit with references, P-Image without).
  image: ['black-forest-labs/flux-2-klein-4b', 'black-forest-labs/flux-2-klein-9b', 'prunaai/p-image-edit'],
  // When Kling fails a scene twice: MiniMax H3 Lite, then Pruna's reference
  // model, each rendering the scene as two 15 s halves.
  video: ['minimax/h3-lite', 'prunaai/p-video-2-pro-reference'],
};
const VIDEO_TRIES = 2;
// H3 Lite can sit in Replicate's queue; after this long without starting, the
// half goes to Pruna instead.
const VIDEO_START_TIMEOUT_MS = 5 * 60_000;
const KLING_RESOLUTION = '720p'; // Kling's lowest
const H3_RESOLUTION = '480P'; // H3 Lite's lowest; always sent, as its default is 768P
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

// What each video model takes as references. Kling: up to 10 images, and
// reference videos of 3-30 s each, 30 s in all. MiniMax H3: up to 9 images and
// 3 videos, each 2-15 s, 15 s in all. Pruna: 9 images (a start frame counts as
// one). Reference video seconds are billed like output seconds.
// H3 and Pruna can only fetch public URLs (Replicate output links), not
// uploads to the Files API, so they're only given the previous clip.
export const VIDEO_LIMITS = {
  kling: { images: 10, minVideoSeconds: 3, maxVideoSeconds: 30 },
  backup: { images: 9, minVideoSeconds: 2, maxVideoSeconds: 15 },
};

export type ClipReferences = {
  images: string[]; // character images: Kling names them @image_1, @image_2… in this order
  previous: { url: string; seconds: number } | null; // the previous clip, to carry the action on
  firstFrame?: string | null; // data URL of the previous clip's last frame, for Pruna
};

// Returns the generated video's (temporary) URL. The first model gets
// VIDEO_TRIES tries, the rest one each.
export async function generateVideo(
  prompt: string,
  references: ClipReferences,
  duration: number,
  models: string[] = [MODELS.video],
): Promise<string> {
  const { previous, firstFrame } = references;
  const chain = models.map((model, i) => ({ model, tries: i === 0 ? VIDEO_TRIES : 1 }));
  return withFallback(chain, 'rendering the clip', async (model) => {
    let input: Record<string, unknown>;
    if (model.startsWith('kwaivgi/kling')) {
      const { images, minVideoSeconds, maxVideoSeconds } = VIDEO_LIMITS.kling;
      const video = previous && previous.seconds >= minVideoSeconds && previous.seconds <= maxVideoSeconds ? previous.url : null;
      input = {
        prompt,
        duration: Math.min(Math.max(Math.round(duration), 3), 30),
        resolution: KLING_RESOLUTION,
        aspect_ratio: '9:16',
        ...(references.images.length > 0 && { reference_images: references.images.slice(0, images) }),
        ...(video && { reference_videos: [video] }),
      };
    } else {
      const { minVideoSeconds, maxVideoSeconds } = VIDEO_LIMITS.backup;
      const video = previous && previous.seconds >= minVideoSeconds && previous.seconds <= maxVideoSeconds ? previous.url : null;
      input = model.startsWith('prunaai/')
        ? {
            prompt,
            duration: Math.min(Math.max(duration, 5), 15),
            aspect_ratio: '9:16',
            resolution: PRUNA_RESOLUTION,
            mode: PRUNA_MODE,
            ...(firstFrame ? { first_frame_image: firstFrame } : video && { video: [video] }),
          }
        : {
            prompt,
            duration: Math.min(Math.max(duration, 4), 15), // H3 Lite takes 4-15 s
            ratio: '9:16',
            resolution: H3_RESOLUTION,
            ...(video && { reference_video_urls: [video] }),
          };
    }
    const queued = model.startsWith('minimax/') ? VIDEO_START_TIMEOUT_MS : undefined;
    const output = await predict(model, input, 30 * 60_000, queued);
    const url = Array.isArray(output) ? output[0] : output;
    if (typeof url !== 'string') throw new ReplicateError(`${model} returned no video.`);
    return url;
  });
}
