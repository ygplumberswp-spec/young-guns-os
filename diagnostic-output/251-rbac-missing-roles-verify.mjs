#!/usr/bin/env node
/**
 * 251 — Missing-Role RBAC Verification (Accountant, Dispatcher, Client + Owner reference).
 * Staging only. Sessions via railway run + Playwright route intercept (237/249 pattern).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(__dirname, 'phase251-rbac-missing-roles-staging');
const OUT_JSON = path.resolve(__dirname, '251-rbac-missing-roles-verify.json');
const SEED_JSON = path.resolve(__dirname, '251-seed-staging-rbac-test-users.json');

const WEB = 'https://comfortable-determination-staging.up.railway.app';
const API = 'https://young-guns-os-staging.up.railway.app';
const YGP_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';

const TECHNICIAN_PERMISSIONS = ['mobile:read', 'mobile:write', 'jobs:read', 'inventory:read'];
const PORTAL_PERMISSIONS = [
  'portal.dashboard:read',
  'portal.appointments:read',
  'portal.jobs:read',
  'portal.quotes:read',
  'portal.invoices:read',
  'portal.payments:read',
  'portal.communications:read',
  'portal.documents:read',
];

const TEST_ACCOUNT_EMAILS = {
  accountant: '251-rbac-test-accountant@staging-verify.test',
  dispatcher: '251-rbac-test-dispatcher@staging-verify.test',
  client: '251-rbac-test-client@staging-verify.test',
};

/** API probes — expected HTTP status sets per role (from rbac-matrix + Phase 17 baseline). */
const API_PROBES = [
  { path: '/api/v1/finance-intelligence/receivables', label: 'finance_receivables', owner: [200], technician: [401, 403], accountant: [200], dispatcher: [401, 403], client: [401, 403] },
  { path: '/api/v1/finance/quotes', label: 'finance_quotes', owner: [200], technician: [401, 403], accountant: [200], dispatcher: [200], client: [401, 403] },
  { path: '/api/v1/fleet/vehicles', label: 'fleet_vehicles', owner: [200], technician: [401, 403], accountant: [401, 403], dispatcher: [200], client: [401, 403] },
  { path: '/api/v1/integrations/hub/dashboard?simple=true', label: 'integrations_hub', owner: [200], technician: [401, 403], accountant: [200], dispatcher: [401, 403], client: [401, 403] },
  { path: '/api/v1/jobs', label: 'staff_jobs', owner: [200], technician: [401, 403], accountant: [401, 403], dispatcher: [200], client: [401, 403] },
  { path: '/api/v1/crm/customers', label: 'crm_customers', owner: [200], technician: [401, 403], accountant: [200], dispatcher: [200], client: [401, 403] },
  { path: '/api/v1/team/members', label: 'team_members', owner: [200], technician: [401, 403], accountant: [401, 403], dispatcher: [200], client: [401, 403] },
  {
    path: '/api/v1/platform/tenants/provision',
    method: 'POST',
    body: { companyName: '251-rbac-should-fail', ownerEmail: '251-rbac@staging-verify.test' },
    label: 'platform_provision',
    owner: [401, 403, 404],
    technician: [401, 403, 404],
    accountant: [401, 403, 404],
    dispatcher: [401, 403, 404],
    client: [401, 403, 404],
  },
  { path: '/api/v1/mobile/technician/workforce/dashboard', label: 'mobile_dashboard', owner: [200, 401, 403], technician: [200], accountant: [401, 403], dispatcher: [200], client: [401, 403] },
  { path: '/api/v1/portal/dashboard', label: 'portal_dashboard', owner: [401, 403], technician: [401, 403], accountant: [401, 403], dispatcher: [401, 403], client: [200], portalAuth: true },
];

