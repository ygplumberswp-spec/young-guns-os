-- Finance AURA Agent Foundation (Department 4.1)
-- Recommendations, insights, alerts grounded in real TITAN finance records.
-- Owner approval required before any financial mutation path.
-- No auto-execute. No demo/fake financial data.
-- Extends existing finance / Xero / Command Centre finance agent key.
-- Forward-only. Staging-first. Do not apply to production without Owner approval.
-- Does NOT touch Yoco webhook migration 0123.

DO $$ BEGIN
  CREATE TYPE fin_aura_recommendation_kind AS ENUM (
    'collections',
    'cashflow',
    'receivables_review',
    'payment_follow_up',
    'xero_reconciliation',
    'job_profitability_review',
    'owner_decision',
    'aura_handoff'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE fin_aura_recommendation_status AS ENUM (
    'pending_approval',
    'approved',
    'rejected',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE fin_aura_insight_kind AS ENUM (
    'receivables_summary',
    'payments_summary',
    'overdue_concentration',
    'xero_link_status',
    'job_invoice_linkage',
    'business_financial_context'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE fin_aura_alert_kind AS ENUM (
    'overdue_invoices',
    'outstanding_receivables',
    'no_recent_payments',
    'xero_disconnected',
    'unlinked_job_invoices'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE fin_aura_alert_severity AS ENUM (
    'info',
    'warning',
    'critical'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE fin_aura_alert_status AS ENUM (
    'open',
    'acknowledged',
    'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS fin_aura_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind fin_aura_recommendation_kind NOT NULL,
  status fin_aura_recommendation_status NOT NULL DEFAULT 'pending_approval',
  title text NOT NULL,
  recommendation text NOT NULL,
  source_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  source_payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  source_job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  source_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  auto_executed boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fin_aura_recommendations_company_idx
  ON fin_aura_recommendations (company_id);
CREATE INDEX IF NOT EXISTS fin_aura_recommendations_company_status_idx
  ON fin_aura_recommendations (company_id, status);

CREATE TABLE IF NOT EXISTS fin_aura_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind fin_aura_insight_kind NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  metric_label text,
  metric_value_cents integer,
  currency text,
  source_invoice_count integer NOT NULL DEFAULT 0,
  source_payment_count integer NOT NULL DEFAULT 0,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fin_aura_insights_company_idx
  ON fin_aura_insights (company_id);
CREATE INDEX IF NOT EXISTS fin_aura_insights_company_kind_idx
  ON fin_aura_insights (company_id, kind);

CREATE TABLE IF NOT EXISTS fin_aura_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind fin_aura_alert_kind NOT NULL,
  severity fin_aura_alert_severity NOT NULL DEFAULT 'info',
  status fin_aura_alert_status NOT NULL DEFAULT 'open',
  title text NOT NULL,
  detail text NOT NULL,
  related_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  related_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  amount_cents integer,
  currency text,
  acknowledged_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fin_aura_alerts_company_idx
  ON fin_aura_alerts (company_id);
CREATE INDEX IF NOT EXISTS fin_aura_alerts_company_status_idx
  ON fin_aura_alerts (company_id, status);
