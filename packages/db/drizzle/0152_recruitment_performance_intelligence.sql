-- Recruitment & Performance Intelligence (Department 6.3)
-- Extends recruiting_candidates / applications / workforce skills-certs-training /
-- Technician Intelligence / jobs / quality / timesheets / HR Employee Intelligence /
-- Payroll & Timesheet Intelligence.
-- Interview workflow drafts + Owner-gated hiring drafts + AURA recommendation drafts
-- (training / capacity / workforce risk / planning). Recommendations only.
-- No automatic hiring. No fake candidates/scores. No automatic HR decisions.
-- Forward-only. Staging-first. Do not apply to production without Owner approval.

DO $$ BEGIN
  CREATE TYPE rpi_hiring_draft_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'cancelled',
    'executed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE rpi_interview_status AS ENUM (
    'draft',
    'scheduled',
    'completed',
    'cancelled',
    'pending_approval',
    'approved',
    'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE rpi_recommendation_kind AS ENUM (
    'performance_insight',
    'training',
    'skill_gap',
    'development_plan',
    'capacity_improvement',
    'workforce_risk',
    'workforce_planning'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE rpi_recommendation_status AS ENUM (
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
  CREATE TYPE rpi_aura_insight_target AS ENUM (
    'command_centre',
    'executive_dashboard',
    'hr_employee_intelligence',
    'payroll_timesheet_intelligence',
    'workforce_intelligence',
    'technician_intelligence',
    'recruiting',
    'jobs',
    'training',
    'performance',
    'timesheets'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE rpi_aura_insight_status AS ENUM (
    'open',
    'acknowledged',
    'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS rpi_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  recruitment_enabled boolean NOT NULL DEFAULT true,
  performance_insights_enabled boolean NOT NULL DEFAULT true,
  self_performance_view_enabled boolean NOT NULL DEFAULT true,
  interview_workflow_enabled boolean NOT NULL DEFAULT true,
  aura_suggestions_enabled boolean NOT NULL DEFAULT true,
  auto_hiring_enabled boolean NOT NULL DEFAULT false,
  invent_scores_enabled boolean NOT NULL DEFAULT false,
  notes text,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rpi_settings_company_uidx
  ON rpi_settings (company_id);

CREATE TABLE IF NOT EXISTS rpi_interview_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES recruiting_candidates(id) ON DELETE CASCADE,
  status rpi_interview_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL,
  scheduled_at timestamptz,
  interviewer_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  outcome_notes text,
  auto_hiring_decision boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rpi_interview_drafts_company_idx
  ON rpi_interview_drafts (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rpi_interview_drafts_status_idx
  ON rpi_interview_drafts (company_id, status);

CREATE TABLE IF NOT EXISTS rpi_hiring_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES recruiting_candidates(id) ON DELETE CASCADE,
  from_stage text,
  to_stage text NOT NULL,
  status rpi_hiring_draft_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL,
  auto_hiring_decision boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  executed_at timestamptz,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rpi_hiring_drafts_company_idx
  ON rpi_hiring_drafts (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rpi_hiring_drafts_status_idx
  ON rpi_hiring_drafts (company_id, status);

CREATE TABLE IF NOT EXISTS rpi_recommendation_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind rpi_recommendation_kind NOT NULL,
  status rpi_recommendation_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL,
  subject_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  auto_executed boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rpi_recommendation_drafts_company_idx
  ON rpi_recommendation_drafts (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rpi_recommendation_drafts_status_idx
  ON rpi_recommendation_drafts (company_id, status);

CREATE TABLE IF NOT EXISTS rpi_aura_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target rpi_aura_insight_target NOT NULL,
  status rpi_aura_insight_status NOT NULL DEFAULT 'open',
  title text NOT NULL,
  insight text NOT NULL,
  href text,
  source_hiring_draft_id uuid REFERENCES rpi_hiring_drafts(id) ON DELETE SET NULL,
  source_recommendation_id uuid REFERENCES rpi_recommendation_drafts(id) ON DELETE SET NULL,
  source_interview_draft_id uuid REFERENCES rpi_interview_drafts(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rpi_aura_insights_company_idx
  ON rpi_aura_insights (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rpi_aura_insights_status_idx
  ON rpi_aura_insights (company_id, status);