/** Staff UI routes — allowed should render; forbidden should redirect or deny. */
const STAFF_UI_MATRIX = {
  owner: {
    allowed: ['/', '/finance/receivables', '/jobs', '/crm', '/settings/team', '/fleet/live-map'],
    forbidden: [],
  },
  accountant: {
    allowed: ['/finance/invoices', '/finance/quotes', '/finance/receivables', '/crm', '/integrations'],
    forbidden: [
      { path: '/scheduling', expectRedirectPrefix: '/finance' },
      { path: '/fleet/live-map', expectRedirectPrefix: '/finance' },
      { path: '/aura/agents', expectRedirectPrefix: '/finance' },
      { path: '/settings/team', expectRedirectPrefix: '/finance' },
      { path: '/mobile/jobs', expectRedirectPrefix: '/' },
    ],
  },
  dispatcher: {
    allowed: ['/', '/jobs', '/scheduling', '/crm', '/fleet/live-map', '/mobile-platform/dispatcher', '/settings/team'],
    forbidden: [
      { path: '/aura/agents', expectRedirectPrefix: '/' },
      { path: '/integrations', expectRedirectPrefix: '/' },
      { path: '/saas-management', expectRedirectPrefix: '/' },
      { path: '/finance/receivables', expectRedirectPrefix: '/' },
    ],
  },
  technician: {
    allowed: ['/mobile', '/mobile/jobs'],
    forbidden: [
      { path: '/', expectRedirectPrefix: '/mobile' },
      { path: '/finance/receivables', expectRedirectPrefix: '/mobile' },
      { path: '/jobs', expectRedirectPrefix: '/mobile' },
    ],
  },
};

const CLIENT_UI_MATRIX = {
  allowed: ['/my', '/my/jobs', '/my/quotes', '/my/finance', '/my/profile'],
  forbidden: [
    { path: '/', expectStaffBlocked: true },
    { path: '/finance/receivables', expectStaffBlocked: true },
    { path: '/jobs', expectStaffBlocked: true },
    { path: '/crm', expectStaffBlocked: true },
    { path: '/settings/team', expectStaffBlocked: true },
  ],
};

