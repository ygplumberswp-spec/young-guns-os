-- Enterprise Mobile Platform, Offline Operations & Field Intelligence

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'mobile_field';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_mobile_report';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_mobile_quotation';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_mobile_maintenance_note';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_mobile_troubleshooting_guide';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mobile_device_platform') THEN
    CREATE TYPE mobile_device_platform AS ENUM ('ios', 'android', 'web', 'pwa', 'tablet');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mobile_device_status') THEN
    CREATE TYPE mobile_device_status AS ENUM ('active', 'inactive', 'revoked', 'lost');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mobile_fleet_provider_type') THEN
    CREATE TYPE mobile_fleet_provider_type AS ENUM (
      'cartrack',
      'netstar',
      'ctrack',
      'tracker',
      'mix_telematics',
      'geotab',
      'samsara',
      'verizon_connect',
      'wialon',
      'traccar',
      'generic_rest',
      'generic_mqtt'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mobile_sync_history_status') THEN
    CREATE TYPE mobile_sync_history_status AS ENUM ('completed', 'partial', 'failed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mobile_media_type') THEN
    CREATE TYPE mobile_media_type AS ENUM (
      'photo',
      'video',
      'document',
      'barcode',
      'qr_code',
      'signature',
      'voice_note'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mobile_offline_resource_type') THEN
    CREATE TYPE mobile_offline_resource_type AS ENUM (
      'job',
      'customer',
      'quote',
      'invoice',
      'asset',
      'inventory',
      'vehicle',
      'timesheet',
      'inspection',
      'checklist',
      'document',
      'photo',
      'signature',
      'note',
      'form'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS mobile_platform_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  offline_retention_days integer NOT NULL DEFAULT 7,
  sync_frequency_minutes integer NOT NULL DEFAULT 15,
  push_notifications_enabled boolean NOT NULL DEFAULT true,
  biometric_login_required boolean NOT NULL DEFAULT false,
  pwa_enabled boolean NOT NULL DEFAULT true,
  background_sync_enabled boolean NOT NULL DEFAULT true,
  notification_policies jsonb NOT NULL DEFAULT '{}'::jsonb,
  mobile_policies jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mobile_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  device_key text NOT NULL,
  device_name text,
  platform mobile_device_platform NOT NULL DEFAULT 'web',
  status mobile_device_status NOT NULL DEFAULT 'active',
  app_version text,
  os_version text,
  encryption_verified boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz,
  registered_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, device_key)
);

CREATE TABLE IF NOT EXISTS mobile_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES mobile_devices(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  token text NOT NULL,
  provider text NOT NULL DEFAULT 'web_push',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mobile_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  media_type mobile_media_type NOT NULL,
  title text NOT NULL,
  file_name text,
  mime_type text,
  size_bytes integer,
  storage_key text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  captured_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mobile_sync_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  device_id uuid REFERENCES mobile_devices(id) ON DELETE SET NULL,
  status mobile_sync_history_status NOT NULL DEFAULT 'completed',
  processed_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  conflict_count integer NOT NULL DEFAULT 0,
  retried_count integer NOT NULL DEFAULT 0,
  trigger_type text NOT NULL DEFAULT 'manual',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_message text
);

CREATE TABLE IF NOT EXISTS mobile_fleet_tracking_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider_type mobile_fleet_provider_type NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  credentials_vault_key text,
  endpoint_url text,
  vehicle_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_test_at timestamptz,
  last_test_status text,
  last_test_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mobile_field_intelligence_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  technician_productivity_score numeric(5,2),
  travel_efficiency_score numeric(5,2),
  avg_job_duration_minutes numeric(10,2),
  first_time_fix_rate numeric(5,2),
  offline_usage_count integer NOT NULL DEFAULT 0,
  sync_health_score numeric(5,2),
  device_health_score numeric(5,2),
  fleet_utilization_percent numeric(5,2),
  safety_compliance_score numeric(5,2),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mobile_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  device_id uuid REFERENCES mobile_devices(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mobile_devices_company_status_idx ON mobile_devices (company_id, status);
CREATE INDEX IF NOT EXISTS mobile_sync_history_company_started_idx ON mobile_sync_history (company_id, started_at DESC);
CREATE INDEX IF NOT EXISTS mobile_media_assets_company_job_idx ON mobile_media_assets (company_id, job_id);
CREATE INDEX IF NOT EXISTS mobile_field_intelligence_company_captured_idx ON mobile_field_intelligence_snapshots (company_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS mobile_audit_logs_company_created_idx ON mobile_audit_logs (company_id, created_at DESC);
