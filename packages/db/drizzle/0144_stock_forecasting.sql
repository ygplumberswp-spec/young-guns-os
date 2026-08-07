-- Stock Forecasting & Automation (Department 5.3)
-- Extends Inventory Intelligence (5.1) + Procurement Intelligence (5.2).
-- Demand / shortage / reorder timing forecasts from real movements.
-- AURA reorder recommendation drafts — Owner approval only.
-- Never auto-reorder / auto-purchase. No invented demand.
-- Forward-only. Staging-first. Do not apply to production without Owner approval.
-- Does NOT touch Yoco webhook migration 0123.

DO $$ BEGIN
  CREATE TYPE sf_recommendation_kind AS ENUM (
    'reorder',
    'buy_now',
    'buy_soon',
    'watch',
    'maintenance_demand',
    'job_demand',
    'aura_handoff'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sf_recommendation_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'cancelled',
    'accepted'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sf_insight_target AS ENUM (
    'command_centre',
    'executive_dashboard',
    'inventory_intelligence',
    'procurement_intelligence',
    'procurement',
    'maintenance',
    'jobs',
    'inventory',
    'operations'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sf_insight_status AS ENUM (
    'open',
    'acknowledged',
    'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sf_shortage_risk AS ENUM (
    'none',
    'watch',
    'high',
    'unavailable'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sf_trend AS ENUM (
    'up',
    'flat',
    'down',
    'unavailable'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS sf_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  auto_reorder_enabled boolean NOT NULL DEFAULT false,
  auto_purchase_enabled boolean NOT NULL DEFAULT false,
  forecasting_enabled boolean NOT NULL DEFAULT true,
  recommendations_enabled boolean NOT NULL DEFAULT true,
  min_issue_events integer NOT NULL DEFAULT 3,
  window_days integer NOT NULL DEFAULT 30,
  notes text,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sf_settings_company_uidx
  ON sf_settings (company_id);

CREATE TABLE IF NOT EXISTS sf_item_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  availability text NOT NULL DEFAULT 'unavailable',
  quantity_on_hand integer NOT NULL DEFAULT 0,
  reorder_level integer NOT NULL DEFAULT 0,
  window_days integer NOT NULL DEFAULT 30,
  issue_event_count integer NOT NULL DEFAULT 0,
  total_consumed integer NOT NULL DEFAULT 0,
  avg_daily_demand numeric(12, 4),
  projected_days_of_cover numeric(12, 2),
  suggested_reorder_qty integer,
  suggested_reorder_by text,
  lead_time_days integer,
  shortage_risk sf_shortage_risk NOT NULL DEFAULT 'unavailable',
  trend sf_trend NOT NULL DEFAULT 'unavailable',
  seasonal jsonb NOT NULL DEFAULT '{}'::jsonb,
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  rationale text NOT NULL,
  job_linked_consumption integer NOT NULL DEFAULT 0,
  maintenance_signal_count integer NOT NULL DEFAULT 0,
  source_alert_id uuid,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sf_item_forecasts_company_idx
  ON sf_item_forecasts (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sf_item_forecasts_item_idx
  ON sf_item_forecasts (company_id, inventory_item_id);

CREATE TABLE IF NOT EXISTS sf_reorder_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind sf_recommendation_kind NOT NULL,
  status sf_recommendation_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL,
  inventory_item_id uuid,
  supplier_id uuid,
  forecast_id uuid,
  suggested_quantity integer,
  suggested_reorder_by text,
  why_needed text NOT NULL,
  when_to_buy text NOT NULL,
  what_to_buy text NOT NULL,
  expected_usage text NOT NULL DEFAULT '',
  source_procurement_recommendation_id uuid,
  draft_purchase_order_id uuid,
  auto_reorder boolean NOT NULL DEFAULT false,
  auto_purchase boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sf_reorder_recommendations_company_idx
  ON sf_reorder_recommendations (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sf_reorder_recommendations_status_idx
  ON sf_reorder_recommendations (company_id, status);

CREATE TABLE IF NOT EXISTS sf_aura_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target sf_insight_target NOT NULL,
  status sf_insight_status NOT NULL DEFAULT 'open',
  title text NOT NULL,
  insight text NOT NULL,
  href text,
  source_forecast_id uuid,
  source_recommendation_id uuid,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sf_aura_insights_company_idx
  ON sf_aura_insights (company_id, created_at DESC);

-- Optional FKs after related 5.1/5.2 tables exist (safe if already present).
DO $$ BEGIN
  ALTER TABLE sf_item_forecasts
    ADD CONSTRAINT sf_item_forecasts_source_alert_fk
    FOREIGN KEY (source_alert_id) REFERENCES ii_alert_drafts(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE sf_reorder_recommendations
    ADD CONSTRAINT sf_reorder_recommendations_forecast_fk
    FOREIGN KEY (forecast_id) REFERENCES sf_item_forecasts(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE sf_reorder_recommendations
    ADD CONSTRAINT sf_reorder_recommendations_item_fk
    FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE sf_reorder_recommendations
    ADD CONSTRAINT sf_reorder_recommendations_supplier_fk
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE sf_reorder_recommendations
    ADD CONSTRAINT sf_reorder_recommendations_pi_rec_fk
    FOREIGN KEY (source_procurement_recommendation_id)
    REFERENCES pi_purchase_recommendations(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE sf_reorder_recommendations
    ADD CONSTRAINT sf_reorder_recommendations_draft_po_fk
    FOREIGN KEY (draft_purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE sf_aura_insights
    ADD CONSTRAINT sf_aura_insights_forecast_fk
    FOREIGN KEY (source_forecast_id) REFERENCES sf_item_forecasts(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE sf_aura_insights
    ADD CONSTRAINT sf_aura_insights_rec_fk
    FOREIGN KEY (source_recommendation_id) REFERENCES sf_reorder_recommendations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