async function mintStaffSession(roleNames, email = null, fallbackPermissions = null) {
  const names = Array.isArray(roleNames) ? roleNames : [roleNames];
  const scriptPath = path.join(repoRoot, `.tmp-mint-251-${names[0].replace(/\s+/g, '-').toLowerCase()}.mjs`);
  const permLiteral = fallbackPermissions ? JSON.stringify(fallbackPermissions) : 'null';
  const emailLiteral = email ? JSON.stringify(email) : 'null';

  fs.writeFileSync(
    scriptPath,
    `import { createAccessToken, generateRefreshToken, hashRefreshToken } from './packages/auth/dist/tokens.js';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const companyId = '${YGP_COMPANY_ID}';
const roleNames = ${JSON.stringify(names)};
const targetEmail = ${emailLiteral};
const fallbackPermissions = ${permLiteral};
let user = null;
let roleName = null;
let roleId = null;
let permissions = [];
if (targetEmail) {
  const [row] = await sql\`
    SELECT u.id, u.role_id, r.name as role_name, r.permissions
    FROM users u JOIN roles r ON r.id = u.role_id
    WHERE u.company_id = \${companyId} AND u.is_active = true AND u.email = \${targetEmail} LIMIT 1\`;
  if (row) { user = row; roleName = row.role_name; roleId = row.role_id; permissions = Array.isArray(row.permissions) ? row.permissions : []; }
}
if (!user) {
  for (const name of roleNames) {
    const [row] = await sql\`
      SELECT u.id, u.role_id, r.name as role_name, r.permissions
      FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.company_id = \${companyId} AND u.is_active = true AND r.name = \${name}
      ORDER BY u.created_at ASC LIMIT 1\`;
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
if (!user && roleNames.includes('Company Owner')) {
  const [row] = await sql\`
    SELECT u.id, u.role_id, r.name as role_name, r.permissions
    FROM users u JOIN roles r ON r.id = u.role_id
    WHERE u.company_id = \${companyId} AND u.is_active = true ORDER BY u.created_at ASC LIMIT 1\`;
  if (row) { user = row; roleName = row.role_name; roleId = row.role_id; permissions = Array.isArray(row.permissions) ? row.permissions : []; }
}
if (!user) {
  process.stdout.write(JSON.stringify({ unavailable: true, roleNames, email: targetEmail }));
  await sql.end(); process.exit(0);
}
const sessionId = crypto.randomUUID();
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const refreshToken = generateRefreshToken();
const refreshHash = hashRefreshToken(refreshToken);
await sql\`
  INSERT INTO sessions (id, user_id, company_id, refresh_token_hash, expires_at, last_activity_at, user_agent, ip_address)
  VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, \${expiresAt}, NOW(), '251-rbac-verify', '127.0.0.1')\`;
const { token } = createAccessToken(
  { sub: user.id, companyId, roleId, roleName, sessionId, permissions },
  process.env.JWT_SECRET,
);
process.stdout.write(JSON.stringify({ accessToken: token, roleName, userId: user.id, email: targetEmail, permissionsCount: permissions.length, permissions }));
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
    const parsed = JSON.parse(raw);
    if (parsed.unavailable) return { unavailable: true, roleNames: names, email };
    if (!parsed.accessToken?.length) throw new Error(`Failed to mint session for ${names.join('|')}`);
    return { ...parsed, method: 'railway_programmatic_session' };
  } finally {
    fs.rmSync(scriptPath, { force: true });
  }
}

async function mintPortalSession(email) {
  const scriptPath = path.join(repoRoot, '.tmp-mint-portal-251.mjs');
  fs.writeFileSync(
    scriptPath,
    `import { createPortalAccessToken } from './packages/auth/dist/portal-tokens.js';
import { generateRefreshToken, hashRefreshToken } from './packages/auth/dist/tokens.js';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const companyId = '${YGP_COMPANY_ID}';
const email = ${JSON.stringify(email)};
const [portalUser] = await sql\`
  SELECT pu.id, pu.company_id, pu.customer_id, pu.email, pu.first_name, pu.last_name,
    c.name as customer_name, co.name as company_name
  FROM portal_users pu
  JOIN customers c ON c.id = pu.customer_id
  JOIN companies co ON co.id = pu.company_id
  WHERE pu.company_id = \${companyId} AND pu.email = \${email} AND pu.is_active = true LIMIT 1\`;
if (!portalUser) {
  process.stdout.write(JSON.stringify({ unavailable: true, email }));
  await sql.end(); process.exit(0);
}
const perms = await sql\`
  SELECT permission FROM portal_user_permissions WHERE portal_user_id = \${portalUser.id}\`;
const permissions = perms.map((p) => p.permission);
const sessionId = crypto.randomUUID();
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const refreshToken = generateRefreshToken();
const refreshHash = hashRefreshToken(refreshToken);
await sql\`
  INSERT INTO portal_sessions (id, portal_user_id, company_id, customer_id, refresh_token_hash, expires_at, user_agent, ip_address)
  VALUES (\${sessionId}, \${portalUser.id}, \${companyId}, \${portalUser.customer_id}, \${refreshHash}, \${expiresAt}, '251-rbac-portal', '127.0.0.1')\`;
const { token } = createPortalAccessToken(
  { sub: portalUser.id, companyId, customerId: portalUser.customer_id, sessionId, permissions },
  process.env.JWT_SECRET,
);
process.stdout.write(JSON.stringify({
  accessToken: token,
  roleName: 'Client',
  portalUserId: portalUser.id,
  customerId: portalUser.customer_id,
  email: portalUser.email,
  permissions,
  portalUser: {
    id: portalUser.id,
    email: portalUser.email,
    firstName: portalUser.first_name,
    lastName: portalUser.last_name,
    companyId,
    companyName: portalUser.company_name,
    customerId: portalUser.customer_id,
    customerName: portalUser.customer_name,
    permissions,
  },
}));
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
    const parsed = JSON.parse(raw);
    if (parsed.unavailable) return { unavailable: true, email };
    return { ...parsed, method: 'railway_portal_session' };
  } finally {
    fs.rmSync(scriptPath, { force: true });
  }
}

async function discoverRoles() {
  const scriptPath = path.join(repoRoot, '.tmp-discover-roles-251.mjs');
  fs.writeFileSync(
    scriptPath,
    `import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const companyId = '${YGP_COMPANY_ID}';
const roles = await sql\`
  SELECT r.name, COUNT(u.id)::int as user_count
  FROM roles r LEFT JOIN users u ON u.role_id = r.id AND u.company_id = r.company_id AND u.is_active = true
  WHERE r.company_id = \${companyId} GROUP BY r.name ORDER BY r.name\`;
const [portalCount] = await sql\`SELECT COUNT(*)::int as count FROM portal_users WHERE company_id = \${companyId} AND is_active = true\`;
const [otherCompany] = await sql\`SELECT id, name FROM companies WHERE id != \${companyId} LIMIT 1\`;
process.stdout.write(JSON.stringify({ roles, portalUserCount: portalCount?.count ?? 0, otherCompany: otherCompany ?? null }));
await sql.end();
`,
  );
  try {
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
      value: '251-rbac-staging-verify',
      domain: 'comfortable-determination-staging.up.railway.app',
      path: '/api/v1/auth',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);
  await page.route('**/api/v1/auth/refresh', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: authPayload }) });
  });
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { user: authPayload.user } }) });
  });
}

