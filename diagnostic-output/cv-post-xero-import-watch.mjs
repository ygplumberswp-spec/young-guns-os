/**
 * CV-001 post-Xero-import watcher — read-only poll until import completes, then rerun classification probe.
 * Does NOT enqueue sync jobs or interrupt active Xero background import.
 *
 * Usage:
 *   STAGING_DATABASE_URL=postgresql://... node diagnostic-output/cv-post-xero-import-watch.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const require = createRequire(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/db/package.json'),
);
const postgres = require('postgres');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outPath = path.resolve(repoRoot, 'diagnostic-output/185-cv-post-xero-import-complete.json');
const probeScript = path.resolve(repoRoot, 'diagnostic-output/182-customer-value-classification-staging-probe.mjs');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';
const POLL_INTERVAL_MS = 60_000;
const MAX_WAIT_MS = 4 * 60 * 60 * 1000;
const TARGET_JOB_PREFIX = '8e6aec9b';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runProbe(databaseUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [probeScript], {
      cwd: repoRoot,
      env: { ...process.env, STAGING_DATABASE_URL: databaseUrl, DATABASE_URL: databaseUrl },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `Probe exited ${code}`));
    });
  });
}

async function pollImportComplete(sql, companyId) {
  const importJobs = await sql`
    select id, status from integration_sync_jobs
    where company_id = ${companyId}
      and provider = 'xero'
      and sync_scope = 'import'
      and id::text like ${TARGET_JOB_PREFIX + '%'}
    order by created_at desc
    limit 1
  `;

  const connection = await sql`
    select last_sync_at from integration_connections
    where company_id = ${companyId} and provider = 'xero'
    limit 1
  `;

  const job = importJobs[0] ?? null;
  const lastSyncAt = connection[0]?.last_sync_at ?? null;
  const importComplete = job?.status === 'completed' && lastSyncAt != null;

  return {
    jobId: job?.id ?? null,
    jobStatus: job?.status ?? null,
    lastSyncAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : null,
    importComplete,
  };
}

async function main() {
  const databaseUrl = process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL;
  const report = {
    label: '185-cv-post-xero-import-complete',
    generatedAt: new Date().toISOString(),
    stagingRef: STAGING_REF,
    forbiddenProductionRef: FORBIDDEN,
    verdict: 'SKIPPED',
    startedAt: new Date().toISOString(),
    completedAt: null,
    pollIntervalMs: POLL_INTERVAL_MS,
    maxWaitMs: MAX_WAIT_MS,
    targetJobPrefix: TARGET_JOB_PREFIX,
    importStatusAtStart: null,
    importStatusAtComplete: null,
    probe: null,
    notes: [],
  };

  if (!databaseUrl) {
    report.notes.push('No STAGING_DATABASE_URL — skipped watcher');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`Wrote ${outPath} (skipped — no DATABASE_URL)`);
    return;
  }

  if (databaseUrl.includes(FORBIDDEN)) {
    report.verdict = 'REFUSED_PRODUCTION';
    report.notes.push('Refused production Supabase ref');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.error('Refused production database URL');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  const deadline = Date.now() + MAX_WAIT_MS;

  try {
    const companies = await sql`
      select id, name from companies where name ilike '%Young Guns Plumbing%' limit 1
    `;
    if (!companies[0]) {
      report.notes.push('Young Guns Plumbing company not found');
      fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
      return;
    }

    const companyId = companies[0].id;
    report.youngGunsCompanyId = companyId;

    report.importStatusAtStart = await pollImportComplete(sql, companyId);
    console.log(
      `[cv-post-xero-import-watch] start job=${report.importStatusAtStart.jobStatus} last_sync_at=${report.importStatusAtStart.lastSyncAt}`,
    );

    while (Date.now() < deadline) {
      const status = await pollImportComplete(sql, companyId);
      if (status.importComplete) {
        report.importStatusAtComplete = status;
        break;
      }

      if (status.jobStatus === 'failed' || status.jobStatus === 'cancelled') {
        report.importStatusAtComplete = status;
        report.verdict = 'IMPORT_FAILED';
        report.notes.push(`Xero import job ended with status=${status.jobStatus}`);
        fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
        console.log(`Import job ${status.jobStatus} — watcher exiting without probe`);
        return;
      }

      console.log(
        `[cv-post-xero-import-watch] waiting job=${status.jobStatus} last_sync_at=${status.lastSyncAt ?? 'null'}`,
      );
      await sleep(POLL_INTERVAL_MS);
    }

    if (!report.importStatusAtComplete?.importComplete) {
      report.verdict = 'TIMEOUT';
      report.notes.push('Max wait elapsed before import completed');
      fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
      console.log('Timed out waiting for Xero import completion');
      process.exit(1);
    }

    console.log('[cv-post-xero-import-watch] import complete — running classification probe');
    await runProbe(databaseUrl);

    const probePath = path.resolve(
      repoRoot,
      'diagnostic-output/182-customer-value-classification-staging-probe.json',
    );
    report.probe = fs.existsSync(probePath) ? JSON.parse(fs.readFileSync(probePath, 'utf8')) : null;
    report.verdict = report.probe?.verdict === 'PASS' ? 'PASS' : 'PROBE_INCOMPLETE';
    report.completedAt = new Date().toISOString();
    report.notes.push('Post-import customer value classification probe completed automatically');
  } catch (err) {
    report.verdict = 'ERROR';
    report.notes.push(`Watcher failed: ${String(err?.message || err).slice(0, 200)}`);
  } finally {
    try {
      await sql.end();
    } catch {
      // ignore disconnect errors
    }
  }

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Wrote ${outPath} verdict=${report.verdict}`);
  if (report.verdict !== 'PASS') process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
