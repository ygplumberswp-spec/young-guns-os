-- Sales Follow-up Intelligence (Department 10.2)
-- Quote follow-up reminders/scheduling/response tracking, objection handling drafts,
-- and reactivation campaign drafts from real quotes/customers/jobs.
-- Extends Sales Intelligence Agent Foundation (0155). Migration 0159 (0157/0158 taken by concurrent modules). Drafts only — never auto-send.
-- No fake campaigns. Forward-only. Staging-first.
-- Does NOT touch Yoco webhook migration 0123.

DO $$ BEGIN
  CREATE TYPE sfi_draft_kind AS ENUM (
    'quote_reminder',
    'quote_follow_up',
    'objection_response',
    'price_objection',
    'value_explanation',
    'reactivation',
    'maintenance_opportunity',
    'service_opportunity'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sfi_draft_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sfi_channel AS ENUM (
    'email',
    'sms',
    'portal',
    'whatsapp_business',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sfi_customer_response_status AS ENUM (
    'none',
    'awaiting',
    'responded',
    'no_response',
    'unavailable'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sfi_objection_category AS ENUM (
    'price',
    'timing',
    'scope',
    'trust',
    'competitor',
    'other',
    'unavailable'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS sfi_outreach_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind sfi_draft_kind NOT NULL,
  status sfi_draft_status NOT NULL DEFAULT 'draft',
  channel sfi_channel NOT NULL DEFAULT 'email',
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  maintenance_plan_id uuid,
  subject text NOT NULL,
  body text NOT NULL,
  scheduled_follow_up_at timestamptz,
  customer_response_status sfi_customer_response_status NOT NULL DEFAULT 'none',
  objection_category sfi_objection_category,
  auto_send boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sfi_outreach_drafts_no_auto_send CHECK (auto_send = false)
);

CREATE INDEX IF NOT EXISTS sfi_outreach_drafts_queue_idx
  ON sfi_outreach_drafts (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS sfi_outreach_drafts_customer_idx
  ON sfi_outreach_drafts (company_id, customer_id);
CREATE INDEX IF NOT EXISTS sfi_outreach_drafts_quote_idx
  ON sfi_outreach_drafts (company_id, quote_id);

CREATE TABLE IF NOT EXISTS sfi_quote_response_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  response_status sfi_customer_response_status NOT NULL DEFAULT 'none',
  scheduled_follow_up_at timestamptz,
  last_response_at timestamptz,
  notes text,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sfi_quote_response_tracking_company_quote_uq UNIQUE (company_id, quote_id)
);

CREATE INDEX IF NOT EXISTS sfi_quote_response_tracking_company_idx
  ON sfi_quote_response_tracking (company_id);

CREATE TABLE IF NOT EXISTS sfi_followup_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  quote_reminders_enabled boolean NOT NULL DEFAULT true,
  objection_drafts_enabled boolean NOT NULL DEFAULT true,
  reactivation_drafts_enabled boolean NOT NULL DEFAULT true,
  auto_send_enabled boolean NOT NULL DEFAULT false,
  default_channel sfi_channel NOT NULL DEFAULT 'email',
  stale_quote_days integer NOT NULL DEFAULT 7,
  reactivation_idle_days integer NOT NULL DEFAULT 90,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sfi_followup_settings_no_auto_send CHECK (auto_send_enabled = false)
);
