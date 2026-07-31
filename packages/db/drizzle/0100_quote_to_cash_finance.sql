-- UX-E: Quote-to-Cash finance operational contract
-- Forward-only. Disposable / staging only — never apply to live from this change set.

ALTER TYPE "quote_status" ADD VALUE IF NOT EXISTS 'internal_review';
ALTER TYPE "quote_status" ADD VALUE IF NOT EXISTS 'approved_for_sending';
ALTER TYPE "quote_status" ADD VALUE IF NOT EXISTS 'viewed';
ALTER TYPE "quote_status" ADD VALUE IF NOT EXISTS 'superseded';
ALTER TYPE "quote_status" ADD VALUE IF NOT EXISTS 'converted';
ALTER TYPE "quote_status" ADD VALUE IF NOT EXISTS 'cancelled';

DO $$ BEGIN
  CREATE TYPE invoice_stage AS ENUM ('deposit', 'progress', 'final', 'standard');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE quote_line_category AS ENUM (
    'scope', 'labour', 'materials', 'travel', 'equipment', 'subcontractor',
    'overhead', 'contingency', 'warranty', 'discount', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS company_finance_settings (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  default_vat_rate_bps integer NOT NULL DEFAULT 1500,
  profit_floor_margin_bps integer NOT NULL DEFAULT 2000,
  allow_below_floor_with_override boolean NOT NULL DEFAULT true,
  currency text NOT NULL DEFAULT 'ZAR',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES cx_customer_properties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS estimator_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS root_quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supersedes_quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_immutable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scope_of_work text,
  ADD COLUMN IF NOT EXISTS exclusions text,
  ADD COLUMN IF NOT EXISTS assumptions text,
  ADD COLUMN IF NOT EXISTS customer_notes text,
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS deposit_percent integer,
  ADD COLUMN IF NOT EXISTS option_tier text,
  ADD COLUMN IF NOT EXISTS subtotal_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_cost_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_profit_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS markup_bps integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS margin_bps integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit_floor_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_price_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS below_floor_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS below_floor_reason text,
  ADD COLUMN IF NOT EXISTS below_floor_authorized_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS declined_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS xero_quote_id text,
  ADD COLUMN IF NOT EXISTS client_action_id text;

-- Backfill totals from legacy amount_cents
UPDATE quotes
SET total_cents = amount_cents,
    subtotal_cents = amount_cents
WHERE total_cents = 0 AND amount_cents > 0;

CREATE UNIQUE INDEX IF NOT EXISTS quotes_company_client_action_uidx
  ON quotes (company_id, client_action_id)
  WHERE client_action_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS quotes_company_root_idx ON quotes (company_id, root_quote_id);
CREATE INDEX IF NOT EXISTS quotes_company_status_idx ON quotes (company_id, status);
CREATE INDEX IF NOT EXISTS quotes_company_job_idx ON quotes (company_id, job_id);

CREATE TABLE IF NOT EXISTS quote_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  category quote_line_category NOT NULL DEFAULT 'other',
  description text NOT NULL,
  quantity numeric(18,4) NOT NULL DEFAULT 1,
  unit_price_cents integer NOT NULL DEFAULT 0,
  unit_cost_cents integer NOT NULL DEFAULT 0,
  vat_rate_bps integer NOT NULL DEFAULT 1500,
  line_subtotal_cents integer NOT NULL DEFAULT 0,
  line_vat_cents integer NOT NULL DEFAULT 0,
  line_total_cents integer NOT NULL DEFAULT 0,
  line_cost_cents integer NOT NULL DEFAULT 0,
  is_optional boolean NOT NULL DEFAULT false,
  option_tier text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quote_line_items_quote_idx ON quote_line_items (company_id, quote_id, position);

CREATE TABLE IF NOT EXISTS quote_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  portal_user_id uuid,
  client_action_id text NOT NULL,
  decision text NOT NULL,
  accepted_version_number integer NOT NULL,
  accepter_name text,
  accepter_email text,
  acknowledgement_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  decline_reason text,
  change_request_message text,
  evidence_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS quote_acceptances_company_client_action_uidx
  ON quote_acceptances (company_id, client_action_id);

CREATE UNIQUE INDEX IF NOT EXISTS quote_acceptances_quote_accept_uidx
  ON quote_acceptances (quote_id)
  WHERE decision = 'accepted';

CREATE INDEX IF NOT EXISTS quote_acceptances_quote_idx
  ON quote_acceptances (company_id, quote_id, created_at DESC);

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS stage invoice_stage NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES cx_customer_properties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quote_version_number integer,
  ADD COLUMN IF NOT EXISTS internal_number text,
  ADD COLUMN IF NOT EXISTS xero_invoice_number text,
  ADD COLUMN IF NOT EXISTS xero_reference text,
  ADD COLUMN IF NOT EXISTS number_authority text NOT NULL DEFAULT 'internal_pending_xero',
  ADD COLUMN IF NOT EXISTS subtotal_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS billing_name text,
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS billing_phone text,
  ADD COLUMN IF NOT EXISTS client_action_id text,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

UPDATE invoices
SET internal_number = COALESCE(internal_number, invoice_number),
    total_cents = CASE WHEN total_cents = 0 THEN amount_cents ELSE total_cents END,
    subtotal_cents = CASE WHEN subtotal_cents = 0 THEN amount_cents ELSE subtotal_cents END,
    number_authority = COALESCE(NULLIF(number_authority, ''), 'internal_pending_xero')
WHERE true;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_company_internal_number_uidx
  ON invoices (company_id, internal_number)
  WHERE internal_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_company_client_action_uidx
  ON invoices (company_id, client_action_id)
  WHERE client_action_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS invoices_company_xero_number_idx
  ON invoices (company_id, xero_invoice_number);

CREATE INDEX IF NOT EXISTS invoices_company_stage_idx ON invoices (company_id, stage);

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  quote_line_item_id uuid REFERENCES quote_line_items(id) ON DELETE SET NULL,
  position integer NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'other',
  description text NOT NULL,
  quantity numeric(18,4) NOT NULL DEFAULT 1,
  unit_price_cents integer NOT NULL DEFAULT 0,
  vat_rate_bps integer NOT NULL DEFAULT 1500,
  line_subtotal_cents integer NOT NULL DEFAULT 0,
  line_vat_cents integer NOT NULL DEFAULT 0,
  line_total_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_line_items_invoice_idx
  ON invoice_line_items (company_id, invoice_id, position);

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS client_action_id text,
  ADD COLUMN IF NOT EXISTS xero_payment_id text,
  ADD COLUMN IF NOT EXISTS recorded_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_company_client_action_uidx
  ON payments (company_id, client_action_id)
  WHERE client_action_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  receipt_number text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_receipts_payment_uidx ON payment_receipts (payment_id);
CREATE UNIQUE INDEX IF NOT EXISTS payment_receipts_company_number_uidx
  ON payment_receipts (company_id, receipt_number);

ALTER TABLE xero_invoice_mappings
  ADD COLUMN IF NOT EXISTS xero_invoice_number text,
  ADD COLUMN IF NOT EXISTS xero_reference text;
