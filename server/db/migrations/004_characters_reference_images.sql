-- Each bot gets a character the user approves (or edits) before chatting.
ALTER TABLE bots
  ADD COLUMN character TEXT NOT NULL DEFAULT '' CHECK (char_length(character) <= 2000),
  ADD COLUMN character_approved BOOLEAN NOT NULL DEFAULT false;

-- Reference images found online (when the user skipped uploading) keep their credit.
-- All three are NULL for images the user uploaded.
ALTER TABLE bot_images
  ADD COLUMN source_url TEXT,
  ADD COLUMN creator TEXT,
  ADD COLUMN license TEXT;
