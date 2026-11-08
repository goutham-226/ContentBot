// Adds credits to an account until real payments exist.
//   npm run credits -- <username> <basic|plus|pro|studio>   a credit pack
//   npm run credits -- <username> <dollars>                 a plain amount
import { pool } from '../db.ts';
import { dollars, grant, grantPack, packCredits, PACKS } from '../credits.ts';
import type { PackId } from '../credits.ts';

const [username, what] = process.argv.slice(2);
const pack = what && what.toLowerCase() in PACKS ? (what.toLowerCase() as PackId) : null;
const cents = pack ? packCredits(pack) : Math.round(Number(what) * 100);
if (!username || !Number.isFinite(cents) || cents <= 0) {
  console.error(`Usage: npm run credits -- <username> <${Object.keys(PACKS).join('|')}|dollars>`);
  process.exit(1);
}

const { rows } = await pool.query<{ id: string }>('SELECT id FROM users WHERE username = $1', [username]);
if (!rows[0]) {
  console.error(`No user named ${username}.`);
  process.exit(1);
}
if (pack) await grantPack(rows[0].id, pack);
else await grant(rows[0].id, cents, 'Added from the command line');
const after = await pool.query<{ credits_cents: number }>('SELECT credits_cents FROM users WHERE id = $1', [rows[0].id]);
console.log(
  `Added ${dollars(cents)}${pack ? ` (${PACKS[pack].name} pack)` : ''} to ${username}. `
    + `Balance: ${dollars(after.rows[0].credits_cents)}.`,
);
await pool.end();
