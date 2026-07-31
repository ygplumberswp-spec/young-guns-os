/**
 * Disposable-DB verification for 0094_canonical_role_matrix.sql
 * - Never targets the live DATABASE_URL database name directly for writes
 *   of business data: creates titan_batch1a_mig_test, applies minimal schema + 0094, drops.
 *
 * Usage (from repo root or packages/db):
 *   node --env-file=../../apps/api/.env packages/db/scripts/test-0094-role-migration.mjs
 */
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.join(__dirname, '../drizzle/0094_canonical_role_matrix.sql');
const downPath = path.join(__dirname, '../drizzle/0094_canonical_role_matrix.down.sql');

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  console.error('DATABASE_URL required (used only as admin connection to create disposable DB)');
  process.exit(1);
}

const TEST_DB = 'titan_batch1a_mig_test';
const url = new URL(baseUrl);
const liveDbName = url.pathname.replace(/^\//, '').split('?')[0];
if (liveDbName === TEST_DB) {
  console.error('Refusing to run: DATABASE_URL already points at the disposable test DB name');
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

DO $$ BEGIN
  CREATE TYPE saas_tenant_kind AS ENUM ('platform_owner', 'customer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE security_audit_category AS ENUM (
    'authentication','authorization','financial','workflow','ai','crm','inventory','fleet',
    'dispatch','quality','communications','personal_workspace','reports','integrations','api',
    'settings','security'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX roles_company_name_idx ON roles(company_id, name);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL DEFAULT 'x',
  first_name text NOT NULL,
  last_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE saas_tenant_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  tenant_kind saas_tenant_kind NOT NULL DEFAULT 'customer'
);

CREATE TABLE security_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category security_audit_category NOT NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  session_id uuid,
  ip_address text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
`;

async function seedHappyPath(sql) {
  const [platformCo] = await sql`
    INSERT INTO companies (name, slug) VALUES ('Platform Co', 'platform-co') RETURNING id
  `;
  const [customerCo] = await sql`
    INSERT INTO companies (name, slug) VALUES ('Customer Co', 'customer-co') RETURNING id
  `;

  await sql`
    INSERT INTO saas_tenant_profiles (company_id, tenant_kind)
    VALUES (${platformCo.id}, 'platform_owner'), (${customerCo.id}, 'customer')
  `;

  for (const companyId of [platformCo.id, customerCo.id]) {
    await sql`
      INSERT INTO roles (company_id, name, permissions, is_system) VALUES
        (${companyId}, 'Owner', ${sql.json(['*'])}, true),
        (${companyId}, 'Admin', ${sql.json(['users:manage'])}, true),
        (${companyId}, 'Member', ${sql.json(['finance:read', 'customers:read'])}, true),
        (${companyId}, 'Technician', ${sql.json(['mobile:read'])}, true),
        (${companyId}, 'Dispatcher', ${sql.json(['dispatch:read'])}, true)
    `;
  }

  const platformOwnerRole = await sql`
    SELECT id FROM roles WHERE company_id = ${platformCo.id} AND name = 'Owner'
  `;
  const customerOwnerRole = await sql`
    SELECT id FROM roles WHERE company_id = ${customerCo.id} AND name = 'Owner'
  `;
  const customerAdminRole = await sql`
    SELECT id FROM roles WHERE company_id = ${customerCo.id} AND name = 'Admin'
  `;
  const customerMemberRole = await sql`
    SELECT id FROM roles WHERE company_id = ${customerCo.id} AND name = 'Member'
  `;

  await sql`
    INSERT INTO users (company_id, role_id, email, first_name, last_name) VALUES
      (${platformCo.id}, ${platformOwnerRole[0].id}, 'po@example.test', 'Plat', 'Owner'),
      (${customerCo.id}, ${customerOwnerRole[0].id}, 'co@example.test', 'Comp', 'Owner'),
      (${customerCo.id}, ${customerAdminRole[0].id}, 'admin@example.test', 'Ad', 'Min'),
      (${customerCo.id}, ${customerMemberRole[0].id}, 'member@example.test', 'Mem', 'Ber')
  `;

  return { platformCo, customerCo };
}

async function seedAmbiguous(sql) {
  const [platformCo] = await sql`
    INSERT INTO companies (name, slug) VALUES ('Platform Ambiguous', 'platform-amb') RETURNING id
  `;
  await sql`
    INSERT INTO saas_tenant_profiles (company_id, tenant_kind)
    VALUES (${platformCo.id}, 'platform_owner')
  `;
  await sql`
    INSERT INTO roles (company_id, name, permissions, is_system) VALUES
      (${platformCo.id}, 'Owner', ${sql.json(['*'])}, true)
  `;
  const ownerRole = await sql`SELECT id FROM roles WHERE company_id = ${platformCo.id}`;
  const [u1] = await sql`
    INSERT INTO users (company_id, role_id, email, first_name, last_name)
    VALUES (${platformCo.id}, ${ownerRole[0].id}, 'a1@example.test', 'A', 'One')
    RETURNING id
  `;
  const [u2] = await sql`
    INSERT INTO users (company_id, role_id, email, first_name, last_name)
    VALUES (${platformCo.id}, ${ownerRole[0].id}, 'a2@example.test', 'A', 'Two')
    RETURNING id
  `;
  return { platformCo, u1, u2 };
}

async function roleCounts(sql) {
  return sql`
    SELECT r.name, COUNT(u.id)::int AS users
    FROM roles r
    LEFT JOIN users u ON u.role_id = r.id
    GROUP BY r.name
    ORDER BY r.name
  `;
}

async function resetTestDb(admin) {
  // FORCE closes leftover sessions (postgres.js pool / prior failed runs).
  await admin.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB}" WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE "${TEST_DB}"`);
}

