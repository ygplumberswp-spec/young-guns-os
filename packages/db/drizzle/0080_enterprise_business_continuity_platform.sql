-- Enterprise Backup, Disaster Recovery & Business Continuity Platform

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'business_continuity';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_bc_recovery_plan';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_bc_verification_report';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_bc_continuity_improvement';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_bc_recovery_test_schedule';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_bc_restore_request';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bc_workflow_status') THEN
    CREATE TYPE bc_workflow_status AS ENUM ('draft', 'review', 'published', 'deprecated', 'archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bc_alert_severity') THEN
    CREATE TYPE bc_alert_severity AS ENUM ('info', 'warning', 'critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bc_alert_status') THEN
    CREATE TYPE bc_alert_status AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bc_backup_schedule_type') THEN
    CREATE TYPE bc_backup_schedule_type AS ENUM ('hourly', 'daily', 'weekly', 'monthly', 'manual');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bc_backup_job_status') THEN
    CREATE TYPE bc_backup_job_status AS ENUM ('pending', 'running', 'completed', 'failed', 'verified', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bc_restore_scope') THEN
    CREATE TYPE bc_restore_scope AS ENUM ('point_in_time', 'full_tenant', 'module', 'document', 'configuration');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bc_restore_status') THEN
    CREATE TYPE bc_restore_status AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'in_progress', 'completed', 'failed', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bc_recovery_scenario') THEN
    CREATE TYPE bc_recovery_scenario AS ENUM (
      'database_failure', 'storage_failure', 'ai_provider_outage',
      'communication_provider_outage', 'payment_provider_outage',
      'integration_failure', 'infrastructure_outage'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bc_verification_status') THEN
    CREATE TYPE bc_verification_status AS ENUM ('pending', 'passed', 'failed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bc_recovery_test_status') THEN
    CREATE TYPE bc_recovery_test_status AS ENUM ('scheduled', 'in_progress', 'completed', 'failed', 'cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS bc_platform_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  backup_policy JSONB NOT NULL DEFAULT '{}',
  restore_policy JSONB NOT NULL DEFAULT '{}',
  verification_policy JSONB NOT NULL DEFAULT '{}',
  dr_policy JSONB NOT NULL DEFAULT '{}',
  compliance_policy JSONB NOT NULL DEFAULT '{}',
  encryption_required BOOLEAN NOT NULL DEFAULT TRUE,
  audit_retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bc_backup_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  policy_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  schedule_type bc_backup_schedule_type NOT NULL DEFAULT 'daily',
  schedule_cron TEXT,
  retention_days INTEGER NOT NULL DEFAULT 30,
  backup_scope JSONB NOT NULL DEFAULT '{}',
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  workflow_status bc_workflow_status NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bc_backup_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES bc_backup_policies(id) ON DELETE SET NULL,
  schedule_type bc_backup_schedule_type NOT NULL DEFAULT 'manual',
  backup_scope JSONB NOT NULL DEFAULT '{}',
  status bc_backup_job_status NOT NULL DEFAULT 'pending',
  encrypted BOOLEAN NOT NULL DEFAULT TRUE,
  size_bytes BIGINT,
  verification_status bc_verification_status,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS bc_restore_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  restore_scope bc_restore_scope NOT NULL,
  target_module TEXT,
  target_entity_id UUID,
  point_in_time TIMESTAMPTZ,
  status bc_restore_status NOT NULL DEFAULT 'draft',
  requires_owner_approval BOOLEAN NOT NULL DEFAULT TRUE,
  title TEXT NOT NULL,
  description TEXT,
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bc_recovery_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  scenario_key bc_recovery_scenario NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  recovery_steps JSONB NOT NULL DEFAULT '[]',
  estimated_recovery_time_minutes INTEGER,
  dependencies JSONB NOT NULL DEFAULT '[]',
  validation_checklist JSONB NOT NULL DEFAULT '[]',
  workflow_status bc_workflow_status NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bc_recovery_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  recovery_plan_id UUID REFERENCES bc_recovery_plans(id) ON DELETE SET NULL,
  backup_job_id UUID REFERENCES bc_backup_jobs(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status bc_recovery_test_status NOT NULL DEFAULT 'scheduled',
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  success BOOLEAN,
  failures JSONB NOT NULL DEFAULT '[]',
  recovery_time_minutes INTEGER,
  lessons_learned TEXT,
  is_production_safe BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bc_verification_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  backup_job_id UUID REFERENCES bc_backup_jobs(id) ON DELETE SET NULL,
  verification_type TEXT NOT NULL,
  status bc_verification_status NOT NULL DEFAULT 'pending',
  passed BOOLEAN,
  findings JSONB NOT NULL DEFAULT '{}',
  verified_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bc_storage_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  storage_type TEXT NOT NULL,
  health_status TEXT NOT NULL DEFAULT 'unknown',
  usage_bytes BIGINT,
  capacity_bytes BIGINT,
  redundancy_level TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bc_compliance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  compliance_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown',
  rpo_minutes INTEGER,
  rto_minutes INTEGER,
  last_verified_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bc_continuity_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity bc_alert_severity NOT NULL DEFAULT 'warning',
  status bc_alert_status NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT,
  source_module TEXT,
  context JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bc_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  metrics JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bc_action_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  draft_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_records JSONB NOT NULL DEFAULT '{}',
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  workflow_status bc_workflow_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bc_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bc_backup_policies_company ON bc_backup_policies(company_id);
CREATE INDEX IF NOT EXISTS idx_bc_backup_jobs_company ON bc_backup_jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_bc_restore_requests_company ON bc_restore_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_bc_recovery_plans_company ON bc_recovery_plans(company_id);
CREATE INDEX IF NOT EXISTS idx_bc_recovery_tests_company ON bc_recovery_tests(company_id);
CREATE INDEX IF NOT EXISTS idx_bc_verification_records_company ON bc_verification_records(company_id);
CREATE INDEX IF NOT EXISTS idx_bc_continuity_alerts_company ON bc_continuity_alerts(company_id);
