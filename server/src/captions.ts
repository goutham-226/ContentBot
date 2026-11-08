// TikTok-style captions burned into a finished video: two or three bold words
// at a time, the word being spoken highlighted. Word timings come from
// transcribing the video's own audio with Whisper on this machine. This ffmpeg
// build has no text filters, so caption frames are drawn as transparent PNGs
// with canvas and laid over the video in one overlay pass.
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import type { SKRSContext2D } from '@napi-rs/canvas';
import { pipeline } from '@huggingface/transformers';
import type { AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

const execFileAsync = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe';

const ASR_MODEL = 'Xenova/whisper-base.en'; // ~80 MB, downloaded once
const SAMPLE_RATE = 16_000;

// Montserrat (SIL Open Font License, assets/fonts/OFL.txt).
GlobalFonts.registerFromPath(join(import.meta.dirname, '..', 'assets', 'fonts', 'Montserrat.ttf'), 'Montserrat');

const MAX_WORDS = 3; // per caption
const MAX_CHARS = 18;
const PAUSE_SECONDS = 0.45; // a longer gap starts a new caption
const POP_SECONDS = 0.08; // each caption pops in slightly larger
const HIGHLIGHT = '#FFE14D';

export type Word = { text: string; start: number; end: number };

let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
function recognizer() {
  asr ??= (pipeline('automatic-speech-recognition', ASR_MODEL, { dtype: 'q8' }) as Promise<AutomaticSpeechRecognitionPipeline>)
    .catch((err: unknown) => {
      asr = null;
      throw err;
    });
  return asr;
}

// The video's audio as 16 kHz mono samples, which is what Whisper takes.
function audioSamples(file: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const ff = spawn(FFMPEG, ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', '-']);
    const parts: Buffer[] = [];
    ff.stdout.on('data', (d: Buffer) => parts.push(d));
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code !== 0) return reject(new Error('Couldn’t read the video’s audio.'));
      const buf = Buffer.concat(parts);
      resolve(new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4)));
    });
  });
}

async function transcribe(file: string): Promise<Word[]> {
  const run = await recognizer();
  const output = await run(await audioSamples(file), {
    return_timestamps: 'word',
    chunk_length_s: 30,
    stride_length_s: 5,
  });
  type Chunk = { text: string; timestamp: [number, number | null] };
  const chunks: Chunk[] = ((Array.isArray(output) ? output[0] : output) as { chunks?: Chunk[] }).chunks ?? [];
  return chunks
    .map((c) => ({ text: c.text.trim(), start: c.timestamp[0], end: c.timestamp[1] ?? c.timestamp[0] + 0.3 }))
    .filter((w) => w.text && Number.isFinite(w.start));
}

// If Whisper hears nothing usable, spread the script's words over each scene.
function scriptTimings(scenes: string[], sceneSeconds: number): Word[] {
  return scenes.flatMap((text, i) => {
    const words = text.split(/\s+/).filter(Boolean);
    const from = i * sceneSeconds + 0.5;
    const step = (sceneSeconds - 1.5) / Math.max(words.length, 1);
    return words.map((w, k) => ({ text: w, start: from + k * step, end: from + (k + 1) * step }));
  });
}

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

// How alike two words are, 0–1 (1 - edit distance / longer length).
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(row[j] + 1, row[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = row[j];
      row[j] = next;
    }
  }
  return 1 - row[b.length] / Math.max(a.length, b.length, 1);
}

const MAX_MERGE = 3; // heard words that can make up one script word ("Persi val" → "Percival")
// How alike heard and written words must be to use the script's spelling.
const MATCH = 0.5;
const MERGE_MATCH = 0.75; // stricter when several heard words become one

// Lines Whisper's words up with the script (an edit-distance alignment) and
// uses the script's spelling where heard words are close to a written one,
// e.g. names. Where the video model said something else, the audio wins.
export function correctWithScript(heard: Word[], script: string[]): Word[] {
  const a = heard.map((w) => norm(w.text));
  const b = script.map(norm);
  // cost[i][j]: aligning the first i heard words with the first j script words.
  // move[i][j]: how many heard words the last step used (0 = skipped a script word).
  const cost = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => i + j));
  const move = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (): number => (i > 0 ? -1 : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      cost[i][j] = cost[i - 1][j] + 1; // a heard word not in the script
      move[i][j] = -1;
      if (cost[i][j - 1] + 1 < cost[i][j]) {
        cost[i][j] = cost[i][j - 1] + 1;
        move[i][j] = 0;
      }
      for (let k = 1; k <= Math.min(MAX_MERGE, i); k++) {
        const sim = similarity(a.slice(i - k, i).join(''), b[j - 1]);
        if (k > 1 && sim < MERGE_MATCH) continue;
        const c = cost[i - k][j - 1] + k - sim * k;
        if (c < cost[i][j] - 1e-9) {
          cost[i][j] = c;
          move[i][j] = k;
        }
      }
    }
  }

  const out: Word[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0) {
    const k = j > 0 ? move[i][j] : -1;
    if (k === 0) {
      j--;
    } else if (k === -1) {
      out.push({ ...heard[i - 1] });
      i--;
    } else {
      const words = heard.slice(i - k, i);
      if (similarity(a.slice(i - k, i).join(''), b[j - 1]) >= (k > 1 ? MERGE_MATCH : MATCH)) {
        out.push({ text: script[j - 1], start: words[0].start, end: words[k - 1].end });
      } else {
        out.push(...words.reverse().map((w) => ({ ...w })));
      }
      i -= k;
      j--;
    }
  }
  return out.reverse();
}

