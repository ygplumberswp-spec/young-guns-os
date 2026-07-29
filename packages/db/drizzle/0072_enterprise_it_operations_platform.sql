-- Enterprise IT Operations, Reliability & Self-Healing Platform

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'it_operations';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ito_fix';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ito_postmortem';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ito_release_notes';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ito_infrastructure_report';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ito_health_summary';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ito_incident_report';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ito_change_plan';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ito_runbook';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ito_rca_report';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ito_workflow_status') THEN
    CREATE TYPE ito_workflow_status AS ENUM (
      'draft',
      'review',
      'pending_approval',
      'approved',
      'executed',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ito_alert_severity') THEN
    CREATE TYPE ito_alert_severity AS ENUM ('info', 'warning', 'critical');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ito_alert_status') THEN
    CREATE TYPE ito_alert_status AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ito_incident_severity') THEN
    CREATE TYPE ito_incident_severity AS ENUM ('low', 'medium', 'high', 'critical');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ito_incident_status') THEN
    CREATE TYPE ito_incident_status AS ENUM (
      'open',
      'investigating',
      'mitigated',
      'resolved',
      'closed'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ito_repair_risk_level') THEN
    CREATE TYPE ito_repair_risk_level AS ENUM ('low', 'medium', 'high', 'critical');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ito_deployment_status') THEN
    CREATE TYPE ito_deployment_status AS ENUM (
      'planned',
      'in_progress',
      'completed',
      'failed',
      'rolled_back'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ito_health_status') THEN
    CREATE TYPE ito_health_status AS ENUM ('healthy', 'degraded', 'unhealthy', 'unknown');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ito_platform_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  health_thresholds JSONB NOT NULL DEFAULT '{}',
  monitoring_config JSONB NOT NULL DEFAULT '{}',
  healing_policies JSONB NOT NULL DEFAULT '{}',
  deployment_standards JSONB NOT NULL DEFAULT '{}',
  alert_routing JSONB NOT NULL DEFAULT '{}',
  change_management_policy JSONB NOT NULL DEFAULT '{}',
  audit_retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ito_health_monitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  monitor_key TEXT NOT NULL,
  name TEXT NOT NULL,
  monitor_type TEXT NOT NULL,
  target_module TEXT,
  health_status ito_health_status NOT NULL DEFAULT 'unknown',
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ito_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  monitor_id UUID REFERENCES ito_health_monitors(id) ON DELETE SET NULL,
  snapshot_key TEXT NOT NULL,
  health_status ito_health_status NOT NULL DEFAULT 'unknown',
  metrics JSONB NOT NULL DEFAULT '{}',
  config JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ito_self_healing_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  monitor_id UUID REFERENCES ito_health_monitors(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  workflow_status ito_workflow_status NOT NULL DEFAULT 'draft',
  risk_level ito_repair_risk_level NOT NULL DEFAULT 'medium',
  triggered_by TEXT,
  outcome TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ito_bug_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  detection_source TEXT NOT NULL,
  severity ito_alert_severity NOT NULL DEFAULT 'warning',
  title TEXT NOT NULL,
  description TEXT,
  workflow_status ito_workflow_status NOT NULL DEFAULT 'draft',
  source_module TEXT,
  source_entity_id UUID,
  fingerprint TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ito_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  incident_number TEXT,
  title TEXT NOT NULL,
  description TEXT,
  severity ito_incident_severity NOT NULL DEFAULT 'medium',
  status ito_incident_status NOT NULL DEFAULT 'open',
  source_module TEXT,
  assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  config JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mitigated_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ito_root_cause_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bug_detection_id UUID REFERENCES ito_bug_detections(id) ON DELETE SET NULL,
  incident_id UUID REFERENCES ito_incidents(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  root_cause TEXT,
  analysis JSONB NOT NULL DEFAULT '{}',
  workflow_status ito_workflow_status NOT NULL DEFAULT 'draft',
  analyzed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  config JSONB NOT NULL DEFAULT '{}',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ito_repair_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bug_detection_id UUID REFERENCES ito_bug_detections(id) ON DELETE SET NULL,
  root_cause_analysis_id UUID REFERENCES ito_root_cause_analyses(id) ON DELETE SET NULL,
  repair_type TEXT NOT NULL,
  workflow_status ito_workflow_status NOT NULL DEFAULT 'draft',
  risk_level ito_repair_risk_level NOT NULL DEFAULT 'medium',
  success BOOLEAN,
  notes TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  attempted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  attempted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ito_build_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  build_key TEXT NOT NULL,
  version TEXT,
  branch TEXT,
  commit_sha TEXT,
  workflow_status ito_workflow_status NOT NULL DEFAULT 'draft',
  config JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ito_test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  run_key TEXT NOT NULL,
  test_suite TEXT NOT NULL,
  workflow_status ito_workflow_status NOT NULL DEFAULT 'draft',
  passed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  build_record_id UUID REFERENCES ito_build_records(id) ON DELETE SET NULL,
  config JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ito_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  change_number TEXT,
  title TEXT NOT NULL,
  description TEXT,
  workflow_status ito_workflow_status NOT NULL DEFAULT 'draft',
  risk_level ito_repair_risk_level NOT NULL DEFAULT 'medium',
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  config JSONB NOT NULL DEFAULT '{}',
  scheduled_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ito_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  deployment_key TEXT NOT NULL,
  environment TEXT NOT NULL,
  deployment_status ito_deployment_status NOT NULL DEFAULT 'planned',
  version TEXT,
  build_record_id UUID REFERENCES ito_build_records(id) ON DELETE SET NULL,
  change_request_id UUID REFERENCES ito_change_requests(id) ON DELETE SET NULL,
  deployed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  config JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ito_dependency_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  dependency_name TEXT NOT NULL,
  dependency_type TEXT NOT NULL,
  version TEXT,
  health_status ito_health_status NOT NULL DEFAULT 'unknown',
  is_critical BOOLEAN NOT NULL DEFAULT FALSE,
  config JSONB NOT NULL DEFAULT '{}',
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ito_database_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  health_status ito_health_status NOT NULL DEFAULT 'unknown',
  connection_pool_usage_percent NUMERIC(5, 2),
  query_latency_ms INTEGER,
  slow_query_count INTEGER NOT NULL DEFAULT 0,
  replication_lag_ms INTEGER,
  active_connection_count INTEGER,
  metrics JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ito_api_reliability_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  endpoint_group TEXT NOT NULL,
  health_status ito_health_status NOT NULL DEFAULT 'unknown',
  availability_percent NUMERIC(5, 2),
  error_rate_percent NUMERIC(5, 2),
  p95_latency_ms INTEGER,
  request_count INTEGER NOT NULL DEFAULT 0,
  metrics JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ito_ai_provider_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL,
  health_status ito_health_status NOT NULL DEFAULT 'unknown',
  latency_ms INTEGER,
  error_rate_percent NUMERIC(5, 2),
  rate_limit_events INTEGER NOT NULL DEFAULT 0,
  failover_count INTEGER NOT NULL DEFAULT 0,
  metrics JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ito_integration_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  integration_key TEXT NOT NULL,
  health_status ito_health_status NOT NULL DEFAULT 'unknown',
  last_success_at TIMESTAMPTZ,
  failure_count INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  metrics JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ito_technical_debt_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  debt_key TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  severity ito_incident_severity NOT NULL DEFAULT 'medium',
  workflow_status ito_workflow_status NOT NULL DEFAULT 'draft',
  estimated_effort_hours NUMERIC(8, 2),
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  description TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ito_performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  health_status ito_health_status NOT NULL DEFAULT 'unknown',
  cpu_usage_percent NUMERIC(5, 2),
  memory_usage_mb INTEGER,
  api_p95_latency_ms INTEGER,
  queue_depth INTEGER NOT NULL DEFAULT 0,
  background_job_failure_count INTEGER NOT NULL DEFAULT 0,
  metrics JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ito_backup_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  backup_ref TEXT NOT NULL,
  verification_status ito_workflow_status NOT NULL DEFAULT 'draft',
  verification_passed BOOLEAN,
  notes TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  verified_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ito_it_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity ito_alert_severity NOT NULL DEFAULT 'warning',
  status ito_alert_status NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT,
  source_module TEXT,
  source_entity_id UUID,
  incident_id UUID REFERENCES ito_incidents(id) ON DELETE SET NULL,
  context JSONB NOT NULL DEFAULT '{}',
  acknowledged_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ito_it_action_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  draft_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  workflow_status ito_workflow_status NOT NULL DEFAULT 'draft',
  source_records JSONB NOT NULL DEFAULT '{}',
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  requires_human_review BOOLEAN NOT NULL DEFAULT TRUE,
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ito_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  open_incident_count INTEGER NOT NULL DEFAULT 0,
  open_alert_count INTEGER NOT NULL DEFAULT 0,
  degraded_monitor_count INTEGER NOT NULL DEFAULT 0,
  open_bug_count INTEGER NOT NULL DEFAULT 0,
  pending_change_request_count INTEGER NOT NULL DEFAULT 0,
  failed_deployment_count INTEGER NOT NULL DEFAULT 0,
  technical_debt_count INTEGER NOT NULL DEFAULT 0,
  overall_health_status ito_health_status NOT NULL DEFAULT 'unknown',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ito_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ito_health_monitors_company_idx ON ito_health_monitors(company_id);
CREATE INDEX IF NOT EXISTS ito_health_snapshots_company_captured_idx ON ito_health_snapshots(company_id, captured_at);
CREATE INDEX IF NOT EXISTS ito_bug_detections_company_idx ON ito_bug_detections(company_id);
CREATE INDEX IF NOT EXISTS ito_incidents_company_status_idx ON ito_incidents(company_id, status);
CREATE INDEX IF NOT EXISTS ito_deployments_company_status_idx ON ito_deployments(company_id, deployment_status);
CREATE INDEX IF NOT EXISTS ito_it_alerts_company_status_idx ON ito_it_alerts(company_id, status);
CREATE INDEX IF NOT EXISTS ito_change_requests_company_idx ON ito_change_requests(company_id);
CREATE INDEX IF NOT EXISTS ito_analytics_snapshots_company_captured_idx ON ito_analytics_snapshots(company_id, captured_at);
