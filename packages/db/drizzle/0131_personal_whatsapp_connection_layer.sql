-- Personal WhatsApp Connection Layer
-- Owner number linking, secure credential pairing, connection status,
-- reconnect handling, session health, and privacy permissions.
-- Extends Communications Platform personal_whatsapp accounts (0121).
-- Does not replace Business WhatsApp or invent demo sessions.
-- Forward-only. Staging-first. Do not apply to production without Owner approval.

DO $$ BEGIN
  CREATE TYPE personal_wa_connection_status AS ENUM (
    'not_configured',
    'awaiting_credentials',
    'pairing',
    'connected',
    'degraded',
    'reconnect_required',
    'disconnected',
    'error'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE personal_wa_pairing_mode AS ENUM (
    'credential',
    'device_link_future'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS personal_wa_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES comm_platform_accounts(id) ON DELETE SET NULL,
  linked_phone_e164 text,
  display_label text NOT NULL DEFAULT 'Personal WhatsApp',
  status personal_wa_connection_status NOT NULL DEFAULT 'not_configured',
  pairing_mode personal_wa_pairing_mode NOT NULL DEFAULT 'credential',
  pairing_started_at timestamptz,
  pairing_expires_at timestamptz,
  paired_at timestamptz,
  last_connected_at timestamptz,
  last_disconnected_at timestamptz,
  last_heartbeat_at timestamptz,
  last_health_check_at timestamptz,
  last_health_status text,
  last_health_message text,
  last_error text,
  reconnect_attempts integer NOT NULL DEFAULT 0,
  reconnect_requested_at timestamptz,
  session_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  private_by_default boolean NOT NULL DEFAULT true,
  exclude_from_business_search boolean NOT NULL DEFAULT true,
  never_auto_import boolean NOT NULL DEFAULT true,
  require_approval_to_send boolean NOT NULL DEFAULT true,
  sync_enabled boolean NOT NULL DEFAULT false,
  retention_days integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personal_wa_connections_company_owner_uq UNIQUE (company_id, owner_user_id)
);

CREATE INDEX IF NOT EXISTS personal_wa_connections_company_owner_idx
  ON personal_wa_connections (company_id, owner_user_id);

CREATE INDEX IF NOT EXISTS personal_wa_connections_status_idx
  ON personal_wa_connections (company_id, status);

CREATE TABLE IF NOT EXISTS personal_wa_connection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES personal_wa_connections(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  status_before text,
  status_after text,
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS personal_wa_connection_events_connection_idx
  ON personal_wa_connection_events (company_id, connection_id, created_at DESC);

CREATE INDEX IF NOT EXISTS personal_wa_connection_events_owner_idx
  ON personal_wa_connection_events (company_id, owner_user_id, created_at DESC);
