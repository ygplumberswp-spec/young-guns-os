-- Social Media Integration Layer (Department 3.2)
-- Facebook, Instagram, TikTok, LinkedIn, Google Business Profile:
-- connection settings, honest status/health, permissions, sync foundation,
-- activity tracking, monitoring storage (real synced items only),
-- and approval-gated outbound drafts (never auto-post / auto-reply).
-- Extends Marketing Agent Foundation (0136). No demo social data.
-- Forward-only. Staging-first. Do not apply to production without Owner approval.

DO $$ BEGIN
  CREATE TYPE social_platform AS ENUM (
    'facebook',
    'instagram',
    'tiktok',
    'linkedin',
    'google_business'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE social_connection_status AS ENUM (
    'not_configured',
    'awaiting_credentials',
    'connected',
    'degraded',
    'disconnected',
    'error'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE social_item_kind AS ENUM (
    'comment',
    'message',
    'mention',
    'review',
    'engagement_event'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE social_sync_status AS ENUM (
    'idle',
    'queued',
    'running',
    'succeeded',
    'failed',
    'skipped'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE social_outbound_kind AS ENUM (
    'publish_post',
    'reply_comment',
    'reply_message',
    'reply_review'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE social_outbound_draft_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'cancelled',
    'publish_gated'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS social_media_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  platform social_platform NOT NULL,
  display_name text NOT NULL,
  external_account_id text,
  page_or_profile_url text,
  status social_connection_status NOT NULL DEFAULT 'not_configured',
  credentials_encrypted text,
  sync_enabled boolean NOT NULL DEFAULT false,
  read_comments boolean NOT NULL DEFAULT true,
  read_messages boolean NOT NULL DEFAULT true,
  read_mentions boolean NOT NULL DEFAULT true,
  read_reviews boolean NOT NULL DEFAULT true,
  read_engagement boolean NOT NULL DEFAULT true,
  allow_outbound_publish boolean NOT NULL DEFAULT false,
  allow_auto_reply boolean NOT NULL DEFAULT false,
  last_synced_at timestamptz,
  last_health_check_at timestamptz,
  last_health_message text,
  last_error text,
  connected_at timestamptz,
  disconnected_at timestamptz,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_media_connections_company_platform_uq UNIQUE (company_id, platform)
);

CREATE INDEX IF NOT EXISTS social_media_connections_company_idx
  ON social_media_connections (company_id);
CREATE INDEX IF NOT EXISTS social_media_connections_company_status_idx
  ON social_media_connections (company_id, status);

CREATE TABLE IF NOT EXISTS social_media_connection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES social_media_connections(id) ON DELETE SET NULL,
  platform social_platform,
  event_type text NOT NULL,
  status_before text,
  status_after text,
  message text,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_media_connection_events_company_idx
  ON social_media_connection_events (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS social_media_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES social_media_connections(id) ON DELETE SET NULL,
  platform social_platform NOT NULL,
  status social_sync_status NOT NULL DEFAULT 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  items_ingested integer NOT NULL DEFAULT 0,
  message text NOT NULL DEFAULT '',
  requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_media_sync_runs_company_idx
  ON social_media_sync_runs (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS social_media_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES social_media_connections(id) ON DELETE SET NULL,
  platform social_platform NOT NULL,
  item_kind social_item_kind NOT NULL,
  external_item_id text,
  author_name text,
  body text NOT NULL,
  occurred_at timestamptz,
  engagement_score integer,
  sync_run_id uuid REFERENCES social_media_sync_runs(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_media_items_company_idx
  ON social_media_items (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS social_media_items_company_kind_idx
  ON social_media_items (company_id, item_kind);

CREATE TABLE IF NOT EXISTS social_media_outbound_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES social_media_connections(id) ON DELETE SET NULL,
  platform social_platform NOT NULL,
  outbound_kind social_outbound_kind NOT NULL,
  status social_outbound_draft_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL,
  target_item_id uuid REFERENCES social_media_items(id) ON DELETE SET NULL,
  marketing_draft_id uuid REFERENCES mkt_agent_content_drafts(id) ON DELETE SET NULL,
  auto_publish boolean NOT NULL DEFAULT false,
  social_publish_available boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_media_outbound_drafts_company_idx
  ON social_media_outbound_drafts (company_id);
CREATE INDEX IF NOT EXISTS social_media_outbound_drafts_company_status_idx
  ON social_media_outbound_drafts (company_id, status);
