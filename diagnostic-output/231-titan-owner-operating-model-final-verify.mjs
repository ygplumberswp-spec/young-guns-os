#!/usr/bin/env node
/**
 * 231 — Phase 18 visual audit + Phase 18 correction pass verification.
 * Staging only. Auth via route intercept (237 pattern) + railway run owner session mint.
 * Re-mints access token before expiry during long capture runs (15m TTL).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(__dirname, 'phase18-visual-audit-staging');
const CORRECTION_DIR = path.resolve(__dirname, 'phase18-correction-staging');
const OUT_JSON = path.resolve(__dirname, '231-titan-owner-operating-model-final-verify.json');
const ZIP_DIR = path.resolve(repoRoot, 'TITAN_AUTHENTICATED_VISUAL_AUDIT');

const WEB = 'https://comfortable-determination-staging.up.railway.app';
const API = 'https://young-guns-os-staging.up.railway.app';
const YGP_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const SESSION_REFRESH_MS = 8 * 60 * 1000;
const CORRECTION_ONLY = process.argv.includes('--correction') || process.env.TITAN_231_CORRECTION === '1';

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

/** Routes re-captured in Phase 18 correction pass (session expiry, mobile, fleet, header). */
const CORRECTION_LABELS = new Set([
  'dashboard',
  'customers',
  'jobs',
  'scheduling',
  'fleet',
  'fleet_live_map',
  'technician_mobile',
  'technician_jobs',
  'technician_route',
  'aura_chat',
  'aura_todays_plan',
  'customer_360',
  'job_360',
]);

const CORRECTION_MOBILE_LABELS = new Set(['dashboard', 'customers', 'jobs', 'scheduling', 'fleet', 'fleet_live_map']);

const authSession = {
  token: null,
  roleName: 'Company Owner',
  permissions: ['*'],
  payload: null,
  mintedAt: 0,
};

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

async function refreshAuthSession(force = false) {
  if (!force && authSession.token && Date.now() - authSession.mintedAt < SESSION_REFRESH_MS) {
    return authSession;
  }
  const session = await mintOwnerSession();
  authSession.token = session.accessToken;
  authSession.roleName = session.roleName;
  authSession.payload = await fetchAuthPayload(session.accessToken, session.roleName, authSession.permissions);
  authSession.mintedAt = Date.now();
  return authSession;
}

async function installAuthRoutes(page) {
  await page.unroute('**/api/v1/auth/refresh').catch(() => {});
  await page.unroute('**/api/v1/auth/me').catch(() => {});
  await page.route('**/api/v1/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: authSession.payload }),
    });
  });
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { user: authSession.payload.user } }),
    });
  });
}

async function seedSession(context, page) {
  await refreshAuthSession(true);
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
  await installAuthRoutes(page);
  await page.goto(`${WEB}/`, { waitUntil: 'networkidle', timeout: 120_000 });
}

