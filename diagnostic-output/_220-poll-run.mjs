/**
 * 220 — Phase 2 final verify: poll staging until Xero import quiescent, then run 187.
 * Follow-up c90779e8; may overlap c2db31b1 / _219-poll-run.mjs (30m).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const require = createRequire(path.join(repoRoot, 'packages/db/package.json'));
const postgres = require('postgres');

const POLL_MS = 180_000;
const MAX_MS = 60 * 60_000;
const YGP = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const TARGET = '93144ea8-f159-416f-bc48-b3b7b5445f98';
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadStagingDatabaseUrl() {
  const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
  if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, 'utf8');
    const match = text.match(/^DATABASE_URL=(.+)$/m);
    const u = match?.[1]?.trim().replace(/^["']|["']$/g, '');
    if (u) return u;
  }
  return process.env.STAGING_DATABASE_URL || null;
}

const databaseUrl = loadStagingDatabaseUrl();
if (!databaseUrl || databaseUrl.includes(FORBIDDEN)) {
  console.error('Missing or invalid staging DATABASE_URL');
  process.exit(2);
}

const log = [];
const bankTxProgress = [];
const start = Date.now();
const sql = postgres(databaseUrl, { max: 1, prepare: false });

function extractBankTx(row) {
  const summary = row?.result_summary ?? {};
  const cp = summary.checkpoint ?? {};
  const bt = summary.bankTransactions ?? {};
  return {
    stage: cp.stage ?? null,
    bankTransactionsPage: cp.bankTransactionsPage ?? null,
    pulledCount: bt.pulledCount ?? null,
    activity: summary.activity ?? null,
    heartbeatAt: summary.heartbeatAt ?? null,
    completedStages: summary.completedStages ?? [],
  };
}

async function snapshot() {
  const active = await sql`
    SELECT id, status
    FROM integration_sync_jobs
    WHERE company_id = ${YGP}::uuid AND provider = 'xero' AND sync_scope = 'import'
      AND status IN ('running','pending')
  `;
  const [target] = await sql`
    SELECT id, status, error_message, started_at, completed_at, result_summary
    FROM integration_sync_jobs WHERE id = ${TARGET}::uuid
  `;
  const bank = extractBankTx(target);
  return {
    at: new Date().toISOString(),
    activeCount: active.length,
    activeJobs: active.map((j) => ({ id: j.id, status: j.status })),
    job93144ea8: target
      ? {
          id: target.id,
          status: target.status,
          errorMessage: target.error_message,
          startedAt: target.started_at?.toISOString?.() ?? target.started_at,
          completedAt: target.completed_at?.toISOString?.() ?? target.completed_at,
          ...bank,
        }
      : null,
  };
}

function isTerminal(status) {
  return status === 'completed' || status === 'failed';
}

let finalSnap = null;
let quiescent = false;
try {
  while (Date.now() - start < MAX_MS) {
    finalSnap = await snapshot();
    log.push(finalSnap);
    const j = finalSnap.job93144ea8;
    if (j?.stage === 'bank_transactions' || j?.bankTransactionsPage != null) {
      bankTxProgress.push({
        at: finalSnap.at,
        page: j.bankTransactionsPage,
        pulledCount: j.pulledCount,
        activity: j.activity,
      });
    }
    console.error(
      `[220-poll] ${finalSnap.at} active=${finalSnap.activeCount} job=${j?.status} bank_tx_page=${j?.bankTransactionsPage ?? 'n/a'} activity=${j?.activity ?? 'n/a'}`,
    );
    const jobDone = j && isTerminal(j.status);
    if (jobDone && finalSnap.activeCount === 0) {
      quiescent = true;
      break;
    }
    if (Date.now() - start + POLL_MS >= MAX_MS) break;
    await sleep(POLL_MS);
  }
} finally {
  await sql.end({ timeout: 5 });
}

if (!quiescent && finalSnap) {
  const j = finalSnap.job93144ea8;
  quiescent = Boolean(j && isTerminal(j.status) && finalSnap.activeCount === 0);
}

let report187 = null;
let verifyExit = null;
if (quiescent) {
  const verify = spawnSync(process.execPath, ['diagnostic-output/187-xero-import-recovery-verify.mjs'], {
    cwd: repoRoot,
    env: { ...process.env, STAGING_DATABASE_URL: databaseUrl },
    encoding: 'utf8',
  });
  verifyExit = verify.status;
  try {
    report187 = JSON.parse(verify.stdout);
  } catch {
    report187 = { parseError: true, stdout: verify.stdout, stderr: verify.stderr, code: verify.status };
  }
}

const cvCheck = report187?.checks?.find((c) => c.name === 'cv_auto_recalc_fired');
const phase2Go =
  quiescent && report187?.verdict === 'PASS' && cvCheck?.pass === true;

const prior219 = fs.existsSync(path.join(repoRoot, 'diagnostic-output/219-cv-phase2-go-verify.json'));

const out = {
  label: '220-xero-phase2-final-verify',
  generatedAt: new Date().toISOString(),
  followUpFrom: 'c90779e8',
  overlapCheck: {
    agentSessionC2db31b1: prior219 ? '219 artifact present — see prior219Artifact' : '219 poll may still be running (_219-poll-run.mjs, 30m cap)',
    prior219Artifact: prior219 ? 'diagnostic-output/219-cv-phase2-go-verify.json' : null,
  },
  worktree: repoRoot,
  branch: 'cursor/xero-payments-hotfix',
  pollIntervalMs: POLL_MS,
  maxWaitMs: MAX_MS,
  pollDurationMs: Date.now() - start,
  timeline: log,
  bankTransactionsProgress: bankTxProgress,
  importJob93144ea8Outcome: finalSnap?.job93144ea8 ?? null,
  quiescenceAchieved: quiescent,
  verify187: quiescent
    ? {
        artifact: 'diagnostic-output/187-xero-import-recovery-verify.mjs',
        outputArtifact: 'diagnostic-output/187-xero-import-recovery-verify.json',
        exitCode: verifyExit,
        verdict: report187?.verdict ?? null,
      }
    : null,
  cv_auto_recalc_fired: cvCheck ? (cvCheck.pass ? 'PASS' : 'FAIL') : null,
  cvMetricsRefreshJobId: report187?.cvMetrics?.cvMetricsRefreshJobId ?? null,
  cvMetricsRefreshAt: report187?.cvMetrics?.cvMetricsRefreshAt ?? null,
  verdict187: report187?.verdict ?? (quiescent ? null : 'IN_PROGRESS'),
  phase2Go: phase2Go ? 'yes' : 'no',
  notes: quiescent
    ? []
    : [
        'Timed out or job still active; skipped 187 re-run until completed/failed with activeCount=0',
        `Last job status: ${finalSnap?.job93144ea8?.status ?? 'unknown'}`,
        `Active imports at end: ${finalSnap?.activeCount ?? 'unknown'}`,
      ],
};

const outPath = path.join(repoRoot, 'diagnostic-output/220-xero-phase2-final-verify.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(
  JSON.stringify(
    {
      written: outPath,
      quiescenceAchieved: quiescent,
      finalJobStatus: out.importJob93144ea8Outcome?.status ?? null,
      verdict187: out.verdict187,
      phase2Go: out.phase2Go,
      cv_auto_recalc_fired: out.cv_auto_recalc_fired,
      cvMetricsRefreshJobId: out.cvMetricsRefreshJobId,
      bankTxLastPage: bankTxProgress.at(-1)?.page ?? null,
    },
    null,
    2,
  ),
);
process.exit(phase2Go ? 0 : quiescent ? (verifyExit === 3 ? 3 : 1) : 1);
