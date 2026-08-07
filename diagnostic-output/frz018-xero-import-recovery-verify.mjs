/**
 * FRZ-018 — Xero import heartbeat/recovery staging verification (read-only DB probe).
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
const TARGET_JOB_ID = '8e6aec9b-2d99-493c-85b8-75f61d7f414b';

function loadStagingDatabaseUrl() {
  const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
  if (!fs.existsSync(envPath)) return process.env.STAGING_DATABASE_URL || null;
  const text = fs.readFileSync(envPath, 'utf8');
  const match = text.match(/^DATABASE_URL=(.+)$/m);
  return match?.[1]?.trim().replace(/^["']|["']$/g, '') || process.env.STAGING_DATABASE_URL || null;
}

async function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    targetJobId: TARGET_JOB_ID,
    checks: [],
  };

  const databaseUrl = loadStagingDatabaseUrl();
  if (!databaseUrl || databaseUrl.includes(FORBIDDEN)) {
    report.checks.push({
      name: 'db_connection',
      status: 'SKIP',
      detail: 'Staging DATABASE_URL unavailable or refused',
    });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false });

  try {
    const [job] = await sql`
      select id, status, error_message, started_at, completed_at, result_summary
      from integration_sync_jobs
      where id = ${TARGET_JOB_ID}::uuid
    `;

    const summary = job?.result_summary ?? {};
    const [mappingCounts] = await sql`
      select
        (select count(*)::int from xero_customer_mappings where sync_status = 'synced') as customers,
        (select count(*)::int from xero_invoice_mappings where sync_status = 'synced') as invoices,
        (select count(*)::int from xero_payment_mappings where sync_status = 'synced') as payments
    `;

    const [connection] = await sql`
      select last_sync_at, last_error
      from integration_connections
      where provider = 'xero'
      order by updated_at desc
      limit 1
    `;

    report.checks.push({
      name: 'target_job_status',
      status: job ? 'PASS' : 'FAIL',
      detail: job
        ? `${job.status} · checkpoint=${summary?.checkpoint?.stage ?? summary?.currentStage ?? 'missing'} · uiActivity=${summary?.activity ?? 'n/a'}`
        : 'Job not found',
    });

    report.checks.push({
      name: 'checkpoint_preserved',
      status: summary?.checkpoint || summary?.contacts ? 'PASS' : 'PARTIAL',
      detail: JSON.stringify({
        checkpoint: summary?.checkpoint ?? null,
        contactsPulled: summary?.contacts?.pulledCount ?? null,
        resumedFromAbandoned: summary?.resumedFromAbandoned ?? false,
        heartbeatAt: summary?.heartbeatAt ?? null,
      }),
    });

    report.checks.push({
      name: 'mapping_counts',
      status: 'PASS',
      detail: mappingCounts,
    });

    report.checks.push({
      name: 'last_sync_at',
      status: connection?.last_sync_at ? 'PASS' : 'PARTIAL',
      detail: {
        lastSyncAt: connection?.last_sync_at ?? null,
        lastError: connection?.last_error ?? null,
      },
    });

    report.job = job
      ? {
          id: job.id,
          status: job.status,
          errorMessage: job.error_message,
          startedAt: job.started_at,
          completedAt: job.completed_at,
          resultSummary: summary,
        }
      : null;
    report.mappingCounts = mappingCounts;
    report.connection = connection;
  } finally {
    await sql.end({ timeout: 5 });
  }

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
