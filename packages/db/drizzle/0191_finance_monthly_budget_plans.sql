-- FIN-004 — Monthly budget / target plans (plan data only; never stores actuals)

CREATE TABLE IF NOT EXISTS finance_monthly_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_month date NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  revenue_target_cents integer,
  gross_margin_target_pct numeric(8, 2),
  gross_profit_target_cents integer,
  overhead_budget_cents integer,
  operating_profit_target_cents integer,
  cash_collection_target_cents integer,
  notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_monthly_plans_company_month_unique
  ON finance_monthly_plans (company_id, plan_month);

CREATE INDEX IF NOT EXISTS finance_monthly_plans_company_month_idx
  ON finance_monthly_plans (company_id, plan_month DESC);

CREATE TABLE IF NOT EXISTS finance_monthly_plan_overhead_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES finance_monthly_plans(id) ON DELETE CASCADE,
  category text NOT NULL,
  budget_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_monthly_plan_overhead_lines_plan_category_unique
  ON finance_monthly_plan_overhead_lines (plan_id, category);

CREATE INDEX IF NOT EXISTS finance_monthly_plan_overhead_lines_company_idx
  ON finance_monthly_plan_overhead_lines (company_id, plan_id);
