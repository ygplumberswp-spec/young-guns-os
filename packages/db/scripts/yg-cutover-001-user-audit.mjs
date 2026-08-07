#!/usr/bin/env node
/**
 * YG-CUTOVER-001 — Read-only Young Guns user/role audit (staging).
 *
 * SELECT only. Refuses production DB ref. Does not invite users or invent people.
 *
 * Usage:
 *   DATABASE_URL=... node packages/db/scripts/yg-cutover-001-user-audit.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  buildYgCutoverDecisionCard,
  classifyYgCutoverRoleFamily,
  evaluateYgCutoverUserSlots,
  maskYgCutoverEmail,
} from '../../shared/dist/yg-cutover-001.js';

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

const databaseUrl = process.env.DATABASE_URL || process.env.STAGING_DATABASE_URL || '';
if (!databaseUrl) {
  const blocked = {
    label: 'YG-CUTOVER-001-user-audit',
    status: 'blocked_no_credentials',
    companyId: YG_COMPANY_ID,
    auditedAt: null,
    users: [],
    roleCounts: {},
    missingSlots: ['admin-office', 'technician'],
    p0Closed: false,
    note: 'DATABASE_URL / STAGING_DATABASE_URL unavailable — Owner must supply roster + staging DB for live audit/invites.',
    decision: buildYgCutoverDecisionCard({
      userAudit: {
        status: 'blocked_no_credentials',
        companyId: YG_COMPANY_ID,
        auditedAt: null,
        users: [],
        roleCounts: {},
        missingSlots: ['admin-office', 'technician'],
        p0Closed: false,
        note: 'No DATABASE_URL',
      },
    }),
    safety: { productionTouched: 0, mutations: 0, invitesCreated: 0 },
  };
  const outDir = resolve(root, 'diagnostic-output');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'yg-cutover-001-user-audit.json');
  writeFileSync(outPath, JSON.stringify(blocked, null, 2) + '\n');
  console.log(JSON.stringify(blocked, null, 2));
  console.error('BLOCKED — DATABASE_URL unavailable for live user audit.');
  process.exit(2);
}

if (databaseUrl.includes(FORBIDDEN_PROD_REF)) {
  console.error('REFUSED — production database ref forbidden for YG-CUTOVER-001 audit.');
  process.exit(3);
}

const sql = postgres(databaseUrl, { max: 1, prepare: false });

async function main() {
  const company = await sql`
    select id, name from companies where id = ${YG_COMPANY_ID} limit 1
  `;
  if (!company[0]) {
    console.error('FAIL — canonical Young Guns company missing; refusing to invent tenant/users.');
    process.exit(4);
  }

  const rows = await sql`
    select
      u.id,
      u.email,
      u.first_name,
      u.last_name,
      u.is_active,
      r.name as role_name
    from users u
    left join roles r on r.id = u.role_id
    where u.company_id = ${YG_COMPANY_ID}
    order by r.name nulls last, u.email
  `;

  let pendingInvites = [];
  try {
    pendingInvites = await sql`
      select id, email, role_id, accepted_at, expires_at
      from user_invites
      where company_id = ${YG_COMPANY_ID}
        and accepted_at is null
        and expires_at > now()
    `;
  } catch {
    pendingInvites = [];
  }

  const users = rows.map((u) => ({
    idPrefix: String(u.id).slice(0, 8),
    emailMasked: maskYgCutoverEmail(u.email),
    roleName: u.role_name || 'Unknown',
    roleFamily: classifyYgCutoverRoleFamily(u.role_name),
    isActive: Boolean(u.is_active),
    mfaConfigured: null,
    invitePending: false,
  }));

  const roleCounts = {};
  for (const user of users) {
    roleCounts[user.roleName] = (roleCounts[user.roleName] || 0) + 1;
  }

  const slotEval = evaluateYgCutoverUserSlots(users);
  const userAudit = {
    status: 'verified',
    companyId: YG_COMPANY_ID,
    auditedAt: new Date().toISOString(),
    users,
    roleCounts,
    missingSlots: slotEval.missingSlots,
    p0Closed: slotEval.p0Closed,
    note: `Live staging audit for ${company[0].name}; pending invites=${pendingInvites.length}`,
  };

  const report = {
    label: 'YG-CUTOVER-001-user-audit',
    ...userAudit,
    pendingInvitesMasked: pendingInvites.map((i) => ({
      idPrefix: String(i.id).slice(0, 8),
      emailMasked: maskYgCutoverEmail(i.email),
      expiresAt: i.expires_at,
    })),
    decision: buildYgCutoverDecisionCard({ userAudit }),
    safety: { productionTouched: 0, mutations: 0, invitesCreated: 0 },
  };

  const outDir = resolve(root, 'diagnostic-output');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'yg-cutover-001-user-audit.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
