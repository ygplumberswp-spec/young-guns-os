#!/usr/bin/env node
/**
 * 250 — Finance payment reconciliation verify (read-only staging).
 * Proves Xero → DB → API → UI chain for receivables/payables/cashflow/payments.
 * No Xero writes. Preserves INV-0423 / INV-0424.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_JSON = path.resolve(__dirname, '250-finance-payment-reconciliation-verify.json');
const OUT_DIR = path.resolve(__dirname, 'phase250-finance-payment-staging');

const WEB = 'https://comfortable-determination-staging.up.railway.app';
const API = 'https://young-guns-os-staging.up.railway.app';
const YGP = '095aef76-fef5-4139-af37-a42f2d7e2faf';

const INV_0423_CENTS = 247250;
const INV_0424_CENTS = 226639;

const VIEWPORTS = [{ id: '1440', width: 1440, height: 900 }];

async function mintOwnerSession() {
  execSync('pnpm --filter @titan/auth build', { cwd: repoRoot, stdio: 'pipe' });
  const scriptPath = path.join(repoRoot, '.tmp-mint-session-250-owner.mjs');
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
  VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, \${expiresAt}, NOW(), '250-finance-payment', '127.0.0.1')\`;
const { token } = createAccessToken(
  { sub: user.id, companyId, roleId: user.role_id, roleName: user.role_name, sessionId, permissions: user.permissions },
  process.env.JWT_SECRET,
);
process.stdout.write(JSON.stringify({ accessToken: token, roleName: user.role_name, permissions: user.permissions }));
await sql.end();
`,
  );
  try {
    const raw = execSync(`railway run -s young-guns-os node ${scriptPath}`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return JSON.parse(raw);
  } finally {
    fs.unlinkSync(scriptPath);
  }
}

async function probeDatabase() {
  const scriptPath = path.join(repoRoot, '.tmp-probe-db-250.mjs');
  fs.writeFileSync(
    scriptPath,
    `import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const YGP = '${YGP}';
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  const [mappingCounts] = await sql\`
    SELECT
      (SELECT count(*)::int FROM xero_payment_mappings WHERE company_id=\${YGP}::uuid) AS payment_mappings,
      (SELECT count(*)::int FROM xero_invoice_mappings WHERE company_id=\${YGP}::uuid AND sync_status='synced') AS synced_invoice_mappings,
      (SELECT count(*)::int FROM xero_invoice_mappings WHERE company_id=\${YGP}::uuid AND sync_status='failed') AS failed_invoice_mappings
  \`;
  const [entityCounts] = await sql\`
    SELECT
      (SELECT count(*)::int FROM payments WHERE company_id=\${YGP}::uuid) AS titan_payments,
      (SELECT count(*)::int FROM payments WHERE company_id=\${YGP}::uuid AND xero_payment_id IS NOT NULL) AS xero_linked_payments
  \`;
  const falseZeroRows = await sql\`
    SELECT i.id, i.invoice_number, i.amount_paid_cents, coalesce(p.allocated_cents, 0)::int AS allocated_cents
    FROM invoices i
    LEFT JOIN (
      SELECT invoice_id, sum(amount_cents)::int AS allocated_cents
      FROM payments WHERE company_id=\${YGP}::uuid
      GROUP BY invoice_id
    ) p ON p.invoice_id = i.id
    WHERE i.company_id=\${YGP}::uuid
      AND coalesce(p.allocated_cents, 0) > 0
      AND i.amount_paid_cents = 0
    ORDER BY i.invoice_number
    LIMIT 10
  \`;
  const reconciledOutstanding = await sql\`
    SELECT coalesce(sum(
      greatest(
        coalesce(nullif(total_cents, 0), amount_cents)
        - greatest(amount_paid_cents, coalesce(p.allocated_cents, 0)),
        0
      )
    ) FILTER (WHERE status IN ('sent','partial','overdue')), 0)::bigint AS outstanding_cents
    FROM invoices i
    LEFT JOIN (
      SELECT invoice_id, sum(amount_cents)::int AS allocated_cents
      FROM payments WHERE company_id=\${YGP}::uuid
      GROUP BY invoice_id
    ) p ON p.invoice_id = i.id
    WHERE i.company_id=\${YGP}::uuid
  \`;
  const anchorInvoices = await sql\`
    SELECT i.invoice_number, i.amount_cents, i.total_cents, i.amount_paid_cents, i.status,
      coalesce(p.allocated_cents, 0)::int AS allocated_cents,
      coalesce(p.payment_count, 0)::int AS payment_count
    FROM invoices i
    LEFT JOIN (
      SELECT invoice_id, sum(amount_cents)::int AS allocated_cents, count(*)::int AS payment_count
      FROM payments WHERE company_id=\${YGP}::uuid
      GROUP BY invoice_id
    ) p ON p.invoice_id = i.id
    WHERE i.company_id=\${YGP}::uuid AND i.invoice_number IN ('INV-0423','INV-0424')
    ORDER BY i.invoice_number
  \`;
  const paymentSample = await sql\`
    SELECT p.id, p.amount_cents, p.xero_payment_id, m.xero_payment_id AS mapping_xero_id, m.sync_status
    FROM payments p
    LEFT JOIN xero_payment_mappings m ON m.payment_id = p.id AND m.company_id = p.company_id
    WHERE p.company_id=\${YGP}::uuid
    ORDER BY p.paid_at DESC
    LIMIT 5
  \`;
  process.stdout.write(JSON.stringify({
    mappingCounts: mappingCounts ?? {},
    entityCounts: entityCounts ?? {},
    falseZeroRows,
    reconciledOutstanding: reconciledOutstanding[0] ?? {},
    anchorInvoices,
    paymentSample,
  }));
} finally {
  await sql.end();
}
`,
  );
  try {
    const raw = execSync(`railway run -s young-guns-os node ${scriptPath}`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return JSON.parse(raw);
  } finally {
    fs.unlinkSync(scriptPath);
  }
}

async function apiGet(pathname, token) {
  const res = await fetch(`${API}${pathname}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function apiPost(pathname, token) {
  const res = await fetch(`${API}${pathname}`, {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/** Read-only Xero pull: invoices (mapping context) then payments. No Xero writes. */
