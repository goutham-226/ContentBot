// Minimal Replicate HTTP client: start a prediction, wait for it, return the output.
// https://replicate.com/docs/reference/http

const API_BASE = process.env.REPLICATE_API_BASE ?? 'https://api.replicate.com/v1';
const POLL_MS = 2000;
const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;

export const MODELS = {
  // Replicate has no 270B Qwen; 235B is the largest Qwen text model there.
  llm: process.env.REPLICATE_LLM_MODEL ?? 'qwen/qwen3-235b-a22b-instruct-2507',
  image: process.env.REPLICATE_IMAGE_MODEL ?? 'bytedance/seedream-5-lite',
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

async function predict(model: string, input: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
  let prediction = await api<Prediction>(`${API_BASE}/models/${model}/predictions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'wait=60' },
    body: JSON.stringify({ input }),
  });

  const deadline = Date.now() + timeoutMs;
  while (prediction.status === 'starting' || prediction.status === 'processing') {
    if (Date.now() > deadline) throw new ReplicateError(`${model} took too long.`);
    await new Promise((r) => setTimeout(r, POLL_MS));
    prediction = await api<Prediction>(prediction.urls?.get ?? `${API_BASE}/predictions/${prediction.id}`);
  }
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

export async function generateText(prompt: string, maxTokens = 2048): Promise<string> {
  const output = await predict(MODELS.llm, { prompt, max_tokens: maxTokens, temperature: 0.7 }, 5 * 60_000);
  return Array.isArray(output) ? output.join('') : String(output ?? '');
}

// Returns the generated image's (temporary) URL.
export async function generateImage(prompt: string, references: string[], aspectRatio = '9:16'): Promise<string> {
  const output = await predict(
    MODELS.image,
    {
      prompt,
      ...(references.length > 0 && { image_input: references }),
      size: '2K',
      aspect_ratio: aspectRatio,
      sequential_image_generation: 'disabled',
    },
    5 * 60_000,
  );
  const url = Array.isArray(output) ? output[0] : output;
  if (typeof url !== 'string') throw new ReplicateError('The image model returned no image.');
  return url;
}

// Returns the voiceover's (temporary) URL. Qwen3-TTS is the best value on
// Replicate (~$0.02 per 1,000 characters), and voice design lets each
// character get a voice that matches its description.
export async function generateSpeech(text: string, voiceDescription: string): Promise<string> {
  const output = await predict(
    MODELS.voice,
    { text, mode: 'voice_design', voice_description: voiceDescription, language: 'auto' },
    5 * 60_000,
  );
  const url = Array.isArray(output) ? output[0] : output;
  if (typeof url !== 'string') throw new ReplicateError('The voice model returned no audio.');
  return url;
}

// Returns the generated video's (temporary) URL. References must be public
// URLs, so pass Replicate output links straight from the same run.
export async function generateVideo(
  prompt: string,
  references: { images: string[]; audio: string[] },
  duration: number,
): Promise<string> {
  const output = await predict(
    MODELS.video,
    {
      prompt,
      duration,
      ratio: '9:16',
      ...(references.images.length > 0 && { reference_image_urls: references.images }),
      // MiniMax needs a reference image alongside any reference audio.
      ...(references.images.length > 0 && references.audio.length > 0 && { reference_audio_urls: references.audio }),
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
