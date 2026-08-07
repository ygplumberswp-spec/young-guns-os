-- JPE-002: Job cost capture & missing-money control layer

CREATE TYPE job_financial_review_status AS ENUM (
  'not_required',
  'needs_review',
  'in_review',
  'financially_complete'
);

CREATE TABLE IF NOT EXISTS job_financial_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status job_financial_review_status NOT NULL DEFAULT 'not_required',
  review_fingerprint text,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, job_id)
);

CREATE INDEX IF NOT EXISTS job_financial_reviews_company_status_idx
  ON job_financial_reviews (company_id, status, updated_at DESC);

-- Allow company-level unallocated direct costs before job assignment
ALTER TABLE job_direct_cost_entries
  ALTER COLUMN job_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS job_direct_cost_entries_company_unallocated_idx
  ON job_direct_cost_entries (company_id, cost_date DESC)
  WHERE job_id IS NULL;

-- Configurable expected-vs-actual margin variance threshold (basis points)
ALTER TABLE company_finance_settings
  ADD COLUMN IF NOT EXISTS cost_control_margin_variance_bps integer NOT NULL DEFAULT 1000;
