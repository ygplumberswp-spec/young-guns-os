-- TITAN Operations — Workflow Automation Engine
-- Tasks, follow-ups, and draft AURA suggestions created by the workflow engine.
-- Monitoring aggregates existing workflow_runs (no demo/fake runs).
-- Forward-only. Do not apply to production from this change set without Owner approval.
-- Staging-first.

ALTER TYPE "workflow_trigger_type" ADD VALUE IF NOT EXISTS 'job_booked';
ALTER TYPE "workflow_trigger_type" ADD VALUE IF NOT EXISTS 'job_assigned';
ALTER TYPE "workflow_trigger_type" ADD VALUE IF NOT EXISTS 'maintenance_due';
ALTER TYPE "workflow_action_type" ADD VALUE IF NOT EXISTS 'trigger_aura_suggestion';

DO $$ BEGIN
  CREATE TYPE ops_workflow_task_status AS ENUM (
    'open',
    'completed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ops_workflow_follow_up_status AS ENUM (
    'draft',
    'pending_review',
    'approved',
    'declined',
    'completed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ops_workflow_aura_suggestion_status AS ENUM (
    'pending_approval',
    'approved',
    'rejected',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ops_workflow_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workflow_id uuid REFERENCES workflows(id) ON DELETE SET NULL,
  workflow_run_id uuid REFERENCES workflow_runs(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  status ops_workflow_task_status NOT NULL DEFAULT 'open',
  assignee_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops_workflow_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workflow_id uuid REFERENCES workflows(id) ON DELETE SET NULL,
  workflow_run_id uuid REFERENCES workflow_runs(id) ON DELETE SET NULL,
  title text NOT NULL,
  notes text,
  status ops_workflow_follow_up_status NOT NULL DEFAULT 'draft',
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  entity_type text,
  entity_id uuid,
  due_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops_workflow_aura_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workflow_id uuid REFERENCES workflows(id) ON DELETE SET NULL,
  workflow_run_id uuid REFERENCES workflow_runs(id) ON DELETE SET NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status ops_workflow_aura_suggestion_status NOT NULL DEFAULT 'pending_approval',
  supporting_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  auto_executed boolean NOT NULL DEFAULT false,
  entity_type text,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_workflow_tasks_company_status_idx
  ON ops_workflow_tasks (company_id, status);

CREATE INDEX IF NOT EXISTS ops_workflow_tasks_company_run_idx
  ON ops_workflow_tasks (company_id, workflow_run_id);

CREATE INDEX IF NOT EXISTS ops_workflow_follow_ups_company_status_idx
  ON ops_workflow_follow_ups (company_id, status);

CREATE INDEX IF NOT EXISTS ops_workflow_follow_ups_company_run_idx
  ON ops_workflow_follow_ups (company_id, workflow_run_id);

CREATE INDEX IF NOT EXISTS ops_workflow_aura_suggestions_company_status_idx
  ON ops_workflow_aura_suggestions (company_id, status);

CREATE INDEX IF NOT EXISTS ops_workflow_aura_suggestions_company_created_idx
  ON ops_workflow_aura_suggestions (company_id, created_at DESC);
