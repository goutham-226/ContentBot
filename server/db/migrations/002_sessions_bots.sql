-- Login sessions. Only a SHA-256 of the cookie token is stored, so a
-- database leak doesn't hand out working sessions.
CREATE TABLE sessions (
  token_hash  BYTEA PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);

CREATE TABLE bots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  niches                TEXT[] NOT NULL CHECK (cardinality(niches) BETWEEN 1 AND 3),
  identity_preset       TEXT,              -- preset id; NULL means the user chose their own
  identity_name         TEXT NOT NULL,
  identity_description  TEXT NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bots_user_id_created_at_idx ON bots (user_id, created_at DESC);

-- Supporting images for a bot's channel identity, stored in the database.
CREATE TABLE bot_images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id        UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  position      SMALLINT NOT NULL,
  filename      TEXT NOT NULL,
  content_type  TEXT NOT NULL,             -- detected from the file bytes, not trusted from the client
  size_bytes    INTEGER NOT NULL,
  data          BYTEA NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bot_images_bot_id_idx ON bot_images (bot_id, position);
