// Credits, in cents. Every grant and charge goes in credit_ledger.
//
// Research and production runs reserve their full expected price when they're
// queued (a "hold", taken from the balance at once). Parts are charged against
// the hold as they finish, and when the run ends the unused part is refunded.
import type { PoolClient } from 'pg';
import { pool } from './db.ts';

// A one-minute video costs $5.99 (the user's price), charged as each part
// finishes. Must sum to 599: 70 + 29 + 2×250.
// Clips are Kling 4.0 at 720p: $0.157/s with images only, $0.094/s with a
// reference video, billed for the output plus the reference's length. Clip 1
// (30 s, images) ~$4.71; clip 2 (30 s out + 30 s of clip 1 as reference)
// ~$5.64; so a video costs us ~$10.40 and LOSES ~$4.40 at this price.
// Kling speaks the lines itself, so there is no separate voice model.
// Not covered: a run restarted after an interruption redoes its parts at our cost.
export const PRICES = {
  research: 70,
  script: 29,
  clip: 250, // per 30 s scene; a scene the backups render as two halves is charged half each
};
export const PRODUCTION_PRICE = PRICES.script + 2 * PRICES.clip;
// One standard video, research included: $5.99.
export const VIDEO_PRICE = PRICES.research + PRODUCTION_PRICE;

// Credit packs. Each gives enough credits for `videos` standard videos; the
// bigger ones cost less than the credits they give. Basic is the small,
// full-price pack (the most margin).
// Keep in sync with client/src/pages/PricingPage/PricingPage.tsx.
export const PACKS = {
  basic: { name: 'Basic', videos: 2, priceCents: 1198 }, // $5.99 a video
  plus: { name: 'Plus', videos: 5, priceCents: 2849 }, // $5.70, 5% off
  pro: { name: 'Pro', videos: 10, priceCents: 5399 }, // $5.40, 10% off
  studio: { name: 'Studio', videos: 20, priceCents: 10199 }, // $5.10, 15% off
};
export type PackId = keyof typeof PACKS;
export const packCredits = (id: PackId) => PACKS[id].videos * VIDEO_PRICE;

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

// Takes a new run's full expected price from the balance and holds it for the
// run. Call inside the transaction that inserts the run, after locking the
// user's row (SELECT ... FOR UPDATE) and checking the balance covers `cents`.
export async function reserve(client: PoolClient, userId: string, runId: string, cents: number, reason: string) {
  if (cents <= 0) return;
  await client.query('UPDATE users SET credits_cents = credits_cents - $2 WHERE id = $1', [userId, cents]);
  await client.query('UPDATE runs SET hold_cents = $2 WHERE id = $1', [runId, cents]);
  await client.query(
    'INSERT INTO credit_ledger (user_id, run_id, amount_cents, reason) VALUES ($1, $2, $3, $4)',
    [userId, runId, -cents, `Reserved: ${reason}`],
  );
}

// Charges `cents` for a finished part: from the run's hold first, then (for
// runs without a hold, or anything beyond it) from the balance. If the balance
// can't cover the rest, takes what's left and throws OutOfCreditsError so the
// run stops.
export async function charge(userId: string, runId: string, cents: number, reason: string) {
  if (cents <= 0) return;
  const client = await pool.connect();
  let short = false;
  try {
    await client.query('BEGIN');
    const { rows: held } = await client.query<{ held: number }>(
      'SELECT hold_cents - spent_cents AS held FROM runs WHERE id = $1 AND settled_at IS NULL FOR UPDATE',
      [runId],
    );
    const fromHold = Math.min(cents, Math.max(0, held[0]?.held ?? 0));
    if (fromHold > 0) {
      // Already taken from the balance (and in the ledger) when the run was queued.
      await client.query('UPDATE runs SET spent_cents = spent_cents + $2 WHERE id = $1', [runId, fromHold]);
    }
    const rest = cents - fromHold;
    if (rest > 0) {
      const { rows } = await client.query<{ credits_cents: number }>(
        'SELECT credits_cents FROM users WHERE id = $1 FOR UPDATE',
        [userId],
      );
      const available = rows[0]?.credits_cents ?? 0;
      const amount = Math.min(rest, available);
      short = amount < rest;
      if (amount > 0) {
        await client.query('UPDATE users SET credits_cents = credits_cents - $2 WHERE id = $1', [userId, amount]);
        await client.query(
          'INSERT INTO credit_ledger (user_id, run_id, amount_cents, reason) VALUES ($1, $2, $3, $4)',
          [userId, runId, -amount, reason],
        );
      }
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

// Ends a run's hold, refunding whatever its finished parts didn't use. Called
// when the run finishes, fails or is cancelled; a no-op after the first time.
export async function settleRun(runId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ user_id: string; unused: number }>(
      `SELECT b.user_id, r.hold_cents - r.spent_cents AS unused
         FROM runs r JOIN bots b ON b.id = r.bot_id
        WHERE r.id = $1 AND r.settled_at IS NULL AND r.hold_cents > 0
        FOR UPDATE OF r`,
      [runId],
    );
    const run = rows[0];
    if (run) {
      await client.query('UPDATE runs SET settled_at = now() WHERE id = $1', [runId]);
      if (run.unused > 0) {
        await client.query('UPDATE users SET credits_cents = credits_cents + $2 WHERE id = $1', [run.user_id, run.unused]);
        await client.query(
          'INSERT INTO credit_ledger (user_id, run_id, amount_cents, reason) VALUES ($1, $2, $3, $4)',
          [run.user_id, runId, run.unused, 'Refund: unused part of the reservation'],
        );
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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

// Adds a pack's credits.
export async function grantPack(userId: string, id: PackId) {
  const pack = PACKS[id];
  const cents = packCredits(id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE users SET credits_cents = credits_cents + $2 WHERE id = $1',
      [userId, cents],
    );
    await client.query(
      'INSERT INTO credit_ledger (user_id, amount_cents, reason) VALUES ($1, $2, $3)',
      [userId, cents, `${pack.name} pack (${pack.videos} videos)`],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Gives back everything a run has been charged (used when a run restarts from
// scratch, so redoing its parts isn't charged twice). An unsettled hold stays
// in place, with its spent parts returned to it, for the restarted run to use.
export async function refundRun(runId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: held } = await client.query<{ held: number }>(
      `SELECT CASE WHEN settled_at IS NULL THEN hold_cents ELSE 0 END AS held FROM runs WHERE id = $1 FOR UPDATE`,
      [runId],
    );
    const hold = held[0]?.held ?? 0;
    await client.query('UPDATE runs SET spent_cents = 0 WHERE id = $1', [runId]);
    const { rows } = await client.query<{ user_id: string; charged: number }>(
      `SELECT user_id, (-SUM(amount_cents) - $2)::int AS charged FROM credit_ledger
        WHERE run_id = $1 GROUP BY user_id HAVING -SUM(amount_cents) - $2 > 0`,
      [runId, hold],
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
