/**
 * Phase 2 browser verification: sidebar, routes, currency, screenshots.
 */
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = process.env.AUDIT_BASE_URL || 'http://localhost:5174';
const API = process.env.AUDIT_API_URL || 'http://localhost:3000';
const OUT = join(process.cwd(), 'audit-output', 'phase2');
const ts = Date.now();
const email = `phase2-${ts}@audit.local`;
const pass = 'AuditTest123!';

const ROUTES = [
  '/',
  '/crm',
  '/jobs',
  '/scheduling',
  '/finance/quotes',
  '/finance/invoices',
  '/inventory/products',
  '/fleet',
  '/communications/messages',
  '/documents',
  '/analytics',
  '/aura',
  '/automation',
  '/integrations',
  '/security',
  '/settings/company',
  '/leads',
  '/marketing',
  '/mission-control',
];

async function signup() {
  const r = await fetch(`${API}/api/v1/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: pass,
      companyName: `Phase2 ${ts}`,
      firstName: 'Phase',
      lastName: 'Two',
    }),
  });
  if (!r.ok) throw new Error(`signup failed: ${await r.text()}`);
}

async function login(page) {
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', pass);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/auth/login'), { timeout: 15000 });
  await page.waitForTimeout(2500);
  await page.waitForSelector('.app-nav', { timeout: 10000 });
}

async function ensureLoggedIn(page) {
  const onLoginPage = page.url().includes('/auth/login');
  const hasNav = (await page.locator('.app-nav').count()) > 0;
  if (!onLoginPage && hasNav) {
    return;
  }
  await login(page);
}

async function inspectRoute(page, path) {
  const result = {
    route: path,
    status: 'PASS',
    rootLen: 0,
    sidebarLinks: 0,
    sidebarOverlap: false,
    hasRevenueZar: false,
    consoleErrors: [],
    portalRefreshCalls: 0,
    reasons: [],
  };

  const consoleErrors = [];
  let portalRefreshCalls = 0;

  const onConsole = (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 180));
  };
  const onResponse = (res) => {
    if (res.url().includes('/portal/auth/refresh')) portalRefreshCalls += 1;
  };

  page.on('console', onConsole);
  page.on('response', onResponse);

  await ensureLoggedIn(page);
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(2500);

  const snapshot = await page.evaluate(() => {
    const root = document.getElementById('root');
    const nav = document.querySelector('.app-nav');
    const links = nav ? Array.from(nav.querySelectorAll('.app-nav__link')) : [];
    const overlap = links.some((link) => {
      const rect = link.getBoundingClientRect();
      return rect.height < 14;
    });
    const text = root?.innerText ?? '';
    return {
      rootLen: text.trim().length,
      sidebarLinks: links.length,
      sidebarOverlap: overlap,
      hasRevenueZar: /R\s?0[,.]00/.test(text) || text.includes('R0.00'),
      body: text.slice(0, 200),
    };
  });

  Object.assign(result, snapshot);
  result.consoleErrors = consoleErrors.filter((e) => !e.includes('favicon'));
  result.portalRefreshCalls = portalRefreshCalls;

  if (result.rootLen < 80) {
    result.status = 'FAIL';
    result.reasons.push('blank_or_minimal_root');
  }
  if (result.sidebarLinks < 5 && path !== '/auth/login') {
    result.status = 'FAIL';
    result.reasons.push('sidebar_missing_links');
  }
  if (result.sidebarOverlap) {
    result.status = 'FAIL';
    result.reasons.push('sidebar_text_overlap');
  }
  if (path === '/' && !result.hasRevenueZar) {
    result.status = 'FAIL';
    result.reasons.push('dashboard_revenue_not_zar');
  }
  if (result.portalRefreshCalls > 0) {
    result.status = 'FAIL';
    result.reasons.push('unexpected_portal_refresh');
  }
  if (result.consoleErrors.length > 0) {
    const authLost = result.body.includes('Sign in') && path !== '/auth/login';
    if (authLost) {
      result.reasons.push('session_expired_relogin_required');
    } else {
      result.status = 'FAIL';
      result.reasons.push('console_errors');
    }
  }

  page.off('console', onConsole);
  page.off('response', onResponse);

  return result;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await signup();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await login(page);

  const routeResults = [];
  for (const route of ROUTES) {
    routeResults.push(await inspectRoute(page, route));
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.screenshot({ path: join(OUT, 'dashboard-desktop.png'), fullPage: true });

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.reload({ waitUntil: 'load' });
  await page.screenshot({ path: join(OUT, 'dashboard-tablet.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'load' });
  await page.screenshot({ path: join(OUT, 'dashboard-mobile.png'), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.screenshot({ path: join(OUT, 'sidebar-expanded.png'), fullPage: true });

  const collapse = page.locator('.app-nav__collapse-toggle');
  if (await collapse.count()) {
    await collapse.first().click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(OUT, 'sidebar-collapsed.png'), fullPage: true });
  }

  await page.goto(`${BASE}/finance/invoices`, { waitUntil: 'load' });
  await page.screenshot({ path: join(OUT, 'table-page-invoices.png'), fullPage: true });

  await page.goto(`${BASE}/crm/new`, { waitUntil: 'load' });
  await page.screenshot({ path: join(OUT, 'form-page-crm-new.png'), fullPage: true });

  await page.goto(`${BASE}/mission-control`, { waitUntil: 'load' });
  await page.screenshot({ path: join(OUT, 'enterprise-page-mission-control.png'), fullPage: true });

  await page.goto(`${BASE}/does-not-exist-route`, { waitUntil: 'load' });
  await page.screenshot({ path: join(OUT, 'not-found-page.png'), fullPage: true });

  await page.goto(`${BASE}/dev/error-boundary-test`, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'error-boundary-fallback.png'), fullPage: true });

  const report = {
    generatedAt: new Date().toISOString(),
    email,
    routes: routeResults,
    passCount: routeResults.filter((r) => r.status === 'PASS').length,
    failCount: routeResults.filter((r) => r.status === 'FAIL').length,
    screenshotsDir: OUT,
  };

  await writeFile(join(OUT, 'phase2-verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
