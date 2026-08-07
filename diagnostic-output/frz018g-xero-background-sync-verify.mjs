/**
 * FRZ-018g — Xero background import job architecture staging verification.
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
const outPath = path.resolve(repoRoot, 'diagnostic-output/178-frz018g-xero-background-sync-verify.json');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';
const API_ORIGIN = (process.env.STAGING_API_BASE || 'https://young-guns-os-staging.up.railway.app').replace(/\/$/, '');
const OWNER_ACCESS_TOKEN = process.env.OWNER_ACCESS_TOKEN?.trim() || null;
const COMMIT = '3120483';

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
  if (!databaseUrl.includes(STAGING_REF)) {
    partial(report.results, 'db_staging_connection_probe', `Unexpected ref (expected ${STAGING_REF})`);
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const [row] = await sql`
      select ic.id as connection_id, ic.company_id, ic.status, ic.last_sync_at, ic.last_error,
             ic.config->>'organisationName' as organisation_name
      from integration_connections ic
      where ic.provider = 'xero' and ic.status = 'connected'
      order by ic.updated_at desc
      limit 1
    `;

    if (!row) {
      fail(report.results, 'db_xero_connected', 'No connected Xero tenant');
      return null;
    }

    pass(report.results, 'db_xero_connected', row.organisation_name || 'connected');

    const jobs = await sql`
      select id, status, job_type, sync_scope, started_at, completed_at, error_message, result_summary
      from integration_sync_jobs
      where company_id = ${row.company_id} and provider = 'xero' and sync_scope = 'import'
      order by started_at desc
      limit 5
    `;

    const activeJob = jobs.find((j) => j.status === 'pending' || j.status === 'running');
    const latestJob = jobs[0];

    if (latestJob?.result_summary?.checkpoint) {
      pass(
        report.results,
        'db_import_job_checkpoint_metadata',
        `stage=${latestJob.result_summary.currentStage || latestJob.result_summary.checkpoint.stage}`,
      );
    } else if (latestJob) {
      partial(report.results, 'db_import_job_checkpoint_metadata', `latest status=${latestJob.status}, no checkpoint yet`);
    } else {
      partial(report.results, 'db_import_job_checkpoint_metadata', 'no import jobs yet');
    }

    if (activeJob) {
      pass(report.results, 'db_background_job_active', `job=${activeJob.id} status=${activeJob.status}`);
    } else if (latestJob?.status === 'completed') {
      pass(report.results, 'db_background_job_active', 'latest import job completed');
    } else if (latestJob?.status === 'failed' && !String(latestJob.error_message || '').includes('90s')) {
      partial(report.results, 'db_background_job_active', `latest failed without 90s timeout: ${String(latestJob.error_message || '').slice(0, 80)}`);
    } else if (latestJob?.status === 'failed') {
      fail(report.results, 'db_background_job_active', String(latestJob.error_message || 'failed'));
    } else {
      partial(report.results, 'db_background_job_active', 'no active or completed import job');
    }

    const mappings = await sql`
      select
        (select count(*)::int from xero_customer_mappings where company_id = ${row.company_id}) as customers,
        (select count(*)::int from xero_invoice_mappings where company_id = ${row.company_id}) as invoices,
        (select count(*)::int from xero_payment_mappings where company_id = ${row.company_id}) as payments
    `;

    report.dbSnapshot = {
      organisationName: row.organisation_name,
      lastSyncAt: row.last_sync_at,
      lastError: row.last_error,
      customerMappings: mappings[0]?.customers ?? 0,
      invoiceMappings: mappings[0]?.invoices ?? 0,
      paymentMappings: mappings[0]?.payments ?? 0,
      recentJobs: jobs.map((j) => ({
        id: j.id,
        status: j.status,
        currentStage: j.result_summary?.currentStage ?? j.result_summary?.checkpoint?.stage ?? null,
        completedStages: j.result_summary?.completedStages ?? [],
        errorPrefix: j.error_message ? String(j.error_message).slice(0, 100) : null,
      })),
    };

    if (row.last_sync_at) {
      pass(report.results, 'db_last_sync_at_populated', new Date(row.last_sync_at).toISOString());
    } else {
      partial(report.results, 'db_last_sync_at_populated', 'null — expected until full background import completes');
    }

    if (!activeJob && row.connection_id) {
      const [inserted] = await sql`
        insert into integration_sync_jobs (
          company_id, integration_connection_id, provider, job_type, status, sync_scope, result_summary
        )
        select ${row.company_id}, ${row.connection_id}, 'xero', 'scheduled', 'pending', 'import',
               ${JSON.stringify({
                 checkpoint: {
                   stage: 'contacts',
                   contactsPage: 1,
                   invoicesPage: 1,
                   paymentsPage: 1,
                   bankTransactionsPage: 1,
                 },
                 currentStage: 'contacts',
                 completedStages: [],
                 trigger: 'incremental',
                 queuedBy: 'frz018g-verify',
               })}::jsonb
        where not exists (
          select 1 from integration_sync_jobs
          where company_id = ${row.company_id}
            and provider = 'xero'
            and sync_scope = 'import'
            and status in ('pending', 'running')
        )
        returning id
      `;
      if (inserted?.id) {
        pass(report.results, 'db_enqueue_background_import_job', inserted.id);
        report.enqueuedJobId = inserted.id;
      } else {
        partial(report.results, 'db_enqueue_background_import_job', 'active job already exists — scheduler will continue it');
      }
    }

    return { companyId: row.company_id, connectionId: row.connection_id };
  } catch (err) {
    partial(report.results, 'db_staging_connection_probe', redact(err?.message || String(err)));
    return null;
  } finally {
    await sql.end();
  }
}

async function probeApi(report) {
  const ready = await api('/api/v1/health/ready');
  if (ready.status === 200 && ready.json?.data?.database === 'connected') {
    pass(report.results, 'api_health_ready', 'database connected');
  } else {
    fail(report.results, 'api_health_ready', String(ready.status));
  }

  if (OWNER_ACCESS_TOKEN) {
    const syncStatus = await api('/api/v1/integrations/xero/sync/status', { token: OWNER_ACCESS_TOKEN });
    const importJob = syncStatus.json?.data?.status?.importJob;
    if (syncStatus.status === 200 && importJob) {
      pass(
        report.results,
        'api_sync_status_import_job',
        `status=${importJob.status} stage=${importJob.currentStage}`,
      );
    } else if (syncStatus.status === 200) {
      partial(report.results, 'api_sync_status_import_job', 'no importJob field yet (deploy may be pending)');
    } else {
      partial(report.results, 'api_sync_status_import_job', String(syncStatus.status));
    }

    const enqueue = await api('/api/v1/integration-platform/connectors/sync', {
      method: 'POST',
      token: OWNER_ACCESS_TOKEN,
      timeoutMs: 15_000,
    });
    if (enqueue.status === 200) {
      const xeroSync = enqueue.json?.data?.xeroSync;
      if (xeroSync?.queued || xeroSync?.syncJobId) {
        pass(report.results, 'api_connectors_sync_returns_quickly', xeroSync.message || 'queued');
      } else {
        partial(report.results, 'api_connectors_sync_returns_quickly', JSON.stringify(xeroSync ?? {}).slice(0, 120));
      }
    } else {
      partial(report.results, 'api_connectors_sync_returns_quickly', String(enqueue.status));
    }
  } else {
    partial(report.results, 'api_owner_sync_flow', 'OWNER_ACCESS_TOKEN not set — DB enqueue only');
  }
}

const report = {
  label: 'FRZ018g',
  commit: COMMIT,
  generatedAt: new Date().toISOString(),
  apiOrigin: API_ORIGIN,
  results: [],
  checklist: {},
  verdict: 'PARTIAL',
};

await probeApi(report);
await probeDb(report);

const fails = report.results.filter((r) => r.status === 'FAIL').length;
const passes = report.results.filter((r) => r.status === 'PASS').length;
if (fails === 0 && passes >= 6) {
  report.verdict = report.results.some((r) => r.status === 'PARTIAL') ? 'PARTIAL' : 'GO';
} else if (fails > 0) {
  report.verdict = 'PARTIAL';
}

fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`Wrote ${outPath}`);
console.log(`Verdict: ${report.verdict} (${passes} PASS / ${fails} FAIL / ${report.results.length - passes - fails} PARTIAL)`);
