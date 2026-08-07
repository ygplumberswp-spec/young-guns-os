-- TITAN Operations — Recurring Maintenance Engine
-- Plans, runs/history, in-app reminders, draft AURA suggestions, and
-- Owner-gated customer communication requests.
-- Extends existing asset_maintenance_schedules + al_preventive_maintenance_due
-- (maintenance.due → Workflow Automation). Does not invent demo plans/runs.
-- Forward-only. Staging-first. Do not apply to production without Owner approval.

DO $$ BEGIN
  CREATE TYPE ops_plumbing_equipment_kind AS ENUM (
    'geyser',
    'prv',
    'tank',
    'installed_equipment',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ops_maintenance_plan_status AS ENUM (
    'draft',
    'active',
    'paused',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ops_maintenance_run_status AS ENUM (
    'completed',
    'skipped',
    'missed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ops_maintenance_reminder_status AS ENUM (
    'pending',
    'acknowledged',
    'dismissed',
    'snoozed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ops_maintenance_comm_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'executed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ops_maintenance_aura_kind AS ENUM (
    'upcoming_alert',
    'missed_maintenance',
    'customer_opportunity'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ops_maintenance_aura_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ops_recurring_maintenance_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  asset_id uuid NOT NULL REFERENCES asset_equipment(id) ON DELETE CASCADE,
  schedule_id uuid REFERENCES asset_maintenance_schedules(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  property_id uuid REFERENCES cx_customer_properties(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  plumbing_kind ops_plumbing_equipment_kind NOT NULL DEFAULT 'installed_equipment',
  interval_days integer NOT NULL,
  next_due_at timestamptz,
  last_completed_at timestamptz,
  reminder_days_before integer NOT NULL DEFAULT 7,
  status ops_maintenance_plan_status NOT NULL DEFAULT 'draft',
  document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ops_recurring_maintenance_plans_interval_positive CHECK (interval_days > 0),
  CONSTRAINT ops_recurring_maintenance_plans_reminder_nonneg CHECK (reminder_days_before >= 0)
);

CREATE TABLE IF NOT EXISTS ops_maintenance_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES ops_recurring_maintenance_plans(id) ON DELETE CASCADE,
  due_id uuid REFERENCES al_preventive_maintenance_due(id) ON DELETE SET NULL,
  maintenance_record_id uuid REFERENCES asset_maintenance_records(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  status ops_maintenance_run_status NOT NULL DEFAULT 'completed',
  completed_at timestamptz,
  notes text,
  document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops_maintenance_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES ops_recurring_maintenance_plans(id) ON DELETE CASCADE,
  due_id uuid REFERENCES al_preventive_maintenance_due(id) ON DELETE SET NULL,
  title text NOT NULL,
  remind_at timestamptz NOT NULL,
  status ops_maintenance_reminder_status NOT NULL DEFAULT 'pending',
  acknowledged_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops_maintenance_comm_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES ops_recurring_maintenance_plans(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status ops_maintenance_comm_status NOT NULL DEFAULT 'draft',
  email_draft_id text,
  auto_executed boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  executed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops_maintenance_aura_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES ops_recurring_maintenance_plans(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES asset_equipment(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  kind ops_maintenance_aura_kind NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status ops_maintenance_aura_status NOT NULL DEFAULT 'draft',
  supporting_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  auto_executed boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_recurring_maintenance_plans_company_status_idx
  ON ops_recurring_maintenance_plans (company_id, status);

CREATE INDEX IF NOT EXISTS ops_recurring_maintenance_plans_company_due_idx
  ON ops_recurring_maintenance_plans (company_id, next_due_at);

CREATE INDEX IF NOT EXISTS ops_recurring_maintenance_plans_company_asset_idx
  ON ops_recurring_maintenance_plans (company_id, asset_id);

CREATE INDEX IF NOT EXISTS ops_recurring_maintenance_plans_company_customer_idx
  ON ops_recurring_maintenance_plans (company_id, customer_id);

CREATE INDEX IF NOT EXISTS ops_maintenance_runs_company_plan_idx
  ON ops_maintenance_runs (company_id, plan_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ops_maintenance_reminders_company_status_idx
  ON ops_maintenance_reminders (company_id, status, remind_at);

CREATE INDEX IF NOT EXISTS ops_maintenance_comm_requests_company_status_idx
  ON ops_maintenance_comm_requests (company_id, status);

CREATE INDEX IF NOT EXISTS ops_maintenance_aura_suggestions_company_status_idx
  ON ops_maintenance_aura_suggestions (company_id, status, created_at DESC);
