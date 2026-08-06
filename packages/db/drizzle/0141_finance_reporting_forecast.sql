-- Financial Reporting & Forecasting (Department 4.3)
-- Extends Finance AURA Agent (0139) + Cashflow & Profit Intelligence (0140).
-- Report/forecast snapshots, budget plans, executive insight handoffs.
-- Forecasts explain assumptions; insufficient_history when thin — never invented.
-- Owner approval required for recommended actions. No auto-execute. No demo data.
-- Forward-only. Staging-first. Do not apply to production without Owner approval.
-- Does NOT touch Yoco webhook migration 0123.

DO $$ BEGIN
  CREATE TYPE frf_report_kind AS ENUM (
    'revenue',
    'expense',
    'profit',
    'invoice',
    'payment',
    'job',
    'job_profitability'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE frf_forecast_kind AS ENUM (
    'revenue',
    'cashflow',
    'budget_planning',
    'trend'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE frf_availability AS ENUM (
    'available',
    'unavailable',
    'insufficient_history'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE frf_insight_target AS ENUM (
    'command_centre',
    'executive_dashboard',
    'finance_aura_agent',
    'dashboard'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE frf_insight_status AS ENUM (
    'open',
    'acknowledged',
    'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE frf_action_kind AS ENUM (
    'review_forecast',
    'budget_adjustment',
    'collections_focus',
    'expense_review',
    'executive_brief',
    'aura_handoff'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE frf_action_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS frf_report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind frf_report_kind NOT NULL,
  availability frf_availability NOT NULL,
  title text NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  period_start timestamptz,
  period_end timestamptz,
  total_cents integer,
  line_count integer NOT NULL DEFAULT 0,
  summary text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS frf_report_snapshots_company_idx
  ON frf_report_snapshots (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS frf_report_snapshots_company_kind_idx
  ON frf_report_snapshots (company_id, kind);

CREATE TABLE IF NOT EXISTS frf_forecast_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind frf_forecast_kind NOT NULL,
  availability frf_availability NOT NULL,
  title text NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  methodology text NOT NULL,
  history_months_used integer NOT NULL DEFAULT 0,
  projected_total_cents integer,
  summary text NOT NULL,
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS frf_forecast_snapshots_company_idx
  ON frf_forecast_snapshots (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS frf_forecast_snapshots_company_kind_idx
  ON frf_forecast_snapshots (company_id, kind);

CREATE TABLE IF NOT EXISTS frf_budget_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  budgeted_revenue_cents integer,
  budgeted_expense_cents integer,
  actual_revenue_cents integer,
  actual_expense_cents integer,
  revenue_variance_cents integer,
  expense_variance_cents integer,
  notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS frf_budget_plans_company_idx
  ON frf_budget_plans (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS frf_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target frf_insight_target NOT NULL,
  status frf_insight_status NOT NULL DEFAULT 'open',
  title text NOT NULL,
  insight text NOT NULL,
  href text,
  source_report_id uuid REFERENCES frf_report_snapshots(id) ON DELETE SET NULL,
  source_forecast_id uuid REFERENCES frf_forecast_snapshots(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS frf_insights_company_idx
  ON frf_insights (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS frf_insights_company_status_idx
  ON frf_insights (company_id, status);

CREATE TABLE IF NOT EXISTS frf_action_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind frf_action_kind NOT NULL,
  status frf_action_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  recommendation text NOT NULL,
  source_report_id uuid REFERENCES frf_report_snapshots(id) ON DELETE SET NULL,
  source_forecast_id uuid REFERENCES frf_forecast_snapshots(id) ON DELETE SET NULL,
  auto_executed boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS frf_action_recommendations_company_idx
  ON frf_action_recommendations (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS frf_action_recommendations_company_status_idx
  ON frf_action_recommendations (company_id, status);
