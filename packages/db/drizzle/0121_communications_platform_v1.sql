-- TITAN Communications Platform V1 foundation
-- Business Gmail + Business WhatsApp + optional Personal WhatsApp (owner-scoped).
-- Personal is private by default, never auto-imported, never in business search indexes.
-- Forward-only. Do not apply to production from this change set without Owner approval.

DO $$ BEGIN
  CREATE TYPE comm_platform_account_kind AS ENUM (
    'business_gmail',
    'business_whatsapp',
    'personal_whatsapp'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE comm_platform_channel AS ENUM ('email', 'whatsapp');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE comm_platform_capability_state AS ENUM (
    'not_configured',
    'disconnected',
    'pending',
    'connected',
    'error',
    'degraded'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE comm_platform_link_target_type AS ENUM (
    'customer',
    'job',
    'quote',
    'invoice',
    'property',
    'supplier',
    'staff'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE comm_platform_participant_kind AS ENUM (
    'customer',
    'supplier',
    'staff',
    'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE comm_platform_import_decision_action AS ENUM (
    'import',
    'import_from',
    'create_customer',
    'link',
    'keep_private'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE comm_platform_draft_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'executed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Connection / credential accounts (Gmail tokens encrypted; WA may link existing connections)
CREATE TABLE IF NOT EXISTS comm_platform_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_kind comm_platform_account_kind NOT NULL,
  label text NOT NULL,
  external_address text,
  -- Owner-scoped for personal_whatsapp; NULL for business accounts
  owner_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  -- Optional links into existing integration surfaces
  integration_connection_id uuid REFERENCES integration_connections(id) ON DELETE SET NULL,
  whatsapp_connection_id uuid REFERENCES whatsapp_connections(id) ON DELETE SET NULL,
  credentials_encrypted text,
  status comm_platform_capability_state NOT NULL DEFAULT 'not_configured',
  private_by_default boolean NOT NULL DEFAULT false,
  sync_enabled boolean NOT NULL DEFAULT false,
  retention_days integer,
  last_test_at timestamptz,
  last_test_status text,
  last_test_message text,
  last_error text,
  connected_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comm_platform_accounts_personal_owner_chk CHECK (
    (account_kind = 'personal_whatsapp' AND owner_user_id IS NOT NULL AND private_by_default = true)
    OR (account_kind <> 'personal_whatsapp')
  )
);

-- One business Gmail / business WA per company; personal WA one per owner user
CREATE UNIQUE INDEX IF NOT EXISTS comm_platform_accounts_business_kind_uidx
  ON comm_platform_accounts (company_id, account_kind)
  WHERE account_kind IN ('business_gmail', 'business_whatsapp');

CREATE UNIQUE INDEX IF NOT EXISTS comm_platform_accounts_personal_owner_uidx
  ON comm_platform_accounts (company_id, owner_user_id)
  WHERE account_kind = 'personal_whatsapp';

CREATE INDEX IF NOT EXISTS comm_platform_accounts_company_idx
  ON comm_platform_accounts (company_id, account_kind);

-- Unified inbox index — BUSINESS CHANNELS ONLY (personal never inserted here)
CREATE TABLE IF NOT EXISTS comm_platform_inbox_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id uuid REFERENCES comm_platform_accounts(id) ON DELETE SET NULL,
  account_kind comm_platform_account_kind NOT NULL,
  channel comm_platform_channel NOT NULL,
  external_thread_id text,
  external_message_id text,
  subject text,
  preview text,
  participant_label text,
  participant_kind comm_platform_participant_kind NOT NULL DEFAULT 'unknown',
  folder text NOT NULL DEFAULT 'inbox',
  unread boolean NOT NULL DEFAULT false,
  urgent boolean NOT NULL DEFAULT false,
  direction text NOT NULL DEFAULT 'inbound',
  link_target_type comm_platform_link_target_type,
  link_target_id uuid,
  assigned_job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  attachment_count integer NOT NULL DEFAULT 0,
  labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comm_platform_inbox_business_only_chk CHECK (
    account_kind IN ('business_gmail', 'business_whatsapp')
  )
);

CREATE INDEX IF NOT EXISTS comm_platform_inbox_company_occurred_idx
  ON comm_platform_inbox_index (company_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS comm_platform_inbox_company_unread_idx
  ON comm_platform_inbox_index (company_id, unread)
  WHERE unread = true;

CREATE INDEX IF NOT EXISTS comm_platform_inbox_company_channel_idx
  ON comm_platform_inbox_index (company_id, channel, account_kind);

CREATE INDEX IF NOT EXISTS comm_platform_inbox_job_idx
  ON comm_platform_inbox_index (company_id, assigned_job_id)
  WHERE assigned_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS comm_platform_inbox_link_idx
  ON comm_platform_inbox_index (company_id, link_target_type, link_target_id)
  WHERE link_target_id IS NOT NULL;

-- Personal WhatsApp isolation — owner-scoped threads, NEVER in business search indexes
CREATE TABLE IF NOT EXISTS comm_platform_personal_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES comm_platform_accounts(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_phone text,
  contact_name text,
  thread_key text NOT NULL,
  last_message_preview text,
  last_message_at timestamptz,
  unread boolean NOT NULL DEFAULT false,
  attachment_count integer NOT NULL DEFAULT 0,
  private_by_default boolean NOT NULL DEFAULT true,
  excluded_from_business_search boolean NOT NULL DEFAULT true,
  import_consent_granted boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comm_platform_personal_always_private_chk CHECK (
    private_by_default = true AND excluded_from_business_search = true
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS comm_platform_personal_threads_key_uidx
  ON comm_platform_personal_threads (company_id, owner_user_id, thread_key);

CREATE INDEX IF NOT EXISTS comm_platform_personal_threads_owner_idx
  ON comm_platform_personal_threads (company_id, owner_user_id, last_message_at DESC);

-- Import consent / smart-detection decisions (owner-only; nothing auto-imports)
CREATE TABLE IF NOT EXISTS comm_platform_import_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  decided_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  personal_thread_id uuid REFERENCES comm_platform_personal_threads(id) ON DELETE SET NULL,
  contact_phone text,
  contact_name text,
  action comm_platform_import_decision_action NOT NULL,
  link_target_type comm_platform_link_target_type,
  link_target_id uuid,
  import_from_at timestamptz,
  notes text,
  -- Explicit: recording a decision does not auto-import messages
  auto_imported boolean NOT NULL DEFAULT false,
  executed_import boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comm_platform_import_no_auto_chk CHECK (auto_imported = false)
);

CREATE INDEX IF NOT EXISTS comm_platform_import_decisions_company_idx
  ON comm_platform_import_decisions (company_id, created_at DESC);

-- Gmail drafts (send requires explicit approval path — draft → approve → execute)
CREATE TABLE IF NOT EXISTS comm_platform_gmail_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id uuid REFERENCES comm_platform_accounts(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status comm_platform_draft_status NOT NULL DEFAULT 'draft',
  to_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  bcc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text NOT NULL DEFAULT '',
  body_text text NOT NULL DEFAULT '',
  reply_to_message_id text,
  forward_of_message_id text,
  label_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  executed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comm_platform_gmail_drafts_company_idx
  ON comm_platform_gmail_drafts (company_id, status, created_at DESC);
