-- BANK-001 — Bank transaction control layer (staging/code only)
-- Builds unified transaction ledger + allocation model on top of BANK-IMPORT-001.

DO $$ BEGIN
  CREATE TYPE bank_transaction_direction AS ENUM ('debit', 'credit');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE bank_transaction_allocation_status AS ENUM (
    'unallocated',
    'suggested',
    'partially_allocated',
    'allocated',
    'ignored',
    'needs_review'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE bank_transaction_reconciliation_status AS ENUM (
    'unreconciled',
    'partially_reconciled',
    'reconciled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE bank_transaction_receipt_status AS ENUM (
    'receipt_not_required',
    'receipt_missing',
    'receipt_attached',
    'receipt_verified'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE bank_transaction_allocation_type AS ENUM (
    'direct_job_cost',
    'overhead',
    'transfer',
    'supplier_settlement',
    'customer_payment',
    'owner_director',
    'tax',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  bank_account_code text,
  currency text NOT NULL DEFAULT 'ZAR',
  provider text NOT NULL DEFAULT 'manual',
  xero_account_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_company_code_unique
  ON bank_accounts (company_id, bank_account_code)
  WHERE bank_account_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS bank_accounts_company_active_idx
  ON bank_accounts (company_id, is_active, name);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'manual_import',
  external_transaction_id text,
  transaction_date date NOT NULL,
  posted_date date,
  description text,
  reference text,
  amount_cents integer NOT NULL,
  direction bank_transaction_direction NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  running_balance_cents integer,
  merchant_name text,
  suggested_supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  allocation_status bank_transaction_allocation_status NOT NULL DEFAULT 'unallocated',
  reconciliation_status bank_transaction_reconciliation_status NOT NULL DEFAULT 'unreconciled',
  receipt_status bank_transaction_receipt_status NOT NULL DEFAULT 'receipt_missing',
  receipt_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  source_fingerprint text NOT NULL,
  import_batch_id uuid REFERENCES bank_statement_import_batches(id) ON DELETE SET NULL,
  import_row_id uuid REFERENCES bank_statement_import_rows(id) ON DELETE SET NULL,
  xero_bank_transaction_id text,
  raw_provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  allocated_amount_cents integer NOT NULL DEFAULT 0,
  imported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_company_fingerprint_unique
  ON bank_transactions (company_id, source_fingerprint);

CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_company_provider_external_unique
  ON bank_transactions (company_id, provider, external_transaction_id)
  WHERE external_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bank_transactions_company_status_date_idx
  ON bank_transactions (company_id, allocation_status, transaction_date DESC);

CREATE INDEX IF NOT EXISTS bank_transactions_company_direction_idx
  ON bank_transactions (company_id, direction, transaction_date DESC);

CREATE INDEX IF NOT EXISTS bank_transactions_bank_account_date_idx
  ON bank_transactions (bank_account_id, transaction_date DESC);

CREATE TABLE IF NOT EXISTS bank_transaction_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  allocation_type bank_transaction_allocation_type NOT NULL,
  category text,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  direct_cost_id uuid REFERENCES job_direct_cost_entries(id) ON DELETE SET NULL,
  notes text,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  superseded_by_allocation_id uuid REFERENCES bank_transaction_allocations(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_transaction_allocations_transaction_active_idx
  ON bank_transaction_allocations (transaction_id, is_active);

CREATE INDEX IF NOT EXISTS bank_transaction_allocations_company_job_idx
  ON bank_transaction_allocations (company_id, job_id)
  WHERE job_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS bank_transaction_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES bank_transactions(id) ON DELETE SET NULL,
  import_batch_id uuid REFERENCES bank_statement_import_batches(id) ON DELETE SET NULL,
  action text NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES users(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_transaction_audit_company_created_idx
  ON bank_transaction_audit_logs (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS bank_transaction_audit_transaction_idx
  ON bank_transaction_audit_logs (transaction_id, created_at DESC);
