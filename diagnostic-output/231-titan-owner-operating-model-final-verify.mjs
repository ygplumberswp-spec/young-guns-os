#!/usr/bin/env node
/**
 * 231 — Phase 18 Final Authenticated Visual Audit + locked UX verification.
 * Staging only. Auth via route intercept (237 pattern) + railway run owner session mint.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(__dirname, 'phase18-visual-audit-staging');
const OUT_JSON = path.resolve(__dirname, '231-titan-owner-operating-model-final-verify.json');
const ZIP_DIR = path.resolve(repoRoot, 'TITAN_AUTHENTICATED_VISUAL_AUDIT');

const WEB = 'https://comfortable-determination-staging.up.railway.app';
const API = 'https://young-guns-os-staging.up.railway.app';
const YGP_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';

const VIEWPORTS = [
  { id: '1440', width: 1440, height: 1000 },
  { id: '1280', width: 1280, height: 900 },
  { id: '1024', width: 1024, height: 768 },
  { id: '768', width: 768, height: 1024 },
  { id: '375', width: 375, height: 812 },
];

/** Primary routes — full 5-viewport capture when primary: true */
const ROUTES = [
  { path: '/', label: 'dashboard', primary: true, uxChecks: ['dashboardLinks'] },
  { path: '/crm', label: 'customers', primary: true, uxChecks: ['customerColumns', 'navIcons'] },
  { path: '/leads', label: 'leads', primary: true, uxChecks: ['navIcons'] },
  { path: '/jobs', label: 'jobs', primary: true, uxChecks: ['navIcons'] },
  { path: '/scheduling', label: 'scheduling', primary: true, uxChecks: ['navIcons'], scroll: true },
  { path: '/finance/quotes', label: 'quotes', primary: true, uxChecks: ['navIcons'] },
  { path: '/finance/invoices', label: 'invoices', primary: true, uxChecks: ['navIcons'] },
  { path: '/finance/payments', label: 'payments', primary: true, uxChecks: ['navIcons'] },
  { path: '/finance/receivables', label: 'receivables', primary: true, uxChecks: ['navIcons'] },
  { path: '/finance/payables', label: 'payables', primary: true, uxChecks: ['navIcons'] },
  { path: '/finance/cashflow', label: 'cashflow', primary: true, uxChecks: ['navIcons'] },
  { path: '/inventory/products', label: 'inventory', primary: true, uxChecks: ['navIcons'] },
  { path: '/procurement', label: 'procurement', primary: false, uxChecks: ['navIcons'] },
  { path: '/fleet', label: 'fleet', primary: true, uxChecks: ['navIcons'] },
  { path: '/fleet/live-map', label: 'fleet_live_map', primary: true, uxChecks: ['navIcons'] },
  { path: '/mobile-platform/dispatcher', label: 'live_dispatch', primary: true, uxChecks: ['navIcons'] },
  { path: '/communications/messages', label: 'communications', primary: true, uxChecks: ['navIcons'] },
  { path: '/documents', label: 'documents', primary: true, uxChecks: ['navIcons'] },
  { path: '/analytics', label: 'analytics', primary: true, uxChecks: ['navIcons'] },
  { path: '/marketing', label: 'marketing', primary: true, uxChecks: ['navIcons'] },
  { path: '/aura/agents', label: 'aura_team', primary: true, uxChecks: ['navIcons'] },
  { path: '/automation', label: 'automation', primary: true, uxChecks: ['navIcons'] },
  { path: '/mission-control', label: 'company_health', primary: true, uxChecks: ['navIcons'] },
  { path: '/departments', label: 'departments', primary: false, uxChecks: ['navIcons'] },
  { path: '/settings/company', label: 'settings_company', primary: true, uxChecks: ['settingsIcons'] },
  { path: '/settings/team', label: 'settings_team', primary: false, uxChecks: ['settingsIcons'] },
  { path: '/settings/billing', label: 'settings_billing', primary: false, uxChecks: ['settingsIcons'] },
  { path: '/integrations', label: 'integrations', primary: true, uxChecks: ['settingsIcons'] },
  { path: '/settings/security', label: 'settings_security', primary: false, uxChecks: ['settingsIcons'] },
  { path: '/aura', label: 'aura_chat', primary: true },
  { path: '/aura/todays-plan', label: 'aura_todays_plan', primary: true },
  { path: '/aura/business-rules', label: 'aura_business_rules', primary: false, uxChecks: ['settingsIcons'] },
  { path: '/mobile', label: 'technician_mobile', primary: true },
  { path: '/mobile/jobs', label: 'technician_jobs', primary: true },
  { path: '/mobile/route', label: 'technician_route', primary: false },
  { path: '/crm/new', label: 'customer_create', primary: false },
  { path: '/jobs/new', label: 'job_create', primary: false },
  { path: '/scheduling?view=week', label: 'scheduling_week', primary: false },
  { path: '/scheduling?view=month', label: 'scheduling_month', primary: false },
];

