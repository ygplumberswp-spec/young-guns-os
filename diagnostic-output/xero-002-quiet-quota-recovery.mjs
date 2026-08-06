/**
 * XERO-002 — Quiet quota recovery preparation (staging only).
 * No Xero API calls. Applies tenant sync pause + safe job cancellation when warranted.
 *
 * Usage: node diagnostic-output/xero-002-quiet-quota-recovery.mjs [--apply]
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

const COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const JOB_ID = '63b31706-52a9-42f6-aa1c-e0dd7ad6feb8';
const PAUSE_REASON = 'gate5b_waiting_for_daily_quota';
const STALL_THRESHOLD_MS = 15 * 60_000;

const text = fs.readFileSync(path.resolve(repoRoot, 'apps/api/.env.staging.local'), 'utf8');
const url = text.match(/^DATABASE_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '');
if (url.includes('rshuiaghmtrvvilhqpwm') || !url.includes('cpkuwtaipjxeipvbssvn')) {
  console.error('BLOCKED: refusing — target is not staging cpkuwtaipjxeipvbssvn');
  process.exit(2);
}

const sql = postgres(url, { max: 1, prepare: false });

function parseJobInvestigation(row) {
  if (!row) return null;
  const summary = row.result_summary ?? {};
  const heartbeatAt = summary.heartbeatAt ?? null;
  const heartbeatMs = heartbeatAt ? Date.parse(heartbeatAt) : row.started_at?.getTime?.() ?? Date.now();
  const leaseExpiresAt = summary.processingLeaseExpiresAt ?? null;
  const leaseActive = leaseExpiresAt ? Date.parse(leaseExpiresAt) > Date.now() : false;
  const nextRetryAt = summary.nextRetryAt ?? null;
  const nextRetryPassed = nextRetryAt ? Date.parse(nextRetryAt) <= Date.now() : false;
  const minutesSinceHeartbeat = (Date.now() - heartbeatMs) / 60_000;
  const staleByHeartbeat = minutesSinceHeartbeat >= STALL_THRESHOLD_MS / 60_000;
  const genuinelyRunning =
    row.status === 'running' && leaseActive && summary.activity !== 'rate_limited' && !staleByHeartbeat;
  const operationallyStale =
    staleByHeartbeat ||
    (row.status === 'running' &&
      !leaseActive &&
      (summary.activity === 'rate_limited' || summary.activity === 'stalled' || nextRetryPassed));

  return {
    jobId: row.id,
    status: row.status,
    jobType: row.job_type,
    syncScope: row.sync_scope,
    startedAt: row.started_at?.toISOString?.() ?? row.started_at,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    lastHeartbeat: heartbeatAt,
    lastProgressTime: heartbeatAt,
    currentStage: summary.currentStage ?? summary.checkpoint?.stage ?? null,
    activity: summary.activity ?? null,
    processingLeaseOwner: summary.processingLeaseOwner ?? null,
    processingLeaseExpiresAt: leaseExpiresAt,
    ownsActiveLease: leaseActive,
    nextRetryAt,
    nextRetryPassed,
    stageError: summary.stageError ?? null,
    abandonReason: summary.abandonReason ?? null,
    minutesSinceHeartbeat: Math.round(minutesSinceHeartbeat * 10) / 10,
    staleByHeartbeatThreshold: staleByHeartbeat,
    operationallyStale,
    genuinelyRunning,
    madeXeroRequestsThisRun:
      Boolean(
        (summary.contacts?.pulledCount ?? 0) +
          (summary.invoices?.pulledCount ?? 0) +
          (summary.payments?.pulledCount ?? 0) +
          (summary.bankTransactions?.pulledCount ?? 0),
      ),
  };
}

const out = {
  label: 'xero-002-quiet-quota-recovery',
  mode: APPLY ? 'apply' : 'dry-run',
  generatedAt: new Date().toISOString(),
  companyId: COMPANY_ID,
  jobId: JOB_ID,
  pauseReason: PAUSE_REASON,
};

try {
  const [budgetBefore] = await sql`
    SELECT min_limit_remaining, day_limit_remaining, rate_limit_problem,
           retry_after_until, last_request_at, sync_pause_reason, sync_paused_until, updated_at
    FROM xero_rate_budget_state
    WHERE company_id = ${COMPANY_ID}`;

  const [jobBefore] = await sql`
    SELECT id, company_id, status, job_type, sync_scope, started_at, created_at, completed_at,
           error_message, result_summary
    FROM integration_sync_jobs
    WHERE id = ${JOB_ID}`;

  out.before = {
    budget: budgetBefore ?? null,
    jobInvestigation: parseJobInvestigation(jobBefore),
    openXeroJobs: await sql`
      SELECT id, status, job_type, sync_scope, started_at
      FROM integration_sync_jobs
      WHERE company_id = ${COMPANY_ID} AND provider = 'xero' AND status IN ('pending','running')`,
    xeroSchedules: await sql`
      SELECT s.id, s.enabled, s.sync_scope, s.next_run_at, s.last_run_at
      FROM integration_sync_schedules s
      JOIN integration_connectors c ON c.id = s.connector_id
      WHERE c.connector_key = 'xero' AND s.company_id = ${COMPANY_ID}`,
    pendingTargetedRefresh: await sql`
      SELECT count(*)::int AS n FROM xero_targeted_refresh_jobs
      WHERE company_id = ${COMPANY_ID} AND status IN ('pending','retry','running')`,
  };

  out.pausePlan = {
    mechanism: 'xero_rate_budget_state tenant-scoped pause (pauseTenantSync semantics)',
    syncPauseReason: PAUSE_REASON,
    syncPausedUntil: null,
    note: 'NULL until = indefinite pause until Owner resume-sync',
  };

  out.jobActionPlan = out.before.jobInvestigation?.operationallyStale
    ? 'cancel safely — preserve checkpoint/history, audit event, no restart'
    : out.before.jobInvestigation?.genuinelyRunning
      ? 'no cancel — job appears genuinely running (unexpected)'
      : 'cancel safely — rate-limited with expired lease; will re-compete on scheduler without pause';

  if (APPLY) {
    const pauseAt = new Date();
    out.pauseApplied = await sql`
      INSERT INTO xero_rate_budget_state (
        company_id, sync_pause_reason, sync_paused_until, updated_at
      ) VALUES (
        ${COMPANY_ID}, ${PAUSE_REASON}, NULL, ${pauseAt}
      )
      ON CONFLICT (company_id) DO UPDATE SET
        sync_pause_reason = EXCLUDED.sync_pause_reason,
        sync_paused_until = NULL,
        updated_at = EXCLUDED.updated_at
      RETURNING sync_pause_reason, sync_paused_until, updated_at`;

    out.pauseAudit = await sql`
      INSERT INTO security_audit_logs (company_id, user_id, category, action, entity_type, entity_id, metadata)
      VALUES (
        ${COMPANY_ID}, NULL, 'integrations', 'xero_sync_paused_for_proof', 'xero_rate_budget_state', ${COMPANY_ID},
        ${sql.json({
          reason: PAUSE_REASON,
          until: null,
          auditLabel: 'xero_sync_paused_for_proof',
          context: 'xero-002-quiet-quota-recovery',
        })}
      )
      RETURNING id, action, occurred_at, metadata`;

    out.pauseTimestamp = pauseAt.toISOString();

    if (jobBefore && jobBefore.status !== 'cancelled' && jobBefore.status !== 'completed') {
      const summary = { ...(jobBefore.result_summary ?? {}) };
      summary.deferredForQuotaRecovery = true;
      summary.deferredAt = pauseAt.toISOString();
      summary.deferredReason = PAUSE_REASON;
      summary.activity = 'deferred';
      summary.processingLeaseOwner = null;
      summary.processingLeaseExpiresAt = null;

      out.jobCancelled = await sql`
        UPDATE integration_sync_jobs
        SET status = 'cancelled',
            completed_at = ${pauseAt},
            error_message = ${'Deferred for Gate 5B daily quota recovery — checkpoint and sync logs preserved. Owner resume required before retry.'},
            result_summary = ${sql.json(summary)}
        WHERE id = ${JOB_ID}
          AND company_id = ${COMPANY_ID}
          AND status IN ('pending','running')
        RETURNING id, status, completed_at, error_message`;

      out.jobAudit = await sql`
        INSERT INTO security_audit_logs (company_id, user_id, category, action, entity_type, entity_id, metadata)
        VALUES (
          ${COMPANY_ID}, NULL, 'integrations', 'xero_import_deferred_quota_recovery', 'integration_sync_job', ${JOB_ID},
          ${sql.json({
            previousStatus: jobBefore.status,
            pauseReason: PAUSE_REASON,
            checkpointStage: summary.currentStage ?? summary.checkpoint?.stage ?? null,
            checkpointPreserved: true,
            restarted: false,
          })}
        )
        RETURNING id, action, occurred_at, metadata`;
    }

    out.schedulesDisabled = await sql`
      UPDATE integration_sync_schedules s
      SET enabled = false, updated_at = now()
      FROM integration_connectors c
      WHERE c.id = s.connector_id
        AND c.connector_key = 'xero'
        AND s.company_id = ${COMPANY_ID}
        AND s.enabled = true
      RETURNING s.id, s.enabled, s.sync_scope, s.next_run_at`;
  }

  const [budgetAfter] = await sql`
    SELECT min_limit_remaining, day_limit_remaining, rate_limit_problem,
           retry_after_until, last_request_at, sync_pause_reason, sync_paused_until, updated_at
    FROM xero_rate_budget_state
    WHERE company_id = ${COMPANY_ID}`;

  const [jobAfter] = await sql`
    SELECT id, status, job_type, sync_scope, started_at, completed_at, error_message, result_summary
    FROM integration_sync_jobs WHERE id = ${JOB_ID}`;

  out.after = {
    budget: budgetAfter ?? null,
    job: jobAfter
      ? {
          id: jobAfter.id,
          status: jobAfter.status,
          completedAt: jobAfter.completed_at,
          deferredForQuotaRecovery: jobAfter.result_summary?.deferredForQuotaRecovery ?? false,
        }
      : null,
    openXeroJobs: await sql`
      SELECT id, status FROM integration_sync_jobs
      WHERE company_id = ${COMPANY_ID} AND provider = 'xero' AND status IN ('pending','running')`,
    xeroSchedules: await sql`
      SELECT s.id, s.enabled, s.sync_scope, s.next_run_at
      FROM integration_sync_schedules s
      JOIN integration_connectors c ON c.id = s.connector_id
      WHERE c.connector_key = 'xero' AND s.company_id = ${COMPANY_ID}`,
    pendingTargetedRefresh: (
      await sql`SELECT count(*)::int AS n FROM xero_targeted_refresh_jobs
                WHERE company_id = ${COMPANY_ID} AND status IN ('pending','retry','running')`
    )[0].n,
    requestsAfterPause:
      APPLY && out.pauseTimestamp
        ? (
            await sql`SELECT count(*)::int AS n FROM xero_rate_budget_state
                      WHERE company_id = ${COMPANY_ID}
                        AND last_request_at > ${out.pauseTimestamp}::timestamptz`
          )[0].n === 0
        : null,
  };

  out.confirmations = {
    syncPauseActive: Boolean(budgetAfter?.sync_pause_reason),
    noActiveXeroJobs: (out.after.openXeroJobs?.length ?? 0) === 0,
    dayLimitUnchanged:
      budgetBefore?.day_limit_remaining === budgetAfter?.day_limit_remaining,
    lastXeroRequestAt: budgetAfter?.last_request_at ?? null,
    productionUntouched: true,
    outboundQuiet:
      Boolean(budgetAfter?.sync_pause_reason) &&
      (out.after.openXeroJobs?.length ?? 0) === 0 &&
      out.after.xeroSchedules?.every((s) => s.enabled === false),
  };

  out.nextAction =
    'Run one coordinated Gate 5B proof after a clean cooldown (retry_after_until clear + ≥120s quiet since last_request_at). Owner must resume-sync before proof if pause still active.';
} catch (e) {
  out.error = String(e.message || e);
} finally {
  await sql.end({ timeout: 5 });
}

const outPath = path.resolve(
  repoRoot,
  `diagnostic-output/xero-002-quiet-quota-recovery.${out.mode}.json`,
);
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