async function main() {
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  const downSql = fs.readFileSync(downPath, 'utf8');
  const admin = adminSql();
  const results = { cases: [] };
  let sql;

  try {
    await resetTestDb(admin);

    // --- Happy path ---
    sql = testSql();
    await sql.unsafe(minimalSchema);
    await seedHappyPath(sql);
    const before = await roleCounts(sql);
    await sql.unsafe(migrationSql);
    const after = await roleCounts(sql);
    await sql.unsafe(migrationSql);
    const afterAgain = await roleCounts(sql);

    const platformOwners = await sql`
      SELECT u.id, r.name
      FROM users u JOIN roles r ON r.id = u.role_id
      JOIN saas_tenant_profiles p ON p.company_id = u.company_id
      WHERE p.tenant_kind = 'platform_owner'
    `;
    const customerOwners = await sql`
      SELECT u.email, r.name FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.email = 'co@example.test'
    `;
    const managers = await sql`
      SELECT u.email, r.name FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.email = 'admin@example.test'
    `;
    const members = await sql`
      SELECT u.email, r.name, r.permissions FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.email = 'member@example.test'
    `;
    const audits = await sql`
      SELECT action, metadata->>'toRoleName' AS to_role
      FROM security_audit_logs
      WHERE metadata->>'migration' = '0094_canonical_role_matrix'
    `;

    results.cases.push({
      name: 'happy_path',
      pass:
        platformOwners.length === 1 &&
        platformOwners[0].name === 'Platform Owner' &&
        customerOwners[0]?.name === 'Company Owner' &&
        managers[0]?.name === 'Manager' &&
        members[0]?.name === 'Member' &&
        !JSON.stringify(members[0].permissions).includes('finance:read') &&
        audits.length >= 3,
      before,
      after,
      afterIdempotent: afterAgain,
      platformOwners: platformOwners.map((r) => ({ id: r.id, role: r.name })),
      audits: audits.length,
    });
    await sql.end({ timeout: 5 });
    sql = undefined;

    // --- Ambiguous stop ---
    await resetTestDb(admin);
    sql = testSql();
    await sql.unsafe(minimalSchema);
    const amb = await seedAmbiguous(sql);
    let ambiguousStopped = false;
    let ambiguousMessage = '';
    try {
      await sql.unsafe(migrationSql);
    } catch (error) {
      ambiguousStopped = String(error.message || error).includes('BATCH1A_PLATFORM_OWNER_AMBIGUOUS');
      ambiguousMessage = String(error.message || error);
    }
    const stillOwners = await sql`
      SELECT u.id, r.name FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'Owner'
    `;
    results.cases.push({
      name: 'ambiguous_platform_owner_stop',
      pass: ambiguousStopped && stillOwners.length === 2,
      candidateIds: [amb.u1.id, amb.u2.id],
      message: ambiguousMessage.slice(0, 400),
      remainingOwners: stillOwners.length,
    });
    await sql.end({ timeout: 5 });
    sql = undefined;

    // --- Down safety (best-effort restore) ---
    await resetTestDb(admin);
    sql = testSql();
    await sql.unsafe(minimalSchema);
    await seedHappyPath(sql);
    await sql.unsafe(migrationSql);
    await sql.unsafe(downSql);
    const afterDown = await sql`
      SELECT u.email, r.name FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.email
    `;
    results.cases.push({
      name: 'manual_down_best_effort',
      pass: afterDown.some((r) => r.email === 'co@example.test' && r.name === 'Owner'),
      afterDown,
    });
    await sql.end({ timeout: 5 });
    sql = undefined;
  } finally {
    if (sql) {
      try {
        await sql.end({ timeout: 5 });
      } catch {
        /* ignore */
      }
    }
    try {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB}" WITH (FORCE)`);
    } catch {
      /* ignore */
    }
    await admin.end({ timeout: 5 });
  }

  const failed = results.cases.filter((c) => !c.pass);
  const summary = {
    liveDbName,
    testDb: TEST_DB,
    passed: results.cases.length - failed.length,
    failed: failed.length,
    cases: results.cases,
    stagingSafe:
      failed.length === 0
        ? 'YES — with pre-check that platform_owner tenant has ≤1 Owner user'
        : 'NO — fix failing cases first',
  };

  const out = path.join(__dirname, '../../../diagnostic-output/23-migration-0094-test.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
