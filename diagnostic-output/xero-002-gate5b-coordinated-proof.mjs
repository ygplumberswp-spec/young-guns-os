#!/usr/bin/env node
/**
 * XERO-002 Gate 5B-S — coordinated rate-budget proof with pause/cooldown/resume.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const requireAuth = createRequire(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/auth/package.json'),
);
const requireDb = createRequire(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/db/package.json'),
);
const { hashPassword } = requireAuth('@titan/auth');
const postgres = requireDb('postgres');

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAGING_API = 'https://young-guns-os-staging.up.railway.app';
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';
const YGP = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const OUT = path.join(repoRoot, 'diagnostic-output/xero-002-gate5b-coordinated-proof.json');
const PASSWORD = 'Gate5bCoordProof1!';

function loadDbUrl() {
  const raw = fs.readFileSync(path.join(repoRoot, 'apps/api/.env.staging.local'), 'utf8');
  const m = raw.match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error('DATABASE_URL missing');
  const url = m[1].trim().replace(/^["']|["']$/g, '');
  if (url.includes(FORBIDDEN)) throw new Error('production forbidden');
  if (!url.includes(STAGING_REF)) throw new Error('not staging ref');
  return url;
}

async function api(pathname, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${STAGING_API}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 120) };
  }
  return { status: res.status, json };
}

async function snapshotCounts(sql) {
  const rows = await Promise.all([
    sql`SELECT count(*)::int n FROM invoices WHERE company_id = ${YGP}::uuid`,
    sql`SELECT count(*)::int n FROM payments WHERE company_id = ${YGP}::uuid`,
    sql`SELECT count(*)::int n FROM xero_invoice_mappings WHERE company_id = ${YGP}::uuid`,
    sql`SELECT count(*)::int n FROM xero_payment_mappings WHERE company_id = ${YGP}::uuid`,
    sql`SELECT count(*)::int n FROM xero_webhook_events`,
    sql`SELECT count(*)::int n FROM xero_targeted_refresh_jobs WHERE company_id = ${YGP}::uuid`,
    sql`SELECT count(*)::int n FROM integration_sync_jobs WHERE company_id = ${YGP}::uuid AND provider = 'xero'`,
    sql`SELECT count(*)::int n FROM xero_write_approvals WHERE company_id = ${YGP}::uuid`,
    sql`SELECT count(*)::int n FROM yoco_webhook_deliveries WHERE company_id = ${YGP}::uuid`,
  ]);
  return {
    invoices: rows[0][0].n,
    payments: rows[1][0].n,
    invoiceMappings: rows[2][0].n,
    paymentMappings: rows[3][0].n,
    webhookEvents: rows[4][0].n,
    refreshJobs: rows[5][0].n,
    xeroScheduledJobs: rows[6][0].n,
    writeApprovals: rows[7][0].n,
    yocoDeliveries: rows[8][0].n,
  };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const report = {
    label: 'XERO-002-gate5b-coordinated-proof',
    startedAt: new Date().toISOString(),
    startingHead: null,
    precheck: {},
    budgetBefore: null,
    budgetAfter: null,
    pauseEvidence: null,
    cooldownEvidence: null,
    proof: null,
    resumeEvidence: null,
    countsBefore: null,
    countsAfter: null,
    verdict: 'PENDING',
  };

  report.startingHead = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();

  const url = loadDbUrl();
  const sql = postgres(url, { max: 1, prepare: false });

  try {
    report.precheck.pwd = repoRoot;
    report.precheck.stagingDbRef = STAGING_REF;

    const ready = await api('/api/v1/health/ready');
    report.precheck.stagingApiHealth = ready.status;
    report.precheck.schedulersEnabled = ready.json?.data?.schedulersEnabled ?? null;
    report.precheck.providersEnabled = ready.json?.data?.providersEnabled ?? null;

    const xeroJobs = await sql`
      SELECT status, count(*)::int n
      FROM integration_sync_jobs
      WHERE company_id = ${YGP}::uuid AND provider = 'xero'
      GROUP BY status`;
    report.precheck.xeroSyncJobs = xeroJobs;

    const [budget] = await sql`
      SELECT min_limit_remaining, day_limit_remaining, retry_after_until,
             sync_pause_reason, sync_paused_until, last_request_at, updated_at
      FROM xero_rate_budget_state WHERE company_id = ${YGP}::uuid`;
    report.budgetBefore = budget ?? null;

    report.countsBefore = await snapshotCounts(sql);

    const suffix = randomBytes(3).toString('hex');
    const email = `gate5bs.${suffix}@staging-gate5b.test`;
    const passwordHash = await hashPassword(PASSWORD);
    const role = await sql`
      INSERT INTO roles (company_id, name, permissions, is_system, created_at, updated_at)
      VALUES (${YGP}, ${'Gate5BS ' + suffix}, ${sql.json(['*', 'integrations:manage'])}, false, now(), now())
      RETURNING id`;
    await sql`
      INSERT INTO users (company_id, role_id, email, password_hash, first_name, last_name, created_at, updated_at)
      VALUES (${YGP}, ${role[0].id}, ${email}, ${passwordHash}, 'G', '5BS', now(), now())`;

    const login = await api('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
    const token = login.json?.data?.session?.accessToken;
    if (!token) throw new Error('login failed');

    report.pauseEvidence = await api('/api/v1/integrations/xero/rate-budget/pause-sync', {
      method: 'POST',
      token,
      body: { reason: 'gate5b_s_controlled_proof' },
    });

    const baselineRequestAt = (await sql`
      SELECT last_request_at FROM xero_rate_budget_state WHERE company_id = ${YGP}::uuid`)[0]?.last_request_at;

    const cooldownStarted = Date.now();
    let readyForProof = false;
    while (Date.now() - cooldownStarted < 300_000) {
      const [state] = await sql`
        SELECT retry_after_until, last_request_at, sync_pause_reason
        FROM xero_rate_budget_state WHERE company_id = ${YGP}::uuid`;
      const retryClear =
        !state?.retry_after_until || new Date(state.retry_after_until).getTime() <= Date.now();
      const lastReqMs = state?.last_request_at
        ? new Date(state.last_request_at).getTime()
        : 0;
      const quietMs = lastReqMs ? Date.now() - lastReqMs : 0;
      const noNewTraffic =
        !baselineRequestAt ||
        !state?.last_request_at ||
        new Date(state.last_request_at).getTime() === new Date(baselineRequestAt).getTime();

      if (retryClear && quietMs >= 120_000 && noNewTraffic && state?.sync_pause_reason) {
        readyForProof = true;
        break;
      }
      await sleep(5_000);
    }

    report.cooldownEvidence = {
      readyForProof,
      waitedMs: Date.now() - cooldownStarted,
      baselineRequestAt,
    };

    if (!readyForProof) {
      report.verdict = 'FAIL';
      report.blocker = 'Clean cooldown not achieved before proof window';
      fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      await api('/api/v1/integrations/xero/rate-budget/resume-sync', { method: 'POST', token });
      process.exit(1);
    }

    const selection = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'diagnostic-output/xero-002-gate2-selection.json'), 'utf8'),
    );

    const proofStarted = Date.now();
    const proofRes = await api('/api/v1/integrations/xero/gate5b-payment-observation', {
      method: 'POST',
      token,
      body: { invoiceId: selection.selected.invoiceId, runTargetedRefresh: true },
    });
    const result = proofRes.json?.data?.result;
    report.proof = {
      status: proofRes.status,
      elapsedMs: Date.now() - proofStarted,
      providerOk: result?.payment?.providerOk ?? null,
      invoiceProviderOk: result?.invoice?.providerOk ?? null,
      paymentIdMatch: result?.payment?.paymentIdMatch ?? null,
      amountMatch: result?.payment?.amountMatch ?? null,
      targetedRefresh: result?.targetedRefresh ?? null,
      rateLimit: result?.rateLimit ?? null,
      error: proofRes.json?.error ?? null,
    };

    report.resumeEvidence = await api('/api/v1/integrations/xero/rate-budget/resume-sync', {
      method: 'POST',
      token,
    });

    const [budgetAfter] = await sql`
      SELECT min_limit_remaining, day_limit_remaining, retry_after_until,
             sync_pause_reason, last_request_at, last_response_date, updated_at
      FROM xero_rate_budget_state WHERE company_id = ${YGP}::uuid`;
    report.budgetAfter = budgetAfter ?? null;
    report.countsAfter = await snapshotCounts(sql);

    const pass =
      proofRes.status === 200 &&
      result?.payment?.providerOk === true &&
      result?.invoice?.providerOk === true &&
      result?.payment?.paymentIdMatch === true &&
      result?.payment?.amountMatch === true &&
      result?.targetedRefresh?.attempted === true;

    report.verdict = pass ? 'PASS' : 'FAIL';
  } finally {
    report.completedAt = new Date().toISOString();
    report.endingHead = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
    await sql.end({ timeout: 5 });
  }

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.verdict === 'PASS' ? 0 : 1);
}

main().catch((error) => {
  console.error(String(error?.message || error).slice(0, 200));
  process.exit(1);
});
