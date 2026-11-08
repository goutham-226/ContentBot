-- Credit packs: Basic doesn't include premium (Seedance) videos; Plus, Pro and
-- Studio unlock them for good. Existing accounts keep premium.
ALTER TABLE users ADD COLUMN premium_access BOOLEAN NOT NULL DEFAULT false;
UPDATE users SET premium_access = true;
