// A bot's chat thread: the user's ideas and the runs they start. Research
// waits for approval; "approve" starts production, "re-research" starts over
// with the user's notes.
import { Router } from 'express';
import type { Response } from 'express';
import type { PoolClient } from 'pg';
import { pool } from './db.ts';
import { clearKnowledge } from './knowledge.ts';
import { healChannelImages } from './identity.ts';
import { MESSAGE_MAX } from './catalog.ts';
import { dollars, PRICES, PRODUCTION_PRICE, reserve, settleRun } from './credits.ts';
import { QUOTA_MESSAGE, useDailyQuota } from './quota.ts';
import { currentUser, requireAuth } from './session.ts';

export const chatRouter = Router();
chatRouter.use(requireAuth);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTES_MAX = 2000;
const MAX_ACTIVE_RUNS = 2; // research and production runs in progress at once, per user

type MessageRow = { id: string; role: 'user' | 'bot'; body: string; created_at: Date };

type RunRow = {
  id: string;
  message_id: string | null;
  parent_run_id: string | null;
  kind: 'character' | 'research' | 'production';
  idea: string;
  feedback: string;
  surprise: boolean;
  status: string;
  error: string | null;
  result: unknown;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  archived_at: Date | null;
  charged_cents: number;
  steps: { id: string; kind: string; title: string; detail: string; created_at: string }[];
  media: { id: string; kind: string; label: string }[];
};

const toMessageDto = (row: MessageRow) => ({
  id: row.id,
  role: row.role,
  body: row.body,
  createdAt: row.created_at.toISOString(),
});

function toRunDto(botId: string, row: RunRow) {
  return {
    id: row.id,
    messageId: row.message_id,
    parentRunId: row.parent_run_id,
    kind: row.kind,
    idea: row.idea,
    feedback: row.feedback,
    status: row.status,
    error: row.error,
    result: row.result,
    createdAt: row.created_at.toISOString(),
    startedAt: row.started_at?.toISOString() ?? null,
    finishedAt: row.finished_at?.toISOString() ?? null,
    archived: row.archived_at !== null,
    chargedCents: row.charged_cents,
    steps: row.steps.map((s) => ({ id: s.id, kind: s.kind, title: s.title, detail: s.detail, createdAt: s.created_at })),
    media: row.media.map((m) => ({ id: m.id, kind: m.kind, label: m.label, url: `/api/bots/${botId}/media/${m.id}` })),
  };
}

const SELECT_RUNS = `
  SELECT r.id, r.message_id, r.parent_run_id, r.kind, r.idea, r.feedback, r.surprise, r.status, r.error,
         r.result, r.created_at, r.started_at, r.finished_at, r.archived_at,
         -- What finished parts cost: the ledger, less any hold not used yet.
         (COALESCE((SELECT -SUM(l.amount_cents) FROM credit_ledger l WHERE l.run_id = r.id), 0)
           - CASE WHEN r.settled_at IS NULL THEN r.hold_cents - r.spent_cents ELSE 0 END)::int AS charged_cents,
         COALESCE((SELECT json_agg(json_build_object(
                     'id', s.id, 'kind', s.kind, 'title', s.title, 'detail', s.detail, 'created_at', s.created_at
                   ) ORDER BY s.id) FROM run_steps s WHERE s.run_id = r.id), '[]') AS steps,
         COALESCE((SELECT json_agg(json_build_object('id', m.id, 'kind', m.kind, 'label', m.label)
                   ORDER BY m.created_at) FROM run_media m WHERE m.run_id = r.id), '[]') AS media
    FROM runs r`;

async function ownsBot(botId: string, res: Response): Promise<boolean> {
  if (UUID_RE.test(botId)) {
    const { rowCount } = await pool.query('SELECT 1 FROM bots WHERE id = $1 AND user_id = $2', [
      botId, currentUser(res).id,
    ]);
    if (rowCount === 1) return true;
  }
  res.status(404).json({ error: 'Bot not found.' });
  return false;
}

async function getRun(botId: string, runId: string) {
  const { rows } = await pool.query<RunRow>(`${SELECT_RUNS} WHERE r.id = $1 AND r.bot_id = $2`, [runId, botId]);
  return rows[0] ? toRunDto(botId, rows[0]) : null;
}

