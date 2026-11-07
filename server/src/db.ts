import pg from 'pg';

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env in the repo root.');
}

export const pool = new pg.Pool({ connectionString: DATABASE_URL });

// An idle client losing its connection (e.g. the database restarting) shouldn't crash the API.
pool.on('error', (err) => console.error('Postgres idle client error:', err.message));

export type UserRow = {
  id: string;
  username: string;
  email: string;
  password_hash: string;
};
