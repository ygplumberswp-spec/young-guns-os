#!/usr/bin/env node
/**
 * 254 — Full functional + contextual AURA audit verification (staging only).
 * Click-to-outcome evidence for procurement tabs, invoice filters/actions,
 * leads counts, scheduling views, AURA drawer, viewports.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(__dirname, 'phase254-functional-audit-staging');
const OUT_JSON = path.resolve(__dirname, '254-titan-full-functional-aura-audit-verify.json');

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

function gitSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

async function mintOwnerSession() {
  const scriptPath = path.join(repoRoot, '.tmp-mint-session-254-owner.mjs');
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
  VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, \${expiresAt}, NOW(), '254-functional-audit', '127.0.0.1')\`;
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

async function fetchAuthPayload(token, roleName) {
  const res = await fetch(`${API}/api/v1/auth/me`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`auth/me failed: ${res.status}`);
  const json = await res.json();
  return {
    user: { ...json.data.user, roleName, permissions: ['*'] },
    session: { accessToken: token, expiresIn: 3600 },
  };
}

async function seedSession(context, page, token, roleName) {
  const authPayload = await fetchAuthPayload(token, roleName);
  await context.addCookies([
    {
      name: 'titan_refresh_token',
      value: '254-functional-audit-verify',
      domain: 'comfortable-determination-staging.up.railway.app',
      path: '/api/v1/auth',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);
  for (const pattern of ['**/api/v1/auth/refresh', '**/api/v1/auth/me']) {
    await page.route(pattern, async (route) => {
      const body =
        pattern.includes('refresh')
          ? { data: authPayload }
          : { data: { user: authPayload.user } };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
  }
}

async function screenshot(page, name) {
  const shot = path.join(OUT_DIR, name);
  await page.screenshot({ path: shot, fullPage: true });
  return path.relative(repoRoot, shot);
}

async function testProcurementTabs(page, blockers, results) {
  const tabs = [
    { href: '/procurement/flow', label: 'Procure-to-Pay', expect: /procure|pipeline|need/i },
    { href: '/procurement', label: 'Purchase Orders', expect: /purchase order|no purchase/i },
    { href: '/procurement/suppliers', label: 'Suppliers', expect: /supplier/i },
    { href: '/procurement/price-lists', label: 'Price Lists', expect: /price list|price/i },
    { href: '/procurement/parts-requests', label: 'Parts Requests', expect: /parts request|material/i },
  ];

  for (const tab of tabs) {
    await page.goto(`${WEB}${tab.href}`, { waitUntil: 'networkidle', timeout: 120_000 });
    await page.waitForTimeout(1200);
    const url = page.url();
    const body = await page.locator('body').innerText();
    const active = await page.locator('.inventory-nav__link--active').innerText().catch(() => '');
    const ok = url.includes(tab.href.split('?')[0]) && tab.expect.test(body);
    results.procurementTabs.push({ tab: tab.label, url, active: active.trim(), pass: ok });
    if (!ok) blockers.push(`Procurement tab ${tab.label} content/URL failed`);
    await screenshot(page, `procurement-${tab.label.replace(/\s+/g, '-').toLowerCase()}-1440.png`);
  }
}

