-- Fleet AI Recommendations (Department 8.3)
-- Extends Fleet / Cartrack / Vehicle Intelligence / jobs / costs / maintenance.
-- AURA optimisation recommendation drafts: maintenance, cost, route, efficiency, replacement.
-- Recommendations only. No automatic vehicle decisions. No invented GPS/costs.
-- Forward-only. Staging-first. Do not apply to production without Owner approval.
-- Never touch Yoco 0123.

DO $$ BEGIN
  CREATE TYPE far_recommendation_kind AS ENUM (
    'maintenance_suggestion',
    'cost_reduction',
    'route_improvement',
    'fleet_efficiency',
    'replacement_planning'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE far_recommendation_status AS ENUM (
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
  CREATE TYPE far_aura_insight_target AS ENUM (
    'command_centre',
    'executive_dashboard',
    'fleet',
    'fleet_intelligence',
    'vehicle_intelligence',
    'driver_intelligence',
    'operations',
    'jobs',
    'scheduling',
    'technicians'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE far_aura_insight_status AS ENUM (
    'open',
    'acknowledged',
    'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS far_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  auto_vehicle_decision_enabled boolean NOT NULL DEFAULT false,
  invent_gps_enabled boolean NOT NULL DEFAULT false,
  invent_costs_enabled boolean NOT NULL DEFAULT false,
  recommendation_drafts_enabled boolean NOT NULL DEFAULT true,
  maintenance_suggestions_enabled boolean NOT NULL DEFAULT true,
  cost_reduction_enabled boolean NOT NULL DEFAULT true,
  route_improvements_enabled boolean NOT NULL DEFAULT true,
  efficiency_insights_enabled boolean NOT NULL DEFAULT true,
  replacement_planning_enabled boolean NOT NULL DEFAULT true,
  notes text,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS far_settings_company_uidx
  ON far_settings (company_id);

CREATE TABLE IF NOT EXISTS far_recommendation_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind far_recommendation_kind NOT NULL,
  status far_recommendation_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL,
  vehicle_id uuid,
  job_id uuid,
  auto_vehicle_decision boolean NOT NULL DEFAULT false,
  invented_gps boolean NOT NULL DEFAULT false,
  invented_costs boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS far_recommendation_drafts_company_idx
  ON far_recommendation_drafts (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS far_recommendation_drafts_status_idx
  ON far_recommendation_drafts (company_id, status);

CREATE TABLE IF NOT EXISTS far_aura_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target far_aura_insight_target NOT NULL,
  status far_aura_insight_status NOT NULL DEFAULT 'open',
  title text NOT NULL,
  insight text NOT NULL,
  href text,
  source_recommendation_id uuid,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS far_aura_insights_company_idx
  ON far_aura_insights (company_id, created_at DESC);

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vehicles'
  ) THEN
    BEGIN
      ALTER TABLE far_recommendation_drafts
        ADD CONSTRAINT far_recommendation_drafts_vehicle_id_fkey
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
      ALTER TABLE far_recommendation_drafts
        ADD CONSTRAINT far_recommendation_drafts_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

DO $$ BEGIN
  BEGIN
    ALTER TABLE far_aura_insights
      ADD CONSTRAINT far_aura_insights_source_recommendation_id_fkey
      FOREIGN KEY (source_recommendation_id) REFERENCES far_recommendation_drafts(id) ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
