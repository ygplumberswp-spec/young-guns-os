#!/usr/bin/env node
/**
 * 232 — Phase 5 Job payment ledger staging verification.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(__dirname, 'phase5-job-payment-staging');
const OUT_JSON = path.resolve(__dirname, '232-job-payment-ledger-verify.json');

const WEB = 'https://comfortable-determination-staging.up.railway.app';
const API = 'https://young-guns-os-staging.up.railway.app';
const YGP_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';

const VIEWPORTS = [
  { id: '1440', width: 1440, height: 1000 },
  { id: '768', width: 768, height: 1024 },
];

async function mintOwnerSession() {
  const scriptPath = path.join(repoRoot, '.tmp-mint-session-232-owner.mjs');
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
  VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, \${expiresAt}, NOW(), '232-phase5-job-ledger', '127.0.0.1')\`;
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
      value: '232-phase5-staging-verify',
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

async function apiCheck(token, pathname) {
  const res = await fetch(`${API}/api/v1${pathname}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function queryStagingPaymentParity() {
  const scriptPath = path.join(repoRoot, '.tmp-xero-payment-parity-232.mjs');
  fs.writeFileSync(
    scriptPath,
    `import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const companyId = '${YGP_COMPANY_ID}';
const [payments] = await sql\`select count(*)::int as count from payments where company_id = \${companyId}\`;
const [mappings] = await sql\`select count(*)::int as count from xero_payment_mappings where company_id = \${companyId}\`;
const [xeroLinked] = await sql\`select count(*)::int as count from payments where company_id = \${companyId} and xero_payment_id is not null\`;
const sample = await sql\`
  select p.id, p.amount_cents, p.xero_payment_id, m.sync_status, m.xero_payment_id as mapping_xero_id
  from payments p
  left join xero_payment_mappings m on m.payment_id = p.id
  where p.company_id = \${companyId}
  order by p.paid_at desc
  limit 5\`;
process.stdout.write(JSON.stringify({ payments: payments.count, mappings: mappings.count, xeroLinked: xeroLinked.count, sample }));
await sql.end();
`,
  );
  try {
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

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let commitSha = 'unknown';
  try {
    commitSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    /* ignore */
  }

  const session = await mintOwnerSession();
  const token = session.accessToken;

  const jobsRes = await apiCheck(token, '/jobs');
  const jobs = jobsRes.json?.data?.jobs ?? [];
  const jobWithFinance = jobs.find((job) => job.finance?.hasFinanceData) ?? jobs[0] ?? null;
  const financeSummaryRes = jobWithFinance
    ? await apiCheck(token, `/finance/jobs/${jobWithFinance.id}/finance-summary`)
    : { status: 0, json: null };

  const ledger = financeSummaryRes.json?.data?.summary?.ledger ?? null;
  const xeroParity = await queryStagingPaymentParity();

  const report = {
    schemaVersion: 'phase5-job-payment-ledger-v1',
    label: '232-job-payment-ledger-verify',
    generatedAt: new Date().toISOString(),
    branch: 'cursor/titan-owner-operating-model-final',
    commitSha,
    stagingWeb: WEB,
    stagingApi: API,
    auth: { method: 'railway_programmatic_session', secretsInOutput: false },
    api: {
      jobsStatus: jobsRes.status,
      jobCount: jobs.length,
      sampleJobId: jobWithFinance?.id ?? null,
      sampleHasFinanceEnrichment: Boolean(jobs[0]?.finance !== undefined),
      sampleFinanceHasData: Boolean(jobs.find((j) => j.finance?.hasFinanceData)),
      financeSummaryStatus: financeSummaryRes.status,
      ledgerPresent: Boolean(ledger),
      ledgerFields: ledger
        ? {
            paymentState: ledger.paymentState,
            paymentCount: ledger.paymentCount,
            hasFinanceData: ledger.hasFinanceData,
            totalReceivedCents: ledger.totalReceivedCents,
          }
        : null,
      xeroParity,
    },
    ui: { routes: [], viewports: [] },
    blockers: [],
    holdItems: [],
    verdict: 'HOLD',
  };

  if (jobsRes.status !== 200) report.blockers.push(`Jobs API HTTP ${jobsRes.status}`);
  if (!jobs[0]?.finance) report.blockers.push('Job list missing finance enrichment object');
  if (financeSummaryRes.status !== 200) {
    report.blockers.push(`Job finance-summary HTTP ${financeSummaryRes.status}`);
  }
  if (!ledger) report.blockers.push('Job finance-summary missing ledger object');

  if (xeroParity.payments > 0 && xeroParity.mappings === 0) {
    report.holdItems.push(
      `Xero payment_mappings count 0 with ${xeroParity.payments} TITAN payments — allocation parity incomplete`,
    );
  }

  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() =>
    chromium.launch({ headless: true }),
  );
  const context = await browser.newContext();
  const page = await context.newPage();
  await seedSession(context, page, token, session.roleName, ['*']);

  await page.goto(`${WEB}/jobs`, { waitUntil: 'networkidle', timeout: 90_000 });
  await page.waitForSelector('table thead th', { timeout: 30_000 }).catch(() => null);
  const jobHeaders = await page.locator('table thead th').allTextContents();
  const expectedJobHeaders = ['Payment', 'Balance', 'Quote', 'Invoice', 'Suburb'];
  const headerChecks = Object.fromEntries(
    expectedJobHeaders.map((h) => [h, jobHeaders.some((text) => text.includes(h))]),
  );
  report.ui.routes.push({ path: '/jobs', headerChecks, jobHeaders: jobHeaders.map((h) => h.trim()) });
  for (const [header, ok] of Object.entries(headerChecks)) {
    if (!ok) report.blockers.push(`jobs list missing column "${header}"`);
  }

  if (jobWithFinance?.id) {
    await page.goto(`${WEB}/jobs/${jobWithFinance.id}`, { waitUntil: 'networkidle', timeout: 90_000 });
    const tabLabels = await page.locator('.customer-360__tab, .job-360 .customer-360__tab').allTextContents();
    const expectedTabs = ['Overview', 'Payment', 'Invoice', 'Quote', 'Schedule'];
    for (const tab of expectedTabs) {
      if (!tabLabels.some((label) => label.includes(tab))) {
        report.blockers.push(`Job 360 missing tab: ${tab}`);
      }
    }
    await page.locator('.customer-360__tab', { hasText: 'Payment' }).click();
    await page.waitForTimeout(800);
    const paymentTabShot = path.join(OUT_DIR, 'job-360-payment.png');
    await page.screenshot({ path: paymentTabShot, fullPage: false });
    report.ui.job360 = {
      jobId: jobWithFinance.id,
      tabs: tabLabels.map((t) => t.trim()),
      paymentScreenshot: path.relative(repoRoot, paymentTabShot),
    };
  } else {
    report.holdItems.push('No sample job for Job 360 verification');
  }

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`${WEB}/jobs`, { waitUntil: 'networkidle', timeout: 90_000 });
    await page.waitForTimeout(600);
    const shot = path.join(OUT_DIR, `jobs-list-${vp.id}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    report.ui.viewports.push({ ...vp, screenshot: path.relative(repoRoot, shot) });
  }

  await browser.close();

  report.verdict = report.blockers.length === 0 ? 'GO' : report.blockers.length <= 1 && report.holdItems.length > 0 ? 'HOLD' : report.blockers.length > 0 ? 'HOLD' : 'GO';
  if (report.blockers.length === 0 && report.holdItems.length > 0) report.verdict = 'HOLD';

  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ verdict: report.verdict, blockers: report.blockers, holdItems: report.holdItems }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
