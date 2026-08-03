-- Xero Finance Foundation Repair (Department 4.0)
-- Extends existing Xero OAuth + sync foundation (0018 / 0093 / 0109).
-- Historical import provenance, quote pull stage support, bank transaction domain rows,
-- and line-item account codes. Import into TITAN only — never overwrite Xero.
-- No demo/fake financial data. Forward-only. Staging-first.
-- Does NOT touch Yoco webhook migration 0123.
-- Does NOT rebuild Finance AURA (0139) or cashflow (0140).

-- Invoice import provenance (source of truth remains Xero; TITAN stores import metadata)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS source_provider text;
--> statement-breakpoint
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS source_external_id text;
--> statement-breakpoint
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS source_synced_at timestamptz;
--> statement-breakpoint
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS source_import_job_id uuid REFERENCES integration_sync_jobs(id) ON DELETE SET NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS invoices_company_source_external_idx
  ON invoices (company_id, source_provider, source_external_id)
  WHERE source_external_id IS NOT NULL;
--> statement-breakpoint

-- Quote import provenance
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS source_provider text;
--> statement-breakpoint
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS source_external_id text;
--> statement-breakpoint
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS source_synced_at timestamptz;
--> statement-breakpoint
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS source_import_job_id uuid REFERENCES integration_sync_jobs(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS xero_quote_number text;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS quotes_company_source_external_idx
  ON quotes (company_id, source_provider, source_external_id)
  WHERE source_external_id IS NOT NULL;
--> statement-breakpoint

-- Payment import provenance + real Xero reference (PaymentID stays on xero_payment_id)
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS source_provider text;
--> statement-breakpoint
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS source_external_id text;
--> statement-breakpoint
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS source_synced_at timestamptz;
--> statement-breakpoint
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS source_import_job_id uuid REFERENCES integration_sync_jobs(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS xero_payment_status text;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS payments_company_source_external_idx
  ON payments (company_id, source_provider, source_external_id)
  WHERE source_external_id IS NOT NULL;
--> statement-breakpoint

-- Invoice line account codes from Xero LineItems (import only)
ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS account_code text;
--> statement-breakpoint
ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS source_external_id text;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS invoice_line_items_source_external_idx
  ON invoice_line_items (company_id, invoice_id, source_external_id)
  WHERE source_external_id IS NOT NULL;
--> statement-breakpoint

-- Quote line account codes from Xero LineItems (import only)
ALTER TABLE quote_line_items
  ADD COLUMN IF NOT EXISTS account_code text;
--> statement-breakpoint
ALTER TABLE quote_line_items
  ADD COLUMN IF NOT EXISTS source_external_id text;
--> statement-breakpoint

-- Durable bank transaction import foundation (audit/read-only — no automatic accounting changes)
CREATE TABLE IF NOT EXISTS xero_bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  integration_connection_id uuid NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  xero_bank_transaction_id text NOT NULL,
  transaction_date date,
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ZAR',
  reference text,
  description text,
  category text,
  bank_account_code text,
  contact_name text,
  xero_contact_id text,
  status text,
  type text,
  is_reconciled boolean NOT NULL DEFAULT false,
  source_provider text NOT NULL DEFAULT 'xero',
  source_synced_at timestamptz,
  source_import_job_id uuid REFERENCES integration_sync_jobs(id) ON DELETE SET NULL,
  raw_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS xero_bank_transactions_company_xero_id_idx
  ON xero_bank_transactions (company_id, xero_bank_transaction_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS xero_bank_transactions_company_date_idx
  ON xero_bank_transactions (company_id, transaction_date DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS xero_bank_transactions_company_sync_idx
  ON xero_bank_transactions (company_id, source_synced_at DESC);
--> statement-breakpoint

-- Finance data pipeline sync run summary (Owner sync management / scheduled-job ready)
CREATE TABLE IF NOT EXISTS xero_finance_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  integration_connection_id uuid NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  sync_job_id uuid REFERENCES integration_sync_jobs(id) ON DELETE SET NULL,
  trigger text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'queued',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  last_sync_at timestamptz,
  contacts_imported integer NOT NULL DEFAULT 0,
  quotes_imported integer NOT NULL DEFAULT 0,
  invoices_imported integer NOT NULL DEFAULT 0,
  payments_imported integer NOT NULL DEFAULT 0,
  bank_transactions_imported integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  error_summary text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS xero_finance_sync_runs_company_started_idx
  ON xero_finance_sync_runs (company_id, started_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS xero_finance_sync_runs_company_job_idx
  ON xero_finance_sync_runs (company_id, sync_job_id);
