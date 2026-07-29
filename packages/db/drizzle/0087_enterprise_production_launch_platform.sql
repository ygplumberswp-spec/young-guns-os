-- Enterprise Production Launch — Final Production Deployment, Live Integrations & Commercial Launch

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'production_launch';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_pl_deployment_plan';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_pl_launch_report';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_pl_post_launch_checklist';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pl_validation_status') THEN
    CREATE TYPE pl_validation_status AS ENUM ('pending', 'running', 'passed', 'failed', 'warning', 'skipped');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pl_launch_status') THEN
    CREATE TYPE pl_launch_status AS ENUM ('not_ready', 'blocked', 'warning', 'ready', 'launched', 'unknown');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pl_provider_category') THEN
    CREATE TYPE pl_provider_category AS ENUM (
      'xero', 'email', 'whatsapp', 'sms', 'payments', 'cartrack', 'ai', 'storage', 'connectors'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pl_deployment_status') THEN
    CREATE TYPE pl_deployment_status AS ENUM (
      'draft', 'pending_approval', 'approved', 'deploying', 'deployed', 'failed', 'rolled_back', 'cancelled'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pl_wizard_status') THEN
    CREATE TYPE pl_wizard_status AS ENUM (
      'draft', 'in_progress', 'pending_approval', 'approved', 'launched', 'blocked', 'cancelled'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pl_wizard_step_status') THEN
    CREATE TYPE pl_wizard_step_status AS ENUM ('pending', 'in_progress', 'passed', 'failed', 'blocked', 'skipped');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pl_insight_severity') THEN
    CREATE TYPE pl_insight_severity AS ENUM ('info', 'warning', 'high', 'critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pl_platform_alert_severity') THEN
    CREATE TYPE pl_platform_alert_severity AS ENUM ('info', 'warning', 'critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pl_platform_alert_status') THEN
    CREATE TYPE pl_platform_alert_status AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS pl_platform_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  deployment_policy JSONB NOT NULL DEFAULT '{}',
  provider_policy JSONB NOT NULL DEFAULT '{}',
  launch_policy JSONB NOT NULL DEFAULT '{}',
  alert_level_config JSONB NOT NULL DEFAULT '{}',
  audit_retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pl_environment_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  review_key TEXT NOT NULL,
  status pl_validation_status NOT NULL DEFAULT 'pending',
  missing_config_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  passed_count INTEGER NOT NULL DEFAULT 0,
  findings JSONB NOT NULL DEFAULT '[]',
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pl_domain_security_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  review_key TEXT NOT NULL,
  status pl_validation_status NOT NULL DEFAULT 'pending',
  finding_count INTEGER NOT NULL DEFAULT 0,
  critical_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  findings JSONB NOT NULL DEFAULT '[]',
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pl_live_integration_verification_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  run_key TEXT NOT NULL,
  status pl_validation_status NOT NULL DEFAULT 'pending',
  provider_count INTEGER NOT NULL DEFAULT 0,
  connected_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pl_live_integration_verification_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  verification_run_id UUID NOT NULL REFERENCES pl_live_integration_verification_runs(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  category pl_provider_category,
  status pl_validation_status NOT NULL DEFAULT 'pending',
  severity pl_insight_severity NOT NULL DEFAULT 'info',
  message TEXT,
  recommendation TEXT,
  duration_ms INTEGER,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pl_deployment_pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  run_key TEXT NOT NULL,
  status pl_deployment_status NOT NULL DEFAULT 'draft',
  environment TEXT NOT NULL DEFAULT 'production',
  health_verified BOOLEAN NOT NULL DEFAULT FALSE,
  smoke_test_passed BOOLEAN NOT NULL DEFAULT FALSE,
  owner_approved BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  deployed_at TIMESTAMPTZ,
  rolled_back_at TIMESTAMPTZ,
  smoke_tests JSONB NOT NULL DEFAULT '[]',
  deployment_report JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pl_commercial_readiness_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  review_key TEXT NOT NULL,
  status pl_validation_status NOT NULL DEFAULT 'pending',
  finding_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  report JSONB NOT NULL DEFAULT '{}',
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pl_mobile_production_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  review_key TEXT NOT NULL,
  status pl_validation_status NOT NULL DEFAULT 'pending',
  finding_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  report JSONB NOT NULL DEFAULT '{}',
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pl_go_live_wizards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  wizard_key TEXT NOT NULL,
  title TEXT NOT NULL,
  status pl_wizard_status NOT NULL DEFAULT 'draft',
  current_step_key TEXT,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  launched_at TIMESTAMPTZ,
  launch_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pl_go_live_wizard_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  go_live_wizard_id UUID NOT NULL REFERENCES pl_go_live_wizards(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  step_name TEXT NOT NULL,
  step_order INTEGER NOT NULL DEFAULT 0,
  status pl_wizard_step_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  completed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pl_platform_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity pl_platform_alert_severity NOT NULL DEFAULT 'info',
  status pl_platform_alert_status NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pl_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  metrics JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pl_action_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  draft_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_records JSONB NOT NULL DEFAULT '{}',
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pl_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pl_environment_reviews_company ON pl_environment_reviews(company_id);
CREATE INDEX IF NOT EXISTS idx_pl_live_integration_runs_company ON pl_live_integration_verification_runs(company_id);
CREATE INDEX IF NOT EXISTS idx_pl_deployment_runs_company ON pl_deployment_pipeline_runs(company_id);
CREATE INDEX IF NOT EXISTS idx_pl_go_live_wizards_company ON pl_go_live_wizards(company_id);
CREATE INDEX IF NOT EXISTS idx_pl_go_live_wizard_steps_wizard ON pl_go_live_wizard_steps(go_live_wizard_id);
CREATE INDEX IF NOT EXISTS idx_pl_platform_alerts_company ON pl_platform_alerts(company_id);
CREATE INDEX IF NOT EXISTS idx_pl_audit_logs_company ON pl_audit_logs(company_id);