const notesFrom = (body: unknown) =>
  body && typeof body === 'object' && 'notes' in body && typeof body.notes === 'string' ? body.notes.trim() : '';

// GET /api/bots/:botId/thread: messages and runs, oldest first. Viewing a
// thread keeps its runs warm, so they aren't pruned.
chatRouter.get('/:botId/thread', async (req, res) => {
  const { botId } = req.params;
  if (!(await ownsBot(botId, res))) return;
  await healChannelImages(botId);
  await pool.query(
    `UPDATE runs SET last_viewed_at = now()
      WHERE bot_id = $1 AND archived_at IS NULL AND last_viewed_at < now() - interval '1 hour'`,
    [botId],
  );
  const [messages, runs] = await Promise.all([
    pool.query<MessageRow>(
      'SELECT id, role, body, created_at FROM bot_messages WHERE bot_id = $1 ORDER BY created_at, id',
      [botId],
    ),
    pool.query<RunRow>(`${SELECT_RUNS} WHERE r.bot_id = $1 ORDER BY r.created_at`, [botId]),
  ]);
  res.json({ messages: messages.rows.map(toMessageDto), runs: runs.rows.map((r) => toRunDto(botId, r)) });
});

type RunFields = {
  kind: 'research' | 'production'; idea: string; surprise: boolean; feedback: string; parentRunId: string | null;
};

// A run that can't be started, answered with this status and message.
class RunRefused extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

// Saves the user's message and queues a run, in one transaction. The bot's row
// is locked, so two requests can't both start a run on it; the user's row is
// locked too, so runs started on several bots at once can't overspend: the
// run's full price is reserved here, and the unused part refunded when it ends.
// `prepare` runs inside the transaction (e.g. taking the research being
// approved), so a refused start leaves everything as it was. Answers refusals
// itself and returns null.
async function startRun(
  res: Response,
  botId: string,
  price: number,
  what: string,
  prepare: (client: PoolClient) => Promise<{ body: string; run: RunFields }>,
) {
  const userId = currentUser(res).id;
  const client = await pool.connect();
  let started: { message: MessageRow; runId: string };
  try {
    await client.query('BEGIN');
    await client.query('SELECT 1 FROM bots WHERE id = $1 FOR UPDATE', [botId]);
    const { rowCount: busy } = await client.query(
      `SELECT 1 FROM runs WHERE bot_id = $1 AND kind <> 'character' AND status IN ('queued', 'running')`,
      [botId],
    );
    if (busy) throw new RunRefused(409, 'Your bot is still working on the last idea.');

    const { rows: user } = await client.query<{ credits_cents: number }>(
      'SELECT credits_cents FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );
    const { rows: active } = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM runs r JOIN bots b ON b.id = r.bot_id
        WHERE b.user_id = $1 AND r.kind <> 'character' AND r.status IN ('queued', 'running')`,
      [userId],
    );
    if (active[0].count >= MAX_ACTIVE_RUNS) {
      throw new RunRefused(429, `You can have ${MAX_ACTIVE_RUNS} ideas in progress at once. Try again when one finishes.`);
    }
    const have = user[0]?.credits_cents ?? 0;
    if (have < price) {
      throw new RunRefused(402, `${what} needs ${dollars(price)} in credits, and your balance is ${dollars(have)}.`);
    }

    const { body, run } = await prepare(client);
    const msg = await client.query<MessageRow>(
      `INSERT INTO bot_messages (bot_id, role, body) VALUES ($1, 'user', $2) RETURNING id, role, body, created_at`,
      [botId, body],
    );
    const created = await client.query<{ id: string }>(
      `INSERT INTO runs (bot_id, message_id, parent_run_id, kind, idea, surprise, feedback)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [botId, msg.rows[0].id, run.parentRunId, run.kind, run.idea, run.surprise, run.feedback],
    );
    await reserve(client, userId, created.rows[0].id, price, what);
    await client.query('COMMIT');
    started = { message: msg.rows[0], runId: created.rows[0].id };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof RunRefused) {
      res.status(err.status).json({ error: err.message });
      return null;
    }
    throw err;
  } finally {
    client.release();
  }
  return { message: toMessageDto(started.message), run: await getRun(botId, started.runId) };
}

