-- Row 106 — Estimated vs actual GP / margin comparison snapshots
-- Additive. Reuses Row94/96/JPE/Rows103–105. No Row107. Staging Xero writes = 0.

CREATE TABLE IF NOT EXISTS estimated_actual_gp_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  level text NOT NULL,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  quote_line_id uuid,
  invoice_line_id uuid,
  status text NOT NULL DEFAULT 'INCOMPLETE',
  estimated_revenue_ex_vat_cents integer,
  estimated_cost_ex_vat_cents integer,
  estimated_gp_cents integer,
  estimated_margin_bps integer,
  actual_revenue_ex_vat_cents integer,
  actual_direct_cost_ex_vat_cents integer,
  actual_gp_cents integer,
  actual_margin_bps integer,
  gp_variance_cents integer,
  margin_variance_bps integer,
  estimate_source text,
  revenue_source text,
  cost_source text,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  estimate_baseline_unchanged boolean NOT NULL DEFAULT true,
  profitable_or_loss_labelled boolean NOT NULL DEFAULT false,
  idempotency_key text,
  client_action_id text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estimated_actual_gp_level_chk CHECK (level IN ('line','quote','invoice','job')),
  CONSTRAINT estimated_actual_gp_status_chk CHECK (status IN (
    'PROVISIONAL','FINAL','INCOMPLETE','REVIEW_REQUIRED','UNAVAILABLE'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS estimated_actual_gp_company_idempotency_uidx
  ON estimated_actual_gp_comparisons (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS estimated_actual_gp_company_job_idx
  ON estimated_actual_gp_comparisons (company_id, job_id);

CREATE INDEX IF NOT EXISTS estimated_actual_gp_company_quote_idx
  ON estimated_actual_gp_comparisons (company_id, quote_id);

CREATE INDEX IF NOT EXISTS estimated_actual_gp_company_invoice_idx
  ON estimated_actual_gp_comparisons (company_id, invoice_id);
