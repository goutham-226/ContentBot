-- Runs once, when the Postgres volume is first created.
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username      CITEXT NOT NULL UNIQUE,  -- case-insensitive
  email         CITEXT NOT NULL UNIQUE,
  password_hash TEXT   NOT NULL,         -- scrypt$N$r$p$salt$hash, never plaintext
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
