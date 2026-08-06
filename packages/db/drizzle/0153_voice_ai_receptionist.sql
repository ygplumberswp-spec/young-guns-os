-- Voice AI Receptionist Foundation (Department 9.1)
-- Extends voice sessions / enterprise voice reception / CRM / leads / jobs / scheduling.
-- Incoming call handling, caller ID, customer lookup, approval-gated lead create,
-- call routing, SA locale/voice config, always-on human takeover.
-- No fake calls/customers/leads. Honest not_configured without telephony credentials.
-- Forward-only. Staging-first. Do not apply to production without Owner approval.
-- Never touch Yoco 0123.

DO $$ BEGIN
  CREATE TYPE vair_call_session_status AS ENUM (
    'ringing', 'active', 'human_takeover', 'completed', 'missed', 'failed', 'abandoned'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE vair_call_direction AS ENUM ('inbound', 'outbound');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE vair_routing_destination AS ENUM (
    'ai_receptionist', 'human_queue', 'extension', 'voicemail', 'callback'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE vair_approval_kind AS ENUM (
    'lead_create', 'booking_draft', 'routing_change', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE vair_approval_status AS ENUM (
    'draft', 'pending_approval', 'approved', 'rejected', 'cancelled', 'executed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE vair_takeover_reason AS ENUM (
    'caller_request', 'low_confidence', 'emergency', 'operator_initiated', 'policy'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE vair_sa_locale AS ENUM ('en-ZA', 'af-ZA', 'zu-ZA', 'xh-ZA', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS vair_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  receptionist_enabled boolean NOT NULL DEFAULT true,
  human_takeover_always_available boolean NOT NULL DEFAULT true,
  lead_create_requires_approval boolean NOT NULL DEFAULT true,
  booking_execute_requires_approval boolean NOT NULL DEFAULT true,
  default_locale vair_sa_locale NOT NULL DEFAULT 'en-ZA',
  preferred_voice_label text,
  welcome_message text,
  after_hours_message text,
  telephony_provider_key text,
  tts_provider_key text,
  stt_provider_key text,
  notes text,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vair_settings_human_takeover_always CHECK (human_takeover_always_available = true)
);

CREATE UNIQUE INDEX IF NOT EXISTS vair_settings_company_uidx ON vair_settings (company_id);

CREATE TABLE IF NOT EXISTS vair_call_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status vair_call_session_status NOT NULL DEFAULT 'ringing',
  direction vair_call_direction NOT NULL DEFAULT 'inbound',
  caller_phone text,
  caller_name text,
  normalized_phone text,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  voice_session_id uuid REFERENCES voice_sessions(id) ON DELETE SET NULL,
  routing_destination vair_routing_destination,
  human_takeover_active boolean NOT NULL DEFAULT false,
  summary text,
  invented boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vair_call_sessions_no_invented CHECK (invented = false)
);

CREATE INDEX IF NOT EXISTS vair_call_sessions_company_started_idx
  ON vair_call_sessions (company_id, started_at DESC);
CREATE INDEX IF NOT EXISTS vair_call_sessions_company_status_idx
  ON vair_call_sessions (company_id, status);
CREATE INDEX IF NOT EXISTS vair_call_sessions_company_phone_idx
  ON vair_call_sessions (company_id, normalized_phone);

CREATE TABLE IF NOT EXISTS vair_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  rule_key text NOT NULL,
  name text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  destination vair_routing_destination NOT NULL DEFAULT 'ai_receptionist',
  match_criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vair_routing_rules_company_key_uidx
  ON vair_routing_rules (company_id, rule_key);
CREATE INDEX IF NOT EXISTS vair_routing_rules_company_priority_idx
  ON vair_routing_rules (company_id, priority);

CREATE TABLE IF NOT EXISTS vair_approval_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind vair_approval_kind NOT NULL,
  status vair_approval_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL,
  call_session_id uuid REFERENCES vair_call_sessions(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  auto_executed boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  executed_at timestamptz,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vair_approval_drafts_no_auto_execute CHECK (auto_executed = false)
);

CREATE INDEX IF NOT EXISTS vair_approval_drafts_company_status_idx
  ON vair_approval_drafts (company_id, status);
CREATE INDEX IF NOT EXISTS vair_approval_drafts_company_created_idx
  ON vair_approval_drafts (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS vair_takeover_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  call_session_id uuid NOT NULL REFERENCES vair_call_sessions(id) ON DELETE CASCADE,
  reason vair_takeover_reason NOT NULL DEFAULT 'operator_initiated',
  notes text,
  taken_over_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  taken_over_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vair_takeover_events_company_session_idx
  ON vair_takeover_events (company_id, call_session_id);