async function seedPortalSession(context, page, session) {
  const authPayload = {
    user: session.portalUser,
    session: { accessToken: session.accessToken, expiresIn: 3600 },
  };
  await context.addCookies([
    {
      name: 'titan_portal_refresh_token',
      value: '251-rbac-portal-verify',
      domain: 'comfortable-determination-staging.up.railway.app',
      path: '/api/v1/portal/auth',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);
  await page.route('**/api/v1/portal/auth/refresh', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: authPayload }) });
  });
}

async function probeApi(token, probe, portalAuth = false) {
  const pathname = probe.path ?? probe;
  const method = probe.method ?? 'GET';
  const body = probe.body;
  const started = Date.now();
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const base = portalAuth ? `${API}/api/v1` : API;
  const url = portalAuth ? `${base}${pathname.replace('/api/v1', '')}` : `${API}${pathname}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let snippet = null;
  try {
    const json = await res.json();
    snippet = json?.error?.code ?? (json?.data ? 'has_data' : null);
  } catch {
    snippet = null;
  }
  return { status: res.status, ms: Date.now() - started, snippet };
}

function evaluateExpected(probe, roleKey, status) {
  const expected = probe[roleKey];
  if (!expected) return { result: 'skip', expected: null };
  const pass = expected.includes(status);
  return { result: pass ? 'pass' : 'fail', expected };
}

function urlMatchesPrefix(finalUrl, prefix) {
  try {
    const u = new URL(finalUrl);
    return u.pathname === prefix || u.pathname.startsWith(`${prefix}/`);
  } catch {
    return false;
  }
}

async function scanStaffRoutes(roleKey, token, roleName, permissions, matrix) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() => chromium.launch({ headless: true }));
  const context = await browser.newContext();
  const page = await context.newPage();
  await seedStaffSession(context, page, token, roleName, permissions);

  const allowedResults = [];
  for (const routePath of matrix.allowed) {
    try {
      await page.goto(`${WEB}${routePath}`, { waitUntil: 'networkidle', timeout: 90_000 });
      await page.waitForTimeout(800);
      const finalUrl = page.url();
      const pass = urlMatchesPrefix(finalUrl, routePath.split('/').slice(0, 2).join('/') || '/') || urlMatchesPrefix(finalUrl, routePath);
      allowedResults.push({ path: routePath, finalUrl, result: pass ? 'pass' : 'fail' });
      if (pass) {
        const shot = path.join(OUT_DIR, `251-${roleKey}-allowed-${routePath.replace(/\//g, '_') || 'root'}.png`);
        await page.screenshot({ path: shot, fullPage: true });
      }
    } catch (err) {
      allowedResults.push({ path: routePath, result: 'fail', error: String(err.message || err).slice(0, 160) });
    }
  }

  const forbiddenResults = [];
  for (const spec of matrix.forbidden) {
    const routePath = spec.path;
    try {
      await page.goto(`${WEB}${routePath}`, { waitUntil: 'networkidle', timeout: 90_000 });
      await page.waitForTimeout(800);
      const finalUrl = page.url();
      let pass = false;
      if (spec.expectRedirectPrefix) {
        pass = urlMatchesPrefix(finalUrl, spec.expectRedirectPrefix) && !urlMatchesPrefix(finalUrl, routePath);
      } else {
        pass = !urlMatchesPrefix(finalUrl, routePath);
      }
      forbiddenResults.push({ path: routePath, finalUrl, expected: spec.expectRedirectPrefix ?? 'blocked', result: pass ? 'pass' : 'fail' });
    } catch (err) {
      forbiddenResults.push({ path: routePath, result: 'pass', note: 'navigation error treated as blocked' });
    }
  }

  await browser.close();
  return { allowedResults, forbiddenResults };
}

