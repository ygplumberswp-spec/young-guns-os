-- Enterprise Sales Intelligence, Pipeline, Forecasting & Revenue Operations Platform

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'sales_intelligence';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_si_lead_reply';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_si_follow_up';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_si_proposal';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_si_quote_commentary';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_si_renewal_message';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_si_account_plan';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_si_sales_report';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_si_tender_response';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_si_executive_revenue_summary';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'si_workflow_status') THEN
    CREATE TYPE si_workflow_status AS ENUM (
      'draft',
      'review',
      'pending_approval',
      'approved',
      'executed',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'si_adapter_status') THEN
    CREATE TYPE si_adapter_status AS ENUM ('active', 'inactive', 'testing', 'error');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'si_crm_provider_type') THEN
    CREATE TYPE si_crm_provider_type AS ENUM (
      'salesforce',
      'hubspot',
      'zoho_crm',
      'dynamics',
      'pipedrive',
      'freshsales',
      'monday',
      'odoo',
      'copper',
      'insightly',
      'sap',
      'oracle_cx',
      'csv_import',
      'sftp',
      'generic_rest',
      'webhook',
      'custom'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'si_alert_severity') THEN
    CREATE TYPE si_alert_severity AS ENUM ('info', 'warning', 'critical');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'si_alert_status') THEN
    CREATE TYPE si_alert_status AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'si_target_status') THEN
    CREATE TYPE si_target_status AS ENUM (
      'draft',
      'active',
      'at_risk',
      'achieved',
      'missed',
      'archived'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'si_commission_status') THEN
    CREATE TYPE si_commission_status AS ENUM (
      'draft',
      'calculated',
      'pending_approval',
      'approved',
      'disputed',
      'exported',
      'cancelled'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS si_platform_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  sales_standards JSONB NOT NULL DEFAULT '{}',
  provider_adapter_templates JSONB NOT NULL DEFAULT '{}',
  pipeline_templates JSONB NOT NULL DEFAULT '{}',
  playbook_templates JSONB NOT NULL DEFAULT '{}',
  target_templates JSONB NOT NULL DEFAULT '{}',
  forecast_methodology JSONB NOT NULL DEFAULT '{}',
  attribution_standards JSONB NOT NULL DEFAULT '{}',
  audit_retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_sales_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category_key TEXT NOT NULL,
  description TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  territory_key TEXT NOT NULL,
  territory_type TEXT,
  branch TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_sales_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  team_key TEXT NOT NULL,
  territory_id UUID REFERENCES si_territories(id) ON DELETE SET NULL,
  leader_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_crm_provider_adapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider_type si_crm_provider_type NOT NULL,
  name TEXT NOT NULL,
  status si_adapter_status NOT NULL DEFAULT 'inactive',
  sync_direction TEXT NOT NULL DEFAULT 'bidirectional',
  sync_frequency TEXT,
  field_mappings JSONB NOT NULL DEFAULT '{}',
  config JSONB NOT NULL DEFAULT '{}',
  last_sync_at TIMESTAMPTZ,
  last_health_check_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pipeline_key TEXT NOT NULL,
  pipeline_type TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES si_pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stage_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  probability_percent NUMERIC(5, 2),
  entry_requirements JSONB NOT NULL DEFAULT '{}',
  exit_requirements JSONB NOT NULL DEFAULT '{}',
  sla_hours INTEGER,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_lead_deduplication_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  primary_lead_id UUID,
  duplicate_lead_id UUID,
  match_score NUMERIC(5, 2),
  match_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_lead_merge_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  surviving_lead_id UUID,
  merged_lead_id UUID,
  merge_reason TEXT NOT NULL,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  source_history JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  playbook_key TEXT NOT NULL,
  playbook_type TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_playbook_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  playbook_id UUID NOT NULL REFERENCES si_playbooks(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  required BOOLEAN NOT NULL DEFAULT FALSE,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  forecast_type TEXT NOT NULL DEFAULT 'pipeline',
  workflow_status si_workflow_status NOT NULL DEFAULT 'draft',
  period_start DATE,
  period_end DATE,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  pipeline_value_cents INTEGER,
  weighted_pipeline_cents INTEGER,
  commit_cents INTEGER,
  best_case_cents INTEGER,
  confidence_score NUMERIC(5, 2),
  assumptions JSONB NOT NULL DEFAULT '{}',
  source_records JSONB NOT NULL DEFAULT '{}',
  is_simulation BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_forecast_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  forecast_id UUID NOT NULL REFERENCES si_forecasts(id) ON DELETE CASCADE,
  pipeline_value_cents INTEGER NOT NULL DEFAULT 0,
  weighted_pipeline_cents INTEGER NOT NULL DEFAULT 0,
  commit_cents INTEGER NOT NULL DEFAULT 0,
  confidence_score NUMERIC(5, 2),
  assumptions JSONB NOT NULL DEFAULT '{}',
  source_records JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_sales_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  team_id UUID REFERENCES si_sales_teams(id) ON DELETE SET NULL,
  target_key TEXT NOT NULL,
  title TEXT NOT NULL,
  target_type TEXT NOT NULL,
  status si_target_status NOT NULL DEFAULT 'draft',
  period_start DATE,
  period_end DATE,
  target_value NUMERIC(18, 4),
  current_value NUMERIC(18, 4),
  unit TEXT,
  currency TEXT,
  progress_percent NUMERIC(7, 2),
  formula TEXT,
  supporting_records JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  account_type TEXT,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  territory_id UUID REFERENCES si_territories(id) ON DELETE SET NULL,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_account_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES si_accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  workflow_status si_workflow_status NOT NULL DEFAULT 'draft',
  goals JSONB NOT NULL DEFAULT '{}',
  stakeholders JSONB NOT NULL DEFAULT '[]',
  action_plan JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_renewal_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id UUID REFERENCES si_accounts(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  renewal_type TEXT,
  renewal_date DATE,
  notice_period_days INTEGER,
  current_value_cents INTEGER,
  proposed_value_cents INTEGER,
  renewal_probability NUMERIC(5, 2),
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  workflow_status si_workflow_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_customer_growth_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  opportunity_type TEXT NOT NULL,
  title TEXT NOT NULL,
  confidence_score NUMERIC(5, 2),
  supporting_evidence JSONB NOT NULL DEFAULT '{}',
  limitations TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_retention_risk_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  risk_level TEXT NOT NULL,
  risk_factors JSONB NOT NULL DEFAULT '[]',
  confidence_score NUMERIC(5, 2),
  supporting_evidence JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rule_key TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_discount_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  policy_key TEXT NOT NULL,
  max_discount_percent NUMERIC(7, 2),
  margin_floor_percent NUMERIC(7, 2),
  approval_threshold_percent NUMERIC(7, 2),
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_discount_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quote_id UUID,
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  discount_percent NUMERIC(7, 2),
  discount_amount_cents INTEGER,
  reason TEXT,
  margin_impact_percent NUMERIC(7, 2),
  workflow_status si_workflow_status NOT NULL DEFAULT 'draft',
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_commission_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  plan_key TEXT NOT NULL,
  formula TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_commission_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES si_commission_plans(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status si_commission_status NOT NULL DEFAULT 'draft',
  amount_cents INTEGER NOT NULL DEFAULT 0,
  formula TEXT,
  source_transactions JSONB NOT NULL DEFAULT '{}',
  workflow_status si_workflow_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_qualification_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id UUID,
  recommendation TEXT,
  priority TEXT,
  confidence_score NUMERIC(5, 2),
  supporting_evidence JSONB NOT NULL DEFAULT '{}',
  limitations TEXT,
  requires_human_review BOOLEAN NOT NULL DEFAULT TRUE,
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_win_loss_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  opportunity_id UUID,
  outcome TEXT NOT NULL,
  reason TEXT,
  competitor TEXT,
  price_impact TEXT,
  customer_feedback TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  recorded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_revenue_leakage_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  finding_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  estimated_amount_cents INTEGER,
  source_records JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_partner_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  partner_type TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_referral_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  partner_id UUID REFERENCES si_partner_profiles(id) ON DELETE SET NULL,
  lead_id UUID,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  revenue_cents INTEGER,
  commission_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_tenders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  tender_number TEXT,
  deadline TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft',
  workflow_status si_workflow_status NOT NULL DEFAULT 'draft',
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  evaluation_outcome TEXT,
  win_loss_reason TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_sales_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity si_alert_severity NOT NULL DEFAULT 'warning',
  status si_alert_status NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT,
  source_module TEXT,
  source_entity_id UUID,
  context JSONB NOT NULL DEFAULT '{}',
  acknowledged_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_sales_action_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  draft_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  workflow_status si_workflow_status NOT NULL DEFAULT 'draft',
  source_records JSONB NOT NULL DEFAULT '{}',
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  requires_human_review BOOLEAN NOT NULL DEFAULT TRUE,
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pipeline_value_cents INTEGER NOT NULL DEFAULT 0,
  weighted_pipeline_cents INTEGER NOT NULL DEFAULT 0,
  open_opportunity_count INTEGER NOT NULL DEFAULT 0,
  active_lead_count INTEGER NOT NULL DEFAULT 0,
  open_alert_count INTEGER NOT NULL DEFAULT 0,
  renewal_exposure_cents INTEGER NOT NULL DEFAULT 0,
  revenue_leakage_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS si_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS si_pipelines_company_idx ON si_pipelines(company_id);
CREATE INDEX IF NOT EXISTS si_forecasts_company_idx ON si_forecasts(company_id);
CREATE INDEX IF NOT EXISTS si_sales_targets_company_idx ON si_sales_targets(company_id);
CREATE INDEX IF NOT EXISTS si_accounts_company_idx ON si_accounts(company_id);
CREATE INDEX IF NOT EXISTS si_renewal_records_company_idx ON si_renewal_records(company_id);
CREATE INDEX IF NOT EXISTS si_tenders_company_idx ON si_tenders(company_id);
CREATE INDEX IF NOT EXISTS si_sales_alerts_company_status_idx ON si_sales_alerts(company_id, status);
CREATE INDEX IF NOT EXISTS si_crm_provider_adapters_company_idx ON si_crm_provider_adapters(company_id);
CREATE INDEX IF NOT EXISTS si_analytics_snapshots_company_captured_idx ON si_analytics_snapshots(company_id, captured_at);
CREATE INDEX IF NOT EXISTS si_revenue_leakage_findings_company_status_idx ON si_revenue_leakage_findings(company_id, status);
