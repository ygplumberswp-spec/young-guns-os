-- Property Intelligence Platform (Department 12)
-- Extends cx_customer_properties + customers / jobs / documents / recurring maintenance.
-- Property profiles, Maps coords, equipment/geysers, COCs/photos, work history, AURA drafts.
-- No fake properties. No auto-send. Coexists with Customer 360 (Dept 11).
-- Forward-only. Staging-first. Do not apply to production without Owner approval.
-- Never touch Yoco 0123.

DO $$ BEGIN
  CREATE TYPE pri_insight_kind AS ENUM (
    'property_history',
    'maintenance_opportunity',
    'follow_up',
    'equipment_attention',
    'coc_attention'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pri_insight_draft_status AS ENUM (
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
  CREATE TYPE pri_aura_insight_target AS ENUM (
    'command_centre',
    'executive_dashboard',
    'crm',
    'customer_360',
    'jobs',
    'documents',
    'recurring_maintenance',
    'operations'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pri_aura_insight_status AS ENUM (
    'open',
    'acknowledged',
    'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS pri_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  auto_send_enabled boolean NOT NULL DEFAULT false,
  invent_properties_enabled boolean NOT NULL DEFAULT false,
  insight_drafts_enabled boolean NOT NULL DEFAULT true,
  maps_signals_enabled boolean NOT NULL DEFAULT true,
  maintenance_signals_enabled boolean NOT NULL DEFAULT true,
  notes text,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pri_settings_company_uidx
  ON pri_settings (company_id);

CREATE TABLE IF NOT EXISTS pri_insight_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind pri_insight_kind NOT NULL,
  status pri_insight_draft_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL,
  property_id uuid,
  customer_id uuid,
  job_id uuid,
  auto_send boolean NOT NULL DEFAULT false,
  invented_property boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pri_insight_drafts_company_idx
  ON pri_insight_drafts (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pri_insight_drafts_status_idx
  ON pri_insight_drafts (company_id, status);

CREATE TABLE IF NOT EXISTS pri_aura_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target pri_aura_insight_target NOT NULL,
  status pri_aura_insight_status NOT NULL DEFAULT 'open',
  title text NOT NULL,
  insight text NOT NULL,
  href text,
  property_id uuid,
  customer_id uuid,
  source_insight_draft_id uuid,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pri_aura_insights_company_idx
  ON pri_aura_insights (company_id, created_at DESC);

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cx_customer_properties'
  ) THEN
    BEGIN
      ALTER TABLE pri_insight_drafts
        ADD CONSTRAINT pri_insight_drafts_property_id_fkey
        FOREIGN KEY (property_id) REFERENCES cx_customer_properties(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TABLE pri_aura_insights
        ADD CONSTRAINT pri_aura_insights_property_id_fkey
        FOREIGN KEY (property_id) REFERENCES cx_customer_properties(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'customers'
  ) THEN
    BEGIN
      ALTER TABLE pri_insight_drafts
        ADD CONSTRAINT pri_insight_drafts_customer_id_fkey
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TABLE pri_aura_insights
        ADD CONSTRAINT pri_aura_insights_customer_id_fkey
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
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
      ALTER TABLE pri_insight_drafts
        ADD CONSTRAINT pri_insight_drafts_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

DO $$ BEGIN
  BEGIN
    ALTER TABLE pri_aura_insights
      ADD CONSTRAINT pri_aura_insights_source_insight_draft_id_fkey
      FOREIGN KEY (source_insight_draft_id) REFERENCES pri_insight_drafts(id) ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
