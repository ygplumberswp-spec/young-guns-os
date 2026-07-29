-- Enterprise Public API, Webhooks, SDK & Integration Platform

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'developer_platform';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_pdp_integration_guide';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_pdp_webhook_config';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_pdp_api_example';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_pdp_sdk_example';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_pdp_diagnostic_report';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pdp_workflow_status') THEN
    CREATE TYPE pdp_workflow_status AS ENUM ('draft', 'review', 'published', 'deprecated', 'archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pdp_alert_severity') THEN
    CREATE TYPE pdp_alert_severity AS ENUM ('info', 'warning', 'critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pdp_alert_status') THEN
    CREATE TYPE pdp_alert_status AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS pdp_platform_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  api_policy JSONB NOT NULL DEFAULT '{}',
  webhook_policy JSONB NOT NULL DEFAULT '{}',
  auth_policy JSONB NOT NULL DEFAULT '{}',
  rate_limit_policy JSONB NOT NULL DEFAULT '{}',
  sandbox_policy JSONB NOT NULL DEFAULT '{}',
  audit_retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pdp_api_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  version_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  base_path TEXT NOT NULL,
  status pdp_workflow_status NOT NULL DEFAULT 'published',
  deprecated_at TIMESTAMPTZ,
  sunset_at TIMESTAMPTZ,
  compatibility JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pdp_api_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  scope_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  resource_type TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]',
  is_system_scope BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pdp_webhook_event_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  payload_schema JSONB NOT NULL DEFAULT '{}',
  is_system_event BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pdp_rate_limit_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  policy_key TEXT NOT NULL,
  name TEXT NOT NULL,
  tenant_limit_per_minute INTEGER,
  application_limit_per_minute INTEGER,
  burst_limit INTEGER,
  config JSONB NOT NULL DEFAULT '{}',
  workflow_status pdp_workflow_status NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pdp_sandbox_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sandbox_base_url TEXT,
  test_key_policy JSONB NOT NULL DEFAULT '{}',
  webhook_test_policy JSONB NOT NULL DEFAULT '{}',
  config JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pdp_sdk_generation_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  version TEXT NOT NULL,
  package_name TEXT NOT NULL,
  openapi_version TEXT,
  sdk_package_id UUID,
  manifest JSONB NOT NULL DEFAULT '{}',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pdp_api_status_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  overall_status TEXT NOT NULL,
  api_availability TEXT,
  webhook_health TEXT,
  sdk_status TEXT,
  metrics JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pdp_developer_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity pdp_alert_severity NOT NULL DEFAULT 'warning',
  status pdp_alert_status NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT,
  source_module TEXT,
  context JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pdp_action_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  draft_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_records JSONB NOT NULL DEFAULT '{}',
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  workflow_status pdp_workflow_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pdp_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  metrics JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pdp_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pdp_api_versions_key_idx ON pdp_api_versions(version_key);
CREATE INDEX IF NOT EXISTS pdp_api_scopes_key_idx ON pdp_api_scopes(scope_key);
CREATE INDEX IF NOT EXISTS pdp_webhook_event_types_key_idx ON pdp_webhook_event_types(event_key);
CREATE INDEX IF NOT EXISTS pdp_developer_alerts_company_status_idx ON pdp_developer_alerts(company_id, status);
