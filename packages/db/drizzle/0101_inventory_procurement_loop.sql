-- UX-F Option B: van stock, stock movements, PO receive↑stock, material authorize↓stock
-- Forward-only. Disposable / staging only — never apply to live from this change set.

DO $$ BEGIN
  CREATE TYPE inventory_location_type AS ENUM ('warehouse', 'van', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE inventory_stock_movement_type AS ENUM (
    'receipt', 'issue', 'return_to_stock', 'adjustment', 'correction', 'waste'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE job_material_line_status AS ENUM (
    'requested', 'approved', 'used', 'partially_fulfilled',
    'returned', 'wasted', 'rejected', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE inventory_locations
  ADD COLUMN IF NOT EXISTS location_type inventory_location_type NOT NULL DEFAULT 'warehouse',
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inventory_locations_company_vehicle_idx
  ON inventory_locations (company_id, vehicle_id)
  WHERE vehicle_id IS NOT NULL;

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS unit_cost_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sell_price_cents integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS inventory_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES inventory_locations(id) ON DELETE RESTRICT,
  movement_type inventory_stock_movement_type NOT NULL,
  quantity_delta integer NOT NULL,
  quantity_before integer NOT NULL,
  quantity_after integer NOT NULL,
  unit_cost_cents integer NOT NULL DEFAULT 0,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  purchase_order_item_id uuid REFERENCES purchase_order_items(id) ON DELETE SET NULL,
  job_material_line_id uuid REFERENCES job_material_lines(id) ON DELETE SET NULL,
  reason text,
  notes text,
  client_action_id text,
  recorded_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_stock_movements_company_client_action_uidx
  ON inventory_stock_movements (company_id, client_action_id)
  WHERE client_action_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS inventory_stock_movements_item_location_idx
  ON inventory_stock_movements (company_id, item_id, location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS inventory_stock_movements_job_idx
  ON inventory_stock_movements (company_id, job_id)
  WHERE job_id IS NOT NULL;

-- Unique stock level per item+location for concurrency-safe upserts
CREATE UNIQUE INDEX IF NOT EXISTS inventory_stock_levels_item_location_uidx
  ON inventory_stock_levels (company_id, item_id, location_id);

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_reference text,
  ADD COLUMN IF NOT EXISTS destination_location_id uuid REFERENCES inventory_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_action_id text,
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS cancel_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_company_client_action_uidx
  ON purchase_orders (company_id, client_action_id)
  WHERE client_action_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS purchase_orders_company_job_idx
  ON purchase_orders (company_id, job_id)
  WHERE job_id IS NOT NULL;

ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS quantity_received integer NOT NULL DEFAULT 0;

ALTER TABLE job_material_lines
  ADD COLUMN IF NOT EXISTS status job_material_line_status NOT NULL DEFAULT 'used',
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES inventory_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_cost_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fulfilled_quantity numeric(12,3),
  ADD COLUMN IF NOT EXISTS client_action_id text,
  ADD COLUMN IF NOT EXISTS stock_movement_id uuid REFERENCES inventory_stock_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS return_reason text,
  ADD COLUMN IF NOT EXISTS quoted_quantity numeric(12,3);

-- Backfill: legacy material lines remain readable as used (no stock effect retroactively)
UPDATE job_material_lines
SET status = 'used'
WHERE status IS NULL OR status = 'used';

CREATE UNIQUE INDEX IF NOT EXISTS job_material_lines_company_client_action_uidx
  ON job_material_lines (company_id, client_action_id)
  WHERE client_action_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS job_material_lines_company_status_idx
  ON job_material_lines (company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS job_material_lines_job_status_idx
  ON job_material_lines (company_id, job_id, status);
