-- Sales Analytics Intelligence (Department 10.3)
-- Extends Sales Intelligence Agent (10.1) / Sales Follow-up (10.2) /
-- CRM leads / quotes / sales pipeline / jobs / finance aggregates.
-- Analytics snapshots + AURA insight drafts only.
-- Real pipeline signals only — no invented conversion rates or revenue.
-- No automatic outreach. Forward-only. Staging-first.
-- Do not apply to production without Owner approval.
-- Does NOT touch Yoco webhook migration 0123.

DO $$ BEGIN
  CREATE TYPE sai_insight_kind AS ENUM (
    'sales_trend',
    'lost_opportunity',
    'improvement_area',
    'conversion_signal',
    'revenue_opportunity',
    'performance_signal'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sai_insight_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'cancelled',
    'acknowledged'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sai_aura_insight_target AS ENUM (
    'command_centre',
    'executive_dashboard',
    'sales_intelligence_agent',
    'sales_followup_intelligence',
    'sales_intelligence',
    'crm',
    'quotes',
    'jobs',
    'finance',
    'leads'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sai_aura_insight_status AS ENUM (
    'open',
    'acknowledged',
    'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS sai_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  insights_enabled boolean NOT NULL DEFAULT true,
  min_conversion_sample integer NOT NULL DEFAULT 5,
  invent_rates_enabled boolean NOT NULL DEFAULT false,
  auto_outreach_enabled boolean NOT NULL DEFAULT false,
  notes text,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sai_settings_company_uidx
  ON sai_settings (company_id);

CREATE TABLE IF NOT EXISTS sai_analytics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  leads_created integer NOT NULL DEFAULT 0,
  quotes_sent integer NOT NULL DEFAULT 0,
  quotes_accepted integer NOT NULL DEFAULT 0,
  quotes_declined integer NOT NULL DEFAULT 0,
  open_opportunity_count integer NOT NULL DEFAULT 0,
  won_opportunity_count integer NOT NULL DEFAULT 0,
  lost_opportunity_count integer NOT NULL DEFAULT 0,
  pipeline_value_cents integer,
  accepted_quote_value_cents integer,
  currency text NOT NULL DEFAULT 'ZAR',
  quote_conversion_rate_percent numeric(6, 2),
  lead_to_quote_rate_percent numeric(6, 2),
  win_rate_percent numeric(6, 2),
  conversion_availability text NOT NULL DEFAULT 'unavailable',
  revenue_availability text NOT NULL DEFAULT 'unavailable',
  rationale text NOT NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sai_analytics_snapshots_company_idx
  ON sai_analytics_snapshots (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sai_insight_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind sai_insight_kind NOT NULL,
  status sai_insight_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL,
  source_quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  source_lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  source_opportunity_id uuid REFERENCES sales_opportunities(id) ON DELETE SET NULL,
  source_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  invented_rates boolean NOT NULL DEFAULT false,
  auto_outreach boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sai_insight_drafts_company_idx
  ON sai_insight_drafts (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sai_insight_drafts_status_idx
  ON sai_insight_drafts (company_id, status);

CREATE TABLE IF NOT EXISTS sai_aura_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target sai_aura_insight_target NOT NULL,
  status sai_aura_insight_status NOT NULL DEFAULT 'open',
  title text NOT NULL,
  insight text NOT NULL,
  href text,
  source_insight_draft_id uuid REFERENCES sai_insight_drafts(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sai_aura_insights_company_idx
  ON sai_aura_insights (company_id, created_at DESC);
