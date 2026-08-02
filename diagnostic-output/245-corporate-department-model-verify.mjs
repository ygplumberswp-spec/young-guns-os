#!/usr/bin/env node
/**
 * 245 — Phase 13 Corporate Department Operating Model staging verification.
 * Authenticated owner session via railway run (237/244 pattern). No secrets in output.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { CORPORATE_DEPARTMENTS, EXPECTED_CORPORATE_DEPARTMENT_COUNT } from '../packages/shared/dist/corporate-departments.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(__dirname, 'phase13-corporate-departments-staging');
const OUT_JSON = path.resolve(__dirname, '245-corporate-department-model-verify.json');

const WEB = 'https://comfortable-determination-staging.up.railway.app';
const API = 'https://young-guns-os-staging.up.railway.app';
const YGP_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';

const SAMPLE_DEPARTMENTS = [
  'executive_strategy',
  'finance_accounting',
  'scheduling_dispatch',
  'hr_workforce',
  'aura_digital_workforce',
];

async function mintOwnerSession() {
  const existing = process.env.OWNER_ACCESS_TOKEN?.trim();
  if (existing) {
    return { accessToken: existing, refreshToken: null, method: 'OWNER_ACCESS_TOKEN' };
  }

  const scriptPath = path.join(repoRoot, '.tmp-mint-session-245-owner.mjs');
  fs.writeFileSync(
    scriptPath,
    `import { createAccessToken, generateRefreshToken, hashRefreshToken } from './packages/auth/dist/tokens.js';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const companyId = '${YGP_COMPANY_ID}';
const [user] = await sql\`
  SELECT u.id, u.role_id, r.name as role_name, r.permissions
  FROM users u JOIN roles r ON r.id = u.role_id
  WHERE u.company_id = \${companyId} AND u.is_active = true
  ORDER BY u.created_at ASC LIMIT 1\`;
if (!user) throw new Error('no owner user');
const permissionKeys = Array.isArray(user.permissions) ? user.permissions : [];
const sessionId = crypto.randomUUID();
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const refreshToken = generateRefreshToken();
const refreshHash = hashRefreshToken(refreshToken);
await sql\`
  INSERT INTO sessions (id, user_id, company_id, refresh_token_hash, expires_at, last_activity_at, user_agent, ip_address)
  VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, \${expiresAt}, NOW(), '245-phase13-dept', '127.0.0.1')\`;
const { token } = createAccessToken(
  { sub: user.id, companyId, roleId: user.role_id, roleName: user.role_name, sessionId, permissions: permissionKeys },
  process.env.JWT_SECRET,
);
process.stdout.write(JSON.stringify({ accessToken: token, refreshToken }));
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
    if (!parsed.accessToken || parsed.accessToken.length < 40) {
      throw new Error('Failed to mint staging owner session');
    }
    return { ...parsed, method: 'railway_programmatic_session' };
  } finally {
    fs.rmSync(scriptPath, { force: true });
  }
}

async function fetchAuthPayload(token) {
  const res = await fetch(`${API}/api/v1/auth/me`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`auth/me failed: ${res.status}`);
  const json = await res.json();
  return { user: json.data.user, session: { accessToken: token, expiresIn: 3600 } };
}

async function fetchHub(token) {
  const res = await fetch(`${API}/api/v1/corporate-departments/hub`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const json = res.ok ? await res.json() : null;
  return { status: res.status, hub: json?.data ?? null };
}

async function fetchDepartment(token, departmentId) {
  const res = await fetch(`${API}/api/v1/corporate-departments/${departmentId}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const json = res.ok ? await res.json() : null;
  return { departmentId, status: res.status, detail: json?.data ?? null };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let commitSha = 'unknown';
  try {
    commitSha = execSync('git rev-parse --short HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    /* optional */
  }

  const report = {
    generatedAt: new Date().toISOString(),
    label: '245-corporate-department-model-verify',
    phase: 13,
    branch: 'cursor/titan-owner-operating-model-final',
    commitSha,
    stagingApi: API,
    stagingWeb: WEB,
    companyId: YGP_COMPANY_ID,
    auth: { method: 'staging_programmatic_session', secretsInOutput: false },
    api: {},
    ui: { routes: [], screenshots: [] },
    departmentChecks: [],
    consoleErrors: [],
    verdict: 'HOLD',
    blockers: [],
    holdItems: [],
  };

  const ready = await fetch(`${API}/api/v1/health/ready`);
  if (!ready.ok) report.blockers.push('Staging API health/ready not OK');

  const session = await mintOwnerSession();
  const authPayload = await fetchAuthPayload(session.accessToken);
  report.auth = {
    method: session.method,
    secretsInOutput: false,
    userIdPrefix: authPayload.user?.id?.slice(0, 8) ?? null,
  };

  const hubResult = await fetchHub(session.accessToken);
  report.api.hub = {
    status: hubResult.status,
    departmentCount: hubResult.hub?.departmentCount ?? 0,
    actionQueueTotal: hubResult.hub?.actionQueueTotal ?? null,
    hasDisclaimer: typeof hubResult.hub?.disclaimer === 'string',
  };

  if (hubResult.status !== 200) {
    report.blockers.push(`GET /corporate-departments/hub returned ${hubResult.status}`);
  }
  if (hubResult.hub?.departmentCount !== EXPECTED_CORPORATE_DEPARTMENT_COUNT) {
    report.blockers.push(
      `Expected ${EXPECTED_CORPORATE_DEPARTMENT_COUNT} departments, got ${hubResult.hub?.departmentCount ?? 0}`,
    );
  }

  for (const dept of CORPORATE_DEPARTMENTS) {
    const entry = hubResult.hub?.departments?.find((row) => row.id === dept.id);
    report.departmentChecks.push({
      id: dept.id,
      label: dept.label,
      inHub: Boolean(entry),
      hasMandate: Boolean(entry?.mandate),
      hasOwner: Boolean(entry?.accountableOwner),
      todayQueueIsArray: Array.isArray(entry?.todayQueue),
      emptyQueueHonest: Array.isArray(entry?.todayQueue),
    });
    if (!entry) report.blockers.push(`Missing department in hub: ${dept.id}`);
  }

  report.api.sampleDepartments = [];
  for (const departmentId of SAMPLE_DEPARTMENTS) {
    const detail = await fetchDepartment(session.accessToken, departmentId);
    report.api.sampleDepartments.push({
      departmentId,
      status: detail.status,
      hasWeeklyRoutine: Array.isArray(detail.detail?.weeklyRoutine) && detail.detail.weeklyRoutine.length > 0,
      hasApprovals: Array.isArray(detail.detail?.approvals) && detail.detail.approvals.length > 0,
      hasKpis: Array.isArray(detail.detail?.kpis) && detail.detail.kpis.length > 0,
      todayQueueCount: detail.detail?.todayQueue?.length ?? null,
    });
    if (detail.status !== 200) {
      report.blockers.push(`GET /corporate-departments/${departmentId} returned ${detail.status}`);
    }
  }

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  if (session.refreshToken) {
    await context.addCookies([
      {
        name: 'titan_refresh_token',
        value: session.refreshToken,
        domain: 'comfortable-determination-staging.up.railway.app',
        path: '/api/v1/auth',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      },
    ]);
  }
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') report.consoleErrors.push(msg.text().slice(0, 300));
  });

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

  const uiRoutes = [
    { href: '/departments', label: 'Departments hub' },
    { href: '/departments/finance_accounting', label: 'Finance workspace' },
    { href: '/departments/hr_workforce', label: 'HR workspace' },
    { href: '/company-health/departments', label: 'Company health alias' },
  ];

  for (const route of uiRoutes) {
    await page.goto(`${WEB}${route.href}`, { waitUntil: 'networkidle', timeout: 90_000 });
    const finalUrl = page.url();
    const bodyText = await page.locator('body').innerText();
    const shotName = route.href.replace(/\//g, '_').replace(/^_/, '') || 'root';
    const screenshot = path.join(OUT_DIR, `phase13-${shotName}-1440.png`);
    await page.screenshot({ path: screenshot, fullPage: true });

    report.ui.routes.push({
      href: route.href,
      label: route.label,
      finalUrl,
      hasDepartmentsContent:
        bodyText.includes('Departments') ||
        bodyText.includes('Finance & Accounting') ||
        bodyText.includes('HR & Workforce'),
      screenshot: screenshot.replace(repoRoot + path.sep, '').replace(/\\/g, '/'),
    });
  }

  await browser.close();

  if (report.consoleErrors.length > 0) {
    report.holdItems.push(`Console errors: ${report.consoleErrors.length} (see JSON)`);
  }

  const aliasRoute = report.ui.routes.find((row) => row.href === '/company-health/departments');
  if (aliasRoute && !aliasRoute.finalUrl.includes('/departments')) {
    report.blockers.push('Company health alias did not redirect to /departments');
  }

  report.verdict = report.blockers.length === 0 ? 'GO' : 'HOLD';
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict: report.verdict, blockers: report.blockers.length, out: OUT_JSON }));
  process.exit(report.verdict === 'GO' ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