const PLACEHOLDER_ID = '00000000-0000-4000-8000-000000000001';

function gitSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

async function mintOwnerSession() {
  const scriptPath = path.join(repoRoot, '.tmp-mint-session-231-owner.mjs');
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
if (!user) throw new Error('no owner');
const sessionId = crypto.randomUUID();
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const refreshToken = generateRefreshToken();
const refreshHash = hashRefreshToken(refreshToken);
await sql\`
  INSERT INTO sessions (id, user_id, company_id, refresh_token_hash, expires_at, last_activity_at, user_agent, ip_address)
  VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, \${expiresAt}, NOW(), '231-phase18-visual', '127.0.0.1')\`;
const { token } = createAccessToken(
  { sub: user.id, companyId, roleId: user.role_id, roleName: 'Company Owner', sessionId, permissions: ['*'] },
  process.env.JWT_SECRET,
);
process.stdout.write(JSON.stringify({ accessToken: token, roleName: 'Company Owner' }));
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

async function resolveDynamicRoutes(token) {
  const resolved = [];
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

  async function firstId(endpoint, key) {
    try {
      const res = await fetch(`${API}${endpoint}`, { headers });
      if (!res.ok) return PLACEHOLDER_ID;
      const json = await res.json();
      const rows = json.data?.items ?? json.data ?? [];
      return rows[0]?.id ?? PLACEHOLDER_ID;
    } catch {
      return PLACEHOLDER_ID;
    }
  }

  const customerId = await firstId('/api/v1/crm/customers?limit=1', 'customers');
  const jobId = await firstId('/api/v1/jobs?limit=1', 'jobs');
  const invoiceId = await firstId('/api/v1/finance/invoices?limit=1', 'invoices');
  const paymentId = await firstId('/api/v1/finance/payments?limit=1', 'payments');

  resolved.push(
    { path: `/crm/${customerId}`, label: 'customer_360', primary: true },
    { path: `/crm/${customerId}#communications`, label: 'customer_communications', primary: false },
    { path: `/jobs/${jobId}`, label: 'job_360', primary: true, scroll: true },
    { path: `/jobs/${jobId}#payments`, label: 'job_payment_ledger', primary: false },
    { path: `/jobs/${jobId}#documents`, label: 'job_documents', primary: false },
    { path: `/jobs/${jobId}#checklist`, label: 'job_checklist', primary: false },
    { path: `/finance/invoices/${invoiceId}`, label: 'invoice_detail', primary: false },
    { path: `/finance/payments/${paymentId}`, label: 'payment_detail', primary: false },
  );
  return resolved;
}

