-- Department 18: Security Monitoring.
-- Monitoring-layer state only. Security evidence stays in the existing
-- enterprise security tables, which this department reads and never writes.

DO $$ BEGIN
  CREATE TYPE secmon_category AS ENUM (
    'failed_authentication',
    'login_activity',
    'suspicious_session',
    'permission_change',
    'privileged_action',
    'data_access',
    'integration_security',
    'unusual_api_activity',
    'cross_tenant_attempt',
    'ai_guardrail',
    'policy_posture'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE secmon_severity AS ENUM ('critical', 'high', 'medium', 'low', 'info');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE secmon_triage_state AS ENUM (
    'new',
    'acknowledged',
    'investigating',
    'resolved',
    'false_positive'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE secmon_incident_status AS ENUM (
    'open',
    'investigating',
    'contained',
    'resolved',
    'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE secmon_recommended_action AS ENUM (
    'review_account',
    'review_permission_grant',
    'review_session',
    'review_integration',
    'review_api_client',
    'tighten_policy',
    'contact_user'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE secmon_action_decision AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE secmon_event_kind AS ENUM (
    'dashboard_viewed',
    'settings_updated',
    'signal_triaged',
    'incident_opened',
    'incident_updated',
    'recommendation_generated',
    'recommendation_decided',
    'access_denied'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS secmon_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lookback_days integer NOT NULL DEFAULT 30,
  failed_login_threshold integer NOT NULL DEFAULT 5,
  severity_floor secmon_severity NOT NULL DEFAULT 'low',
  group_duplicates boolean NOT NULL DEFAULT true,
  auto_remediation_enabled boolean NOT NULL DEFAULT false,
  expose_secrets_enabled boolean NOT NULL DEFAULT false,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT secmon_settings_lookback_ck CHECK (lookback_days BETWEEN 1 AND 180),
  CONSTRAINT secmon_settings_failed_login_ck CHECK (failed_login_threshold BETWEEN 3 AND 100),
  -- This department may recommend but never remediate on its own.
  CONSTRAINT secmon_settings_no_auto_remediation_ck CHECK (auto_remediation_enabled = false),
  -- Credentials are monitored but never returned, whatever the stored row says.
  CONSTRAINT secmon_settings_no_secret_exposure_ck CHECK (expose_secrets_enabled = false)
);

CREATE UNIQUE INDEX IF NOT EXISTS secmon_settings_company_uidx ON secmon_settings (company_id);

CREATE TABLE IF NOT EXISTS secmon_signal_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  signal_key text NOT NULL,
  category secmon_category NOT NULL,
  triage secmon_triage_state NOT NULL DEFAULT 'new',
  note text,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT secmon_signal_states_key_ck CHECK (length(signal_key) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS secmon_signal_states_company_key_uidx
  ON secmon_signal_states (company_id, signal_key);
CREATE INDEX IF NOT EXISTS secmon_signal_states_company_triage_idx
  ON secmon_signal_states (company_id, triage);

CREATE TABLE IF NOT EXISTS secmon_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reference text NOT NULL,
  title text NOT NULL,
  status secmon_incident_status NOT NULL DEFAULT 'open',
  severity secmon_severity NOT NULL DEFAULT 'medium',
  category secmon_category NOT NULL,
  summary text NOT NULL,
  linked_signal_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  opened_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT secmon_incidents_title_ck CHECK (length(title) > 0),
  CONSTRAINT secmon_incidents_resolved_ck CHECK (
    (status IN ('resolved', 'closed') AND resolved_at IS NOT NULL)
    OR (status NOT IN ('resolved', 'closed') AND resolved_at IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS secmon_incidents_company_reference_uidx
  ON secmon_incidents (company_id, reference);
CREATE INDEX IF NOT EXISTS secmon_incidents_company_status_idx
  ON secmon_incidents (company_id, status);

CREATE TABLE IF NOT EXISTS secmon_action_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  recommendation_key text NOT NULL,
  category secmon_category NOT NULL,
  action secmon_recommended_action NOT NULL,
  severity secmon_severity NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  rationale text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  decision secmon_action_decision NOT NULL DEFAULT 'pending',
  decision_note text,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  executed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A recommendation without cited evidence must not exist.
  CONSTRAINT secmon_action_drafts_evidence_ck CHECK (jsonb_array_length(evidence) > 0),
  -- Approval records a decision. It never executes the operation.
  CONSTRAINT secmon_action_drafts_not_executed_ck CHECK (executed = false),
  CONSTRAINT secmon_action_drafts_decided_ck CHECK (
    (decision = 'pending' AND decided_at IS NULL)
    OR (decision <> 'pending' AND decided_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS secmon_action_drafts_company_key_uidx
  ON secmon_action_drafts (company_id, recommendation_key);
CREATE INDEX IF NOT EXISTS secmon_action_drafts_company_decision_idx
  ON secmon_action_drafts (company_id, decision);

CREATE TABLE IF NOT EXISTS secmon_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_kind secmon_event_kind NOT NULL,
  category secmon_category,
  subject_key text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS secmon_audit_events_company_occurred_idx
  ON secmon_audit_events (company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS secmon_audit_events_company_kind_idx
  ON secmon_audit_events (company_id, event_kind);
