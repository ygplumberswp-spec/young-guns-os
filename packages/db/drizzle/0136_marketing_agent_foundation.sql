-- Marketing Agent Foundation (Department 3.1)
-- Campaigns, content drafts (plumbing/educational templates), goals,
-- recommendations, and analytics from real stored activity only.
-- AI drafts require Owner approval before any publish path.
-- Social platform publish execute is gated — integrations not live.
-- No demo data. Forward-only. Staging-first. Do not apply to production without Owner approval.

DO $$ BEGIN
  CREATE TYPE mkt_agent_channel AS ENUM (
    'facebook',
    'instagram',
    'tiktok',
    'linkedin',
    'google_business',
    'website',
    'email',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE mkt_agent_campaign_status AS ENUM (
    'draft',
    'planned',
    'active',
    'paused',
    'completed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE mkt_agent_content_kind AS ENUM (
    'post_idea',
    'caption',
    'hashtags',
    'campaign_idea',
    'seasonal_promo',
    'educational',
    'plumbing_tip'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE mkt_agent_draft_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'cancelled',
    'publish_gated'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE mkt_agent_goal_status AS ENUM (
    'active',
    'completed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE mkt_agent_recommendation_kind AS ENUM (
    'campaign_idea',
    'content_plan',
    'seasonal_promo',
    'channel_focus',
    'performance_review',
    'aura_handoff'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE mkt_agent_recommendation_status AS ENUM (
    'pending_approval',
    'approved',
    'rejected',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS mkt_agent_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  objective text NOT NULL,
  status mkt_agent_campaign_status NOT NULL DEFAULT 'draft',
  channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  start_date timestamptz,
  end_date timestamptz,
  goal_id uuid,
  notes text,
  auto_publish boolean NOT NULL DEFAULT false,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mkt_agent_campaigns_company_idx
  ON mkt_agent_campaigns (company_id);
CREATE INDEX IF NOT EXISTS mkt_agent_campaigns_company_status_idx
  ON mkt_agent_campaigns (company_id, status);

CREATE TABLE IF NOT EXISTS mkt_agent_content_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES mkt_agent_campaigns(id) ON DELETE SET NULL,
  content_kind mkt_agent_content_kind NOT NULL,
  channel mkt_agent_channel NOT NULL,
  status mkt_agent_draft_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL,
  hashtags jsonb NOT NULL DEFAULT '[]'::jsonb,
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

CREATE INDEX IF NOT EXISTS mkt_agent_content_drafts_company_idx
  ON mkt_agent_content_drafts (company_id);
CREATE INDEX IF NOT EXISTS mkt_agent_content_drafts_company_status_idx
  ON mkt_agent_content_drafts (company_id, status);

CREATE TABLE IF NOT EXISTS mkt_agent_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  status mkt_agent_goal_status NOT NULL DEFAULT 'active',
  target_metric text,
  current_value integer,
  target_value integer,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mkt_agent_goals_company_idx
  ON mkt_agent_goals (company_id);

CREATE TABLE IF NOT EXISTS mkt_agent_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind mkt_agent_recommendation_kind NOT NULL,
  status mkt_agent_recommendation_status NOT NULL DEFAULT 'pending_approval',
  title text NOT NULL,
  recommendation text NOT NULL,
  channel mkt_agent_channel,
  campaign_id uuid REFERENCES mkt_agent_campaigns(id) ON DELETE SET NULL,
  auto_executed boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mkt_agent_recommendations_company_idx
  ON mkt_agent_recommendations (company_id);
CREATE INDEX IF NOT EXISTS mkt_agent_recommendations_company_status_idx
  ON mkt_agent_recommendations (company_id, status);
