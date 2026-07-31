/**
 * Disposable-DB verification for 0095_job_operational_contract.sql
 * - Creates titan_ux_a_mig_test, applies minimal schema + 0095, verifies counters/uniqueness.
 * - Never mutates the live DATABASE_URL database name.
 *
 * Usage:
 *   node --env-file=../../apps/api/.env packages/db/scripts/test-0095-job-operational-contract.mjs
 */
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.join(__dirname, '../drizzle/0095_job_operational_contract.sql');

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  console.error('DATABASE_URL required (admin connection to create disposable DB)');
  process.exit(1);
}

const TEST_DB = 'titan_ux_a_mig_test';
const url = new URL(baseUrl);
const liveDbName = url.pathname.replace(/^\//, '').split('?')[0];
if (liveDbName === TEST_DB) {
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

const minimalSchema = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
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

CREATE TABLE portal_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cx_customer_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  portal_user_id uuid REFERENCES portal_users(id) ON DELETE SET NULL,
  property_name text NOT NULL,
  address_line1 text,
  address_line2 text,
  city text,
  postal_code text,
  is_primary boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TYPE job_status AS ENUM ('new','scheduled','in_progress','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text,
  status job_status NOT NULL DEFAULT 'new',
  scheduled_at timestamptz,
  scheduled_end_at timestamptz,
  assigned_user_id uuid,
  parent_job_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

const results = [];

function pass(name, detail) {
  results.push({ name, status: 'PASS', detail });
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail) {
  results.push({ name, status: 'FAIL', detail });
  console.error(`FAIL ${name} — ${detail}`);
}

async function main() {
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  const admin = adminSql();

  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE ${TEST_DB}`);
  } finally {
    await admin.end({ timeout: 5 });
  }

  const sql = testSql();
  try {
    await sql.unsafe(minimalSchema);
    await sql.unsafe(migrationSql);

    const [companyA] = await sql`
      INSERT INTO companies (name, slug) VALUES ('Young Guns A', 'yg-a') RETURNING id
    `;
    const [companyB] = await sql`
      INSERT INTO companies (name, slug) VALUES ('Young Guns B', 'yg-b') RETURNING id
    `;
    const [customerA] = await sql`
      INSERT INTO customers (company_id, name) VALUES (${companyA.id}, 'Customer A') RETURNING id
    `;
    const [customerB] = await sql`
      INSERT INTO customers (company_id, name) VALUES (${companyB.id}, 'Customer B') RETURNING id
    `;

    async function nextJobNumber(companyId) {
      await sql`
        INSERT INTO job_number_counters (company_id, last_value)
        VALUES (${companyId}, 0)
        ON CONFLICT (company_id) DO NOTHING
      `;
      const rows = await sql`
        UPDATE job_number_counters
        SET last_value = last_value + 1, updated_at = now()
        WHERE company_id = ${companyId}
        RETURNING last_value
      `;
      const value = rows[0]?.last_value;
      if (value == null) {
        throw new Error(`Counter allocation failed for ${companyId}`);
      }
      return `JOB-${String(value).padStart(6, '0')}`;
    }

    const number1 = await nextJobNumber(companyA.id);
    const number2 = await nextJobNumber(companyA.id);
    const numberB1 = await nextJobNumber(companyB.id);

    if (number1 === 'JOB-000001' && number2 === 'JOB-000002') {
      pass('tenant_unique_sequence', `${number1}, ${number2}`);
    } else {
      fail('tenant_unique_sequence', `${number1}, ${number2}`);
    }

    if (numberB1 === 'JOB-000001') {
      pass('tenant_isolation_counters', `company B also starts at ${numberB1}`);
    } else {
      fail('tenant_isolation_counters', numberB1);
    }

    await sql`
      INSERT INTO jobs (
        company_id, customer_id, title, job_number, job_type, priority,
        snapshot_street, snapshot_suburb, snapshot_city, snapshot_province, snapshot_postal_code,
        snapshot_site_contact_name, snapshot_site_contact_mobile, snapshot_customer_name
      ) VALUES (
        ${companyA.id}, ${customerA.id}, 'Blocked drain — Rondebosch — A', ${number1}, 'Blocked drain', 'urgent',
        '12 Main Rd', 'Rondebosch', 'Cape Town', 'Western Cape', '7700',
        'Site Agent', '+27821234567', 'Customer A'
      )
    `;
    await sql`
      INSERT INTO jobs (
        company_id, customer_id, title, job_number, job_type, priority,
        snapshot_street, snapshot_suburb, snapshot_city, snapshot_province, snapshot_postal_code,
        snapshot_site_contact_name, snapshot_site_contact_mobile, snapshot_customer_name
      ) VALUES (
        ${companyA.id}, ${customerA.id}, 'Leak — Claremont — A', ${number2}, 'Leak detection', 'normal',
        '5 Oak Ave', 'Claremont', 'Cape Town', 'Western Cape', '7708',
        'Customer A', '+27829876543', 'Customer A'
      )
    `;

    let uniqueOk = true;
    try {
      await sql`
        INSERT INTO jobs (company_id, customer_id, title, job_number)
        VALUES (${companyA.id}, ${customerA.id}, 'dup', ${number1})
      `;
      uniqueOk = false;
    } catch {
      uniqueOk = true;
    }
    if (uniqueOk) pass('unique_index_enforced', 'duplicate job_number rejected');
    else fail('unique_index_enforced', 'duplicate accepted');

    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'jobs' AND column_name LIKE 'snapshot_%'
      ORDER BY column_name
    `;
    if (cols.length >= 8) pass('snapshot_columns', `${cols.length} snapshot columns`);
    else fail('snapshot_columns', JSON.stringify(cols));

    const propCols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'cx_customer_properties'
        AND column_name IN ('suburb','province','unit_number')
    `;
    if (propCols.length === 3) pass('property_address_columns', 'suburb/province/unit_number');
    else fail('property_address_columns', JSON.stringify(propCols));

    // Cross-tenant: same job number allowed in different companies
    await sql`
      INSERT INTO jobs (company_id, customer_id, title, job_number)
      VALUES (${companyB.id}, ${customerB.id}, 'Other tenant', ${numberB1})
    `;
    pass('cross_tenant_same_number_allowed', numberB1);
  } finally {
    await sql.end({ timeout: 5 });
    const cleanup = adminSql();
    try {
      await cleanup.unsafe(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
    } finally {
      await cleanup.end({ timeout: 5 });
    }
  }

  const failed = results.filter((item) => item.status === 'FAIL').length;
  const outPath = path.resolve(__dirname, '../../../diagnostic-output/24-migration-0095-test.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        migration: '0095_job_operational_contract',
        passed: results.length - failed,
        failed,
        results,
      },
      null,
      2,
    ),
  );

  console.log(`\n${results.length - failed}/${results.length} PASS → ${outPath}`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
