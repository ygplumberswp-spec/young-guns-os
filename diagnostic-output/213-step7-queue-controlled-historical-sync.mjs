/**
 * 213 STEP 7 — queue ONE controlled Xero historical import on staging.
 *
 * The recurring schedule stays disabled. The deployed API's orchestrator calls
 * processPendingImportJobs() on every tick independently of schedule enablement, so a single
 * queued job reproduces exactly what the "Sync Now" button enqueues, without re-enabling
 * recurring sync. The job row mirrors what enqueueImportSync writes:
 * an initial checkpoint at the first stage with modifiedSince null, meaning a complete
 * historical pull with no recent-date cutoff.
 *
 *   node diagnostic-output/213-step7-queue-controlled-historical-sync.mjs          # dry run
 *   node diagnostic-output/213-step7-queue-controlled-historical-sync.mjs --apply
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
const APPLY = process.argv.includes('--apply');

const url = fs
  .readFileSync(path.resolve(repoRoot, 'apps/api/.env.staging.local'), 'utf8')
  .match(/^DATABASE_URL=(.+)$/m)[1]
  .trim()
  .replace(/^["']|["']$/g, '');
if (url.includes('rshuiaghmtrvvilhqpwm') || !url.includes('cpkuwtaipjxeipvbssvn')) {
  console.error('BLOCKED: not staging');
  process.exit(2);
}

const STAGES = [
  'accounts', 'tracking_categories', 'contacts', 'quotes', 'invoices',
  'bills', 'credit_notes', 'payments', 'bank_transactions', 'attachments',
];
const emptyCounts = () => ({ created: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0, fetched: 0 });

const sql = postgres(url, { max: 1, prepare: false });
const out = { label: '213-step7-queue-controlled-historical-sync', mode: APPLY ? 'apply' : 'dry-run' };

try {
  const [conn] = await sql`
    SELECT id, company_id, config->>'organisationName' AS organisation_name, config->>'tenantId' AS tenant_id
    FROM integration_connections WHERE provider='xero' AND status='connected'`;
  if (!conn) throw new Error('no connected Xero connection on staging');

  const [schedule] = await sql`
    SELECT s.enabled FROM integration_sync_schedules s
    JOIN integration_connectors c ON c.id = s.connector_id
    WHERE c.connector_key='xero' AND s.company_id = ${conn.company_id}`;
  if (schedule?.enabled) {
    throw new Error('recurring Xero schedule is enabled — refusing to queue a controlled run');
  }

  const open = await sql`
    SELECT id, status FROM integration_sync_jobs
    WHERE provider='xero' AND sync_scope='import' AND status IN ('pending','running')`;
  if (open.length > 0) {
    out.blocked = `a Xero import job is already open (${open.map((o) => `${o.id}:${o.status}`).join(', ')})`;
  }

  out.connection = {
    companyId: conn.company_id,
    connectionId: conn.id,
    organisationName: conn.organisation_name,
    tenantId: conn.tenant_id,
  };
  out.scheduleEnabled = schedule?.enabled ?? null;

  const summary = {
    ...Object.fromEntries(
      ['accounts', 'trackingCategories', 'contacts', 'quotes', 'invoices', 'bills',
       'creditNotes', 'payments', 'bankTransactions', 'attachments'].map((k) => [k, emptyCounts()]),
    ),
    checkpoint: {
      stage: STAGES[0],
      contactsPage: 1,
      quotesPage: 1,
      invoicesPage: 1,
      billsPage: 1,
      creditNotesPage: 1,
      paymentsPage: 1,
      bankTransactionsPage: 1,
      attachmentsOffset: 0,
      // null = complete historical pull, no date floor.
      modifiedSince: null,
    },
    currentStage: STAGES[0],
    completedStages: [],
    failedStage: null,
    stageError: null,
    trigger: 'manual',
    heartbeatAt: null,
    nextRetryAt: null,
    activity: null,
    processingLeaseOwner: null,
    processingLeaseExpiresAt: null,
    resumedFromAbandoned: false,
    abandoned: false,
    abandonedAt: null,
    abandonReason: null,
  };
  out.plannedSummary = { currentStage: summary.currentStage, modifiedSince: summary.checkpoint.modifiedSince, trigger: summary.trigger };

  if (APPLY && !out.blocked) {
    const [job] = await sql`
      INSERT INTO integration_sync_jobs
        (company_id, integration_connection_id, provider, job_type, sync_scope, status, result_summary)
      VALUES (${conn.company_id}, ${conn.id}, 'xero', 'manual', 'import', 'pending', ${sql.json(summary)})
      RETURNING id, status, started_at`;
    await sql`
      INSERT INTO xero_finance_sync_runs
        (company_id, integration_connection_id, sync_job_id, trigger, status, details)
      VALUES (${conn.company_id}, ${conn.id}, ${job.id}, 'manual', 'queued',
              ${sql.json({ controlledVerificationRun: true, scheduleEnabled: false })})`;
    out.queuedJob = job;
  }

  out.openJobsAfter = await sql`
    SELECT id, status FROM integration_sync_jobs
    WHERE provider='xero' AND sync_scope='import' AND status IN ('pending','running')`;
} catch (e) {
  out.error = String(e.message || e);
} finally {
  await sql.end({ timeout: 5 });
}

fs.writeFileSync(
  path.resolve(repoRoot, `diagnostic-output/213-step7-queue-controlled-historical-sync.${out.mode}.json`),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
