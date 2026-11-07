import { createHash, randomBytes } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import { pool } from './db.ts';

const COOKIE_NAME = 'tf_session';
const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  username: string;
  email: string;
};

function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

function readToken(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE_NAME) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export async function startSession(res: Response, userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  await pool.query('DELETE FROM sessions WHERE expires_at < now()');
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + make_interval(days => $3))`,
    [hashToken(token), userId, SESSION_DAYS],
  );
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, // not readable from page scripts
    sameSite: 'lax', // not sent on cross-site POSTs
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
}

export async function endSession(req: Request, res: Response): Promise<void> {
  const token = readToken(req);
  if (token) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const token = readToken(req);
  if (!token) return null;
  const { rows } = await pool.query<SessionUser>(
    `SELECT u.id, u.username, u.email
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0] ?? null;
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Please log in.' });
    return;
  }
  res.locals.user = user;
  next();
};

// Only valid after requireAuth.
export function currentUser(res: Response): SessionUser {
  return res.locals.user as SessionUser;
}
