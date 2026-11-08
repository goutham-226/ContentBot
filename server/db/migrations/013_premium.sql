-- Premium videos: two 30-second scenes rendered with Seedance 2.5, offered
-- only for bots whose characters aren't realistic humans (Seedance rejects
-- real-looking people). premium_eligible is NULL until checked.
ALTER TABLE runs ADD COLUMN premium BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE bots ADD COLUMN premium_eligible BOOLEAN;
