#!/usr/bin/env node
/**
 * 253 — Scheduling Day/Week/Month view button verification (staging only).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(__dirname, 'phase253-scheduling-views-staging');
const OUT_JSON = path.resolve(__dirname, '253-scheduling-view-verify.json');

const WEB = 'https://comfortable-determination-staging.up.railway.app';
const API = 'https://young-guns-os-staging.up.railway.app';
const YGP_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';

const VIEWPORTS = [
  { id: '1440', width: 1440, height: 1000 },
  { id: '375', width: 375, height: 812 },
];

function gitSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

async function mintOwnerSession() {
  const scriptPath = path.join(repoRoot, '.tmp-mint-session-253-owner.mjs');
  fs.writeFileSync(
    scriptPath,
    `import { createAccessToken, generateRefreshToken, hashRefreshToken } from './packages/auth/dist/tokens.js';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const companyId = '${YGP_COMPANY_ID}';
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
  VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, \${expiresAt}, NOW(), '253-scheduling-views', '127.0.0.1')\`;
const { token } = createAccessToken(
  { sub: user.id, companyId, roleId: user.role_id, roleName: user.role_name, sessionId, permissions },
  process.env.JWT_SECRET,
);
process.stdout.write(JSON.stringify({ accessToken: token, roleName: user.role_name }));
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

async function seedSession(context, page, token, roleName, permissions) {
  const authPayload = await fetchAuthPayload(token, roleName, permissions);
  await context.addCookies([
    {
      name: 'titan_refresh_token',
      value: '253-scheduling-views-verify',
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

async function clickViewTab(page, label) {
  const tab = page.locator('.ux-compact-tabs__tab', { hasText: label }).first();
  await tab.waitFor({ state: 'visible', timeout: 30_000 });
  await tab.click();
  await page
    .locator('.cal-time-grid, .cal-month-grid, .titan-empty-state')
    .first()
    .waitFor({ state: 'visible', timeout: 45_000 })
    .catch(() => null);
  await page.waitForTimeout(500);
}

async function captureView(page, viewport, viewId) {
  const shell = page.locator('.cal-shell').first();
  await shell.waitFor({ state: 'visible', timeout: 30_000 });

  const dataView = await shell.getAttribute('data-view');
  const url = page.url();
  const monthGrid = await page.locator('.cal-month-grid').count();
  const timeGrid = await page.locator('.cal-time-grid').count();
  const emptyState = await page.locator('.titan-empty-state').count();
  const activeTab = await page
    .locator('.ux-compact-tabs__tab--active')
    .first()
    .innerText()
    .catch(() => '');

  const shot = path.join(OUT_DIR, `scheduling-${viewId}-${viewport.id}.png`);
  await page.screenshot({ path: shot, fullPage: true });

  return {
    viewport: viewport.id,
    view: viewId,
    dataView,
    url,
    activeTab: activeTab.trim(),
    layout: monthGrid > 0 ? 'month-grid' : timeGrid > 0 ? 'time-grid' : emptyState > 0 ? 'empty-state' : 'unknown',
    screenshot: path.relative(repoRoot, shot),
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const report = {
    phase: 253,
    generatedAt: new Date().toISOString(),
    gitSha: gitSha(),
    web: WEB,
    blockers: [],
    viewClicks: [],
    backNavigation: null,
    emptyState: null,
    verdict: 'PENDING',
  };

  const owner = await mintOwnerSession();
  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() =>
    chromium.launch({ headless: true }),
  );
  const context = await browser.newContext();
  const page = await context.newPage();
  await seedSession(context, page, owner.accessToken, owner.roleName, ['*']);
  await page.goto(`${WEB}/`, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.waitForTimeout(1500);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`${WEB}/scheduling`, { waitUntil: 'networkidle', timeout: 120_000 });
    await page.waitForTimeout(1500);

    for (const viewId of ['Day', 'Week', 'Month']) {
      await clickViewTab(page, viewId);
      const result = await captureView(page, viewport, viewId.toLowerCase());
      report.viewClicks.push(result);

      const expectedParam = viewId.toLowerCase() === 'week' ? null : `view=${viewId.toLowerCase()}`;
      const urlOk =
        viewId.toLowerCase() === 'week'
          ? !page.url().includes('view=day') && !page.url().includes('view=month')
          : page.url().includes(expectedParam);
      const layoutOk =
        viewId.toLowerCase() === 'month'
          ? result.layout === 'month-grid' || result.layout === 'empty-state'
          : result.layout === 'time-grid' || result.layout === 'empty-state';
      const activeOk = result.activeTab.toLowerCase() === viewId.toLowerCase();
      const dataViewOk = result.dataView === viewId.toLowerCase();

      if (!urlOk) report.blockers.push(`${viewport.id}: ${viewId} URL missing expected view param`);
      if (!layoutOk) report.blockers.push(`${viewport.id}: ${viewId} layout not ${viewId.toLowerCase()}`);
      if (!activeOk) report.blockers.push(`${viewport.id}: ${viewId} tab not active`);
      if (!dataViewOk) report.blockers.push(`${viewport.id}: ${viewId} data-view mismatch`);
    }
  }

  // Back navigation: leave scheduling then return restores month view
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${WEB}/scheduling?view=month`, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.waitForTimeout(1500);
  const monthUrl = page.url();
  await page.goto(`${WEB}/jobs`, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.waitForTimeout(1000);
  await page.goBack({ waitUntil: 'networkidle', timeout: 60_000 }).catch(() => null);
  await page.waitForTimeout(1000);
  const afterBackUrl = page.url();
  const viewParam = new URL(afterBackUrl).searchParams.get('view');
  report.backNavigation = {
    monthUrl,
    afterBackUrl,
    viewRestored: viewParam === 'month' || afterBackUrl.includes('view=month'),
  };
  if (!report.backNavigation.viewRestored) {
    report.blockers.push('Back navigation did not restore scheduling ?view=month');
  }

  // Empty state probe — far-future date unlikely to have jobs
  await page.goto(`${WEB}/scheduling?view=day&date=2099-01-15`, {
    waitUntil: 'networkidle',
    timeout: 120_000,
  });
  await page.waitForTimeout(1500);
  const emptyText = await page.locator('body').innerText();
  report.emptyState = {
    hasMessage: /No jobs scheduled/i.test(emptyText),
    layout: (await page.locator('.titan-empty-state').count()) > 0 ? 'empty-state' : 'other',
    screenshot: path.relative(
      repoRoot,
      path.join(OUT_DIR, 'scheduling-empty-day-1440.png'),
    ),
  };
  await page.screenshot({ path: path.join(OUT_DIR, 'scheduling-empty-day-1440.png'), fullPage: true });
  if (!report.emptyState.hasMessage) {
    report.blockers.push('Empty day view missing No jobs scheduled message');
  }

  report.verdict = report.blockers.length === 0 ? 'GO' : 'NO-GO';
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();

  console.log(JSON.stringify({ verdict: report.verdict, blockers: report.blockers.length, out: OUT_JSON }));
  process.exit(report.verdict === 'GO' ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
