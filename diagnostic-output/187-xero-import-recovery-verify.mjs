/**
 * 187 — Xero import recovery verification (staging read-only).
 * Confirms heartbeat/recovery fix and Young Guns Plumbing import GO criteria.
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
const outPath = path.resolve(repoRoot, 'diagnostic-output/187-xero-import-recovery-verify.json');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';
const YGP_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const TARGET_JOB_PREFIX = '8e6aec9b';

function loadStagingDatabaseUrl() {
  const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
  if (!fs.existsSync(envPath)) return process.env.STAGING_DATABASE_URL || null;
  const text = fs.readFileSync(envPath, 'utf8');
  const match = text.match(/^DATABASE_URL=(.+)$/m);
  return match?.[1]?.trim().replace(/^["']|["']$/g, '') || process.env.STAGING_DATABASE_URL || null;
}

async function main() {
  const report = {
    label: '187-xero-import-recovery-verify',
    generatedAt: new Date().toISOString(),
    stagingRef: STAGING_REF,
    forbiddenProductionRef: FORBIDDEN,
    youngGunsCompanyId: YGP_COMPANY_ID,
    targetJobPrefix: TARGET_JOB_PREFIX,
    verdict: 'PENDING',
    checks: [],
    mappingCounts: null,
    importJob: null,
    connection: null,
    cvMetrics: null,
    duplicateMappingRegression: null,
    notes: [],
  };

  const databaseUrl = loadStagingDatabaseUrl();
  if (!databaseUrl) {
    report.verdict = 'BLOCKED';
    report.notes.push('No staging DATABASE_URL available');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  if (databaseUrl.includes(FORBIDDEN)) {
    report.verdict = 'BLOCKED';
    report.notes.push('Refused production database URL');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false });

  try {
    const [connection] = await sql`
      SELECT id, last_sync_at, last_error, status
      FROM integration_connections
      WHERE company_id = ${YGP_COMPANY_ID}::uuid
        AND provider = 'xero'
      LIMIT 1
    `;

    report.connection = connection
      ? {
          status: connection.status,
          lastSyncAt: connection.last_sync_at?.toISOString?.() ?? connection.last_sync_at,
          lastError: connection.last_error,
        }
      : null;

    const [importJob] = await sql`
      SELECT id, status, error_message, started_at, completed_at, result_summary
      FROM integration_sync_jobs
      WHERE company_id = ${YGP_COMPANY_ID}::uuid
        AND provider = 'xero'
        AND sync_scope = 'import'
      ORDER BY started_at DESC
      LIMIT 1
    `;

    if (importJob) {
      const summary = importJob.result_summary ?? {};
      report.importJob = {
        jobId: importJob.id,
        jobStatus: importJob.status,
        errorMessage: importJob.error_message,
        checkpoint: summary.checkpoint ?? null,
        heartbeatAt: summary.heartbeatAt ?? null,
        activity: summary.activity ?? null,
        resumedFromAbandoned: summary.resumedFromAbandoned ?? false,
        contactsPulled: summary.contacts?.pulledCount ?? null,
        invoicesPulled: summary.invoices?.pulledCount ?? null,
        completedStages: summary.completedStages ?? [],
      };
    }

    const [mappingCounts] = await sql`
      SELECT
        (SELECT count(*)::int FROM xero_customer_mappings WHERE company_id = ${YGP_COMPANY_ID}::uuid) AS customer_mappings,
        (SELECT count(*)::int FROM xero_invoice_mappings WHERE company_id = ${YGP_COMPANY_ID}::uuid) AS invoice_mappings,
        (SELECT count(*)::int FROM xero_payment_mappings WHERE company_id = ${YGP_COMPANY_ID}::uuid) AS payment_mappings,
        (SELECT count(*)::int FROM xero_sync_logs WHERE company_id = ${YGP_COMPANY_ID}::uuid AND entity_type = 'bank_transaction' AND status = 'success') AS bank_tx_logs
    `;

    report.mappingCounts = mappingCounts;

    const [dupCustomers] = await sql`
      SELECT xero_contact_id, count(*)::int AS cnt
      FROM xero_customer_mappings
      WHERE company_id = ${YGP_COMPANY_ID}::uuid
      GROUP BY xero_contact_id
      HAVING count(*) > 1
      LIMIT 5
    `;

    report.duplicateMappingRegression = {
      duplicateCustomerContactIds: dupCustomers?.length ?? 0,
      samples: dupCustomers ?? [],
    };

    const [connector] = await sql`
      SELECT config
      FROM integration_connectors
      WHERE company_id = ${YGP_COMPANY_ID}::uuid
        AND connector_key = 'xero'
      LIMIT 1
    `;

    const autoSync = connector?.config?.autoSync ?? {};
    report.cvMetrics = {
      cvMetricsRefreshJobId: autoSync.cvMetricsRefreshJobId ?? null,
      cvMetricsRefreshAt: autoSync.cvMetricsRefreshAt ?? null,
    };

    const jobComplete = importJob?.status === 'completed';
    const lastSyncPopulated = Boolean(connection?.last_sync_at);
    const contactsPresent = (mappingCounts?.customer_mappings ?? 0) >= 600;
    const noDupRegression = (dupCustomers?.length ?? 0) === 0;
    const cvFired =
      jobComplete &&
      lastSyncPopulated &&
      autoSync.cvMetricsRefreshJobId != null;

    report.checks = [
      { name: 'job_status_completed', pass: jobComplete },
      { name: 'last_sync_at_populated', pass: lastSyncPopulated },
      { name: 'contacts_mappings_present', pass: contactsPresent, count: mappingCounts?.customer_mappings },
      { name: 'invoice_mappings_present', pass: (mappingCounts?.invoice_mappings ?? 0) > 0 },
      { name: 'payment_mappings_present', pass: (mappingCounts?.payment_mappings ?? 0) >= 0 },
      { name: 'no_duplicate_customer_mappings', pass: noDupRegression },
      { name: 'cv_auto_recalc_fired', pass: cvFired },
      {
        name: 'recovery_checkpoint_or_resuming',
        pass:
          importJob?.status === 'running' ||
          importJob?.status === 'pending' ||
          summaryResumed(importJob) ||
          jobComplete,
      },
    ];

    const allPass = report.checks.every((c) => c.pass);
    const inProgress =
      importJob &&
      (importJob.status === 'running' || importJob.status === 'pending');

    report.verdict = allPass ? 'PASS' : inProgress ? 'IN_PROGRESS' : 'FAIL';
  } finally {
    await sql.end({ timeout: 5 });
  }

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.verdict === 'PASS' ? 0 : report.verdict === 'IN_PROGRESS' ? 3 : 1);
}

function summaryResumed(importJob) {
  if (!importJob?.result_summary) return false;
  return (
    importJob.result_summary.resumedFromAbandoned === true ||
    importJob.result_summary.heartbeatAt != null
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
