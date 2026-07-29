-- Enterprise AURA App Builder, Natural-Language Development & Product Engineering Platform

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'app_builder';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ab_implementation_plan';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ab_requirements_spec';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ab_architecture_impact_report';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ab_code_generation_plan';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ab_test_plan';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ab_deployment_plan';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ab_documentation_update';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ab_feature_changelog';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ab_rollback_plan';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ab_workflow_status') THEN
    CREATE TYPE ab_workflow_status AS ENUM (
      'draft',
      'review',
      'pending_approval',
      'approved',
      'executed',
      'cancelled',
      'archived'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ab_risk_level') THEN
    CREATE TYPE ab_risk_level AS ENUM ('low', 'medium', 'high', 'critical');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ab_feature_request_status') THEN
    CREATE TYPE ab_feature_request_status AS ENUM (
      'submitted',
      'analyzing',
      'planned',
      'in_development',
      'testing',
      'preview',
      'pending_approval',
      'approved',
      'deployed',
      'rolled_back',
      'rejected',
      'archived'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ab_deployment_status') THEN
    CREATE TYPE ab_deployment_status AS ENUM (
      'planned',
      'building',
      'deploying',
      'deployed',
      'failed',
      'rolled_back'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ab_test_status') THEN
    CREATE TYPE ab_test_status AS ENUM ('pending', 'running', 'passed', 'failed', 'skipped');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ab_approval_status') THEN
    CREATE TYPE ab_approval_status AS ENUM ('pending', 'approved', 'rejected', 'deferred');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ab_alert_severity') THEN
    CREATE TYPE ab_alert_severity AS ENUM ('info', 'warning', 'critical');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ab_alert_status') THEN
    CREATE TYPE ab_alert_status AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ab_platform_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  auto_approve_rules JSONB NOT NULL DEFAULT '{}',
  deployment_standards JSONB NOT NULL DEFAULT '{}',
  testing_requirements JSONB NOT NULL DEFAULT '{}',
  documentation_policy JSONB NOT NULL DEFAULT '{}',
  rollback_policy JSONB NOT NULL DEFAULT '{}',
  owner_approval_required_areas JSONB NOT NULL DEFAULT '{}',
  audit_retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ab_feature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL,
  title TEXT NOT NULL,
  natural_language_request TEXT,
  request_type TEXT NOT NULL,
  workflow_status ab_feature_request_status NOT NULL DEFAULT 'submitted',
  risk_level ab_risk_level NOT NULL DEFAULT 'medium',
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ab_requirements_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  feature_request_id UUID NOT NULL REFERENCES ab_feature_requests(id) ON DELETE CASCADE,
  functional_requirements JSONB NOT NULL DEFAULT '{}',
  technical_requirements JSONB NOT NULL DEFAULT '{}',
  acceptance_criteria JSONB NOT NULL DEFAULT '{}',
  dependencies JSONB NOT NULL DEFAULT '{}',
  estimated_complexity TEXT,
  risk_level ab_risk_level NOT NULL DEFAULT 'medium',
  implementation_plan TEXT,
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ab_architecture_impact_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  feature_request_id UUID NOT NULL REFERENCES ab_feature_requests(id) ON DELETE CASCADE,
  frontend_impact TEXT,
  backend_impact TEXT,
  database_impact TEXT,
  api_impact TEXT,
  shared_types_impact TEXT,
  rbac_impact TEXT,
  security_impact TEXT,
  tenant_isolation_impact TEXT,
  affected_modules JSONB NOT NULL DEFAULT '{}',
  breaking_change_risk TEXT,
  analysis JSONB NOT NULL DEFAULT '{}',
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ab_development_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  feature_request_id UUID NOT NULL REFERENCES ab_feature_requests(id) ON DELETE CASCADE,
  workspace_key TEXT NOT NULL,
  branch_name TEXT,
  isolation_mode TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  files_changed JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ab_code_generation_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  feature_request_id UUID NOT NULL REFERENCES ab_feature_requests(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES ab_development_workspaces(id) ON DELETE SET NULL,
  generation_key TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  artifact_path TEXT,
  language TEXT,
  workflow_status ab_workflow_status NOT NULL DEFAULT 'draft',
  generated_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ab_database_change_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  feature_request_id UUID NOT NULL REFERENCES ab_feature_requests(id) ON DELETE CASCADE,
  migration_key TEXT NOT NULL,
  description TEXT,
  impact_analysis JSONB NOT NULL DEFAULT '{}',
  conflict_detection JSONB NOT NULL DEFAULT '{}',
  breaking_changes JSONB NOT NULL DEFAULT '{}',
  estimated_duration_minutes INTEGER,
  requires_owner_approval BOOLEAN NOT NULL DEFAULT FALSE,
  workflow_status ab_workflow_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ab_test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  feature_request_id UUID NOT NULL REFERENCES ab_feature_requests(id) ON DELETE CASCADE,
  run_key TEXT NOT NULL,
  test_suite TEXT NOT NULL,
  workflow_status ab_test_status NOT NULL DEFAULT 'pending',
  passed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  results JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ab_preview_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  feature_request_id UUID NOT NULL REFERENCES ab_feature_requests(id) ON DELETE CASCADE,
  preview_key TEXT NOT NULL,
  preview_url TEXT,
  change_summary TEXT,
  files_modified JSONB NOT NULL DEFAULT '{}',
  database_impact TEXT,
  api_impact TEXT,
  performance_impact TEXT,
  security_impact TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ab_approval_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  feature_request_id UUID NOT NULL REFERENCES ab_feature_requests(id) ON DELETE CASCADE,
  approval_type TEXT NOT NULL,
  workflow_status ab_approval_status NOT NULL DEFAULT 'pending',
  required_areas JSONB NOT NULL DEFAULT '{}',
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  rejected_reason TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ab_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  feature_request_id UUID NOT NULL REFERENCES ab_feature_requests(id) ON DELETE CASCADE,
  deployment_key TEXT NOT NULL,
  environment TEXT NOT NULL,
  workflow_status ab_deployment_status NOT NULL DEFAULT 'planned',
  version TEXT,
  deployed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  verification_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ab_rollbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  deployment_id UUID NOT NULL REFERENCES ab_deployments(id) ON DELETE CASCADE,
  rollback_key TEXT NOT NULL,
  reason TEXT,
  workflow_status ab_workflow_status NOT NULL DEFAULT 'draft',
  executed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  executed_at TIMESTAMPTZ,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ab_documentation_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  feature_request_id UUID NOT NULL REFERENCES ab_feature_requests(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  doc_path TEXT,
  change_summary TEXT,
  workflow_status ab_workflow_status NOT NULL DEFAULT 'draft',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ab_feature_registry_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  registry_key TEXT NOT NULL,
  feature_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  version TEXT NOT NULL DEFAULT '1.0.0',
  status TEXT NOT NULL DEFAULT 'active',
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  dependencies JSONB NOT NULL DEFAULT '{}',
  module_key TEXT,
  route_path TEXT,
  api_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ab_app_builder_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity ab_alert_severity NOT NULL DEFAULT 'warning',
  status ab_alert_status NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT,
  feature_request_id UUID REFERENCES ab_feature_requests(id) ON DELETE SET NULL,
  source_module TEXT,
  context JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ab_action_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  draft_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  feature_request_id UUID REFERENCES ab_feature_requests(id) ON DELETE SET NULL,
  source_records JSONB NOT NULL DEFAULT '{}',
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  workflow_status ab_workflow_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ab_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  metrics JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ab_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
