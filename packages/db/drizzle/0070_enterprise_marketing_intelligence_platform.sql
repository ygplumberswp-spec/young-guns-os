-- Enterprise Marketing Intelligence, Campaign Operations & Multi-Channel Analytics Platform

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'marketing_intelligence';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_mi_strategy';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_mi_campaign_plan';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_mi_social_post';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_mi_email_campaign';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_mi_sms_campaign';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_mi_whatsapp_campaign';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_mi_ad_copy';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_mi_video_script';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_mi_landing_page';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_mi_blog_content';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_mi_review_response';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_mi_campaign_report';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_mi_executive_marketing_summary';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mi_workflow_status') THEN
    CREATE TYPE mi_workflow_status AS ENUM (
      'draft',
      'review',
      'pending_approval',
      'approved',
      'executed',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mi_adapter_status') THEN
    CREATE TYPE mi_adapter_status AS ENUM ('active', 'inactive', 'testing', 'error');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mi_marketing_provider_type') THEN
    CREATE TYPE mi_marketing_provider_type AS ENUM (
      'meta_ads',
      'google_ads',
      'microsoft_ads',
      'linkedin_ads',
      'tiktok_ads',
      'x_ads',
      'youtube_ads',
      'mailchimp',
      'hubspot',
      'brevo',
      'activecampaign',
      'klaviyo',
      'sendgrid',
      'facebook',
      'instagram',
      'linkedin',
      'tiktok',
      'x',
      'youtube',
      'google_business',
      'google_analytics',
      'search_console',
      'wordpress',
      'webflow',
      'shopify',
      'csv_import',
      'sftp',
      'generic_rest',
      'webhook',
      'custom'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mi_campaign_lifecycle_status') THEN
    CREATE TYPE mi_campaign_lifecycle_status AS ENUM (
      'idea',
      'draft',
      'planning',
      'content_creation',
      'creative_review',
      'brand_review',
      'legal_review',
      'budget_approval',
      'scheduled',
      'active',
      'paused',
      'completed',
      'archived'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mi_alert_severity') THEN
    CREATE TYPE mi_alert_severity AS ENUM ('info', 'warning', 'critical');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mi_alert_status') THEN
    CREATE TYPE mi_alert_status AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mi_content_status') THEN
    CREATE TYPE mi_content_status AS ENUM (
      'draft',
      'review',
      'approved',
      'scheduled',
      'published',
      'archived'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS mi_platform_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  marketing_standards JSONB NOT NULL DEFAULT '{}',
  provider_adapter_templates JSONB NOT NULL DEFAULT '{}',
  brand_templates JSONB NOT NULL DEFAULT '{}',
  campaign_templates JSONB NOT NULL DEFAULT '{}',
  content_templates JSONB NOT NULL DEFAULT '{}',
  attribution_standards JSONB NOT NULL DEFAULT '{}',
  audit_retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_marketing_provider_adapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider_type mi_marketing_provider_type NOT NULL,
  name TEXT NOT NULL,
  status mi_adapter_status NOT NULL DEFAULT 'inactive',
  sync_direction TEXT NOT NULL DEFAULT 'bidirectional',
  sync_frequency TEXT,
  field_mappings JSONB NOT NULL DEFAULT '{}',
  config JSONB NOT NULL DEFAULT '{}',
  last_sync_at TIMESTAMPTZ,
  last_health_check_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_marketing_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  strategy_key TEXT NOT NULL,
  workflow_status mi_workflow_status NOT NULL DEFAULT 'draft',
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  period_start DATE,
  period_end DATE,
  goals JSONB NOT NULL DEFAULT '{}',
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brand_key TEXT NOT NULL,
  description TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_brand_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES mi_brands(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL,
  name TEXT NOT NULL,
  asset_key TEXT NOT NULL,
  file_url TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_audiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  audience_key TEXT NOT NULL,
  audience_type TEXT,
  criteria JSONB NOT NULL DEFAULT '{}',
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_suppression_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  list_key TEXT NOT NULL,
  list_type TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_campaign_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  strategy_id UUID REFERENCES mi_marketing_strategies(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES mi_brands(id) ON DELETE SET NULL,
  audience_id UUID REFERENCES mi_audiences(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  plan_key TEXT NOT NULL,
  lifecycle_status mi_campaign_lifecycle_status NOT NULL DEFAULT 'draft',
  workflow_status mi_workflow_status NOT NULL DEFAULT 'draft',
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  budget_cents INTEGER,
  period_start DATE,
  period_end DATE,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_plan_id UUID REFERENCES mi_campaign_plans(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content_type TEXT NOT NULL,
  content_status mi_content_status NOT NULL DEFAULT 'draft',
  body TEXT,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_creative_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_plan_id UUID REFERENCES mi_campaign_plans(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  request_type TEXT NOT NULL,
  workflow_status mi_workflow_status NOT NULL DEFAULT 'draft',
  brief TEXT,
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES mi_brands(id) ON DELETE SET NULL,
  provider_type mi_marketing_provider_type NOT NULL,
  account_name TEXT NOT NULL,
  account_handle TEXT,
  external_id TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  social_account_id UUID REFERENCES mi_social_accounts(id) ON DELETE SET NULL,
  campaign_plan_id UUID REFERENCES mi_campaign_plans(id) ON DELETE SET NULL,
  title TEXT,
  body TEXT NOT NULL,
  content_status mi_content_status NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_social_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  social_account_id UUID REFERENCES mi_social_accounts(id) ON DELETE SET NULL,
  mention_type TEXT,
  author TEXT,
  content TEXT,
  sentiment TEXT,
  url TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  rating NUMERIC(3, 1),
  review_text TEXT,
  author TEXT,
  response_text TEXT,
  workflow_status mi_workflow_status NOT NULL DEFAULT 'draft',
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_ad_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider_type mi_marketing_provider_type NOT NULL,
  name TEXT NOT NULL,
  external_account_id TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ad_account_id UUID REFERENCES mi_ad_accounts(id) ON DELETE SET NULL,
  campaign_plan_id UUID REFERENCES mi_campaign_plans(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  external_campaign_id TEXT,
  lifecycle_status mi_campaign_lifecycle_status NOT NULL DEFAULT 'draft',
  budget_cents INTEGER,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_ad_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ad_campaign_id UUID NOT NULL REFERENCES mi_ad_campaigns(id) ON DELETE CASCADE,
  budget_type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  period_start DATE,
  period_end DATE,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_seo_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  search_volume INTEGER,
  difficulty NUMERIC(5, 2),
  current_rank INTEGER,
  target_url TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_local_presence_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location_key TEXT NOT NULL,
  address TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_websites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_landing_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  website_id UUID REFERENCES mi_websites(id) ON DELETE SET NULL,
  campaign_plan_id UUID REFERENCES mi_campaign_plans(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  content_status mi_content_status NOT NULL DEFAULT 'draft',
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_plan_id UUID REFERENCES mi_campaign_plans(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  subject TEXT,
  content_status mi_content_status NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_messaging_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_plan_id UUID REFERENCES mi_campaign_plans(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  channel TEXT NOT NULL,
  content_status mi_content_status NOT NULL DEFAULT 'draft',
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_customer_journeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  journey_key TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_attribution_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_plan_id UUID REFERENCES mi_campaign_plans(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  touchpoint_type TEXT,
  attributed_value_cents INTEGER,
  config JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_roi_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_plan_id UUID REFERENCES mi_campaign_plans(id) ON DELETE SET NULL,
  spend_cents INTEGER NOT NULL DEFAULT 0,
  revenue_cents INTEGER NOT NULL DEFAULT 0,
  roi_percent NUMERIC(7, 2),
  config JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_referral_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  campaign_key TEXT NOT NULL,
  lifecycle_status mi_campaign_lifecycle_status NOT NULL DEFAULT 'draft',
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_plan_id UUID REFERENCES mi_campaign_plans(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  event_type TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  experiment_key TEXT NOT NULL,
  experiment_type TEXT,
  workflow_status mi_workflow_status NOT NULL DEFAULT 'draft',
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_market_intelligence_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL,
  title TEXT NOT NULL,
  source TEXT,
  confidence_score NUMERIC(5, 2),
  data JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_marketing_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity mi_alert_severity NOT NULL DEFAULT 'warning',
  status mi_alert_status NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT,
  source_module TEXT,
  source_entity_id UUID,
  context JSONB NOT NULL DEFAULT '{}',
  acknowledged_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_marketing_action_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  draft_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  workflow_status mi_workflow_status NOT NULL DEFAULT 'draft',
  source_records JSONB NOT NULL DEFAULT '{}',
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  requires_human_review BOOLEAN NOT NULL DEFAULT TRUE,
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  active_campaign_count INTEGER NOT NULL DEFAULT 0,
  scheduled_content_count INTEGER NOT NULL DEFAULT 0,
  open_alert_count INTEGER NOT NULL DEFAULT 0,
  total_spend_cents INTEGER NOT NULL DEFAULT 0,
  attributed_revenue_cents INTEGER NOT NULL DEFAULT 0,
  social_post_count INTEGER NOT NULL DEFAULT 0,
  email_campaign_count INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mi_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mi_campaign_plans_company_idx ON mi_campaign_plans(company_id);
CREATE INDEX IF NOT EXISTS mi_marketing_strategies_company_idx ON mi_marketing_strategies(company_id);
CREATE INDEX IF NOT EXISTS mi_ad_campaigns_company_idx ON mi_ad_campaigns(company_id);
CREATE INDEX IF NOT EXISTS mi_email_campaigns_company_idx ON mi_email_campaigns(company_id);
CREATE INDEX IF NOT EXISTS mi_social_posts_company_idx ON mi_social_posts(company_id);
CREATE INDEX IF NOT EXISTS mi_marketing_alerts_company_status_idx ON mi_marketing_alerts(company_id, status);
CREATE INDEX IF NOT EXISTS mi_marketing_provider_adapters_company_idx ON mi_marketing_provider_adapters(company_id);
CREATE INDEX IF NOT EXISTS mi_analytics_snapshots_company_captured_idx ON mi_analytics_snapshots(company_id, captured_at);
CREATE INDEX IF NOT EXISTS mi_content_items_company_status_idx ON mi_content_items(company_id, content_status);
