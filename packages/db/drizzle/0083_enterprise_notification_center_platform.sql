-- Enterprise Notification Center, Alerts & Escalation Platform

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'notification_intelligence';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_nc_template';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_nc_escalation_rule';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_nc_delivery_report';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_nc_improvement_recommendation';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nc_alert_level') THEN
    CREATE TYPE nc_alert_level AS ENUM ('info', 'success', 'warning', 'critical', 'emergency');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nc_alert_status') THEN
    CREATE TYPE nc_alert_status AS ENUM ('open', 'acknowledged', 'resolved', 'escalated', 'expired');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nc_delivery_channel') THEN
    CREATE TYPE nc_delivery_channel AS ENUM (
      'in_app', 'email', 'sms', 'whatsapp', 'push', 'slack', 'microsoft_teams', 'webhook'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nc_delivery_status') THEN
    CREATE TYPE nc_delivery_status AS ENUM (
      'queued', 'sent', 'delivered', 'failed', 'read', 'acknowledged', 'dismissed', 'escalated'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nc_escalation_status') THEN
    CREATE TYPE nc_escalation_status AS ENUM ('pending', 'acknowledged', 'resolved', 'escalated', 'expired');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nc_rule_scope') THEN
    CREATE TYPE nc_rule_scope AS ENUM ('user', 'role', 'department', 'company');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nc_module_source') THEN
    CREATE TYPE nc_module_source AS ENUM (
      'crm', 'leads', 'customers', 'jobs', 'quotes', 'scheduling', 'dispatch', 'fleet',
      'inventory', 'procurement', 'finance', 'documents', 'document_ai', 'communications',
      'voice_reception', 'ai_agents', 'mission_control', 'security', 'saas_management',
      'industry_packs', 'business_continuity', 'data_migration'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nc_platform_alert_severity') THEN
    CREATE TYPE nc_platform_alert_severity AS ENUM ('info', 'warning', 'critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nc_platform_alert_status') THEN
    CREATE TYPE nc_platform_alert_status AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nc_delivery_mode') THEN
    CREATE TYPE nc_delivery_mode AS ENUM ('immediate', 'digest', 'quiet_hours');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS nc_platform_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  delivery_policy JSONB NOT NULL DEFAULT '{}',
  escalation_policy JSONB NOT NULL DEFAULT '{}',
  quiet_hours_policy JSONB NOT NULL DEFAULT '{}',
  alert_level_config JSONB NOT NULL DEFAULT '{}',
  audit_retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nc_notification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  scope nc_rule_scope NOT NULL DEFAULT 'company',
  scope_ref_id UUID,
  module_source nc_module_source,
  event_type TEXT,
  severity nc_alert_level,
  delivery_mode nc_delivery_mode NOT NULL DEFAULT 'immediate',
  channels JSONB NOT NULL DEFAULT '[]',
  quiet_hours_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  digest_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 0,
  conditions JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nc_notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  name TEXT NOT NULL,
  module_source nc_module_source,
  event_type TEXT,
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]',
  locale TEXT NOT NULL DEFAULT 'en',
  branding JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, template_key, locale)
);

CREATE TABLE IF NOT EXISTS nc_delivery_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alert_id UUID,
  notification_id UUID,
  template_id UUID REFERENCES nc_notification_templates(id) ON DELETE SET NULL,
  recipient_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  channel nc_delivery_channel NOT NULL,
  status nc_delivery_status NOT NULL DEFAULT 'queued',
  module_source nc_module_source,
  event_type TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  provider_adapter_id UUID,
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nc_delivery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  delivery_job_id UUID NOT NULL REFERENCES nc_delivery_jobs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  status nc_delivery_status NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nc_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  alert_level nc_alert_level NOT NULL DEFAULT 'info',
  status nc_alert_status NOT NULL DEFAULT 'open',
  module_source nc_module_source,
  event_type TEXT,
  source_entity_type TEXT,
  source_entity_id UUID,
  assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nc_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alert_id UUID NOT NULL REFERENCES nc_alerts(id) ON DELETE CASCADE,
  escalation_step INTEGER NOT NULL DEFAULT 1,
  status nc_escalation_status NOT NULL DEFAULT 'pending',
  escalate_to_type TEXT NOT NULL DEFAULT 'role',
  escalate_to_ref TEXT,
  escalate_after_minutes INTEGER NOT NULL DEFAULT 30,
  escalated_at TIMESTAMPTZ,
  acknowledged_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nc_inbox_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_id UUID NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  snoozed_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, user_id, notification_id)
);

CREATE TABLE IF NOT EXISTS nc_user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel nc_delivery_channel NOT NULL,
  module_source nc_module_source,
  event_type TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  delivery_mode nc_delivery_mode NOT NULL DEFAULT 'immediate',
  quiet_hours_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nc_platform_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity nc_platform_alert_severity NOT NULL DEFAULT 'info',
  status nc_platform_alert_status NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT,
  delivery_job_id UUID REFERENCES nc_delivery_jobs(id) ON DELETE SET NULL,
  alert_id UUID REFERENCES nc_alerts(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nc_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  metrics JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nc_action_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  draft_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_records JSONB NOT NULL DEFAULT '{}',
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nc_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nc_notification_rules_company ON nc_notification_rules(company_id);
CREATE INDEX IF NOT EXISTS idx_nc_notification_templates_company ON nc_notification_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_nc_delivery_jobs_company ON nc_delivery_jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_nc_delivery_jobs_status ON nc_delivery_jobs(company_id, status);
CREATE INDEX IF NOT EXISTS idx_nc_delivery_events_job ON nc_delivery_events(delivery_job_id);
CREATE INDEX IF NOT EXISTS idx_nc_alerts_company ON nc_alerts(company_id);
CREATE INDEX IF NOT EXISTS idx_nc_alerts_status ON nc_alerts(company_id, status);
CREATE INDEX IF NOT EXISTS idx_nc_escalations_company ON nc_escalations(company_id);
CREATE INDEX IF NOT EXISTS idx_nc_escalations_alert ON nc_escalations(alert_id);
CREATE INDEX IF NOT EXISTS idx_nc_inbox_state_user ON nc_inbox_state(company_id, user_id);
CREATE INDEX IF NOT EXISTS idx_nc_user_preferences_user ON nc_user_preferences(company_id, user_id);
CREATE INDEX IF NOT EXISTS idx_nc_platform_alerts_company ON nc_platform_alerts(company_id);
CREATE INDEX IF NOT EXISTS idx_nc_audit_logs_company ON nc_audit_logs(company_id);
