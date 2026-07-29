-- Enterprise Workforce Intelligence, HR, Payroll & Technician Performance Platform

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'workforce_intelligence';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_workforce_onboarding_plan';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_workforce_development_plan';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_workforce_performance_report';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_workforce_hr_communication';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_workforce_payroll_exception_summary';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_workforce_offboarding_checklist';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_workforce_training_recommendation';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_workforce_technician_match';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wi_provider_category') THEN
    CREATE TYPE wi_provider_category AS ENUM ('payroll', 'hr', 'accounting', 'timekeeping');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wi_provider_type') THEN
    CREATE TYPE wi_provider_type AS ENUM (
      'sage_payroll',
      'sage_business_cloud',
      'xero_payroll',
      'quickbooks_payroll',
      'payspace',
      'simplepay',
      'bamboohr',
      'deel',
      'workday',
      'sap_successfactors',
      'zoho_people',
      'employment_hero',
      'microsoft_dynamics',
      'csv_import_export',
      'sftp',
      'generic_rest',
      'webhook',
      'custom'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wi_adapter_status') THEN
    CREATE TYPE wi_adapter_status AS ENUM ('active', 'inactive', 'testing', 'error');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wi_sync_direction') THEN
    CREATE TYPE wi_sync_direction AS ENUM ('inbound', 'outbound', 'bidirectional');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wi_lifecycle_stage') THEN
    CREATE TYPE wi_lifecycle_stage AS ENUM (
      'candidate',
      'applicant',
      'interview',
      'offer',
      'pre_employment',
      'onboarding',
      'active',
      'probation',
      'role_change',
      'promotion',
      'transfer',
      'suspension',
      'leave',
      'offboarding',
      'termination',
      'alumni'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wi_lifecycle_status') THEN
    CREATE TYPE wi_lifecycle_status AS ENUM ('draft', 'pending_approval', 'approved', 'executed', 'cancelled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wi_timesheet_status') THEN
    CREATE TYPE wi_timesheet_status AS ENUM ('draft', 'submitted', 'approved', 'corrected');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wi_leave_status') THEN
    CREATE TYPE wi_leave_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wi_payroll_prep_status') THEN
    CREATE TYPE wi_payroll_prep_status AS ENUM ('draft', 'pending_approval', 'approved', 'exported', 'failed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wi_hr_draft_type') THEN
    CREATE TYPE wi_hr_draft_type AS ENUM (
      'termination',
      'suspension',
      'role_change',
      'payroll_export',
      'offboarding',
      'disciplinary',
      'onboarding_plan',
      'development_plan',
      'performance_report',
      'hr_communication',
      'payroll_exception_summary',
      'training_recommendation',
      'technician_match'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wi_hr_draft_status') THEN
    CREATE TYPE wi_hr_draft_status AS ENUM ('draft', 'pending_approval', 'approved', 'executed', 'cancelled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wi_onboarding_task_status') THEN
    CREATE TYPE wi_onboarding_task_status AS ENUM ('pending', 'in_progress', 'completed', 'skipped');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS wi_platform_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  global_policies jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_adapter_templates jsonb NOT NULL DEFAULT '{}'::jsonb,
  jurisdiction_templates jsonb NOT NULL DEFAULT '{}'::jsonb,
  leave_policy_defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  performance_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  privacy_policies jsonb NOT NULL DEFAULT '{}'::jsonb,
  audit_retention_days integer NOT NULL DEFAULT 365,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wi_workforce_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wi_workforce_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  category_id uuid REFERENCES wi_workforce_categories(id) ON DELETE SET NULL,
  custom_category_name text,
  employee_number text,
  employment_type text,
  job_title text,
  department text,
  branch text,
  manager_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  start_date date,
  contract_status text,
  working_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  contact_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  emergency_contact jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_vehicle_id uuid,
  assigned_tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  assigned_equipment jsonb NOT NULL DEFAULT '[]'::jsonb,
  payroll_provider_ref text,
  accounting_provider_ref text,
  lifecycle_stage wi_lifecycle_stage NOT NULL DEFAULT 'active',
  jurisdiction_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wi_provider_adapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider_category wi_provider_category NOT NULL,
  provider_type wi_provider_type NOT NULL,
  provider_key text NOT NULL,
  name text NOT NULL,
  status wi_adapter_status NOT NULL DEFAULT 'inactive',
  is_primary boolean NOT NULL DEFAULT false,
  endpoint_url text,
  credentials_vault_key text,
  sync_direction wi_sync_direction NOT NULL DEFAULT 'bidirectional',
  sync_frequency_minutes integer,
  field_mappings jsonb NOT NULL DEFAULT '{}'::jsonb,
  leave_type_mappings jsonb NOT NULL DEFAULT '{}'::jsonb,
  earning_code_mappings jsonb NOT NULL DEFAULT '{}'::jsonb,
  deduction_code_mappings jsonb NOT NULL DEFAULT '{}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_test_at timestamptz,
  last_test_status text,
  last_test_message text,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wi_provider_employee_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider_adapter_id uuid NOT NULL REFERENCES wi_provider_adapters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_employee_id text NOT NULL,
  mapping_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wi_lifecycle_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage wi_lifecycle_stage NOT NULL,
  status wi_lifecycle_status NOT NULL DEFAULT 'executed',
  title text NOT NULL,
  description text,
  effective_date date,
  responsible_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wi_onboarding_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  status wi_lifecycle_status NOT NULL DEFAULT 'draft',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wi_onboarding_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES wi_onboarding_workflows(id) ON DELETE CASCADE,
  task_key text NOT NULL,
  title text NOT NULL,
  description text,
  status wi_onboarding_task_status NOT NULL DEFAULT 'pending',
  responsible_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  due_at timestamptz,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wi_timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status wi_timesheet_status NOT NULL DEFAULT 'draft',
  standard_hours numeric(8,2) NOT NULL DEFAULT 0,
  overtime_hours numeric(8,2) NOT NULL DEFAULT 0,
  travel_hours numeric(8,2) NOT NULL DEFAULT 0,
  standby_hours numeric(8,2) NOT NULL DEFAULT 0,
  break_hours numeric(8,2) NOT NULL DEFAULT 0,
  notes text,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  gps_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wi_timesheet_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  timesheet_id uuid NOT NULL REFERENCES wi_timesheets(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  original_value text NOT NULL,
  corrected_value text NOT NULL,
  reason text NOT NULL,
  approver_user_id uuid NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
  corrected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wi_leave_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  category_key text NOT NULL,
  description text,
  accrual_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_paid boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wi_leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES wi_leave_categories(id) ON DELETE CASCADE,
  balance_days numeric(8,2) NOT NULL DEFAULT 0,
  accrued_days numeric(8,2) NOT NULL DEFAULT 0,
  used_days numeric(8,2) NOT NULL DEFAULT 0,
  as_of_date date NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wi_leave_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES wi_leave_categories(id) ON DELETE CASCADE,
  status wi_leave_status NOT NULL DEFAULT 'pending',
  start_date date NOT NULL,
  end_date date NOT NULL,
  days_requested numeric(8,2) NOT NULL,
  reason text,
  document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  approver_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wi_payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status wi_payroll_prep_status NOT NULL DEFAULT 'draft',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wi_payroll_preparation_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  payroll_period_id uuid NOT NULL REFERENCES wi_payroll_periods(id) ON DELETE CASCADE,
  provider_adapter_id uuid REFERENCES wi_provider_adapters(id) ON DELETE SET NULL,
  status wi_payroll_prep_status NOT NULL DEFAULT 'draft',
  validation_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  exception_count integer NOT NULL DEFAULT 0,
  earnings_total_cents integer NOT NULL DEFAULT 0,
  deductions_total_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  exported_at timestamptz,
  export_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wi_payroll_export_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES wi_payroll_preparation_batches(id) ON DELETE CASCADE,
  status text NOT NULL,
  message text,
  provider_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wi_training_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  course_key text NOT NULL,
  title text NOT NULL,
  description text,
  provider_name text,
  is_required boolean NOT NULL DEFAULT false,
  cost_cents integer,
  currency text DEFAULT 'USD',
  skills_gained jsonb NOT NULL DEFAULT '[]'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wi_technician_performance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jobs_completed integer NOT NULL DEFAULT 0,
  jobs_assigned integer NOT NULL DEFAULT 0,
  first_time_fix_rate numeric(5,2),
  average_job_duration_hours numeric(8,2),
  on_time_arrival_rate numeric(5,2),
  rework_count integer NOT NULL DEFAULT 0,
  callback_count integer NOT NULL DEFAULT 0,
  customer_satisfaction_avg numeric(5,2),
  revenue_contribution_cents integer,
  gross_margin_contribution_cents integer,
  supporting_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  explanation text,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wi_hr_action_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  draft_type wi_hr_draft_type NOT NULL,
  status wi_hr_draft_status NOT NULL DEFAULT 'draft',
  subject text NOT NULL,
  description text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wi_analytics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  headcount integer NOT NULL DEFAULT 0,
  contractor_count integer NOT NULL DEFAULT 0,
  turnover_rate numeric(5,2),
  absence_rate numeric(5,2),
  overtime_hours numeric(10,2),
  capacity_utilization numeric(5,2),
  labour_cost_cents integer NOT NULL DEFAULT 0,
  certification_risk_count integer NOT NULL DEFAULT 0,
  payroll_exception_count integer NOT NULL DEFAULT 0,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wi_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wi_workforce_profiles_company_idx ON wi_workforce_profiles(company_id);
CREATE INDEX IF NOT EXISTS wi_timesheets_company_user_idx ON wi_timesheets(company_id, user_id);
CREATE INDEX IF NOT EXISTS wi_leave_applications_company_idx ON wi_leave_applications(company_id);
CREATE INDEX IF NOT EXISTS wi_provider_adapters_company_idx ON wi_provider_adapters(company_id);
