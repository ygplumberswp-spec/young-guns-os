/**
 * 228 — Xero UI refresh verification (staging read-only + optional owner API).
 * Does NOT enqueue sync jobs or write to Xero.
 *
 * Usage:
 *   STAGING_DATABASE_URL=... [OWNER_ACCESS_TOKEN=...] node diagnostic-output/228-xero-ui-refresh-verify.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/db/package.json'),
);
const postgres = require('postgres');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outPath = path.resolve(repoRoot, 'diagnostic-output/228-xero-ui-refresh-verify.json');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';
const YGP = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const JOB931 = '93144ea8-f159-416f-bc48-b3b7b5445f98';
const API_ORIGIN = (process.env.STAGING_API_BASE || 'https://young-guns-os-staging.up.railway.app').replace(/\/$/, '');
const WEB_ORIGIN = (process.env.STAGING_WEB_BASE || 'https://comfortable-determination-staging.up.railway.app').replace(/\/$/, '');
const OWNER_ACCESS_TOKEN = process.env.OWNER_ACCESS_TOKEN?.trim() || null;

function loadStagingDatabaseUrl() {
  const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
  if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, 'utf8');
    const match = text.match(/^DATABASE_URL=(.+)$/m);
    const url = match?.[1]?.trim().replace(/^["']|["']$/g, '');
    if (url) return url;
  }
  return process.env.STAGING_DATABASE_URL || null;
}

function derivePartialFlags(input) {
  const {
    activeImportCount,
    trigger,
    completedStages,
    cvMetricsRefreshJobId,
    lastSyncAt,
    xeroConnected,
    useIncrementalBankTxBypass,
  } = input;

  const legacyImportInProgress = activeImportCount > 0;
  const invoiceStagesComplete = ['contacts', 'invoices', 'payments'].every((stage) =>
    (completedStages ?? []).includes(stage),
  );
  const incrementalBankTxOnly =
    useIncrementalBankTxBypass &&
    Boolean(cvMetricsRefreshJobId) &&
    trigger === 'incremental' &&
    invoiceStagesComplete;
  const fixedImportInProgress = activeImportCount > 0 && !incrementalBankTxOnly;
  const legacyPartial =
    legacyImportInProgress || (xeroConnected && !lastSyncAt);
  const fixedPartial =
    fixedImportInProgress || (xeroConnected && !lastSyncAt);

  return {
    legacyImportInProgress,
    fixedImportInProgress,
    incrementalBankTxOnly,
    legacyWouldShowUpdating: legacyPartial,
    fixedWouldShowUpdating: fixedPartial,
  };
}

async function api(pathname, token) {
  const res = await fetch(`${API_ORIGIN}${pathname}`, {
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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
  const report = {
    label: '228-xero-ui-refresh-verify',
    generatedAt: new Date().toISOString(),
    worktree: repoRoot,
    branch: 'cursor/xero-payments-hotfix',
    apiOrigin: API_ORIGIN,
    webOrigin: WEB_ORIGIN,
    youngGunsCompanyId: YGP,
    import93144ea8: JOB931,
    verdict: 'PENDING',
    rootCause: null,
    stalePages: [],
    db: null,
    api: null,
    uiExpected: null,
    deploy: null,
    fix: {
      files: [
        'apps/api/src/services/customer-value-classification.service.ts',
        'apps/api/src/services/integration-sync-orchestrator.service.ts',
        'apps/web/src/lib/cache-invalidation.ts',
        'apps/web/src/lib/cache-policies.ts',
        'apps/web/src/hooks/use-xero-sync-cache-refresh.ts',
        'apps/web/src/layouts/AppLayout.tsx',
        'apps/web/src/features/integrations/XeroSyncPanel.tsx',
        'apps/web/src/pages/integrations/IntegrationsDashboardPage.tsx',
      ],
      summary:
        'Stop incremental bank-tx sync from forcing CV partial after refresh; invalidate finance/CRM caches when Xero sync settles; poll background-work in AppLayout.',
    },
    checks: [],
  };

  const databaseUrl = loadStagingDatabaseUrl();
  if (!databaseUrl || databaseUrl.includes(FORBIDDEN) || !databaseUrl.includes(STAGING_REF)) {
    report.verdict = 'BLOCKED';
    report.checks.push({ name: 'db_url', pass: false, detail: 'staging DATABASE_URL unavailable' });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false });

  try {
    const [connection] = await sql`
      SELECT status, last_sync_at, last_error FROM integration_connections
      WHERE company_id=${YGP}::uuid AND provider='xero' LIMIT 1
    `;
    const [connector] = await sql`
      SELECT last_sync_at, config->'autoSync' AS auto_sync FROM integration_connectors
      WHERE company_id=${YGP}::uuid AND connector_key='xero' LIMIT 1
    `;
    const activeJobs = await sql`
      SELECT id, status, result_summary->'trigger' AS trigger,
             result_summary->'completedStages' AS completed_stages,
             result_summary->'checkpoint' AS checkpoint
      FROM integration_sync_jobs
      WHERE company_id=${YGP}::uuid AND provider='xero' AND sync_scope='import'
        AND status IN ('pending','running')
    `;
    const [job931] = await sql`
      SELECT id, status, completed_at, result_summary->'cvMetricsRefreshJobId' AS cv_job
      FROM integration_sync_jobs WHERE id=${JOB931}::uuid
    `;
    const mappingCounts = await sql`
      SELECT
        (SELECT count(*)::int FROM xero_customer_mappings WHERE company_id=${YGP}::uuid) AS customer_mappings,
        (SELECT count(*)::int FROM xero_invoice_mappings WHERE company_id=${YGP}::uuid) AS invoice_mappings,
        (SELECT count(*)::int FROM xero_payment_mappings WHERE company_id=${YGP}::uuid) AS payment_mappings,
        (SELECT count(*)::int FROM xero_sync_logs WHERE company_id=${YGP}::uuid AND entity_type='bank_transaction') AS bank_tx_logs
    `;
    const invoices = await sql`
      SELECT invoice_number, amount_cents, total_cents, amount_paid_cents, status
      FROM invoices WHERE company_id=${YGP}::uuid AND invoice_number IN ('INV-0423','INV-0424')
      ORDER BY invoice_number
    `;

    const autoSync = connector?.auto_sync ?? {};
    const active = activeJobs[0] ?? null;
    const partial = derivePartialFlags({
      activeImportCount: activeJobs.length,
      trigger: active?.trigger ?? null,
      completedStages: active?.completed_stages ?? [],
      cvMetricsRefreshJobId: autoSync.cvMetricsRefreshJobId ?? null,
      lastSyncAt: connection?.last_sync_at?.toISOString?.() ?? null,
      xeroConnected: Boolean(connection),
      useIncrementalBankTxBypass: true,
    });

    report.db = {
      connection: connection
        ? {
            status: connection.status,
            lastSyncAt: connection.last_sync_at?.toISOString?.() ?? null,
            lastError: connection.last_error,
          }
        : null,
      connector: connector
        ? {
            lastSyncAt: connector.last_sync_at?.toISOString?.() ?? null,
            autoSync,
          }
        : null,
      activeImportJobs: activeJobs.map((j) => ({
        id: j.id,
        status: j.status,
        trigger: j.trigger,
        completedStages: j.completed_stages,
        checkpoint: j.checkpoint,
      })),
      job93144ea8: job931
        ? {
            status: job931.status,
            completedAt: job931.completed_at?.toISOString?.() ?? null,
            cvMetricsRefreshJobId: job931.cv_job,
          }
        : null,
      mappingCounts: mappingCounts[0],
      sampleInvoices: invoices,
      partialLogic: partial,
    };

    report.checks.push({
      name: 'job931_completed',
      pass: job931?.status === 'completed',
      detail: job931?.status ?? 'missing',
    });
    report.checks.push({
      name: 'last_sync_at_populated',
      pass: Boolean(connection?.last_sync_at),
      detail: connection?.last_sync_at?.toISOString?.() ?? null,
    });
    report.checks.push({
      name: 'cv_refresh_marker_set',
      pass: autoSync.cvMetricsRefreshJobId === JOB931,
      detail: autoSync.cvMetricsRefreshJobId ?? null,
    });

    const health = await api('/api/v1/health/ready');
    report.checks.push({ name: 'api_ready', pass: health.status === 200, detail: String(health.status) });

    report.api = { authenticated: false };
    if (OWNER_ACCESS_TOKEN) {
      const [cv, xeroConn, bg, invoicesApi] = await Promise.all([
        api('/api/v1/customers/value-metrics', OWNER_ACCESS_TOKEN),
        api('/api/v1/integrations/xero', OWNER_ACCESS_TOKEN),
        api('/api/v1/background-work/status', OWNER_ACCESS_TOKEN),
        api('/api/v1/finance/invoices?limit=5', OWNER_ACCESS_TOKEN),
      ]);

      report.api = {
        authenticated: true,
        valueMetrics:
          cv.status === 200
            ? {
                status: cv.status,
                xeroImportInProgress: cv.json?.data?.xeroImportInProgress ?? cv.json?.xeroImportInProgress,
                dataCompleteness: cv.json?.data?.dataCompleteness ?? cv.json?.dataCompleteness,
                qualifyingCustomers: cv.json?.data?.totals?.qualifyingCustomers,
              }
            : { status: cv.status },
        xeroConnection:
          xeroConn.status === 200
            ? {
                status: xeroConn.status,
                lastSyncAt: xeroConn.json?.data?.connection?.lastSyncAt ?? xeroConn.json?.connection?.lastSyncAt,
              }
            : { status: xeroConn.status },
        backgroundWork:
          bg.status === 200
            ? {
                status: bg.status,
                integrationAutoSync: bg.json?.data?.status?.integrationAutoSync ?? bg.json?.status?.integrationAutoSync,
                activeItems: (bg.json?.data?.status?.items ?? bg.json?.status?.items ?? [])
                  .filter((i) => i.kind === 'integration_sync')
                  .map((i) => ({ id: i.id, uiState: i.uiState, workType: i.workType })),
              }
            : { status: bg.status },
        financeInvoices:
          invoicesApi.status === 200
            ? {
                status: invoicesApi.status,
                count: (invoicesApi.json?.data?.invoices ?? invoicesApi.json?.invoices ?? []).length,
              }
            : { status: invoicesApi.status },
      };
    } else {
      report.checks.push({
        name: 'owner_api_probe',
        pass: false,
        detail: 'OWNER_ACCESS_TOKEN not set — API vs UI comparison uses DB partial simulation only',
      });
    }

    report.uiExpected = {
      stalePagesBeforeFix: [],
      expectedAfterFix: [],
    };

    if (partial.legacyWouldShowUpdating) {
      report.stalePages = [
        'Dashboard / Customer value panel',
        'CRM customer value filters',
      ];
      report.uiExpected.stalePagesBeforeFix = [...report.stalePages];
      if (partial.incrementalBankTxOnly) {
        report.rootCause =
          'Running incremental bank-tx sync kept API xeroImportInProgress=true after job 93144ea8 completed; frontend also lacked post-sync cache invalidation for customers/value-metrics and finance queries.';
      } else if (activeJobs.length > 0) {
        report.rootCause =
          'Active Xero import job keeps API partial=true; frontend lacks post-sync cache invalidation for finance/CRM/dashboard queries.';
      } else if (!connection?.last_sync_at) {
        report.rootCause = 'last_sync_at null forces partial CV state.';
      } else {
        report.rootCause = 'Frontend React Query cache not invalidated after Xero sync settled.';
      }
    } else {
      report.rootCause =
        'Frontend React Query cache not invalidated after Xero sync settled (API already complete).';
      report.stalePages = ['Dashboard / Customer value panel', 'Finance invoices', 'Integrations / Xero last sync'];
    }

    if (partial.fixedWouldShowUpdating !== partial.legacyWouldShowUpdating) {
      report.uiExpected.expectedAfterFix.push(
        'Customer value panel leaves updating state while incremental bank-tx sync runs post-CV refresh',
      );
    }
    report.uiExpected.expectedAfterFix.push(
      'Completed sync triggers invalidateAfterXeroSyncSettled (CV, finance, CRM, dashboard, integrations)',
    );

    const allCorePass = report.checks.filter((c) => c.name !== 'owner_api_probe').every((c) => c.pass);
    report.verdict = allCorePass && partial.fixedWouldShowUpdating === false ? 'GO' : 'HOLD';
    if (report.verdict === 'HOLD' && partial.fixedWouldShowUpdating === false && allCorePass) {
      report.verdict = 'GO_PENDING_DEPLOY';
    }
  } finally {
    await sql.end();
  }

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.verdict.startsWith('GO') ? 0 : 1);
}

void main();
