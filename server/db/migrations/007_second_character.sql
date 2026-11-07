-- A bot can have up to two characters (e.g. a duo that banters).
ALTER TABLE bots
  ADD COLUMN character2 TEXT NOT NULL DEFAULT '' CHECK (char_length(character2) <= 2000);

-- Which character a portrait or character sheet belongs to (0 or 1).
ALTER TABLE bot_images
  ADD COLUMN character_index SMALLINT CHECK (character_index IN (0, 1));