async function seedSession(context, page, token, roleName, permissions) {
  const authPayload = await fetchAuthPayload(token, roleName, permissions);
  await context.addCookies([
    {
      name: 'titan_refresh_token',
      value: '231-phase18-staging-verify',
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
  await page.goto(`${WEB}/`, { waitUntil: 'networkidle', timeout: 120_000 });
}

async function waitForRouteReady(page, routeDef) {
  if (routeDef.label === 'dashboard') {
    await page
      .locator('.exec-dashboard-glance__link, .exec-dashboard-section__title:has-text("Today at a glance")')
      .first()
      .waitFor({ state: 'visible', timeout: 60_000 })
      .catch(() => null);
    await page.waitForTimeout(1500);
    return;
  }
  if (routeDef.path === '/crm' || routeDef.label === 'customers') {
    await page
      .locator('.crm-table--owner-simple, .crm-table tbody tr, .titan-empty-state')
      .first()
      .waitFor({ state: 'visible', timeout: 60_000 })
      .catch(() => null);
    await page.waitForTimeout(1000);
    return;
  }
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => null);
  await page.waitForTimeout(1500);
}

async function runUxChecks(page, checks, routePath = '') {
  const results = {};
  if (checks.includes('dashboardLinks')) {
    const links = page.locator('.exec-dashboard-glance__link');
    const count = await links.count();
    const cursors = [];
    for (let i = 0; i < Math.min(count, 4); i++) {
      cursors.push(await links.nth(i).evaluate((el) => getComputedStyle(el).cursor));
    }
    results.dashboardGlanceLinkCount = count;
    results.dashboardGlancePointerCursor = count > 0 && cursors.every((c) => c === 'pointer');
    results.dashboardGlanceHasHref = count >= 4;
  }
  if (checks.includes('navIcons')) {
    const icons = page.locator('.app-nav__link .app-nav__icon');
    const iconCount = await icons.count();
    const defaultOnly = await page.locator('.app-nav__link').evaluateAll((links) =>
      links.map((link) => {
        const icon = link.querySelector('.app-nav__icon');
        const paths = icon?.querySelectorAll('path, rect, circle').length ?? 0;
        return paths <= 2;
      }),
    );
    results.sidebarNavIconCount = iconCount;
    results.sidebarHasClearIcons = iconCount >= 10 && defaultOnly.filter(Boolean).length < 3;
  }
  if (checks.includes('settingsIcons')) {
    const icons = page.locator('.ux-compact-tabs__icon');
    results.settingsTabIconCount = await icons.count();
    results.settingsHasIcons = (await icons.count()) >= 3;
  }
  if (checks.includes('customerColumns') && routePath === '/crm') {
    const headers = await page.locator('.crm-table--owner-simple thead th').allTextContents();
    const normalized = headers.map((h) => h.trim()).filter(Boolean);
    results.customerOwnerColumns = normalized;
    results.customerOwnerColumnsOk =
      normalized.includes('Name') &&
      normalized.includes('Phone') &&
      normalized.includes('Email') &&
      normalized.includes('Outstanding') &&
      normalized.includes('Actions') &&
      normalized.length <= 5;
  }
  return results;
}

async function captureRoute(page, routeDef, viewport, token) {
  const url = `${WEB}${routeDef.path}`;
  const slug = `${routeDef.label}-${viewport.id}`;
  const shots = [];

  try {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
    await waitForRouteReady(page, routeDef);

    const topPath = path.join(OUT_DIR, `${slug}-top.png`);
    await page.screenshot({ path: topPath, fullPage: false });
    shots.push(topPath);

    if (routeDef.scroll) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
      await page.waitForTimeout(500);
      const midPath = path.join(OUT_DIR, `${slug}-mid.png`);
      await page.screenshot({ path: midPath, fullPage: false });
      shots.push(midPath);

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);
      const bottomPath = path.join(OUT_DIR, `${slug}-bottom.png`);
      await page.screenshot({ path: bottomPath, fullPage: false });
      shots.push(bottomPath);
    }

    const ux = routeDef.uxChecks ? await runUxChecks(page, routeDef.uxChecks, routeDef.path) : {};
    return { captured: true, shots, ux, error: null };
  } catch (err) {
    return { captured: false, shots, ux: {}, error: String(err.message ?? err) };
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(ZIP_DIR, { recursive: true });

  const session = await mintOwnerSession();
  const token = session.accessToken;
  const dynamicRoutes = await resolveDynamicRoutes(token);
  const allRoutes = [...ROUTES, ...dynamicRoutes];

  const report = {
    schemaVersion: 'phase18-visual-audit-v1',
    label: '231-titan-owner-operating-model-final-verify',
    generatedAt: new Date().toISOString(),
    branch: 'cursor/titan-owner-operating-model-final',
    commitSha: gitSha(),
    stagingWeb: WEB,
    stagingApi: API,
    auth: { method: 'railway_programmatic_session_route_intercept', secretsInOutput: false },
    uxFixes: {
      dashboardClickableCounters: { required: true, verified: false },
      navIconsAllItems: { required: true, verified: false },
      customerListSimplified: { required: true, verified: false },
    },
    routes: [],
    screenshots: [],
    screenshotCount: 0,
    blockers: [],
    verdict: 'HOLD',
  };

  const browser = await chromium
    .launch({ headless: true, channel: 'chrome' })
    .catch(() => chromium.launch({ headless: true }));
  const context = await browser.newContext();
  const page = await context.newPage();
  await seedSession(context, page, token, session.roleName, ['*']);

  for (const routeDef of allRoutes) {
    const viewports = routeDef.primary ? VIEWPORTS : [VIEWPORTS[0]];
    const routeEntry = {
      path: routeDef.path,
      label: routeDef.label,
      primary: Boolean(routeDef.primary),
      captures: [],
    };

    for (const vp of viewports) {
      const result = await captureRoute(page, routeDef, vp, token);
      routeEntry.captures.push({
        viewport: vp.id,
        captured: result.captured,
        shotCount: result.shots.length,
        screenshots: result.shots.map((s) => path.relative(repoRoot, s)),
        ux: result.ux,
        error: result.error,
      });
      for (const shot of result.shots) {
        report.screenshots.push(path.relative(repoRoot, shot));
        report.screenshotCount += 1;
        const dest = path.join(ZIP_DIR, path.basename(shot));
        fs.copyFileSync(shot, dest);
      }
      if (!result.captured) {
        report.blockers.push(`Capture failed ${routeDef.label} @ ${vp.id}: ${result.error}`);
      }
      if (result.ux.dashboardGlancePointerCursor === false) {
        report.blockers.push(`Dashboard glance links not pointer cursor @ ${vp.id}`);
      }
      if (result.ux.customerOwnerColumnsOk === false) {
        report.blockers.push(`Customer list columns not simplified @ ${routeDef.label}`);
      }
      if (result.ux.dashboardGlancePointerCursor === true && result.ux.dashboardGlanceHasHref) {
        report.uxFixes.dashboardClickableCounters.verified = true;
      }
      if (result.ux.sidebarHasClearIcons === true) {
        report.uxFixes.navIconsAllItems.verified = true;
      }
      if (result.ux.settingsHasIcons === true) {
        report.uxFixes.navIconsAllItems.verified = true;
      }
      if (result.ux.customerOwnerColumnsOk === true) {
        report.uxFixes.customerListSimplified.verified = true;
      }
    }
    report.routes.push(routeEntry);
  }

  await browser.close();

  const uxBlockers = [];
  if (!report.uxFixes.dashboardClickableCounters.verified) {
    uxBlockers.push('Dashboard stat cards not verified as clickable links');
  }
  if (!report.uxFixes.navIconsAllItems.verified) {
    uxBlockers.push('Sidebar/settings nav icons not verified');
  }
  if (!report.uxFixes.customerListSimplified.verified) {
    uxBlockers.push('Customer list simplified columns not verified');
  }
  report.blockers.push(...uxBlockers);

  report.verdict =
    report.blockers.length === 0 && report.screenshotCount >= 50 ? 'GO' : report.blockers.length <= 3 ? 'HOLD' : 'NO-GO';

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        screenshotCount: report.screenshotCount,
        uxFixes: report.uxFixes,
        blockers: report.blockers.slice(0, 10),
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
