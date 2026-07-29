-- Enterprise Financial Planning, Treasury, Cash Flow & Profitability Intelligence Platform

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'financial_planning';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_fp_cash_flow_report';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_fp_budget_commentary';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_fp_forecast_commentary';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_fp_profitability_report';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_fp_payment_plan_proposal';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_fp_supplier_payment_recommendation';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_fp_executive_financial_summary';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_fp_variance_analysis';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fp_workflow_status') THEN
    CREATE TYPE fp_workflow_status AS ENUM (
      'draft',
      'review',
      'pending_approval',
      'approved',
      'executed',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fp_budget_status') THEN
    CREATE TYPE fp_budget_status AS ENUM (
      'draft',
      'review',
      'pending_approval',
      'active',
      'superseded',
      'archived'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fp_budget_period') THEN
    CREATE TYPE fp_budget_period AS ENUM ('annual', 'monthly', 'quarterly', 'rolling');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fp_forecast_type') THEN
    CREATE TYPE fp_forecast_type AS ENUM ('base', 'optimistic', 'conservative', 'custom');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fp_adapter_status') THEN
    CREATE TYPE fp_adapter_status AS ENUM ('active', 'inactive', 'testing', 'error');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fp_accounting_provider_type') THEN
    CREATE TYPE fp_accounting_provider_type AS ENUM (
      'xero',
      'quickbooks',
      'sage',
      'zoho_books',
      'dynamics',
      'sap',
      'netsuite',
      'freshbooks',
      'wave',
      'odoo',
      'csv_import',
      'sftp',
      'generic_rest',
      'webhook',
      'custom'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fp_banking_provider_type') THEN
    CREATE TYPE fp_banking_provider_type AS ENUM (
      'open_banking',
      'bank_api',
      'payment_gateway',
      'statement_feed',
      'csv_import',
      'ofx_import',
      'sftp',
      'manual_upload',
      'generic_rest',
      'webhook',
      'custom'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fp_alert_severity') THEN
    CREATE TYPE fp_alert_severity AS ENUM ('info', 'warning', 'critical');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fp_alert_status') THEN
    CREATE TYPE fp_alert_status AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fp_target_status') THEN
    CREATE TYPE fp_target_status AS ENUM ('draft', 'active', 'at_risk', 'achieved', 'missed', 'archived');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS fp_platform_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  finance_standards JSONB NOT NULL DEFAULT '{}',
  provider_adapter_templates JSONB NOT NULL DEFAULT '{}',
  currency_standards JSONB NOT NULL DEFAULT '{}',
  planning_templates JSONB NOT NULL DEFAULT '{}',
  kpi_templates JSONB NOT NULL DEFAULT '{}',
  risk_thresholds JSONB NOT NULL DEFAULT '{}',
  allocation_methods JSONB NOT NULL DEFAULT '{}',
  audit_retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fp_planning_categories (
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

CREATE TABLE IF NOT EXISTS fp_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  entity_type TEXT,
  currency TEXT,
  tax_jurisdiction TEXT,
  parent_entity_id UUID,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fp_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES fp_entities(id) ON DELETE SET NULL,
  category_id UUID REFERENCES fp_planning_categories(id) ON DELETE SET NULL,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  budget_period fp_budget_period NOT NULL DEFAULT 'annual',
  status fp_budget_status NOT NULL DEFAULT 'draft',
  workflow_status fp_workflow_status NOT NULL DEFAULT 'draft',
  period_start DATE,
  period_end DATE,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  version INTEGER NOT NULL DEFAULT 1,
  assumptions TEXT,
  notes TEXT,
  total_amount_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fp_budget_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  budget_id UUID NOT NULL REFERENCES fp_budgets(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  status fp_budget_status NOT NULL DEFAULT 'draft',
  workflow_status fp_workflow_status NOT NULL DEFAULT 'draft',
  assumptions TEXT,
  notes TEXT,
  total_amount_cents INTEGER,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fp_budget_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  budget_id UUID NOT NULL REFERENCES fp_budgets(id) ON DELETE CASCADE,
  budget_version_id UUID REFERENCES fp_budget_versions(id) ON DELETE SET NULL,
  line_key TEXT NOT NULL,
  description TEXT NOT NULL,
  department TEXT,
  branch TEXT,
  project TEXT,
  cost_centre TEXT,
  planned_amount_cents INTEGER NOT NULL DEFAULT 0,
  actual_amount_cents INTEGER NOT NULL DEFAULT 0,
  forecast_amount_cents INTEGER,
  variance_amount_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fp_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES fp_entities(id) ON DELETE SET NULL,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  forecast_type fp_forecast_type NOT NULL DEFAULT 'base',
  workflow_status fp_workflow_status NOT NULL DEFAULT 'draft',
  period_start DATE,
  period_end DATE,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  confidence_score NUMERIC(5, 2),
  assumptions JSONB NOT NULL DEFAULT '{}',
  source_records JSONB NOT NULL DEFAULT '{}',
  is_simulation BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fp_forecast_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  forecast_id UUID NOT NULL REFERENCES fp_forecasts(id) ON DELETE CASCADE,
  forecast_type fp_forecast_type NOT NULL DEFAULT 'base',
  revenue_cents INTEGER NOT NULL DEFAULT 0,
  expense_cents INTEGER NOT NULL DEFAULT 0,
  net_position_cents INTEGER NOT NULL DEFAULT 0,
  variance_from_budget_cents INTEGER,
  variance_from_prior_cents INTEGER,
  confidence_score NUMERIC(5, 2),
  assumptions JSONB NOT NULL DEFAULT '{}',
  source_records JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fp_cash_flow_projections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES fp_entities(id) ON DELETE SET NULL,
  projection_date DATE NOT NULL,
  period_type TEXT NOT NULL DEFAULT 'daily',
  opening_balance_cents INTEGER NOT NULL DEFAULT 0,
  expected_inflow_cents INTEGER NOT NULL DEFAULT 0,
  expected_outflow_cents INTEGER NOT NULL DEFAULT 0,
  closing_balance_cents INTEGER NOT NULL DEFAULT 0,
  cash_runway_days INTEGER,
  minimum_threshold_cents INTEGER,
  working_capital_cents INTEGER,
  confidence_score NUMERIC(5, 2),
  data_freshness TIMESTAMPTZ,
  source_records JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fp_treasury_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES fp_entities(id) ON DELETE SET NULL,
  banking_provider_id UUID,
  account_name TEXT NOT NULL,
  account_number_masked TEXT,
  bank_name TEXT,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  current_balance_cents INTEGER,
  available_balance_cents INTEGER,
  last_refreshed_at TIMESTAMPTZ,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fp_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES fp_entities(id) ON DELETE SET NULL,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  scenario_type TEXT NOT NULL,
  workflow_status fp_workflow_status NOT NULL DEFAULT 'draft',
  is_simulation BOOLEAN NOT NULL DEFAULT TRUE,
  assumptions JSONB NOT NULL DEFAULT '{}',
  cash_impact_cents INTEGER,
  profit_impact_cents INTEGER,
  margin_impact_percent NUMERIC(7, 2),
  working_capital_impact_cents INTEGER,
  confidence_score NUMERIC(5, 2),
  baseline_comparison JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fp_scenario_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  scenario_id UUID NOT NULL REFERENCES fp_scenarios(id) ON DELETE CASCADE,
  line_key TEXT NOT NULL,
  description TEXT NOT NULL,
  impact_type TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fp_financial_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES fp_entities(id) ON DELETE SET NULL,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_key TEXT NOT NULL,
  title TEXT NOT NULL,
  target_type TEXT NOT NULL,
  status fp_target_status NOT NULL DEFAULT 'draft',
  period_start DATE,
  period_end DATE,
  target_value NUMERIC(18, 4),
  current_value NUMERIC(18, 4),
  unit TEXT,
  currency TEXT,
  progress_percent NUMERIC(7, 2),
  supporting_records JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fp_financial_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity fp_alert_severity NOT NULL DEFAULT 'warning',
  status fp_alert_status NOT NULL DEFAULT 'open',
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

CREATE TABLE IF NOT EXISTS fp_accounting_provider_adapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES fp_entities(id) ON DELETE SET NULL,
  provider_type fp_accounting_provider_type NOT NULL,
  name TEXT NOT NULL,
  status fp_adapter_status NOT NULL DEFAULT 'inactive',
  sync_direction TEXT NOT NULL DEFAULT 'bidirectional',
  sync_frequency TEXT,
  account_mappings JSONB NOT NULL DEFAULT '{}',
  config JSONB NOT NULL DEFAULT '{}',
  last_sync_at TIMESTAMPTZ,
  last_health_check_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fp_banking_provider_adapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES fp_entities(id) ON DELETE SET NULL,
  provider_type fp_banking_provider_type NOT NULL,
  name TEXT NOT NULL,
  status fp_adapter_status NOT NULL DEFAULT 'inactive',
  account_mappings JSONB NOT NULL DEFAULT '{}',
  config JSONB NOT NULL DEFAULT '{}',
  refresh_schedule TEXT,
  last_sync_at TIMESTAMPTZ,
  last_health_check_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fp_profitability_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES fp_entities(id) ON DELETE SET NULL,
  dimension_type TEXT NOT NULL,
  dimension_id UUID,
  dimension_name TEXT,
  period_start DATE,
  period_end DATE,
  revenue_cents INTEGER NOT NULL DEFAULT 0,
  direct_cost_cents INTEGER NOT NULL DEFAULT 0,
  gross_profit_cents INTEGER NOT NULL DEFAULT 0,
  margin_percent NUMERIC(7, 2),
  allocation_method TEXT,
  formula TEXT,
  source_transactions JSONB NOT NULL DEFAULT '{}',
  exceptions JSONB NOT NULL DEFAULT '[]',
  data_freshness TIMESTAMPTZ,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fp_planning_action_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  draft_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  workflow_status fp_workflow_status NOT NULL DEFAULT 'draft',
  source_records JSONB NOT NULL DEFAULT '{}',
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  requires_human_review BOOLEAN NOT NULL DEFAULT TRUE,
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fp_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  active_budget_count INTEGER NOT NULL DEFAULT 0,
  active_forecast_count INTEGER NOT NULL DEFAULT 0,
  cash_position_cents INTEGER NOT NULL DEFAULT 0,
  cash_runway_days INTEGER,
  overdue_receivable_cents INTEGER NOT NULL DEFAULT 0,
  upcoming_payable_cents INTEGER NOT NULL DEFAULT 0,
  open_alert_count INTEGER NOT NULL DEFAULT 0,
  budget_variance_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fp_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fp_budgets_company_idx ON fp_budgets(company_id);
CREATE INDEX IF NOT EXISTS fp_forecasts_company_idx ON fp_forecasts(company_id);
CREATE INDEX IF NOT EXISTS fp_scenarios_company_idx ON fp_scenarios(company_id);
CREATE INDEX IF NOT EXISTS fp_financial_alerts_company_status_idx ON fp_financial_alerts(company_id, status);
CREATE INDEX IF NOT EXISTS fp_cash_flow_projections_company_date_idx ON fp_cash_flow_projections(company_id, projection_date);
CREATE INDEX IF NOT EXISTS fp_profitability_snapshots_company_dimension_idx ON fp_profitability_snapshots(company_id, dimension_type);
CREATE INDEX IF NOT EXISTS fp_accounting_provider_adapters_company_idx ON fp_accounting_provider_adapters(company_id);
CREATE INDEX IF NOT EXISTS fp_banking_provider_adapters_company_idx ON fp_banking_provider_adapters(company_id);
