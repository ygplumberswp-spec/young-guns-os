#!/usr/bin/env node
/**
 * Authenticated browser route benchmark for TITAN.
 * Requires web on :5173, API on :3000, and optional Playwright install.
 */
const WEB_BASE = process.env.TITAN_BENCH_WEB_BASE ?? 'http://localhost:5173';
const API_BASE = process.env.TITAN_BENCH_API_BASE ?? 'http://localhost:3000/api/v1';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'mobile', width: 390, height: 844 },
];

const OWNER_ROUTES = [
  '/',
  '/crm',
  '/jobs',
  '/scheduling',
  '/finance/quotes',
  '/analytics',
  '/integrations',
  '/mission-control',
  '/aura',
  '/settings/team',
  '/platform',
];

const TECH_ROUTES = [
  '/mobile',
  '/mobile/jobs',
  '/mobile/route',
  '/mobile/inventory',
  '/mobile/notifications',
  '/mobile/time',
  '/mobile/sync',
];

const PORTAL_ROUTES = [
  '/portal',
  '/portal/jobs',
  '/portal/quotes',
  '/portal/finance',
  '/portal/communications',
  '/portal/documents',
];

async function signupOwner() {
  const suffix = Date.now();
  const response = await fetch(`${API_BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyName: `Browser Bench ${suffix}`,
      email: `browser-bench-${suffix}@example.com`,
      password: 'BenchPass123!',
      firstName: 'Bench',
      lastName: 'Owner',
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Signup failed (${response.status})`);
  }
  return payload.data.session.accessToken;
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return null;
  }
}

async function measureRoute(page, route, label) {
  const started = Date.now();
  let requestCount = 0;
  const onRequest = (request) => {
    if (request.url().includes('/api/v1/')) {
      requestCount += 1;
    }
  };
  page.on('request', onRequest);

  await page.goto(`${WEB_BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(250);
  const shellMs = Date.now() - started;

  let contentMs = shellMs;
  try {
    await page.waitForFunction(
      () => {
        const loading = document.querySelector('.loading-state, .page-muted');
        const header = document.querySelector('.page-header, .portal-page, .automation-page');
        return Boolean(header) && !loading;
      },
      { timeout: 8_000 },
    );
    contentMs = Date.now() - started;
  } catch {
    contentMs = Date.now() - started;
  }

  page.off('request', onRequest);

  return {
    label,
    route,
    shellMs,
    usefulContentMs: contentMs,
    apiRequestCount: requestCount,
  };
}

async function runViewportSuite(playwright, accessToken, routes, roleLabel, viewport) {
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  });
  await context.addInitScript((token) => {
    window.localStorage.setItem('titan.accessToken', token);
  }, accessToken);

  const page = await context.newPage();
  const cold = [];
  for (const route of routes) {
    cold.push(await measureRoute(page, route, `${roleLabel}-cold`));
  }

  const warm = [];
  for (const route of routes) {
    warm.push(await measureRoute(page, route, `${roleLabel}-warm`));
  }

  await browser.close();
  return { cold, warm };
}

async function main() {
  const playwright = await loadPlaywright();
  const token = await signupOwner();

  const apiResults = [];
  for (const path of [
    '/integrations/hub/dashboard?simple=true',
    '/mission-control/dashboard/summary',
    '/mission-control/dashboard/modules',
  ]) {
    const started = Date.now();
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    apiResults.push({
      path,
      status: response.status,
      elapsedMs: Date.now() - started,
      serverTiming: response.headers.get('Server-Timing'),
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    webBase: WEB_BASE,
    apiBase: API_BASE,
    apiSpotChecks: apiResults,
    browser: null,
  };

  if (!playwright) {
    report.browser = { available: false, reason: 'playwright not installed — API spot checks only' };
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const browserResults = {};
  for (const viewport of VIEWPORTS) {
    browserResults[viewport.name] = await runViewportSuite(
      playwright,
      token,
      OWNER_ROUTES,
      `owner-${viewport.name}`,
      viewport,
    );
  }

  report.browser = { available: true, viewports: browserResults };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
