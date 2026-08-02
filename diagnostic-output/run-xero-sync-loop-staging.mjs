#!/usr/bin/env node
/**
 * Run read-only Xero invoice sync loop until mappings synced or max attempts.
 * No Xero writes — pull-only path for existing xero_invoice_id mappings.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://young-guns-os-staging.up.railway.app';
const YGP = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const MAX_ATTEMPTS = 5;

async function mintOwnerSession() {
  execSync('pnpm --filter @titan/auth build', { cwd: repoRoot, stdio: 'pipe' });
  const scriptPath = path.join(repoRoot, '.tmp-mint-sync-owner.mjs');
  fs.writeFileSync(
    scriptPath,
    `import { createAccessToken, generateRefreshToken, hashRefreshToken } from './packages/auth/dist/tokens.js';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const companyId = '${YGP}';
const [user] = await sql\`
  SELECT u.id, u.role_id, r.name as role_name, r.permissions
  FROM users u JOIN roles r ON r.id = u.role_id
  WHERE u.company_id = \${companyId} AND u.is_active = true
  ORDER BY u.created_at ASC LIMIT 1\`;
const sessionId = crypto.randomUUID();
const refreshToken = generateRefreshToken();
const refreshHash = hashRefreshToken(refreshToken);
await sql\`
  INSERT INTO sessions (id, user_id, company_id, refresh_token_hash, expires_at, last_activity_at, user_agent, ip_address)
  VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, NOW() + interval '7 days', NOW(), 'sync-loop', '127.0.0.1')\`;
const { token } = createAccessToken(
  { sub: user.id, companyId, roleId: user.role_id, roleName: user.role_name, sessionId, permissions: user.permissions },
  process.env.JWT_SECRET,
);
process.stdout.write(JSON.stringify({ accessToken: token }));
await sql.end();
`,
  );
  try {
    const raw = execSync(`railway run -s young-guns-os node ${scriptPath}`, {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
    return JSON.parse(raw).accessToken;
  } finally {
    fs.unlinkSync(scriptPath);
  }
}

async function probeMappings() {
  const scriptPath = path.join(repoRoot, '.tmp-probe-sync-status.mjs');
  fs.writeFileSync(
    scriptPath,
    `import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const rows = await sql\`
  SELECT sync_status, count(*)::int n FROM xero_invoice_mappings
  WHERE company_id = '${YGP}'::uuid GROUP BY sync_status\`;
process.stdout.write(JSON.stringify(rows));
await sql.end();
`,
  );
  try {
    const raw = execSync(`railway run -s young-guns-os node ${scriptPath}`, {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
    return JSON.parse(raw);
  } finally {
    fs.unlinkSync(scriptPath);
  }
}

async function apiPost(pathname, token) {
  const res = await fetch(`${API}${pathname}`, {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

const token = await mintOwnerSession();
const attempts = [];

for (let i = 1; i <= MAX_ATTEMPTS; i++) {
  const before = await probeMappings();
  const syncedBefore = before.find((r) => r.sync_status === 'synced')?.n ?? 0;

  const invoicesSync = await apiPost('/api/v1/integrations/xero/sync/invoices', token);
  const after = await probeMappings();
  const syncedAfter = after.find((r) => r.sync_status === 'synced')?.n ?? 0;
  const failedAfter = after.find((r) => r.sync_status === 'failed')?.n ?? 0;

  attempts.push({
    attempt: i,
    syncedBefore,
    syncedAfter,
    failedAfter,
    invoicesSync: {
      status: invoicesSync.status,
      result: invoicesSync.json?.data?.result ?? null,
      error: invoicesSync.json?.error ?? null,
    },
  });

  if (syncedAfter > 0) break;
  if (invoicesSync.status !== 200) break;
}

const paymentsSync = await apiPost('/api/v1/integrations/xero/sync/payments', token);

console.log(
  JSON.stringify(
    {
      attempts,
      paymentsSync: {
        status: paymentsSync.status,
        result: paymentsSync.json?.data?.result ?? null,
        error: paymentsSync.json?.error ?? null,
      },
      finalMappings: await probeMappings(),
    },
    null,
    2,
  ),
);
