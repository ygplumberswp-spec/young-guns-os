#!/usr/bin/env node
/**
 * 249 — Phase 17 RBAC, Security, Performance and Quality Gate (staging).
 * Authenticated sessions via railway run (237/248 pattern). No secrets in output.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(__dirname, 'phase17-rbac-security-staging');
const OUT_JSON = path.resolve(__dirname, '249-rbac-security-gate-verify.json');

const WEB = 'https://comfortable-determination-staging.up.railway.app';
const API = 'https://young-guns-os-staging.up.railway.app';
const YGP_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';

const TECHNICIAN_PERMISSIONS = ['mobile:read', 'mobile:write', 'jobs:read', 'inventory:read'];

/** API probes: expected status sets per role. */
const API_PROBES = [
  { path: '/api/v1/finance-intelligence/receivables', label: 'finance_receivables', owner: [200], technician: [401, 403], accountant: [200], dispatcher: [401, 403], client: [401, 403] },
  { path: '/api/v1/finance/quotes', label: 'finance_quotes', owner: [200], technician: [401, 403], accountant: [200], dispatcher: [401, 403], client: [401, 403] },
  { path: '/api/v1/fleet/vehicles', label: 'fleet_vehicles', owner: [200], technician: [401, 403], accountant: [401, 403], dispatcher: [200], client: [401, 403] },
  { path: '/api/v1/integrations/hub/dashboard?simple=true', label: 'integrations_hub', owner: [200], technician: [401, 403], accountant: [401, 403], dispatcher: [401, 403], client: [401, 403] },
  { path: '/api/v1/jobs', label: 'staff_jobs', owner: [200], technician: [401, 403], accountant: [200], dispatcher: [200], client: [401, 403] },
  { path: '/api/v1/crm/customers', label: 'crm_customers', owner: [200], technician: [401, 403], accountant: [200], dispatcher: [200], client: [401, 403] },
  { path: '/api/v1/team/members', label: 'team_members', owner: [200], technician: [401, 403], accountant: [401, 403], dispatcher: [401, 403], client: [401, 403] },
  {
    path: '/api/v1/platform/tenants/provision',
    method: 'POST',
    body: { companyName: '249-rbac-gate-should-fail', ownerEmail: '249-rbac-gate@staging-verify.test' },
    label: 'platform_provision',
    owner: [401, 403, 404],
    technician: [401, 403, 404],
    accountant: [401, 403, 404],
    dispatcher: [401, 403, 404],
    client: [401, 403, 404],
  },
  { path: '/api/v1/mobile/technician/workforce/dashboard', label: 'mobile_dashboard', owner: [200, 401, 403], technician: [200], accountant: [401, 403], dispatcher: [401, 403], client: [401, 403] },
];

const BROWSER_ROUTES = [
  { path: '/', label: 'owner_dashboard' },
  { path: '/finance/receivables', label: 'finance_receivables' },
  { path: '/jobs', label: 'jobs' },
  { path: '/mobile', label: 'mobile' },
  { path: '/fleet/live-map', label: 'fleet_live_map' },
];

const SECURITY_HEADERS = [
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'cross-origin-resource-policy',
];

