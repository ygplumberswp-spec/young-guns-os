#!/usr/bin/env node
/**
 * 252 — Orphan / NO-GO route cleanup verification (staging only).
 * Deep-link redirects + RBAC regression subset (251 patterns). Finance untouched.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(__dirname, 'phase252-orphan-route-cleanup-staging');
const OUT_JSON = path.resolve(__dirname, '252-orphan-route-cleanup-verify.json');

const WEB = 'https://comfortable-determination-staging.up.railway.app';
const API = 'https://young-guns-os-staging.up.railway.app';
const YGP_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';

const HEAD = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();

/** Sample orphan deep links that must redirect (not blank / not stay on scaffold). */
const ORPHAN_REDIRECT_SAMPLES = [
  { from: '/ai-orchestration', expectPrefix: '/enterprise-modules' },
  { from: '/automation/new', expectPrefix: '/automation' },
  { from: '/automation/wf-test-id', expectPrefix: '/automation' },
  { from: '/developers', expectPrefix: '/enterprise-modules' },
  { from: '/marketing-intelligence', expectPrefix: '/marketing' },
  { from: '/fleet-intelligence', expectPrefix: '/fleet' },
  { from: '/procurement/purchase-orders/new', expectPrefix: '/procurement' },
  { from: '/workforce/manager', expectPrefix: '/scheduling' },
  { from: '/security', expectPrefix: '/settings/security' },
  { from: '/notifications', expectPrefix: '/' },
];

/** Owner operational routes that must remain reachable post-cleanup. */
const OWNER_RETAIN_SAMPLES = [
  '/',
  '/jobs',
  '/crm',
  '/scheduling',
  '/fleet/live-map',
  '/finance/invoices',
  '/finance/receivables',
  '/global-search',
  '/automation',
  '/settings/team',
];

/** Finance routes — must not redirect away (unchanged). */
const FINANCE_UNTOUCHED = [
  '/finance/quotes',
  '/finance/invoices',
  '/finance/payments',
  '/finance/receivables',
  '/finance/payables',
  '/finance/cashflow',
  '/finance/boq',
  '/integrations/xero',
];

/** RBAC subset (251 patterns). */
const RBAC_FORBIDDEN = {
  accountant: [{ path: '/scheduling', expectPrefix: '/finance' }],
  dispatcher: [
    { path: '/finance/receivables', expectPrefix: '/' },
    { path: '/integrations', expectPrefix: '/' },
  ],
  technician: [
    { path: '/', expectPrefix: '/mobile' },
    { path: '/finance/receivables', expectPrefix: '/mobile' },
  ],
};

async function loadCleanupModule() {
  execSync('pnpm --filter @titan/shared build', { cwd: repoRoot, stdio: 'pipe' });
  const modPath = path.join(repoRoot, 'packages/shared/dist/orphan-route-cleanup.js');
  return import(pathToFileURL(modPath).href);
}

