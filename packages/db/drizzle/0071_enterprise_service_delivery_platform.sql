-- Enterprise Service Delivery, Quality Assurance & SLA Operations Platform

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'service_delivery';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_sd_quality_report';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_sd_corrective_action';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_sd_customer_summary';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_sd_sla_report';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_sd_inspection_summary';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_sd_warranty_report';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_sd_callback_analysis';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_sd_continuous_improvement_plan';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_sd_executive_service_summary';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sd_workflow_status') THEN
    CREATE TYPE sd_workflow_status AS ENUM (
      'draft',
      'review',
      'pending_approval',
      'approved',
      'executed',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sd_alert_severity') THEN
    CREATE TYPE sd_alert_severity AS ENUM ('info', 'warning', 'critical');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sd_alert_status') THEN
    CREATE TYPE sd_alert_status AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sd_inspection_status') THEN
    CREATE TYPE sd_inspection_status AS ENUM (
      'draft',
      'in_progress',
      'review',
      'approved',
      'completed',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sd_promise_type') THEN
    CREATE TYPE sd_promise_type AS ENUM (
      'arrival_window',
      'eta',
      'response_time',
      'sla',
      'resolution_time',
      'quality',
      'warranty',
      'contract',
      'maintenance',
      'custom'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sd_sla_type') THEN
    CREATE TYPE sd_sla_type AS ENUM (
      'response',
      'arrival',
      'completion',
      'contract',
      'customer',
      'warranty',
      'internal'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS sd_platform_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  service_standards JSONB NOT NULL DEFAULT '{}',
  promise_templates JSONB NOT NULL DEFAULT '{}',
  sla_templates JSONB NOT NULL DEFAULT '{}',
  inspection_templates JSONB NOT NULL DEFAULT '{}',
  quality_standards JSONB NOT NULL DEFAULT '{}',
  warranty_standards JSONB NOT NULL DEFAULT '{}',
  audit_retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sd_service_promises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  promise_type sd_promise_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  workflow_status sd_workflow_status NOT NULL DEFAULT 'draft',
  promised_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sd_sla_frameworks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  framework_key TEXT NOT NULL,
  sla_type sd_sla_type NOT NULL,
  target_minutes INTEGER,
  warning_threshold_minutes INTEGER,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sd_sla_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  framework_id UUID REFERENCES sd_sla_frameworks(id) ON DELETE SET NULL,
  sla_type sd_sla_type NOT NULL,
  target_at TIMESTAMPTZ,
  breached_at TIMESTAMPTZ,
  met_at TIMESTAMPTZ,
  breach_minutes INTEGER,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sd_job_execution_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  technician_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  snapshot_key TEXT NOT NULL,
  execution_phase TEXT,
  metrics JSONB NOT NULL DEFAULT '{}',
  config JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sd_inspection_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_key TEXT NOT NULL,
  description TEXT,
  checklist JSONB NOT NULL DEFAULT '{}',
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sd_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  template_id UUID REFERENCES sd_inspection_templates(id) ON DELETE SET NULL,
  inspection_status sd_inspection_status NOT NULL DEFAULT 'draft',
  inspector_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  findings JSONB NOT NULL DEFAULT '{}',
  config JSONB NOT NULL DEFAULT '{}',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sd_qa_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  inspection_id UUID REFERENCES sd_inspections(id) ON DELETE SET NULL,
  qa_score NUMERIC(5, 2),
  workflow_status sd_workflow_status NOT NULL DEFAULT 'draft',
  reviewer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sd_defects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  inspection_id UUID REFERENCES sd_inspections(id) ON DELETE SET NULL,
  defect_type TEXT NOT NULL,
  severity sd_alert_severity NOT NULL DEFAULT 'warning',
  description TEXT NOT NULL,
  workflow_status sd_workflow_status NOT NULL DEFAULT 'draft',
  reported_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sd_non_conformances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  defect_id UUID REFERENCES sd_defects(id) ON DELETE SET NULL,
  nc_number TEXT,
  title TEXT NOT NULL,
  description TEXT,
  workflow_status sd_workflow_status NOT NULL DEFAULT 'draft',
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sd_corrective_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  non_conformance_id UUID REFERENCES sd_non_conformances(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  action_type TEXT NOT NULL,
  workflow_status sd_workflow_status NOT NULL DEFAULT 'draft',
  assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sd_preventive_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  corrective_action_id UUID REFERENCES sd_corrective_actions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  workflow_status sd_workflow_status NOT NULL DEFAULT 'draft',
  assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sd_first_time_fix_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  technician_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  fixed_first_time BOOLEAN NOT NULL DEFAULT TRUE,
  root_cause TEXT,
  analysis JSONB NOT NULL DEFAULT '{}',
  config JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sd_customer_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  workflow_status sd_workflow_status NOT NULL DEFAULT 'draft',
  signature_ref TEXT,
  notes TEXT,
  accepted_at TIMESTAMPTZ,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sd_warranty_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  warranty_type TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  terms JSONB NOT NULL DEFAULT '{}',
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sd_warranty_claim_trackings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warranty_record_id UUID NOT NULL REFERENCES sd_warranty_records(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  claim_number TEXT,
  workflow_status sd_workflow_status NOT NULL DEFAULT 'draft',
  description TEXT,
  resolved_at TIMESTAMPTZ,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sd_callback_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  original_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  callback_reason TEXT NOT NULL,
  workflow_status sd_workflow_status NOT NULL DEFAULT 'draft',
  assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sd_continuous_improvement_initiatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  initiative_key TEXT NOT NULL,
  workflow_status sd_workflow_status NOT NULL DEFAULT 'draft',
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_date DATE,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sd_handover_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  handover_type TEXT NOT NULL,
  workflow_status sd_workflow_status NOT NULL DEFAULT 'draft',
  handed_over_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  received_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  handover_at TIMESTAMPTZ,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sd_variation_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  variation_type TEXT NOT NULL,
  description TEXT NOT NULL,
  workflow_status sd_workflow_status NOT NULL DEFAULT 'draft',
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sd_completion_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  certificate_number TEXT,
  workflow_status sd_workflow_status NOT NULL DEFAULT 'draft',
  issued_at TIMESTAMPTZ,
  issued_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sd_service_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity sd_alert_severity NOT NULL DEFAULT 'warning',
  status sd_alert_status NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT,
  source_module TEXT,
  source_entity_id UUID,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  context JSONB NOT NULL DEFAULT '{}',
  acknowledged_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sd_service_action_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  draft_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  workflow_status sd_workflow_status NOT NULL DEFAULT 'draft',
  source_records JSONB NOT NULL DEFAULT '{}',
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  requires_human_review BOOLEAN NOT NULL DEFAULT TRUE,
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sd_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  active_job_count INTEGER NOT NULL DEFAULT 0,
  completed_job_count INTEGER NOT NULL DEFAULT 0,
  open_promise_count INTEGER NOT NULL DEFAULT 0,
  sla_breach_count INTEGER NOT NULL DEFAULT 0,
  open_defect_count INTEGER NOT NULL DEFAULT 0,
  open_callback_count INTEGER NOT NULL DEFAULT 0,
  first_time_fix_rate_percent NUMERIC(5, 2),
  open_alert_count INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sd_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sd_service_promises_company_idx ON sd_service_promises(company_id);
CREATE INDEX IF NOT EXISTS sd_sla_records_company_idx ON sd_sla_records(company_id);
CREATE INDEX IF NOT EXISTS sd_sla_records_job_idx ON sd_sla_records(job_id);
CREATE INDEX IF NOT EXISTS sd_inspections_company_status_idx ON sd_inspections(company_id, inspection_status);
CREATE INDEX IF NOT EXISTS sd_defects_company_idx ON sd_defects(company_id);
CREATE INDEX IF NOT EXISTS sd_callback_records_company_idx ON sd_callback_records(company_id);
CREATE INDEX IF NOT EXISTS sd_service_alerts_company_status_idx ON sd_service_alerts(company_id, status);
CREATE INDEX IF NOT EXISTS sd_job_execution_snapshots_job_idx ON sd_job_execution_snapshots(job_id);
CREATE INDEX IF NOT EXISTS sd_analytics_snapshots_company_captured_idx ON sd_analytics_snapshots(company_id, captured_at);
