-- Enterprise AI Voice, Calls & Unified Communications Platform

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'communications';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_communications_reply';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_communications_sms';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_communications_whatsapp';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_communications_email';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_call_summary';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_follow_up_task';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_appointment_confirmation';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_customer_update';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'uc_provider_channel') THEN
    CREATE TYPE uc_provider_channel AS ENUM (
      'voice',
      'whatsapp',
      'sms',
      'email',
      'live_chat',
      'website_chat',
      'facebook_messenger',
      'instagram',
      'microsoft_teams',
      'slack',
      'custom'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'uc_provider_adapter_status') THEN
    CREATE TYPE uc_provider_adapter_status AS ENUM ('active', 'inactive', 'testing', 'error');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'uc_outbound_call_type') THEN
    CREATE TYPE uc_outbound_call_type AS ENUM (
      'appointment_confirmation',
      'reminder',
      'missed_appointment',
      'satisfaction',
      'payment_reminder',
      'maintenance_reminder',
      'quote_followup',
      'lead_qualification'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'uc_outbound_campaign_status') THEN
    CREATE TYPE uc_outbound_campaign_status AS ENUM (
      'draft',
      'pending_approval',
      'approved',
      'rejected',
      'executed',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'uc_dispatch_notification_type') THEN
    CREATE TYPE uc_dispatch_notification_type AS ENUM (
      'appointment_confirmation',
      'technician_en_route',
      'eta',
      'tracking_link',
      'arrival',
      'completion',
      'invoice'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'uc_dispatch_notification_status') THEN
    CREATE TYPE uc_dispatch_notification_status AS ENUM (
      'pending',
      'sent',
      'failed',
      'skipped'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'uc_timeline_entry_type') THEN
    CREATE TYPE uc_timeline_entry_type AS ENUM (
      'call',
      'whatsapp',
      'sms',
      'email',
      'live_chat',
      'internal_note',
      'ai_summary',
      'attachment',
      'portal_message'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS uc_platform_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  global_policies jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_voice_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  recording_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  retention_days integer NOT NULL DEFAULT 365,
  consent_required boolean NOT NULL DEFAULT true,
  routing_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  notification_templates jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS uc_provider_adapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  channel uc_provider_channel NOT NULL,
  provider_key text NOT NULL,
  name text NOT NULL,
  status uc_provider_adapter_status NOT NULL DEFAULT 'inactive',
  credentials_vault_key text,
  endpoint_url text,
  is_primary boolean NOT NULL DEFAULT false,
  last_test_at timestamptz,
  last_test_status text,
  last_test_message text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, channel, provider_key)
);

CREATE TABLE IF NOT EXISTS uc_outbound_call_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  campaign_type uc_outbound_call_type NOT NULL,
  status uc_outbound_campaign_status NOT NULL DEFAULT 'draft',
  subject text NOT NULL,
  script_template text,
  target_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  consent_required boolean NOT NULL DEFAULT true,
  scheduled_at timestamptz,
  executed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS uc_dispatch_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  notification_type uc_dispatch_notification_type NOT NULL,
  channel uc_provider_channel,
  provider_adapter_id uuid REFERENCES uc_provider_adapters(id) ON DELETE SET NULL,
  status uc_dispatch_notification_status NOT NULL DEFAULT 'pending',
  recipient_address text,
  message_body text,
  tracking_link text,
  eta_minutes integer,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS uc_timeline_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  entry_type uc_timeline_entry_type NOT NULL,
  channel uc_provider_channel,
  title text NOT NULL,
  summary text,
  source_module text NOT NULL,
  source_entity_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS uc_analytics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  calls_answered integer NOT NULL DEFAULT 0,
  calls_missed integer NOT NULL DEFAULT 0,
  avg_response_time_seconds numeric(10,2),
  ai_resolution_rate numeric(5,2),
  human_transfer_rate numeric(5,2),
  booking_conversion_rate numeric(5,2),
  lead_conversion_rate numeric(5,2),
  customer_satisfaction_score numeric(5,2),
  channel_usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_performance jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS uc_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  channel uc_provider_channel,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS uc_provider_adapters_company_channel_idx ON uc_provider_adapters (company_id, channel);
CREATE INDEX IF NOT EXISTS uc_timeline_index_company_occurred_idx ON uc_timeline_index (company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS uc_timeline_index_customer_idx ON uc_timeline_index (company_id, customer_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS uc_dispatch_notifications_job_idx ON uc_dispatch_notifications (company_id, job_id);
CREATE INDEX IF NOT EXISTS uc_analytics_snapshots_company_captured_idx ON uc_analytics_snapshots (company_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS uc_audit_logs_company_created_idx ON uc_audit_logs (company_id, created_at DESC);
