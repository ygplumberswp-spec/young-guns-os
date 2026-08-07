/**
 * 207b STEP 1 — pause Xero scheduled sync on STAGING and stop the stale-job quota burn.
 *
 * Scope guards: staging project only, provider='xero' only. Cartrack/Yoco/custom jobs and
 * schedules belong to other modules and are left untouched. Nothing is deleted — schedules are
 * flipped to enabled=false and the stale import job is moved to 'cancelled', so every historical
 * log row, mapping and OAuth credential is preserved.
 *
 * Pass --apply to write; default is a dry run.
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

const text = fs.readFileSync(path.resolve(repoRoot, 'apps/api/.env.staging.local'), 'utf8');
const url = text.match(/^DATABASE_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '');
if (url.includes('rshuiaghmtrvvilhqpwm') || !url.includes('cpkuwtaipjxeipvbssvn')) {
  console.error('BLOCKED: refusing — target is not the staging project');
  process.exit(2);
}

const sql = postgres(url, { max: 1, prepare: false });
const out = {
  label: '207b-step1-pause-xero-sync',
  mode: APPLY ? 'apply' : 'dry-run',
  generatedAt: new Date().toISOString(),
  pauseMethod:
    "UPDATE integration_sync_schedules SET enabled=false for connector_key='xero' (row preserved, " +
    'never deleted); stale Xero import job moved to status=cancelled. Scheduler process itself stays ' +
    'running so the controlled manual re-run in STEP 6 can still be processed.',
};

try {
  out.before = {
    xeroSchedules: await sql`
      SELECT s.id, s.enabled, s.next_run_at, s.last_run_at, s.frequency_minutes, s.sync_scope
      FROM integration_sync_schedules s
      JOIN integration_connectors c ON c.id = s.connector_id
      WHERE c.connector_key = 'xero'`,
    openXeroImportJobs: await sql`
      SELECT id, company_id, status, job_type, sync_scope, started_at,
             result_summary->>'heartbeatAt' AS heartbeat_at,
             result_summary->'checkpoint'->>'stage' AS stage
      FROM integration_sync_jobs
      WHERE provider = 'xero' AND status IN ('pending','running')`,
    otherProviderOpenJobs: await sql`
      SELECT provider, status, count(*)::int AS n
      FROM integration_sync_jobs
      WHERE provider <> 'xero' AND status IN ('pending','running')
      GROUP BY provider, status ORDER BY provider`,
  };

  if (APPLY) {
    out.disabledSchedules = await sql`
      UPDATE integration_sync_schedules s
      SET enabled = false, updated_at = now()
      FROM integration_connectors c
      WHERE c.id = s.connector_id AND c.connector_key = 'xero' AND s.enabled = true
      RETURNING s.id, s.enabled, s.next_run_at`;

    out.cancelledJobs = await sql`
      UPDATE integration_sync_jobs
      SET status = 'cancelled',
          completed_at = now(),
          error_message = 'Cancelled by staging repair: stale import job paused before migration 0171 and API redeploy. Checkpoint and all sync logs preserved.'
      WHERE provider = 'xero' AND status IN ('pending','running')
      RETURNING id, status, sync_scope, started_at`;
  }

  out.after = {
    xeroSchedules: await sql`
      SELECT s.id, s.enabled, s.next_run_at
      FROM integration_sync_schedules s
      JOIN integration_connectors c ON c.id = s.connector_id
      WHERE c.connector_key = 'xero'`,
    openXeroJobs: (
      await sql`SELECT count(*)::int AS n FROM integration_sync_jobs
                WHERE provider = 'xero' AND status IN ('pending','running')`
    )[0].n,
    // Proof nothing else was touched
    otherProviderSchedules: await sql`
      SELECT c.connector_key, s.enabled FROM integration_sync_schedules s
      JOIN integration_connectors c ON c.id = s.connector_id
      WHERE c.connector_key <> 'xero' ORDER BY c.connector_key`,
    xeroConnectionPreserved: (
      await sql`SELECT status, connected_at, last_sync_at,
                       (credentials_encrypted IS NOT NULL) AS credentials_present,
                       config->>'organisationName' AS organisation_name
                FROM integration_connections WHERE provider='xero' AND status='connected'`
    )[0],
    xeroSyncLogRowsPreserved: (await sql`SELECT count(*)::int AS n FROM xero_sync_logs`)[0].n,
    xeroCustomerMappingsPreserved: (
      await sql`SELECT count(*)::int AS n FROM xero_customer_mappings`
    )[0].n,
  };
} catch (e) {
  out.error = String(e.message || e);
} finally {
  await sql.end({ timeout: 5 });
}

fs.writeFileSync(
  path.resolve(repoRoot, `diagnostic-output/207b-step1-pause-xero-sync.${out.mode}.json`),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
