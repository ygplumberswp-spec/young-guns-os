-- Call Intelligence Engine (Department 9.2)
-- Extends Voice AI Receptionist Foundation + core voice sessions.
-- Call summaries, customer history lookup, approval-gated lead drafts,
-- sentiment, and aggregated insights from real call records only.
-- No fake calls/leads. No automatic customer communication.
-- call_session_id is a logical link to vair_call_sessions (no hard FK).
-- Forward-only. Staging-first. Do not apply to production without Owner approval.
-- Never touch Yoco 0123.

DO $$ BEGIN
  CREATE TYPE ci_lead_kind AS ENUM (
    'new_enquiry',
    'service_request',
    'potential_job',
    'urgent_opportunity',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ci_lead_draft_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ci_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  summaries_enabled boolean NOT NULL DEFAULT true,
  sentiment_enabled boolean NOT NULL DEFAULT true,
  insights_enabled boolean NOT NULL DEFAULT true,
  lead_extraction_enabled boolean NOT NULL DEFAULT true,
  auto_send_enabled boolean NOT NULL DEFAULT false,
  lead_drafts_require_owner_approval boolean NOT NULL DEFAULT true,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ci_settings_no_auto_send CHECK (auto_send_enabled = false),
  CONSTRAINT ci_settings_lead_approval CHECK (lead_drafts_require_owner_approval = true)
);

CREATE UNIQUE INDEX IF NOT EXISTS ci_settings_company_uidx
  ON ci_settings (company_id);

CREATE TABLE IF NOT EXISTS ci_call_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  call_session_id uuid,
  voice_session_id uuid REFERENCES voice_sessions(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  availability text NOT NULL DEFAULT 'unavailable',
  summary text,
  key_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  customer_requests jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  follow_up_recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  transcript_turn_count integer NOT NULL DEFAULT 0,
  sentiment text NOT NULL DEFAULT 'unavailable',
  sentiment_availability text NOT NULL DEFAULT 'unavailable',
  urgency text NOT NULL DEFAULT 'unavailable',
  priority text NOT NULL DEFAULT 'unavailable',
  sentiment_rationale text,
  invented boolean NOT NULL DEFAULT false,
  source_text_hash text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ci_call_analyses_no_invented CHECK (invented = false)
);

CREATE INDEX IF NOT EXISTS ci_call_analyses_company_created_idx
  ON ci_call_analyses (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ci_call_analyses_company_session_idx
  ON ci_call_analyses (company_id, call_session_id);

CREATE TABLE IF NOT EXISTS ci_lead_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind ci_lead_kind NOT NULL DEFAULT 'other',
  status ci_lead_draft_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL,
  call_session_id uuid,
  voice_session_id uuid REFERENCES voice_sessions(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  contact_name text,
  contact_phone text,
  contact_email text,
  auto_executed boolean NOT NULL DEFAULT false,
  auto_send boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ci_lead_drafts_no_auto_execute CHECK (auto_executed = false),
  CONSTRAINT ci_lead_drafts_no_auto_send CHECK (auto_send = false)
);

CREATE INDEX IF NOT EXISTS ci_lead_drafts_company_status_idx
  ON ci_lead_drafts (company_id, status);

CREATE INDEX IF NOT EXISTS ci_lead_drafts_company_created_idx
  ON ci_lead_drafts (company_id, created_at DESC);
