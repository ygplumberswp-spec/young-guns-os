-- Enterprise Document AI, OCR & Intelligent Document Processing Platform

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'document_intelligence';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_dip_extraction_correction';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_dip_document_summary';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_dip_workflow_action';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_dip_compliance_suggestion';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_dip_supplier_invoice';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_dip_inventory_receipt';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_dip_compliance_record';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_dip_asset_update';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_dip_warranty_registration';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_dip_follow_up_task';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dip_workflow_status') THEN
    CREATE TYPE dip_workflow_status AS ENUM ('draft', 'review', 'published', 'deprecated', 'archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dip_alert_severity') THEN
    CREATE TYPE dip_alert_severity AS ENUM ('info', 'warning', 'critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dip_alert_status') THEN
    CREATE TYPE dip_alert_status AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dip_ocr_job_status') THEN
    CREATE TYPE dip_ocr_job_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dip_review_status') THEN
    CREATE TYPE dip_review_status AS ENUM ('pending', 'in_review', 'approved', 'corrected', 'rejected', 'reprocess');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dip_classification_key') THEN
    CREATE TYPE dip_classification_key AS ENUM (
      'customer_document', 'job_document', 'quote', 'invoice', 'purchase_order',
      'supplier_invoice', 'delivery_note', 'compliance_certificate', 'inspection_report',
      'asset_record', 'warranty', 'technical_manual', 'employment_document', 'contract', 'other'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS dip_platform_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  ocr_policy JSONB NOT NULL DEFAULT '{}',
  classification_policy JSONB NOT NULL DEFAULT '{}',
  extraction_policy JSONB NOT NULL DEFAULT '{}',
  review_policy JSONB NOT NULL DEFAULT '{}',
  search_policy JSONB NOT NULL DEFAULT '{}',
  audit_retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dip_ocr_provider_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  config JSONB NOT NULL DEFAULT '{}',
  workflow_status dip_workflow_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dip_source_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB NOT NULL DEFAULT '{}',
  workflow_status dip_workflow_status NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dip_ocr_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  provider_key TEXT,
  source_key TEXT,
  status dip_ocr_job_status NOT NULL DEFAULT 'pending',
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS dip_ocr_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ocr_job_id UUID NOT NULL REFERENCES dip_ocr_jobs(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  extracted_text TEXT,
  confidence_score REAL,
  page_count INTEGER,
  language_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dip_classification_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  classification_key dip_classification_key NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_system_type BOOLEAN NOT NULL DEFAULT FALSE,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dip_classification_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  classification_key dip_classification_key NOT NULL,
  confidence_score REAL,
  manually_corrected BOOLEAN NOT NULL DEFAULT FALSE,
  corrected_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dip_extraction_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  name TEXT NOT NULL,
  classification_key dip_classification_key,
  field_schema JSONB NOT NULL DEFAULT '{}',
  workflow_status dip_workflow_status NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dip_extraction_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  template_id UUID REFERENCES dip_extraction_templates(id) ON DELETE SET NULL,
  extracted_fields JSONB NOT NULL DEFAULT '{}',
  confidence_score REAL,
  workflow_status dip_workflow_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dip_matching_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  confidence_score REAL,
  requires_review BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dip_review_queue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  review_type TEXT NOT NULL,
  status dip_review_status NOT NULL DEFAULT 'pending',
  assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  context JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dip_review_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  review_queue_item_id UUID NOT NULL REFERENCES dip_review_queue_items(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dip_intelligence_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  intelligence_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  severity dip_alert_severity NOT NULL DEFAULT 'info',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dip_workflow_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  draft_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  approval_required BOOLEAN NOT NULL DEFAULT TRUE,
  workflow_status dip_workflow_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dip_search_index_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ocr_text TEXT,
  ai_summary TEXT,
  tags JSONB NOT NULL DEFAULT '[]',
  classification_key dip_classification_key,
  related_records JSONB NOT NULL DEFAULT '{}',
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dip_document_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity dip_alert_severity NOT NULL DEFAULT 'warning',
  status dip_alert_status NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  source_module TEXT,
  context JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dip_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  metrics JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dip_action_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  draft_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_records JSONB NOT NULL DEFAULT '{}',
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  workflow_status dip_workflow_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dip_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dip_document_alerts_company_status ON dip_document_alerts(company_id, status);
CREATE INDEX IF NOT EXISTS idx_dip_ocr_jobs_company_status ON dip_ocr_jobs(company_id, status);
CREATE INDEX IF NOT EXISTS idx_dip_review_queue_company_status ON dip_review_queue_items(company_id, status);
CREATE INDEX IF NOT EXISTS idx_dip_search_index_company ON dip_search_index_entries(company_id, indexed_at DESC);
