/**
 * Read-only — check CV-001b connector marker + latest import job status.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/db/package.json'),
);
const postgres = require('postgres');

const YGP = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const url = process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('No DATABASE_URL');
  process.exit(2);
}

const sql = postgres(url, { max: 1, prepare: false });
try {
  const [cv] = await sql`
    SELECT config->'autoSync' as auto_sync
    FROM integration_connectors
    WHERE company_id = ${YGP}::uuid AND connector_key = 'xero'
    LIMIT 1
  `;
  const jobs = await sql`
    SELECT id, status, started_at, completed_at, result_summary->'checkpoint' as checkpoint
    FROM integration_sync_jobs
    WHERE company_id = ${YGP}::uuid AND provider = 'xero' AND sync_scope = 'import'
    ORDER BY started_at DESC
    LIMIT 3
  `;
  console.log(
    JSON.stringify(
      {
        cvMetricsRefreshJobId: cv?.auto_sync?.cvMetricsRefreshJobId ?? null,
        cvMetricsRefreshAt: cv?.auto_sync?.cvMetricsRefreshAt ?? null,
        recentImportJobs: jobs.map((j) => ({
          id: j.id,
          status: j.status,
          stage: j.checkpoint?.stage ?? null,
          startedAt: j.started_at?.toISOString?.() ?? j.started_at,
          completedAt: j.completed_at?.toISOString?.() ?? j.completed_at,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
