-- Content & Reputation Intelligence (Department 3.3)
-- Extends Marketing Agent + Social Media Integration.
-- Content quality, reputation/reviews, Owner-entered competitors, AURA insights.
-- No auto-publish / auto-reply. No demo data.
-- Forward-only. Staging-first. Do not apply to production without Owner approval.

DO $$ BEGIN
  CREATE TYPE cri_content_category AS ENUM (
    'content_idea',
    'caption',
    'hashtags',
    'campaign_idea',
    'seasonal',
    'education',
    'customer_focused',
    'maintenance_reminder',
    'geyser_education',
    'before_after',
    'trust_building',
    'video_review',
    'trend',
    'improvement'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE cri_suggestion_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE cri_sentiment AS ENUM (
    'positive',
    'neutral',
    'negative',
    'mixed',
    'unavailable'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE cri_review_source AS ENUM (
    'owner_entered',
    'social_monitoring',
    'cx',
    'google_business',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE cri_observation_kind AS ENUM (
    'industry_trend',
    'market_observation',
    'pricing_observation',
    'competitor_note',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE cri_insight_target AS ENUM (
    'command_centre',
    'executive_dashboard',
    'marketing_agent',
    'social_media',
    'communication_timeline',
    'customer_360',
    'cx'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE cri_insight_status AS ENUM (
    'open',
    'acknowledged',
    'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE cri_channel AS ENUM (
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

CREATE TABLE IF NOT EXISTS cri_content_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category cri_content_category NOT NULL,
  channel cri_channel,
  status cri_suggestion_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL,
  hashtags jsonb NOT NULL DEFAULT '[]'::jsonb,
  marketing_draft_id uuid REFERENCES mkt_agent_content_drafts(id) ON DELETE SET NULL,
  quality_score integer,
  quality_availability text NOT NULL DEFAULT 'unavailable',
  quality_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  auto_publish boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cri_content_suggestions_company_idx
  ON cri_content_suggestions (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cri_content_suggestions_status_idx
  ON cri_content_suggestions (company_id, status);

CREATE TABLE IF NOT EXISTS cri_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source cri_review_source NOT NULL DEFAULT 'owner_entered',
  platform text,
  author_name text,
  rating integer,
  body text NOT NULL,
  occurred_at timestamptz,
  sentiment cri_sentiment NOT NULL DEFAULT 'unavailable',
  sentiment_confidence integer,
  social_item_id uuid,
  customer_id uuid,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cri_reviews_company_idx
  ON cri_reviews (company_id, created_at DESC);

-- Optional FK when Social Media Integration tables exist (0137).
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'social_media_items'
  ) THEN
    ALTER TABLE cri_reviews
      DROP CONSTRAINT IF EXISTS cri_reviews_social_item_id_fkey;
    ALTER TABLE cri_reviews
      ADD CONSTRAINT cri_reviews_social_item_id_fkey
      FOREIGN KEY (social_item_id) REFERENCES social_media_items(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS cri_review_response_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  review_id uuid NOT NULL REFERENCES cri_reviews(id) ON DELETE CASCADE,
  status cri_suggestion_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL,
  auto_reply boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cri_review_response_drafts_company_idx
  ON cri_review_response_drafts (company_id, status);

CREATE TABLE IF NOT EXISTS cri_competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  website text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cri_competitors_company_idx
  ON cri_competitors (company_id, active);

CREATE TABLE IF NOT EXISTS cri_competitor_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  competitor_id uuid REFERENCES cri_competitors(id) ON DELETE SET NULL,
  kind cri_observation_kind NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  observed_at timestamptz,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cri_competitor_observations_company_idx
  ON cri_competitor_observations (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cri_aura_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target cri_insight_target NOT NULL,
  status cri_insight_status NOT NULL DEFAULT 'open',
  title text NOT NULL,
  insight text NOT NULL,
  href text,
  source_suggestion_id uuid REFERENCES cri_content_suggestions(id) ON DELETE SET NULL,
  source_review_id uuid REFERENCES cri_reviews(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cri_aura_insights_company_idx
  ON cri_aura_insights (company_id, status, created_at DESC);