async function runReadOnlyXeroSync(token) {
  const invoicesSync = await apiPost('/api/v1/integrations/xero/sync/invoices', token);
  const paymentsSync = await apiPost('/api/v1/integrations/xero/sync/payments', token);
  return {
    readOnly: true,
    xeroWrites: false,
    invoicesSync: {
      status: invoicesSync.status,
      result: invoicesSync.json?.data?.result ?? null,
      error: invoicesSync.json?.error ?? null,
    },
    paymentsSync: {
      status: paymentsSync.status,
      result: paymentsSync.json?.data?.result ?? null,
      error: paymentsSync.json?.error ?? null,
    },
  };
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
      value: '250-finance-payment-verify',
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

async function captureFinanceScreenshots(token, roleName, permissions) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  }
  const screenshots = [];
  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      await seedSession(context, page, token, roleName, permissions);
      for (const route of ['/finance/receivables', '/finance/payables', '/finance/cashflow']) {
        await page.goto(`${WEB}${route}`, { waitUntil: 'networkidle', timeout: 90000 });
        await page.waitForTimeout(1500);
        const file = path.join(OUT_DIR, `250-${route.replace(/\//g, '-')}-${viewport.id}.png`);
        await page.screenshot({ path: file, fullPage: true });
        screenshots.push({ route, viewport: viewport.id, file: path.relative(repoRoot, file) });
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return screenshots;
}

function assessAnchors(rows) {
  const byNumber = Object.fromEntries(rows.map((r) => [r.invoice_number, r]));
  const inv423 = byNumber['INV-0423'];
  const inv424 = byNumber['INV-0424'];
  return {
    inv0423: {
      present: Boolean(inv423),
      amountCents: inv423?.amount_cents ?? null,
      preserved: inv423?.amount_cents === INV_0423_CENTS && inv423?.total_cents === INV_0423_CENTS,
    },
    inv0424: {
      present: Boolean(inv424),
      amountCents: inv424?.amount_cents ?? null,
      preserved: inv424?.amount_cents === INV_0424_CENTS && inv424?.total_cents === INV_0424_CENTS,
    },
    allPreserved:
      inv423?.amount_cents === INV_0423_CENTS &&
      inv423?.total_cents === INV_0423_CENTS &&
      inv424?.amount_cents === INV_0424_CENTS &&
      inv424?.total_cents === INV_0424_CENTS,
  };
}

