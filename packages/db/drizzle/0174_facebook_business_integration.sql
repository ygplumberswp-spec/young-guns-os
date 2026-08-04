-- Facebook Business Integration (TITAN V1.0 Phase 3).
-- Live Meta OAuth, Page connection, approval-gated content workspace,
-- publishing with duplicate-safe retries, comments, Facebook-originated leads,
-- real Graph insights, and post-to-payment attribution.
--
-- Access tokens live only in fb_connections.credentials_encrypted
-- (AES-256-GCM via INTEGRATIONS_ENCRYPTION_KEY) and are never copied into
-- metadata, event or audit rows.
--
-- The fb_ prefix keeps this distinct from the generic social_media_* foundation
-- (migration 0137), which is left unchanged.

DO $$ BEGIN
  CREATE TYPE fb_connection_state AS ENUM (
    'configuration_required',
    'disconnected',
    'connected',
    'partial',
    'missing_permission',
    'reauthorisation_required',
    'expired',
    'provider_unavailable'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE fb_content_status AS ENUM (
    'draft',
    'in_review',
    'approved',
    'scheduled',
    'publishing',
    'published',
    'failed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE fb_content_type AS ENUM ('text', 'link', 'photo', 'multi_photo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE fb_comment_classification AS ENUM (
    'enquiry',
    'complaint',
    'praise',
    'question',
    'spam',
    'general'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE fb_reply_status AS ENUM (
    'draft',
    'in_review',
    'approved',
    'sending',
    'sent',
    'failed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE fb_lead_source AS ENUM ('lead_ad', 'messenger', 'comment', 'utm_link');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE fb_lead_stage AS ENUM (
    'imported',
    'matched',
    'classified',
    'assigned',
    'reply_drafted',
    'reply_approved',
    'responded',
    'converted',
    'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE fb_sync_status AS ENUM ('queued', 'running', 'succeeded', 'partial', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE fb_insight_source AS ENUM ('organic', 'paid', 'combined', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS fb_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  state fb_connection_state NOT NULL DEFAULT 'disconnected',
  page_id text,
  page_name text,
  page_url text,
  page_category text,
  credentials_encrypted text,
  token_expires_at timestamptz,
  granted_permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_verified_at timestamptz,
  last_verification_ok boolean,
  last_verification_auth_error boolean NOT NULL DEFAULT false,
  last_verification_permission_error boolean NOT NULL DEFAULT false,
  last_verification_provider_unavailable boolean NOT NULL DEFAULT false,
  last_verification_message text,
  last_synced_at timestamptz,
  webhook_verify_token_hash text,
  webhook_subscribed_at timestamptz,
  connected_at timestamptz,
  connected_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  disconnected_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fb_connections_page_idx ON fb_connections (company_id, page_id);

CREATE TABLE IF NOT EXISTS fb_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state_hash text NOT NULL UNIQUE,
  return_path text,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fb_oauth_states_expiry_idx ON fb_oauth_states (expires_at);

CREATE TABLE IF NOT EXISTS fb_connection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES fb_connections(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  state_before fb_connection_state,
  state_after fb_connection_state,
  message text,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fb_connection_events_company_idx
  ON fb_connection_events (company_id, created_at);

CREATE TABLE IF NOT EXISTS fb_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES fb_connections(id) ON DELETE SET NULL,
  status fb_content_status NOT NULL DEFAULT 'draft',
  content_type fb_content_type NOT NULL DEFAULT 'text',
  title text NOT NULL,
  body text NOT NULL,
  link_url text,
  marketing_draft_id uuid REFERENCES mkt_agent_content_drafts(id) ON DELETE SET NULL,
  scheduled_for timestamptz,
  submitted_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejected_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  rejected_at timestamptz,
  decision_notes text,
  external_post_id text,
  published_at timestamptz,
  publish_attempts integer NOT NULL DEFAULT 0,
  last_attempt_reached_provider boolean NOT NULL DEFAULT false,
  last_publish_error text,
  brand_check_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  privacy_acknowledged_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  privacy_acknowledged_at timestamptz,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fb_content_external_post_unique UNIQUE (company_id, external_post_id)
);

CREATE INDEX IF NOT EXISTS fb_content_status_idx ON fb_content (company_id, status);
CREATE INDEX IF NOT EXISTS fb_content_schedule_idx ON fb_content (status, scheduled_for);

CREATE TABLE IF NOT EXISTS fb_content_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES fb_content(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL,
  storage_key text,
  source_url text,
  source_context text NOT NULL DEFAULT 'upload',
  privacy_review_required boolean NOT NULL DEFAULT true,
  privacy_notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  external_media_id text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fb_content_media_content_idx ON fb_content_media (content_id, position);

-- The unique idempotency key is what makes a retried publish safe: a second
-- request for the same attempt cannot be recorded, so it cannot be sent.
CREATE TABLE IF NOT EXISTS fb_publish_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES fb_content(id) ON DELETE CASCADE,
  attempt integer NOT NULL,
  idempotency_key text NOT NULL,
  requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  succeeded boolean,
  reached_provider boolean NOT NULL DEFAULT false,
  external_post_id text,
  error_code text,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT fb_publish_attempts_key_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS fb_publish_attempts_content_idx
  ON fb_publish_attempts (content_id, attempt);

CREATE TABLE IF NOT EXISTS fb_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES fb_connections(id) ON DELETE SET NULL,
  content_id uuid REFERENCES fb_content(id) ON DELETE SET NULL,
  external_comment_id text NOT NULL,
  external_post_id text,
  parent_external_comment_id text,
  author_name text,
  author_external_id text,
  body text NOT NULL,
  classification fb_comment_classification NOT NULL DEFAULT 'general',
  classification_confident boolean NOT NULL DEFAULT false,
  lead_candidate boolean NOT NULL DEFAULT false,
  answered boolean NOT NULL DEFAULT false,
  occurred_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fb_comments_external_unique UNIQUE (company_id, external_comment_id)
);

CREATE INDEX IF NOT EXISTS fb_comments_unanswered_idx ON fb_comments (company_id, answered);

CREATE TABLE IF NOT EXISTS fb_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES fb_comments(id) ON DELETE CASCADE,
  conversation_id uuid,
  status fb_reply_status NOT NULL DEFAULT 'draft',
  body text NOT NULL,
  aura_generated boolean NOT NULL DEFAULT false,
  approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  sent_at timestamptz,
  external_reply_id text,
  last_error text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fb_replies_status_idx ON fb_replies (company_id, status);

CREATE TABLE IF NOT EXISTS fb_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES fb_connections(id) ON DELETE SET NULL,
  source fb_lead_source NOT NULL,
  stage fb_lead_stage NOT NULL DEFAULT 'imported',
  external_lead_id text,
  external_form_id text,
  comment_id uuid REFERENCES fb_comments(id) ON DELETE SET NULL,
  content_id uuid REFERENCES fb_content(id) ON DELETE SET NULL,
  full_name text,
  email text,
  phone text,
  message text,
  urgency text NOT NULL DEFAULT 'normal',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  duplicate_of_lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  duplicate_outcome text,
  duplicate_reason text,
  review_required boolean NOT NULL DEFAULT false,
  assigned_to_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  responded_at timestamptz,
  received_at timestamptz,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fb_leads_external_unique UNIQUE (company_id, external_lead_id)
);

CREATE INDEX IF NOT EXISTS fb_leads_stage_idx ON fb_leads (company_id, stage);

CREATE TABLE IF NOT EXISTS fb_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  content_id uuid REFERENCES fb_content(id) ON DELETE CASCADE,
  external_post_id text,
  metric_name text NOT NULL,
  metric_value integer NOT NULL,
  source fb_insight_source NOT NULL DEFAULT 'unknown',
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT fb_insights_metric_unique
    UNIQUE (company_id, external_post_id, metric_name, period_start)
);

CREATE TABLE IF NOT EXISTS fb_attribution_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  content_id uuid REFERENCES fb_content(id) ON DELETE CASCADE,
  fb_lead_id uuid REFERENCES fb_leads(id) ON DELETE CASCADE,
  step text NOT NULL,
  entity_id uuid,
  evidence text NOT NULL DEFAULT 'observed',
  occurred_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fb_attribution_step_unique UNIQUE (company_id, content_id, fb_lead_id, step)
);

CREATE TABLE IF NOT EXISTS fb_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES fb_connections(id) ON DELETE SET NULL,
  trigger text NOT NULL DEFAULT 'manual',
  status fb_sync_status NOT NULL DEFAULT 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  comments_ingested integer NOT NULL DEFAULT 0,
  leads_ingested integer NOT NULL DEFAULT 0,
  insights_ingested integer NOT NULL DEFAULT 0,
  skipped_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  message text NOT NULL DEFAULT '',
  requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fb_sync_runs_company_idx ON fb_sync_runs (company_id, created_at);

-- Meta redelivers webhooks it believes were not acknowledged; the dedupe key
-- makes a redelivery a no-op instead of a duplicate lead or comment.
CREATE TABLE IF NOT EXISTS fb_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  external_page_id text,
  field text NOT NULL,
  dedupe_key text NOT NULL,
  signature_valid boolean NOT NULL,
  processed_at timestamptz,
  processing_error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fb_webhook_events_dedupe_unique UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS fb_webhook_events_received_idx ON fb_webhook_events (received_at);

CREATE TABLE IF NOT EXISTS fb_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind text NOT NULL,
  dedupe_key text NOT NULL,
  subject_id text,
  title text NOT NULL,
  body text NOT NULL,
  last_sent_at timestamptz,
  send_count integer NOT NULL DEFAULT 0,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fb_notifications_dedupe_unique UNIQUE (dedupe_key)
);
