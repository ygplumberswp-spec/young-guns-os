-- Row 114 — Statement archive evidence (additive). No OCR.

ALTER TABLE bank_statement_import_batches
  ADD COLUMN IF NOT EXISTS source_provider text NOT NULL DEFAULT 'manual_statement',
  ADD COLUMN IF NOT EXISTS masked_account_identity text,
  ADD COLUMN IF NOT EXISTS statement_period_from date,
  ADD COLUMN IF NOT EXISTS statement_period_to date;

CREATE TABLE IF NOT EXISTS bank_statement_archive_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  import_batch_id uuid NOT NULL REFERENCES bank_statement_import_batches(id) ON DELETE CASCADE,
  original_filename text NOT NULL,
  file_source_hash text NOT NULL,
  source_provider text NOT NULL DEFAULT 'manual_statement',
  masked_account_identity text,
  imported_at timestamptz NOT NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  statement_period_from date,
  statement_period_to date,
  invented_metadata boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_statement_archive_no_invent_chk CHECK (invented_metadata = false),
  CONSTRAINT bank_statement_archive_period_pair_chk CHECK (
    (statement_period_from IS NULL AND statement_period_to IS NULL)
    OR (statement_period_from IS NOT NULL AND statement_period_to IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS bank_statement_archive_company_idx
  ON bank_statement_archive_events (company_id, imported_at DESC);
