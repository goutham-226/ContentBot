-- Credit holds: when a research or production run is queued, its full expected
-- price is taken from the balance at once (one ledger row, with the run_id), so
-- a user can't start more runs than they can pay for. Parts that finish use up
-- the hold (spent_cents); when the run ends, the unused part is refunded and
-- settled_at is set. Runs queued before this migration have no hold and are
-- charged part by part as before.
ALTER TABLE runs ADD COLUMN hold_cents INTEGER NOT NULL DEFAULT 0 CHECK (hold_cents >= 0);
ALTER TABLE runs ADD COLUMN spent_cents INTEGER NOT NULL DEFAULT 0 CHECK (spent_cents >= 0);
ALTER TABLE runs ADD COLUMN settled_at TIMESTAMPTZ;

CREATE INDEX runs_unsettled_idx ON runs (status) WHERE settled_at IS NULL AND hold_cents > 0;

-- Paid model calls that aren't runs (rewriting a character, regenerating
-- identity images, checking premium eligibility), counted for daily quotas.
CREATE TABLE paid_actions (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX paid_actions_user_action_idx ON paid_actions (user_id, action, created_at);
