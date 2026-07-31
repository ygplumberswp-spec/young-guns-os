-- UX-J: Hybrid n8n orchestration — tenant connector, workflow registry, executions, replay protection
-- Forward-only. Disposable / staging only — never apply to live from this change set.

DO $$ BEGIN
  CREATE TYPE n8n_connection_status AS ENUM (
    'not_configured',
    'configured_unverified',
    'connected_usable',
    'temporarily_unavailable',
    'failed_degraded',
    'disconnected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE n8n_execution_status AS ENUM (
    'queued',
    'dispatched',
    'running',
    'succeeded',
    'failed',
    'timed_out',
    'cancelled',
    'awaiting_approval'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE n8n_workflow_status AS ENUM (
    'draft',
    'active',
    'paused',
    'disabled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS n8n_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status n8n_connection_status NOT NULL DEFAULT 'not_configured',
  base_url text,
  credentials_encrypted text,
  webhook_secret_hash text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_verified_at timestamptz,
  last_error text,
  connected_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT n8n_connections_company_uidx UNIQUE (company_id)
);

CREATE TABLE IF NOT EXISTS n8n_workflow_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  native_workflow_id uuid REFERENCES workflows(id) ON DELETE SET NULL,
  external_workflow_key text NOT NULL,
  name text NOT NULL,
  purpose text,
  trigger_event text NOT NULL,
  status n8n_workflow_status NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  requires_approval boolean NOT NULL DEFAULT true,
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  last_verified_at timestamptz,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT n8n_workflow_registrations_company_key_uidx UNIQUE (company_id, external_workflow_key)
);

CREATE INDEX IF NOT EXISTS n8n_workflow_registrations_company_status_idx
  ON n8n_workflow_registrations (company_id, status);

CREATE TABLE IF NOT EXISTS n8n_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workflow_registration_id uuid NOT NULL REFERENCES n8n_workflow_registrations(id) ON DELETE CASCADE,
  correlation_id text NOT NULL,
  idempotency_key text NOT NULL,
  trigger_event text NOT NULL,
  status n8n_execution_status NOT NULL DEFAULT 'queued',
  workflow_version integer NOT NULL DEFAULT 1,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  provider_accepted boolean NOT NULL DEFAULT false,
  business_outcome text,
  sanitized_error text,
  payload_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_retry_at timestamptz,
  dispatched_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  cancelled_at timestamptz,
  approved_at timestamptz,
  approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT n8n_executions_company_idempotency_uidx UNIQUE (company_id, idempotency_key),
  CONSTRAINT n8n_executions_company_correlation_uidx UNIQUE (company_id, correlation_id)
);

CREATE INDEX IF NOT EXISTS n8n_executions_company_status_idx
  ON n8n_executions (company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS n8n_executions_company_retry_idx
  ON n8n_executions (company_id, next_retry_at)
  WHERE next_retry_at IS NOT NULL AND status IN ('queued', 'failed', 'timed_out');

CREATE TABLE IF NOT EXISTS n8n_callback_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  execution_id uuid REFERENCES n8n_executions(id) ON DELETE SET NULL,
  callback_id text NOT NULL,
  correlation_id text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT n8n_callback_receipts_company_callback_uidx UNIQUE (company_id, callback_id)
);

CREATE INDEX IF NOT EXISTS n8n_callback_receipts_company_correlation_idx
  ON n8n_callback_receipts (company_id, correlation_id);

CREATE TABLE IF NOT EXISTS n8n_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS n8n_audit_events_company_created_idx
  ON n8n_audit_events (company_id, created_at DESC);
