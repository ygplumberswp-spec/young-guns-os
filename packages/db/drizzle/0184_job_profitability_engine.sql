-- JPE-001: Job Profitability Engine foundation (independent of Xero)

CREATE TYPE job_profitability_adjustment_kind AS ENUM (
  'revenue',
  'material_cost',
  'labour_cost',
  'other_direct_cost',
  'total_cost'
);

CREATE TYPE job_direct_cost_category AS ENUM (
  'fuel',
  'delivery',
  'parking',
  'tolls',
  'subcontractor',
  'equipment_hire',
  'consumables',
  'permits',
  'dump_disposal',
  'courier',
  'specialist',
  'travel_accommodation',
  'miscellaneous'
);

CREATE TYPE job_direct_cost_source_type AS ENUM (
  'manual',
  'purchase_order',
  'material_line',
  'bank_transaction',
  'receipt',
  'supplier_invoice',
  'adjustment'
);

CREATE TABLE IF NOT EXISTS job_profitability_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  kind job_profitability_adjustment_kind NOT NULL,
  amount_cents integer NOT NULL,
  reason text NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_profitability_adjustments_company_job_idx
  ON job_profitability_adjustments (company_id, job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS job_direct_cost_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  category job_direct_cost_category NOT NULL DEFAULT 'miscellaneous',
  description text NOT NULL,
  amount_cents integer NOT NULL,
  quantity numeric(12, 3),
  unit_cost_cents integer,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  inventory_item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  source_type job_direct_cost_source_type NOT NULL DEFAULT 'manual',
  source_id text NOT NULL,
  cost_date timestamptz,
  entered_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  is_paid boolean NOT NULL DEFAULT false,
  paid_at timestamptz,
  notes text,
  receipt_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS job_direct_cost_entries_company_job_idx
  ON job_direct_cost_entries (company_id, job_id, cost_date DESC);

CREATE TABLE IF NOT EXISTS job_profitability_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  calculation_version integer NOT NULL DEFAULT 1,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  completeness_status text NOT NULL DEFAULT 'incomplete_multiple',
  calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, job_id)
);

CREATE INDEX IF NOT EXISTS job_profitability_snapshots_company_calculated_idx
  ON job_profitability_snapshots (company_id, calculated_at DESC);

ALTER TABLE company_finance_settings
  ADD COLUMN IF NOT EXISTS default_internal_labour_rate_cents_per_hour integer NOT NULL DEFAULT 8000,
  ADD COLUMN IF NOT EXISTS profitability_excellent_margin_bps integer NOT NULL DEFAULT 3500,
  ADD COLUMN IF NOT EXISTS profitability_healthy_margin_bps integer NOT NULL DEFAULT 2500,
  ADD COLUMN IF NOT EXISTS profitability_warning_margin_bps integer NOT NULL DEFAULT 1500;