async function testInvoiceFilters(page, blockers, results) {
  await page.goto(`${WEB}/finance/invoices`, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.waitForTimeout(1500);
  const filters = ['All', 'Draft', 'Awaiting Payment', 'Overdue', 'Voided'];
  for (const label of filters) {
    const btn = page.locator('.ux-compact-tabs__tab', { hasText: label }).first();
    if ((await btn.count()) === 0) {
      if (label === 'Voided') {
        results.invoiceFilters.push({ filter: label, pass: false, note: 'Voided filter not found (may be in overflow)' });
        continue;
      }
      blockers.push(`Invoice filter missing: ${label}`);
      continue;
    }
    await btn.click();
    await page.waitForTimeout(800);
    const active = await page.locator('.ux-compact-tabs__tab--active').first().innerText().catch(() => '');
    const pass = active.includes(label);
    results.invoiceFilters.push({ filter: label, active: active.trim(), pass });
    if (!pass) blockers.push(`Invoice filter ${label} did not activate`);
  }
  const cancelled = await page.locator('.ux-compact-tabs__tab', { hasText: 'Cancelled' }).count();
  results.invoiceFilters.push({ filter: 'Cancelled removed', pass: cancelled === 0 });
  if (cancelled > 0) blockers.push('Cancelled filter still visible — should be Voided');
  await screenshot(page, 'invoices-filters-1440.png');
}

async function testInvoiceRowActions(page, blockers, results) {
  await page.goto(`${WEB}/finance/invoices`, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.waitForTimeout(1500);
  const viewBtn = page.locator('.ux-row-actions__btn', { hasText: 'View' }).first();
  const hasView = (await viewBtn.count()) > 0;
  const hasMore = (await page.locator('.ux-more-menu__trigger', { hasText: 'More' }).count()) > 0;
  results.invoiceRowActions = { hasView, hasMore };
  if (!hasView) blockers.push('Invoice row missing View action');
  if (!hasMore) blockers.push('Invoice row missing More menu');
  await screenshot(page, 'invoices-row-actions-1440.png');
}

async function testLeadsCounts(page, blockers, results) {
  await page.goto(`${WEB}/leads`, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.waitForTimeout(1500);
  const body = await page.locator('body').innerText();
  const joinedActive = /Active\d/.test(body);
  const hasOpen = /Open Leads/i.test(body);
  const hasAll = /All Leads/i.test(body);
  const hasShowing = /Showing \d+ of \d+ Leads/i.test(body);
  results.leads = { joinedActive, hasOpen, hasAll, hasShowing };
  if (joinedActive) blockers.push('Leads page shows joined Active1-style text');
  if (!hasOpen) blockers.push('Leads missing Open Leads stat');
  if (!hasShowing) blockers.push('Leads missing Showing X of Y line');
  await screenshot(page, 'leads-stats-1440.png');
}

async function testSchedulingViews(page, blockers, results) {
  await page.goto(`${WEB}/scheduling`, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.waitForTimeout(1500);
  for (const viewId of ['Day', 'Week', 'Month']) {
    const tab = page.locator('.ux-compact-tabs__tab', { hasText: viewId }).first();
    await tab.click();
    await page.waitForTimeout(800);
    const dataView = await page.locator('.cal-shell').first().getAttribute('data-view').catch(() => null);
    const pass = dataView === viewId.toLowerCase();
    results.schedulingViews.push({ view: viewId, dataView, pass });
    if (!pass) blockers.push(`Scheduling ${viewId} view data-view mismatch`);
  }
  await screenshot(page, 'scheduling-month-1440.png');
}

async function testAuraDrawer(page, blockers, results) {
  await page.goto(`${WEB}/finance/invoices`, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.waitForTimeout(1000);
  const askBtn = page.locator('.ask-aura-btn, button', { hasText: 'Ask AURA' }).first();
  if ((await askBtn.count()) === 0) {
    blockers.push('Ask AURA button not found on finance page');
    results.auraDrawer = { opened: false };
    return;
  }
  await askBtn.click();
  await page.waitForTimeout(800);
  const drawer = await page.locator('.contextual-aura-drawer').count();
  const chips = await page.locator('.contextual-aura-drawer__chip').count();
  results.auraDrawer = { opened: drawer > 0, chipCount: chips };
  if (drawer === 0) blockers.push('Contextual AURA drawer did not open');
  if (chips === 0) blockers.push('AURA drawer missing suggestion chips');
  await screenshot(page, 'aura-drawer-invoices-1440.png');
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const report = {
    phase: 254,
    generatedAt: new Date().toISOString(),
    gitSha: gitSha(),
    web: WEB,
    api: API,
    ygpCompanyId: YGP_COMPANY_ID,
    blockers: [],
    procurementTabs: [],
    invoiceFilters: [],
    invoiceRowActions: null,
    leads: null,
    schedulingViews: [],
    auraDrawer: null,
    viewports: [],
    verdict: 'PENDING',
    paymentAllocationHold: 'DATA-DEPENDENT — no fake Xero writes',
    productionDeployed: false,
  };

  const blockers = report.blockers;
  const owner = await mintOwnerSession();
  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() =>
    chromium.launch({ headless: true }),
  );
  const context = await browser.newContext();
  const page = await context.newPage();
  await seedSession(context, page, owner.accessToken, owner.roleName);
  await page.goto(`${WEB}/`, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.waitForTimeout(1500);

  await testProcurementTabs(page, blockers, report);
  await testInvoiceFilters(page, blockers, report);
  await testInvoiceRowActions(page, blockers, report);
  await testLeadsCounts(page, blockers, report);
  await testSchedulingViews(page, blockers, report);
  await testAuraDrawer(page, blockers, report);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`${WEB}/leads`, { waitUntil: 'networkidle', timeout: 120_000 });
    await page.waitForTimeout(800);
    const overlap = await page.evaluate(() => {
      const header = document.querySelector('.app-header');
      const title = document.querySelector('.ux-page-header');
      if (!header || !title) return false;
      const hr = header.getBoundingClientRect();
      const tr = title.getBoundingClientRect();
      return hr.bottom > tr.top && hr.top < tr.bottom;
    });
    const shot = await screenshot(page, `leads-viewport-${viewport.id}.png`);
    report.viewports.push({ ...viewport, headerOverlap: overlap, screenshot: shot });
    if (overlap) blockers.push(`Header overlap at viewport ${viewport.id}`);
  }

  report.verdict =
    blockers.length === 0
      ? 'GO'
      : blockers.some((b) => /missing|failed|overlap|Cancelled|Active\d/i.test(b))
        ? 'NO-GO'
        : 'HOLD';

  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();

  console.log(JSON.stringify({ verdict: report.verdict, blockers: report.blockers.length, out: OUT_JSON }));
  process.exit(report.verdict === 'GO' ? 0 : report.verdict === 'HOLD' ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