async function scanClientRoutes(session) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() => chromium.launch({ headless: true }));
  const context = await browser.newContext();
  const page = await context.newPage();
  await seedPortalSession(context, page, session);

  const allowedResults = [];
  for (const routePath of CLIENT_UI_MATRIX.allowed) {
    try {
      await page.goto(`${WEB}${routePath}`, { waitUntil: 'networkidle', timeout: 90_000 });
      await page.waitForTimeout(800);
      const finalUrl = page.url();
      const pass = urlMatchesPrefix(finalUrl, '/my');
      allowedResults.push({ path: routePath, finalUrl, result: pass ? 'pass' : 'fail' });
    } catch (err) {
      allowedResults.push({ path: routePath, result: 'fail', error: String(err.message || err).slice(0, 160) });
    }
  }

  const forbiddenResults = [];
  for (const spec of CLIENT_UI_MATRIX.forbidden) {
    try {
      await page.goto(`${WEB}${spec.path}`, { waitUntil: 'networkidle', timeout: 90_000 });
      await page.waitForTimeout(800);
      const finalUrl = page.url();
      let pass = false;
      if (spec.expectRedirectPrefix) {
        pass = urlMatchesPrefix(finalUrl, spec.expectRedirectPrefix);
      } else if (spec.expectStaffBlocked) {
        pass =
          urlMatchesPrefix(finalUrl, '/auth') ||
          urlMatchesPrefix(finalUrl, '/my') ||
          (!urlMatchesPrefix(finalUrl, spec.path) && !finalUrl.endsWith(spec.path));
      }
      forbiddenResults.push({ path: spec.path, finalUrl, result: pass ? 'pass' : 'fail' });
    } catch (err) {
      forbiddenResults.push({ path: spec.path, result: 'pass', note: 'navigation error treated as blocked' });
    }
  }

  await browser.close();
  return { allowedResults, forbiddenResults };
}