// POST /api/bots/:botId/messages: { body } with a video idea, or { surprise: true }.
chatRouter.post('/:botId/messages', async (req, res) => {
  const { botId } = req.params;
  const surprise = req.body?.surprise === true;
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!surprise && !body) {
    res.status(400).json({ error: 'Write an idea first, or pick “Surprise me”.' });
    return;
  }
  if (body.length > MESSAGE_MAX) {
    res.status(400).json({ error: `Messages can be at most ${MESSAGE_MAX} characters.` });
    return;
  }
  if (!(await ownsBot(botId, res))) return;
  const { rows } = await pool.query<{ character_approved: boolean }>(
    'SELECT character_approved FROM bots WHERE id = $1',
    [botId],
  );
  if (!rows[0]?.character_approved) {
    res.status(409).json({ error: 'Approve your character first.' });
    return;
  }
  const started = await startRun(res, botId, PRICES.research, 'Researching an idea', async () => ({
    body: surprise ? 'Surprise me!' : body,
    run: { kind: 'research', idea: surprise ? '' : body, surprise, feedback: '', parentRunId: null },
  }));
  if (started) res.status(201).json(started);
});

// Shared by approve and re-research: the run must be research awaiting
// approval. Runs inside startRun's transaction.
async function takeResearch(client: PoolClient, botId: string, runId: string) {
  const { rows } = UUID_RE.test(runId)
    ? await client.query<{ idea: string; surprise: boolean }>(
        `UPDATE runs SET status = 'done'
          WHERE id = $1 AND bot_id = $2 AND kind = 'research' AND status = 'awaiting_approval' AND archived_at IS NULL
          RETURNING idea, surprise`,
        [runId, botId],
      )
    : { rows: [] };
  if (!rows[0]) throw new RunRefused(409, 'This research isn’t waiting for approval any more.');
  return rows[0];
}

// POST /api/bots/:botId/runs/:runId/approve: { notes? } — write the script and
// make the video. (Premium Seedance videos are switched off for now; the
// worker still knows how to make them, but nothing queues them.)
chatRouter.post('/:botId/runs/:runId/approve', async (req, res) => {
  const { botId, runId } = req.params;
  const notes = notesFrom(req.body).slice(0, NOTES_MAX);
  if (!(await ownsBot(botId, res))) return;
  const started = await startRun(res, botId, PRODUCTION_PRICE, 'Making this video', async (client) => {
    const research = await takeResearch(client, botId, runId);
    return {
      body: notes ? `Approved. ${notes}` : 'Approved. Go ahead!',
      run: {
        kind: 'production', idea: research.idea, surprise: research.surprise, feedback: notes, parentRunId: runId,
      },
    };
  });
  if (started) res.status(201).json(started);
});

// POST /api/bots/:botId/runs/:runId/reresearch: { notes? } — research again, taking the notes into account.
chatRouter.post('/:botId/runs/:runId/reresearch', async (req, res) => {
  const { botId, runId } = req.params;
  const notes = notesFrom(req.body).slice(0, NOTES_MAX);
  if (!(await ownsBot(botId, res))) return;
  const started = await startRun(res, botId, PRICES.research, 'Researching again', async (client) => {
    const research = await takeResearch(client, botId, runId);
    return {
      body: notes ? `Research this again: ${notes}` : 'Research this again.',
      run: { kind: 'research', idea: research.idea, surprise: research.surprise, feedback: notes, parentRunId: runId },
    };
  });
  if (!started) return;
  await clearKnowledge(runId);
  res.status(201).json(started);
});

// POST /api/bots/:botId/runs/:runId/cancel — stops a run mid-generation. The
// worker notices within seconds, cancels its Replicate jobs, and the user keeps
// (and is charged for) only the parts that finished.
chatRouter.post('/:botId/runs/:runId/cancel', async (req, res) => {
  const { botId, runId } = req.params;
  if (!(await ownsBot(botId, res))) return;
  const { rows } = UUID_RE.test(runId)
    ? await pool.query<{ finished_at: Date | null }>(
        `UPDATE runs SET status = 'canceled',
                         finished_at = CASE WHEN status = 'queued' THEN now() ELSE finished_at END
          WHERE id = $1 AND bot_id = $2 AND status IN ('queued', 'running')
          RETURNING finished_at`,
        [runId, botId],
      )
    : { rows: [] };
  if (!rows[0]) {
    res.status(409).json({ error: 'This isn’t running any more.' });
    return;
  }
  // Never started (finished at once), so no worker will settle it: refund its hold now.
  if (rows[0].finished_at) await settleRun(runId);
  res.json({ run: await getRun(botId, runId) });
});

