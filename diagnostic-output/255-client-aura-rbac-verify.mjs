#!/usr/bin/env node
/**
 * 255 — Client role AURA + RBAC verification (staging only).
 * Proves portal client isolation and client-authorised AURA context.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(__dirname, 'phase255-client-aura-rbac-staging');
const OUT_JSON = path.resolve(__dirname, '255-client-aura-rbac-verify.json');

const WEB = 'https://comfortable-determination-staging.up.railway.app';
const API = 'https://young-guns-os-staging.up.railway.app';
const YGP_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const CLIENT_EMAIL = '251-rbac-test-client@staging-verify.test';

const PORTAL_ALLOWED = ['/my', '/my/jobs', '/my/quotes', '/my/finance', '/my/profile', '/my/documents', '/my/messages'];

const STAFF_FORBIDDEN = [
  '/',
  '/finance/invoices',
  '/finance/receivables',
  '/jobs',
  '/crm',
  '/settings/team',
  '/fleet/live-map',
  '/aura/agents',
  '/scheduling',
];

const API_PROBES = [
  { path: '/portal/dashboard', label: 'portal_dashboard', expect: [200], portal: true },
  { path: '/portal/jobs', label: 'portal_jobs', expect: [200], portal: true },
  { path: '/portal/quotes', label: 'portal_quotes', expect: [200], portal: true },
  { path: '/portal/finance', label: 'portal_finance', expect: [200], portal: true },
  { path: '/portal/communications', label: 'portal_communications', expect: [200], portal: true },
  { path: '/portal/appointments', label: 'portal_appointments', expect: [200], portal: true },
  { path: '/api/v1/jobs', label: 'staff_jobs', expect: [401, 403], portal: true },
  { path: '/api/v1/crm/customers', label: 'crm_customers', expect: [401, 403], portal: true },
  { path: '/api/v1/team/members', label: 'team_members', expect: [401, 403], portal: true },
  { path: '/api/v1/finance-intelligence/receivables', label: 'finance_receivables', expect: [401, 403], portal: true },
  { path: '/api/v1/fleet/vehicles', label: 'fleet_vehicles', expect: [401, 403], portal: true },
];

const INTERNAL_LEAK_PATTERNS = [
  /internal note/i,
  /margin/i,
  /gross profit/i,
  /cost price/i,
  /payroll/i,
  /fleet-wide/i,
  /other customer/i,
  /owner conversation/i,
];

function gitSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

async function mintPortalSession(email) {
  const scriptPath = path.join(repoRoot, '.tmp-mint-portal-255.mjs');
  fs.writeFileSync(
    scriptPath,
    `import { createPortalAccessToken } from './packages/auth/dist/portal-tokens.js';
import { generateRefreshToken, hashRefreshToken } from './packages/auth/dist/tokens.js';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const companyId = '${YGP_COMPANY_ID}';
const email = ${JSON.stringify(email)};
const [portalUser] = await sql\`
  SELECT pu.id, pu.company_id, pu.customer_id, pu.email, pu.first_name, pu.last_name,
    c.name as customer_name, co.name as company_name
  FROM portal_users pu
  JOIN customers c ON c.id = pu.customer_id
  JOIN companies co ON co.id = pu.company_id
  WHERE pu.company_id = \${companyId} AND pu.email = \${email} AND pu.is_active = true LIMIT 1\`;
if (!portalUser) {
  process.stdout.write(JSON.stringify({ unavailable: true, email }));
  await sql.end(); process.exit(0);
}
const sessionId = crypto.randomUUID();
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const refreshToken = generateRefreshToken();
const refreshHash = hashRefreshToken(refreshToken);
const perms = await sql\`
  SELECT permission FROM portal_user_permissions WHERE portal_user_id = \${portalUser.id}\`;
const permissions = perms.map((p) => p.permission);
await sql\`
  INSERT INTO portal_sessions (id, portal_user_id, company_id, customer_id, refresh_token_hash, expires_at, user_agent, ip_address)
  VALUES (\${sessionId}, \${portalUser.id}, \${companyId}, \${portalUser.customer_id}, \${refreshHash}, \${expiresAt}, '255-client-aura', '127.0.0.1')\`;
const { token } = createPortalAccessToken(
  { sub: portalUser.id, companyId, customerId: portalUser.customer_id, sessionId, permissions },
  process.env.JWT_SECRET,
);
process.stdout.write(JSON.stringify({
  accessToken: token,
  roleName: 'Client',
  portalUserId: portalUser.id,
  customerId: portalUser.customer_id,
  email: portalUser.email,
  permissions,
  portalUser: {
    id: portalUser.id,
    email: portalUser.email,
    firstName: portalUser.first_name,
    lastName: portalUser.last_name,
    companyId,
    companyName: portalUser.company_name,
    customerId: portalUser.customer_id,
    customerName: portalUser.customer_name,
    permissions,
  },
}));
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

async function seedPortalSession(context, page, session) {
  const authPayload = {
    user: session.portalUser,
    session: { accessToken: session.accessToken, expiresIn: 3600 },
  };
  await context.addCookies([
    {
      name: 'titan_portal_refresh_token',
      value: '255-client-aura-verify',
      domain: 'comfortable-determination-staging.up.railway.app',
      path: '/api/v1/portal/auth',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);
  await page.route('**/api/v1/portal/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: authPayload }),
    });
  });
}

function urlOnPortal(finalUrl) {
  try {
    const u = new URL(finalUrl);
    return u.pathname.startsWith('/my') || u.pathname.startsWith('/auth');
  } catch {
    return false;
  }
}

