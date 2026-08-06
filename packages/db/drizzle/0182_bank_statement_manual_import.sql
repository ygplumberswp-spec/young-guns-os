-- BANK-IMPORT-001: controlled manual bank statement import (staging only — do not apply until Owner approval)
CREATE TABLE IF NOT EXISTS bank_statement_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bank_account_code text NOT NULL,
  bank_account_name text NOT NULL,
  status text NOT NULL DEFAULT 'preview_ready',
  original_filename text NOT NULL,
  sanitized_filename text NOT NULL,
  storage_key text NOT NULL,
  mime_type text NOT NULL,
  file_size_bytes integer NOT NULL,
  file_checksum_sha256 text NOT NULL,
  column_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_count integer NOT NULL DEFAULT 0,
  ready_count integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  invalid_count integer NOT NULL DEFAULT 0,
  review_required_count integer NOT NULL DEFAULT 0,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  approved_by_user_id uuid REFERENCES users(id),
  approved_at timestamptz,
  reverted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_statement_import_batches_company_status_idx
  ON bank_statement_import_batches (company_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS bank_statement_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES bank_statement_import_batches(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  row_index integer NOT NULL,
  transaction_date date,
  amount_cents integer,
  currency text NOT NULL DEFAULT 'ZAR',
  reference text,
  description text,
  row_fingerprint text NOT NULL,
  classification text NOT NULL,
  review_status text NOT NULL DEFAULT 'imported_awaiting_review',
  suggested_match_type text,
  suggested_match_label text,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, row_fingerprint)
);

CREATE INDEX IF NOT EXISTS bank_statement_import_rows_batch_idx
  ON bank_statement_import_rows (batch_id, row_index);
CREATE INDEX IF NOT EXISTS bank_statement_import_rows_company_classification_idx
  ON bank_statement_import_rows (company_id, classification);

CREATE TABLE IF NOT EXISTS bank_statement_import_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES bank_statement_import_batches(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  action text NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES users(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_statement_import_audit_batch_idx
  ON bank_statement_import_audit_logs (batch_id, created_at DESC);
