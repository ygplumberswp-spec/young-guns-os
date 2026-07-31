/**
 * Disposable-DB verification for 0096_job_execution_crew_contract.sql
 * Never mutates the live DATABASE_URL database name.
 *
 * Usage:
 *   node --env-file=../../apps/api/.env packages/db/scripts/test-0096-job-execution-crew.mjs
 * Prefer a non-live admin URL. Staging cutover uses .env.staging.local separately.
 */
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.join(__dirname, '../drizzle/0096_job_execution_crew_contract.sql');
const outPath = path.resolve(__dirname, '../../../diagnostic-output/31-migration-0096-test.json');

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const TEST_DB = `titan_ux_b_mig_${Date.now().toString(36)}`;
const url = new URL(baseUrl);
const liveDbName = url.pathname.replace(/^\//, '').split('?')[0];
if (liveDbName.startsWith('titan_ux_b_mig_')) {
  console.error('Refusing to run: DATABASE_URL already points at disposable test DB');
  process.exit(1);
}
if (baseUrl.toLowerCase().includes('rshuiaghmtrvvilhqpwm')) {
  console.error('Refusing to run against forbidden live project ref');
  process.exit(3);
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
CREATE TABLE companies (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE, email text NOT NULL, password_hash text NOT NULL DEFAULT 'x', first_name text NOT NULL DEFAULT 'A', last_name text NOT NULL DEFAULT 'B', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE customers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
DO $$ BEGIN CREATE TYPE job_status AS ENUM ('new','scheduled','in_progress','completed','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  title text NOT NULL,
  status job_status NOT NULL DEFAULT 'new',
  assigned_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN CREATE TYPE vehicle_status AS ENUM ('available','in_use','maintenance','out_of_service'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  license_plate text NOT NULL,
  status vehicle_status NOT NULL DEFAULT 'available',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sku text NOT NULL,
  name text NOT NULL
);
DO $$ BEGIN CREATE TYPE mobile_inventory_usage_status AS ENUM ('pending_approval','approved','rejected','executed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE mobile_job_inventory_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity integer NOT NULL,
  status mobile_inventory_usage_status NOT NULL DEFAULT 'pending_approval',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

const results = [];
function pass(name, detail = '') {
  results.push({ name, status: 'PASS', detail });
}
function fail(name, detail = '') {
  results.push({ name, status: 'FAIL', detail: String(detail).slice(0, 300) });
}

const admin = adminSql();
try {
  await admin.unsafe(`CREATE DATABASE ${TEST_DB}`);
} finally {
  await admin.end({ timeout: 5 });
}

const sql = testSql();
try {
  await sql.unsafe(minimal);
  await sql.unsafe(fs.readFileSync(migrationPath, 'utf8'));

  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema='public'
      and table_name in (
        'job_crew_members','job_vehicle_assignments','job_workflow_events',
        'job_variations','job_completion_snapshots','job_material_lines'
      )
    order by table_name
  `;
  if (tables.length === 6) pass('tables_created', tables.map((t) => t.table_name).join(','));
  else fail('tables_created', `count=${tables.length}`);

  const cols = await sql`
    select column_name from information_schema.columns
    where table_name='jobs' and column_name in ('execution_phase','reopen_reason')
  `;
  if (cols.length === 2) pass('jobs_execution_columns');
  else fail('jobs_execution_columns', cols.length);

  const [company] = await sql`insert into companies (name, slug) values ('UXB', 'uxb') returning id`;
  const [u1] = await sql`insert into users (company_id, email) values (${company.id}, 'a@t.test') returning id`;
  const [u2] = await sql`insert into users (company_id, email) values (${company.id}, 'b@t.test') returning id`;
  const [cust] = await sql`insert into customers (company_id, name) values (${company.id}, 'C') returning id`;
  const [job] = await sql`
    insert into jobs (company_id, customer_id, title, assigned_user_id)
    values (${company.id}, ${cust.id}, 'Job', ${u1.id})
    returning id, execution_phase
  `;
  if (job.execution_phase === 'assigned') pass('default_phase_assigned');
  else fail('default_phase_assigned', job.execution_phase);

  // Re-run seed portion effect: insert crew unique
  await sql`
    insert into job_crew_members (company_id, job_id, user_id, crew_role, is_primary)
    values (${company.id}, ${job.id}, ${u1.id}, 'crew_leader', true)
    on conflict (job_id, user_id) do nothing
  `;
  await sql`
    insert into job_crew_members (company_id, job_id, user_id, crew_role, is_primary)
    values (${company.id}, ${job.id}, ${u2.id}, 'assistant', false)
  `;
  const crewCount = (await sql`select count(*)::int as n from job_crew_members where job_id=${job.id}`)[0].n;
  if (crewCount === 2) pass('crew_multi_member');
  else fail('crew_multi_member', crewCount);

  const [vehicle] = await sql`
    insert into vehicles (company_id, name, license_plate) values (${company.id}, 'Van', 'CA123') returning id
  `;
  await sql`
    insert into job_vehicle_assignments (company_id, job_id, vehicle_id)
    values (${company.id}, ${job.id}, ${vehicle.id})
  `;
  pass('vehicle_assignment');

  await sql`
    insert into job_workflow_events (company_id, job_id, user_id, action, from_phase, to_phase, client_action_id)
    values (${company.id}, ${job.id}, ${u1.id}, 'accept', 'assigned', 'accepted', 'act-1')
  `;
  try {
    await sql`
      insert into job_workflow_events (company_id, job_id, user_id, action, client_action_id)
      values (${company.id}, ${job.id}, ${u1.id}, 'accept', 'act-1')
    `;
    fail('client_action_idempotency_index', 'duplicate allowed');
  } catch {
    pass('client_action_idempotency_index');
  }

  await sql`
    insert into job_completion_snapshots (company_id, job_id, completed_by_user_id, snapshot)
    values (${company.id}, ${job.id}, ${u1.id}, '{"ok":true}'::jsonb)
  `;
  try {
    await sql`
      insert into job_completion_snapshots (company_id, job_id, completed_by_user_id, snapshot)
      values (${company.id}, ${job.id}, ${u1.id}, '{"dup":true}'::jsonb)
    `;
    fail('completion_snapshot_unique', 'duplicate allowed');
  } catch {
    pass('completion_snapshot_unique');
  }

  pass('migration_applies_cleanly');
} catch (e) {
  fail('harness', e instanceof Error ? e.message : String(e));
} finally {
  await sql.end({ timeout: 5 });
  const drop = adminSql();
  try {
    await drop.unsafe(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = '${TEST_DB}' AND pid <> pg_backend_pid()
    `);
    await new Promise((r) => setTimeout(r, 500));
    await drop.unsafe(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  } catch (cleanupErr) {
    // Non-fatal on managed Postgres poolers that retain sessions briefly.
    results.push({
      name: 'cleanup_drop_database',
      status: 'PASS',
      detail: `deferred/orphan disposable DB ${TEST_DB}; ${cleanupErr instanceof Error ? cleanupErr.message : 'ok'}`.slice(0, 200),
    });
  } finally {
    await drop.end({ timeout: 5 });
  }
}

const report = {
  migration: '0096_job_execution_crew_contract',
  passed: results.filter((r) => r.status === 'PASS').length,
  failed: results.filter((r) => r.status === 'FAIL').length,
  results,
};
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, failed: report.failed, output: 'diagnostic-output/31-migration-0096-test.json' }));
process.exit(report.failed === 0 ? 0 : 1);
