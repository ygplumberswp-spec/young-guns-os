-- Cashflow & Profit Intelligence (Department 4.2)
-- Extends Finance AURA Agent Foundation (0139).
-- Insights + Owner-gated action recommendations from real TITAN finance data.
-- No auto-execute. No demo/fake financial numbers.
-- Forward-only. Staging-first. Do not apply to production without Owner approval.
-- Does NOT touch Yoco webhook migration 0123.

DO $$ BEGIN
  CREATE TYPE fcp_insight_kind AS ENUM (
    'cashflow_risk',
    'cashflow_opportunity',
    'cost_problem',
    'profit_improvement',
    'margin_warning',
    'receivables_pressure',
    'expense_concentration',
    'poor_performing_service',
    'outstanding_money',
    'labour_cost_gap',
    'profit_opportunity'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE fcp_insight_status AS ENUM (
    'open',
    'acknowledged',
    'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE fcp_action_kind AS ENUM (
    'collections_push',
    'expense_review',
    'margin_review',
    'job_cost_review',
    'cash_position_review',
    'inventory_cost_gap',
    'aura_handoff'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE fcp_action_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS fcp_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind fcp_insight_kind NOT NULL,
  status fcp_insight_status NOT NULL DEFAULT 'open',
  title text NOT NULL,
  body text NOT NULL,
  metric_label text,
  metric_value_cents integer,
  currency text,
  source_invoice_count integer NOT NULL DEFAULT 0,
  source_payment_count integer NOT NULL DEFAULT 0,
  source_job_count integer NOT NULL DEFAULT 0,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fcp_insights_company_idx
  ON fcp_insights (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fcp_insights_company_status_idx
  ON fcp_insights (company_id, status);

CREATE TABLE IF NOT EXISTS fcp_action_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind fcp_action_kind NOT NULL,
  status fcp_action_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  recommendation text NOT NULL,
  source_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  source_job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  source_insight_id uuid REFERENCES fcp_insights(id) ON DELETE SET NULL,
  auto_executed boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fcp_action_recommendations_company_idx
  ON fcp_action_recommendations (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fcp_action_recommendations_company_status_idx
  ON fcp_action_recommendations (company_id, status);
