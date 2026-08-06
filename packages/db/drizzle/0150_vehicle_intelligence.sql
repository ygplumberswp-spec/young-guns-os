-- Vehicle Intelligence Foundation (Department 8.1)
-- Extends existing fleet / Cartrack / job-vehicle modules.
-- Vehicle profiles, fuel/cost/usage foundations, maintenance cues, AURA insight drafts.
-- No fake GPS/fuel. No auto fleet mutation.
-- Forward-only. Staging-first. Do not apply to production without Owner approval.

DO $$ BEGIN
  CREATE TYPE vi_insight_kind AS ENUM (
    'maintenance_need',
    'cost_trend',
    'fleet_risk',
    'fuel_attention',
    'usage_gap'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE vi_insight_draft_status AS ENUM (
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
  CREATE TYPE vi_aura_insight_target AS ENUM (
    'command_centre',
    'executive_dashboard',
    'fleet',
    'fleet_intelligence',
    'operations',
    'jobs',
    'scheduling',
    'technicians'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE vi_aura_insight_status AS ENUM (
    'open',
    'acknowledged',
    'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS vi_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  auto_fleet_mutation_enabled boolean NOT NULL DEFAULT false,
  invent_tracking_enabled boolean NOT NULL DEFAULT false,
  insight_drafts_enabled boolean NOT NULL DEFAULT true,
  fuel_signals_enabled boolean NOT NULL DEFAULT true,
  maintenance_signals_enabled boolean NOT NULL DEFAULT true,
  notes text,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vi_settings_company_uidx
  ON vi_settings (company_id);

CREATE TABLE IF NOT EXISTS vi_insight_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind vi_insight_kind NOT NULL,
  status vi_insight_draft_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL,
  vehicle_id uuid,
  job_id uuid,
  auto_fleet_mutation boolean NOT NULL DEFAULT false,
  invented_tracking boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vi_insight_drafts_company_idx
  ON vi_insight_drafts (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS vi_insight_drafts_status_idx
  ON vi_insight_drafts (company_id, status);

CREATE TABLE IF NOT EXISTS vi_aura_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target vi_aura_insight_target NOT NULL,
  status vi_aura_insight_status NOT NULL DEFAULT 'open',
  title text NOT NULL,
  insight text NOT NULL,
  href text,
  source_insight_draft_id uuid,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vi_aura_insights_company_idx
  ON vi_aura_insights (company_id, created_at DESC);

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vehicles'
  ) THEN
    BEGIN
      ALTER TABLE vi_insight_drafts
        ADD CONSTRAINT vi_insight_drafts_vehicle_id_fkey
        FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'jobs'
  ) THEN
    BEGIN
      ALTER TABLE vi_insight_drafts
        ADD CONSTRAINT vi_insight_drafts_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

DO $$ BEGIN
  BEGIN
    ALTER TABLE vi_aura_insights
      ADD CONSTRAINT vi_aura_insights_source_insight_draft_id_fkey
      FOREIGN KEY (source_insight_draft_id) REFERENCES vi_insight_drafts(id) ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
