-- Each character speaks with one fixed Qwen3-TTS preset speaker, so the voice
-- is the same in every scene and every video. Keep the list in sync with
-- VOICES in src/catalog.ts.
ALTER TABLE bots
  ADD COLUMN voice  TEXT NOT NULL DEFAULT 'Ryan',
  ADD COLUMN voice2 TEXT NOT NULL DEFAULT 'Aiden';
ALTER TABLE bots ADD CONSTRAINT bots_voice_check CHECK (
  voice  IN ('Ryan', 'Aiden', 'Serena', 'Vivian', 'Sohee', 'Ono_anna', 'Uncle_fu', 'Dylan', 'Eric') AND
  voice2 IN ('Ryan', 'Aiden', 'Serena', 'Vivian', 'Sohee', 'Ono_anna', 'Uncle_fu', 'Dylan', 'Eric')
);

-- A short sample of each voice, recorded once on first listen and kept.
CREATE TABLE voice_previews (
  speaker       TEXT PRIMARY KEY,
  content_type  TEXT NOT NULL,
  data          BYTEA NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
