-- HR Employee Intelligence Foundation (Department 6.1)
-- Extends existing users / roles / workforce skills-certs-training /
-- enterprise workforce profiles / timesheets / technician intelligence / jobs / scheduling.
-- Intelligence-layer settings, AURA insight handoffs, and recommendation drafts only.
-- No fake employees. No fake payroll. No automatic HR actions.
-- Owner/Admin privacy for sensitive HR. Forward-only. Staging-first.

DO $$ BEGIN
  CREATE TYPE hei_insight_target AS ENUM (
    'command_centre',
    'executive_dashboard',
    'workforce_intelligence',
    'technician_intelligence',
    'timesheets',
    'payroll',
    'jobs',
    'scheduling',
    'recruitment',
    'hr'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE hei_insight_status AS ENUM (
    'open',
    'acknowledged',
    'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE hei_recommendation_kind AS ENUM (
    'skills_shortage',
    'training_opportunity',
    'skill_gap',
    'capacity_issue',
    'workforce_improvement'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE hei_recommendation_status AS ENUM (
    'draft',
    'acknowledged',
    'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS hei_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  insights_enabled boolean NOT NULL DEFAULT true,
  self_view_enabled boolean NOT NULL DEFAULT true,
  recommendation_drafts_enabled boolean NOT NULL DEFAULT true,
  auto_payroll_mutation_enabled boolean NOT NULL DEFAULT false,
  invent_employees_enabled boolean NOT NULL DEFAULT false,
  auto_hr_actions_enabled boolean NOT NULL DEFAULT false,
  notes text,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS hei_settings_company_uidx
  ON hei_settings (company_id);

CREATE TABLE IF NOT EXISTS hei_aura_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target hei_insight_target NOT NULL,
  status hei_insight_status NOT NULL DEFAULT 'open',
  title text NOT NULL,
  insight text NOT NULL,
  href text,
  subject_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hei_aura_insights_company_idx
  ON hei_aura_insights (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS hei_aura_insights_status_idx
  ON hei_aura_insights (company_id, status);

CREATE TABLE IF NOT EXISTS hei_recommendation_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind hei_recommendation_kind NOT NULL,
  status hei_recommendation_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL,
  skill_key text,
  subject_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  auto_executed boolean NOT NULL DEFAULT false,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hei_recommendation_drafts_company_idx
  ON hei_recommendation_drafts (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS hei_recommendation_drafts_status_idx
  ON hei_recommendation_drafts (company_id, status);