const ASSETS = ['character', 'character_sheet', 'channel_avatar', 'channel_banner'];
const ASSET_NAMES: Record<string, string> = {
  character: 'character', character_sheet: 'character sheet', channel_avatar: 'profile picture', channel_banner: 'banner',
};

// POST /api/bots/:botId/identity/regenerate: { targets: [...assets], notes } —
// redraws those parts of the identity pack with the user's changes.
chatRouter.post('/:botId/identity/regenerate', async (req, res) => {
  const { botId } = req.params;
  const targets: string[] = Array.isArray(req.body?.targets)
    ? [...new Set<string>(req.body.targets.filter((t: unknown): t is string => typeof t === 'string' && ASSETS.includes(t)))]
    : [];
  const notes = notesFrom(req.body).slice(0, NOTES_MAX);
  if (targets.length === 0) {
    res.status(400).json({ error: 'Pick at least one image to regenerate.' });
    return;
  }
  if (!(await ownsBot(botId, res))) return;
  const { rowCount: drawing } = await pool.query(
    `SELECT 1 FROM runs WHERE bot_id = $1 AND kind = 'character' AND status IN ('queued', 'running')`,
    [botId],
  );
  if (drawing) {
    res.status(409).json({ error: 'Your bot is still drawing. Try again when it’s done.' });
    return;
  }
  if (!(await useDailyQuota(currentUser(res).id, 'regenerate'))) {
    res.status(429).json({ error: QUOTA_MESSAGE.regenerate });
    return;
  }

  const ordered = ASSETS.filter((a) => targets.includes(a));
  const body = `Regenerate the ${ordered.map((a) => ASSET_NAMES[a]).join(', ')}${notes ? `: ${notes}` : '.'}`;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const msg = await client.query<MessageRow>(
      `INSERT INTO bot_messages (bot_id, role, body) VALUES ($1, 'user', $2) RETURNING id, role, body, created_at`,
      [botId, body],
    );
    const created = await client.query<{ id: string }>(
      `INSERT INTO runs (bot_id, message_id, kind, feedback, targets) VALUES ($1, $2, 'character', $3, $4) RETURNING id`,
      [botId, msg.rows[0].id, notes, ordered],
    );
    await client.query('COMMIT');
    res.status(201).json({ message: toMessageDto(msg.rows[0]), run: await getRun(botId, created.rows[0].id) });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /api/bots/:botId/media/:mediaId: generated images, audio and video,
// with Range support so browsers can seek in videos.
chatRouter.get('/:botId/media/:mediaId', async (req, res) => {
  const { botId, mediaId } = req.params;
  if (!UUID_RE.test(botId) || !UUID_RE.test(mediaId)) {
    res.status(404).end();
    return;
  }
  const { rows } = await pool.query<{ content_type: string; data: Buffer }>(
    `SELECT m.content_type, m.data
       FROM run_media m JOIN runs r ON r.id = m.run_id JOIN bots b ON b.id = r.bot_id
      WHERE m.id = $1 AND b.id = $2 AND b.user_id = $3`,
    [mediaId, botId, currentUser(res).id],
  );
  const media = rows[0];
  if (!media) {
    res.status(404).end();
    return;
  }

  res.set({
    'Content-Type': media.content_type,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'", // never runs as a page, even if opened directly
    'Cache-Control': 'private, max-age=3600',
    'Accept-Ranges': 'bytes',
  });
  const size = media.data.length;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      res.status(416).set('Content-Range', `bytes */${size}`).end();
      return;
    }
    res.status(206).set('Content-Range', `bytes ${start}-${end}/${size}`);
    res.send(media.data.subarray(start, end + 1));
    return;
  }
  res.send(media.data);
});
