#!/usr/bin/env node
/**
 * 234 — Phase 4 CRM row actions, bulk UX and Customer 360 staging verification.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(__dirname, 'phase4-crm-staging');
const OUT_JSON = path.resolve(__dirname, '234-crm-actions-bulk-delete-verify.json');

const WEB = 'https://comfortable-determination-staging.up.railway.app';
const API = 'https://young-guns-os-staging.up.railway.app';
const YGP_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';

const VIEWPORTS = [
  { id: '1440', width: 1440, height: 1000 },
  { id: '768', width: 768, height: 1024 },
  { id: '375', width: 375, height: 812 },
];

async function mintOwnerSession() {
  const scriptPath = path.join(repoRoot, '.tmp-mint-session-234-owner.mjs');
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
  VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, \${expiresAt}, NOW(), '234-phase4-crm', '127.0.0.1')\`;
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
      value: '234-phase4-staging-verify',
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
  await page.goto(`${WEB}/`, { waitUntil: 'networkidle', timeout: 90_000 });
}

async function apiCheck(token, pathname, method = 'GET', body) {
  const res = await fetch(`${API}/api/v1${pathname}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let commitSha = '';
  try {
    commitSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    commitSha = 'unknown';
  }

  const session = await mintOwnerSession();
  const token = session.accessToken;

  const customersRes = await apiCheck(token, '/crm/customers');
  const customers = customersRes.json?.data?.customers ?? [];
  const sampleCustomerId = customers[0]?.id ?? null;

  const bulkDryRun = sampleCustomerId
    ? await apiCheck(token, '/crm/customers/bulk', 'POST', {
        ids: [sampleCustomerId],
        action: 'set_status',
        status: 'active',
      })
    : { status: 0, json: null };

  const report = {
    schemaVersion: 'phase4-crm-actions-v1',
    label: '234-crm-actions-bulk-delete-verify',
    generatedAt: new Date().toISOString(),
    branch: 'cursor/titan-owner-operating-model-final',
    commitSha,
    stagingWeb: WEB,
    stagingApi: API,
    auth: { method: 'railway_programmatic_session', secretsInOutput: false },
    api: {
      customersStatus: customersRes.status,
      customerCount: customers.length,
      sampleHasListEnrichment: Boolean(
        customers[0]?.lastJobAt != null ||
          customers[0]?.lastActivityAt != null ||
          customers[0]?.primarySuburb != null ||
          customers[0]?.primaryAddressDisplay != null,
      ),
      bulkEndpointStatus: bulkDryRun.status,
      bulkHasSummary: Boolean(bulkDryRun.json?.data?.results),
    },
    ui: { routes: [], viewports: [] },
    blockers: [],
    holdItems: [],
    verdict: 'HOLD',
  };

  if (customersRes.status !== 200) {
    report.blockers.push(`CRM customers API HTTP ${customersRes.status}`);
  }
  if (bulkDryRun.status !== 200) {
    report.blockers.push(`CRM bulk API HTTP ${bulkDryRun.status}`);
  }

  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() =>
    chromium.launch({ headless: true }),
  );
  const context = await browser.newContext();
  const page = await context.newPage();
  await seedSession(context, page, token, session.roleName, ['*']);

  const routes = [
    { path: '/crm', name: 'customers', expectHeaders: ['Outstanding', 'Actions', 'Last job'] },
    { path: '/leads', name: 'leads', expectHeaders: ['Service', 'Age', 'Actions'] },
  ];

  for (const route of routes) {
    await page.goto(`${WEB}${route.path}`, { waitUntil: 'networkidle', timeout: 90_000 });
    await page.waitForSelector('table thead th', { timeout: 30_000 }).catch(() => null);
    const headers = await page.locator('table thead th').allTextContents();
    const headerChecks = Object.fromEntries(
      route.expectHeaders.map((h) => [h, headers.some((text) => text.includes(h))]),
    );
    const hasRowActionsDesktop = (await page.locator('.ux-row-actions--desktop .ux-row-actions__btn').count()) > 0;
    const hasMoreMenu = (await page.locator('.ux-more-menu__trigger').count()) > 0;
    const hasFloatingPencil = (await page.locator('.ux-row-actions__edit-icon').count()) > 0;

    const firstCheckbox = page.locator('tbody input[type="checkbox"]').first();
    if (await firstCheckbox.count()) {
      await firstCheckbox.check();
    }
    const bulkLabels = await page.locator('.ux-bulk-bar__actions button').allTextContents();
    const hasBulkEmail = bulkLabels.some((l) => /email/i.test(l));
    const hasBulkArchive = bulkLabels.some((l) => /archive/i.test(l));
    const hasBulkDelete = bulkLabels.some((l) => /^delete$/i.test(l.trim()));

    report.ui.routes.push({
      ...route,
      headerChecks,
      hasRowActionsDesktop,
      hasMoreMenu,
      hasFloatingPencil,
      bulkActions: bulkLabels.map((l) => l.trim()).filter(Boolean),
      hasBulkEmail,
      hasBulkArchive,
      hasBulkDelete,
    });

    for (const [header, ok] of Object.entries(headerChecks)) {
      if (!ok) report.blockers.push(`${route.name}: missing column header "${header}"`);
    }
    if (!hasRowActionsDesktop) report.blockers.push(`${route.name}: missing desktop row actions`);
    if (hasFloatingPencil) report.blockers.push(`${route.name}: floating edit pencil still present`);
    if (!hasBulkEmail) report.blockers.push(`${route.name}: missing bulk Email action`);
    if (!hasBulkArchive) report.blockers.push(`${route.name}: missing bulk Archive action`);
    if (hasBulkDelete && route.name === 'customers') {
      report.holdItems.push(`${route.name}: bulk Delete visible to Owner (expected with typed DELETE guard)`);
    }
  }

  if (sampleCustomerId) {
    await page.goto(`${WEB}/crm/${sampleCustomerId}`, { waitUntil: 'networkidle', timeout: 90_000 });
    const tabLabels = await page.locator('.customer-360__tab').allTextContents();
    const expectedTabs = ['Overview', 'Properties', 'Jobs', 'Communications', 'Activity'];
    for (const tab of expectedTabs) {
      if (!tabLabels.some((label) => label.includes(tab))) {
        report.blockers.push(`Customer 360 missing tab: ${tab}`);
      }
    }
    await page.locator('.customer-360__tab', { hasText: 'Finance' }).click();
    await page.waitForTimeout(800);
    const shot360 = path.join(OUT_DIR, 'customer-360-finance.png');
    await page.screenshot({ path: shot360, fullPage: false });
    report.ui.customer360 = {
      customerId: sampleCustomerId,
      tabs: tabLabels.map((t) => t.trim()),
      financeScreenshot: path.relative(repoRoot, shot360),
    };
  } else {
    report.holdItems.push('No sample customer for Customer 360 tab verification');
  }

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`${WEB}/crm`, { waitUntil: 'networkidle', timeout: 90_000 });
    await page.waitForTimeout(800);
    const mobileActions = (await page.locator('.ux-row-actions--mobile .ux-more-menu__trigger').count()) > 0;
    const shot = path.join(OUT_DIR, `crm-list-${vp.id}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    report.ui.viewports.push({
      ...vp,
      mobileActionsMenu: mobileActions,
      screenshot: path.relative(repoRoot, shot),
    });
    if (vp.id === '375' && !mobileActions) {
      report.blockers.push('Mobile: missing single Actions menu');
    }
  }

  await browser.close();

  if (!report.api.sampleHasListEnrichment && customers.length > 0) {
    report.holdItems.push('Customer list enrichment fields sparse on sample row (may be empty tenant data)');
  }
  report.holdItems.push('Lead estimated value column shows — until quote-linked value exists');

  report.verdict = report.blockers.length === 0 ? 'GO' : 'HOLD';
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict: report.verdict, blockers: report.blockers, out: OUT_JSON }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
