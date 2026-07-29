-- Enterprise Release Management — Mobile Production Packaging, App Store Submission & TITAN v1.0 Release

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'release_manager';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_rlm_release_notes';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_rlm_user_documentation';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_rlm_admin_documentation';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_rlm_post_launch_recommendations';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rlm_validation_status') THEN
    CREATE TYPE rlm_validation_status AS ENUM ('pending', 'running', 'passed', 'failed', 'warning', 'skipped');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rlm_release_status') THEN
    CREATE TYPE rlm_release_status AS ENUM ('not_ready', 'blocked', 'warning', 'ready', 'released', 'unknown');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rlm_store_platform') THEN
    CREATE TYPE rlm_store_platform AS ENUM ('apple_app_store', 'google_play_store');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rlm_doc_category') THEN
    CREATE TYPE rlm_doc_category AS ENUM (
      'system_overview', 'administrator_guide', 'user_guide', 'deployment_guide',
      'disaster_recovery', 'api_guide', 'integration_guide', 'changelog', 'version_history'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rlm_checklist_status') THEN
    CREATE TYPE rlm_checklist_status AS ENUM ('pending', 'passed', 'failed', 'skipped', 'manual');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rlm_platform_alert_severity') THEN
    CREATE TYPE rlm_platform_alert_severity AS ENUM ('info', 'warning', 'critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rlm_platform_alert_status') THEN
    CREATE TYPE rlm_platform_alert_status AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS rlm_platform_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  release_policy JSONB NOT NULL DEFAULT '{}',
  documentation_policy JSONB NOT NULL DEFAULT '{}',
  mobile_policy JSONB NOT NULL DEFAULT '{}',
  alert_level_config JSONB NOT NULL DEFAULT '{}',
  audit_retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rlm_mobile_packaging_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  review_key TEXT NOT NULL,
  status rlm_validation_status NOT NULL DEFAULT 'pending',
  ios_ready BOOLEAN NOT NULL DEFAULT FALSE,
  android_ready BOOLEAN NOT NULL DEFAULT FALSE,
  finding_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  findings JSONB NOT NULL DEFAULT '[]',
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rlm_app_store_readiness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  review_key TEXT NOT NULL,
  store_platform rlm_store_platform NOT NULL,
  status rlm_validation_status NOT NULL DEFAULT 'pending',
  checklist_complete_count INTEGER NOT NULL DEFAULT 0,
  checklist_total_count INTEGER NOT NULL DEFAULT 0,
  store_listing JSONB NOT NULL DEFAULT '{}',
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rlm_branding_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  review_key TEXT NOT NULL,
  status rlm_validation_status NOT NULL DEFAULT 'pending',
  finding_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  findings JSONB NOT NULL DEFAULT '[]',
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rlm_ux_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  review_key TEXT NOT NULL,
  status rlm_validation_status NOT NULL DEFAULT 'pending',
  recommendation_count INTEGER NOT NULL DEFAULT 0,
  findings JSONB NOT NULL DEFAULT '[]',
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rlm_documentation_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  doc_key TEXT NOT NULL,
  doc_category rlm_doc_category NOT NULL,
  title TEXT NOT NULL,
  status rlm_validation_status NOT NULL DEFAULT 'pending',
  completeness_percent INTEGER NOT NULL DEFAULT 0,
  content_outline JSONB NOT NULL DEFAULT '{}',
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, doc_key)
);

CREATE TABLE IF NOT EXISTS rlm_version_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  version_key TEXT NOT NULL,
  version_number TEXT NOT NULL DEFAULT '1.0.0',
  version_name TEXT NOT NULL DEFAULT 'TITAN Business OS v1.0.0',
  status rlm_release_status NOT NULL DEFAULT 'unknown',
  release_notes JSONB NOT NULL DEFAULT '{}',
  feature_summary JSONB NOT NULL DEFAULT '[]',
  breaking_changes JSONB NOT NULL DEFAULT '[]',
  migration_notes JSONB NOT NULL DEFAULT '[]',
  known_limitations JSONB NOT NULL DEFAULT '[]',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rlm_launch_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'release',
  status rlm_checklist_status NOT NULL DEFAULT 'pending',
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rlm_platform_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity rlm_platform_alert_severity NOT NULL DEFAULT 'info',
  status rlm_platform_alert_status NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rlm_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  metrics JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rlm_action_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  draft_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_records JSONB NOT NULL DEFAULT '{}',
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rlm_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rlm_mobile_reviews_company ON rlm_mobile_packaging_reviews(company_id);
CREATE INDEX IF NOT EXISTS idx_rlm_app_store_company ON rlm_app_store_readiness(company_id);
CREATE INDEX IF NOT EXISTS idx_rlm_documentation_company ON rlm_documentation_artifacts(company_id);
CREATE INDEX IF NOT EXISTS idx_rlm_version_records_company ON rlm_version_records(company_id);
CREATE INDEX IF NOT EXISTS idx_rlm_launch_checklist_company ON rlm_launch_checklist_items(company_id);
CREATE INDEX IF NOT EXISTS idx_rlm_platform_alerts_company ON rlm_platform_alerts(company_id);
CREATE INDEX IF NOT EXISTS idx_rlm_audit_logs_company ON rlm_audit_logs(company_id);
