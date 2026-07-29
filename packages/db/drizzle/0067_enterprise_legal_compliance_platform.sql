-- Enterprise Legal, Contracts, Compliance & Risk Management Platform

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'legal_compliance';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_legal_contract_summary';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_legal_policy_document';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_legal_compliance_report';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_legal_risk_report';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_legal_matter_summary';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_legal_customer_notice';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_legal_supplier_notice';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_legal_internal_communication';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lc_workflow_status') THEN
    CREATE TYPE lc_workflow_status AS ENUM (
      'draft',
      'review',
      'pending_approval',
      'approved',
      'executed',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lc_contract_status') THEN
    CREATE TYPE lc_contract_status AS ENUM (
      'request',
      'draft',
      'internal_review',
      'external_review',
      'negotiation',
      'pending_approval',
      'approved',
      'signature',
      'active',
      'amendment',
      'renewal',
      'suspended',
      'expired',
      'terminated',
      'archived'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lc_signature_provider_type') THEN
    CREATE TYPE lc_signature_provider_type AS ENUM (
      'docusign',
      'adobe_sign',
      'dropbox_sign',
      'pandadoc',
      'signnow',
      'zoho_sign',
      'onespan',
      'microsoft',
      'manual_upload',
      'generic_rest',
      'webhook',
      'custom'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lc_adapter_status') THEN
    CREATE TYPE lc_adapter_status AS ENUM ('active', 'inactive', 'testing', 'error');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lc_signature_request_status') THEN
    CREATE TYPE lc_signature_request_status AS ENUM (
      'draft',
      'sent',
      'partially_signed',
      'completed',
      'declined',
      'expired',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lc_obligation_status') THEN
    CREATE TYPE lc_obligation_status AS ENUM (
      'pending',
      'in_progress',
      'completed',
      'overdue',
      'waived',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lc_risk_category') THEN
    CREATE TYPE lc_risk_category AS ENUM (
      'strategic',
      'operational',
      'financial',
      'legal',
      'compliance',
      'cybersecurity',
      'data_privacy',
      'supplier',
      'customer',
      'workforce',
      'health_safety',
      'fleet',
      'asset',
      'environmental',
      'reputation',
      'project',
      'custom'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lc_risk_status') THEN
    CREATE TYPE lc_risk_status AS ENUM (
      'identified',
      'assessed',
      'treatment_planned',
      'mitigated',
      'accepted',
      'closed'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lc_control_status') THEN
    CREATE TYPE lc_control_status AS ENUM ('active', 'inactive', 'failed', 'remediation');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lc_policy_status') THEN
    CREATE TYPE lc_policy_status AS ENUM (
      'draft',
      'review',
      'pending_approval',
      'published',
      'expired',
      'archived'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lc_legal_matter_status') THEN
    CREATE TYPE lc_legal_matter_status AS ENUM (
      'open',
      'in_progress',
      'pending',
      'resolved',
      'closed',
      'archived'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lc_privacy_request_type') THEN
    CREATE TYPE lc_privacy_request_type AS ENUM (
      'access',
      'correction',
      'deletion',
      'portability',
      'objection'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lc_privacy_request_status') THEN
    CREATE TYPE lc_privacy_request_status AS ENUM (
      'pending',
      'in_review',
      'approved',
      'rejected',
      'completed'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lc_legal_draft_type') THEN
    CREATE TYPE lc_legal_draft_type AS ENUM (
      'contract_summary',
      'policy_document',
      'compliance_report',
      'risk_report',
      'legal_matter_summary',
      'customer_notice',
      'supplier_notice',
      'internal_communication',
      'control_improvement',
      'clause_recommendation'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS lc_platform_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  global_policies jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_adapter_templates jsonb NOT NULL DEFAULT '{}'::jsonb,
  jurisdiction_templates jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_methodology jsonb NOT NULL DEFAULT '{}'::jsonb,
  retention_templates jsonb NOT NULL DEFAULT '{}'::jsonb,
  privacy_defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  clause_library_templates jsonb NOT NULL DEFAULT '{}'::jsonb,
  audit_retention_days integer NOT NULL DEFAULT 365,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_legal_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  category_key text NOT NULL,
  description text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_jurisdictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  country text,
  province_or_state text,
  municipality_or_region text,
  industry text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category_id uuid REFERENCES lc_legal_categories(id) ON DELETE SET NULL,
  jurisdiction_id uuid REFERENCES lc_jurisdictions(id) ON DELETE SET NULL,
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL,
  contract_number text,
  contract_type text,
  counterparty_name text,
  counterparty_id uuid,
  counterparty_type text,
  business_unit text,
  status lc_contract_status NOT NULL DEFAULT 'draft',
  workflow_status lc_workflow_status NOT NULL DEFAULT 'draft',
  effective_date date,
  expiry_date date,
  renewal_terms text,
  notice_period_days integer,
  contract_value_cents integer,
  currency text DEFAULT 'USD',
  payment_terms text,
  governing_jurisdiction text,
  obligations jsonb NOT NULL DEFAULT '{}'::jsonb,
  linked_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_contract_lifecycle_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES lc_contracts(id) ON DELETE CASCADE,
  status lc_contract_status NOT NULL,
  workflow_status lc_workflow_status NOT NULL DEFAULT 'executed',
  title text NOT NULL,
  description text,
  responsible_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  template_key text NOT NULL,
  description text,
  jurisdiction_id uuid REFERENCES lc_jurisdictions(id) ON DELETE SET NULL,
  version text NOT NULL DEFAULT '1.0',
  is_approved boolean NOT NULL DEFAULT false,
  content text,
  clause_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_clause_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  clause_key text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  jurisdiction_id uuid REFERENCES lc_jurisdictions(id) ON DELETE SET NULL,
  is_mandatory boolean NOT NULL DEFAULT false,
  is_restricted boolean NOT NULL DEFAULT false,
  is_approved boolean NOT NULL DEFAULT false,
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  effective_date date,
  expiry_date date,
  alternatives jsonb NOT NULL DEFAULT '[]'::jsonb,
  version text NOT NULL DEFAULT '1.0',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_signature_provider_adapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider_type lc_signature_provider_type NOT NULL,
  provider_key text NOT NULL,
  name text NOT NULL,
  status lc_adapter_status NOT NULL DEFAULT 'inactive',
  is_primary boolean NOT NULL DEFAULT false,
  endpoint_url text,
  credentials_vault_key text,
  signer_role_mappings jsonb NOT NULL DEFAULT '{}'::jsonb,
  field_mappings jsonb NOT NULL DEFAULT '{}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_test_at timestamptz,
  last_test_status text,
  last_test_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_signature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES lc_contracts(id) ON DELETE SET NULL,
  provider_adapter_id uuid REFERENCES lc_signature_provider_adapters(id) ON DELETE SET NULL,
  status lc_signature_request_status NOT NULL DEFAULT 'draft',
  subject text NOT NULL,
  signers jsonb NOT NULL DEFAULT '[]'::jsonb,
  workflow_status lc_workflow_status NOT NULL DEFAULT 'draft',
  external_request_id text,
  sent_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_contract_intelligence_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES lc_contracts(id) ON DELETE CASCADE,
  analysis_type text NOT NULL,
  summary text,
  confidence_score numeric(5,2),
  source_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  supporting_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  limitations text,
  requires_human_review boolean NOT NULL DEFAULT true,
  reviewed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  disclaimer text NOT NULL DEFAULT 'AI-generated analysis — not legal advice. Requires professional review.',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES lc_contracts(id) ON DELETE SET NULL,
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  status lc_obligation_status NOT NULL DEFAULT 'pending',
  due_date date,
  frequency text,
  source_type text,
  source_id uuid,
  evidence_document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_compliance_frameworks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  framework_key text NOT NULL,
  jurisdiction_id uuid REFERENCES lc_jurisdictions(id) ON DELETE SET NULL,
  description text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_compliance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  framework_id uuid REFERENCES lc_compliance_frameworks(id) ON DELETE SET NULL,
  record_key text NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending',
  due_date date,
  expiry_date date,
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_risk_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category lc_risk_category NOT NULL DEFAULT 'custom',
  custom_category_name text,
  title text NOT NULL,
  description text,
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  business_area text,
  status lc_risk_status NOT NULL DEFAULT 'identified',
  likelihood integer,
  impact integer,
  inherent_risk_score numeric(8,2),
  residual_risk_score numeric(8,2),
  controls jsonb NOT NULL DEFAULT '[]'::jsonb,
  treatment_plan text,
  due_date date,
  review_date date,
  scoring_methodology jsonb NOT NULL DEFAULT '{}'::jsonb,
  linked_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  workflow_status lc_workflow_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  control_key text NOT NULL,
  title text NOT NULL,
  objective text,
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  process_area text,
  frequency text,
  status lc_control_status NOT NULL DEFAULT 'active',
  last_performed_at timestamptz,
  next_due_at timestamptz,
  evidence_required text,
  test_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  policy_key text NOT NULL,
  description text,
  status lc_policy_status NOT NULL DEFAULT 'draft',
  workflow_status lc_workflow_status NOT NULL DEFAULT 'draft',
  version text NOT NULL DEFAULT '1.0',
  effective_date date,
  expiry_date date,
  review_cycle_days integer,
  content text,
  audience text,
  document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_policy_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES lc_policies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS lc_legal_matters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  matter_number text,
  matter_type text NOT NULL,
  title text NOT NULL,
  description text,
  status lc_legal_matter_status NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'medium',
  responsible_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  external_adviser text,
  counterparty_name text,
  deadline_date date,
  cost_cents integer,
  currency text DEFAULT 'USD',
  outcome text,
  document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_insurance_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  policy_number text NOT NULL,
  coverage_type text NOT NULL,
  insurer_name text,
  broker_name text,
  premium_cents integer,
  excess_cents integer,
  coverage_limit_cents integer,
  currency text DEFAULT 'USD',
  effective_date date,
  expiry_date date,
  renewal_date date,
  covered_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_insurance_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES lc_insurance_policies(id) ON DELETE CASCADE,
  claim_number text,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  claim_amount_cents integer,
  paid_amount_cents integer,
  currency text DEFAULT 'USD',
  document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  subject_type text NOT NULL,
  subject_id uuid,
  purpose text NOT NULL,
  consent_source text,
  granted_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  request_type lc_privacy_request_type NOT NULL,
  status lc_privacy_request_status NOT NULL DEFAULT 'pending',
  subject_name text,
  description text,
  workflow_status lc_workflow_status NOT NULL DEFAULT 'draft',
  legal_hold_blocked boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_retention_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  record_category text NOT NULL,
  retention_days integer NOT NULL,
  jurisdiction_id uuid REFERENCES lc_jurisdictions(id) ON DELETE SET NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_legal_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  reason text NOT NULL,
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  workflow_status lc_workflow_status NOT NULL DEFAULT 'draft',
  start_date date,
  end_date date,
  affected_record_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_evidence_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  evidence_type text NOT NULL,
  title text NOT NULL,
  source_ref text,
  document_id uuid,
  integrity_hash text,
  chain_of_custody jsonb NOT NULL DEFAULT '[]'::jsonb,
  linked_entity_type text,
  linked_entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_legal_action_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  draft_type lc_legal_draft_type NOT NULL,
  status lc_workflow_status NOT NULL DEFAULT 'draft',
  subject text NOT NULL,
  description text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_generated boolean NOT NULL DEFAULT false,
  disclaimer text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_analytics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  active_contract_count integer NOT NULL DEFAULT 0,
  expiring_contract_count integer NOT NULL DEFAULT 0,
  contract_value_cents integer NOT NULL DEFAULT 0,
  overdue_obligation_count integer NOT NULL DEFAULT 0,
  compliance_gap_count integer NOT NULL DEFAULT 0,
  open_risk_count integer NOT NULL DEFAULT 0,
  failed_control_count integer NOT NULL DEFAULT 0,
  open_legal_matter_count integer NOT NULL DEFAULT 0,
  open_claim_count integer NOT NULL DEFAULT 0,
  pending_privacy_request_count integer NOT NULL DEFAULT 0,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lc_contracts_company_idx ON lc_contracts(company_id);
CREATE INDEX IF NOT EXISTS lc_obligations_company_idx ON lc_obligations(company_id);
CREATE INDEX IF NOT EXISTS lc_risk_register_company_idx ON lc_risk_register(company_id);
CREATE INDEX IF NOT EXISTS lc_signature_provider_adapters_company_idx ON lc_signature_provider_adapters(company_id);
CREATE INDEX IF NOT EXISTS lc_legal_matters_company_idx ON lc_legal_matters(company_id);
CREATE INDEX IF NOT EXISTS lc_privacy_requests_company_idx ON lc_privacy_requests(company_id);