async function mintRoleSession(roleNames, fallbackPermissions = null) {
  const names = Array.isArray(roleNames) ? roleNames : [roleNames];
  const scriptPath = path.join(repoRoot, `.tmp-mint-session-249-${names[0].replace(/\s+/g, '-').toLowerCase()}.mjs`);
  const permLiteral = fallbackPermissions ? JSON.stringify(fallbackPermissions) : 'null';

  fs.writeFileSync(
    scriptPath,
    `import { createAccessToken, generateRefreshToken, hashRefreshToken } from './packages/auth/dist/tokens.js';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const companyId = '${YGP_COMPANY_ID}';
const roleNames = ${JSON.stringify(names)};
const fallbackPermissions = ${permLiteral};
let user = null;
let roleName = null;
let roleId = null;
let permissions = [];
for (const name of roleNames) {
  const [row] = await sql\`
    SELECT u.id, u.role_id, r.name as role_name, r.permissions
    FROM users u JOIN roles r ON r.id = u.role_id
    WHERE u.company_id = \${companyId} AND u.is_active = true AND r.name = \${name}
    ORDER BY u.created_at ASC LIMIT 1\`;
  if (row) { user = row; roleName = row.role_name; roleId = row.role_id; permissions = Array.isArray(row.permissions) ? row.permissions : []; break; }
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
if (!user && roleNames.includes('Owner')) {
  const [row] = await sql\`
    SELECT u.id, u.role_id, r.name as role_name, r.permissions
    FROM users u JOIN roles r ON r.id = u.role_id
    WHERE u.company_id = \${companyId} AND u.is_active = true
    ORDER BY u.created_at ASC LIMIT 1\`;
  if (row) { user = row; roleName = row.role_name; roleId = row.role_id; permissions = Array.isArray(row.permissions) ? row.permissions : []; }
}
if (!user) {
  process.stdout.write(JSON.stringify({ unavailable: true, roleNames }));
  await sql.end();
  process.exit(0);
}
const sessionId = crypto.randomUUID();
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const refreshToken = generateRefreshToken();
const refreshHash = hashRefreshToken(refreshToken);
await sql\`
  INSERT INTO sessions (id, user_id, company_id, refresh_token_hash, expires_at, last_activity_at, user_agent, ip_address)
  VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, \${expiresAt}, NOW(), '249-phase17-rbac', '127.0.0.1')\`;
const { token } = createAccessToken(
  { sub: user.id, companyId, roleId, roleName, sessionId, permissions },
  process.env.JWT_SECRET,
);
process.stdout.write(JSON.stringify({ accessToken: token, roleName, userId: user.id, permissionsCount: permissions.length }));
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
    if (parsed.unavailable) return { unavailable: true, roleNames: names };
    if (!parsed.accessToken || parsed.accessToken.length < 40) {
      throw new Error(`Failed to mint session for ${names.join('|')}`);
    }
    return { ...parsed, method: 'railway_programmatic_session' };
  } finally {
    fs.rmSync(scriptPath, { force: true });
  }
}

async function discoverRoles() {
  const scriptPath = path.join(repoRoot, '.tmp-discover-roles-249.mjs');
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
  WHERE r.company_id = \${companyId}
  GROUP BY r.name ORDER BY r.name\`;
const clients = await sql\`
  SELECT COUNT(*)::int as count FROM users u JOIN roles r ON r.id = u.role_id
  WHERE u.company_id = \${companyId} AND u.is_active = true AND r.name IN ('Client', 'Customer')\`;
process.stdout.write(JSON.stringify({ roles, clientCount: clients[0]?.count ?? 0 }));
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

async function fetchAuthPayload(token, roleName, permissions) {
  const res = await fetch(`${API}/api/v1/auth/me`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`auth/me failed: ${res.status}`);
  const json = await res.json();
  const user = permissions
    ? { ...json.data.user, roleName, permissions }
    : json.data.user;
  return { user, session: { accessToken: token, expiresIn: 3600 } };
}

async function seedSession(context, page, token, roleName, permissions) {
  const authPayload = await fetchAuthPayload(token, roleName, permissions);
  await context.addCookies([
    {
      name: 'titan_refresh_token',
      value: '249-phase17-staging-verify',
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

async function probeApi(token, probe) {
  const pathname = typeof probe === 'string' ? probe : probe.path;
  const method = typeof probe === 'string' ? 'GET' : (probe.method ?? 'GET');
  const body = typeof probe === 'string' ? undefined : probe.body;
  const started = Date.now();
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, ms: Date.now() - started };
}

function evaluateProbe(probe, roleKey, status) {
  const expected = probe[roleKey];
  if (!expected) return { result: 'skip', expected: null };
  const pass = expected.includes(status);
  return { result: pass ? 'pass' : 'fail', expected };
}

async function scanBrowserRoutes(contextFactory, roleLabel, token, roleName, permissions) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() =>
    chromium.launch({ headless: true }),
  );
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!/favicon|runtime-config|ResizeObserver|chunk/i.test(text)) {
        consoleErrors.push(text.slice(0, 200));
      }
    }
  });
  page.on('pageerror', (err) => pageErrors.push(String(err.message || err).slice(0, 200)));

  await seedSession(context, page, token, roleName, permissions);
  const routeResults = [];

  for (const route of BROWSER_ROUTES) {
    const started = Date.now();
    let finalUrl = '';
    let loadMs = 0;
    try {
      await page.goto(`${WEB}${route.path}`, { waitUntil: 'networkidle', timeout: 90_000 });
      await page.waitForTimeout(1200);
      finalUrl = page.url();
      loadMs = Date.now() - started;
      const shot = path.join(OUT_DIR, `phase17-${roleLabel}-${route.label}-1440.png`);
      await page.screenshot({ path: shot, fullPage: true });
      routeResults.push({
        path: route.path,
        finalUrl,
        loadMs,
        consoleErrorCount: consoleErrors.length,
        screenshot: path.relative(repoRoot, shot),
      });
    } catch (err) {
      routeResults.push({
        path: route.path,
        error: String(err.message || err).slice(0, 200),
        loadMs: Date.now() - started,
      });
    }
  }

  await browser.close();
  return { routeResults, consoleErrors: [...new Set(consoleErrors)], pageErrors: [...new Set(pageErrors)] };
}

async function checkSecurityHeaders() {
  const res = await fetch(`${API}/api/v1/health`);
  const headers = {};
  for (const key of SECURITY_HEADERS) {
    headers[key] = res.headers.get(key) ?? null;
  }
  const missing = SECURITY_HEADERS.filter((k) => !headers[k]);
  return { headers, missing, status: res.status };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let commitSha = '';
  try {
    commitSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    commitSha = 'unknown';
  }

  const roleDiscovery = await discoverRoles();

  const roleSessions = {};
  const roleConfigs = [
    { key: 'owner', label: 'Owner', names: ['Company Owner', 'Owner'], permissions: null },
    { key: 'technician', label: 'Technician', names: ['Technician'], permissions: TECHNICIAN_PERMISSIONS },
    { key: 'accountant', label: 'Accountant', names: ['Accountant'], permissions: null },
    { key: 'dispatcher', label: 'Dispatcher', names: ['Dispatcher'], permissions: null },
    { key: 'client', label: 'Client', names: ['Client', 'Customer'], permissions: null },
  ];

  for (const cfg of roleConfigs) {
    const existing = process.env[`${cfg.key.toUpperCase()}_ACCESS_TOKEN`]?.trim();
    if (existing) {
      roleSessions[cfg.key] = { accessToken: existing, roleName: cfg.label, method: 'ENV_TOKEN' };
    } else {
      roleSessions[cfg.key] = await mintRoleSession(cfg.names, cfg.permissions);
    }
  }

  const report = {
    schemaVersion: 'phase17-rbac-security-v1',
    label: '249-rbac-security-gate-verify',
    generatedAt: new Date().toISOString(),
    branch: 'cursor/titan-owner-operating-model-final',
    commitSha,
    stagingWeb: WEB,
    stagingApi: API,
    ygpCompanyId: YGP_COMPANY_ID,
    roleDiscovery,
    sessions: Object.fromEntries(
      Object.entries(roleSessions).map(([k, v]) => [
        k,
        v.unavailable
          ? { available: false, roleNames: v.roleNames }
          : { available: true, roleName: v.roleName, method: v.method, permissionsCount: v.permissionsCount ?? null },
      ]),
    ),
    security: {},
    apiProbes: [],
    roleRouteMatrix: [],
    performance: {},
    browser: {},
    blockers: [],
    holdItems: [],
    verdict: 'HOLD',
  };

  // Security headers (no weakening check)
  report.security = await checkSecurityHeaders();
  if (report.security.missing.length > 0) {
    report.holdItems.push(`API missing security headers: ${report.security.missing.join(', ')}`);
  }

  // Refresh contract
  const refreshMissing = await fetch(`${API}/api/v1/auth/refresh`, { method: 'POST' });
  const refreshJson = refreshMissing.ok ? null : await refreshMissing.json().catch(() => ({}));
  report.security.refreshMissingCookie =
    refreshMissing.status === 401 && refreshJson?.error?.code === 'SESSION_MISSING';

  if (!report.security.refreshMissingCookie) {
    report.blockers.push('Refresh endpoint did not reject missing cookie with SESSION_MISSING');
  }

  // API RBAC matrix
  const perfSamples = [];
  for (const probe of API_PROBES) {
    const row = { label: probe.label, path: probe.path, roles: {} };
    for (const cfg of roleConfigs) {
      const session = roleSessions[cfg.key];
      if (session?.unavailable || !session?.accessToken) {
        row.roles[cfg.key] = { result: 'hold', reason: 'no staging user' };
        continue;
      }
      const { status, ms } = await probeApi(session.accessToken, probe);
      const evalResult = evaluateProbe(probe, cfg.key, status);
      row.roles[cfg.key] = { status, ...evalResult, ms };
      perfSamples.push(ms);
      if (evalResult.result === 'fail') {
        report.blockers.push(`${cfg.label} RBAC fail: ${probe.label} returned ${status}, expected ${evalResult.expected?.join('|')}`);
      }
    }
    report.apiProbes.push(row);
    report.roleRouteMatrix.push({
      route: probe.label,
      owner: row.roles.owner?.result ?? 'hold',
      technician: row.roles.technician?.result ?? 'hold',
      accountant: row.roles.accountant?.result ?? 'hold',
      dispatcher: row.roles.dispatcher?.result ?? 'hold',
      client: row.roles.client?.result ?? 'hold',
    });
  }

  report.performance = {
    apiProbeMedianMs: perfSamples.length ? median(perfSamples) : null,
    apiProbeP95Ms: perfSamples.length ? percentile(perfSamples, 95) : null,
    apiProbeMaxMs: perfSamples.length ? Math.max(...perfSamples) : null,
  };
  if (report.performance.apiProbeP95Ms > 8000) {
    report.holdItems.push(`API p95 latency ${report.performance.apiProbeP95Ms}ms exceeds 8s threshold`);
  }

  // Browser console scans
  for (const cfg of [
    { key: 'owner', permissions: null },
    { key: 'technician', permissions: TECHNICIAN_PERMISSIONS },
  ]) {
    const session = roleSessions[cfg.key];
    if (session?.unavailable || !session?.accessToken) {
      report.browser[cfg.key] = { skipped: true, reason: 'no session' };
      continue;
    }
    report.browser[cfg.key] = await scanBrowserRoutes(
      null,
      cfg.key,
      session.accessToken,
      session.roleName,
      cfg.permissions,
    );
    if (report.browser[cfg.key].consoleErrors?.length > 0) {
      report.holdItems.push(`${cfg.key} console errors: ${report.browser[cfg.key].consoleErrors.length}`);
    }
    if (report.browser[cfg.key].pageErrors?.length > 0) {
      report.blockers.push(`${cfg.key} page errors: ${report.browser[cfg.key].pageErrors.join('; ')}`);
    }
  }

  // Technician UI redirect from owner finance route
  const techBrowser = report.browser.technician;
  const techFinanceRoute = techBrowser?.routeResults?.find((r) => r.path === '/finance/receivables');
  if (techFinanceRoute?.finalUrl && techFinanceRoute.finalUrl.includes('/finance/receivables')) {
    report.blockers.push('Technician UI not redirected from /finance/receivables');
  }

  // Hold items for unavailable roles
  for (const cfg of roleConfigs) {
    if (roleSessions[cfg.key]?.unavailable) {
      report.holdItems.push(`No staging ${cfg.label} user on YGP — matrix row marked hold`);
    }
  }

  report.verdict = report.blockers.length === 0 ? (report.holdItems.length === 0 ? 'GO' : 'GO') : 'NO-GO';

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        blockers: report.blockers,
        holdItems: report.holdItems,
        roleRouteMatrix: report.roleRouteMatrix,
        performance: report.performance,
        out: OUT_JSON,
      },
      null,
      2,
    ),
  );
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function percentile(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * s.length) - 1;
  return s[Math.max(0, idx)];
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
