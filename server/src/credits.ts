// Credits, in cents. Every grant and charge goes in credit_ledger.
import { pool } from './db.ts';

// A one-minute video costs $7, charged as each part finishes. Must sum to 700
// for the standard 4 scenes: 70 + 30 + 4×15 + 4×10 + 4×125.
export const PRICES = {
  research: 70,
  script: 30,
  frame: 15,
  sceneVoice: 10, // per scene; split between characters for duos
  clip: 125,
  premiumClip: 800, // one 30 s Seedance 2.5 clip at 720p (costs us ~$6.94)
};
export const PRODUCTION_PRICE = PRICES.script + 4 * (PRICES.frame + PRICES.sceneVoice + PRICES.clip);
// Premium: 2 × 30 s scenes, $16.80 in all.
export const PREMIUM_PRODUCTION_PRICE = PRICES.script + 2 * (PRICES.frame + PRICES.sceneVoice + PRICES.premiumClip);

export class OutOfCreditsError extends Error {
  constructor() {
    super('You ran out of credits, so the bot stopped here. Add credits to continue.');
  }
}

export const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export async function balance(userId: string): Promise<number> {
  const { rows } = await pool.query<{ credits_cents: number }>('SELECT credits_cents FROM users WHERE id = $1', [userId]);
  return rows[0]?.credits_cents ?? 0;
}

// Charges up to `cents`. If the balance can't cover it all, takes what's left
// and throws OutOfCreditsError so the run stops.
export async function charge(userId: string, runId: string, cents: number, reason: string) {
  if (cents <= 0) return;
  const client = await pool.connect();
  let short = false;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ credits_cents: number }>(
      'SELECT credits_cents FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );
    const available = rows[0]?.credits_cents ?? 0;
    const amount = Math.min(cents, available);
    short = amount < cents;
    if (amount > 0) {
      await client.query('UPDATE users SET credits_cents = credits_cents - $2 WHERE id = $1', [userId, amount]);
      await client.query(
        'INSERT INTO credit_ledger (user_id, run_id, amount_cents, reason) VALUES ($1, $2, $3, $4)',
        [userId, runId, -amount, reason],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  if (short) throw new OutOfCreditsError();
}

export async function grant(userId: string, cents: number, reason: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE users SET credits_cents = credits_cents + $2 WHERE id = $1', [userId, cents]);
    await client.query('INSERT INTO credit_ledger (user_id, amount_cents, reason) VALUES ($1, $2, $3)', [userId, cents, reason]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Gives back everything a run has been charged (used when a run restarts from
// scratch, so redoing its parts isn't charged twice).
export async function refundRun(runId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ user_id: string; charged: number }>(
      `SELECT user_id, -SUM(amount_cents)::int AS charged FROM credit_ledger
        WHERE run_id = $1 GROUP BY user_id HAVING SUM(amount_cents) < 0`,
      [runId],
    );
    for (const { user_id: userId, charged } of rows) {
      await client.query('UPDATE users SET credits_cents = credits_cents + $2 WHERE id = $1', [userId, charged]);
      await client.query(
        'INSERT INTO credit_ledger (user_id, run_id, amount_cents, reason) VALUES ($1, $2, $3, $4)',
        [userId, runId, charged, 'Refund: run restarted'],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
