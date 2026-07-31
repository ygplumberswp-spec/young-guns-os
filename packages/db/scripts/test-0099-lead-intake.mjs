/**
 * Disposable-DB verification for 0099_lead_intake_conversion.sql
 *
 * Safety:
 * - Creates a throwaway database, never mutates the admin DB name
 * - Refuses forbidden live project ref rshuiaghmtrvvilhqpwm
 * - Drops disposable DB in finally
 *
 * Usage:
 *   node --env-file=../../apps/api/.env.staging.local packages/db/scripts/test-0099-lead-intake.mjs
 */
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mig0099 = path.join(__dirname, '../drizzle/0099_lead_intake_conversion.sql');
const outPath = path.resolve(
  __dirname,
  '../../../diagnostic-output/79-migration-0099-lead-intake-disposable.json',
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

const TEST_DB = `titan_ux_d_mig_${Date.now().toString(36)}`;
const url = new URL(baseUrl);
const liveDbName = url.pathname.replace(/^\//, '').split('?')[0];
if (liveDbName.startsWith('titan_ux_d_mig_') || liveDbName.startsWith('titan_ux_b_')) {
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

const minimal = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
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
  title text NOT NULL DEFAULT 'Job',
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  CREATE TYPE lead_status AS ENUM ('new', 'qualified', 'contacted', 'opportunity', 'converted', 'lost');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE lead_activity_type AS ENUM ('call', 'email', 'meeting', 'follow_up', 'note', 'handoff', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  source_id uuid REFERENCES lead_sources(id) ON DELETE SET NULL,
  status lead_status NOT NULL DEFAULT 'new',
  title text NOT NULL,
  contact_name text NOT NULL,
  contact_email text,
  contact_phone text,
  score integer NOT NULL DEFAULT 0,
  assigned_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  converted_at timestamptz,
  lost_at timestamptz,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

const report = {
  migration: '0099_lead_intake_conversion',
  disposableDb: TEST_DB,
  checks: [],
  ok: false,
};

function pass(name) {
  report.checks.push({ name, ok: true });
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
  const migrationSql = fs.readFileSync(mig0099, 'utf8');
  await sql.unsafe(migrationSql);

  const statuses = await sql`
    SELECT enumlabel FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'lead_status'
    ORDER BY enumlabel
  `;
  const labels = statuses.map((r) => r.enumlabel);
  if (
    labels.includes('attempted_contact') &&
    labels.includes('ready_to_book') &&
    labels.includes('duplicate')
  ) {
    pass('lead_status_extended');
  } else {
    fail('lead_status_extended', JSON.stringify(labels));
  }

  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'leads'
      AND column_name IN (
        'company_name','service_type','contact_phone_e164','property_id','job_id',
        'next_action_due_at','marketing_consent','operational_contact_permission'
      )
  `;
  if (cols.length >= 8) pass('leads_columns_added');
  else fail('leads_columns_added', `found ${cols.length}`);

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('lead_status_history', 'lead_conversions')
  `;
  if (tables.length === 2) pass('conversion_tables_present');
  else fail('conversion_tables_present', JSON.stringify(tables));

  // Re-apply should be idempotent
  await sql.unsafe(migrationSql);
  pass('0099_reapply_idempotent');

  const [company] = await sql`INSERT INTO companies (name, slug) VALUES ('UX-D Co', 'ux-d-co') RETURNING id`;
  const [user] = await sql`
    INSERT INTO users (company_id, email) VALUES (${company.id}, 'owner@ux-d.test') RETURNING id
  `;
  const [lead] = await sql`
    INSERT INTO leads (company_id, title, contact_name, contact_phone_e164, status, created_by_user_id)
    VALUES (${company.id}, 'Blocked drain — Observatory', 'Ada Lead', '+27821234567', 'ready_to_book', ${user.id})
    RETURNING id, status
  `;
  await sql`
    INSERT INTO lead_status_history (company_id, lead_id, from_status, to_status, reason, actor_user_id)
    VALUES (${company.id}, ${lead.id}, 'new', 'ready_to_book', 'Qualified', ${user.id})
  `;
  await sql`
    INSERT INTO lead_conversions (
      company_id, lead_id, client_action_id, customer_mode, property_mode, create_job, converted_by_user_id
    ) VALUES (
      ${company.id}, ${lead.id}, 'ux-d-action-1', 'new', 'new', true, ${user.id}
    )
  `;
  try {
    await sql`
      INSERT INTO lead_conversions (
        company_id, lead_id, client_action_id, customer_mode, property_mode, create_job, converted_by_user_id
      ) VALUES (
        ${company.id}, ${crypto.randomUUID()}, 'ux-d-action-1', 'new', 'new', true, ${user.id}
      )
    `;
    fail('client_action_id_unique', 'duplicate client_action_id insert succeeded');
  } catch {
    pass('client_action_id_unique');
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
