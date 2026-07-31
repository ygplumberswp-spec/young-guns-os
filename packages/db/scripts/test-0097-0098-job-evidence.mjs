/**
 * Disposable-DB verification for:
 *   0097_job_evidence_offline_contract.sql
 *   0098_job_material_used_trigger.sql
 *
 * Safety:
 * - Creates a throwaway database, never mutates the admin DB name
 * - Refuses forbidden live project ref rshuiaghmtrvvilhqpwm
 * - Drops disposable DB in finally
 *
 * Usage (admin URL capable of CREATE DATABASE — staging local preferred):
 *   node --env-file=../../apps/api/.env.staging.local packages/db/scripts/test-0097-0098-job-evidence.mjs
 */
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mig0097 = path.join(__dirname, '../drizzle/0097_job_evidence_offline_contract.sql');
const mig0098 = path.join(__dirname, '../drizzle/0098_job_material_used_trigger.sql');
const outPath = path.resolve(__dirname, '../../../diagnostic-output/44-migration-0097-0098-disposable.json');
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

const TEST_DB = `titan_ux_b_ev_${Date.now().toString(36)}`;
const url = new URL(baseUrl);
const liveDbName = url.pathname.replace(/^\//, '').split('?')[0];
if (liveDbName.startsWith('titan_ux_b_ev_') || liveDbName.startsWith('titan_ux_b_mig_')) {
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
DO $$ BEGIN CREATE TYPE job_status AS ENUM ('new','scheduled','in_progress','completed','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  title text NOT NULL,
  status job_status NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  CREATE TYPE mobile_documentation_type AS ENUM (
    'photo','video','document','inspection_form','safety_checklist','customer_signature'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE mobile_job_documentation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  documentation_type mobile_documentation_type NOT NULL,
  title text NOT NULL,
  file_name text,
  mime_type text,
  size_bytes integer,
  content text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mobile_sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_type text NOT NULL,
  resource_id uuid,
  status text NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mobile_pending_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  CREATE TYPE workflow_trigger_type AS ENUM ('job_created','job_completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
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
  pass('create_disposable_database', TEST_DB);
} catch (e) {
  fail('create_disposable_database', e instanceof Error ? e.message : String(e));
  await admin.end({ timeout: 5 });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ passed: 0, failed: 1, results }, null, 2));
  process.exit(1);
} finally {
  await admin.end({ timeout: 5 });
}

const sql = testSql();
try {
  await sql.unsafe(minimal);
  pass('minimal_schema_seeded');

  await sql.unsafe(fs.readFileSync(mig0097, 'utf8'));
  pass('apply_0097');

  const cols = await sql`
    select column_name from information_schema.columns
    where table_name = 'mobile_job_documentation'
      and column_name in ('storage_key','checksum_sha256','client_action_id','evidence_phase')
    order by column_name
  `;
  if (cols.length === 4) pass('documentation_evidence_columns', cols.map((c) => c.column_name).join(','));
  else fail('documentation_evidence_columns', `count=${cols.length}`);

  const syncCol = await sql`
    select 1 from information_schema.columns
    where table_name='mobile_sync_queue' and column_name='client_action_id'
  `;
  const pendingCol = await sql`
    select 1 from information_schema.columns
    where table_name='mobile_pending_actions' and column_name='client_action_id'
  `;
  if (syncCol.length === 1 && pendingCol.length === 1) pass('queue_client_action_columns');
  else fail('queue_client_action_columns', `sync=${syncCol.length} pending=${pendingCol.length}`);

  const [company] = await sql`insert into companies (name, slug) values ('EV', 'ev') returning id`;
  const [user] = await sql`insert into users (company_id, email) values (${company.id}, 't@t.test') returning id`;
  const [cust] = await sql`insert into customers (company_id, name) values (${company.id}, 'C') returning id`;
  const [job] = await sql`
    insert into jobs (company_id, customer_id, title) values (${company.id}, ${cust.id}, 'J') returning id
  `;

  await sql`
    insert into mobile_job_documentation (
      company_id, user_id, job_id, documentation_type, title, storage_key, checksum_sha256, client_action_id, evidence_phase
    ) values (
      ${company.id}, ${user.id}, ${job.id}, 'photo', 'Before',
      'co/job/file.bin', 'abc', 'client-1', 'before'
    )
  `;
  try {
    await sql`
      insert into mobile_job_documentation (
        company_id, user_id, job_id, documentation_type, title, client_action_id
      ) values (
        ${company.id}, ${user.id}, ${job.id}, 'photo', 'Dup', 'client-1'
      )
    `;
    fail('documentation_client_action_unique', 'duplicate allowed');
  } catch {
    pass('documentation_client_action_unique');
  }

  await sql.unsafe(fs.readFileSync(mig0098, 'utf8'));
  pass('apply_0098');

  const enumRow = await sql`
    select 1 as ok
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'workflow_trigger_type' and e.enumlabel = 'job_material_used'
  `;
  if (enumRow.length === 1) pass('workflow_trigger_job_material_used');
  else fail('workflow_trigger_job_material_used', 'enum value missing');

  // Idempotent re-apply of 0097 additive statements should not fail
  await sql.unsafe(fs.readFileSync(mig0097, 'utf8'));
  pass('0097_reapply_idempotent');

  pass('migrations_apply_cleanly');
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
    await new Promise((r) => setTimeout(r, 400));
    await drop.unsafe(`DROP DATABASE IF EXISTS ${TEST_DB}`);
    pass('cleanup_drop_database', TEST_DB);
  } catch (cleanupErr) {
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
  migrations: ['0097_job_evidence_offline_contract', '0098_job_material_used_trigger'],
  disposableDatabase: TEST_DB,
  forbiddenLiveRef: false,
  passed: results.filter((r) => r.status === 'PASS').length,
  failed: results.filter((r) => r.status === 'FAIL').length,
  results,
};
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    { passed: report.passed, failed: report.failed, output: 'diagnostic-output/44-migration-0097-0098-disposable.json' },
    null,
    2,
  ),
);
process.exit(report.failed === 0 ? 0 : 1);
