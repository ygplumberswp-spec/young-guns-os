/**
 * Disposable-DB verification for 0100_quote_to_cash_finance.sql
 *
 * Safety:
 * - Creates a throwaway database, never mutates the admin DB name
 * - Refuses forbidden live project ref rshuiaghmtrvvilhqpwm
 * - Drops disposable DB in finally
 *
 * Usage:
 *   node --env-file=../../apps/api/.env.staging.local packages/db/scripts/test-0100-quote-to-cash.mjs
 */
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mig0100 = path.join(__dirname, '../drizzle/0100_quote_to_cash_finance.sql');
const outPath = path.resolve(
  __dirname,
  '../../../diagnostic-output/81-migration-0100-quote-to-cash-disposable.json',
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

const TEST_DB = `titan_ux_e_mig_${Date.now().toString(36)}`;
const url = new URL(baseUrl);
const liveDbName = url.pathname.replace(/^\//, '').split('?')[0];
if (liveDbName.startsWith('titan_ux_e_mig_') || liveDbName.startsWith('titan_ux_d_mig_') || liveDbName.startsWith('titan_ux_b_')) {
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

// Minimal schema: only what 0100's ALTERs/CREATEs need to apply cleanly.
// quote_status carries only the legacy values that predate 0100 (which ADD VALUEs the rest).
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

CREATE TABLE cx_customer_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  property_name text NOT NULL DEFAULT 'Property',
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

-- Stub: only columns referenced by quotes.lead_id FK in 0100.
CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Legacy pre-0100 values only; 0100 ADD VALUEs 'internal_review', 'approved_for_sending',
-- 'viewed', 'superseded', 'converted', 'cancelled'.
DO $$ BEGIN
  CREATE TYPE quote_status AS ENUM ('draft', 'sent', 'accepted', 'declined', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  quote_number text NOT NULL,
  title text NOT NULL,
  status quote_status NOT NULL DEFAULT 'draft',
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ZAR',
  valid_until timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  title text NOT NULL,
  status invoice_status NOT NULL DEFAULT 'draft',
  amount_cents integer NOT NULL DEFAULT 0,
  amount_paid_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ZAR',
  due_date timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ZAR',
  method text NOT NULL DEFAULT 'other',
  reference text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Stub: only columns referenced by 0100's ALTER TABLE xero_invoice_mappings.
CREATE TABLE xero_invoice_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

const report = {
  migration: '0100_quote_to_cash_finance',
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
  const migrationSql = fs.readFileSync(mig0100, 'utf8');
  await sql.unsafe(migrationSql);

  const newTables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'company_finance_settings', 'quote_line_items', 'quote_acceptances',
        'payment_receipts', 'invoice_line_items'
      )
  `;
  const tableNames = newTables.map((r) => r.table_name).sort();
  const expectedTables = [
    'company_finance_settings',
    'invoice_line_items',
    'payment_receipts',
    'quote_acceptances',
    'quote_line_items',
  ];
  if (expectedTables.every((t) => tableNames.includes(t))) {
    pass('new_finance_tables_present', tableNames.join(','));
  } else {
    fail('new_finance_tables_present', `found ${JSON.stringify(tableNames)}`);
  }

  const quoteCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'quotes'
      AND column_name IN (
        'version_number', 'is_immutable', 'estimated_cost_cents', 'profit_floor_cents',
        'client_action_id', 'issued_at'
      )
  `;
  if (quoteCols.length === 6) {
    pass('quotes_columns_added', quoteCols.map((r) => r.column_name).join(','));
  } else {
    fail('quotes_columns_added', `found ${quoteCols.length}: ${JSON.stringify(quoteCols.map((r) => r.column_name))}`);
  }

  const invoiceCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'invoices'
      AND column_name IN ('stage', 'internal_number', 'xero_invoice_number', 'number_authority')
  `;
  if (invoiceCols.length === 4) {
    pass('invoices_columns_added', invoiceCols.map((r) => r.column_name).join(','));
  } else {
    fail('invoices_columns_added', `found ${invoiceCols.length}: ${JSON.stringify(invoiceCols.map((r) => r.column_name))}`);
  }

  const uniqueIndexes = await sql`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN ('quote_acceptances_company_client_action_uidx', 'quote_acceptances_quote_accept_uidx')
  `;
  const indexNames = uniqueIndexes.map((r) => r.indexname).sort();
  if (
    indexNames.includes('quote_acceptances_company_client_action_uidx') &&
    indexNames.includes('quote_acceptances_quote_accept_uidx')
  ) {
    pass('quote_acceptances_unique_indexes', indexNames.join(','));
  } else {
    fail('quote_acceptances_unique_indexes', JSON.stringify(indexNames));
  }

  const statusLabels = await sql`
    SELECT enumlabel FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'quote_status'
    ORDER BY enumlabel
  `;
  const labels = statusLabels.map((r) => r.enumlabel);
  if (labels.includes('superseded') && labels.includes('converted') && labels.includes('viewed')) {
    pass('quote_status_enum_extended', labels.join(','));
  } else {
    fail('quote_status_enum_extended', JSON.stringify(labels));
  }

  // Re-apply should be idempotent
  await sql.unsafe(migrationSql);
  pass('0100_reapply_idempotent');

  // Sanity round-trip through the new schema shape.
  const [company] = await sql`INSERT INTO companies (name, slug) VALUES ('UX-E Co', 'ux-e-co') RETURNING id`;
  const [user] = await sql`
    INSERT INTO users (company_id, email) VALUES (${company.id}, 'owner@ux-e.test') RETURNING id
  `;
  const [customer] = await sql`
    INSERT INTO customers (company_id, name) VALUES (${company.id}, 'UX-E Customer') RETURNING id
  `;
  const [quote] = await sql`
    INSERT INTO quotes (
      company_id, customer_id, quote_number, title, status,
      subtotal_cents, vat_cents, total_cents, amount_cents,
      estimated_cost_cents, profit_floor_cents, client_action_id, estimator_user_id
    ) VALUES (
      ${company.id}, ${customer.id}, 'Q-0001', 'Drain repair', 'sent',
      100000, 15000, 115000, 115000,
      50000, 60000, 'ux-e-mig-action-1', ${user.id}
    ) RETURNING id, version_number, is_immutable
  `;
  if (quote.version_number === 1 && quote.is_immutable === false) {
    pass('quote_insert_defaults', JSON.stringify(quote));
  } else {
    fail('quote_insert_defaults', JSON.stringify(quote));
  }

  await sql`
    INSERT INTO quote_line_items (company_id, quote_id, description, unit_price_cents, unit_cost_cents, line_subtotal_cents, line_vat_cents, line_total_cents, line_cost_cents)
    VALUES (${company.id}, ${quote.id}, 'Labour', 100000, 50000, 100000, 15000, 115000, 50000)
  `;
  await sql`
    INSERT INTO quote_acceptances (company_id, quote_id, customer_id, client_action_id, decision, accepted_version_number, accepter_name)
    VALUES (${company.id}, ${quote.id}, ${customer.id}, 'ux-e-accept-1', 'accepted', 1, 'Ada Client')
  `;
  try {
    await sql`
      INSERT INTO quote_acceptances (company_id, quote_id, customer_id, client_action_id, decision, accepted_version_number, accepter_name)
      VALUES (${company.id}, ${quote.id}, ${customer.id}, 'ux-e-accept-2', 'accepted', 1, 'Ada Client Again')
    `;
    fail('quote_accept_uidx_enforced', 'duplicate accepted row for same quote succeeded');
  } catch {
    pass('quote_accept_uidx_enforced');
  }

  const [invoice] = await sql`
    INSERT INTO invoices (
      company_id, customer_id, quote_id, invoice_number, internal_number, number_authority,
      title, status, stage, subtotal_cents, vat_cents, total_cents, amount_cents, client_action_id
    ) VALUES (
      ${company.id}, ${customer.id}, ${quote.id}, 'INV-0001', 'TITAN-INV-000001', 'internal_pending_xero',
      'Deposit invoice', 'sent', 'deposit', 100000, 15000, 115000, 115000, 'ux-e-inv-action-1'
    ) RETURNING id, internal_number, xero_invoice_number, number_authority
  `;
  if (invoice.internal_number === 'TITAN-INV-000001' && invoice.xero_invoice_number === null) {
    pass('invoice_insert_pending_xero_shape', JSON.stringify(invoice));
  } else {
    fail('invoice_insert_pending_xero_shape', JSON.stringify(invoice));
  }

  const [payment] = await sql`
    INSERT INTO payments (company_id, invoice_id, amount_cents, client_action_id, recorded_by_user_id)
    VALUES (${company.id}, ${invoice.id}, 50000, 'ux-e-pay-action-1', ${user.id})
    RETURNING id
  `;
  await sql`
    INSERT INTO payment_receipts (company_id, payment_id, invoice_id, receipt_number)
    VALUES (${company.id}, ${payment.id}, ${invoice.id}, 'RCP-000001')
  `;
  try {
    await sql`
      INSERT INTO payment_receipts (company_id, payment_id, invoice_id, receipt_number)
      VALUES (${company.id}, ${payment.id}, ${invoice.id}, 'RCP-000002')
    `;
    fail('payment_receipt_uidx_enforced', 'duplicate receipt for same payment succeeded');
  } catch {
    pass('payment_receipt_uidx_enforced');
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
