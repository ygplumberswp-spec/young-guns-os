-- Sales Intelligence Agent Foundation (Department 10.1)
-- Lead hunting, qualification, pipeline insights, and AURA sales recommendations.
-- Extends existing CRM / leads / sales pipeline / quotes / communications.
-- Owner approval required before any outreach or external action.
-- No spam. No uncontrolled outreach. No fake leads/opportunities.
-- Forward-only. Staging-first. Do not apply to production without Owner approval.
-- Does NOT touch Yoco webhook migration 0123.

DO $$ BEGIN
  CREATE TYPE sia_recommendation_kind AS ENUM (
    'outreach_draft',
    'follow_up',
    'lead_priority',
    'quote_follow_up',
    'pipeline_advance',
    'revenue_opportunity',
    'best_next_action',
    'owner_decision',
    'aura_handoff'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sia_recommendation_status AS ENUM (
    'pending_approval',
    'approved',
    'rejected',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sia_insight_kind AS ENUM (
    'lead_hunting_summary',
    'qualification_summary',
    'pipeline_summary',
    'conversion_tracking',
    'revenue_opportunity',
    'best_next_action',
    'lead_priority',
    'business_sales_context'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sia_signal_kind AS ENUM (
    'lead_source',
    'unconverted_quote',
    'open_opportunity',
    'stale_follow_up',
    'high_score_lead',
    'comms_signal',
    'market_opportunity',
    'conversion'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS sia_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind sia_recommendation_kind NOT NULL,
  status sia_recommendation_status NOT NULL DEFAULT 'pending_approval',
  title text NOT NULL,
  recommendation text NOT NULL,
  draft_outreach text,
  source_lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  source_opportunity_id uuid REFERENCES sales_opportunities(id) ON DELETE SET NULL,
  source_quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  source_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  auto_executed boolean NOT NULL DEFAULT false,
  outreach_sent boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sia_recommendations_company_idx
  ON sia_recommendations (company_id);
CREATE INDEX IF NOT EXISTS sia_recommendations_company_status_idx
  ON sia_recommendations (company_id, status);

CREATE TABLE IF NOT EXISTS sia_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind sia_insight_kind NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  metric_label text,
  metric_value integer,
  metric_value_cents integer,
  currency text,
  source_lead_count integer NOT NULL DEFAULT 0,
  source_opportunity_count integer NOT NULL DEFAULT 0,
  source_quote_count integer NOT NULL DEFAULT 0,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sia_insights_company_idx
  ON sia_insights (company_id);
CREATE INDEX IF NOT EXISTS sia_insights_company_kind_idx
  ON sia_insights (company_id, kind);

CREATE TABLE IF NOT EXISTS sia_opportunity_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind sia_signal_kind NOT NULL,
  title text NOT NULL,
  detail text NOT NULL,
  priority text NOT NULL DEFAULT 'medium',
  source_lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  source_opportunity_id uuid REFERENCES sales_opportunities(id) ON DELETE SET NULL,
  source_quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  source_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  source_lead_source_id uuid REFERENCES lead_sources(id) ON DELETE SET NULL,
  estimated_value_cents integer,
  currency text,
  dismissed boolean NOT NULL DEFAULT false,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sia_opportunity_signals_company_idx
  ON sia_opportunity_signals (company_id);
CREATE INDEX IF NOT EXISTS sia_opportunity_signals_company_kind_idx
  ON sia_opportunity_signals (company_id, kind);
