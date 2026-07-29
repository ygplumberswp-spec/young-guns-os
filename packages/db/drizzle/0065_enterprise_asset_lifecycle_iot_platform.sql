-- Enterprise Asset Lifecycle, IoT Monitoring & Predictive Maintenance Platform

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'asset_intelligence';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_asset_maintenance_plan';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_asset_report';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_asset_customer_explanation';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_asset_work_order';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_asset_disposal_request';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'al_ownership_type') THEN
    CREATE TYPE al_ownership_type AS ENUM ('customer_owned', 'company_owned');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'al_lifecycle_stage') THEN
    CREATE TYPE al_lifecycle_stage AS ENUM (
      'procurement',
      'delivery',
      'installation',
      'commissioning',
      'active_operation',
      'inspection',
      'maintenance',
      'repair',
      'upgrade',
      'transfer',
      'decommissioning',
      'disposal'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'al_lifecycle_stage_status') THEN
    CREATE TYPE al_lifecycle_stage_status AS ENUM ('draft', 'pending_approval', 'approved', 'executed', 'cancelled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'al_iot_provider_type') THEN
    CREATE TYPE al_iot_provider_type AS ENUM (
      'mqtt',
      'http_rest',
      'webhook',
      'modbus',
      'lorawan',
      'azure_iot',
      'aws_iot',
      'thingsboard',
      'particle',
      'siemens',
      'schneider',
      'bosch',
      'custom'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'al_iot_adapter_status') THEN
    CREATE TYPE al_iot_adapter_status AS ENUM ('active', 'inactive', 'testing', 'error');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'al_telemetry_field') THEN
    CREATE TYPE al_telemetry_field AS ENUM (
      'temperature',
      'pressure',
      'flow',
      'voltage',
      'current',
      'power',
      'energy_usage',
      'vibration',
      'humidity',
      'water_level',
      'fuel_level',
      'runtime',
      'starts_stops',
      'fault_code',
      'battery_level',
      'signal_strength',
      'gps_position',
      'device_health',
      'custom'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'al_telemetry_quality') THEN
    CREATE TYPE al_telemetry_quality AS ENUM ('good', 'uncertain', 'bad', 'unknown');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'al_alert_severity') THEN
    CREATE TYPE al_alert_severity AS ENUM ('info', 'warning', 'critical', 'emergency');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'al_alert_status') THEN
    CREATE TYPE al_alert_status AS ENUM ('open', 'acknowledged', 'assigned', 'escalated', 'resolved', 'closed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'al_alert_type') THEN
    CREATE TYPE al_alert_type AS ENUM (
      'high_temperature',
      'low_pressure',
      'abnormal_flow',
      'high_energy_usage',
      'vibration_anomaly',
      'water_leak',
      'equipment_offline',
      'sensor_failure',
      'battery_low',
      'warranty_risk',
      'maintenance_overdue',
      'critical_fault_code',
      'custom'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'al_maintenance_due_status') THEN
    CREATE TYPE al_maintenance_due_status AS ENUM ('due', 'overdue', 'scheduled', 'completed', 'cancelled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'al_predictive_status') THEN
    CREATE TYPE al_predictive_status AS ENUM ('recommended', 'acknowledged', 'dismissed', 'actioned');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'al_work_order_draft_type') THEN
    CREATE TYPE al_work_order_draft_type AS ENUM (
      'inspection_request',
      'maintenance_job',
      'emergency_job',
      'technician_assignment',
      'parts_requirement',
      'quotation_draft',
      'customer_notification'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'al_work_order_draft_status') THEN
    CREATE TYPE al_work_order_draft_status AS ENUM ('draft', 'pending_approval', 'approved', 'executed', 'cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS al_platform_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  global_policies jsonb NOT NULL DEFAULT '{}'::jsonb,
  iot_adapter_templates jsonb NOT NULL DEFAULT '{}'::jsonb,
  telemetry_standards jsonb NOT NULL DEFAULT '{}'::jsonb,
  retention_policies jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_alert_policies jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS al_asset_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS al_asset_registry_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL UNIQUE REFERENCES asset_equipment(id) ON DELETE CASCADE,
  category_id uuid REFERENCES al_asset_categories(id) ON DELETE SET NULL,
  custom_category_name text,
  ownership_type al_ownership_type NOT NULL DEFAULT 'company_owned',
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  property_id uuid REFERENCES cx_customer_properties(id) ON DELETE SET NULL,
  manufacturer text,
  model text,
  installation_date date,
  commissioning_date date,
  warranty_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  criticality text,
  lifecycle_stage al_lifecycle_stage NOT NULL DEFAULT 'active_operation',
  linked_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS al_lifecycle_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES asset_equipment(id) ON DELETE CASCADE,
  stage al_lifecycle_stage NOT NULL,
  status al_lifecycle_stage_status NOT NULL DEFAULT 'executed',
  title text NOT NULL,
  description text,
  responsible_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  cost_cents integer,
  currency text DEFAULT 'USD',
  document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS al_iot_provider_adapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider_type al_iot_provider_type NOT NULL,
  provider_key text NOT NULL,
  name text NOT NULL,
  status al_iot_adapter_status NOT NULL DEFAULT 'inactive',
  endpoint_url text,
  credentials_vault_key text,
  is_primary boolean NOT NULL DEFAULT false,
  polling_interval_seconds integer,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_test_at timestamptz,
  last_test_status text,
  last_test_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS al_iot_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider_adapter_id uuid REFERENCES al_iot_provider_adapters(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES asset_equipment(id) ON DELETE SET NULL,
  external_device_id text NOT NULL,
  device_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  connectivity_status text,
  battery_level numeric(5,2),
  signal_strength numeric(5,2),
  telemetry_field_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  threshold_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS al_telemetry_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES al_iot_devices(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES asset_equipment(id) ON DELETE SET NULL,
  provider_adapter_id uuid REFERENCES al_iot_provider_adapters(id) ON DELETE SET NULL,
  field al_telemetry_field NOT NULL,
  custom_field_name text,
  normalized_value numeric(20,6) NOT NULL,
  unit text,
  quality al_telemetry_quality NOT NULL DEFAULT 'good',
  raw_payload_ref text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS al_asset_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES asset_equipment(id) ON DELETE SET NULL,
  device_id uuid REFERENCES al_iot_devices(id) ON DELETE SET NULL,
  alert_type al_alert_type NOT NULL,
  severity al_alert_severity NOT NULL DEFAULT 'warning',
  status al_alert_status NOT NULL DEFAULT 'open',
  title text NOT NULL,
  description text,
  assigned_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  resolution_notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS al_preventive_maintenance_due (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES asset_equipment(id) ON DELETE CASCADE,
  schedule_id uuid REFERENCES asset_maintenance_schedules(id) ON DELETE SET NULL,
  title text NOT NULL,
  due_reason text NOT NULL,
  status al_maintenance_due_status NOT NULL DEFAULT 'due',
  due_at timestamptz,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS al_predictive_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES asset_equipment(id) ON DELETE CASCADE,
  status al_predictive_status NOT NULL DEFAULT 'recommended',
  failure_risk_score numeric(5,2),
  remaining_useful_life_days integer,
  maintenance_recommendation text,
  inspection_recommendation text,
  parts_recommendation text,
  confidence_score numeric(5,2),
  supporting_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  explanation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS al_warranty_compliance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES asset_equipment(id) ON DELETE CASCADE,
  warranty_status text NOT NULL,
  expires_at timestamptz,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  service_interval_days integer,
  compliance_inspection_due_at timestamptz,
  certificate_document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  recall_notice text,
  manufacturer_notice text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS al_work_order_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES asset_equipment(id) ON DELETE SET NULL,
  alert_id uuid REFERENCES al_asset_alerts(id) ON DELETE SET NULL,
  draft_type al_work_order_draft_type NOT NULL,
  status al_work_order_draft_status NOT NULL DEFAULT 'draft',
  subject text NOT NULL,
  description text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS al_analytics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_uptime_percent numeric(5,2),
  downtime_hours numeric(10,2),
  failure_rate numeric(5,2),
  mtbf_hours numeric(10,2),
  mttr_hours numeric(10,2),
  maintenance_cost_cents integer NOT NULL DEFAULT 0,
  energy_usage_kwh numeric(12,2),
  predictive_risk_avg numeric(5,2),
  device_connectivity_percent numeric(5,2),
  alert_response_time_hours numeric(10,2),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS al_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS al_asset_categories_company_idx ON al_asset_categories (company_id, is_active);
CREATE INDEX IF NOT EXISTS al_asset_registry_profiles_company_idx ON al_asset_registry_profiles (company_id);
CREATE INDEX IF NOT EXISTS al_lifecycle_stage_history_asset_idx ON al_lifecycle_stage_history (company_id, asset_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS al_iot_provider_adapters_company_idx ON al_iot_provider_adapters (company_id, status);
CREATE INDEX IF NOT EXISTS al_iot_devices_company_idx ON al_iot_devices (company_id, asset_id);
CREATE INDEX IF NOT EXISTS al_telemetry_readings_device_recorded_idx ON al_telemetry_readings (company_id, device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS al_telemetry_readings_asset_recorded_idx ON al_telemetry_readings (company_id, asset_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS al_asset_alerts_company_status_idx ON al_asset_alerts (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS al_preventive_maintenance_due_company_idx ON al_preventive_maintenance_due (company_id, status, due_at);
CREATE INDEX IF NOT EXISTS al_predictive_assessments_asset_idx ON al_predictive_assessments (company_id, asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS al_analytics_snapshots_company_captured_idx ON al_analytics_snapshots (company_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS al_audit_logs_company_created_idx ON al_audit_logs (company_id, created_at DESC);
