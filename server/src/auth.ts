import { Router } from 'express';
import { pool } from './db.ts';
import type { UserRow } from './db.ts';
import { hashPassword, verifyPassword } from './password.ts';
import { endSession, getSessionUser, startSession } from './session.ts';

export const authRouter = Router();

const MIN_PASSWORD = 6;
const USERNAME_RE = /^[A-Za-z0-9._]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVALID_LOGIN = 'Sorry, your username or password was incorrect.';
const USERNAME_TAKEN = 'Username taken';
const EMAIL_TAKEN = 'Email taken';

type SignupField = 'username' | 'email' | 'password';
type FieldErrors = Partial<Record<SignupField, string>>;

// Verified against when the user doesn't exist, so a missing account takes
// as long as a wrong password and response times don't reveal which usernames exist.
const dummyHash = hashPassword('timing-equaliser');

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validateSignup(username: string, email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!USERNAME_RE.test(username)) {
    errors.username = 'Use 3–30 letters, numbers, periods or underscores.';
  }
  if (!EMAIL_RE.test(email)) {
    errors.email = 'Enter a valid email address.';
  }
  if (password.length < MIN_PASSWORD) {
    errors.password = `Use at least ${MIN_PASSWORD} characters.`;
  }
  return errors;
}

async function findTaken(username: string, email: string): Promise<FieldErrors> {
  // CITEXT makes both comparisons case-insensitive.
  const { rows } = await pool.query<{ username_taken: boolean; email_taken: boolean }>(
    `SELECT
       EXISTS (SELECT 1 FROM users WHERE username = $1) AS username_taken,
       EXISTS (SELECT 1 FROM users WHERE email = $2)    AS email_taken`,
    [username, email],
  );
  const errors: FieldErrors = {};
  if (rows[0].username_taken) errors.username = USERNAME_TAKEN;
  if (rows[0].email_taken) errors.email = EMAIL_TAKEN;
  return errors;
}

// GET /api/auth/available?username=foo  or  ?email=foo@bar.com
authRouter.get('/available', async (req, res) => {
  const username = str(req.query.username);
  const email = str(req.query.email);

  if (username) {
    const taken = await findTaken(username, '');
    res.json({ available: !taken.username });
    return;
  }
  if (email) {
    const taken = await findTaken('', email);
    res.json({ available: !taken.email });
    return;
  }
  res.status(400).json({ error: 'Pass a username or email.' });
});

authRouter.post('/signup', async (req, res) => {
  const username = str(req.body?.username);
  const email = str(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  const invalid = validateSignup(username, email, password);
  if (Object.keys(invalid).length > 0) {
    res.status(400).json({ error: 'Please fix the highlighted fields.', fields: invalid });
    return;
  }

  // Report both conflicts at once, rather than one per attempt.
  const taken = await findTaken(username, email);
  if (Object.keys(taken).length > 0) {
    res.status(409).json({ error: 'That account already exists.', fields: taken });
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
    // 23505 = unique_violation: another signup won the race after findTaken.
    if (err instanceof Error && 'code' in err && err.code === '23505') {
      const constraint = 'constraint' in err ? err.constraint : '';
      const fields: FieldErrors =
        constraint === 'users_email_key' ? { email: EMAIL_TAKEN } : { username: USERNAME_TAKEN };
      res.status(409).json({ error: 'That account already exists.', fields });
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

  await startSession(res, user.id);
  res.json({ user: user.username });
});

// GET /api/auth/me: who is logged in, or 401.
authRouter.get('/me', async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Not logged in.' });
    return;
  }
  res.json({ user: { username: user.username, email: user.email } });
});

authRouter.post('/logout', async (req, res) => {
  await endSession(req, res);
  res.status(204).end();
});