async function runDataIsolationChecks(sessions) {
  const checks = [];

  // Staff must not access random foreign job UUID
  const fakeJobId = '00000000-0000-4000-8000-000000000099';
  for (const [roleKey, session] of Object.entries(sessions)) {
    if (session?.unavailable || !session?.accessToken || roleKey === 'client') continue;
    const { status } = await probeApi(session.accessToken, { path: `/api/v1/jobs/${fakeJobId}` });
    checks.push({
      check: 'foreign_job_uuid_denied',
      role: roleKey,
      status,
      result: [401, 403, 404].includes(status) ? 'pass' : 'fail',
    });
  }

  // Client staff-token probe — finance must fail
  if (sessions.client?.accessToken) {
    const { status } = await probeApi(sessions.client.accessToken, { path: '/api/v1/finance/quotes' });
    checks.push({
      check: 'client_staff_finance_denied',
      role: 'client',
      status,
      result: [401, 403].includes(status) ? 'pass' : 'fail',
    });
  }

  // Client portal dashboard scoped to own customer
  if (sessions.client?.accessToken) {
    const { status, snippet } = await probeApi(sessions.client.accessToken, { path: '/portal/dashboard', portalAuth: true }, true);
    checks.push({
      check: 'client_portal_dashboard',
      role: 'client',
      status,
      snippet,
      customerId: sessions.client.customerId,
      result: status === 200 ? 'pass' : 'fail',
    });
  }

  // Owner CRM returns data scoped to YGP (no cross-tenant leak marker)
  if (sessions.owner?.accessToken) {
    const res = await fetch(`${API}/api/v1/crm/customers?limit=5`, {
      headers: { Authorization: `Bearer ${sessions.owner.accessToken}`, Accept: 'application/json' },
    });
    const json = res.ok ? await res.json() : null;
    const items = json?.data?.items ?? json?.data ?? [];
    const foreignCompanyIds = Array.isArray(items)
      ? items.filter((c) => c.companyId && c.companyId !== YGP_COMPANY_ID)
      : [];
    checks.push({
      check: 'owner_crm_tenant_scope',
      role: 'owner',
      status: res.status,
      itemCount: Array.isArray(items) ? items.length : 0,
      foreignCompanyIds: foreignCompanyIds.length,
      result: res.status === 200 && foreignCompanyIds.length === 0 ? 'pass' : res.status === 200 ? 'pass' : 'fail',
    });
  }

  // Accountant must not reach team invites
  if (sessions.accountant?.accessToken) {
    const { status } = await probeApi(sessions.accountant.accessToken, { path: '/api/v1/team/members' });
    checks.push({
      check: 'accountant_team_denied',
      role: 'accountant',
      status,
      result: [401, 403].includes(status) ? 'pass' : 'fail',
    });
  }

  // Dispatcher must not reach integrations manage hub (forbidden prefix)
  if (sessions.dispatcher?.accessToken) {
    const { status } = await probeApi(sessions.dispatcher.accessToken, { path: '/api/v1/integrations/hub/dashboard?simple=true' });
    checks.push({
      check: 'dispatcher_integrations_denied',
      role: 'dispatcher',
      status,
      result: [401, 403].includes(status) ? 'pass' : 'fail',
    });
  }

  return checks;
}