async function ensureFreshSession(page, routeDef) {
  const mobileRoute = routeDef.path.startsWith('/mobile');
  const lateRoute = ['aura_chat', 'aura_todays_plan', 'customer_360', 'job_360'].includes(routeDef.label);
  const shouldRefresh =
    mobileRoute ||
    lateRoute ||
    Date.now() - authSession.mintedAt >= SESSION_REFRESH_MS;
  if (!shouldRefresh) return authSession.token;
  await refreshAuthSession(true);
  await installAuthRoutes(page);
  await page.reload({ waitUntil: 'networkidle', timeout: 120_000 }).catch(() => null);
  await page.waitForTimeout(1500);
  return authSession.token;
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
  if (routeDef.path.startsWith('/mobile')) {
    await page
      .locator('.portal-page, .mobile-dashboard-page, .portal-list, .titan-empty-state')
      .first()
      .waitFor({ state: 'visible', timeout: 60_000 })
      .catch(() => null);
    await page.waitForTimeout(2000);
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

async function detectCaptureIssues(page, routeDef) {
  const issues = [];
  const url = page.url();
  if (url.includes('/auth/login') || url.includes('session_expired')) {
    issues.push('login_redirect');
  }
  const bodyText = await page.locator('body').innerText().catch(() => '');
  if (/invalid or expired access token/i.test(bodyText)) {
    issues.push('expired_session_api');
  }
  if (/unable to load this section/i.test(bodyText) && routeDef.path.startsWith('/mobile')) {
    issues.push('mobile_load_error');
  }
  if (routeDef.label === 'fleet' && /LIVE MAPS\/ROUTING NOT IMPLEMENTED/i.test(bodyText)) {
    issues.push('fleet_contradictory_wording');
  }
  return issues;
}

async function verifyBackNavigation(page) {
  await page.goto(`${WEB}/scheduling?view=month`, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.waitForTimeout(1500);
  const monthUrl = page.url();
  await page.goto(`${WEB}/jobs`, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.waitForTimeout(1000);
  await page.goBack({ waitUntil: 'networkidle', timeout: 60_000 }).catch(() => null);
  await page.waitForTimeout(1000);
  const afterBack = page.url();
  const viewParam = new URL(afterBack).searchParams.get('view');
  return {
    monthUrl,
    afterBack,
    viewRestored: viewParam === 'month' || afterBack.includes('view=month'),
    scrollY: await page.evaluate(() => window.scrollY),
  };
}

async function captureRoute(page, routeDef, viewport, outDir = OUT_DIR) {
  const url = `${WEB}${routeDef.path}`;
  const slug = `${routeDef.label}-${viewport.id}`;
  const shots = [];

  try {
    await ensureFreshSession(page, routeDef);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
    await waitForRouteReady(page, routeDef);

    const issues = await detectCaptureIssues(page, routeDef);

    const topPath = path.join(outDir, `${slug}-top.png`);
    await page.screenshot({ path: topPath, fullPage: false });
    shots.push(topPath);

    if (routeDef.scroll) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
      await page.waitForTimeout(500);
      const midPath = path.join(outDir, `${slug}-mid.png`);
      await page.screenshot({ path: midPath, fullPage: false });
      shots.push(midPath);

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);
      const bottomPath = path.join(outDir, `${slug}-bottom.png`);
      await page.screenshot({ path: bottomPath, fullPage: false });
      shots.push(bottomPath);
    }

    const ux = routeDef.uxChecks ? await runUxChecks(page, routeDef.uxChecks, routeDef.path) : {};
    return {
      captured: issues.length === 0,
      shots,
      ux,
      error: issues.length ? issues.join(', ') : null,
      issues,
    };
  } catch (err) {
    return { captured: false, shots, ux: {}, error: String(err.message ?? err), issues: ['capture_exception'] };
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(CORRECTION_DIR, { recursive: true });
  fs.mkdirSync(ZIP_DIR, { recursive: true });

  await refreshAuthSession(true);
  const token = authSession.token;
  const dynamicRoutes = await resolveDynamicRoutes(token);
  const allRoutes = [...ROUTES, ...dynamicRoutes];
  const routesToRun = CORRECTION_ONLY
    ? allRoutes.filter((routeDef) => CORRECTION_LABELS.has(routeDef.label))
    : allRoutes;

  const priorReport = fs.existsSync(OUT_JSON) ? JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')) : null;

  const report = {
    schemaVersion: CORRECTION_ONLY ? 'phase18-correction-v1' : 'phase18-visual-audit-v1',
    label: '231-titan-owner-operating-model-final-verify',
    generatedAt: new Date().toISOString(),
    branch: 'cursor/titan-owner-operating-model-final',
    commitSha: gitSha(),
    stagingWeb: WEB,
    stagingApi: API,
    auth: {
      method: 'railway_programmatic_session_route_intercept',
      secretsInOutput: false,
      sessionRefreshMs: SESSION_REFRESH_MS,
    },
    correctionPass: CORRECTION_ONLY
      ? {
          baseCommit: priorReport?.commitSha ?? '493c1dc',
          defects: [
            'expired_session_screenshot_failures',
            'technician_mobile_loading',
            'back_history_state',
            'fleet_contradictory_wording',
            'crowded_mobile_header',
          ],
          routesRecaptured: [],
          screenshotCount: 0,
          backNavigation: null,
        }
      : undefined,
    uxFixes: {
      dashboardClickableCounters: { required: true, verified: priorReport?.uxFixes?.dashboardClickableCounters?.verified ?? false },
      navIconsAllItems: { required: true, verified: priorReport?.uxFixes?.navIconsAllItems?.verified ?? false },
      customerListSimplified: { required: true, verified: priorReport?.uxFixes?.customerListSimplified?.verified ?? false },
    },
    routes: CORRECTION_ONLY && priorReport?.routes ? [...priorReport.routes] : [],
    screenshots: CORRECTION_ONLY && priorReport?.screenshots ? [...priorReport.screenshots] : [],
    screenshotCount: CORRECTION_ONLY && priorReport?.screenshotCount ? priorReport.screenshotCount : 0,
    blockers: [],
    verdict: 'HOLD',
  };

  const browser = await chromium
    .launch({ headless: true, channel: 'chrome' })
    .catch(() => chromium.launch({ headless: true }));
  const context = await browser.newContext();
  const page = await context.newPage();
  await seedSession(context, page);

  if (CORRECTION_ONLY) {
    report.correctionPass.backNavigation = await verifyBackNavigation(page);
    if (!report.correctionPass.backNavigation.viewRestored) {
      report.blockers.push('Back navigation did not restore scheduling ?view=month');
    }
  }

  for (const routeDef of routesToRun) {
    const viewports = routeDef.primary
      ? CORRECTION_ONLY && CORRECTION_MOBILE_LABELS.has(routeDef.label)
        ? VIEWPORTS.filter((vp) => vp.id === '375')
        : CORRECTION_ONLY
          ? VIEWPORTS
          : VIEWPORTS
      : CORRECTION_ONLY
        ? [VIEWPORTS.find((vp) => vp.id === '375') ?? VIEWPORTS[0]]
        : [VIEWPORTS[0]];

    let routeEntry = report.routes.find((entry) => entry.label === routeDef.label);
    if (!routeEntry) {
      routeEntry = {
        path: routeDef.path,
        label: routeDef.label,
        primary: Boolean(routeDef.primary),
        captures: [],
      };
      report.routes.push(routeEntry);
    }

    for (const vp of viewports) {
      const outDir = CORRECTION_ONLY ? CORRECTION_DIR : OUT_DIR;
      const result = await captureRoute(page, routeDef, vp, outDir);
      const shotPaths = result.shots.map((s) => path.relative(repoRoot, s));

      const captureRecord = {
        viewport: vp.id,
        captured: result.captured,
        shotCount: result.shots.length,
        screenshots: shotPaths,
        ux: result.ux,
        error: result.error,
        correctionPass: CORRECTION_ONLY ? true : undefined,
        issues: result.issues ?? [],
      };

      const existingIdx = routeEntry.captures.findIndex((c) => c.viewport === vp.id);
      if (existingIdx >= 0) {
        for (const oldShot of routeEntry.captures[existingIdx].screenshots ?? []) {
          const idx = report.screenshots.indexOf(oldShot);
          if (idx >= 0) report.screenshots.splice(idx, 1);
        }
        routeEntry.captures[existingIdx] = captureRecord;
      } else {
        routeEntry.captures.push(captureRecord);
      }

      for (const shot of result.shots) {
        const rel = path.relative(repoRoot, shot);
        if (!report.screenshots.includes(rel)) report.screenshots.push(rel);
        report.screenshotCount += 1;
        const dest = path.join(ZIP_DIR, path.basename(shot));
        fs.copyFileSync(shot, dest);
        if (CORRECTION_ONLY) {
          const primaryDest = path.join(OUT_DIR, path.basename(shot));
          fs.copyFileSync(shot, primaryDest);
        }
      }

      if (CORRECTION_ONLY) {
        report.correctionPass.routesRecaptured.push(`${routeDef.label}@${vp.id}`);
        report.correctionPass.screenshotCount += result.shots.length;
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
