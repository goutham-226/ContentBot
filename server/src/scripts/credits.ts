// Adds credits to an account until real payments exist.
//   npm run credits -- <username> <dollars>
import { pool } from '../db.ts';
import { dollars, grant } from '../credits.ts';

const [username, amount] = process.argv.slice(2);
const cents = Math.round(Number(amount) * 100);
if (!username || !Number.isFinite(cents) || cents <= 0) {
  console.error('Usage: npm run credits -- <username> <dollars>');
  process.exit(1);
}

const { rows } = await pool.query<{ id: string }>('SELECT id FROM users WHERE username = $1', [username]);
if (!rows[0]) {
  console.error(`No user named ${username}.`);
  process.exit(1);
}
await grant(rows[0].id, cents, 'Added from the command line');
const after = await pool.query<{ credits_cents: number }>('SELECT credits_cents FROM users WHERE id = $1', [rows[0].id]);
console.log(`Added ${dollars(cents)} to ${username}. Balance: ${dollars(after.rows[0].credits_cents)}.`);
await pool.end();
