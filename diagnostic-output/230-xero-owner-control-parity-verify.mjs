#!/usr/bin/env node
/**
 * 230 — Phase 3 partial: Xero owner control parity (read-only).
 * No Xero writes. Preserves INV-0423 / INV-0424 integrity checks.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';

const require = createRequire(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/db/package.json'),
);
const postgres = require('postgres');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_JSON = path.resolve(__dirname, '230-xero-owner-control-parity-verify.json');
const OUT_DIR = path.resolve(__dirname, 'phase3-finance-staging');

const WEB = 'https://comfortable-determination-staging.up.railway.app';
const API = 'https://young-guns-os-staging.up.railway.app';
const YGP = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';

const INV_0423_CENTS = 247250;
const INV_0424_CENTS = 226639;

const VIEWPORTS = [
  { id: '1440', width: 1440, height: 900 },
  { id: '768', width: 768, height: 1024 },
];

function loadStagingDatabaseUrl() {
  const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
  if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, 'utf8');
    const match = text.match(/^DATABASE_URL=(.+)$/m);
    const url = match?.[1]?.trim().replace(/^["']|["']$/g, '');
    if (url) return url;
  }
  return process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL || null;
}

async function mintOwnerSession() {
  execSync('pnpm --filter @titan/auth build', { cwd: repoRoot, stdio: 'pipe' });
  const scriptPath = path.join(repoRoot, '.tmp-mint-session-230-owner.mjs');
  fs.writeFileSync(
    scriptPath,
    `import { createAccessToken, generateRefreshToken, hashRefreshToken } from './packages/auth/dist/tokens.js';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const companyId = '${YGP}';
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
  VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, \${expiresAt}, NOW(), '230-phase3-finance', '127.0.0.1')\`;
const { token } = createAccessToken(
  { sub: user.id, companyId, roleId: user.role_id, roleName: user.role_name, sessionId, permissions: user.permissions },
  process.env.JWT_SECRET,
);
process.stdout.write(JSON.stringify({ accessToken: token }));
await sql.end();
`,
  );
  try {
    const raw = execSync(`railway run node ${scriptPath}`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(raw.trim());
  } finally {
    fs.unlinkSync(scriptPath);
  }
}

async function apiGet(pathname, token) {
  const res = await fetch(`${API}${pathname}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
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

async function probeDatabaseViaRailway() {
  const scriptPath = path.join(repoRoot, '.tmp-probe-db-230.mjs');
  fs.writeFileSync(
    scriptPath,
    `import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const YGP = '${YGP}';
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  const [connection] = await sql\`
    SELECT status, last_sync_at, last_error FROM integration_connections
    WHERE company_id=\${YGP}::uuid AND provider='xero' LIMIT 1
  \`;
  const [mappingCounts] = await sql\`
    SELECT
      (SELECT count(*)::int FROM xero_customer_mappings WHERE company_id=\${YGP}::uuid) AS customer_mappings,
      (SELECT count(*)::int FROM xero_invoice_mappings WHERE company_id=\${YGP}::uuid) AS invoice_mappings,
      (SELECT count(*)::int FROM xero_payment_mappings WHERE company_id=\${YGP}::uuid) AS payment_mappings,
      (SELECT count(*)::int FROM xero_quote_mappings WHERE company_id=\${YGP}::uuid) AS quote_mappings
  \`;
  const [entityCounts] = await sql\`
    SELECT
      (SELECT count(*)::int FROM customers WHERE company_id=\${YGP}::uuid) AS titan_customers,
      (SELECT count(*)::int FROM invoices WHERE company_id=\${YGP}::uuid) AS titan_invoices,
      (SELECT count(*)::int FROM payments WHERE company_id=\${YGP}::uuid) AS titan_payments,
      (SELECT count(*)::int FROM quotes WHERE company_id=\${YGP}::uuid) AS titan_quotes,
      (SELECT count(*)::int FROM purchase_orders WHERE company_id=\${YGP}::uuid) AS titan_purchase_orders
  \`;
  const [invoiceTotals] = await sql\`
    SELECT
      count(*) FILTER (WHERE status NOT IN ('paid','cancelled','draft'))::int AS open_count,
      coalesce(sum(greatest(amount_cents - amount_paid_cents, 0)) FILTER (WHERE status NOT IN ('paid','cancelled','draft')), 0)::bigint AS outstanding_cents,
      count(*) FILTER (
        WHERE status NOT IN ('paid','cancelled','draft')
          AND due_date IS NOT NULL AND due_date < NOW()
          AND (amount_cents - amount_paid_cents) > 0
      )::int AS overdue_count
    FROM invoices WHERE company_id=\${YGP}::uuid
  \`;
  const anchorInvoices = await sql\`
    SELECT invoice_number, amount_cents, total_cents, amount_paid_cents, status, number_authority, xero_invoice_number
    FROM invoices WHERE company_id=\${YGP}::uuid AND invoice_number IN ('INV-0423','INV-0424')
    ORDER BY invoice_number
  \`;
  const syncLogs = await sql\`
    SELECT entity_type, count(*)::int AS cnt
    FROM xero_sync_logs WHERE company_id=\${YGP}::uuid
    GROUP BY entity_type ORDER BY entity_type
  \`;
  process.stdout.write(JSON.stringify({
    xeroConnection: connection ? {
      status: connection.status,
      lastSyncAt: connection.last_sync_at?.toISOString?.() ?? null,
      lastError: connection.last_error,
    } : null,
    mappingCounts: mappingCounts ?? {},
    entityCounts: entityCounts ?? {},
    invoiceTotals: invoiceTotals ?? {},
    anchorInvoices,
    syncLogEntityTypes: syncLogs,
    customerValueClassifications: [],
  }));
} finally {
  await sql.end();
}
`,
  );
  try {
    const raw = execSync(`railway run node ${scriptPath}`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(raw.trim());
  } finally {
    fs.unlinkSync(scriptPath);
  }
}

async function probeDatabase(sql) {
  const [connection] = await sql`
    SELECT status, last_sync_at, last_error FROM integration_connections
    WHERE company_id=${YGP}::uuid AND provider='xero' LIMIT 1
  `;

  const mappingCounts = await sql`
    SELECT
      (SELECT count(*)::int FROM xero_customer_mappings WHERE company_id=${YGP}::uuid) AS customer_mappings,
      (SELECT count(*)::int FROM xero_invoice_mappings WHERE company_id=${YGP}::uuid) AS invoice_mappings,
      (SELECT count(*)::int FROM xero_payment_mappings WHERE company_id=${YGP}::uuid) AS payment_mappings,
      (SELECT count(*)::int FROM xero_quote_mappings WHERE company_id=${YGP}::uuid) AS quote_mappings
  `;

  const entityCounts = await sql`
    SELECT
      (SELECT count(*)::int FROM customers WHERE company_id=${YGP}::uuid) AS titan_customers,
      (SELECT count(*)::int FROM invoices WHERE company_id=${YGP}::uuid) AS titan_invoices,
      (SELECT count(*)::int FROM payments WHERE company_id=${YGP}::uuid) AS titan_payments,
      (SELECT count(*)::int FROM quotes WHERE company_id=${YGP}::uuid) AS titan_quotes,
      (SELECT count(*)::int FROM purchase_orders WHERE company_id=${YGP}::uuid) AS titan_purchase_orders
  `;

  const invoiceTotals = await sql`
    SELECT
      count(*) FILTER (WHERE status NOT IN ('paid','cancelled','draft'))::int AS open_count,
      coalesce(sum(greatest(amount_cents - amount_paid_cents, 0)) FILTER (WHERE status NOT IN ('paid','cancelled','draft')), 0)::bigint AS outstanding_cents,
      count(*) FILTER (
        WHERE status NOT IN ('paid','cancelled','draft')
          AND due_date IS NOT NULL
          AND due_date < NOW()
          AND (amount_cents - amount_paid_cents) > 0
      )::int AS overdue_count
    FROM invoices WHERE company_id=${YGP}::uuid
  `;

  const anchorInvoices = await sql`
    SELECT invoice_number, amount_cents, total_cents, amount_paid_cents, status, number_authority, xero_invoice_number
    FROM invoices WHERE company_id=${YGP}::uuid AND invoice_number IN ('INV-0423','INV-0424')
    ORDER BY invoice_number
  `;

  const syncLogs = await sql`
    SELECT entity_type, count(*)::int AS cnt
    FROM xero_sync_logs WHERE company_id=${YGP}::uuid
    GROUP BY entity_type ORDER BY entity_type
  `;

  let cvClassifications = [];
  try {
    cvClassifications = await sql`
      SELECT classification, count(*)::int AS cnt
      FROM customer_value_classifications WHERE company_id=${YGP}::uuid
      GROUP BY classification ORDER BY classification
    `;
  } catch {
    cvClassifications = [];
  }

  return {
    xeroConnection: connection
      ? {
          status: connection.status,
          lastSyncAt: connection.last_sync_at?.toISOString?.() ?? null,
          lastError: connection.last_error,
        }
      : null,
    mappingCounts: mappingCounts[0] ?? {},
    entityCounts: entityCounts[0] ?? {},
    invoiceTotals: invoiceTotals[0] ?? {},
    anchorInvoices,
    syncLogEntityTypes: syncLogs,
    customerValueClassifications: cvClassifications,
  };
}

function assessAnchorInvoices(rows) {
  const byNumber = Object.fromEntries(rows.map((r) => [r.invoice_number, r]));
  const inv423 = byNumber['INV-0423'];
  const inv424 = byNumber['INV-0424'];
  return {
    inv0423: {
      present: Boolean(inv423),
      amountCents: inv423?.amount_cents ?? null,
      totalCents: inv423?.total_cents ?? null,
      preserved: inv423?.amount_cents === INV_0423_CENTS && inv423?.total_cents === INV_0423_CENTS,
    },
    inv0424: {
      present: Boolean(inv424),
      amountCents: inv424?.amount_cents ?? null,
      totalCents: inv424?.total_cents ?? null,
      preserved: inv424?.amount_cents === INV_0424_CENTS && inv424?.total_cents === INV_0424_CENTS,
    },
    allPreserved:
      inv423?.amount_cents === INV_0423_CENTS &&
      inv423?.total_cents === INV_0423_CENTS &&
      inv424?.amount_cents === INV_0424_CENTS &&
      inv424?.total_cents === INV_0424_CENTS,
  };
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch {
    return chromium.launch({ channel: 'chrome', headless: true });
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
      value: '230-phase3-staging-verify',
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

async function captureFinancePages(token) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await launchBrowser();
  const screenshots = [];
  const roleName = 'Company Owner';
  const permissions = ['*'];

  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      await seedSession(context, page, token, roleName, permissions);

      for (const route of ['/finance/receivables', '/finance/payables', '/finance/cashflow']) {
        await page.goto(`${WEB}${route}`, { waitUntil: 'networkidle', timeout: 90000 });
        await page.waitForTimeout(2000);
        const file = path.join(OUT_DIR, `phase3-${route.replace(/\//g, '-')}-${viewport.id}.png`);
        await page.screenshot({ path: file, fullPage: true });
        const bodyText = await page.locator('body').innerText();
        const onLogin = bodyText.includes('Sign in') && bodyText.includes('Password');
        const hasHoldOnly =
          route !== '/finance/receivables' &&
          (bodyText.includes('coming-soon') || bodyText.includes('Phase 3C') || bodyText.includes('Phase 3D'));
        const hasReceivablesData =
          route === '/finance/receivables' &&
          (bodyText.includes('Total outstanding') || bodyText.includes('Debtors'));
        screenshots.push({
          route,
          viewport: viewport.id,
          file: path.relative(repoRoot, file),
          onLogin,
          pass:
            !onLogin &&
            (route === '/finance/receivables'
              ? hasReceivablesData
              : route === '/finance/payables'
                ? bodyText.includes('Bills') && bodyText.includes('ACCPAY')
                : bodyText.includes('Cash received') && bodyText.includes('invoiced')),
        });
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  return screenshots;
}

async function main() {
  const report = {
    label: '230-xero-owner-control-parity-verify',
    phase: '3-partial',
    generatedAt: new Date().toISOString(),
    branch: execSync('git branch --show-current', { cwd: repoRoot, encoding: 'utf8' }).trim(),
    headSha: execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim(),
    apiOrigin: API,
    webOrigin: WEB,
    youngGunsCompanyId: YGP,
    verdict: 'PENDING',
    checks: [],
    db: null,
    api: null,
    anchorInvoices: null,
    screenshots: [],
    paritySummary: null,
  };

  const databaseUrl = loadStagingDatabaseUrl();
  let sql = null;

  try {
    if (databaseUrl && !databaseUrl.includes(FORBIDDEN) && databaseUrl.includes(STAGING_REF)) {
      sql = postgres(databaseUrl, { max: 1, prepare: false });
      report.db = await probeDatabase(sql);
    } else {
      report.db = await probeDatabaseViaRailway();
    }
    report.anchorInvoices = assessAnchorInvoices(report.db.anchorInvoices);
    report.checks.push({
      name: 'inv_0423_0424_preserved',
      pass: report.anchorInvoices.allPreserved,
      detail: report.anchorInvoices,
    });
    report.checks.push({
      name: 'xero_connected',
      pass: report.db.xeroConnection?.status === 'connected',
      detail: report.db.xeroConnection,
    });

    const { accessToken } = await mintOwnerSession();

    const [stats, receivables, cashflow, financeStats] = await Promise.all([
      apiGet('/api/v1/finance-intelligence/stats', accessToken),
      apiGet('/api/v1/finance-intelligence/receivables', accessToken),
      apiGet('/api/v1/finance-intelligence/cashflow', accessToken),
      apiGet('/api/v1/finance/stats', accessToken),
    ]);

    report.api = {
      financeIntelligenceStats: { status: stats.status, ok: stats.status === 200 },
      receivables: {
        status: receivables.status,
        overdueCount: receivables.json?.data?.receivables?.overdueCount ?? null,
        bucketCount: receivables.json?.data?.receivables?.ageingBuckets?.length ?? null,
      },
      cashflow: {
        status: cashflow.status,
        inflowCents: cashflow.json?.data?.cashFlow?.inflowCents ?? null,
        outstandingReceivableCents: cashflow.json?.data?.cashFlow?.outstandingReceivableCents ?? null,
      },
      financeStats: {
        status: financeStats.status,
        outstandingCents: financeStats.json?.data?.outstandingCents ?? null,
      },
    };

    report.checks.push({
      name: 'receivables_api',
      pass: receivables.status === 200 && receivables.json?.data?.receivables,
      detail: { status: receivables.status },
    });
    report.checks.push({
      name: 'cashflow_api',
      pass: cashflow.status === 200 && cashflow.json?.data?.cashFlow,
      detail: { status: cashflow.status },
    });
    report.checks.push({
      name: 'finance_stats_api',
      pass: financeStats.status === 200,
      detail: { status: financeStats.status },
    });

    report.screenshots = await captureFinancePages(accessToken);
    report.checks.push({
      name: 'receivables_ui',
      pass: report.screenshots.some((s) => s.route === '/finance/receivables' && s.pass),
      detail: report.screenshots.filter((s) => s.route === '/finance/receivables'),
    });
    report.checks.push({
      name: 'cashflow_ui',
      pass: report.screenshots.some((s) => s.route === '/finance/cashflow' && s.pass),
      detail: report.screenshots.filter((s) => s.route === '/finance/cashflow'),
    });
    report.checks.push({
      name: 'payables_ui_partial',
      pass: report.screenshots.some((s) => s.route === '/finance/payables' && s.pass),
      detail: report.screenshots.filter((s) => s.route === '/finance/payables'),
    });

    const dbOutstanding = Number(report.db.invoiceTotals.outstanding_cents ?? 0);
    const apiOutstanding = report.api.financeStats.outstandingCents;
    report.checks.push({
      name: 'outstanding_db_api_match',
      pass: apiOutstanding != null && dbOutstanding === apiOutstanding,
      detail: { dbOutstanding, apiOutstanding },
    });

    report.paritySummary = {
      receivables: 'GO — API + UI from synced ACCREC',
      payables: 'HOLD — ACCPAY bills not imported; PO commitments only',
      cashflow: 'PARTIAL — cash vs invoiced separated; bank balance pending',
      xeroWrite: 'NONE — read-only verification',
    };

    const failed = report.checks.filter((c) => !c.pass);
    report.verdict = failed.length === 0 ? 'GO' : failed.some((c) => c.name === 'inv_0423_0424_preserved') ? 'NO-GO' : 'HOLD';
  } finally {
    if (sql) await sql.end();
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict: report.verdict, checks: report.checks.map((c) => ({ name: c.name, pass: c.pass })) }, null, 2));
  process.exit(report.verdict === 'NO-GO' ? 2 : report.verdict === 'HOLD' ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
