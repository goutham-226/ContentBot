-- A character run started by "Regenerate": which parts of the identity pack to
-- redraw (the user's notes go in runs.feedback). NULL means "draw what's missing".
ALTER TABLE runs
  ADD COLUMN targets TEXT[] CHECK (targets <@ ARRAY['character', 'character_sheet', 'channel_avatar', 'channel_banner']);
