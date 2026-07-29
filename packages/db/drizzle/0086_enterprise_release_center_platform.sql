-- Enterprise Release Center — Final Production Integration, Optimization & Release Candidate

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'release_candidate';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_rc_release_notes';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_rc_optimization_plan';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_rc_deployment_recommendation';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rc_validation_status') THEN
    CREATE TYPE rc_validation_status AS ENUM ('pending', 'running', 'passed', 'failed', 'warning', 'skipped');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rc_release_status') THEN
    CREATE TYPE rc_release_status AS ENUM ('not_ready', 'blocked', 'warning', 'ready', 'unknown');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rc_integration_category') THEN
    CREATE TYPE rc_integration_category AS ENUM (
      'authentication', 'rbac', 'multi_tenancy', 'crm', 'leads', 'customers', 'jobs',
      'scheduling', 'dispatch', 'fleet', 'inventory', 'procurement', 'finance', 'payments',
      'xero', 'connectors', 'communications', 'whatsapp', 'email', 'voice_reception',
      'documents', 'document_ai', 'knowledge_graph', 'ai_orchestration', 'mission_control',
      'security', 'saas', 'industry_packs', 'business_continuity', 'launch_center'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rc_workflow_category') THEN
    CREATE TYPE rc_workflow_category AS ENUM (
      'lead_to_customer', 'quote_to_job', 'dispatch', 'completion', 'invoice', 'payment',
      'customer_history', 'procurement', 'inventory', 'fleet', 'notifications', 'automation',
      'ai_workflow', 'customer_portal', 'mobile'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rc_insight_severity') THEN
    CREATE TYPE rc_insight_severity AS ENUM ('info', 'warning', 'high', 'critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rc_platform_alert_severity') THEN
    CREATE TYPE rc_platform_alert_severity AS ENUM ('info', 'warning', 'critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rc_platform_alert_status') THEN
    CREATE TYPE rc_platform_alert_status AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rc_checklist_status') THEN
    CREATE TYPE rc_checklist_status AS ENUM ('pending', 'passed', 'failed', 'skipped', 'manual');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS rc_platform_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  validation_policy JSONB NOT NULL DEFAULT '{}',
  performance_policy JSONB NOT NULL DEFAULT '{}',
  release_policy JSONB NOT NULL DEFAULT '{}',
  alert_level_config JSONB NOT NULL DEFAULT '{}',
  audit_retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rc_integration_validation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  run_key TEXT NOT NULL,
  status rc_validation_status NOT NULL DEFAULT 'pending',
  check_count INTEGER NOT NULL DEFAULT 0,
  passed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rc_integration_validation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  validation_run_id UUID NOT NULL REFERENCES rc_integration_validation_runs(id) ON DELETE CASCADE,
  check_key TEXT NOT NULL,
  check_name TEXT NOT NULL,
  category rc_integration_category,
  status rc_validation_status NOT NULL DEFAULT 'pending',
  severity rc_insight_severity NOT NULL DEFAULT 'info',
  message TEXT,
  recommendation TEXT,
  duration_ms INTEGER,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rc_workflow_validation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  run_key TEXT NOT NULL,
  status rc_validation_status NOT NULL DEFAULT 'pending',
  step_count INTEGER NOT NULL DEFAULT 0,
  passed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rc_workflow_validation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workflow_run_id UUID NOT NULL REFERENCES rc_workflow_validation_runs(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  step_name TEXT NOT NULL,
  category rc_workflow_category,
  status rc_validation_status NOT NULL DEFAULT 'pending',
  message TEXT,
  duration_ms INTEGER,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rc_performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  snapshot_key TEXT NOT NULL,
  slow_endpoint_count INTEGER NOT NULL DEFAULT 0,
  slow_query_count INTEGER NOT NULL DEFAULT 0,
  queue_depth INTEGER NOT NULL DEFAULT 0,
  ai_latency_ms INTEGER,
  search_index_count INTEGER NOT NULL DEFAULT 0,
  dashboard_load_ms INTEGER,
  optimization_opportunities JSONB NOT NULL DEFAULT '[]',
  metrics JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rc_security_verification_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  run_key TEXT NOT NULL,
  status rc_validation_status NOT NULL DEFAULT 'pending',
  finding_count INTEGER NOT NULL DEFAULT 0,
  critical_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  report JSONB NOT NULL DEFAULT '{}',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rc_configuration_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  review_key TEXT NOT NULL,
  missing_config_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  findings JSONB NOT NULL DEFAULT '[]',
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rc_release_candidate_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  report_key TEXT NOT NULL,
  readiness_score INTEGER,
  overall_status rc_release_status NOT NULL DEFAULT 'unknown',
  passed_validation_count INTEGER NOT NULL DEFAULT 0,
  failed_validation_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  optimization_count INTEGER NOT NULL DEFAULT 0,
  manual_task_count INTEGER NOT NULL DEFAULT 0,
  report JSONB NOT NULL DEFAULT '{}',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rc_release_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'release',
  status rc_checklist_status NOT NULL DEFAULT 'pending',
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, item_key)
);

CREATE TABLE IF NOT EXISTS rc_platform_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity rc_platform_alert_severity NOT NULL DEFAULT 'info',
  status rc_platform_alert_status NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rc_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  metrics JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rc_action_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  draft_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_records JSONB NOT NULL DEFAULT '{}',
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rc_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rc_integration_validation_runs_company ON rc_integration_validation_runs(company_id);
CREATE INDEX IF NOT EXISTS idx_rc_integration_validation_results_run ON rc_integration_validation_results(validation_run_id);
CREATE INDEX IF NOT EXISTS idx_rc_workflow_validation_runs_company ON rc_workflow_validation_runs(company_id);
CREATE INDEX IF NOT EXISTS idx_rc_workflow_validation_results_run ON rc_workflow_validation_results(workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_rc_performance_snapshots_company ON rc_performance_snapshots(company_id);
CREATE INDEX IF NOT EXISTS idx_rc_release_candidate_reports_company ON rc_release_candidate_reports(company_id);
CREATE INDEX IF NOT EXISTS idx_rc_platform_alerts_company ON rc_platform_alerts(company_id);
CREATE INDEX IF NOT EXISTS idx_rc_audit_logs_company ON rc_audit_logs(company_id);
