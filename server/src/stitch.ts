// Joins video clips with transitions using ffmpeg and measures media with ffprobe
// (installed on the machine; FFMPEG_PATH and FFPROBE_PATH override where).
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe';

// Length of an audio or video file in seconds.
export async function mediaSeconds(data: Buffer): Promise<number> {
  const dir = await mkdtemp(join(tmpdir(), 'twinfluencer-probe-'));
  try {
    const file = join(dir, 'media');
    await writeFile(file, data);
    const { stdout } = await run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
    const seconds = Number.parseFloat(stdout);
    if (!Number.isFinite(seconds)) throw new Error('Couldn’t measure the clip’s length.');
    return seconds;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Short-form style cuts between clips: a white flash, a zoom punch, a whip.
const TRANSITIONS = ['fadewhite', 'zoomin', 'smoothleft'];
const TRANSITION_SECONDS = 0.3;

async function probe(file: string): Promise<{ width: number; height: number; duration: number }> {
  const { stdout } = await run(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file,
  ]);
  const info = JSON.parse(stdout) as { streams: { width: number; height: number }[]; format: { duration: string } };
  return { width: info.streams[0].width, height: info.streams[0].height, duration: Number(info.format.duration) };
}

// Joins clips with quick transitions (video crossfaded with xfade, audio with
// acrossfade). Every clip is brought to the first one's size and frame rate,
// since a backup model's clip may differ.
async function joinWithTransitions(dir: string, names: string[]): Promise<string> {
  const files = names.map((n) => join(dir, n));
  const infos = await Promise.all(files.map(probe));
  const { width, height } = infos[0];
  const T = TRANSITION_SECONDS;

  const filters: string[] = infos.map((_, i) =>
    `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=24,format=yuv420p,setsar=1,settb=AVTB[v${i}];`
    + `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,asettb=AVTB[a${i}]`);
  let video = 'v0';
  let audio = 'a0';
  let offset = 0;
  for (let i = 1; i < files.length; i++) {
    offset += infos[i - 1].duration - T;
    const transition = TRANSITIONS[(i - 1) % TRANSITIONS.length];
    filters.push(`[${video}][v${i}]xfade=transition=${transition}:duration=${T}:offset=${offset.toFixed(3)}[vx${i}]`);
    filters.push(`[${audio}][a${i}]acrossfade=d=${T}[ax${i}]`);
    video = `vx${i}`;
    audio = `ax${i}`;
  }

  const out = join(dir, 'transitions.mp4');
  await run(FFMPEG, [
    '-y', '-v', 'error', ...files.flatMap((f) => ['-i', f]),
    '-filter_complex', filters.join(';'), '-map', `[${video}]`, '-map', `[${audio}]`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out,
  ], { maxBuffer: 16 * 1024 * 1024 });
  return out;
}

export async function stitchClips(clips: Buffer[]): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'twinfluencer-stitch-'));
  try {
    const names = await Promise.all(clips.map(async (clip, i) => {
      const name = `clip-${i}.mp4`;
      await writeFile(join(dir, name), clip);
      return name;
    }));

    try {
      return await readFile(await joinWithTransitions(dir, names));
    } catch (err) {
      console.warn('Transitions failed, joining the clips plainly:', err instanceof Error ? err.message : err);
    }

    await writeFile(join(dir, 'list.txt'), names.map((n) => `file '${n}'`).join('\n'));
    const out = join(dir, 'out.mp4');
    const input = ['-y', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt')];
    try {
      // Same model, same settings: the streams usually match, so just copy them.
      await run(FFMPEG, [...input, '-c', 'copy', '-movflags', '+faststart', out]);
    } catch {
      // Otherwise re-encode to a common format.
      await run(FFMPEG, [
        ...input, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out,
      ], { maxBuffer: 16 * 1024 * 1024 });
    }
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