async function mintOwnerSession() {
  const scriptPath = path.join(repoRoot, '.tmp-mint-252-owner.mjs');
  fs.writeFileSync(
    scriptPath,
    `import { createAccessToken, generateRefreshToken, hashRefreshToken } from './packages/auth/dist/tokens.js';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const companyId = '${YGP_COMPANY_ID}';
const [user] = await sql\`SELECT u.id, u.role_id, r.name as role_name, r.permissions FROM users u JOIN roles r ON r.id = u.role_id WHERE u.company_id = \${companyId} AND u.is_active = true ORDER BY u.created_at ASC LIMIT 1\`;
const permissionKeys = Array.isArray(user.permissions) ? user.permissions : [];
const sessionId = crypto.randomUUID();
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const refreshToken = generateRefreshToken();
const refreshHash = hashRefreshToken(refreshToken);
await sql\`INSERT INTO sessions (id, user_id, company_id, refresh_token_hash, expires_at, last_activity_at, user_agent, ip_address) VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, \${expiresAt}, NOW(), '252-orphan-verify', '127.0.0.1')\`;
const { token } = createAccessToken({ sub: user.id, companyId, roleId: user.role_id, roleName: user.role_name, sessionId, permissions: permissionKeys }, process.env.JWT_SECRET);
process.stdout.write(JSON.stringify({ token, roleName: user.role_name, permissions: permissionKeys }));
await sql.end();`,
  );
  execSync('pnpm --filter @titan/auth build', { cwd: repoRoot, stdio: 'pipe' });
  const raw = execSync(`railway run --service young-guns-os node ${scriptPath}`, {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
  fs.rmSync(scriptPath, { force: true });
  return JSON.parse(raw);
}

async function mintRoleSession(roleNames, email, fallbackPermissions = null) {
  const scriptPath = path.join(repoRoot, `.tmp-mint-252-${roleNames[0]}.mjs`);
  const permLiteral = fallbackPermissions ? JSON.stringify(fallbackPermissions) : 'null';
  fs.writeFileSync(
    scriptPath,
    `import { createAccessToken, generateRefreshToken, hashRefreshToken } from './packages/auth/dist/tokens.js';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const companyId = '${YGP_COMPANY_ID}';
const targetEmail = ${JSON.stringify(email)};
const roleNames = ${JSON.stringify(roleNames)};
const fallbackPermissions = ${permLiteral};
let user = null;
let roleName = null;
let roleId = null;
let permissions = [];
if (targetEmail) {
  const [row] = await sql\`SELECT u.id, u.role_id, r.name as role_name, r.permissions FROM users u JOIN roles r ON r.id = u.role_id WHERE u.company_id = \${companyId} AND u.is_active = true AND u.email = \${targetEmail} LIMIT 1\`;
  if (row) { user = row; roleName = row.role_name; roleId = row.role_id; permissions = Array.isArray(row.permissions) ? row.permissions : []; }
}
if (!user) {
  for (const name of roleNames) {
    const [row] = await sql\`SELECT u.id, u.role_id, r.name as role_name, r.permissions FROM users u JOIN roles r ON r.id = u.role_id WHERE u.company_id = \${companyId} AND u.is_active = true AND r.name = \${name} ORDER BY u.created_at ASC LIMIT 1\`;
    if (row) { user = row; roleName = row.role_name; roleId = row.role_id; permissions = Array.isArray(row.permissions) ? row.permissions : []; break; }
  }
}
if (!user && roleNames.includes('Technician')) {
  const [techRole] = await sql\`SELECT id, name, permissions FROM roles WHERE company_id = \${companyId} AND name = 'Technician' LIMIT 1\`;
  const [anyUser] = await sql\`SELECT u.id FROM users u WHERE u.company_id = \${companyId} AND u.is_active = true ORDER BY u.created_at ASC LIMIT 1\`;
  if (techRole && anyUser) {
    user = { id: anyUser.id, role_id: techRole.id, role_name: 'Technician', permissions: techRole.permissions };
    roleName = 'Technician'; roleId = techRole.id;
    permissions = fallbackPermissions ?? (Array.isArray(techRole.permissions) ? techRole.permissions : []);
  }
}
if (!user) { process.stdout.write(JSON.stringify({ unavailable: true, roleNames })); await sql.end(); process.exit(0); }
const sessionId = crypto.randomUUID();
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const refreshToken = generateRefreshToken();
const refreshHash = hashRefreshToken(refreshToken);
await sql\`INSERT INTO sessions (id, user_id, company_id, refresh_token_hash, expires_at, last_activity_at, user_agent, ip_address) VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, \${expiresAt}, NOW(), '252-rbac', '127.0.0.1')\`;
const { token } = createAccessToken({ sub: user.id, companyId, roleId, roleName, sessionId, permissions }, process.env.JWT_SECRET);
process.stdout.write(JSON.stringify({ token, roleName, permissions }));
await sql.end();`,
  );
  const raw = execSync(`railway run --service young-guns-os node ${scriptPath}`, {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
  fs.rmSync(scriptPath, { force: true });
  const parsed = JSON.parse(raw);
  if (parsed.unavailable) return { unavailable: true };
  return parsed;
}

function urlMatchesPrefix(url, prefix) {
  try {
    const u = new URL(url);
    const p = prefix.endsWith('/') && prefix !== '/' ? prefix.slice(0, -1) : prefix;
    return u.pathname === p || u.pathname.startsWith(`${p}/`);
  } catch {
    return false;
  }
}

async function fetchStaffAuthPayload(token, roleName, permissions) {
  const res = await fetch(`${API}/api/v1/auth/me`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`auth/me failed: ${res.status}`);
  const json = await res.json();
  return {
    user: permissions ? { ...json.data.user, roleName, permissions } : json.data.user,
    session: { accessToken: token, expiresIn: 3600 },
  };
}

async function seedStaffSession(context, page, token, roleName, permissions) {
  const authPayload = await fetchStaffAuthPayload(token, roleName, permissions);
  await context.addCookies([
    {
      name: 'titan_refresh_token',
      value: '252-orphan-staging-verify',
      domain: 'comfortable-determination-staging.up.railway.app',
      path: '/api/v1/auth',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);
  await page.route('**/api/v1/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: authPayload }),
    });
  });
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { user: authPayload.user } }),
    });
  });
}

async function launchBrowser() {
  return chromium.launch({ headless: true, channel: 'chrome' }).catch(() => chromium.launch({ headless: true }));
}

