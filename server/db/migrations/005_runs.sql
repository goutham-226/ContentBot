-- Background work a bot does for an idea. Runs are picked up by
-- server/src/worker.ts, so they keep going after the user leaves.
--   character:  draws the bot's permanent character portrait (when it has no uploads)
--   research:   web articles + book summaries -> findings, then waits for approval
--   production: (after approval) script -> storyboard images + voiceover -> video
--
-- Research, scripts and storyboard images are temporary: once a run has gone a
-- week without being viewed, the worker prunes it (archived_at). Videos,
-- voiceovers and the bot's character are kept.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id         UUID NOT NULL REFERENCES bots (id) ON DELETE CASCADE,
  message_id     UUID REFERENCES bot_messages (id) ON DELETE SET NULL,
  parent_run_id  UUID REFERENCES runs (id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('character', 'research', 'production')),
  idea           TEXT NOT NULL DEFAULT '',
  feedback       TEXT NOT NULL DEFAULT '', -- the user's notes for a re-research or approval
  surprise       BOOLEAN NOT NULL DEFAULT false,
  status         TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'awaiting_approval', 'done', 'failed')),
  error          TEXT,
  result         JSONB,
  attempts       SMALLINT NOT NULL DEFAULT 0,
  heartbeat_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at     TIMESTAMPTZ,
  finished_at    TIMESTAMPTZ,
  last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at    TIMESTAMPTZ
);

CREATE INDEX runs_status_created_at_idx ON runs (status, created_at);
CREATE INDEX runs_bot_id_created_at_idx ON runs (bot_id, created_at);
CREATE INDEX runs_cold_idx ON runs (last_viewed_at) WHERE archived_at IS NULL;

-- The AI-drawn character portrait is kept with the bot's own images, permanently.
ALTER TABLE bot_images ADD COLUMN ai_generated BOOLEAN NOT NULL DEFAULT false;

-- The "thinking" trail shown while a run works.
CREATE TABLE run_steps (
  id          BIGSERIAL PRIMARY KEY,
  run_id      UUID NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('think', 'search', 'read', 'book', 'write', 'image', 'audio', 'video', 'error')),
  title       TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX run_steps_run_id_idx ON run_steps (run_id, id);

-- Generated images, voiceovers and videos. Replicate's links expire, so the bytes live here.
CREATE TABLE run_media (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('image', 'audio', 'video')),
  label         TEXT NOT NULL DEFAULT '', -- e.g. "Character" or "Opening scene"
  content_type  TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  data          BYTEA NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX run_media_run_id_idx ON run_media (run_id);

-- Temporary knowledge base: chunks of articles and book summaries from a
-- research run, embedded so the script writer can pull the most relevant
-- passages. Deleted once the script is written, or when they expire.
CREATE TABLE knowledge_chunks (
  id          BIGSERIAL PRIMARY KEY,
  run_id      UUID NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  source      TEXT NOT NULL, -- e.g. "Book: Meditations — Marcus Aurelius"
  url         TEXT,
  content     TEXT NOT NULL,
  embedding   vector(768) NOT NULL, -- replicate/all-mpnet-base-v2
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days'
);

CREATE INDEX knowledge_chunks_run_id_idx ON knowledge_chunks (run_id);
CREATE INDEX knowledge_chunks_expires_at_idx ON knowledge_chunks (expires_at);
