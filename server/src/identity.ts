// Queues the "character" runs that draw a bot's identity pack: character
// portraits and sheets, plus the channel profile picture and banner.
import type { Pool, PoolClient } from 'pg';
import { pool } from './db.ts';

type Db = Pool | PoolClient;

export const CHANNEL_ASSETS = ['channel_avatar', 'channel_banner'];
const HEAL_AFTER = '10 minutes'; // between automatic retries for missing channel images

// Queues a character run: `targets` redraws exactly those assets, null draws
// whatever is missing. Skipped if the same run is already waiting.
export async function queueCharacterRun(db: Db, botId: string, targets: string[] | null) {
  await db.query(
    `INSERT INTO runs (bot_id, kind, targets)
     SELECT $1, 'character', $2::text[]
      WHERE NOT EXISTS (
        SELECT 1 FROM runs WHERE bot_id = $1 AND kind = 'character' AND status = 'queued'
           AND targets IS NOT DISTINCT FROM $2::text[])`,
    [botId, targets],
  );
}

// Stops identity drawing that's no longer wanted (e.g. from an outdated draft).
export async function cancelCharacterRuns(db: Db, botId: string) {
  await db.query(
    `UPDATE runs SET status = 'canceled', finished_at = now()
      WHERE bot_id = $1 AND kind = 'character' AND status IN ('queued', 'running')`,
    [botId],
  );
}

// If the bot still has no profile picture or banner (say a drawing failed),
// tries again, at most every HEAL_AFTER.
export async function healChannelImages(botId: string) {
  await pool.query(
    `INSERT INTO runs (bot_id, kind, targets)
     SELECT $1, 'character', NULL
      WHERE (SELECT count(DISTINCT asset) FROM bot_images WHERE bot_id = $1 AND asset = ANY($2::text[])) < 2
        AND NOT EXISTS (
          SELECT 1 FROM runs WHERE bot_id = $1 AND kind = 'character'
             AND (status IN ('queued', 'running') OR created_at > now() - interval '${HEAL_AFTER}'))`,
    [botId, CHANNEL_ASSETS],
  );
}
