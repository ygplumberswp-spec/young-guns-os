-- Row 108 — Bank connection / intake foundation
-- Provider-neutral. No payment initiation. No Row109–116.
-- Staging: Xero writes = 0; money movement = 0.

CREATE TABLE IF NOT EXISTS bank_feed_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bank_name text NOT NULL DEFAULT 'FNB',
  provider text NOT NULL DEFAULT 'manual_statement',
  mode text NOT NULL DEFAULT 'CONTROLLED_STATEMENT_IMPORT',
  status text NOT NULL DEFAULT 'NOT_CONFIGURED',
  consent_provider_reference text,
  masked_account_identity text,
  currency text DEFAULT 'ZAR',
  source_type text NOT NULL DEFAULT 'none',
  last_attempted_intake_at timestamptz,
  last_successful_intake_at timestamptz,
  status_reason text,
  -- Server-side token reference only (encrypted vault id). Never plaintext credentials.
  server_token_reference text,
  bank_account_id uuid REFERENCES bank_accounts(id) ON DELETE SET NULL,
  idempotency_key text,
  client_action_id text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_feed_connections_mode_chk CHECK (mode IN (
    'PROVIDER_FEED','CONTROLLED_STATEMENT_IMPORT','NOT_CONFIGURED','PROVIDER_UNAVAILABLE'
  )),
  CONSTRAINT bank_feed_connections_status_chk CHECK (status IN (
    'NOT_CONFIGURED','AWAITING_CONSENT','CONNECTED_READ_ONLY','STATEMENT_IMPORT_ONLY',
    'TOKEN_EXPIRED','PROVIDER_ERROR','DISCONNECTED'
  )),
  CONSTRAINT bank_feed_connections_source_chk CHECK (source_type IN (
    'provider_consent_token','controlled_statement_import','none'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS bank_feed_connections_company_idempotency_uidx
  ON bank_feed_connections (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS bank_feed_connections_company_status_idx
  ON bank_feed_connections (company_id, status);

CREATE TABLE IF NOT EXISTS bank_feed_intake_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES bank_feed_connections(id) ON DELETE SET NULL,
  stage text NOT NULL,
  filename text,
  file_hash_sha256 text,
  mime_type text,
  format_supported boolean NOT NULL DEFAULT false,
  row_count integer,
  original_file_preserved boolean NOT NULL DEFAULT true,
  auto_matching_performed boolean NOT NULL DEFAULT false,
  reconciliation_mutated boolean NOT NULL DEFAULT false,
  jpe_posted boolean NOT NULL DEFAULT false,
  xero_writes integer NOT NULL DEFAULT 0,
  payment_initiated boolean NOT NULL DEFAULT false,
  balance_fabricated boolean NOT NULL DEFAULT false,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_feed_intake_events_stage_chk CHECK (stage IN (
    'upload','validate','preview','confirm_pending','rejected','confirmed'
  )),
  CONSTRAINT bank_feed_intake_events_no_side_effects_chk CHECK (
    auto_matching_performed = false
    AND reconciliation_mutated = false
    AND jpe_posted = false
    AND xero_writes = 0
    AND payment_initiated = false
    AND balance_fabricated = false
  )
);

CREATE INDEX IF NOT EXISTS bank_feed_intake_events_company_idx
  ON bank_feed_intake_events (company_id, created_at DESC);
