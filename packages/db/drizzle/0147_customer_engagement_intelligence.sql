-- Customer Engagement Intelligence (Department 7.2)
-- Drafts only — never auto-send. No fake data.

DO $$ BEGIN
  CREATE TYPE cei_draft_kind AS ENUM (
    'notification','eta_update','review_request','satisfaction_follow_up','follow_up','maintenance_reminder'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN ALTER TYPE cei_draft_kind ADD VALUE IF NOT EXISTS 'follow_up'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE cei_draft_kind ADD VALUE IF NOT EXISTS 'maintenance_reminder'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE cei_draft_status AS ENUM ('draft','pending_approval','approved','rejected','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE cei_channel AS ENUM ('email','sms','portal','whatsapp_business','other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS cei_outreach_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind cei_draft_kind NOT NULL,
  status cei_draft_status NOT NULL DEFAULT 'draft',
  channel cei_channel NOT NULL DEFAULT 'email',
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  maintenance_plan_id uuid,
  subject text NOT NULL,
  body text NOT NULL,
  auto_send boolean NOT NULL DEFAULT false,
  eta_suggestion_at timestamptz,
  eta_availability text NOT NULL DEFAULT 'unavailable',
  linked_comm_aura_score_id uuid,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cei_outreach_drafts_no_auto_send CHECK (auto_send = false)
);
ALTER TABLE cei_outreach_drafts ADD COLUMN IF NOT EXISTS maintenance_plan_id uuid;
CREATE INDEX IF NOT EXISTS cei_outreach_drafts_queue_idx ON cei_outreach_drafts (company_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS cei_engagement_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  notifications_enabled boolean NOT NULL DEFAULT true,
  eta_updates_enabled boolean NOT NULL DEFAULT true,
  review_requests_enabled boolean NOT NULL DEFAULT true,
  auto_send_enabled boolean NOT NULL DEFAULT false,
  default_channel cei_channel NOT NULL DEFAULT 'email',
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cei_engagement_settings_no_auto_send CHECK (auto_send_enabled = false)
);

CREATE TABLE IF NOT EXISTS cei_comm_score_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  availability text NOT NULL DEFAULT 'unavailable',
  average_score integer,
  message_count integer NOT NULL DEFAULT 0,
  dominant_sentiment text NOT NULL DEFAULT 'unavailable',
  last_communication_at timestamptz,
  source text NOT NULL DEFAULT 'unavailable',
  summary text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cei_comm_score_snapshots_company_customer_uq UNIQUE (company_id, customer_id)
);

CREATE TABLE IF NOT EXISTS cei_relationship_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  availability text NOT NULL DEFAULT 'unavailable',
  relationship_score integer,
  band text NOT NULL DEFAULT 'unavailable',
  job_count integer NOT NULL DEFAULT 0,
  review_count integer NOT NULL DEFAULT 0,
  open_maintenance_plans integer NOT NULL DEFAULT 0,
  components jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text NOT NULL DEFAULT '',
  last_job_at timestamptz,
  last_communication_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cei_relationship_scores_company_customer_uq UNIQUE (company_id, customer_id)
);
