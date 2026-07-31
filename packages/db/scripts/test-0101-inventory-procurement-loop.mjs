/**
 * Disposable-DB verification for 0101_inventory_procurement_loop.sql
 *
 * Safety:
 * - Creates a throwaway database, never mutates the admin DB name
 * - Refuses forbidden live project ref rshuiaghmtrvvilhqpwm
 * - Drops disposable DB in finally
 *
 * Usage:
 *   node --env-file=apps/api/.env.staging.local packages/db/scripts/test-0101-inventory-procurement-loop.mjs
 */
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mig0101 = path.join(__dirname, '../drizzle/0101_inventory_procurement_loop.sql');
const outPath = path.resolve(
  __dirname,
  '../../../diagnostic-output/83-migration-0101-inventory-procurement-disposable.json',
);
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  console.error('DATABASE_URL required (admin connection to create disposable DB)');
  process.exit(1);
}
if (baseUrl.toLowerCase().includes(FORBIDDEN)) {
  console.error('Refusing to run against forbidden live project ref');
  process.exit(3);
}

const TEST_DB = `titan_ux_f_mig_${Date.now().toString(36)}`;
const url = new URL(baseUrl);
const liveDbName = url.pathname.replace(/^\//, '').split('?')[0];
if (
  liveDbName.startsWith('titan_ux_f_mig_') ||
  liveDbName.startsWith('titan_ux_e_mig_') ||
  liveDbName.startsWith('titan_ux_d_mig_') ||
  liveDbName.startsWith('titan_ux_b_')
) {
  console.error('Refusing to run: DATABASE_URL already points at disposable test DB');
  process.exit(1);
}

function adminSql() {
  const u = new URL(baseUrl);
  u.pathname = '/postgres';
  return postgres(u.toString(), { max: 1, onnotice: () => {} });
}

function testSql() {
  const u = new URL(baseUrl);
  u.pathname = `/${TEST_DB}`;
  return postgres(u.toString(), { max: 1, onnotice: () => {} });
}

// Minimal pre-0101 schema: only tables/columns 0101 ALTERs/CREATEs need.
// inventory_locations without location_type/vehicle_id; inventory_items without unit_cost;
// job_material_lines without status / location / cost columns.
const minimal = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  password_hash text NOT NULL DEFAULT 'x',
  first_name text NOT NULL DEFAULT 'A',
  last_name text NOT NULL DEFAULT 'B',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  job_number text NOT NULL DEFAULT 'JOB-000001',
  title text NOT NULL DEFAULT 'Job',
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TYPE vehicle_status AS ENUM ('available', 'in_use', 'maintenance', 'out_of_service');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  make text,
  model text,
  year integer,
  license_plate text NOT NULL,
  vin text,
  status vehicle_status NOT NULL DEFAULT 'available',
  assigned_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Pre-0101: no location_type / vehicle_id
CREATE TABLE inventory_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  address text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TYPE inventory_item_status AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Pre-0101: no unit_cost_cents / sell_price_cents
CREATE TABLE inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sku text NOT NULL,
  name text NOT NULL,
  description text,
  unit text NOT NULL DEFAULT 'each',
  reorder_level integer NOT NULL DEFAULT 0,
  status inventory_item_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Pre-0101: without inventory_stock_levels_item_location_uidx (added by 0101)
CREATE TABLE inventory_stock_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
  quantity_on_hand integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TYPE supplier_status AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE purchase_order_status AS ENUM (
    'draft', 'pending_approval', 'approved', 'ordered', 'received', 'completed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  address text,
  notes text,
  status supplier_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Pre-0101 purchase_orders: no job_id / job_reference / destination_location_id / client_action_id
CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  reference_number text NOT NULL,
  status purchase_order_status NOT NULL DEFAULT 'draft',
  notes text,
  total_cost_cents integer NOT NULL DEFAULT 0,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  ordered_at timestamptz,
  received_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Pre-0101: no quantity_received
CREATE TABLE purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_cost_cents integer NOT NULL DEFAULT 0,
  line_total_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TYPE job_material_source AS ENUM (
    'vehicle_stock', 'warehouse_stock', 'supplier_purchase', 'customer_supplied'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Pre-0101 job_material_lines: no status / location_id / unit_cost / client_action_id / etc.
CREATE TABLE job_material_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  recorded_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  description text NOT NULL,
  quantity numeric(12, 3) NOT NULL,
  unit text NOT NULL DEFAULT 'ea',
  material_source job_material_source NOT NULL,
  inventory_item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  supplier_reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

const report = {
  migration: '0101_inventory_procurement_loop',
  disposableDb: TEST_DB,
  checks: [],
  ok: false,
};

function pass(name, detail) {
  report.checks.push({ name, ok: true, ...(detail !== undefined ? { detail } : {}) });
  console.log(`PASS ${name}`);
}

function fail(name, detail) {
  report.checks.push({ name, ok: false, detail });
  console.error(`FAIL ${name}: ${detail}`);
}

let admin;
let sql;
try {
  admin = adminSql();
  await admin.unsafe(`CREATE DATABASE "${TEST_DB}"`);
  sql = testSql();
  await sql.unsafe(minimal);
  const migrationSql = fs.readFileSync(mig0101, 'utf8');
  await sql.unsafe(migrationSql);

  const locCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inventory_locations'
      AND column_name IN ('location_type', 'vehicle_id')
    ORDER BY column_name
  `;
  const locColNames = locCols.map((r) => r.column_name);
  if (locColNames.includes('location_type') && locColNames.includes('vehicle_id')) {
    pass('location_type_vehicle_id_columns', locColNames.join(','));
  } else {
    fail('location_type_vehicle_id_columns', JSON.stringify(locColNames));
  }

  const itemCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inventory_items'
      AND column_name IN ('unit_cost_cents', 'sell_price_cents')
    ORDER BY column_name
  `;
  if (itemCols.length === 2) {
    pass('inventory_items_cost_columns', itemCols.map((r) => r.column_name).join(','));
  } else {
    fail('inventory_items_cost_columns', JSON.stringify(itemCols.map((r) => r.column_name)));
  }

  const movements = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'inventory_stock_movements'
    ) AS present
  `;
  if (movements[0].present) {
    pass('inventory_stock_movements_table');
  } else {
    fail('inventory_stock_movements_table', 'missing');
  }

  const poCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'purchase_orders'
      AND column_name IN (
        'job_id', 'job_reference', 'destination_location_id',
        'client_action_id', 'delivery_status', 'cancel_reason'
      )
    ORDER BY column_name
  `;
  const poColNames = poCols.map((r) => r.column_name);
  if (
    poColNames.includes('job_reference') &&
    poColNames.includes('destination_location_id') &&
    poColNames.includes('job_id') &&
    poColNames.includes('client_action_id')
  ) {
    pass('purchase_orders_job_destination_columns', poColNames.join(','));
  } else {
    fail('purchase_orders_job_destination_columns', JSON.stringify(poColNames));
  }

  const poiCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'purchase_order_items'
      AND column_name = 'quantity_received'
  `;
  if (poiCols.length === 1) {
    pass('purchase_order_items_quantity_received');
  } else {
    fail('purchase_order_items_quantity_received', 'missing');
  }

  const matCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'job_material_lines'
      AND column_name IN (
        'status', 'location_id', 'unit_cost_cents', 'fulfilled_quantity',
        'client_action_id', 'stock_movement_id', 'approved_by_user_id',
        'approved_at', 'rejection_reason', 'return_reason', 'quoted_quantity'
      )
    ORDER BY column_name
  `;
  const matColNames = matCols.map((r) => r.column_name);
  if (matColNames.includes('status') && matColNames.length >= 8) {
    pass('job_material_lines_status_columns', matColNames.join(','));
  } else {
    fail('job_material_lines_status_columns', JSON.stringify(matColNames));
  }

  const expectedIndexes = [
    'inventory_stock_movements_company_client_action_uidx',
    'inventory_stock_levels_item_location_uidx',
    'purchase_orders_company_client_action_uidx',
    'job_material_lines_company_client_action_uidx',
  ];
  const uniqueIndexes = await sql`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = ANY(${expectedIndexes})
    ORDER BY indexname
  `;
  const indexNames = uniqueIndexes.map((r) => r.indexname);
  if (expectedIndexes.every((name) => indexNames.includes(name))) {
    pass('unique_indexes_present', indexNames.join(','));
  } else {
    fail('unique_indexes_present', `found ${JSON.stringify(indexNames)}`);
  }

  const statusLabels = await sql`
    SELECT enumlabel FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'job_material_line_status'
    ORDER BY enumlabel
  `;
  const labels = statusLabels.map((r) => r.enumlabel);
  if (labels.includes('requested') && labels.includes('returned') && labels.includes('approved')) {
    pass('job_material_line_status_enum', labels.join(','));
  } else {
    fail('job_material_line_status_enum', JSON.stringify(labels));
  }

  // Re-apply should be idempotent
  await sql.unsafe(migrationSql);
  pass('0101_reapply_idempotent');

  // Sanity round-trip: van location + movement + material line shape
  const [company] = await sql`INSERT INTO companies (name, slug) VALUES ('UX-F Co', 'ux-f-co') RETURNING id`;
  const [user] = await sql`
    INSERT INTO users (company_id, email) VALUES (${company.id}, 'owner@ux-f.test') RETURNING id
  `;
  const [customer] = await sql`
    INSERT INTO customers (company_id, name) VALUES (${company.id}, 'UX-F Customer') RETURNING id
  `;
  const [job] = await sql`
    INSERT INTO jobs (company_id, customer_id, job_number)
    VALUES (${company.id}, ${customer.id}, 'JOB-UXF-1')
    RETURNING id
  `;
  const [vehicle] = await sql`
    INSERT INTO vehicles (company_id, name, license_plate)
    VALUES (${company.id}, 'Van 1', 'UXF-001')
    RETURNING id
  `;
  const [warehouse] = await sql`
    INSERT INTO inventory_locations (company_id, name, address, location_type)
    VALUES (${company.id}, 'Main WH', '1 Dock Rd', 'warehouse')
    RETURNING id, location_type
  `;
  const [van] = await sql`
    INSERT INTO inventory_locations (company_id, name, location_type, vehicle_id)
    VALUES (${company.id}, 'Van Stock', 'van', ${vehicle.id})
    RETURNING id, vehicle_id
  `;
  if (warehouse.location_type === 'warehouse' && van.vehicle_id === vehicle.id) {
    pass('location_insert_van_and_warehouse', JSON.stringify({ warehouse: warehouse.id, van: van.id }));
  } else {
    fail('location_insert_van_and_warehouse', JSON.stringify({ warehouse, van }));
  }

  const [item] = await sql`
    INSERT INTO inventory_items (company_id, sku, name, unit_cost_cents, sell_price_cents)
    VALUES (${company.id}, 'PIPE-15', '15mm Copper Pipe', 1250, 2500)
    RETURNING id, unit_cost_cents
  `;
  await sql`
    INSERT INTO inventory_stock_levels (company_id, item_id, location_id, quantity_on_hand)
    VALUES (${company.id}, ${item.id}, ${warehouse.id}, 10)
  `;
  try {
    await sql`
      INSERT INTO inventory_stock_levels (company_id, item_id, location_id, quantity_on_hand)
      VALUES (${company.id}, ${item.id}, ${warehouse.id}, 5)
    `;
    fail('stock_levels_uidx_enforced', 'duplicate item+location succeeded');
  } catch {
    pass('stock_levels_uidx_enforced');
  }

  const [supplier] = await sql`
    INSERT INTO suppliers (company_id, name) VALUES (${company.id}, 'Parts Co') RETURNING id
  `;
  const [po] = await sql`
    INSERT INTO purchase_orders (
      company_id, supplier_id, reference_number, job_id, job_reference,
      destination_location_id, client_action_id, created_by_user_id
    ) VALUES (
      ${company.id}, ${supplier.id}, 'PO-0001', ${job.id}, 'JOB-UXF-1',
      ${warehouse.id}, 'ux-f-po-action-1', ${user.id}
    ) RETURNING id, job_reference, destination_location_id
  `;
  if (po.job_reference === 'JOB-UXF-1' && po.destination_location_id === warehouse.id) {
    pass('purchase_order_job_destination_shape', JSON.stringify(po));
  } else {
    fail('purchase_order_job_destination_shape', JSON.stringify(po));
  }

  const [poi] = await sql`
    INSERT INTO purchase_order_items (
      company_id, purchase_order_id, inventory_item_id, description, quantity, unit_cost_cents, line_total_cents
    ) VALUES (
      ${company.id}, ${po.id}, ${item.id}, '15mm Copper Pipe', 10, 1250, 12500
    ) RETURNING id, quantity_received
  `;
  if (poi.quantity_received === 0) {
    pass('purchase_order_item_quantity_received_default');
  } else {
    fail('purchase_order_item_quantity_received_default', String(poi.quantity_received));
  }

  const [movement] = await sql`
    INSERT INTO inventory_stock_movements (
      company_id, item_id, location_id, movement_type,
      quantity_delta, quantity_before, quantity_after, unit_cost_cents,
      job_id, purchase_order_id, purchase_order_item_id,
      client_action_id, recorded_by_user_id
    ) VALUES (
      ${company.id}, ${item.id}, ${warehouse.id}, 'receipt',
      10, 0, 10, 1250,
      ${job.id}, ${po.id}, ${poi.id},
      'ux-f-recv-1', ${user.id}
    ) RETURNING id
  `;

  const [matLine] = await sql`
    INSERT INTO job_material_lines (
      company_id, job_id, recorded_by_user_id, description, quantity,
      material_source, status, inventory_item_id, location_id,
      unit_cost_cents, client_action_id, stock_movement_id
    ) VALUES (
      ${company.id}, ${job.id}, ${user.id}, '15mm Copper Pipe', 2,
      'warehouse_stock', 'requested', ${item.id}, ${warehouse.id},
      1250, 'ux-f-mat-1', ${movement.id}
    ) RETURNING id, status
  `;
  if (matLine.status === 'requested') {
    pass('job_material_line_status_insert', matLine.status);
  } else {
    fail('job_material_line_status_insert', matLine.status);
  }

  try {
    await sql`
      INSERT INTO purchase_orders (
        company_id, supplier_id, reference_number, client_action_id
      ) VALUES (
        ${company.id}, ${supplier.id}, 'PO-DUP', 'ux-f-po-action-1'
      )
    `;
    fail('purchase_orders_client_action_uidx', 'duplicate client_action_id succeeded');
  } catch {
    pass('purchase_orders_client_action_uidx');
  }

  report.ok = report.checks.every((c) => c.ok);
} catch (error) {
  report.ok = false;
  report.error = error instanceof Error ? error.message : String(error);
  console.error(report.error);
} finally {
  if (sql) await sql.end({ timeout: 5 });
  if (admin) {
    try {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB}" WITH (FORCE)`);
      pass('disposable_db_dropped');
    } catch (error) {
      fail('disposable_db_dropped', error instanceof Error ? error.message : String(error));
    }
    await admin.end({ timeout: 5 });
  }
  report.ok = report.checks.every((c) => c.ok) && !report.error;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, outPath, disposableDb: TEST_DB }, null, 2));
  process.exit(report.ok ? 0 : 1);
}
