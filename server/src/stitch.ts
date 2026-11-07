// Joins video clips end to end with ffmpeg (installed on the machine;
// FFMPEG_PATH overrides where to find it).
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';

export async function stitchClips(clips: Buffer[]): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'twinfluencer-stitch-'));
  try {
    const names = await Promise.all(clips.map(async (clip, i) => {
      const name = `clip-${i}.mp4`;
      await writeFile(join(dir, name), clip);
      return name;
    }));
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
