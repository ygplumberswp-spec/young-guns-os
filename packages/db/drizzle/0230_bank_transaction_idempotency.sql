-- Row 112 — Idempotency keys, correction/reversal lineage (no silent overwrite)

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS source_idempotency_key text,
  ADD COLUMN IF NOT EXISTS supersedes_transaction_id uuid REFERENCES bank_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_of_transaction_id uuid REFERENCES bank_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_historical_version boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_company_source_idempotency_uidx
  ON bank_transactions (company_id, bank_account_id, source_idempotency_key)
  WHERE source_idempotency_key IS NOT NULL AND is_historical_version = false;

CREATE TABLE IF NOT EXISTS bank_transaction_lineage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  original_transaction_id uuid NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
  related_transaction_id uuid NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  changed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  silent_overwrite boolean NOT NULL DEFAULT false,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_tx_lineage_type_chk CHECK (event_type IN ('CORRECTED','REVERSAL_OF')),
  CONSTRAINT bank_tx_lineage_no_silent_chk CHECK (silent_overwrite = false),
  CONSTRAINT bank_tx_lineage_distinct_chk CHECK (original_transaction_id <> related_transaction_id)
);

CREATE INDEX IF NOT EXISTS bank_tx_lineage_company_orig_idx
  ON bank_transaction_lineage_events (company_id, original_transaction_id, created_at DESC);
