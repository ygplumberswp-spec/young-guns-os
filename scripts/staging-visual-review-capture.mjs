#!/usr/bin/env node
/**
 * Authenticated TITAN visual review package (staging only).
 * Creates a disposable owner tenant, captures screenshots, generates index + findings.
 * Does NOT commit auth tokens or passwords.
 *
 * Usage:
 *   node scripts/staging-visual-review-capture.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_ROOT = path.join(repoRoot, 'diagnostic-output/final-visual-review');
const TMP_AUTH_DIR = path.join(repoRoot, 'diagnostic-output/.tmp-visual-review-auth');
const STORAGE_STATE = path.join(TMP_AUTH_DIR, 'storage-state.json');
const ZIP_PATH = path.join(repoRoot, 'diagnostic-output/TITAN_AUTHENTICATED_VISUAL_REVIEW.zip');
const INDEX_PATH = path.join(repoRoot, 'TITAN_VISUAL_REVIEW_INDEX.md');
const FINDINGS_PATH = path.join(repoRoot, 'TITAN_VISUAL_REVIEW_FINDINGS.md');
const MANIFEST_PATH = path.join(OUT_ROOT, 'capture-manifest.json');

const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const API_ORIGIN = (process.env.STAGING_API_BASE || 'https://young-guns-os-staging.up.railway.app').replace(/\/$/, '');
const WEB_ORIGIN = (process.env.STAGING_WEB_BASE || 'https://comfortable-determination-staging.up.railway.app').replace(/\/$/, '');

const VIEWPORTS = [
  { id: '1440', width: 1440, height: 900 },
  { id: '1280', width: 1280, height: 800 },
  { id: '1024', width: 1024, height: 768 },
  { id: '768', width: 768, height: 1024 },
  { id: '375', width: 375, height: 812 },
];

const TECHNICAL_PATTERNS = [
  /not implemented/i,
  /coming soon/i,
  /lorem ipsum/i,
  /knowledge graph/i,
  /deployment status/i,
  /documentation percentage/i,
  /production launch/i,
  /release management/i,
  /developer platform/i,
  /canonical role/i,
  /conflict_metadata/i,
  /postgres/i,
  /unexpected error/i,
];

function slug(s) {
  return s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

async function api(pathname, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_ORIGIN}${pathname}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

async function waitForAppShell(page) {
  await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});
  await page
    .waitForSelector('.app-content-container, .app-nav, .dashboard, .page-header, h1, .exec-dashboard', { timeout: 25_000 })
    .catch(() => {});
  await page.waitForTimeout(800);
}

async function capturePageSections(page, dir, baseName, viewport) {
  const shots = [];
  const fullPath = path.join(dir, `${baseName}_${viewport.id}_full.png`);
  await page.screenshot({ path: fullPath, fullPage: true });
  shots.push({ file: path.relative(repoRoot, fullPath), kind: 'full' });

  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  if (scrollHeight > viewport.height * 1.4) {
    for (const [label, ratio] of [
      ['top', 0],
      ['middle', 0.5],
      ['bottom', 1],
    ]) {
      await page.evaluate((r) => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo(0, Math.max(0, max * r));
      }, ratio);
      await page.waitForTimeout(400);
      const sectionPath = path.join(dir, `${baseName}_${viewport.id}_${label}.png`);
      await page.screenshot({ path: sectionPath, fullPage: false });
      shots.push({ file: path.relative(repoRoot, sectionPath), kind: label });
    }
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  return shots;
}

async function analyzeDom(page, routeMeta) {
  const data = await page.evaluate(() => {
    const rectOverlap = (a, b) =>
      !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
    const cards = Array.from(document.querySelectorAll('.ux-summary-card, .exec-dashboard-glance .card, .panel, .stat-card, [class*="summary"]'));
    let touchingPairs = 0;
    const rects = cards.slice(0, 24).map((el) => el.getBoundingClientRect());
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const gap = Math.min(
          Math.abs(rects[i].right - rects[j].left),
          Math.abs(rects[j].right - rects[i].left),
          Math.abs(rects[i].bottom - rects[j].top),
          Math.abs(rects[j].bottom - rects[i].top),
        );
        if (rectOverlap(rects[i], rects[j]) && gap < 2) touchingPairs++;
      }
    }
    return {
      backButton: !!document.querySelector('.ux-back-button, [class*="back-button"]'),
      pageHeader: !!document.querySelector('.page-header, .ux-page-header, h1'),
      rowActions: document.querySelectorAll('.ux-row-actions').length,
      moreMenus: document.querySelectorAll('.ux-more-menu__trigger').length,
      bulkBar: !!document.querySelector('.ux-bulk-action-bar, [class*="bulk"]'),
      confirmDialog: !!document.querySelector('.ux-confirm-dialog'),
      bodyText: (document.body?.innerText || '').slice(0, 8000),
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
      touchingPairs,
    };
  });
  const findings = [];
  if (routeMeta.expectBack && !data.backButton) findings.push('Missing Back button');
  if (routeMeta.expectActions && data.rowActions === 0) findings.push('Missing visible Edit/More row actions');
  if (data.overflowX) findings.push('Horizontal overflow detected');
  if (data.touchingPairs > 0) findings.push(`Possible touching cards (${data.touchingPairs} pairs)`);
  for (const pat of TECHNICAL_PATTERNS) {
    if (pat.test(data.bodyText)) findings.push(`Technical wording: ${pat.source}`);
  }
  return { ...data, findings };
}

async function main() {
  if (API_ORIGIN.toLowerCase().includes(FORBIDDEN)) {
    console.error('Blocked: production reference');
    process.exit(3);
  }

  fs.mkdirSync(OUT_ROOT, { recursive: true });
  fs.mkdirSync(TMP_AUTH_DIR, { recursive: true });

  const manifest = {
    schemaVersion: 'titan-visual-review-v1',
    startedAt: new Date().toISOString(),
    webOrigin: WEB_ORIGIN,
    apiOrigin: API_ORIGIN,
    viewports: VIEWPORTS.map((v) => v.id),
    routes: [],
    interactions: [],
    auth: { method: 'disposable-signup', emailRedacted: true },
  };

  const ready = await api('/api/v1/health/ready');
  if (ready.status !== 200) throw new Error(`Staging API not ready: ${ready.status}`);

  const suffix = randomBytes(4).toString('hex');
  const password = `VisualReview_${suffix}!`;
  const email = `visual.review.${suffix}@staging-visual-review.test`;

  const signup = await api('/api/v1/auth/signup', {
    method: 'POST',
    body: {
      companyName: `Visual Review ${suffix}`,
      firstName: 'Visual',
      lastName: 'Reviewer',
      email,
      password,
    },
  });
  const token = signup.json?.data?.session?.accessToken;
  if (signup.status !== 201 || !token) throw new Error(`Signup failed: ${JSON.stringify(signup.json)}`);
  manifest.auth.emailDomain = '@staging-visual-review.test';

  const customerRes = await api('/api/v1/crm/customers', {
    method: 'POST',
    token,
    body: { name: `Review Customer ${suffix}`, phone: '0825551234', email: `cust.${suffix}@example.test` },
  });
  const customerId = customerRes.json?.data?.customer?.id;

  const leadRes = await api('/api/v1/leads', {
    method: 'POST',
    token,
    body: {
      name: `Review Lead ${suffix}`,
      phone: '0825555678',
      email: `lead.${suffix}@example.test`,
      serviceRequired: 'Plumbing',
      source: 'Visual review',
      duplicateOverrideReason: 'Visual review staging capture',
    },
  });
  const leadId = leadRes.json?.data?.lead?.id;

  const jobRes = await api('/api/v1/jobs', {
    method: 'POST',
    token,
    body: {
      customerId,
      jobType: 'Plumbing',
      priority: 'normal',
      description: 'Visual review staging job',
      siteContact: { name: 'Site Contact', mobile: '0845551234' },
      newProperty: {
        propertyName: 'Review site',
        street: `9 Review Street ${suffix}`,
        suburb: 'Observatory',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '7925',
      },
    },
  });
  const jobId = jobRes.json?.data?.job?.id;

  const routeDefs = [
    { id: 'dashboard', name: 'Dashboard', path: '/', expectBack: false, expectActions: false },
    { id: 'customers', name: 'Customers', path: '/crm', expectBack: true, expectActions: true },
    { id: 'customer-detail', name: 'Customer Detail', path: customerId ? `/crm/${customerId}` : '/crm', expectBack: true, expectActions: false },
    { id: 'leads', name: 'Leads', path: '/leads', expectBack: true, expectActions: true },
    { id: 'lead-detail', name: 'Lead Detail', path: leadId ? `/leads/${leadId}` : '/leads', expectBack: true, expectActions: false },
    { id: 'jobs', name: 'Jobs', path: '/jobs', expectBack: true, expectActions: true },
    { id: 'job-detail', name: 'Job Detail', path: jobId ? `/jobs/${jobId}` : '/jobs', expectBack: true, expectActions: false },
    { id: 'scheduling-week', name: 'Scheduling — Week', path: '/scheduling', expectBack: true, calendarView: 'week' },
    { id: 'scheduling-day', name: 'Scheduling — Day', path: '/scheduling', expectBack: true, calendarView: 'day' },
    { id: 'scheduling-month', name: 'Scheduling — Month', path: '/scheduling', expectBack: true, calendarView: 'month' },
    { id: 'mobile-schedule', name: 'Mobile Technician Schedule', path: '/mobile/schedule', expectBack: true },
    { id: 'quotes', name: 'Quotes', path: '/finance/quotes', expectBack: true },
    { id: 'invoices', name: 'Invoices', path: '/finance/invoices', expectBack: true },
    { id: 'payments', name: 'Payments', path: '/finance/payments', expectBack: true },
    { id: 'live-dispatch', name: 'Live Dispatch', path: '/mobile-platform/dispatcher', expectBack: true },
    { id: 'fleet', name: 'Fleet', path: '/fleet', expectBack: true },
    { id: 'fleet-live-map', name: 'Fleet Live Map', path: '/fleet/live-map', expectBack: true },
    { id: 'inventory', name: 'Inventory', path: '/inventory/stock', expectBack: true },
    { id: 'documents', name: 'Documents', path: '/documents', expectBack: true },
    { id: 'communications', name: 'Communications', path: '/communications/messages', expectBack: true },
    { id: 'analytics', name: 'Analytics', path: '/analytics', expectBack: true },
    { id: 'marketing', name: 'Marketing', path: '/marketing-intelligence', expectBack: true },
    { id: 'aura-team', name: 'AURA Team', path: '/aura/agents', expectBack: true },
    { id: 'aura-executive-chat', name: 'AURA Executive Chat', path: '/aura', expectBack: true },
    { id: 'todays-plan', name: "Today's Plan", path: '/aura/todays-plan', expectBack: true },
    { id: 'automations', name: 'Automations', path: '/automation', expectBack: true },
    { id: 'company-health', name: 'Company Health', path: '/mission-control', expectBack: true },
    { id: 'settings', name: 'Settings', path: '/settings/company', expectBack: true },
    { id: 'team-access', name: 'Team & Access', path: '/settings/team', expectBack: true },
    { id: 'integrations', name: 'Integrations', path: '/integrations', expectBack: true },
    { id: 'security', name: 'Security', path: '/settings/security', expectBack: true },
    { id: 'platform-health', name: 'Platform Health', path: '/settings/advanced/platform-health', expectBack: true },
  ];

  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${WEB_ORIGIN}/auth/login`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/auth/login'), { timeout: 60_000 });
  await context.storageState({ path: STORAGE_STATE });

  const allFindings = [];

  for (const route of routeDefs) {
    const routeDir = path.join(OUT_ROOT, route.id);
    fs.mkdirSync(routeDir, { recursive: true });
    const routeRecord = { ...route, path: route.path, screenshots: [], domChecks: [] };

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`${WEB_ORIGIN}${route.path}`, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {});
      await waitForAppShell(page);

      if (route.calendarView) {
        const tab = page.getByRole('tab', { name: new RegExp(`^${route.calendarView}$`, 'i') }).or(
          page.locator('button').filter({ hasText: new RegExp(`^${route.calendarView}$`, 'i') }),
        );
        if ((await tab.count()) > 0) {
          await tab.first().click();
          await page.waitForTimeout(600);
        }
      }

      const shots = await capturePageSections(page, routeDir, 'page', viewport);
      routeRecord.screenshots.push(...shots.map((s) => ({ ...s, viewport: viewport.id })));

      if (viewport.id === '1280') {
        const dom = await analyzeDom(page, route);
        routeRecord.domChecks.push({ viewport: viewport.id, ...dom });
        if (dom.findings.length) {
          allFindings.push({ route: route.name, url: route.path, viewport: viewport.id, issues: dom.findings });
        }
      }
    }
    manifest.routes.push(routeRecord);
  }

  // Interaction states @ 1280
  await page.setViewportSize({ width: 1280, height: 800 });
  const interactionDir = path.join(OUT_ROOT, '_interactions');
  fs.mkdirSync(interactionDir, { recursive: true });

  async function captureInteraction(name, fn) {
    try {
      await fn();
      await page.waitForTimeout(500);
      const file = path.join(interactionDir, `${slug(name)}.png`);
      await page.screenshot({ path: file, fullPage: false });
      manifest.interactions.push({ name, file: path.relative(repoRoot, file) });
    } catch (err) {
      manifest.interactions.push({ name, error: String(err).slice(0, 200) });
    }
  }

  await captureInteraction('customers-more-menu', async () => {
    await page.goto(`${WEB_ORIGIN}/crm`, { waitUntil: 'networkidle' });
    await waitForAppShell(page);
    const more = page.locator('.ux-more-menu__trigger').first();
    if ((await more.count()) > 0) await more.click();
  });

  await captureInteraction('customers-bulk-bar', async () => {
    await page.goto(`${WEB_ORIGIN}/crm`, { waitUntil: 'networkidle' });
    await waitForAppShell(page);
    const cb = page.locator('input[type="checkbox"]').nth(1);
    if ((await cb.count()) > 0) await cb.check();
  });

  await captureInteraction('customers-confirm-dialog', async () => {
    await page.goto(`${WEB_ORIGIN}/crm`, { waitUntil: 'networkidle' });
    await waitForAppShell(page);
    const more = page.locator('.ux-more-menu__trigger').first();
    if ((await more.count()) > 0) {
      await more.click();
      const deleteItem = page.locator('.ux-more-menu__item').filter({ hasText: /delete|archive/i }).first();
      if ((await deleteItem.count()) > 0) {
        await deleteItem.click();
        await page.waitForTimeout(400);
        const cancel = page.locator('.ux-confirm-dialog__cancel, button:has-text("Cancel")').first();
        if ((await cancel.count()) > 0) await cancel.click();
      }
    }
  });

  await captureInteraction('leads-status-badge', async () => {
    await page.goto(`${WEB_ORIGIN}/leads`, { waitUntil: 'networkidle' });
    await waitForAppShell(page);
    const badge = page.locator('.status-badge-dropdown, [class*="status-badge"]').first();
    if ((await badge.count()) > 0) await badge.click();
  });

  await captureInteraction('jobs-more-menu', async () => {
    await page.goto(`${WEB_ORIGIN}/jobs`, { waitUntil: 'networkidle' });
    await waitForAppShell(page);
    const more = page.locator('.ux-more-menu__trigger').first();
    if ((await more.count()) > 0) await more.click();
  });

  await captureInteraction('scheduling-week-view', async () => {
    await page.goto(`${WEB_ORIGIN}/scheduling`, { waitUntil: 'networkidle' });
    await waitForAppShell(page);
  });

  await captureInteraction('fleet-live-map', async () => {
    await page.goto(`${WEB_ORIGIN}/fleet/live-map`, { waitUntil: 'networkidle' });
    await waitForAppShell(page);
    const marker = page.locator('[class*="fleet-live-map"] button, [class*="vehicle"]').first();
    if ((await marker.count()) > 0) await marker.click();
  });

  await captureInteraction('back-button-customers', async () => {
    await page.goto(`${WEB_ORIGIN}/crm`, { waitUntil: 'networkidle' });
    await waitForAppShell(page);
  });

  // Safe mocked error — intercept customer value metrics only
  await captureInteraction('dashboard-section-error-mock', async () => {
    await page.route('**/api/v1/crm/customers/value-metrics**', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Review mock failure' } }) }),
    );
    await page.goto(`${WEB_ORIGIN}/`, { waitUntil: 'networkidle' });
    await waitForAppShell(page);
    await page.unroute('**/api/v1/crm/customers/value-metrics**');
  });

  await browser.close();

  // Delete temp auth
  try {
    fs.rmSync(TMP_AUTH_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  manifest.finishedAt = new Date().toISOString();
  manifest.totalScreenshots = manifest.routes.reduce((n, r) => n + r.screenshots.length, 0) + manifest.interactions.filter((i) => i.file).length;
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  // Index markdown
  const indexLines = [
    '# TITAN Authenticated Visual Review Index',
    '',
    `Generated: ${manifest.finishedAt}`,
    '',
    `Staging web: ${WEB_ORIGIN}`,
    '',
    '## Routes',
    '',
    '| Route | URL | Viewports | Screenshots |',
    '|-------|-----|-----------|-------------|',
  ];
  for (const r of manifest.routes) {
    indexLines.push(`| ${r.name} | \`${r.path}\` | ${VIEWPORTS.map((v) => v.id).join(', ')} | ${r.screenshots.length} |`);
    for (const s of r.screenshots) {
      indexLines.push(`| | | ${s.viewport} (${s.kind}) | [\`${s.file}\`](${s.file}) |`);
    }
  }
  indexLines.push('', '## Interaction captures', '');
  for (const i of manifest.interactions) {
    indexLines.push(i.file ? `- **${i.name}**: [\`${i.file}\`](${i.file})` : `- **${i.name}**: _${i.error || 'skipped'}_`);
  }
  fs.writeFileSync(INDEX_PATH, indexLines.join('\n'));

  // Findings markdown
  const findingLines = [
    '# TITAN Visual Review Findings',
    '',
    `Generated: ${manifest.finishedAt}`,
    '',
    'Automated DOM heuristics at 1280px laptop width on authenticated staging.',
    '',
  ];
  if (allFindings.length === 0) {
    findingLines.push('No automated layout or navigation issues detected at 1280px.');
  } else {
    findingLines.push('| Route | URL | Issues |', '|-------|-----|--------|');
    for (const f of allFindings) {
      findingLines.push(`| ${f.route} | \`${f.url}\` | ${f.issues.join('; ')} |`);
    }
  }
  findingLines.push(
    '',
    '## Review checklist for external design review',
    '',
    '- Misalignment / floating-left content',
    '- Touching cards or shared borders',
    '- Missing Back buttons on internal routes',
    '- Clipped More menus or dropdowns',
    '- Missing Edit/More on list pages',
    '- Poor mobile (375px) layouts',
    '- Calendar orphan layouts or missing time grid',
    '- Fleet map missing markers or stale warnings',
    '- Technical/developer wording on business pages',
    '- Duplicate controls or inconsistent spacing',
    '',
    '## Security',
    '',
    '- No passwords, tokens, or auth files included in this package.',
    '- Disposable review tenant used; credentials were not persisted.',
  );
  fs.writeFileSync(FINDINGS_PATH, findingLines.join('\n'));

  // Zip package (screenshots + index copies only inside review folder)
  fs.copyFileSync(INDEX_PATH, path.join(OUT_ROOT, 'TITAN_VISUAL_REVIEW_INDEX.md'));
  fs.copyFileSync(FINDINGS_PATH, path.join(OUT_ROOT, 'TITAN_VISUAL_REVIEW_FINDINGS.md'));
  try {
    if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH);
    execSync(`cd "${path.join(repoRoot, 'diagnostic-output')}" && zip -rq TITAN_AUTHENTICATED_VISUAL_REVIEW.zip final-visual-review`, {
      stdio: 'inherit',
    });
  } catch (err) {
    console.warn('zip failed — install zip or archive manually:', err.message);
  }

  console.log(`Capture complete: ${manifest.totalScreenshots} screenshots`);
  console.log(`Manifest: ${MANIFEST_PATH}`);
  console.log(`Index: ${INDEX_PATH}`);
  console.log(`Findings: ${FINDINGS_PATH}`);
  console.log(`Zip: ${ZIP_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
