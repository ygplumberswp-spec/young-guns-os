#!/usr/bin/env node
/**
 * 247 — Phase 15 Analytics & Reporting staging verification.
 * Authenticated owner session via railway run (237/246 pattern). No secrets in output.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(__dirname, 'phase15-analytics-reporting-staging');
const OUT_JSON = path.resolve(__dirname, '247-analytics-reporting-verify.json');

const WEB = 'https://comfortable-determination-staging.up.railway.app';
const API = 'https://young-guns-os-staging.up.railway.app';
const YGP_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';

const VIEWPORTS = [
  { id: '1440', width: 1440, height: 1000 },
  { id: '768', width: 768, height: 1024 },
];

const REQUIRED_SECTIONS = ['executive', 'operational', 'financial', 'sales'];
const REQUIRED_EXECUTIVE_METRICS = ['invoiced_revenue', 'cash_received'];

async function mintOwnerSession() {
  const existing = process.env.OWNER_ACCESS_TOKEN?.trim();
  if (existing) {
    return { accessToken: existing, refreshToken: null, method: 'OWNER_ACCESS_TOKEN' };
  }

  const scriptPath = path.join(repoRoot, '.tmp-mint-session-247-owner.mjs');
  fs.writeFileSync(
    scriptPath,
    `import { createAccessToken, generateRefreshToken, hashRefreshToken } from './packages/auth/dist/tokens.js';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const companyId = '${YGP_COMPANY_ID}';
const [user] = await sql\`
  SELECT u.id, u.role_id, r.name as role_name, r.permissions
  FROM users u JOIN roles r ON r.id = u.role_id
  WHERE u.company_id = \${companyId} AND u.is_active = true
  ORDER BY u.created_at ASC LIMIT 1\`;
if (!user) throw new Error('no owner user');
const permissionKeys = Array.isArray(user.permissions) ? user.permissions : [];
const sessionId = crypto.randomUUID();
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const refreshToken = generateRefreshToken();
const refreshHash = hashRefreshToken(refreshToken);
await sql\`
  INSERT INTO sessions (id, user_id, company_id, refresh_token_hash, expires_at, last_activity_at, user_agent, ip_address)
  VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, \${expiresAt}, NOW(), '247-phase15-analytics', '127.0.0.1')\`;
const { token } = createAccessToken(
  { sub: user.id, companyId, roleId: user.role_id, roleName: user.role_name, sessionId, permissions: permissionKeys },
  process.env.JWT_SECRET,
);
process.stdout.write(JSON.stringify({ accessToken: token, refreshToken }));
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
    const parsed = JSON.parse(raw);
    if (!parsed.accessToken || parsed.accessToken.length < 40) {
      throw new Error('Failed to mint staging owner session');
    }
    return { ...parsed, method: 'railway_programmatic_session' };
  } finally {
    fs.rmSync(scriptPath, { force: true });
  }
}

async function fetchAuthPayload(token) {
  const res = await fetch(`${API}/api/v1/auth/me`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`auth/me failed: ${res.status}`);
  const json = await res.json();
  return { user: json.data.user, session: { accessToken: token, expiresIn: 3600 } };
}

async function seedSession(context, page, token) {
  const authPayload = await fetchAuthPayload(token);
  await context.addCookies([
    {
      name: 'titan_refresh_token',
      value: '247-phase15-staging-verify',
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

function metricById(section, id) {
  return section?.metrics?.find((m) => m.id === id) ?? null;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const session = await mintOwnerSession();
  const token = session.accessToken;

  let commitSha = '';
  try {
    commitSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    commitSha = 'unknown';
  }

  const apiRes = await fetch(`${API}/api/v1/analytics/reporting-workspace?period=monthly`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const apiJson = apiRes.ok ? await apiRes.json() : null;
  const workspace = apiJson?.data?.workspace ?? null;

  const executive = workspace?.sections?.find((s) => s.id === 'executive') ?? null;
  const invoiced = metricById(executive, 'invoiced_revenue');
  const cash = metricById(executive, 'cash_received');

  const report = {
    schemaVersion: 'phase15-analytics-reporting-v1',
    label: '247-analytics-reporting-verify',
    generatedAt: new Date().toISOString(),
    branch: 'cursor/titan-owner-operating-model-final',
    commitSha,
    stagingWeb: WEB,
    stagingApi: API,
    auth: { method: session.method, secretsInOutput: false },
    api: {
      status: apiRes.status,
      hasWorkspace: Boolean(workspace),
      sectionIds: workspace?.sections?.map((s) => s.id) ?? [],
      dataSourceCount: workspace?.dataSources?.length ?? 0,
      hasRange: Boolean(workspace?.range?.from && workspace?.range?.to),
      hasGeneratedAt: Boolean(workspace?.generatedAt),
      invoicedRevenueKind: invoiced?.value?.kind ?? null,
      cashReceivedKind: cash?.value?.kind ?? null,
      invoicedSeparateFromCash:
        invoiced?.value?.kind === 'money' &&
        cash?.value?.kind === 'money' &&
        invoiced.value.cents !== undefined &&
        cash.value.cents !== undefined,
      metricContractValid:
        Array.isArray(workspace?.sections) &&
        workspace.sections.every(
          (section) =>
            Array.isArray(section.metrics) &&
            section.metrics.every(
              (m) =>
                m.definition &&
                m.source &&
                m.lastUpdatedAt &&
                m.value &&
                (m.drillDownHref === null || typeof m.drillDownHref === 'string'),
            ),
        ),
    },
    ui: { viewports: [] },
    blockers: [],
    holdMetrics: [],
    verdict: 'HOLD',
  };

  if (!apiRes.ok || !workspace) {
    report.blockers.push(`API reporting-workspace HTTP ${apiRes.status}`);
  }
  for (const sectionId of REQUIRED_SECTIONS) {
    if (!workspace?.sections?.some((s) => s.id === sectionId)) {
      report.blockers.push(`Missing section: ${sectionId}`);
    }
  }
  if ((workspace?.dataSources?.length ?? 0) < 8) {
    report.blockers.push('Insufficient dataSources — expected reconciled tenant tables');
  }
  if (!report.api.metricContractValid) {
    report.blockers.push('Metric contract incomplete (definition/source/lastUpdated/value)');
  }
  if (!invoiced || invoiced.value.kind !== 'money') {
    report.blockers.push('Invoiced revenue metric missing or not money kind');
  }
  if (!cash || cash.value.kind !== 'money') {
    report.blockers.push('Cash received metric missing or not money kind');
  }

  for (const section of workspace?.sections ?? []) {
    for (const metric of section.metrics) {
      if (metric.value.kind === 'unavailable') {
        report.holdMetrics.push({ section: section.id, id: metric.id, reason: metric.value.reason });
      }
    }
  }

  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() =>
    chromium.launch({ headless: true }),
  );
  const context = await browser.newContext();
  const page = await context.newPage();
  await seedSession(context, page, token);

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`${WEB}/analytics`, { waitUntil: 'networkidle', timeout: 90_000 });
    await page.waitForTimeout(2500);

    const bodyText = await page.locator('body').innerText();
    const checks = {
      hasReportingTitle: /Analytics & Reporting/i.test(bodyText),
      hasExecutiveTab: /Executive/i.test(bodyText),
      hasOperationalTab: /Operational/i.test(bodyText),
      hasFinancialTab: /Financial/i.test(bodyText),
      hasSalesTab: /Sales/i.test(bodyText),
      hasInvoicedRevenue: /Invoiced revenue/i.test(bodyText),
      hasCashReceived: /Cash received/i.test(bodyText),
      hasDateRange: /Date range:/i.test(bodyText),
      hasSourceLabel: /Source:/i.test(bodyText),
      separatesInvoicedAndCash: /Invoiced revenue/i.test(bodyText) && /Cash received/i.test(bodyText),
    };

    const shot = path.join(OUT_DIR, `phase15-analytics-${vp.id}.png`);
    await page.screenshot({ path: shot, fullPage: true });

    report.ui.viewports.push({
      ...vp,
      checks,
      screenshot: path.relative(repoRoot, shot),
    });

    if (!checks.hasReportingTitle) report.blockers.push(`Missing reporting title @ ${vp.id}`);
    if (!checks.separatesInvoicedAndCash) {
      report.blockers.push(`Invoiced vs cash not both visible @ ${vp.id}`);
    }
    if (!checks.hasDateRange || !checks.hasSourceLabel) {
      report.blockers.push(`Missing date range or source label @ ${vp.id}`);
    }
  }

  await browser.close();

  report.verdict =
    report.blockers.length === 0 && report.api.status === 200 && report.api.hasWorkspace
      ? 'GO'
      : report.blockers.length === 0
        ? 'HOLD'
        : 'NO-GO';

  if (report.blockers.length === 0 && report.api.status === 200) {
    report.verdict = 'GO';
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        blockers: report.blockers,
        holdMetrics: report.holdMetrics.length,
        out: OUT_JSON,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
