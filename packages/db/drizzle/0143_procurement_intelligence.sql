-- Supplier & Procurement Intelligence (Department 5.2)
-- Extends Inventory Intelligence Foundation + existing procurement / suppliers / pricing.
-- Purchase recommendation drafts, cost comparisons, AURA insights.
-- No automatic purchasing. Owner approval for recommend-accept / PO execute.
-- No fake suppliers, POs, or prices. Forward-only. Staging-first.
-- Does NOT touch Yoco webhook migration 0123.

DO $$ BEGIN
  CREATE TYPE pi_recommendation_kind AS ENUM (
    'purchase_suggestion',
    'supplier_opportunity',
    'cost_saving',
    'reorder_follow_up',
    'price_advantage',
    'aura_handoff'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pi_recommendation_status AS ENUM (
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
  CREATE TYPE pi_insight_target AS ENUM (
    'command_centre',
    'executive_dashboard',
    'inventory_intelligence',
    'procurement',
    'operations',
    'inventory'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pi_insight_status AS ENUM (
    'open',
    'acknowledged',
    'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS pi_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  auto_purchase_enabled boolean NOT NULL DEFAULT false,
  recommendations_enabled boolean NOT NULL DEFAULT true,
  cost_comparisons_enabled boolean NOT NULL DEFAULT true,
  notes text,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pi_settings_company_uidx
  ON pi_settings (company_id);

CREATE TABLE IF NOT EXISTS pi_cost_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  product_key text NOT NULL,
  inventory_item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  availability text NOT NULL DEFAULT 'unavailable',
  lowest_unit_cost_cents integer,
  highest_unit_cost_cents integer,
  savings_opportunity_cents integer,
  line_count integer NOT NULL DEFAULT 0,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  rationale text NOT NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pi_cost_comparisons_company_created_idx
  ON pi_cost_comparisons (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pi_purchase_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind pi_recommendation_kind NOT NULL,
  status pi_recommendation_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  inventory_item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  suggested_quantity integer,
  estimated_unit_cost_cents integer,
  estimated_total_cost_cents integer,
  source_inventory_alert_id uuid REFERENCES ii_alert_drafts(id) ON DELETE SET NULL,
  draft_purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  auto_purchase boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pi_purchase_recommendations_company_status_idx
  ON pi_purchase_recommendations (company_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS pi_aura_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target pi_insight_target NOT NULL,
  status pi_insight_status NOT NULL DEFAULT 'open',
  title text NOT NULL,
  insight text NOT NULL,
  href text,
  source_recommendation_id uuid REFERENCES pi_purchase_recommendations(id) ON DELETE SET NULL,
  source_cost_comparison_id uuid REFERENCES pi_cost_comparisons(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pi_aura_insights_company_status_idx
  ON pi_aura_insights (company_id, status, created_at DESC);
