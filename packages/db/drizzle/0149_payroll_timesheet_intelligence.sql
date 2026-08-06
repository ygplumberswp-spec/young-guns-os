-- Payroll & Timesheet Intelligence (Department 6.2)
-- Extends existing wi_timesheets / mobile_time_entries / payroll prep /
-- jobs / technician intelligence / HR Employee Intelligence (6.1).
-- Intelligence-layer settings + insight drafts + AURA handoffs only.
-- No fake employees. No invented wages. No auto payroll mutation.
-- Sensitive payroll: Owner/Admin only. Forward-only. Staging-first.
-- Do not apply to production without Owner approval.

DO $$ BEGIN
  CREATE TYPE pti_insight_kind AS ENUM (
    'overtime',
    'attendance',
    'approval_backlog',
    'job_time',
    'labour_cost',
    'cost_forecast',
    'payroll_summary'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pti_insight_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'cancelled',
    'acknowledged'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pti_aura_insight_target AS ENUM (
    'command_centre',
    'executive_dashboard',
    'hr_employee_intelligence',
    'workforce_intelligence',
    'technician_intelligence',
    'scheduling',
    'jobs',
    'payroll',
    'timesheets'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pti_aura_insight_status AS ENUM (
    'open',
    'acknowledged',
    'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS pti_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  insights_enabled boolean NOT NULL DEFAULT true,
  self_timesheet_view_enabled boolean NOT NULL DEFAULT true,
  standard_weekly_hours numeric(6, 2) NOT NULL DEFAULT 40,
  overtime_daily_threshold_hours numeric(6, 2) NOT NULL DEFAULT 8,
  invent_wages_enabled boolean NOT NULL DEFAULT false,
  auto_payroll_mutation_enabled boolean NOT NULL DEFAULT false,
  notes text,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pti_settings_company_uidx
  ON pti_settings (company_id);

CREATE TABLE IF NOT EXISTS pti_insight_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind pti_insight_kind NOT NULL,
  status pti_insight_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL,
  subject_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  invented_wages boolean NOT NULL DEFAULT false,
  auto_payroll_mutation boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pti_insight_drafts_company_idx
  ON pti_insight_drafts (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pti_insight_drafts_status_idx
  ON pti_insight_drafts (company_id, status);

CREATE TABLE IF NOT EXISTS pti_aura_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target pti_aura_insight_target NOT NULL,
  status pti_aura_insight_status NOT NULL DEFAULT 'open',
  title text NOT NULL,
  insight text NOT NULL,
  href text,
  source_insight_draft_id uuid REFERENCES pti_insight_drafts(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pti_aura_insights_company_idx
  ON pti_aura_insights (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pti_aura_insights_status_idx
  ON pti_aura_insights (company_id, status);
