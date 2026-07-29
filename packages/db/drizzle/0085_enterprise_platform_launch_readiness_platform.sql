-- Enterprise Platform Launch Readiness, Acceptance Testing & Go-Live Center

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'launch_readiness';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_lnc_readiness_report';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_lnc_deployment_plan';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_lnc_rollout_checklist';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_lnc_rollback_recommendation';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lnc_check_status') THEN
    CREATE TYPE lnc_check_status AS ENUM ('pending', 'running', 'passed', 'failed', 'warning', 'skipped', 'blocked');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lnc_readiness_status') THEN
    CREATE TYPE lnc_readiness_status AS ENUM ('not_ready', 'blocked', 'warning', 'ready', 'unknown');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lnc_check_category') THEN
    CREATE TYPE lnc_check_category AS ENUM (
      'platform', 'tenant', 'feature', 'integration', 'infrastructure',
      'security', 'mobile', 'saas', 'authentication', 'rbac', 'database',
      'api', 'workers', 'scheduler', 'ai', 'connectors', 'payments',
      'accounting', 'fleet', 'communications', 'notifications', 'document_ai',
      'backup', 'disaster_recovery', 'monitoring', 'audit'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lnc_wizard_status') THEN
    CREATE TYPE lnc_wizard_status AS ENUM ('draft', 'in_progress', 'pending_approval', 'approved', 'completed', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lnc_wizard_step_status') THEN
    CREATE TYPE lnc_wizard_step_status AS ENUM ('pending', 'in_progress', 'passed', 'failed', 'blocked', 'skipped');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lnc_deployment_status') THEN
    CREATE TYPE lnc_deployment_status AS ENUM ('planned', 'pending_validation', 'validated', 'failed', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lnc_platform_alert_severity') THEN
    CREATE TYPE lnc_platform_alert_severity AS ENUM ('info', 'warning', 'critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lnc_platform_alert_status') THEN
    CREATE TYPE lnc_platform_alert_status AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lnc_issue_severity') THEN
    CREATE TYPE lnc_issue_severity AS ENUM ('info', 'warning', 'high', 'critical');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS lnc_platform_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  readiness_policy JSONB NOT NULL DEFAULT '{}',
  scoring_weights JSONB NOT NULL DEFAULT '{}',
  acceptance_policy JSONB NOT NULL DEFAULT '{}',
  go_live_policy JSONB NOT NULL DEFAULT '{}',
  rollback_policy JSONB NOT NULL DEFAULT '{}',
  alert_level_config JSONB NOT NULL DEFAULT '{}',
  audit_retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lnc_readiness_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  scan_key TEXT NOT NULL,
  status lnc_check_status NOT NULL DEFAULT 'pending',
  overall_status lnc_readiness_status NOT NULL DEFAULT 'unknown',
  check_count INTEGER NOT NULL DEFAULT 0,
  passed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  critical_blocker_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lnc_readiness_check_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  readiness_scan_id UUID NOT NULL REFERENCES lnc_readiness_scans(id) ON DELETE CASCADE,
  check_key TEXT NOT NULL,
  check_name TEXT NOT NULL,
  category lnc_check_category,
  status lnc_check_status NOT NULL DEFAULT 'pending',
  severity lnc_issue_severity NOT NULL DEFAULT 'info',
  message TEXT,
  recommendation TEXT,
  duration_ms INTEGER,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lnc_acceptance_test_suites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  suite_key TEXT NOT NULL,
  suite_name TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  test_keys JSONB NOT NULL DEFAULT '[]',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, suite_key)
);

CREATE TABLE IF NOT EXISTS lnc_acceptance_test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  suite_id UUID REFERENCES lnc_acceptance_test_suites(id) ON DELETE SET NULL,
  run_key TEXT NOT NULL,
  status lnc_check_status NOT NULL DEFAULT 'pending',
  test_count INTEGER NOT NULL DEFAULT 0,
  passed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lnc_acceptance_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  acceptance_test_run_id UUID NOT NULL REFERENCES lnc_acceptance_test_runs(id) ON DELETE CASCADE,
  test_key TEXT NOT NULL,
  test_name TEXT NOT NULL,
  status lnc_check_status NOT NULL DEFAULT 'pending',
  message TEXT,
  duration_ms INTEGER,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lnc_readiness_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  readiness_scan_id UUID REFERENCES lnc_readiness_scans(id) ON DELETE SET NULL,
  overall_score INTEGER,
  overall_status lnc_readiness_status NOT NULL DEFAULT 'unknown',
  critical_blocker_count INTEGER NOT NULL DEFAULT 0,
  high_priority_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  passed_count INTEGER NOT NULL DEFAULT 0,
  recommendations JSONB NOT NULL DEFAULT '[]',
  score_breakdown JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lnc_go_live_wizards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  wizard_key TEXT NOT NULL,
  title TEXT NOT NULL,
  status lnc_wizard_status NOT NULL DEFAULT 'draft',
  current_step_key TEXT,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lnc_go_live_wizard_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  go_live_wizard_id UUID NOT NULL REFERENCES lnc_go_live_wizards(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  step_name TEXT NOT NULL,
  step_order INTEGER NOT NULL DEFAULT 0,
  status lnc_wizard_step_status NOT NULL DEFAULT 'pending',
  completed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lnc_rollback_plan_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  go_live_wizard_id UUID REFERENCES lnc_go_live_wizards(id) ON DELETE SET NULL,
  recovery_plan_id UUID,
  plan_name TEXT NOT NULL,
  plan_description TEXT,
  is_selected BOOLEAN NOT NULL DEFAULT FALSE,
  validation_status lnc_check_status NOT NULL DEFAULT 'pending',
  validation_report JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lnc_deployment_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  go_live_wizard_id UUID REFERENCES lnc_go_live_wizards(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  validation_key TEXT NOT NULL,
  status lnc_deployment_status NOT NULL DEFAULT 'planned',
  deployment_record_id UUID,
  passed_check_count INTEGER NOT NULL DEFAULT 0,
  failed_check_count INTEGER NOT NULL DEFAULT 0,
  report JSONB NOT NULL DEFAULT '{}',
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lnc_platform_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity lnc_platform_alert_severity NOT NULL DEFAULT 'info',
  status lnc_platform_alert_status NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lnc_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  metrics JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lnc_action_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  draft_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_records JSONB NOT NULL DEFAULT '{}',
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lnc_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lnc_readiness_scans_company ON lnc_readiness_scans(company_id);
CREATE INDEX IF NOT EXISTS idx_lnc_readiness_check_results_scan ON lnc_readiness_check_results(readiness_scan_id);
CREATE INDEX IF NOT EXISTS idx_lnc_acceptance_test_runs_company ON lnc_acceptance_test_runs(company_id);
CREATE INDEX IF NOT EXISTS idx_lnc_acceptance_test_results_run ON lnc_acceptance_test_results(acceptance_test_run_id);
CREATE INDEX IF NOT EXISTS idx_lnc_readiness_scores_company ON lnc_readiness_scores(company_id);
CREATE INDEX IF NOT EXISTS idx_lnc_go_live_wizards_company ON lnc_go_live_wizards(company_id);
CREATE INDEX IF NOT EXISTS idx_lnc_go_live_wizard_steps_wizard ON lnc_go_live_wizard_steps(go_live_wizard_id);
CREATE INDEX IF NOT EXISTS idx_lnc_deployment_validations_company ON lnc_deployment_validations(company_id);
CREATE INDEX IF NOT EXISTS idx_lnc_platform_alerts_company ON lnc_platform_alerts(company_id);
CREATE INDEX IF NOT EXISTS idx_lnc_audit_logs_company ON lnc_audit_logs(company_id);
