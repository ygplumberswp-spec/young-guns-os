#!/usr/bin/env node
/** Final consolidation staging smoke — API owner flows + web healthz */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_JSON = path.resolve(__dirname, 'consolidation-staging-smoke.json');
const API = 'https://young-guns-os-staging.up.railway.app';
const WEB = 'https://comfortable-determination-staging.up.railway.app';
const YGP = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const HEAD = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();

const scriptPath = path.join(repoRoot, '.tmp-mint.mjs');
fs.writeFileSync(scriptPath, `import { createAccessToken, generateRefreshToken, hashRefreshToken } from './packages/auth/dist/tokens.js';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const companyId = '${YGP}';
const [user] = await sql\`SELECT u.id, u.role_id, r.name as role_name, r.permissions FROM users u JOIN roles r ON r.id = u.role_id WHERE u.company_id = \${companyId} AND u.is_active = true ORDER BY u.created_at ASC LIMIT 1\`;
const permissionKeys = Array.isArray(user.permissions) ? user.permissions : [];
const sessionId = crypto.randomUUID();
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const refreshToken = generateRefreshToken();
const refreshHash = hashRefreshToken(refreshToken);
await sql\`INSERT INTO sessions (id, user_id, company_id, refresh_token_hash, expires_at, last_activity_at, user_agent, ip_address) VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, \${expiresAt}, NOW(), 'consolidation-smoke', '127.0.0.1')\`;
const { token } = createAccessToken({ sub: user.id, companyId, roleId: user.role_id, roleName: user.role_name, sessionId, permissions: permissionKeys }, process.env.JWT_SECRET);
process.stdout.write(JSON.stringify({ token }));
await sql.end();`);

execSync('pnpm --filter @titan/auth build', { cwd: repoRoot, stdio: 'pipe' });
const { token } = JSON.parse(execSync(`railway run --service young-guns-os node ${scriptPath}`, { cwd: repoRoot, encoding: 'utf8' }).trim());
fs.rmSync(scriptPath, { force: true });

const from = new Date(Date.now() - 3 * 86400000).toISOString();
const to = new Date(Date.now() + 4 * 86400000).toISOString();

const routes = [
  ['GET', '/api/v1/health/ready', null, 'health'],
  ['GET', '/api/v1/finance/stats', token, 'finance_stats'],
  ['GET', '/api/v1/finance-intelligence/receivables', token, 'receivables'],
  ['GET', '/api/v1/finance-intelligence/payables', token, 'payables'],
  ['GET', '/api/v1/finance-intelligence/cashflow', token, 'cashflow'],
  ['GET', '/api/v1/jobs?limit=5', token, 'jobs'],
  ['GET', '/api/v1/crm/customers?limit=5', token, 'customers'],
  ['GET', `/api/v1/scheduling/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, token, 'scheduling'],
  ['GET', '/api/v1/fleet/vehicles', token, 'fleet'],
  ['GET', '/api/v1/integrations/hub/dashboard?simple=true', token, 'integrations'],
  ['GET', '/api/v1/corporate-departments/finance_accounting/tasks', token, 'dept_tasks'],
  ['GET', '/api/v1/team/members', token, 'settings_team'],
];

const results = [];
for (const [method, route, auth, label] of routes) {
  const headers = { Accept: 'application/json' };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(`${API}${route}`, { method, headers });
  results.push({ label, route: route.split('?')[0], status: res.status, ok: res.ok });
}

const webRes = await fetch(`${WEB}/healthz`);
const verify231 = JSON.parse(fs.readFileSync(path.join(__dirname, '231-titan-owner-operating-model-final-verify.json'), 'utf8'));

const out = {
  schemaVersion: 'final-consolidation-smoke-v1',
  generatedAt: new Date().toISOString(),
  headSha: HEAD,
  deployWebId: '33400ea4-95d9-40fe-866c-4105df40725d',
  deployApiId: '0400c5a7-3052-4e4c-8c7b-734903be0f7c',
  stagingApi: API,
  stagingWeb: WEB,
  apiResults: results,
  webHealthz: { status: webRes.status, ok: webRes.status === 200 },
  verify231Reference: { verdict: verify231.verdict, blockers: verify231.blockers?.length ?? 0, screenshotCount: verify231.screenshotCount },
  allApiOk: results.every((r) => r.ok),
  verdict: results.every((r) => r.ok) && webRes.status === 200 ? 'GO' : 'HOLD',
};
fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
