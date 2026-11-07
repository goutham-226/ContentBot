-- Applied by server/src/migrate.ts on startup.
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Case-insensitive and unique. No '@', so a username can never look like an email.
  username      CITEXT NOT NULL UNIQUE CHECK (username ~ '^[A-Za-z0-9._]{3,30}$'),
  email         CITEXT NOT NULL UNIQUE,
  password_hash TEXT   NOT NULL,         -- scrypt$N$r$p$salt$hash, never plaintext
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