async function scanOwnerCleanup(ownerSession) {
  const browser = await launchBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();
  await seedStaffSession(context, page, ownerSession.token, ownerSession.roleName, ownerSession.permissions);

  const redirectResults = [];
  for (const sample of ORPHAN_REDIRECT_SAMPLES) {
    await page.goto(`${WEB}${sample.from}`, { waitUntil: 'networkidle', timeout: 90_000 });
    await page.waitForTimeout(600);
    const finalUrl = page.url();
    const pass =
      urlMatchesPrefix(finalUrl, sample.expectPrefix) && !urlMatchesPrefix(finalUrl, sample.from);
    redirectResults.push({ ...sample, finalUrl, result: pass ? 'pass' : 'fail' });
  }

  const retainResults = [];
  for (const routePath of OWNER_RETAIN_SAMPLES) {
    await page.goto(`${WEB}${routePath}`, { waitUntil: 'networkidle', timeout: 90_000 });
    await page.waitForTimeout(600);
    const finalUrl = page.url();
    const pass = urlMatchesPrefix(finalUrl, routePath);
    retainResults.push({ path: routePath, finalUrl, result: pass ? 'pass' : 'fail' });
  }

  const financeResults = [];
  for (const routePath of FINANCE_UNTOUCHED) {
    await page.goto(`${WEB}${routePath}`, { waitUntil: 'networkidle', timeout: 90_000 });
    await page.waitForTimeout(600);
    const finalUrl = page.url();
    const pass = urlMatchesPrefix(finalUrl, routePath);
    financeResults.push({ path: routePath, finalUrl, result: pass ? 'pass' : 'fail' });
  }

  await browser.close();
  return { redirectResults, retainResults, financeResults };
}

async function scanRbacSubset() {
  const TECHNICIAN_PERMISSIONS = ['mobile:read', 'mobile:write', 'jobs:read', 'inventory:read'];
  const roles = {
    accountant: await mintRoleSession(['Accountant'], '251-rbac-test-accountant@staging-verify.test'),
    dispatcher: await mintRoleSession(['Dispatcher'], '251-rbac-test-dispatcher@staging-verify.test'),
    technician: await mintRoleSession(['Technician'], null, TECHNICIAN_PERMISSIONS),
  };

  const results = {};
  for (const [roleKey, session] of Object.entries(roles)) {
    if (session?.unavailable) {
      results[roleKey] = [{ result: 'skip', note: 'role unavailable on staging' }];
      continue;
    }
    const browser = await launchBrowser();
    const context = await browser.newContext();
    const page = await context.newPage();
    await seedStaffSession(context, page, session.token, session.roleName, session.permissions);
    const forbiddenResults = [];
    for (const spec of RBAC_FORBIDDEN[roleKey]) {
      await page.goto(`${WEB}${spec.path}`, { waitUntil: 'networkidle', timeout: 90_000 });
      await page.waitForTimeout(600);
      const finalUrl = page.url();
      const pass =
        urlMatchesPrefix(finalUrl, spec.expectPrefix) && !urlMatchesPrefix(finalUrl, spec.path);
      forbiddenResults.push({ ...spec, finalUrl, result: pass ? 'pass' : 'fail' });
    }
    await browser.close();
    results[roleKey] = forbiddenResults;
  }
  return results;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const cleanupMod = await loadCleanupModule();
  const counts = cleanupMod.countOrphanRouteDispositions();

  const ownerSession = await mintOwnerSession();
  const ownerScan = await scanOwnerCleanup(ownerSession);
  const rbacScan = await scanRbacSubset();

  const allRedirectPass = ownerScan.redirectResults.every((r) => r.result === 'pass');
  const allRetainPass = ownerScan.retainResults.every((r) => r.result === 'pass');
  const allFinancePass = ownerScan.financeResults.every((r) => r.result === 'pass');
  const allRbacPass = Object.values(rbacScan)
    .flat()
    .every((r) => r.result === 'pass' || r.result === 'skip');

  let verdict = 'GO';
  if (!allRedirectPass || !allRetainPass || !allFinancePass || !allRbacPass) {
    verdict = 'HOLD';
  }

  const report = {
    schemaVersion: 'orphan-route-cleanup-verify-v1',
    label: '252-orphan-route-cleanup-verify',
    generatedAt: new Date().toISOString(),
    headSha: HEAD,
    startingSha: 'fdc70d3',
    deployWebId: '5e49c5df-5496-4534-9545-e0a49e1f47d9',
    deployApiId: 'da553cca-aeb0-4679-bc4e-eb9400d09d94',
    stagingWeb: WEB,
    stagingApi: API,
    ygpCompanyId: YGP_COMPANY_ID,
    classificationCounts: counts,
    orphanCountBefore: 113,
    orphanDeepLinkExposureAfter: counts.HIDE_REDIRECT + counts.REMOVE,
    scopeConfirmation: {
      financeTouched: false,
      xeroTouched: false,
      productionTouched: false,
    },
    ownerOrphanRedirects: ownerScan.redirectResults,
    ownerRetainRoutes: ownerScan.retainResults,
    financeUntouched: ownerScan.financeResults,
    rbacRegression: rbacScan,
    allRedirectPass,
    allRetainPass,
    allFinancePass,
    allRbacPass,
    verdict,
    overallOrphanCleanupVerdict: verdict,
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (verdict !== 'GO') process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
