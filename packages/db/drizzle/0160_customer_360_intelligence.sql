-- Customer 360 Intelligence Platform (Department 11 / Expansion)
-- Extends existing CRM customers + jobs + quotes + invoices + payments +
-- communications + documents + recurring maintenance / equipment links.
-- Unified profile + timeline + AURA insight drafts (maintenance / value /
-- follow-up / retention). Recommendations only — never auto-send.
-- No fake customers. No CRM rebuild. Tenant-isolated. Forward-only. Staging-first.
-- Do not apply to production without Owner approval. Never touch Yoco 0123.

DO $$ BEGIN
  CREATE TYPE c360_insight_kind AS ENUM (
    'maintenance_opportunity',
    'customer_value',
    'follow_up',
    'retention'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE c360_insight_status AS ENUM (
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
  CREATE TYPE c360_aura_target AS ENUM (
    'command_centre',
    'executive_dashboard',
    'crm',
    'customer_engagement',
    'homeshield',
    'recurring_maintenance',
    'communications',
    'finance'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE c360_aura_status AS ENUM (
    'open',
    'acknowledged',
    'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS c360_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  insights_enabled boolean NOT NULL DEFAULT true,
  timeline_enabled boolean NOT NULL DEFAULT true,
  recommendation_drafts_enabled boolean NOT NULL DEFAULT true,
  auto_send_enabled boolean NOT NULL DEFAULT false,
  invent_customers_enabled boolean NOT NULL DEFAULT false,
  notes text,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT c360_settings_auto_send_false_chk CHECK (auto_send_enabled = false),
  CONSTRAINT c360_settings_invent_false_chk CHECK (invent_customers_enabled = false)
);

CREATE UNIQUE INDEX IF NOT EXISTS c360_settings_company_uidx
  ON c360_settings (company_id);

CREATE TABLE IF NOT EXISTS c360_insight_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind c360_insight_kind NOT NULL,
  status c360_insight_status NOT NULL DEFAULT 'draft',
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  auto_send boolean NOT NULL DEFAULT false,
  auto_executed boolean NOT NULL DEFAULT false,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT c360_insight_drafts_auto_send_false_chk CHECK (auto_send = false),
  CONSTRAINT c360_insight_drafts_auto_executed_false_chk CHECK (auto_executed = false)
);

CREATE INDEX IF NOT EXISTS c360_insight_drafts_company_idx
  ON c360_insight_drafts (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS c360_insight_drafts_customer_idx
  ON c360_insight_drafts (company_id, customer_id);

CREATE INDEX IF NOT EXISTS c360_insight_drafts_status_idx
  ON c360_insight_drafts (company_id, status);

CREATE TABLE IF NOT EXISTS c360_aura_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target c360_aura_target NOT NULL,
  status c360_aura_status NOT NULL DEFAULT 'open',
  title text NOT NULL,
  insight text NOT NULL,
  href text,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS c360_aura_insights_company_idx
  ON c360_aura_insights (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS c360_aura_insights_status_idx
  ON c360_aura_insights (company_id, status);
