/** 207 STEP 1 — classify the Xero import job backlog on staging (READ-ONLY, no secrets). */
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

const text = fs.readFileSync(path.resolve(repoRoot, 'apps/api/.env.staging.local'), 'utf8');
const url = text.match(/^DATABASE_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '');
if (url.includes('rshuiaghmtrvvilhqpwm') || !url.includes('cpkuwtaipjxeipvbssvn')) {
  console.error('BLOCKED: not the staging project');
  process.exit(2);
}

const sql = postgres(url, { max: 1, prepare: false });
const out = { label: '207-step1-job-backlog-classify', generatedAt: new Date().toISOString() };
const STALL_MS = 10 * 60_000;

try {
  out.jobColumns = (
    await sql`SELECT column_name, data_type FROM information_schema.columns
              WHERE table_schema='public' AND table_name='integration_sync_jobs'
              ORDER BY ordinal_position`
  ).map((r) => `${r.column_name}:${r.data_type}`);

  out.statusBreakdown = await sql`
    SELECT status, provider, count(*)::int AS n,
           min(created_at) AS oldest, max(created_at) AS newest
    FROM integration_sync_jobs
    GROUP BY status, provider ORDER BY status, provider`;

  const open = await sql`
    SELECT id, company_id, provider, job_type, status, created_at, started_at,
           result_summary->'checkpoint'->>'stage' AS stage,
           result_summary->>'heartbeatAt' AS heartbeat_at,
           result_summary->>'activity' AS activity,
           result_summary->>'abandoned' AS abandoned,
           result_summary->>'failedStage' AS failed_stage
    FROM integration_sync_jobs
    WHERE status IN ('pending','running')
    ORDER BY created_at`;

  const now = Date.now();
  out.openJobs = open.map((j) => {
    const hb = j.heartbeat_at ? Date.parse(j.heartbeat_at) : j.started_at ? +new Date(j.started_at) : null;
    const ageMs = hb ? now - hb : null;
    const classification =
      j.status === 'running' && ageMs !== null && ageMs <= STALL_MS
        ? 'genuinely_running'
        : j.status === 'running'
          ? 'stale_running'
          : 'pending_queued';
    return {
      id: j.id,
      provider: j.provider,
      jobType: j.job_type,
      status: j.status,
      stage: j.stage,
      activity: j.activity,
      failedStage: j.failed_stage,
      createdAt: j.created_at,
      heartbeatAt: j.heartbeat_at,
      heartbeatAgeMinutes: ageMs === null ? null : Math.round(ageMs / 60000),
      classification,
    };
  });

  out.classificationCounts = out.openJobs.reduce((acc, j) => {
    acc[j.classification] = (acc[j.classification] ?? 0) + 1;
    return acc;
  }, {});

  out.schedules = await sql`
    SELECT s.id, s.company_id, s.connector_id, s.sync_scope, s.frequency_minutes,
           s.enabled, s.next_run_at, s.last_run_at, c.connector_key
    FROM integration_sync_schedules s
    LEFT JOIN integration_connectors c ON c.id = s.connector_id
    ORDER BY s.created_at`;
} catch (e) {
  out.error = String(e.message || e);
} finally {
  await sql.end({ timeout: 5 });
}

fs.writeFileSync(
  path.resolve(repoRoot, 'diagnostic-output/207-step1-job-backlog-classify.json'),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