// Groups words into short captions, breaking on pauses and sentence ends.
function group(words: Word[]): Word[][] {
  const captions: Word[][] = [];
  let current: Word[] = [];
  for (const w of words) {
    const last = current.at(-1);
    const chars = current.reduce((n, c) => n + c.text.length + 1, 0) + w.text.length;
    if (last && (current.length >= MAX_WORDS || chars > MAX_CHARS || w.start - last.end > PAUSE_SECONDS || /[.!?]$/.test(last.text))) {
      captions.push(current);
      current = [];
    }
    current.push(w);
  }
  if (current.length) captions.push(current);
  return captions;
}

const clean = (text: string) => text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}!?%']+$/gu, '').toUpperCase();

function drawCaption(ctx: SKRSContext2D, width: number, height: number, words: string[], active: number, scale: number) {
  ctx.clearRect(0, 0, width, height);
  let size = Math.round(width * 0.09 * scale);
  const font = () => `900 ${size}px Montserrat`;
  ctx.font = font();
  const space = () => ctx.measureText(' ').width;
  const total = () => words.reduce((sum, w) => sum + ctx.measureText(w).width, 0) + space() * (words.length - 1);
  while (total() > width * 0.88 && size > 20) {
    size -= 2;
    ctx.font = font();
  }

  let x = (width - total()) / 2;
  const y = height * 0.7;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.2;
  ctx.strokeStyle = '#000';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = size * 0.15;
  ctx.shadowOffsetY = size * 0.06;
  for (const [i, w] of words.entries()) {
    ctx.strokeText(w, x, y);
    ctx.fillStyle = i === active ? HIGHLIGHT : '#fff';
    ctx.fillText(w, x, y);
    x += ctx.measureText(w).width + space();
  }
}

async function videoInfo(file: string): Promise<{ width: number; height: number; duration: number }> {
  const { stdout } = await execFileAsync(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file,
  ]);
  const info = JSON.parse(stdout) as { streams: { width: number; height: number }[]; format: { duration: string } };
  return { width: info.streams[0].width, height: info.streams[0].height, duration: Number(info.format.duration) };
}

// Returns the video with captions burned in. `scenes` is each scene's spoken
// text, used to correct what Whisper heard (or for timing if it heard nothing).
export async function addCaptions(video: Buffer, scenes: string[], sceneSeconds: number): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'twinfluencer-captions-'));
  try {
    const input = join(dir, 'in.mp4');
    await writeFile(input, video);
    const { width, height, duration } = await videoInfo(input);

    const heard = await transcribe(input);
    const words = heard.length < 3
      ? scriptTimings(scenes, sceneSeconds)
      : correctWithScript(heard, scenes.join(' ').split(/\s+/).filter(Boolean));
    const captions = group(words.map((w) => ({ ...w, text: clean(w.text) })).filter((w) => w.text));
    if (captions.length === 0) throw new Error('There were no words to caption.');

    // One frame per moment: blank, a caption popping in, or a word lit up.
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const frames: { file: string; seconds: number }[] = [];
    let n = 0;
    const frame = async (seconds: number, draw: () => void) => {
      if (seconds < 0.01) return;
      draw();
      const file = `f${String(n++).padStart(5, '0')}.png`;
      await writeFile(join(dir, file), await canvas.encode('png'));
      frames.push({ file, seconds });
    };

    let t = 0;
    for (const [c, caption] of captions.entries()) {
      const start = Math.max(caption[0].start, t);
      // Stay up until the next caption if the gap is short, so text doesn't flicker.
      const nextStart = captions[c + 1]?.[0].start ?? duration;
      const end = Math.min(nextStart - caption.at(-1)!.end < 0.6 ? nextStart : caption.at(-1)!.end + 0.25, duration);
      const texts = caption.map((w) => w.text);
      await frame(start - t, () => ctx.clearRect(0, 0, width, height));
      let at = start;
      for (let i = 0; i < caption.length; i++) {
        const until = i < caption.length - 1 ? Math.max(caption[i + 1].start, at) : end;
        if (i === 0) {
          const pop = Math.min(POP_SECONDS, until - at);
          await frame(pop, () => drawCaption(ctx, width, height, texts, i, 1.12));
          at += pop;
        }
        await frame(until - at, () => drawCaption(ctx, width, height, texts, i, 1));
        at = Math.max(at, until);
      }
      t = Math.max(at, end);
    }
    await frame(Math.max(duration - t, 0.05), () => ctx.clearRect(0, 0, width, height));

    // The concat demuxer turns the frames into one overlay stream.
    const list = ['ffconcat version 1.0', ...frames.flatMap((f) => [`file '${f.file}'`, `duration ${f.seconds.toFixed(3)}`]),
      `file '${frames.at(-1)!.file}'`].join('\n');
    await writeFile(join(dir, 'captions.txt'), list);
    const out = join(dir, 'out.mp4');
    await execFileAsync(FFMPEG, [
      '-y', '-v', 'error', '-i', input, '-f', 'concat', '-safe', '0', '-i', join(dir, 'captions.txt'),
      '-filter_complex', '[1:v]format=rgba[cap];[0:v][cap]overlay=0:0:eof_action=pass:shortest=0[v]',
      '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'copy', '-movflags', '+faststart', out,
    ], { maxBuffer: 16 * 1024 * 1024 });
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
