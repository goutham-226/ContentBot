-- Credits (in cents) and a ledger of every grant and charge. Runs are charged
-- piece by piece as each part finishes, so a cancelled run costs only what it made.
ALTER TABLE users ADD COLUMN credits_cents INTEGER NOT NULL DEFAULT 0 CHECK (credits_cents >= 0);

CREATE TABLE credit_ledger (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  run_id        UUID REFERENCES runs (id) ON DELETE SET NULL,
  amount_cents  INTEGER NOT NULL, -- positive: credit added; negative: charge
  reason        TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX credit_ledger_user_id_idx ON credit_ledger (user_id, created_at);
CREATE INDEX credit_ledger_run_id_idx ON credit_ledger (run_id);

-- Runs can be cancelled by the user mid-generation.
ALTER TABLE runs DROP CONSTRAINT runs_status_check;
ALTER TABLE runs ADD CONSTRAINT runs_status_check
  CHECK (status IN ('queued', 'running', 'awaiting_approval', 'done', 'failed', 'canceled'));
