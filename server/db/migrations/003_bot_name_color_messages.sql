-- Bots get a user-chosen name and robot colour, and a chat thread.

-- Older bots were auto-named from their niches, which could run past 40 characters.
UPDATE bots SET name = rtrim(left(name, 40)) WHERE char_length(name) > 40;

ALTER TABLE bots
  ADD COLUMN color TEXT NOT NULL DEFAULT 'blue',
  ADD CONSTRAINT bots_name_length CHECK (char_length(name) BETWEEN 1 AND 40);

CREATE TABLE bot_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id      UUID NOT NULL REFERENCES bots (id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'bot')),
  body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX bot_messages_bot_id_created_at_idx ON bot_messages (bot_id, created_at);
