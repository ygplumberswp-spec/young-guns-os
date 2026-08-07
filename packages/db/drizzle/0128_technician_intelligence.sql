-- TITAN Operations — Technician Intelligence
-- Draft AURA insights only. Lifecycle uses existing job_workflow_events.
-- Metrics are live-aggregated from jobs / timesheets / quality / CX.
-- Forward-only. Do not apply to production from this change set without Owner approval.
-- Staging-first.

DO $$ BEGIN
  CREATE TYPE ti_aura_insight_type AS ENUM (
    'delay',
    'trend',
    'improvement'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ti_aura_insight_status AS ENUM (
    'pending_approval',
    'approved',
    'rejected',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ti_aura_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  insight_type ti_aura_insight_type NOT NULL,
  status ti_aura_insight_status NOT NULL DEFAULT 'pending_approval',
  subject text NOT NULL,
  body text NOT NULL,
  technician_id uuid REFERENCES users(id) ON DELETE SET NULL,
  supporting_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  auto_executed boolean NOT NULL DEFAULT false,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ti_aura_insights_company_status_idx
  ON ti_aura_insights (company_id, status);

CREATE INDEX IF NOT EXISTS ti_aura_insights_company_technician_idx
  ON ti_aura_insights (company_id, technician_id);

CREATE INDEX IF NOT EXISTS ti_aura_insights_company_created_idx
  ON ti_aura_insights (company_id, created_at DESC);
