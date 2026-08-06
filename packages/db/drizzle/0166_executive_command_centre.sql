-- Executive Command Centre (Department 15)
-- Owner-only unified business view over existing finance / operations / HR /
-- fleet / marketing / sales sources plus the AURA Command Centre.
-- Business figures are read live from those sources and are never stored or
-- cached here, so no metric can drift from its real source. Only Owner
-- settings, approval-gated executive action drafts and acknowledged insights
-- persist.
-- Real connected data only. Financial figures are never invented.
-- Forward-only. Staging-first. Do not apply to production without Owner approval.
-- Never touches Yoco 0123.

DO $$ BEGIN
  CREATE TYPE ec_panel AS ENUM (
    'revenue', 'profit', 'cash', 'outstanding_invoices', 'jobs',
    'staff', 'fleet', 'marketing', 'sales'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ec_action_status AS ENUM (
    'draft', 'pending_approval', 'approved', 'rejected', 'cancelled', 'acknowledged'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ec_insight_status AS ENUM ('open', 'acknowledged', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ec_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  auto_execute_actions_enabled boolean NOT NULL DEFAULT false,
  invent_financial_figures_enabled boolean NOT NULL DEFAULT false,
  finance_panels_enabled boolean NOT NULL DEFAULT true,
  operations_panels_enabled boolean NOT NULL DEFAULT true,
  risk_detection_enabled boolean NOT NULL DEFAULT true,
  opportunity_detection_enabled boolean NOT NULL DEFAULT true,
  notes text,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ec_settings_no_auto_exec CHECK (auto_execute_actions_enabled = false),
  CONSTRAINT ec_settings_no_invent CHECK (invent_financial_figures_enabled = false)
);

CREATE UNIQUE INDEX IF NOT EXISTS ec_settings_company_uidx ON ec_settings (company_id);

CREATE TABLE IF NOT EXISTS ec_action_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  panel ec_panel,
  status ec_action_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL,
  auto_executed boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ec_action_drafts_no_auto CHECK (auto_executed = false)
);

CREATE INDEX IF NOT EXISTS ec_action_drafts_queue_idx
  ON ec_action_drafts (company_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS ec_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  panel ec_panel,
  status ec_insight_status NOT NULL DEFAULT 'open',
  title text NOT NULL,
  insight text NOT NULL,
  href text,
  source_action_id uuid REFERENCES ec_action_drafts(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ec_insights_company_idx
  ON ec_insights (company_id, created_at DESC);
