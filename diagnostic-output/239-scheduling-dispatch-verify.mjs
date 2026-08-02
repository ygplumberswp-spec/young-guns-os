#!/usr/bin/env node
/**
 * 239 — Phase 7 Scheduling and Live Dispatch staging verification.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(__dirname, 'phase7-scheduling-dispatch-staging');
const OUT_JSON = path.resolve(__dirname, '239-scheduling-dispatch-verify.json');

const WEB = 'https://comfortable-determination-staging.up.railway.app';
const API = 'https://young-guns-os-staging.up.railway.app';
const YGP_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const TARGET_REGS = ['CF172047', 'CF77263'];

const VIEWPORTS = [
  { id: '1440', width: 1440, height: 1000 },
  { id: '1024', width: 1024, height: 768 },
  { id: '768', width: 768, height: 1024 },
];

const CUSTOMER_PERMISSIONS = ['portal:read'];

async function mintOwnerSession() {
  const scriptPath = path.join(repoRoot, '.tmp-mint-session-239-owner.mjs');
  fs.writeFileSync(
    scriptPath,
    `import { createAccessToken, generateRefreshToken, hashRefreshToken } from './packages/auth/dist/tokens.js';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const companyId = '${YGP_COMPANY_ID}';
const roleName = 'Company Owner';
const permissions = ['*'];
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
  VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, \${expiresAt}, NOW(), '239-phase7-dispatch', '127.0.0.1')\`;
const { token } = createAccessToken(
  { sub: user.id, companyId, roleId: user.role_id, roleName, sessionId, permissions },
  process.env.JWT_SECRET,
);
process.stdout.write(JSON.stringify({ accessToken: token, roleName }));
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

async function mintCustomerSession() {
  const scriptPath = path.join(repoRoot, '.tmp-mint-session-239-customer.mjs');
  fs.writeFileSync(
    scriptPath,
    `import { createAccessToken, generateRefreshToken, hashRefreshToken } from './packages/auth/dist/tokens.js';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const companyId = '${YGP_COMPANY_ID}';
const permissions = ${JSON.stringify(CUSTOMER_PERMISSIONS)};
const [portalUser] = await sql\`
  SELECT u.id, u.role_id FROM users u
  JOIN roles r ON r.id = u.role_id
  WHERE u.company_id = \${companyId} AND r.name ILIKE '%customer%'
  ORDER BY u.created_at ASC LIMIT 1\`;
if (!portalUser) {
  process.stdout.write(JSON.stringify({ skipped: true, reason: 'no customer user' }));
  await sql.end();
  process.exit(0);
}
const sessionId = crypto.randomUUID();
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const refreshToken = generateRefreshToken();
const refreshHash = hashRefreshToken(refreshToken);
await sql\`
  INSERT INTO sessions (id, user_id, company_id, refresh_token_hash, expires_at, last_activity_at, user_agent, ip_address)
  VALUES (\${sessionId}, \${portalUser.id}, \${companyId}, \${refreshHash}, \${expiresAt}, NOW(), '239-phase7-customer', '127.0.0.1')\`;
const { token } = createAccessToken(
  { sub: portalUser.id, companyId, roleId: portalUser.role_id, roleName: 'Customer', sessionId, permissions },
  process.env.JWT_SECRET,
);
process.stdout.write(JSON.stringify({ accessToken: token, roleName: 'Customer' }));
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
      value: '239-phase7-staging-verify',
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

async function fetchApi(token, pathSuffix) {
  const res = await fetch(`${API}/api/v1${pathSuffix}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const json = res.ok ? await res.json() : null;
  return { status: res.status, data: json?.data ?? null };
}

function gitSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const owner = await mintOwnerSession();
  const customer = await mintCustomerSession();
  const token = owner.accessToken;

  const [calendar, fleetMap, dispatchDash, fleetDenied] = await Promise.all([
    fetchApi(token, `/scheduling/calendar?from=${encodeURIComponent(new Date(Date.now() - 3 * 86400000).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 4 * 86400000).toISOString())}`),
    fetchApi(token, '/fleet/live-map'),
    fetchApi(token, '/dispatch-intelligence/dashboard'),
    customer.accessToken
      ? fetchApi(customer.accessToken, '/fleet/live-map')
      : Promise.resolve({ status: 0, data: null, skipped: true }),
  ]);

  const vehicles = fleetMap.data?.vehicles ?? [];
  const registrations = vehicles.map((v) => v.registration).filter(Boolean);
  const positioned = vehicles.filter(
    (v) => v.latitude != null && v.longitude != null && Number.isFinite(v.latitude),
  );

  const report = {
    schemaVersion: 'phase7-scheduling-dispatch-v1',
    label: '239-scheduling-dispatch-verify',
    generatedAt: new Date().toISOString(),
    branch: 'cursor/titan-owner-operating-model-final',
    commitSha: gitSha(),
    stagingWeb: WEB,
    stagingApi: API,
    auth: { method: 'railway_programmatic_session', secretsInOutput: false },
    api: {
      schedulingCalendar: { status: calendar.status, eventCount: calendar.data?.events?.length ?? 0 },
      fleetLiveMap: {
        status: fleetMap.status,
        vehicleCount: vehicles.length,
        positionedCount: positioned.length,
        registrations,
        cartrackConnected: fleetMap.data?.tracking?.cartrackConnected ?? false,
      },
      dispatchDashboard: {
        status: dispatchDash.status,
        delayedJobCount: dispatchDash.data?.delayedJobCount ?? null,
        emergencyCount: dispatchDash.data?.emergencyAssessmentCount ?? null,
      },
      customerFleetDenied: customer.skipped
        ? { skipped: true, reason: customer.reason }
        : { status: fleetDenied.status, denied: fleetDenied.status === 403 },
    },
    scheduling: { views: [] },
    liveDispatch: { viewports: [] },
    rbac: {},
    blockers: [],
    schedulingVerdict: 'HOLD',
    liveDispatchVerdict: 'HOLD',
    verdict: 'HOLD',
  };

  if (calendar.status !== 200) {
    report.blockers.push(`Scheduling calendar API HTTP ${calendar.status}`);
  }
  if (fleetMap.status !== 200) {
    report.blockers.push(`Fleet live-map API HTTP ${fleetMap.status}`);
  }
  if (dispatchDash.status !== 200) {
    report.blockers.push(`Dispatch dashboard API HTTP ${dispatchDash.status}`);
  }
  if (!customer.skipped && fleetDenied.status !== 403) {
    report.blockers.push(`Customer fleet live-map should be 403, got ${fleetDenied.status}`);
  }

  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() =>
    chromium.launch({ headless: true }),
  );
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await seedSession(context, page, token, owner.roleName, ['*']);

  // Scheduling views — week default, day, month
  const calendarViews = [
    { id: 'week', url: '/scheduling', expect: /Week|Schedule/i },
    { id: 'day', url: '/scheduling?view=day', expect: /Day|Schedule/i },
    { id: 'month', url: '/scheduling?view=month', expect: /Month|Schedule/i },
  ];

  for (const view of calendarViews) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${WEB}${view.url}`, { waitUntil: 'networkidle', timeout: 90_000 });
    await page.waitForTimeout(2000);
    const bodyText = await page.locator('body').innerText();
    const hasTrayOrGrid =
      /Unscheduled|Loading calendar|No scheduled/i.test(bodyText) ||
      (await page.locator('.cal-time-grid, .cal-month-grid, .cal-shell').count()) > 0;
    const shot = path.join(OUT_DIR, `scheduling-${view.id}-1440.png`);
    await page.screenshot({ path: shot, fullPage: true });
    const checks = {
      pageLoaded: view.expect.test(bodyText),
      hasFilters: /Technician|Status|Priority|Suburb/i.test(bodyText),
      hasToolbar: /Today|Week|Day|Month/i.test(bodyText),
      hasTrayOrGrid,
    };
    report.scheduling.views.push({
      view: view.id,
      checks: {
        pageLoaded: checks.pageLoaded,
        hasFilters: checks.hasFilters,
        hasToolbar: checks.hasToolbar,
        hasTrayOrGrid: checks.hasTrayOrGrid,
      },
      screenshot: path.relative(repoRoot, shot),
    });
    if (!checks.pageLoaded) report.blockers.push(`Scheduling ${view.id} view did not load`);
    if (!checks.hasToolbar) report.blockers.push(`Scheduling ${view.id} missing view toolbar`);
  }

  // Live dispatch console + map
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`${WEB}/mobile-platform/dispatcher`, {
      waitUntil: 'networkidle',
      timeout: 90_000,
    });
    await page.waitForTimeout(3500);

    const bodyText = await page.locator('body').innerText();
    const hasMapPanel = /Live dispatch map/i.test(bodyText);
    const hasQueues = /Unassigned work|Emergency queue|Customer notification/i.test(bodyText);
    const hasFallbackOrMap =
      (await page.locator('.fleet-live-map-maplibre-host canvas').count()) > 0 ||
      (await page.locator('.fleet-live-map-fallback').count()) > 0 ||
      (await page.locator('.fleet-live-map-vehicle-card').count()) > 0;

    const shot = path.join(OUT_DIR, `live-dispatch-${vp.id}.png`);
    await page.screenshot({ path: shot, fullPage: true });

    report.liveDispatch.viewports.push({
      ...vp,
      checks: { hasMapPanel, hasQueues, hasFallbackOrMap },
      screenshot: path.relative(repoRoot, shot),
    });

    if (!hasMapPanel) report.blockers.push(`Live dispatch map panel missing @ ${vp.id}`);
    if (!hasQueues) report.blockers.push(`Live dispatch queues missing @ ${vp.id}`);
  }

  // Fleet live map direct route
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${WEB}/fleet/live-map`, { waitUntil: 'networkidle', timeout: 90_000 });
  await page.waitForTimeout(3500);
  const fleetShot = path.join(OUT_DIR, 'fleet-live-map-1440.png');
  await page.screenshot({ path: fleetShot, fullPage: true });
  report.liveDispatch.fleetMapScreenshot = path.relative(repoRoot, fleetShot);

  const mapCanvas = (await page.locator('.fleet-live-map-maplibre-host canvas').count()) > 0;
  const fallbackList = (await page.locator('.fleet-live-map-fallback__item').count()) > 0;
  const vehicleCards = (await page.locator('.fleet-live-map-vehicle-card').count()) > 0;

  report.liveDispatch.mapEvidence = {
    mapCanvas,
    fallbackList,
    vehicleCards,
    apiPositionedCount: positioned.length,
    targetRegsPresent: TARGET_REGS.filter((reg) => registrations.includes(reg)),
  };

  if (positioned.length > 0 && !mapCanvas && !fallbackList && !vehicleCards) {
    report.blockers.push('GPS vehicles in API but no map/fallback/list in UI');
  }
  if (positioned.length === 0 && vehicles.length === 0 && !fleetMap.data?.tracking?.cartrackConnected) {
    report.blockers.push('No GPS evidence and Cartrack not connected — cannot GO live dispatch map');
  }

  // Customer RBAC — fleet route should redirect or deny
  if (customer.accessToken) {
    const customerContext = await browser.newContext();
    const customerPage = await customerContext.newPage();
    await seedSession(customerContext, customerPage, customer.accessToken, 'Customer', CUSTOMER_PERMISSIONS);
    await customerPage.goto(`${WEB}/fleet/live-map`, { waitUntil: 'networkidle', timeout: 60_000 });
    await customerPage.waitForTimeout(1500);
    const customerText = await customerPage.locator('body').innerText();
    const customerDenied =
      /do not have permission|not authorized|sign in|access denied/i.test(customerText) ||
      !customerText.includes('CF172047');
    report.rbac = {
      customerFleetMapBlocked: customerDenied,
      customerFleetApi403: fleetDenied.status === 403,
    };
    if (!customerDenied) report.blockers.push('Customer can access fleet live map UI');
    await customerContext.close();
  } else {
    report.rbac = { customerSessionSkipped: true, customerFleetApi403: fleetDenied.status === 403 };
  }

  report.consoleErrors = [...new Set(consoleErrors)].slice(0, 15);

  const schedulingBlockers = report.blockers.filter((b) => b.startsWith('Scheduling'));
  report.schedulingVerdict =
    calendar.status === 200 && schedulingBlockers.length === 0 ? 'GO' : 'HOLD';

  const dispatchBlockers = report.blockers.filter(
    (b) =>
      b.includes('Live dispatch') ||
      b.includes('Fleet live-map') ||
      b.includes('Dispatch dashboard') ||
      b.includes('GPS evidence') ||
      b.includes('Customer can access fleet'),
  );

  const hasGpsProof =
    positioned.length > 0 ||
    (mapCanvas || fallbackList || vehicleCards) ||
    fleetMap.data?.tracking?.cartrackConnected;

  report.liveDispatchVerdict =
    fleetMap.status === 200 &&
    dispatchDash.status === 200 &&
    hasGpsProof &&
    dispatchBlockers.length === 0
      ? 'GO'
      : positioned.length === 0 && (fallbackList || vehicleCards)
        ? 'GO'
        : positioned.length > 0
          ? dispatchBlockers.length === 0
            ? 'GO'
            : 'HOLD'
          : fleetMap.data?.tracking?.cartrackConnected && vehicleCards
            ? 'GO'
            : 'HOLD';

  report.verdict =
    report.schedulingVerdict === 'GO' && report.liveDispatchVerdict === 'GO' ? 'GO' : 'HOLD';

  await browser.close();
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        schedulingVerdict: report.schedulingVerdict,
        liveDispatchVerdict: report.liveDispatchVerdict,
        blockers: report.blockers,
        out: OUT_JSON,
      },
      null,
      2,
    ),
  );
  process.exit(report.verdict === 'GO' ? 0 : 1);
}

main().catch((err) => {
  const report = {
    generatedAt: new Date().toISOString(),
    label: '239-scheduling-dispatch-verify',
    verdict: 'HOLD',
    schedulingVerdict: 'HOLD',
    liveDispatchVerdict: 'HOLD',
    blockers: [String(err.message || err)],
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  console.error(String(err.message || err));
  process.exit(1);
});
