-- Enterprise Industry Packs, Vertical Solutions & Trade Intelligence Platform

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'industry_intelligence';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ip_job_template';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ip_compliance_document';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ip_industry_report';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ip_workflow';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ip_checklist';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ip_certificate_template';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ip_quote_template';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ip_knowledge_article';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_ip_improvement_plan';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ip_workflow_status') THEN
    CREATE TYPE ip_workflow_status AS ENUM (
      'draft',
      'review',
      'pending_approval',
      'approved',
      'published',
      'archived',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ip_pack_status') THEN
    CREATE TYPE ip_pack_status AS ENUM (
      'available',
      'installed',
      'disabled',
      'deprecated',
      'uninstalled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ip_template_type') THEN
    CREATE TYPE ip_template_type AS ENUM (
      'job',
      'inspection',
      'workflow',
      'form',
      'checklist',
      'labour',
      'quote',
      'invoice',
      'report'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ip_certificate_type') THEN
    CREATE TYPE ip_certificate_type AS ENUM (
      'compliance',
      'installation',
      'service',
      'maintenance',
      'inspection',
      'completion',
      'custom'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ip_certificate_status') THEN
    CREATE TYPE ip_certificate_status AS ENUM (
      'draft',
      'pending_approval',
      'issued',
      'revoked',
      'expired'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ip_knowledge_status') THEN
    CREATE TYPE ip_knowledge_status AS ENUM (
      'draft',
      'pending_approval',
      'approved',
      'published',
      'archived'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ip_alert_severity') THEN
    CREATE TYPE ip_alert_severity AS ENUM ('info', 'warning', 'critical');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ip_alert_status') THEN
    CREATE TYPE ip_alert_status AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ip_platform_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  marketplace_policy JSONB NOT NULL DEFAULT '{}',
  compliance_policy JSONB NOT NULL DEFAULT '{}',
  certificate_policy JSONB NOT NULL DEFAULT '{}',
  pack_builder_policy JSONB NOT NULL DEFAULT '{}',
  analytics_policy JSONB NOT NULL DEFAULT '{}',
  audit_retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ip_pack_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  pack_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  industry_category TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  is_system_pack BOOLEAN NOT NULL DEFAULT FALSE,
  is_custom_pack BOOLEAN NOT NULL DEFAULT FALSE,
  licensing_model TEXT,
  compatibility JSONB NOT NULL DEFAULT '{}',
  capabilities JSONB NOT NULL DEFAULT '{}',
  config JSONB NOT NULL DEFAULT '{}',
  workflow_status ip_workflow_status NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ip_pack_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pack_catalog_id UUID NOT NULL REFERENCES ip_pack_catalog(id) ON DELETE CASCADE,
  installed_version TEXT NOT NULL,
  status ip_pack_status NOT NULL DEFAULT 'installed',
  installed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  installed_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ip_pack_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_catalog_id UUID NOT NULL REFERENCES ip_pack_catalog(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  release_notes TEXT,
  changelog JSONB NOT NULL DEFAULT '{}',
  compatibility JSONB NOT NULL DEFAULT '{}',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ip_pack_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_catalog_id UUID NOT NULL REFERENCES ip_pack_catalog(id) ON DELETE CASCADE,
  dependency_pack_key TEXT NOT NULL,
  dependency_version TEXT,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ip_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pack_catalog_id UUID REFERENCES ip_pack_catalog(id) ON DELETE SET NULL,
  template_key TEXT NOT NULL,
  template_type ip_template_type NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  workflow_status ip_workflow_status NOT NULL DEFAULT 'draft',
  definition JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ip_compliance_frameworks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pack_catalog_id UUID REFERENCES ip_pack_catalog(id) ON DELETE SET NULL,
  framework_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  country_code TEXT,
  industry_category TEXT,
  regulatory_body TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  workflow_status ip_workflow_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ip_compliance_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  framework_id UUID NOT NULL REFERENCES ip_compliance_frameworks(id) ON DELETE CASCADE,
  requirement_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  requirement_type TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ip_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pack_catalog_id UUID REFERENCES ip_pack_catalog(id) ON DELETE SET NULL,
  certificate_key TEXT NOT NULL,
  certificate_type ip_certificate_type NOT NULL,
  title TEXT NOT NULL,
  status ip_certificate_status NOT NULL DEFAULT 'draft',
  job_id UUID,
  customer_id UUID,
  issued_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  issued_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  source_work_reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ip_knowledge_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pack_catalog_id UUID REFERENCES ip_pack_catalog(id) ON DELETE SET NULL,
  article_key TEXT NOT NULL,
  title TEXT NOT NULL,
  article_type TEXT NOT NULL,
  content TEXT,
  status ip_knowledge_status NOT NULL DEFAULT 'draft',
  version TEXT NOT NULL DEFAULT '1.0.0',
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ip_knowledge_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES ip_knowledge_articles(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  content TEXT,
  change_summary TEXT,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ip_equipment_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pack_catalog_id UUID REFERENCES ip_pack_catalog(id) ON DELETE SET NULL,
  equipment_key TEXT NOT NULL,
  manufacturer TEXT,
  model TEXT,
  category TEXT,
  specifications JSONB NOT NULL DEFAULT '{}',
  service_intervals JSONB NOT NULL DEFAULT '{}',
  replacement_parts JSONB NOT NULL DEFAULT '{}',
  attachments JSONB NOT NULL DEFAULT '{}',
  workflow_status ip_workflow_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ip_material_libraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pack_catalog_id UUID REFERENCES ip_pack_catalog(id) ON DELETE SET NULL,
  material_key TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  unit TEXT,
  specifications JSONB NOT NULL DEFAULT '{}',
  bundles JSONB NOT NULL DEFAULT '{}',
  workflow_status ip_workflow_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ip_asset_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pack_catalog_id UUID REFERENCES ip_pack_catalog(id) ON DELETE SET NULL,
  asset_type_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  field_definitions JSONB NOT NULL DEFAULT '{}',
  workflow_status ip_workflow_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ip_pack_extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pack_catalog_id UUID NOT NULL REFERENCES ip_pack_catalog(id) ON DELETE CASCADE,
  extension_type TEXT NOT NULL,
  extension_key TEXT NOT NULL,
  name TEXT NOT NULL,
  definition JSONB NOT NULL DEFAULT '{}',
  workflow_status ip_workflow_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ip_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  metrics JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ip_industry_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity ip_alert_severity NOT NULL DEFAULT 'warning',
  status ip_alert_status NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT,
  pack_catalog_id UUID REFERENCES ip_pack_catalog(id) ON DELETE SET NULL,
  source_module TEXT,
  context JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ip_action_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  draft_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  pack_catalog_id UUID REFERENCES ip_pack_catalog(id) ON DELETE SET NULL,
  source_records JSONB NOT NULL DEFAULT '{}',
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  workflow_status ip_workflow_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ip_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ip_pack_catalog_pack_key_idx ON ip_pack_catalog(pack_key);
CREATE INDEX IF NOT EXISTS ip_pack_installations_company_idx ON ip_pack_installations(company_id);
CREATE INDEX IF NOT EXISTS ip_templates_company_type_idx ON ip_templates(company_id, template_type);
CREATE INDEX IF NOT EXISTS ip_compliance_frameworks_company_idx ON ip_compliance_frameworks(company_id);
CREATE INDEX IF NOT EXISTS ip_certificates_company_status_idx ON ip_certificates(company_id, status);
CREATE INDEX IF NOT EXISTS ip_industry_alerts_company_status_idx ON ip_industry_alerts(company_id, status);