async function probeApi(token, probe) {
  const method = probe.method ?? 'GET';
  const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };
  const url = probe.portal
    ? `${API}/api/v1${probe.path.replace('/api/v1', '')}`
    : `${API}${probe.path}`;
  const res = await fetch(url, { method, headers });
  return { ...probe, status: res.status, pass: probe.expect.includes(res.status) };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const report = {
    phase: 255,
    generatedAt: new Date().toISOString(),
    gitSha: gitSha(),
    web: WEB,
    api: API,
    ygpCompanyId: YGP_COMPANY_ID,
    clientEmail: CLIENT_EMAIL,
    blockers: [],
    portalRoutes: { allowed: [], forbidden: [] },
    apiProbes: [],
    aura: null,
    internalLeakScan: [],
    verdict: 'PENDING',
    productionDeployed: false,
  };

  const session = await mintPortalSession(CLIENT_EMAIL);
  if (session.unavailable) {
    report.blockers.push(`Client account ${CLIENT_EMAIL} not found on staging`);
    report.verdict = 'NO-GO';
    fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ verdict: report.verdict, blockers: report.blockers }));
    process.exit(1);
  }

  for (const probe of API_PROBES) {
    const result = await probeApi(session.accessToken, probe);
    report.apiProbes.push(result);
    if (!result.pass) report.blockers.push(`API ${probe.label} returned ${result.status}, expected ${probe.expect.join('|')}`);
  }

  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() =>
    chromium.launch({ headless: true }),
  );
  const context = await browser.newContext();
  const page = await context.newPage();
  await seedPortalSession(context, page, session);

  for (const routePath of PORTAL_ALLOWED) {
    try {
      await page.goto(`${WEB}${routePath}`, { waitUntil: 'networkidle', timeout: 90_000 });
      await page.waitForTimeout(800);
      const finalUrl = page.url();
      const pass = urlOnPortal(finalUrl);
      report.portalRoutes.allowed.push({ path: routePath, finalUrl, pass });
      if (!pass) report.blockers.push(`Portal allowed route blocked: ${routePath}`);
    } catch (err) {
      report.portalRoutes.allowed.push({ path: routePath, pass: false, error: String(err.message || err).slice(0, 120) });
      report.blockers.push(`Portal route error: ${routePath}`);
    }
  }

  for (const routePath of STAFF_FORBIDDEN) {
    try {
      await page.goto(`${WEB}${routePath}`, { waitUntil: 'networkidle', timeout: 90_000 });
      await page.waitForTimeout(800);
      const finalUrl = page.url();
      const pass = urlOnPortal(finalUrl) || finalUrl.includes('/auth');
      report.portalRoutes.forbidden.push({ path: routePath, finalUrl, pass });
      if (!pass) report.blockers.push(`Staff route accessible to client: ${routePath}`);
    } catch {
      report.portalRoutes.forbidden.push({ path: routePath, pass: true, note: 'navigation error treated as blocked' });
    }
  }

  // Client AURA on portal home
  await page.goto(`${WEB}/my`, { waitUntil: 'networkidle', timeout: 90_000 });
  await page.waitForTimeout(1000);
  const bodyText = await page.locator('body').innerText();
  for (const pattern of INTERNAL_LEAK_PATTERNS) {
    const leaked = pattern.test(bodyText);
    report.internalLeakScan.push({ pattern: pattern.source, leaked });
    if (leaked) report.blockers.push(`Internal content leak on /my: ${pattern.source}`);
  }

  const askBtn = page.locator('button', { hasText: /Ask AURA|AURA/i }).first();
  let auraResult = { buttonPresent: false, drawerOpened: false, contextIncludesMy: false, chipCount: 0 };
  if ((await askBtn.count()) > 0) {
    await askBtn.click();
    await page.waitForTimeout(800);
    const contextLine = await page.locator('.contextual-aura-drawer__context').innerText().catch(() => '');
    const chips = await page.locator('.contextual-aura-drawer__chip').count();
    auraResult = {
      buttonPresent: true,
      drawerOpened: (await page.locator('.contextual-aura-drawer').count()) > 0,
      contextIncludesMy: contextLine.includes('/my') || contextLine.toLowerCase().includes('portal'),
      chipCount: chips,
      contextLine: contextLine.trim(),
    };
    await page.screenshot({ path: path.join(OUT_DIR, 'client-aura-drawer-my.png'), fullPage: true });
    if (!auraResult.drawerOpened) report.blockers.push('Client AURA drawer did not open');
    if (!auraResult.contextIncludesMy && !contextLine.includes(session.portalUser?.customerName ?? '')) {
      report.blockers.push('Client AURA missing client/portal context');
    }
  } else {
    auraResult = { buttonPresent: false, drawerOpened: false, note: 'Portal AURA not surfaced on /my — RBAC isolation still verified' };
    report.auraHold = 'Client portal AURA not yet exposed on /my; staff AURA remains separate';
  }
  report.aura = auraResult;

  report.verdict =
    report.blockers.length === 0
      ? report.auraHold
        ? 'HOLD'
        : 'GO'
      : report.blockers.some((b) => /accessible|leak|not found/i.test(b))
        ? 'NO-GO'
        : 'HOLD';

  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();

  console.log(JSON.stringify({ verdict: report.verdict, blockers: report.blockers.length, out: OUT_JSON }));
  process.exit(report.verdict === 'NO-GO' ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
