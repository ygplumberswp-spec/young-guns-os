-- Enterprise AI Voice Receptionist, Call Intelligence & Unified Telephony Platform

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'voice_reception';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_vr_call_summary';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_vr_follow_up_tasks';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_vr_crm_note';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_vr_job_note';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_vr_callback_request';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_vr_lead_creation';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_vr_appointment_booking';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_vr_routing_recommendation';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vr_workflow_status') THEN
    CREATE TYPE vr_workflow_status AS ENUM ('draft', 'review', 'published', 'deprecated', 'archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vr_alert_severity') THEN
    CREATE TYPE vr_alert_severity AS ENUM ('info', 'warning', 'critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vr_alert_status') THEN
    CREATE TYPE vr_alert_status AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS vr_platform_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  telephony_policy JSONB NOT NULL DEFAULT '{}',
  receptionist_policy JSONB NOT NULL DEFAULT '{}',
  routing_policy JSONB NOT NULL DEFAULT '{}',
  recording_policy JSONB NOT NULL DEFAULT '{}',
  language_policy JSONB NOT NULL DEFAULT '{}',
  audit_retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vr_telephony_provider_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  config JSONB NOT NULL DEFAULT '{}',
  workflow_status vr_workflow_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vr_extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  extension_key TEXT NOT NULL,
  name TEXT NOT NULL,
  destination_type TEXT NOT NULL,
  destination_ref TEXT,
  location_key TEXT,
  workflow_status vr_workflow_status NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vr_ring_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  group_key TEXT NOT NULL,
  name TEXT NOT NULL,
  extension_ids JSONB NOT NULL DEFAULT '[]',
  strategy TEXT NOT NULL DEFAULT 'simultaneous',
  workflow_status vr_workflow_status NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vr_call_queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  queue_key TEXT NOT NULL,
  name TEXT NOT NULL,
  max_wait_seconds INTEGER,
  overflow_destination TEXT,
  workflow_status vr_workflow_status NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vr_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,
  name TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  match_criteria JSONB NOT NULL DEFAULT '{}',
  destination_type TEXT NOT NULL,
  destination_ref TEXT,
  workflow_status vr_workflow_status NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vr_business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  schedule_key TEXT NOT NULL,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  weekly_schedule JSONB NOT NULL DEFAULT '{}',
  holiday_overrides JSONB NOT NULL DEFAULT '{}',
  after_hours_destination TEXT,
  workflow_status vr_workflow_status NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vr_emergency_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,
  name TEXT NOT NULL,
  trigger_keywords JSONB NOT NULL DEFAULT '[]',
  escalation_workflow JSONB NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 1,
  workflow_status vr_workflow_status NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vr_voicemail_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  policy_key TEXT NOT NULL,
  name TEXT NOT NULL,
  greeting_text TEXT,
  retention_days INTEGER NOT NULL DEFAULT 30,
  config JSONB NOT NULL DEFAULT '{}',
  workflow_status vr_workflow_status NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vr_ai_receptionist_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  welcome_message TEXT,
  confidence_threshold INTEGER NOT NULL DEFAULT 70,
  escalation_policy JSONB NOT NULL DEFAULT '{}',
  knowledge_policy JSONB NOT NULL DEFAULT '{}',
  config JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vr_language_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vr_location_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  location_key TEXT NOT NULL,
  name TEXT NOT NULL,
  routing_config JSONB NOT NULL DEFAULT '{}',
  business_hours_id UUID REFERENCES vr_business_hours(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vr_call_intelligence_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  voice_session_id UUID REFERENCES voice_sessions(id) ON DELETE SET NULL,
  duration_seconds INTEGER,
  queue_time_seconds INTEGER,
  hold_time_seconds INTEGER,
  transfer_count INTEGER NOT NULL DEFAULT 0,
  outcome TEXT,
  sentiment TEXT,
  intent TEXT,
  category TEXT,
  action_items JSONB NOT NULL DEFAULT '[]',
  follow_ups JSONB NOT NULL DEFAULT '[]',
  metrics JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vr_conversation_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  voice_session_id UUID REFERENCES voice_sessions(id) ON DELETE SET NULL,
  draft_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  approval_required BOOLEAN NOT NULL DEFAULT TRUE,
  workflow_status vr_workflow_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vr_recording_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  policy_key TEXT NOT NULL,
  name TEXT NOT NULL,
  consent_required BOOLEAN NOT NULL DEFAULT TRUE,
  retention_days INTEGER NOT NULL DEFAULT 90,
  regional_rules JSONB NOT NULL DEFAULT '{}',
  workflow_status vr_workflow_status NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vr_quality_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  metrics JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vr_voice_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity vr_alert_severity NOT NULL DEFAULT 'warning',
  status vr_alert_status NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT,
  source_module TEXT,
  context JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vr_action_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  draft_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_records JSONB NOT NULL DEFAULT '{}',
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  workflow_status vr_workflow_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vr_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  metrics JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vr_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vr_voice_alerts_company_status ON vr_voice_alerts(company_id, status);
CREATE INDEX IF NOT EXISTS idx_vr_call_intelligence_company ON vr_call_intelligence_records(company_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_vr_telephony_providers_company ON vr_telephony_provider_configs(company_id);
