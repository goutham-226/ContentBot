import { Router } from 'express';
import { pool } from './db.ts';
import { VOICES } from './catalog.ts';
import { download, generateSpeech, ReplicateError } from './replicate.ts';
import { requireAuth } from './session.ts';

export const voicesRouter = Router();
voicesRouter.use(requireAuth);

const SAMPLE = 'Wait. You’ve been doing this wrong your whole life. Here’s what nobody tells you.';
const pending = new Map<string, Promise<{ content_type: string; data: Buffer }>>();

// GET /api/voices/:speaker/preview: a short sample of a preset voice, recorded
// the first time anyone listens and kept after that.
voicesRouter.get('/:speaker/preview', async (req, res) => {
  const { speaker } = req.params;
  if (!VOICES.has(speaker)) {
    res.status(404).end();
    return;
  }
  const { rows } = await pool.query<{ content_type: string; data: Buffer }>(
    'SELECT content_type, data FROM voice_previews WHERE speaker = $1',
    [speaker],
  );
  let preview = rows[0];
  if (!preview) {
    // One recording per voice, even if several people press play at once.
    let job = pending.get(speaker);
    if (!job) {
      job = (async () => {
        const { data, contentType } = await download(await generateSpeech(SAMPLE, speaker, 'Excited and punchy.'));
        const type = contentType.startsWith('audio/') ? contentType : 'audio/wav';
        await pool.query(
          'INSERT INTO voice_previews (speaker, content_type, data) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [speaker, type, data],
        );
        return { content_type: type, data };
      })().finally(() => pending.delete(speaker));
      pending.set(speaker, job);
    }
    try {
      preview = await job;
    } catch (err) {
      res.status(502).json({ error: err instanceof ReplicateError ? err.message : 'Couldn’t record a sample.' });
      return;
    }
  }
  res.set({ 'Content-Type': preview.content_type, 'Cache-Control': 'private, max-age=86400' });
  res.send(preview.data);
});
