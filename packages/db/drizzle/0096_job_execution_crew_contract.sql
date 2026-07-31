-- UX-B: Technician mobile job execution — crew, vehicle link, execution phase,
-- variations, completion snapshots, material source, idempotent workflow events.
-- Forward-only. Apply to staging only after disposable verification.

DO $$ BEGIN
  CREATE TYPE job_execution_phase AS ENUM (
    'assigned',
    'accepted',
    'en_route',
    'on_site',
    'in_progress',
    'paused',
    'awaiting_customer',
    'awaiting_parts',
    'awaiting_approval',
    'ready_to_complete',
    'completed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE job_crew_role AS ENUM (
    'crew_leader',
    'driver',
    'qualified',
    'semi_skilled',
    'assistant'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE job_material_source AS ENUM (
    'vehicle_stock',
    'warehouse_stock',
    'supplier_purchase',
    'customer_supplied'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE job_variation_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS execution_phase job_execution_phase,
  ADD COLUMN IF NOT EXISTS execution_phase_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopen_reason text,
  ADD COLUMN IF NOT EXISTS reopen_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopen_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

UPDATE jobs
SET execution_phase = CASE status
  WHEN 'completed' THEN 'completed'::job_execution_phase
  WHEN 'in_progress' THEN 'in_progress'::job_execution_phase
  WHEN 'scheduled' THEN 'assigned'::job_execution_phase
  WHEN 'cancelled' THEN 'assigned'::job_execution_phase
  ELSE 'assigned'::job_execution_phase
END
WHERE execution_phase IS NULL;

ALTER TABLE jobs
  ALTER COLUMN execution_phase SET DEFAULT 'assigned'::job_execution_phase;

UPDATE jobs
SET execution_phase = 'assigned'::job_execution_phase
WHERE execution_phase IS NULL;

ALTER TABLE jobs
  ALTER COLUMN execution_phase SET NOT NULL;

CREATE TABLE IF NOT EXISTS job_crew_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crew_role job_crew_role NOT NULL DEFAULT 'assistant',
  is_primary boolean NOT NULL DEFAULT false,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  unassigned_at timestamptz,
  assigned_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, user_id)
);

CREATE INDEX IF NOT EXISTS job_crew_members_company_user_active_idx
  ON job_crew_members (company_id, user_id)
  WHERE unassigned_at IS NULL;

CREATE INDEX IF NOT EXISTS job_crew_members_job_active_idx
  ON job_crew_members (job_id)
  WHERE unassigned_at IS NULL;

CREATE TABLE IF NOT EXISTS job_vehicle_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  unassigned_at timestamptz,
  assigned_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS job_vehicle_assignments_one_active_per_job_uidx
  ON job_vehicle_assignments (job_id)
  WHERE unassigned_at IS NULL;

CREATE INDEX IF NOT EXISTS job_vehicle_assignments_vehicle_active_idx
  ON job_vehicle_assignments (company_id, vehicle_id)
  WHERE unassigned_at IS NULL;

CREATE TABLE IF NOT EXISTS job_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action text NOT NULL,
  from_phase job_execution_phase,
  to_phase job_execution_phase,
  from_status job_status,
  to_status job_status,
  reason text,
  client_action_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS job_workflow_events_client_action_uidx
  ON job_workflow_events (company_id, client_action_id)
  WHERE client_action_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS job_workflow_events_job_created_idx
  ON job_workflow_events (job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS job_variations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status job_variation_status NOT NULL DEFAULT 'pending',
  title text NOT NULL,
  site_condition text NOT NULL,
  explanation text NOT NULL,
  labour_effect text,
  material_effect text,
  proposed_scope text,
  photo_doc_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  authorized_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  authorized_at timestamptz,
  authorization_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_variations_job_status_idx
  ON job_variations (job_id, status);

CREATE TABLE IF NOT EXISTS job_completion_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  completed_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_completion_snapshots_job_uidx UNIQUE (job_id)
);

CREATE TABLE IF NOT EXISTS job_material_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  recorded_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  description text NOT NULL,
  quantity numeric(12, 3) NOT NULL,
  unit text NOT NULL DEFAULT 'ea',
  material_source job_material_source NOT NULL,
  inventory_item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  inventory_usage_id uuid REFERENCES mobile_job_inventory_usage(id) ON DELETE SET NULL,
  supplier_reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_material_lines_job_idx
  ON job_material_lines (job_id, created_at DESC);

ALTER TABLE mobile_job_inventory_usage
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS material_source job_material_source,
  ADD COLUMN IF NOT EXISTS supplier_reference text;

-- Seed primary crew from legacy single assignee (active only)
INSERT INTO job_crew_members (company_id, job_id, user_id, crew_role, is_primary, assigned_by_user_id)
SELECT j.company_id, j.id, j.assigned_user_id, 'crew_leader'::job_crew_role, true, NULL
FROM jobs j
WHERE j.assigned_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM job_crew_members c
    WHERE c.job_id = j.id AND c.user_id = j.assigned_user_id
  )
ON CONFLICT (job_id, user_id) DO NOTHING;
