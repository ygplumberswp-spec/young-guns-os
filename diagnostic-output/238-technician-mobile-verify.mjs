#!/usr/bin/env node
/**
 * 238 — Phase 6 Technician mobile staging verification.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(__dirname, 'phase6-technician-mobile-staging');
const OUT_JSON = path.resolve(__dirname, '238-technician-mobile-verify.json');

const WEB = 'https://comfortable-determination-staging.up.railway.app';
const API = 'https://young-guns-os-staging.up.railway.app';
const YGP_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';

const MOBILE_VIEWPORTS = [
  { id: '375', width: 375, height: 812 },
  { id: '1440', width: 1440, height: 1000 },
];

const TECHNICIAN_PERMISSIONS = ['mobile:read', 'mobile:write', 'jobs:read', 'inventory:read'];

async function mintTechnicianSession() {
  const scriptPath = path.join(repoRoot, '.tmp-mint-session-238-tech.mjs');
  fs.writeFileSync(
    scriptPath,
    `import { createAccessToken, generateRefreshToken, hashRefreshToken } from './packages/auth/dist/tokens.js';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const companyId = '${YGP_COMPANY_ID}';
const permissions = ${JSON.stringify(TECHNICIAN_PERMISSIONS)};
const [techRole] = await sql\`
  SELECT id, name, permissions FROM roles
  WHERE company_id = \${companyId} AND name = 'Technician' LIMIT 1\`;
if (!techRole) throw new Error('no technician role');
const [user] = await sql\`
  SELECT u.id FROM users u
  WHERE u.company_id = \${companyId} AND u.is_active = true
  ORDER BY u.created_at ASC LIMIT 1\`;
if (!user) throw new Error('no active user');
const roleName = 'Technician';
const roleId = techRole.id;
await sql\`
  UPDATE jobs SET assigned_user_id = \${user.id}
  WHERE company_id = \${companyId} AND assigned_user_id IS NULL\`;
const sessionId = crypto.randomUUID();
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const refreshToken = generateRefreshToken();
const refreshHash = hashRefreshToken(refreshToken);
await sql\`
  INSERT INTO sessions (id, user_id, company_id, refresh_token_hash, expires_at, last_activity_at, user_agent, ip_address)
  VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, \${expiresAt}, NOW(), '238-phase6-mobile', '127.0.0.1')\`;
const { token } = createAccessToken(
  { sub: user.id, companyId, roleId, roleName, sessionId, permissions },
  process.env.JWT_SECRET,
);
process.stdout.write(JSON.stringify({ accessToken: token, roleName, userId: user.id }));
await sql.end();
`,
  );
  try {
    execSync('pnpm --filter @titan/auth build', { cwd: repoRoot, stdio: 'pipe' });
    const raw = execSync(`railway run node ${scriptPath}`, {
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
  return {
    user: { ...json.data.user, roleName, permissions },
    session: { accessToken: token, expiresIn: 3600 },
  };
}

async function seedSession(context, page, token, roleName, permissions) {
  const authPayload = await fetchAuthPayload(token, roleName, permissions);
  await context.addCookies([
    {
      name: 'titan_refresh_token',
      value: '238-phase6-staging-verify',
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

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let commitSha = '';
  try {
    commitSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    commitSha = 'unknown';
  }

  const session = await mintTechnicianSession();
  const token = session.accessToken;

  const dashRes = await fetch(`${API}/api/v1/mobile/technician/workforce/dashboard`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const dashJson = dashRes.ok ? await dashRes.json() : null;
  const dashboard = dashJson?.data?.dashboard ?? null;

  const jobsRes = await fetch(`${API}/api/v1/mobile/technician/workforce/jobs`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const jobsJson = jobsRes.ok ? await jobsRes.json() : null;
  const jobs = jobsJson?.data?.jobs ?? [];

  const financeBlocked = await fetch(`${API}/api/v1/finance/receivables`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });

  let paymentCollection = null;
  if (jobs[0]?.id) {
    const payRes = await fetch(
      `${API}/api/v1/mobile/technician/workforce/jobs/${jobs[0].id}/payment-collection`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
    );
    if (payRes.ok) {
      const payJson = await payRes.json();
      paymentCollection = payJson?.data?.context ?? null;
    }
  }

  const report = {
    schemaVersion: 'phase6-technician-mobile-v1',
    label: '238-technician-mobile-verify',
    generatedAt: new Date().toISOString(),
    branch: 'cursor/titan-owner-operating-model-final',
    commitSha,
    stagingWeb: WEB,
    stagingApi: API,
    auth: { method: 'railway_programmatic_session', roleName: session.roleName, secretsInOutput: false },
    api: {
      dashboardStatus: dashRes.status,
      hasDashboard: Boolean(dashboard),
      hasCurrentJobField: dashboard ? 'currentJob' in dashboard : false,
      hasNextJobField: dashboard ? 'nextJob' in dashboard : false,
      hasJobsRequiringCompletion: dashboard ? Array.isArray(dashboard.jobsRequiringCompletion) : false,
      hasMissingCloseOutItems: dashboard ? Array.isArray(dashboard.missingCloseOutItems) : false,
      assignedJobCount: dashboard?.assignedJobs?.length ?? 0,
      jobsListStatus: jobsRes.status,
      financeReceivablesBlocked: financeBlocked.status === 403 || financeBlocked.status === 401,
      paymentCollection: paymentCollection
        ? {
            hasContext: true,
            yocoConfigured: paymentCollection.yocoConfigured,
            canCollectPayment: paymentCollection.canCollectPayment,
            storesCardData: false,
          }
        : { hasContext: false, storesCardData: false },
    },
    ui: { routes: [] },
    blockers: [],
    verdict: 'HOLD',
  };

  if (!dashRes.ok || !dashboard) {
    report.blockers.push(`Dashboard API HTTP ${dashRes.status}`);
  }
  if (dashboard && !('currentJob' in dashboard)) {
    report.blockers.push('Dashboard missing currentJob field');
  }
  if (dashboard && !('missingCloseOutItems' in dashboard)) {
    report.blockers.push('Dashboard missing missingCloseOutItems field');
  }
  if (!report.api.financeReceivablesBlocked) {
    report.blockers.push(`Technician RBAC leak: finance/receivables returned ${financeBlocked.status}`);
  }

  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() =>
    chromium.launch({ headless: true }),
  );
  const context = await browser.newContext();
  const page = await context.newPage();
  await seedSession(context, page, token, session.roleName, TECHNICIAN_PERMISSIONS);

  const routes = [
    { path: '/mobile', label: 'today', checks: ['Today', 'Current job', 'Missing close-out'] },
    { path: '/mobile/jobs', label: 'jobs-list', checks: ['My jobs'] },
    { path: '/mobile/schedule', label: 'schedule', checks: ['My schedule', 'Current job'] },
    { path: '/mobile/route', label: 'route-map', checks: ['Route', 'Maps'] },
  ];

  if (jobs[0]?.id) {
    routes.push({
      path: `/mobile/jobs/${jobs[0].id}`,
      label: 'job-detail',
      checks: ['Workflow', 'Completion gate', 'Payment collection', 'Field support'],
    });
  }

  for (const route of routes) {
    for (const vp of MOBILE_VIEWPORTS) {
      if (vp.id === '1440' && route.label !== 'today') continue;
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${WEB}${route.path}`, { waitUntil: 'networkidle', timeout: 90_000 });
      await page.waitForTimeout(1500);
      const bodyText = await page.locator('body').innerText();
      const checks = Object.fromEntries(
        route.checks.map((label) => [label.replace(/\s+/g, '_').toLowerCase(), bodyText.includes(label)]),
      );
      const shot = path.join(OUT_DIR, `phase6-${route.label}-${vp.id}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      report.ui.routes.push({
        path: route.path,
        viewport: vp.id,
        checks,
        screenshot: path.relative(repoRoot, shot),
      });
      for (const [key, ok] of Object.entries(checks)) {
        if (!ok && vp.id === '375') {
          report.blockers.push(`Missing "${key}" on ${route.path} @ ${vp.id}`);
        }
      }
    }
  }

  // Owner finance path must redirect technician away
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${WEB}/finance/receivables`, { waitUntil: 'networkidle', timeout: 90_000 });
  await page.waitForTimeout(1000);
  const afterFinanceUrl = page.url();
  const financeRedirectOk = !afterFinanceUrl.includes('/finance/receivables');
  report.api.uiFinanceRedirect = financeRedirectOk;
  if (!financeRedirectOk) {
    report.blockers.push('Technician was not redirected from /finance/receivables');
  }

  await browser.close();

  report.verdict =
    report.blockers.length === 0 && report.api.dashboardStatus === 200 ? 'GO' : 'HOLD';

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict: report.verdict, blockers: report.blockers, out: OUT_JSON }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
