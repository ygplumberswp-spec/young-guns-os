#!/usr/bin/env node
/**
 * YG-CUTOVER-001A — Staging test-user inventory + safe-delete classification (read-only).
 *
 * SELECT only. Refuses production DB ref. Never deletes users.
 *
 * Usage:
 *   DATABASE_URL=... node packages/db/scripts/yg-cutover-001a-user-lifecycle-inventory.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { YG_CUTOVER_001A_STAGING_TEST_USER_INVENTORY } from '../../shared/dist/team-user-lifecycle.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../..');
const FORBIDDEN_PROD_REF = 'rshuiaghmtrvvilhqpwm';
const YG_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(resolve(root, 'apps/api/.env.staging.local'));
loadEnvFile(resolve(root, 'apps/api/.env'));

function writeReport(payload) {
  const outDir = resolve(root, 'diagnostic-output');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'yg-cutover-001a-user-lifecycle-inventory.json');
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
  console.log(JSON.stringify(payload, null, 2));
  return outPath;
}

const advisory = YG_CUTOVER_001A_STAGING_TEST_USER_INVENTORY.map((row) => ({ ...row }));

const databaseUrl = process.env.DATABASE_URL || process.env.STAGING_DATABASE_URL || '';
if (!databaseUrl) {
  const blocked = {
    label: 'YG-CUTOVER-001A-user-lifecycle-inventory',
    status: 'blocked_no_credentials',
    companyId: YG_COMPANY_ID,
    auditedAt: null,
    note: 'DATABASE_URL unavailable — advisory classification only. No users deleted.',
    advisoryInventory: advisory,
    liveMatches: [],
    autoDeletePerformed: 0,
    safety: { productionTouched: 0, mutations: 0, usersDeleted: 0 },
  };
  writeReport(blocked);
  console.error('BLOCKED — DATABASE_URL unavailable for live dependency audit.');
  process.exit(2);
}

if (databaseUrl.includes(FORBIDDEN_PROD_REF)) {
  console.error('REFUSED — production database ref forbidden for YG-CUTOVER-001A inventory.');
  process.exit(3);
}

const sql = postgres(databaseUrl, { max: 1, prepare: false });

const NAME_PATTERNS = [
  { key: 'RBAC Accountant-251', re: /accountant[- ]?251|rbac\s*accountant/i },
  { key: 'RBAC Dispatcher-251', re: /dispatcher[- ]?251|rbac\s*dispatcher/i },
  { key: 'Owner Smoke', re: /^owner\s+smoke$/i },
  { key: 'Tech Smoke', re: /^tech\s+smoke$/i },
  { key: 'Owner Test', re: /^owner\s+test$/i },
  { key: 'Tech Test', re: /^tech\s+test$/i },
  { key: 'Client Test', re: /^client\s+test$/i },
  { key: 'canonical Company Owner', roleExact: /^(Company Owner|Platform Owner)$/i },
];

async function dependencyCount(userId) {
  const checks = await Promise.all([
    sql`select count(*)::int as c from jobs where company_id = ${YG_COMPANY_ID} and assigned_user_id = ${userId}`,
    sql`select count(*)::int as c from job_crew_members where company_id = ${YG_COMPANY_ID} and user_id = ${userId}`,
    sql`select count(*)::int as c from job_completion_snapshots where company_id = ${YG_COMPANY_ID} and completed_by_user_id = ${userId}`,
    sql`select count(*)::int as c from mobile_time_entries where company_id = ${YG_COMPANY_ID} and user_id = ${userId}`,
    sql`select count(*)::int as c from wi_timesheets where company_id = ${YG_COMPANY_ID} and user_id = ${userId}`,
    sql`select count(*)::int as c from mobile_job_documentation where company_id = ${YG_COMPANY_ID} and user_id = ${userId}`,
    sql`select count(*)::int as c from documents where company_id = ${YG_COMPANY_ID} and uploaded_by_user_id = ${userId}`,
    sql`select count(*)::int as c from communications where company_id = ${YG_COMPANY_ID} and author_user_id = ${userId}`,
    sql`select count(*)::int as c from payments where company_id = ${YG_COMPANY_ID} and recorded_by_user_id = ${userId}`,
  ]);
  return checks.reduce((sum, rows) => sum + Number(rows[0]?.c ?? 0), 0);
}

async function main() {
  const rows = await sql`
    select u.id, u.email, u.first_name, u.last_name, u.is_active, r.name as role_name
    from users u
    left join roles r on r.id = u.role_id
    where u.company_id = ${YG_COMPANY_ID}
    order by u.created_at asc
  `;

  const liveMatches = [];
  for (const pattern of NAME_PATTERNS) {
    const match = rows.find((row) => {
      const full = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim();
      if (pattern.roleExact) {
        return pattern.roleExact.test(String(row.role_name ?? '')) && Boolean(row.is_active);
      }
      return pattern.re.test(full) || pattern.re.test(String(row.email ?? ''));
    });

    if (!match) {
      liveMatches.push({
        displayName: pattern.key,
        status: 'not_found_in_staging',
        classification: 'UNKNOWN',
        autoDeleteAllowed: false,
        ownerApprovalRequired: true,
        note: 'Not found in live staging roster for this company — UI label may be stale.',
      });
      continue;
    }

    const fullName = `${match.first_name ?? ''} ${match.last_name ?? ''}`.trim();
    if (pattern.key === 'canonical Company Owner') {
      liveMatches.push({
        displayName: pattern.key,
        matchedName: fullName,
        userIdPrefix: String(match.id).slice(0, 8),
        emailMasked: String(match.email ?? '').replace(/(.{2}).+(@.+)/, '$1***$2'),
        roleName: match.role_name,
        isActive: match.is_active,
        classification: 'REQUIRED_FOR_TEST_HARNESS',
        dependencyHits: null,
        autoDeleteAllowed: false,
        ownerApprovalRequired: false,
        note: 'Canonical/active Company Owner — never hard-delete.',
      });
      continue;
    }

    const dependencyHits = await dependencyCount(match.id);
    const classification =
      dependencyHits > 0 ? 'MUST_DEACTIVATE' : 'SAFE_TO_DELETE';

    liveMatches.push({
      displayName: pattern.key,
      matchedName: fullName,
      userIdPrefix: String(match.id).slice(0, 8),
      emailMasked: String(match.email ?? '').replace(/(.{2}).+(@.+)/, '$1***$2'),
      roleName: match.role_name,
      isActive: match.is_active,
      classification,
      dependencyHits,
      autoDeleteAllowed: false,
      ownerApprovalRequired: true,
      note:
        classification === 'SAFE_TO_DELETE'
          ? 'No counted business-history dependencies — Owner may permanently delete after explicit confirmation.'
          : 'Business history present — hard delete must be refused; deactivate/remove access instead.',
    });
  }

  const report = {
    label: 'YG-CUTOVER-001A-user-lifecycle-inventory',
    status: 'verified',
    companyId: YG_COMPANY_ID,
    auditedAt: new Date().toISOString(),
    note: 'Read-only inventory. No users deleted. Production cleanliness: 0 dummy/smoke/RBAC test accounts required.',
    advisoryInventory: advisory,
    liveMatches,
    autoDeletePerformed: 0,
    safety: { productionTouched: 0, mutations: 0, usersDeleted: 0 },
  };
  writeReport(report);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
