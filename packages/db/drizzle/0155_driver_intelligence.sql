-- Driver Intelligence (Department 8.2) — migration 0155
-- Extends Fleet / Cartrack / Vehicle Intelligence / job-vehicle modules.
-- Driver profiles, behaviour insights, route efficiency, trip analysis, AURA recommendation drafts.
-- No fake GPS. No automatic disciplinary actions. Owner/Admin only for behaviour intelligence.
-- Forward-only. Staging-first. Do not apply to production without Owner approval.
-- Never touch Yoco 0123.

DO $$ BEGIN
  CREATE TYPE dri_recommendation_kind AS ENUM (
    'efficiency_opportunity',
    'risk_pattern',
    'training_opportunity'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE dri_recommendation_status AS ENUM (
    'draft',
    'acknowledged',
    'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE dri_aura_insight_target AS ENUM (
    'command_centre',
    'executive_dashboard',
    'fleet',
    'fleet_intelligence',
    'vehicle_intelligence',
    'operations',
    'jobs',
    'scheduling',
    'technicians',
    'hr'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE dri_aura_insight_status AS ENUM (
    'open',
    'acknowledged',
    'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS dri_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  recommendation_drafts_enabled boolean NOT NULL DEFAULT true,
  behaviour_signals_enabled boolean NOT NULL DEFAULT true,
  trip_signals_enabled boolean NOT NULL DEFAULT true,
  auto_discipline_enabled boolean NOT NULL DEFAULT false,
  invent_gps_enabled boolean NOT NULL DEFAULT false,
  notes text,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS dri_settings_company_uidx
  ON dri_settings (company_id);

CREATE TABLE IF NOT EXISTS dri_recommendation_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind dri_recommendation_kind NOT NULL,
  status dri_recommendation_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL,
  driver_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  vehicle_id uuid,
  auto_discipline boolean NOT NULL DEFAULT false,
  invented_gps boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dri_recommendation_drafts_company_idx
  ON dri_recommendation_drafts (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS dri_recommendation_drafts_status_idx
  ON dri_recommendation_drafts (company_id, status);

CREATE TABLE IF NOT EXISTS dri_aura_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target dri_aura_insight_target NOT NULL,
  status dri_aura_insight_status NOT NULL DEFAULT 'open',
  title text NOT NULL,
  insight text NOT NULL,
  href text,
  source_recommendation_id uuid,
  driver_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dri_aura_insights_company_idx
  ON dri_aura_insights (company_id, created_at DESC);

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vehicles'
  ) THEN
    BEGIN
      ALTER TABLE dri_recommendation_drafts
        ADD CONSTRAINT dri_recommendation_drafts_vehicle_id_fkey
        FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

DO $$ BEGIN
  BEGIN
    ALTER TABLE dri_aura_insights
      ADD CONSTRAINT dri_aura_insights_source_recommendation_id_fkey
      FOREIGN KEY (source_recommendation_id) REFERENCES dri_recommendation_drafts(id) ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
