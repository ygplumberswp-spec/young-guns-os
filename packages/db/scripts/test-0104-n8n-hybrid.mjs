/**
 * Disposable-DB verification for 0104_n8n_hybrid_orchestration.sql
 *
 * Usage:
 *   node --env-file=apps/api/.env.staging.local packages/db/scripts/test-0104-n8n-hybrid.mjs
 */
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mig0104 = path.join(__dirname, '../drizzle/0104_n8n_hybrid_orchestration.sql');
const outPath = path.resolve(
  __dirname,
  '../../../diagnostic-output/109-migration-0104-n8n-hybrid-disposable.json',
);
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  console.error('DATABASE_URL required');
  process.exit(1);
}
if (baseUrl.toLowerCase().includes(FORBIDDEN)) {
  console.error('Refusing forbidden live project ref');
  process.exit(3);
}

const TEST_DB = `titan_ux_j_mig_${Date.now().toString(36)}`;
const url = new URL(baseUrl);
const liveDbName = url.pathname.replace(/^\//, '').split('?')[0];
if (liveDbName.startsWith('titan_ux_')) {
  console.error('Refusing: DATABASE_URL already points at disposable test DB');
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
CREATE TABLE workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

const report = {
  migration: '0104_n8n_hybrid_orchestration',
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
  const migrationSql = fs.readFileSync(mig0104, 'utf8');
  await sql.unsafe(migrationSql);
  pass('0104_applied');

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'n8n_connections','n8n_workflow_registrations','n8n_executions',
        'n8n_callback_receipts','n8n_audit_events'
      )
    ORDER BY table_name
  `;
  if (tables.length === 5) pass('0104_tables_present', tables.map((t) => t.table_name).join(','));
  else fail('0104_tables_present', String(tables.length));

  await sql.unsafe(migrationSql);
  pass('0104_reapply_idempotent');

  const [company] = await sql`INSERT INTO companies (name, slug) VALUES ('T','t') RETURNING id`;
  const [user] =
    await sql`INSERT INTO users (company_id, email) VALUES (${company.id}, 'a@b.c') RETURNING id`;
  await sql`
    INSERT INTO n8n_connections (company_id, status)
    VALUES (${company.id}, 'not_configured')
  `;
  const [wf] = await sql`
    INSERT INTO n8n_workflow_registrations (
      company_id, external_workflow_key, name, trigger_event, created_by_user_id
    ) VALUES (${company.id}, 'wf-1', 'Test', 'job.completed', ${user.id})
    RETURNING id
  `;
  await sql`
    INSERT INTO n8n_executions (
      company_id, workflow_registration_id, correlation_id, idempotency_key, trigger_event
    ) VALUES (${company.id}, ${wf.id}, 'c1', 'i1', 'job.completed')
  `;
  pass('0104_insert_roundtrip');

  report.ok = report.checks.every((c) => c.ok);
} catch (error) {
  fail('fatal', error instanceof Error ? error.message : String(error));
  report.ok = false;
} finally {
  try {
    await sql?.end({ timeout: 5 });
  } catch {
    /* ignore */
  }
  sql = undefined;
  try {
    await admin?.unsafe(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEST_DB}' AND pid <> pg_backend_pid()`,
    );
    await new Promise((r) => setTimeout(r, 500));
    try {
      await admin?.unsafe(`DROP DATABASE "${TEST_DB}" WITH (FORCE)`);
    } catch {
      await admin?.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB}"`);
    }
    pass('disposable_db_dropped');
  } catch (error) {
    fail('disposable_db_dropped', error instanceof Error ? error.message : String(error));
  }
  try {
    await admin?.end({ timeout: 1 });
  } catch {
    /* ignore */
  }
  report.ok = report.checks.every((c) => c.ok);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, outPath, disposableDb: TEST_DB }, null, 2));
  process.exit(report.ok ? 0 : 1);
}
