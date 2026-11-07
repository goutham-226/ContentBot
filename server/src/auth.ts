import { Router } from 'express';
import { pool } from './db.ts';
import type { UserRow } from './db.ts';
import { hashPassword, verifyPassword } from './password.ts';

export const authRouter = Router();

const MIN_PASSWORD = 6;
const INVALID_LOGIN = 'Sorry, your username or password was incorrect.';

// Verified against when the user doesn't exist, so a missing account takes
// as long as a wrong password and response times don't reveal which usernames exist.
const dummyHash = hashPassword('timing-equaliser');

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

authRouter.post('/signup', async (req, res) => {
  const username = str(req.body?.username);
  const email = str(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!username || !email || password.length < MIN_PASSWORD) {
    res.status(400).json({ error: `Username, email and a password of at least ${MIN_PASSWORD} characters are required.` });
    return;
  }

  try {
    const passwordHash = await hashPassword(password);
    const { rows } = await pool.query<Pick<UserRow, 'id' | 'username'>>(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username',
      [username, email, passwordHash],
    );
    res.status(201).json({ user: rows[0].username });
  } catch (err) {
    // 23505 = unique_violation
    if (err instanceof Error && 'code' in err && err.code === '23505') {
      res.status(409).json({ error: 'That username or email is already taken.' });
      return;
    }
    throw err;
  }
});

authRouter.post('/login', async (req, res) => {
  const identifier = str(req.body?.identifier);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!identifier || !password) {
    res.status(400).json({ error: INVALID_LOGIN });
    return;
  }

  const { rows } = await pool.query<UserRow>(
    'SELECT id, username, email, password_hash FROM users WHERE username = $1 OR email = $1 LIMIT 1',
    [identifier],
  );
  const user = rows[0];
  const ok = await verifyPassword(password, user?.password_hash ?? (await dummyHash));

  if (!user || !ok) {
    res.status(401).json({ error: INVALID_LOGIN });
    return;
  }

  // TODO: issue a session cookie or token here.
  res.json({ user: user.username });
});
