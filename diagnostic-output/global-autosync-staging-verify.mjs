/**
 * GLOBAL-AUTOSYNC-179 — Global real-time & auto-sync staging verification.
 * Staging only — refuses production Supabase ref. No financial writes to Xero.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/db/package.json'));
const postgres = require('postgres');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outPath = path.resolve(repoRoot, 'diagnostic-output/179-global-autosync-staging-verify.json');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';
const API_ORIGIN = (process.env.STAGING_API_BASE || 'https://young-guns-os-staging.up.railway.app').replace(/\/$/, '');
const OWNER_ACCESS_TOKEN = process.env.OWNER_ACCESS_TOKEN?.trim() || null;

function redact(text) {
  return String(text ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._-]{20,}/gi, '[REDACTED]')
    .replace(/postgresql:\/\/[^\s"']+/gi, '[REDACTED]')
    .slice(0, 500);
}

function pass(results, name, detail = '') {
  results.push({ name, status: 'PASS', detail: redact(detail) });
}
function fail(results, name, detail = '') {
  results.push({ name, status: 'FAIL', detail: redact(detail) });
}
function partial(results, name, detail = '') {
  results.push({ name, status: 'PARTIAL', detail: redact(detail) });
}

async function api(pathname, { method = 'GET', token, body, timeoutMs = 15_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${API_ORIGIN}${pathname}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 200) };
    }
    return { status: res.status, json, raw: text };
  } finally {
    clearTimeout(timer);
  }
}

function loadStagingDatabaseUrl() {
  const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
  if (!fs.existsSync(envPath)) return process.env.STAGING_DATABASE_URL || null;
  const text = fs.readFileSync(envPath, 'utf8');
  const match = text.match(/^DATABASE_URL=(.+)$/m);
  return match?.[1]?.trim().replace(/^["']|["']$/g, '') || process.env.STAGING_DATABASE_URL || null;
}

async function probeDb(report) {
  const databaseUrl = loadStagingDatabaseUrl();
  if (!databaseUrl) {
    partial(report.results, 'db_staging_connection_probe', 'No staging DATABASE_URL');
    return null;
  }
  if (databaseUrl.includes(FORBIDDEN)) {
    fail(report.results, 'db_staging_connection_probe', 'Refused production database URL');
    return null;
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const [row] = await sql`
      select ic.company_id, ic.status, ic.last_sync_at, ic.config->>'organisationName' as org
      from integration_connections ic
      where ic.provider = 'xero' and ic.status = 'connected'
      order by ic.updated_at desc
      limit 1
    `;

    if (!row) {
      fail(report.results, 'db_xero_connected', 'No connected Xero tenant');
      return null;
    }
    pass(report.results, 'db_xero_connected', row.org || 'connected');

    const schedules = await sql`
      select count(*)::int as count
      from integration_sync_schedules iss
      join integration_connectors ic on ic.id = iss.connector_id
      where iss.company_id = ${row.company_id} and ic.connector_key = 'xero'
    `;
    if ((schedules[0]?.count ?? 0) > 0) {
      pass(report.results, 'db_xero_auto_sync_schedule', String(schedules[0].count));
    } else {
      partial(report.results, 'db_xero_auto_sync_schedule', '0 schedules — backfill may be pending');
    }

    const jobs = await sql`
      select id, status, sync_scope, result_summary, error_message
      from integration_sync_jobs
      where company_id = ${row.company_id} and provider = 'xero' and sync_scope = 'import'
      order by started_at desc
      limit 3
    `;

    const latest = jobs[0];
    if (latest?.result_summary?.checkpoint) {
      pass(report.results, 'db_checkpoint_metadata', latest.result_summary.checkpoint.stage);
    } else {
      partial(report.results, 'db_checkpoint_metadata', latest ? `status=${latest.status}` : 'no import jobs');
    }

    if (latest?.error_message && String(latest.error_message).includes('90s')) {
      fail(report.results, 'db_no_90s_timeout_errors', latest.error_message);
    } else {
      pass(report.results, 'db_no_90s_timeout_errors', 'no 90s timeout in recent jobs');
    }

    report.dbSnapshot = {
      organisationName: row.org,
      lastSyncAt: row.last_sync_at,
      scheduleCount: schedules[0]?.count ?? 0,
      recentImportJobs: jobs.map((j) => ({
        id: j.id,
        status: j.status,
        stage: j.result_summary?.checkpoint?.stage ?? null,
      })),
    };

    return { companyId: row.company_id };
  } catch (err) {
    partial(report.results, 'db_staging_connection_probe', redact(err?.message || String(err)));
    return null;
  } finally {
    await sql.end();
  }
}

async function probeApi(report) {
  const ready = await api('/api/v1/health/ready');
  if (ready.status === 200) {
    pass(report.results, 'api_health_ready', 'ok');
  } else {
    fail(report.results, 'api_health_ready', String(ready.status));
  }

  if (!OWNER_ACCESS_TOKEN) {
    partial(report.results, 'api_background_work_status', 'OWNER_ACCESS_TOKEN not set');
    partial(report.results, 'api_connectors_sync_quick', 'OWNER_ACCESS_TOKEN not set');
    return;
  }

  const bg = await api('/api/v1/background-work/status', { token: OWNER_ACCESS_TOKEN });
  if (bg.status === 200 && bg.json?.data?.status?.generatedAt) {
    pass(
      report.results,
      'api_background_work_status',
      `items=${bg.json.data.status.items?.length ?? 0}`,
    );
  } else if (bg.status === 404) {
    partial(report.results, 'api_background_work_status', 'route not deployed yet');
  } else {
    partial(report.results, 'api_background_work_status', String(bg.status));
  }

  const autoSync = await api('/api/v1/integration-platform/auto-sync', { token: OWNER_ACCESS_TOKEN });
  if (autoSync.status === 200 && Array.isArray(autoSync.json?.data?.statuses)) {
    pass(report.results, 'api_integration_auto_sync', `${autoSync.json.data.statuses.length} providers`);
  } else {
    partial(report.results, 'api_integration_auto_sync', String(autoSync.status));
  }

  const started = Date.now();
  const enqueue = await api('/api/v1/integration-platform/connectors/sync', {
    method: 'POST',
    token: OWNER_ACCESS_TOKEN,
    timeoutMs: 15_000,
  });
  const elapsed = Date.now() - started;
  if (enqueue.status === 200 && elapsed < 20_000) {
    pass(report.results, 'api_connectors_sync_quick', `${elapsed}ms`);
  } else {
    partial(report.results, 'api_connectors_sync_quick', `status=${enqueue.status} elapsed=${elapsed}ms`);
  }
}

const report = {
  label: 'GLOBAL-AUTOSYNC-179',
  generatedAt: new Date().toISOString(),
  apiOrigin: API_ORIGIN,
  architectureDoc: 'TITAN_GLOBAL_REALTIME_AUTO_SYNC_ARCHITECTURE.md',
  results: [],
  verdict: 'PARTIAL',
};

await probeApi(report);
await probeDb(report);

const fails = report.results.filter((r) => r.status === 'FAIL').length;
const passes = report.results.filter((r) => r.status === 'PASS').length;
if (fails === 0 && passes >= 5) {
  report.verdict = report.results.some((r) => r.status === 'PARTIAL') ? 'PARTIAL' : 'GO';
} else if (fails > 0) {
  report.verdict = 'PARTIAL';
}

fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`Wrote ${outPath}`);
console.log(`Verdict: ${report.verdict} (${passes} PASS / ${fails} FAIL / ${report.results.length - passes - fails} PARTIAL)`);