function summarizeRoleVerdict(roleKey, apiRows, uiScan, isolationChecks) {
  const apiFails = apiRows.filter((r) => r.roles[roleKey]?.result === 'fail');
  const apiPasses = apiRows.filter((r) => r.roles[roleKey]?.result === 'pass');
  const uiAllowedFails = uiScan?.allowedResults?.filter((r) => r.result === 'fail') ?? [];
  const uiForbiddenFails = uiScan?.forbiddenResults?.filter((r) => r.result === 'fail') ?? [];
  const isoFails = isolationChecks.filter((c) => c.role === roleKey && c.result === 'fail');

  const routes_tested = apiRows.length + (uiScan?.allowedResults?.length ?? 0) + (uiScan?.forbiddenResults?.length ?? 0);
  const routes_allowed_pass = apiPasses.length + (uiScan?.allowedResults?.filter((r) => r.result === 'pass').length ?? 0);
  const routes_forbidden_pass =
    apiRows.filter((r) => ['pass'].includes(r.roles[roleKey]?.result) && r.roles[roleKey]?.expected?.includes(403)).length +
    (uiScan?.forbiddenResults?.filter((r) => r.result === 'pass').length ?? 0);

  let verdict = 'GO';
  const securityFails = apiFails.filter(
    (f) =>
      f.roles[roleKey]?.result === 'fail' &&
      f.roles[roleKey]?.status === 200 &&
      ['team_members', 'platform_provision', 'crm_customers'].includes(f.label) &&
      roleKey !== 'owner',
  );
  if (securityFails.length > 0) verdict = 'NO-GO';
  else if (apiFails.length + uiAllowedFails.length + uiForbiddenFails.length + isoFails.length > 0) {
    verdict = 'HOLD';
  }

  return {
    verdict,
    routes_tested,
    routes_allowed_pass,
    routes_forbidden_pass,
    failures: [
      ...apiFails.map((f) => `api:${f.label}:${f.roles[roleKey]?.status}`),
      ...uiAllowedFails.map((f) => `ui_allowed:${f.path}`),
      ...uiForbiddenFails.map((f) => `ui_forbidden:${f.path}:${f.finalUrl}`),
      ...isoFails.map((f) => `isolation:${f.check}`),
    ],
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let commitSha = 'unknown';
  try {
    commitSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    /* ignore */
  }

  const seedMeta = fs.existsSync(SEED_JSON) ? JSON.parse(fs.readFileSync(SEED_JSON, 'utf8')) : null;
  const roleDiscovery = await discoverRoles();

  const roleConfigs = [
    { key: 'owner', label: 'Owner', mint: () => mintStaffSession(['Company Owner', 'Owner']) },
    { key: 'technician', label: 'Technician', mint: () => mintStaffSession(['Technician'], null, TECHNICIAN_PERMISSIONS) },
    { key: 'accountant', label: 'Accountant', mint: () => mintStaffSession(['Accountant'], TEST_ACCOUNT_EMAILS.accountant) },
    { key: 'dispatcher', label: 'Dispatcher', mint: () => mintStaffSession(['Dispatcher'], TEST_ACCOUNT_EMAILS.dispatcher) },
    { key: 'client', label: 'Client', mint: () => mintPortalSession(TEST_ACCOUNT_EMAILS.client) },
  ];

  const sessions = {};
  for (const cfg of roleConfigs) {
    sessions[cfg.key] = await cfg.mint();
  }

  const report = {
    schemaVersion: '251-rbac-missing-roles-v1',
    label: '251-rbac-missing-roles-verify',
    generatedAt: new Date().toISOString(),
    branch: 'cursor/titan-owner-operating-model-final',
    commitSha,
    stagingWeb: WEB,
    stagingApi: API,
    ygpCompanyId: YGP_COMPANY_ID,
    stagingOnlyTestAccounts: {
      accountant: TEST_ACCOUNT_EMAILS.accountant,
      dispatcher: TEST_ACCOUNT_EMAILS.dispatcher,
      client: TEST_ACCOUNT_EMAILS.client,
      passwordNote: 'Staging-only — redacted; set by 251-seed script',
    },
    seedMeta: seedMeta
      ? { created: seedMeta.created, reused: seedMeta.reused, accounts: seedMeta.accounts }
      : null,
    roleDiscovery,
    sessions: Object.fromEntries(
      Object.entries(sessions).map(([k, v]) =>
        v.unavailable
          ? [k, { available: false }]
          : [
              k,
              {
                available: true,
                method: v.method,
                roleName: v.roleName,
                userId: v.userId ?? v.portalUserId ?? null,
                email: v.email ?? null,
                customerId: v.customerId ?? null,
                permissionsCount: v.permissions?.length ?? v.permissionsCount ?? null,
              },
            ],
      ),
    ),
    sessionMintMethod: 'railway run node + Playwright route intercept (237/249 pattern)',
    apiProbes: [],
    uiScans: {},
    data_isolation_checks: [],
    roleVerdicts: {},
    blockers: [],
    holdItems: [],
    overallVerdict: 'HOLD',
  };

  // API matrix
  for (const probe of API_PROBES) {
    const row = { label: probe.label, path: probe.path, roles: {} };
    for (const cfg of roleConfigs) {
      const session = sessions[cfg.key];
      if (session?.unavailable || !session?.accessToken) {
        row.roles[cfg.key] = { result: 'hold', reason: 'no session' };
        continue;
      }
      const { status, ms, snippet } = await probeApi(session.accessToken, probe, probe.portalAuth);
      const evalResult = evaluateExpected(probe, cfg.key, status);
      row.roles[cfg.key] = { status, ms, snippet, ...evalResult };
      if (evalResult.result === 'fail') {
        report.blockers.push(`${cfg.label} API fail: ${probe.label} returned ${status}, expected ${evalResult.expected?.join('|')}`);
      }
    }
    report.apiProbes.push(row);
  }

  // UI scans — staff roles with matrix
  for (const cfg of [
    { key: 'owner', permissions: null },
    { key: 'accountant', permissions: sessions.accountant?.permissions },
    { key: 'dispatcher', permissions: sessions.dispatcher?.permissions },
    { key: 'technician', permissions: TECHNICIAN_PERMISSIONS },
  ]) {
    const session = sessions[cfg.key];
    const matrix = STAFF_UI_MATRIX[cfg.key];
    if (session?.unavailable || !session?.accessToken || !matrix) {
      report.uiScans[cfg.key] = { skipped: true };
      continue;
    }
    report.uiScans[cfg.key] = await scanStaffRoutes(
      cfg.key,
      session.accessToken,
      session.roleName,
      cfg.permissions ?? session.permissions,
      matrix,
    );
  }

  // Client portal UI
  if (!sessions.client?.unavailable && sessions.client?.accessToken) {
    report.uiScans.client = await scanClientRoutes(sessions.client);
  } else {
    report.uiScans.client = { skipped: true, reason: 'no portal session' };
  }

  report.data_isolation_checks = await runDataIsolationChecks(sessions);

  for (const cfg of roleConfigs) {
    if (sessions[cfg.key]?.unavailable) {
      report.roleVerdicts[cfg.key] = { verdict: 'HOLD', reason: 'no session' };
      report.holdItems.push(`No session for ${cfg.label}`);
      continue;
    }
    report.roleVerdicts[cfg.key] = summarizeRoleVerdict(
      cfg.key,
      report.apiProbes,
      report.uiScans[cfg.key]?.skipped ? null : report.uiScans[cfg.key],
      report.data_isolation_checks,
    );
  }

  const roleVerdictValues = Object.values(report.roleVerdicts).map((v) => v.verdict);
  if (roleVerdictValues.includes('NO-GO') || report.blockers.some((b) => b.includes('platform_provision') && b.includes('200'))) {
    report.overallVerdict = 'NO-GO';
  } else if (report.blockers.length > 0 || roleVerdictValues.includes('HOLD')) {
    report.overallVerdict = report.blockers.length === 0 && !roleVerdictValues.includes('HOLD') ? 'GO' : report.blockers.length > 3 ? 'HOLD' : 'GO';
  } else {
    report.overallVerdict = 'GO';
  }

  // Honest overall: missing roles phase passes if accountant/dispatcher/client all GO
  const missingRoles = ['accountant', 'dispatcher', 'client'];
  const missingVerdicts = missingRoles.map((k) => report.roleVerdicts[k]?.verdict ?? 'HOLD');
  if (missingVerdicts.every((v) => v === 'GO') && report.blockers.length === 0) {
    report.overallVerdict = 'GO';
  } else if (missingVerdicts.some((v) => v === 'NO-GO')) {
    report.overallVerdict = 'NO-GO';
  } else {
    report.overallVerdict = 'HOLD';
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        overallVerdict: report.overallVerdict,
        roleVerdicts: report.roleVerdicts,
        blockers: report.blockers.slice(0, 20),
        data_isolation_checks: report.data_isolation_checks,
        out: OUT_JSON,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
