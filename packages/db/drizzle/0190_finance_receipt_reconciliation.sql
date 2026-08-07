-- BANK-002 — Receipt / slip matching & supplier reconciliation (staging/code only)

DO $$ BEGIN
  ALTER TYPE bank_transaction_receipt_status ADD VALUE IF NOT EXISTS 'receipt_needs_review';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS supplier_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  alias_text text NOT NULL,
  normalised_alias text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  approved_by_user_id uuid NOT NULL REFERENCES users(id),
  approved_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_aliases_company_normalised_unique
  ON supplier_aliases (company_id, normalised_alias);

CREATE INDEX IF NOT EXISTS supplier_aliases_company_supplier_idx
  ON supplier_aliases (company_id, supplier_id, is_enabled);

CREATE TABLE IF NOT EXISTS finance_receipt_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  evidence_source text NOT NULL DEFAULT 'document',
  evidence_source_id uuid,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  receipt_number text,
  document_date date,
  total_amount_cents integer,
  vat_amount_cents integer,
  tax_rate_bps integer,
  exclusive_total_cents integer,
  currency text NOT NULL DEFAULT 'ZAR',
  match_status text NOT NULL DEFAULT 'awaiting_transaction_match',
  verification_status text NOT NULL DEFAULT 'not_verified',
  verified_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  direct_cost_id uuid REFERENCES job_direct_cost_entries(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  notes text,
  duplicate_flag text,
  file_checksum_sha256 text,
  link_method text,
  linked_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  linked_at timestamptz,
  source_fingerprint text,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_receipt_records_company_match_idx
  ON finance_receipt_records (company_id, match_status, created_at DESC);

CREATE INDEX IF NOT EXISTS finance_receipt_records_company_supplier_idx
  ON finance_receipt_records (company_id, supplier_id);

CREATE INDEX IF NOT EXISTS finance_receipt_records_checksum_idx
  ON finance_receipt_records (company_id, file_checksum_sha256)
  WHERE file_checksum_sha256 IS NOT NULL;

CREATE TABLE IF NOT EXISTS finance_receipt_transaction_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  receipt_record_id uuid NOT NULL REFERENCES finance_receipt_records(id) ON DELETE CASCADE,
  bank_transaction_id uuid REFERENCES bank_transactions(id) ON DELETE SET NULL,
  bank_allocation_id uuid REFERENCES bank_transaction_allocations(id) ON DELETE SET NULL,
  amount_cents integer,
  relationship_type text NOT NULL DEFAULT 'evidence',
  link_method text NOT NULL DEFAULT 'manual',
  linked_by_user_id uuid NOT NULL REFERENCES users(id),
  linked_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_receipt_tx_links_receipt_active_idx
  ON finance_receipt_transaction_links (receipt_record_id, is_active);

CREATE INDEX IF NOT EXISTS finance_receipt_tx_links_transaction_active_idx
  ON finance_receipt_transaction_links (bank_transaction_id, is_active)
  WHERE bank_transaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS finance_receipt_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  receipt_record_id uuid REFERENCES finance_receipt_records(id) ON DELETE SET NULL,
  bank_transaction_id uuid REFERENCES bank_transactions(id) ON DELETE SET NULL,
  action text NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES users(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_receipt_audit_company_created_idx
  ON finance_receipt_audit_logs (company_id, created_at DESC);

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS confirmed_supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bank_transactions_company_receipt_status_idx
  ON bank_transactions (company_id, receipt_status, transaction_date DESC);
