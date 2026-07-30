/**
 * Post-fix browser verification for owner routing repair.
 */
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = process.env.AUDIT_BASE_URL || 'http://localhost:5174';
const API = process.env.AUDIT_API_URL || 'http://localhost:3000';
const OUT = join(process.cwd(), 'audit-output');
const ts = Date.now();
const email = `route-fix-${ts}@audit.local`;
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
      companyName: `Route Fix ${ts}`,
      firstName: 'Route',
      lastName: 'Fix',
    }),
  });
  if (!r.ok) throw new Error(`signup failed: ${await r.text()}`);
}

async function inspect(page, path, mode) {
  const result = {
    route: path,
    mode,
    status: 'PASS',
    rootLen: 0,
    hasAppLayout: false,
    hasContent: false,
    url: '',
    consoleErrors: [],
    apiErrors: [],
    reasons: [],
  };

  const consoleErrors = [];
  const apiErrors = [];
  const onC = (m) => {
    if (m.type() === 'error' && !m.text().includes('/portal/auth/refresh')) {
      consoleErrors.push(m.text().slice(0, 150));
    }
  };
  const onR = (res) => {
    const u = res.url();
    if (u.includes('/api/') && res.status() >= 400 && !u.includes('/portal/auth/refresh') && !(u.includes('/aura') && res.status() === 503)) {
      apiErrors.push(`${res.status()} ${u.split('/api/v1/')[1] || u}`);
    }
  };

  page.on('console', onC);
  page.on('response', onR);

  try {
    if (mode === 'hard') {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    } else {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    }
    await page.waitForTimeout(3000);

    const rootHtml = await page.locator('#root').innerHTML().catch(() => '');
    const bodyText = (await page.locator('body').innerText().catch(() => '')).trim();
    result.rootLen = rootHtml.length;
    result.url = page.url();
    result.hasAppLayout = rootHtml.includes('app-nav') || rootHtml.includes('app-header') || rootHtml.includes('brand');
    result.hasContent = bodyText.length > 40;
    result.consoleErrors = consoleErrors.slice(0, 3);
    result.apiErrors = apiErrors.slice(0, 3);

    if (result.rootLen < 100) {
      result.status = 'FAIL';
      result.reasons.push('Empty #root');
    } else if (!result.hasAppLayout) {
      result.status = 'FAIL';
      result.reasons.push('AppLayout/sidebar not visible');
    } else if (!result.hasContent) {
      result.status = 'FAIL';
      result.reasons.push('Insufficient page content');
    } else if (result.url.includes('/auth/login') && path !== '/auth/login') {
      result.status = 'FAIL';
      result.reasons.push('Unexpected redirect to login');
    }

    if (apiErrors.some((e) => e.startsWith('401 auth/refresh'))) {
      if (result.status === 'PASS') result.status = 'WARNING';
      result.reasons.push('Auth refresh 401 during bootstrap');
    }
    if (consoleErrors.length && result.status === 'PASS') {
      result.status = 'WARNING';
      result.reasons.push(`${consoleErrors.length} console error(s)`);
    }
    if (!result.reasons.length) result.reasons.push('OK');
  } catch (e) {
    result.status = 'FAIL';
    result.reasons.push(e.message.slice(0, 120));
  }

  page.off('console', onC);
  page.off('response', onR);
  return result;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await signup();

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', pass);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 15000 });
  await page.waitForTimeout(2000);

  const results = [];
  for (const path of ROUTES) {
    results.push(await inspect(page, path, 'direct'));
    results.push(await inspect(page, path, 'hard'));
  }

  await browser.close();

  const report = { email, testedAt: new Date().toISOString(), results };
  await writeFile(join(OUT, 'routing-fix-verification.json'), JSON.stringify(report, null, 2));

  const fail = results.filter((r) => r.status === 'FAIL').length;
  const passN = results.filter((r) => r.status === 'PASS').length;
  const warn = results.filter((r) => r.status === 'WARNING').length;
  console.log(JSON.stringify({ pass: passN, warn, fail, total: results.length }, null, 2));
  results.filter((r) => r.status === 'FAIL').forEach((r) => console.log('FAIL', r.mode, r.route, r.reasons.join('; ')));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
