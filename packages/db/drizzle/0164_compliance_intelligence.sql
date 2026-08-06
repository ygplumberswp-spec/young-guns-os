-- Compliance Intelligence (Department 14)
-- Extends Document Intelligence / Legal Compliance / documents / properties / jobs / equipment
-- with SANS support, COC workflows, compliance checks, expiry tracking, and audit preparation.
-- Real records only. No automatic certification. AURA drafts require Owner approval.
-- Forward-only. Staging-first. Do not apply to production without Owner approval.
-- Never touches Yoco 0123.

DO $$ BEGIN
  CREATE TYPE cmi_sans_status AS ENUM ('tracked', 'retired', 'reference_only');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE cmi_coc_workflow_status AS ENUM (
    'intake', 'documents_gathering', 'inspection_pending', 'review',
    'ready_for_issue', 'issued', 'expired', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE cmi_check_result AS ENUM (
    'pass', 'fail', 'incomplete', 'not_applicable', 'unavailable'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE cmi_check_kind AS ENUM (
    'coc_present', 'coc_unexpired', 'sans_linked', 'property_docs',
    'job_docs', 'equipment_warranty', 'insurance_present', 'audit_pack_ready'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE cmi_expiry_source AS ENUM (
    'di_document_profile', 'lc_compliance_record', 'lc_insurance_policy',
    'asset_warranty', 'coc_workflow'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE cmi_expiry_status AS ENUM ('open', 'acknowledged', 'dismissed', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE cmi_audit_pack_status AS ENUM ('draft', 'ready_for_review', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE cmi_recommendation_kind AS ENUM ('compliance_risk', 'missing_doc', 'expiry_alert');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE cmi_recommendation_status AS ENUM (
    'draft', 'pending_approval', 'approved', 'rejected', 'cancelled', 'acknowledged'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE cmi_aura_insight_target AS ENUM (
    'command_centre', 'executive_dashboard', 'documents', 'document_intelligence',
    'legal_compliance', 'properties', 'jobs', 'equipment', 'operations'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE cmi_aura_insight_status AS ENUM ('open', 'acknowledged', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS cmi_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  auto_certification_enabled boolean NOT NULL DEFAULT false,
  invent_compliance_records_enabled boolean NOT NULL DEFAULT false,
  auto_execute_actions_enabled boolean NOT NULL DEFAULT false,
  sans_tracking_enabled boolean NOT NULL DEFAULT true,
  coc_workflows_enabled boolean NOT NULL DEFAULT true,
  compliance_checks_enabled boolean NOT NULL DEFAULT true,
  expiry_tracking_enabled boolean NOT NULL DEFAULT true,
  audit_prep_enabled boolean NOT NULL DEFAULT true,
  reminder_lead_days integer NOT NULL DEFAULT 30,
  notes text,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cmi_settings_no_auto_cert CHECK (auto_certification_enabled = false),
  CONSTRAINT cmi_settings_no_invent CHECK (invent_compliance_records_enabled = false),
  CONSTRAINT cmi_settings_no_auto_exec CHECK (auto_execute_actions_enabled = false)
);

CREATE UNIQUE INDEX IF NOT EXISTS cmi_settings_company_uidx ON cmi_settings (company_id);

CREATE TABLE IF NOT EXISTS cmi_sans_standards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL,
  status cmi_sans_status NOT NULL DEFAULT 'tracked',
  notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cmi_sans_standards_code_uidx
  ON cmi_sans_standards (company_id, code);

CREATE TABLE IF NOT EXISTS cmi_coc_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  status cmi_coc_workflow_status NOT NULL DEFAULT 'intake',
  auto_certified boolean NOT NULL DEFAULT false,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  property_id uuid REFERENCES cx_customer_properties(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  sans_standard_id uuid REFERENCES cmi_sans_standards(id) ON DELETE SET NULL,
  expires_at timestamptz,
  notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cmi_coc_workflows_no_auto_cert CHECK (auto_certified = false)
);

CREATE INDEX IF NOT EXISTS cmi_coc_workflows_company_status_idx
  ON cmi_coc_workflows (company_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS cmi_coc_workflows_document_idx
  ON cmi_coc_workflows (company_id, document_id);

CREATE TABLE IF NOT EXISTS cmi_compliance_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind cmi_check_kind NOT NULL,
  result cmi_check_result NOT NULL,
  title text NOT NULL,
  detail text NOT NULL DEFAULT '',
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  property_id uuid REFERENCES cx_customer_properties(id) ON DELETE SET NULL,
  equipment_id uuid REFERENCES asset_equipment(id) ON DELETE SET NULL,
  coc_workflow_id uuid REFERENCES cmi_coc_workflows(id) ON DELETE SET NULL,
  certification_decision boolean NOT NULL DEFAULT false,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cmi_compliance_checks_no_cert_decision CHECK (certification_decision = false)
);

CREATE INDEX IF NOT EXISTS cmi_compliance_checks_company_idx
  ON cmi_compliance_checks (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cmi_expiry_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source cmi_expiry_source NOT NULL,
  status cmi_expiry_status NOT NULL DEFAULT 'open',
  title text NOT NULL,
  expires_at timestamptz NOT NULL,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  coc_workflow_id uuid REFERENCES cmi_coc_workflows(id) ON DELETE SET NULL,
  equipment_id uuid REFERENCES asset_equipment(id) ON DELETE SET NULL,
  source_ref text,
  note text NOT NULL DEFAULT '',
  acknowledged_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cmi_expiry_items_queue_idx
  ON cmi_expiry_items (company_id, status, expires_at);

CREATE TABLE IF NOT EXISTS cmi_audit_prep_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  status cmi_audit_pack_status NOT NULL DEFAULT 'draft',
  scope_note text NOT NULL DEFAULT '',
  document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  check_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  gap_count integer NOT NULL DEFAULT 0,
  readiness_available boolean NOT NULL DEFAULT false,
  readiness_rationale text NOT NULL DEFAULT '',
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cmi_audit_prep_packs_company_idx
  ON cmi_audit_prep_packs (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cmi_recommendation_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind cmi_recommendation_kind NOT NULL,
  status cmi_recommendation_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  property_id uuid REFERENCES cx_customer_properties(id) ON DELETE SET NULL,
  equipment_id uuid REFERENCES asset_equipment(id) ON DELETE SET NULL,
  coc_workflow_id uuid REFERENCES cmi_coc_workflows(id) ON DELETE SET NULL,
  auto_executed boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cmi_recommendation_drafts_no_auto CHECK (auto_executed = false)
);

CREATE INDEX IF NOT EXISTS cmi_recommendation_drafts_queue_idx
  ON cmi_recommendation_drafts (company_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS cmi_aura_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target cmi_aura_insight_target NOT NULL,
  status cmi_aura_insight_status NOT NULL DEFAULT 'open',
  title text NOT NULL,
  insight text NOT NULL,
  href text,
  source_recommendation_id uuid REFERENCES cmi_recommendation_drafts(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cmi_aura_insights_company_idx
  ON cmi_aura_insights (company_id, created_at DESC);
