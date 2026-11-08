// Daily limits on paid model calls that aren't charged as runs, so nobody can
// run up the Replicate bill by repeating them.
import { pool } from './db.ts';

export const DAILY_LIMITS = {
  revise: 30, // rewriting a character with the LLM
  regenerate: 15, // redrawing identity images
  premium_check: 20, // classifying a bot's characters for premium videos
};
export type PaidAction = keyof typeof DAILY_LIMITS;

export const QUOTA_MESSAGE: Record<PaidAction, string> = {
  revise: 'You’ve rewritten characters a lot today. Please try again tomorrow, or edit the text by hand.',
  regenerate: 'You’ve regenerated a lot of images today. Please try again tomorrow.',
  premium_check: 'You’ve checked premium eligibility a lot today. Please try again tomorrow.',
};

export class QuotaError extends Error {
  constructor(readonly action: PaidAction) {
    super(QUOTA_MESSAGE[action]);
  }
}

// Records one use of `action`, or returns false if the user has used up the
// last 24 hours' allowance. The user's row is locked so simultaneous requests
// can't both take the last one.
export async function useDailyQuota(userId: string, action: PaidAction): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const { rows } = await client.query<{ used: number }>(
      `SELECT count(*)::int AS used FROM paid_actions
        WHERE user_id = $1 AND action = $2 AND created_at > now() - interval '1 day'`,
      [userId, action],
    );
    const ok = rows[0].used < DAILY_LIMITS[action];
    if (ok) await client.query('INSERT INTO paid_actions (user_id, action) VALUES ($1, $2)', [userId, action]);
    await client.query('COMMIT');
    return ok;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