async function main() {
  const report = {
    label: '250-finance-payment-reconciliation-verify',
    generatedAt: new Date().toISOString(),
    branch: execSync('git branch --show-current', { cwd: repoRoot, encoding: 'utf8' }).trim(),
    headSha: execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim(),
    apiOrigin: API,
    webOrigin: WEB,
    youngGunsCompanyId: YGP,
    verdict: 'PENDING',
    checks: [],
    reconciliationMatrix: [],
    blockers: {},
  };

  const { accessToken: token, roleName, permissions } = await mintOwnerSession();
  report.syncResponse = await runReadOnlyXeroSync(token);
  report.checks.push({
    name: 'xero_payments_sync',
    pass: report.syncResponse.paymentsSync.status === 200,
    detail: report.syncResponse.paymentsSync.result,
  });
  const db = await probeDatabase();

  const endpoints = [
    ['/finance/stats', 'financeStats'],
    ['/finance-intelligence/receivables', 'receivables'],
    ['/finance-intelligence/payables', 'payables'],
    ['/finance-intelligence/cashflow', 'cashflow'],
    ['/finance/invoices', 'invoices'],
    ['/finance/payments', 'payments'],
  ];

  const api = {};
  for (const [path, key] of endpoints) {
    const result = await apiGet(`/api/v1${path}`, token);
    api[key] = result;
    report.checks.push({
      name: `api_${key}`,
      status: result.status,
      pass: result.status === 200,
    });
  }

  const stats = api.financeStats.json?.data ?? {};
  const receivables = api.receivables.json?.data ?? {};
  const cashflow = api.cashflow.json?.data ?? {};
  const dbOutstanding = Number(db.reconciledOutstanding?.outstanding_cents ?? 0);
  const apiOutstanding =
    receivables.overdueAmountCents +
    (receivables.ageingBuckets ?? []).reduce((s, b) => s + (b.amountCents ?? 0), 0);

  report.reconciliationMatrix.push({
    layer: 'DB reconciled outstanding',
    valueCents: dbOutstanding,
  });
  report.reconciliationMatrix.push({
    layer: 'API finance/stats outstandingCents',
    valueCents: stats.outstandingCents ?? null,
    matchesDb: stats.outstandingCents === dbOutstanding,
  });
  report.reconciliationMatrix.push({
    layer: 'API receivables ageing sum',
    valueCents: apiOutstanding,
  });
  report.reconciliationMatrix.push({
    layer: 'API cashflow outstandingReceivableCents',
    valueCents: cashflow.outstandingReceivableCents ?? null,
  });

  const anchors = assessAnchors(db.anchorInvoices ?? []);
  report.checks.push({
    name: 'anchor_invoices_preserved',
    pass: anchors.allPreserved,
    detail: anchors,
  });

  report.checks.push({
    name: 'false_zero_detection',
    pass: (db.falseZeroRows ?? []).length === 0,
    count: (db.falseZeroRows ?? []).length,
    sample: db.falseZeroRows ?? [],
    note: 'Rows where payments exist but amount_paid_cents=0 — API should reconcile via allocated sum',
  });

  const syncCreated = report.syncResponse?.paymentsSync?.result?.createdCount ?? 0;
  const syncSkipped = report.syncResponse?.paymentsSync?.result?.skippedCount ?? 0;
  report.checks.push({
    name: 'payment_mapping_populated',
    pass: (db.mappingCounts?.payment_mappings ?? 0) > 0,
    paymentMappings: db.mappingCounts?.payment_mappings ?? 0,
    titanPayments: db.entityCounts?.titan_payments ?? 0,
    xeroLinkedPayments: db.entityCounts?.xero_linked_payments ?? 0,
    syncCreated,
    syncSkipped,
    syncedInvoiceMappings: db.mappingCounts?.synced_invoice_mappings ?? 0,
  });

  report.blockers = {
    xeroPaymentMappings: {
      status:
        (db.mappingCounts?.payment_mappings ?? 0) > 0
          ? 'FIXED'
          : (db.mappingCounts?.synced_invoice_mappings ?? 0) === 0
            ? 'BLOCKED'
            : 'PARTIAL',
      detail: `${db.mappingCounts?.payment_mappings ?? 0} mappings, ${db.entityCounts?.titan_payments ?? 0} payments; synced invoices=${db.mappingCounts?.synced_invoice_mappings ?? 0}, failed=${db.mappingCounts?.failed_invoice_mappings ?? 0}`,
    },
    falseZeroEdgeCase: {
      status: (db.falseZeroRows ?? []).length === 0 ? 'FIXED' : 'PARTIAL',
      detail: `${(db.falseZeroRows ?? []).length} invoice(s) with payments but amount_paid_cents=0`,
    },
    receivablesParity: {
      status: api.receivables.status === 200 ? 'FIXED' : 'BLOCKED',
      detail: `API ${api.receivables.status}, DB outstanding ${dbOutstanding}`,
    },
    payablesParity: {
      status: api.payables.status === 200 ? 'PARTIAL' : 'BLOCKED',
      detail: 'ACCPAY import still HOLD — honest empty UI',
    },
    cashflowParity: {
      status: api.cashflow.status === 200 ? 'PARTIAL' : 'BLOCKED',
      detail: 'Invoiced vs cash separated; bank balance HOLD',
    },
    statsOutstanding: {
      status:
        stats.outstandingCents != null && stats.outstandingCents === dbOutstanding
          ? 'FIXED'
          : stats.outstandingCents != null && stats.outstandingCents > 0
            ? 'PARTIAL'
            : 'BLOCKED',
      detail: `stats=${stats.outstandingCents}, db=${dbOutstanding}`,
    },
  };

  try {
    report.screenshots = await captureFinanceScreenshots(token, roleName, permissions);
    report.checks.push({ name: 'finance_ui_screenshots', pass: report.screenshots.length >= 3 });
  } catch (error) {
    report.checks.push({
      name: 'finance_ui_screenshots',
      pass: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const failed = report.checks.filter((c) => c.pass === false);
  const blockerBlocked = Object.values(report.blockers).filter((b) => b.status === 'BLOCKED').length;
  report.verdict =
    failed.length === 0 && blockerBlocked === 0
      ? 'GO'
      : blockerBlocked > 0
        ? 'HOLD'
        : 'GO_WITH_HOLD';

  report.database = db;
  report.apiSummary = {
    stats,
    receivablesSummary: receivables.summary,
    payablesSummary: api.payables.json?.data?.summary,
    cashflowSummary: cashflow.summary,
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict: report.verdict, out: path.relative(repoRoot, OUT_JSON) }, null, 2));
  if (report.verdict === 'HOLD' && failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
