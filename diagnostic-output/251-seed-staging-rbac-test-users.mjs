#!/usr/bin/env node
/**
 * 251 — Seed staging-only RBAC test accounts on YGP (Accountant, Dispatcher, Client portal).
 * Idempotent: reuses existing test users by email prefix.
 * Run: railway run --service young-guns-os node diagnostic-output/251-seed-staging-rbac-test-users.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_JSON = path.resolve(__dirname, '251-seed-staging-rbac-test-users.json');

const YGP_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const TEST_PASSWORD = 'Staging251-Rbac-Verify!';

/** Staging-only test account emails — clearly marked for RBAC verify 251. */
export const STAGING_RBAC_TEST_ACCOUNTS = {
  accountant: {
    email: '251-rbac-test-accountant@staging-verify.test',
    roleName: 'Accountant',
    firstName: 'RBAC',
    lastName: 'Accountant-251',
  },
  dispatcher: {
    email: '251-rbac-test-dispatcher@staging-verify.test',
    roleName: 'Dispatcher',
    firstName: 'RBAC',
    lastName: 'Dispatcher-251',
  },
  client: {
    email: '251-rbac-test-client@staging-verify.test',
    roleName: 'Client',
    firstName: 'RBAC',
    lastName: 'Client-251',
    customerName: '251 RBAC Test Customer (staging)',
  },
};

async function runSeedOnStaging() {
  const scriptPath = path.join(repoRoot, '.tmp-seed-rbac-251.mjs');
  const accountsLiteral = JSON.stringify(STAGING_RBAC_TEST_ACCOUNTS);
  const portalPermissions = [
    'portal.dashboard:read',
    'portal.appointments:read',
    'portal.jobs:read',
    'portal.quotes:read',
    'portal.invoices:read',
    'portal.payments:read',
    'portal.communications:read',
    'portal.documents:read',
  ];

  fs.writeFileSync(
    scriptPath,
    `import { hashPassword } from './packages/auth/dist/password.js';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });

const companyId = '${YGP_COMPANY_ID}';
const testPassword = ${JSON.stringify(TEST_PASSWORD)};
const accounts = ${accountsLiteral};
const portalPerms = ${JSON.stringify(portalPermissions)};
const passwordHash = await hashPassword(testPassword);
const result = { companyId, accounts: {}, created: [], reused: [] };

async function ensureStaffUser(key, spec) {
  const [role] = await sql\`
    SELECT id, name, permissions FROM roles
    WHERE company_id = \${companyId} AND name = \${spec.roleName} LIMIT 1\`;
  if (!role) {
    result.accounts[key] = { error: 'role_not_found', roleName: spec.roleName };
    return;
  }

  const [existing] = await sql\`
    SELECT u.id, u.email, u.role_id, r.name as role_name
    FROM users u JOIN roles r ON r.id = u.role_id
    WHERE u.company_id = \${companyId} AND u.email = \${spec.email} LIMIT 1\`;

  if (existing) {
    result.accounts[key] = {
      userId: existing.id,
      email: existing.email,
      roleName: existing.role_name,
      status: 'reused',
    };
    result.reused.push(key);
    return;
  }

  const [created] = await sql\`
    INSERT INTO users (company_id, role_id, email, password_hash, first_name, last_name, is_active)
    VALUES (\${companyId}, \${role.id}, \${spec.email}, \${passwordHash}, \${spec.firstName}, \${spec.lastName}, true)
    RETURNING id, email\`;

  result.accounts[key] = {
    userId: created.id,
    email: created.email,
    roleName: role.name,
    status: 'created',
  };
  result.created.push(key);
}

async function ensurePortalClient(key, spec) {
  const [existingPortal] = await sql\`
    SELECT id, email, customer_id FROM portal_users
    WHERE company_id = \${companyId} AND email = \${spec.email} LIMIT 1\`;

  if (existingPortal) {
    result.accounts[key] = {
      portalUserId: existingPortal.id,
      email: existingPortal.email,
      customerId: existingPortal.customer_id,
      roleName: 'Client',
      status: 'reused',
    };
    result.reused.push(key);
    return;
  }

  let customerId = null;
  const [linkedCustomer] = await sql\`
    SELECT id FROM customers
    WHERE company_id = \${companyId} AND email = \${spec.email} LIMIT 1\`;
  if (linkedCustomer) {
    customerId = linkedCustomer.id;
  } else {
    const [createdCustomer] = await sql\`
      INSERT INTO customers (company_id, name, email, contact_person, status)
      VALUES (\${companyId}, \${spec.customerName}, \${spec.email}, \${spec.firstName + ' ' + spec.lastName}, 'active')
      RETURNING id\`;
    customerId = createdCustomer.id;
  }

  const [createdPortal] = await sql\`
    INSERT INTO portal_users (company_id, customer_id, email, password_hash, first_name, last_name, is_active)
    VALUES (\${companyId}, \${customerId}, \${spec.email}, \${passwordHash}, \${spec.firstName}, \${spec.lastName}, true)
    RETURNING id, email, customer_id\`;

  for (const permission of portalPerms) {
    await sql\`
      INSERT INTO portal_user_permissions (company_id, portal_user_id, permission)
      VALUES (\${companyId}, \${createdPortal.id}, \${permission})
      ON CONFLICT DO NOTHING\`;
  }

  result.accounts[key] = {
    portalUserId: createdPortal.id,
    email: createdPortal.email,
    customerId: createdPortal.customer_id,
    roleName: 'Client',
    status: 'created',
  };
  result.created.push(key);
}

await ensureStaffUser('accountant', accounts.accountant);
await ensureStaffUser('dispatcher', accounts.dispatcher);
await ensurePortalClient('client', accounts.client);

const roleCounts = await sql\`
  SELECT r.name, COUNT(u.id)::int as user_count
  FROM roles r LEFT JOIN users u ON u.role_id = r.id AND u.company_id = r.company_id AND u.is_active = true
  WHERE r.company_id = \${companyId}
  GROUP BY r.name ORDER BY r.name\`;
const [portalCount] = await sql\`
  SELECT COUNT(*)::int as count FROM portal_users WHERE company_id = \${companyId} AND is_active = true\`;

result.roleCounts = roleCounts;
result.portalUserCount = portalCount?.count ?? 0;
result.testPasswordNote = 'staging-only — redacted in reports';

process.stdout.write(JSON.stringify(result));
await sql.end();
`,
  );

  try {
    execSync('pnpm --filter @titan/auth build', { cwd: repoRoot, stdio: 'pipe' });
    const raw = execSync(`railway run --service young-guns-os node ${scriptPath}`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return JSON.parse(raw);
  } finally {
    fs.rmSync(scriptPath, { force: true });
  }
}

async function main() {
  let commitSha = 'unknown';
  try {
    commitSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    /* ignore */
  }

  const seedResult = await runSeedOnStaging();
  const report = {
    schemaVersion: '251-seed-staging-rbac-v1',
    generatedAt: new Date().toISOString(),
    commitSha,
    ygpCompanyId: YGP_COMPANY_ID,
    stagingOnly: true,
    testAccountEmails: {
      accountant: STAGING_RBAC_TEST_ACCOUNTS.accountant.email,
      dispatcher: STAGING_RBAC_TEST_ACCOUNTS.dispatcher.email,
      client: STAGING_RBAC_TEST_ACCOUNTS.client.email,
    },
    passwordNote: 'Staging-only test password set — redacted from committed JSON',
    ...seedResult,
  };
  delete report.testPasswordNote;

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, created: report.created, reused: report.reused, out: OUT_JSON }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
