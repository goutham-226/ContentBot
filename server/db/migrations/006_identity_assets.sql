-- The bot's permanent identity pack, drawn once when its character is
-- approved. NULL for the user's uploads and web references.
ALTER TABLE bot_images
  ADD COLUMN asset TEXT CHECK (asset IN ('character', 'character_sheet', 'channel_avatar', 'channel_banner'));
