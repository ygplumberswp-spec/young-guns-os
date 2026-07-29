-- Enterprise Platform Health, Diagnostics & Performance Intelligence Platform

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'platform_health';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ph_incident_report';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ph_optimization_recommendation';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ph_capacity_forecast';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ph_diagnostic_summary';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ph_health_status') THEN
    CREATE TYPE ph_health_status AS ENUM ('healthy', 'degraded', 'unhealthy', 'unknown');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ph_diagnostic_status') THEN
    CREATE TYPE ph_diagnostic_status AS ENUM ('pending', 'running', 'passed', 'failed', 'skipped');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ph_incident_severity') THEN
    CREATE TYPE ph_incident_severity AS ENUM ('low', 'medium', 'high', 'critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ph_incident_status') THEN
    CREATE TYPE ph_incident_status AS ENUM ('open', 'investigating', 'mitigated', 'resolved', 'closed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ph_service_category') THEN
    CREATE TYPE ph_service_category AS ENUM (
      'backend', 'frontend', 'database', 'cache', 'storage', 'ai_provider',
      'communication_provider', 'accounting_provider', 'fleet_provider',
      'connector_platform', 'api', 'authentication', 'scheduler', 'automation'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ph_platform_alert_severity') THEN
    CREATE TYPE ph_platform_alert_severity AS ENUM ('info', 'warning', 'critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ph_platform_alert_status') THEN
    CREATE TYPE ph_platform_alert_status AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ph_insight_severity') THEN
    CREATE TYPE ph_insight_severity AS ENUM ('info', 'warning', 'critical');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ph_platform_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  monitoring_policy JSONB NOT NULL DEFAULT '{}',
  diagnostics_policy JSONB NOT NULL DEFAULT '{}',
  capacity_policy JSONB NOT NULL DEFAULT '{}',
  incident_policy JSONB NOT NULL DEFAULT '{}',
  alert_level_config JSONB NOT NULL DEFAULT '{}',
  audit_retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ph_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  overall_health_score INTEGER,
  overall_health_status ph_health_status NOT NULL DEFAULT 'unknown',
  service_metrics JSONB NOT NULL DEFAULT '{}',
  uptime_percent REAL,
  availability_percent REAL,
  error_rate_percent REAL,
  api_p95_latency_ms INTEGER,
  queue_depth INTEGER NOT NULL DEFAULT 0,
  failed_job_count INTEGER NOT NULL DEFAULT 0,
  active_session_count INTEGER NOT NULL DEFAULT 0,
  metrics JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ph_diagnostic_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  run_key TEXT NOT NULL,
  status ph_diagnostic_status NOT NULL DEFAULT 'pending',
  test_count INTEGER NOT NULL DEFAULT 0,
  passed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ph_diagnostic_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  diagnostic_run_id UUID NOT NULL REFERENCES ph_diagnostic_runs(id) ON DELETE CASCADE,
  test_key TEXT NOT NULL,
  test_name TEXT NOT NULL,
  service_category ph_service_category,
  status ph_diagnostic_status NOT NULL DEFAULT 'pending',
  message TEXT,
  duration_ms INTEGER,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ph_performance_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL,
  severity ph_insight_severity NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  description TEXT,
  source_module TEXT,
  metric_value REAL,
  threshold_value REAL,
  recommendation TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ph_capacity_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  storage_usage_mb REAL,
  database_growth_mb REAL,
  ai_usage_count INTEGER NOT NULL DEFAULT 0,
  api_request_count INTEGER NOT NULL DEFAULT 0,
  queue_growth_count INTEGER NOT NULL DEFAULT 0,
  active_tenant_count INTEGER NOT NULL DEFAULT 0,
  active_user_count INTEGER NOT NULL DEFAULT 0,
  background_job_load INTEGER NOT NULL DEFAULT 0,
  forecast JSONB NOT NULL DEFAULT '{}',
  metrics JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ph_platform_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity ph_platform_alert_severity NOT NULL DEFAULT 'info',
  status ph_platform_alert_status NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT,
  source_incident_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ph_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  metrics JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ph_action_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  draft_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_records JSONB NOT NULL DEFAULT '{}',
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ph_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ph_health_snapshots_company ON ph_health_snapshots(company_id);
CREATE INDEX IF NOT EXISTS idx_ph_diagnostic_runs_company ON ph_diagnostic_runs(company_id);
CREATE INDEX IF NOT EXISTS idx_ph_diagnostic_results_run ON ph_diagnostic_results(diagnostic_run_id);
CREATE INDEX IF NOT EXISTS idx_ph_performance_insights_company ON ph_performance_insights(company_id);
CREATE INDEX IF NOT EXISTS idx_ph_capacity_snapshots_company ON ph_capacity_snapshots(company_id);
CREATE INDEX IF NOT EXISTS idx_ph_platform_alerts_company ON ph_platform_alerts(company_id);
CREATE INDEX IF NOT EXISTS idx_ph_audit_logs_company ON ph_audit_logs(company_id);
