-- Row 107 — Job profitability truth + missing-money evidence alerts
-- Additive over Row106. No Row108+ banking. Staging Xero writes = 0.

CREATE TABLE IF NOT EXISTS job_profitability_truth_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  completeness text NOT NULL DEFAULT 'INCOMPLETE',
  lifecycle_status text NOT NULL DEFAULT 'UNKNOWN',
  revenue_ex_vat_cents integer,
  material_cost_cents integer,
  labour_cost_cents integer,
  other_job_cost_cents integer,
  total_known_job_cost_cents integer,
  gross_profit_cents integer,
  gross_margin_bps integer,
  job_operating_contribution_cents integer,
  estimated_revenue_ex_vat_cents integer,
  estimated_direct_cost_cents integer,
  estimated_gp_cents integer,
  estimated_margin_bps integer,
  revenue_variance_cents integer,
  cost_variance_cents integer,
  gp_variance_cents integer,
  margin_variance_bps integer,
  overhead_allocated boolean NOT NULL DEFAULT false,
  profitable_or_loss_labelled boolean NOT NULL DEFAULT false,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_inputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  alerts jsonb NOT NULL DEFAULT '[]'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  client_action_id text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_profitability_truth_completeness_chk CHECK (completeness IN (
    'COMPLETE','PROVISIONAL','INCOMPLETE','REVIEW_REQUIRED'
  )),
  CONSTRAINT job_profitability_truth_lifecycle_chk CHECK (lifecycle_status IN (
    'OPEN','COMPLETED','CANCELLED','UNKNOWN'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS job_profitability_truth_company_idempotency_uidx
  ON job_profitability_truth_snapshots (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS job_profitability_truth_company_job_idx
  ON job_profitability_truth_snapshots (company_id, job_id);
