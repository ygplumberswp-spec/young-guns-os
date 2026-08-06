-- Inventory Intelligence Foundation (Department 5.1)
-- Extends existing inventory / procurement / job-material modules.
-- Stock visibility, usage signals, shortage alert drafts, AURA insights.
-- No fake stock. No auto-reorder / auto stock mutation.
-- Forward-only. Staging-first. Do not apply to production without Owner approval.

DO $$ BEGIN
  CREATE TYPE ii_alert_kind AS ENUM (
    'shortage',
    'below_reorder',
    'zero_stock',
    'usage_spike',
    'slow_moving',
    'warehouse_visibility'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ii_alert_status AS ENUM (
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
  CREATE TYPE ii_usage_kind AS ENUM (
    'job_issue',
    'job_return',
    'po_receipt',
    'adjustment',
    'waste',
    'net_consumption'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ii_insight_target AS ENUM (
    'command_centre',
    'executive_dashboard',
    'procurement',
    'operations',
    'jobs',
    'inventory'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ii_insight_status AS ENUM (
    'open',
    'acknowledged',
    'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ii_shortage_threshold_mode AS ENUM (
    'reorder_level',
    'zero_only'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ii_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  auto_reorder_enabled boolean NOT NULL DEFAULT false,
  auto_stock_mutation_enabled boolean NOT NULL DEFAULT false,
  alert_drafts_enabled boolean NOT NULL DEFAULT true,
  usage_signals_enabled boolean NOT NULL DEFAULT true,
  shortage_threshold_mode ii_shortage_threshold_mode NOT NULL DEFAULT 'reorder_level',
  notes text,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ii_settings_company_uidx
  ON ii_settings (company_id);

CREATE TABLE IF NOT EXISTS ii_alert_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind ii_alert_kind NOT NULL,
  status ii_alert_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL,
  inventory_item_id uuid,
  location_id uuid,
  quantity_on_hand integer,
  reorder_level integer,
  auto_reorder boolean NOT NULL DEFAULT false,
  auto_stock_mutation boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ii_alert_drafts_company_idx
  ON ii_alert_drafts (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ii_alert_drafts_status_idx
  ON ii_alert_drafts (company_id, status);

CREATE TABLE IF NOT EXISTS ii_usage_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind ii_usage_kind NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  inventory_item_id uuid,
  job_id uuid,
  purchase_order_id uuid,
  movement_count integer NOT NULL DEFAULT 0,
  net_quantity_delta integer NOT NULL DEFAULT 0,
  window_days integer NOT NULL DEFAULT 30,
  availability text NOT NULL DEFAULT 'unavailable',
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ii_usage_signals_company_idx
  ON ii_usage_signals (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ii_aura_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target ii_insight_target NOT NULL,
  status ii_insight_status NOT NULL DEFAULT 'open',
  title text NOT NULL,
  insight text NOT NULL,
  href text,
  source_alert_id uuid,
  source_usage_signal_id uuid,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ii_aura_insights_company_idx
  ON ii_aura_insights (company_id, created_at DESC);

-- Optional FKs when sibling inventory / procurement / jobs tables exist
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'inventory_items'
  ) THEN
    BEGIN
      ALTER TABLE ii_alert_drafts
        ADD CONSTRAINT ii_alert_drafts_inventory_item_id_fkey
        FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TABLE ii_usage_signals
        ADD CONSTRAINT ii_usage_signals_inventory_item_id_fkey
        FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'inventory_locations'
  ) THEN
    BEGIN
      ALTER TABLE ii_alert_drafts
        ADD CONSTRAINT ii_alert_drafts_location_id_fkey
        FOREIGN KEY (location_id) REFERENCES inventory_locations(id) ON DELETE SET NULL;
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
      ALTER TABLE ii_usage_signals
        ADD CONSTRAINT ii_usage_signals_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'purchase_orders'
  ) THEN
    BEGIN
      ALTER TABLE ii_usage_signals
        ADD CONSTRAINT ii_usage_signals_purchase_order_id_fkey
        FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

DO $$ BEGIN
  BEGIN
    ALTER TABLE ii_aura_insights
      ADD CONSTRAINT ii_aura_insights_source_alert_id_fkey
      FOREIGN KEY (source_alert_id) REFERENCES ii_alert_drafts(id) ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TABLE ii_aura_insights
      ADD CONSTRAINT ii_aura_insights_source_usage_signal_id_fkey
      FOREIGN KEY (source_usage_signal_id) REFERENCES ii_usage_signals(id) ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
