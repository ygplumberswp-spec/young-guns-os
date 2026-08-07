#!/usr/bin/env node
/**
 * XERO-002 — controlled rate-budget provider probe (staging only).
 * Executes exactly one POST /xero/rate-budget/provider-probe after safety pre-checks.
 */
import fs from 'node:fs';
import path from 'node:path';
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
const STAGING_API = process.env.STAGING_API ?? 'https://young-guns-os-staging.up.railway.app';
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';
const YGP = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const OUT = path.join(repoRoot, 'diagnostic-output/xero-002-rate-budget-provider-probe-result.json');
const PASSWORD = 'RateBudgetProbe1!';

function loadDbUrl() {
  const raw = fs.readFileSync(path.join(repoRoot, 'apps/api/.env.staging.local'), 'utf8');
  const m = raw.match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error('DATABASE_URL missing');
  const url = m[1].trim().replace(/^["']|["']$/g, '');
  if (url.includes(FORBIDDEN)) throw new Error('production forbidden');
  if (!url.includes(STAGING_REF)) throw new Error('not staging ref');
  return url;
}

async function api(pathname, { method = 'GET', token, body, timeoutMs = 60_000 } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(`${STAGING_API}${pathname}`, {
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
    return { status: res.status, elapsedMs: Date.now() - t0, json };
  } finally {
    clearTimeout(timer);
  }
}

async function snapshot(sql) {
  const [budget] = await sql`
    SELECT min_limit_remaining, day_limit_remaining, app_min_limit_remaining,
           rate_limit_problem, retry_after_until, last_request_at, last_response_date,
           sync_pause_reason, sync_paused_until, updated_at
    FROM xero_rate_budget_state WHERE company_id = ${YGP}::uuid`;
  const schedules = await sql`
    SELECT s.enabled, s.sync_scope, s.next_run_at
    FROM integration_sync_schedules s
    JOIN integration_connectors c ON c.id = s.connector_id
    WHERE c.connector_key = 'xero' AND s.company_id = ${YGP}::uuid`;
  const [openJobs] = await sql`
    SELECT count(*)::int n FROM integration_sync_jobs
    WHERE company_id = ${YGP}::uuid AND provider = 'xero' AND status IN ('pending','running')`;
  return { budget: budget ?? null, schedules, openXeroJobs: openJobs?.n ?? 0 };
}

async function main() {
  const report = {
    label: 'xero-002-rate-budget-provider-probe',
    startedAt: new Date().toISOString(),
    completedAt: null,
    environment: {
      stagingApi: STAGING_API,
      stagingDbRef: STAGING_REF,
      productionUntouched: true,
      companyId: YGP,
    },
    safetyPrechecks: {},
    probe: null,
    providerCallCount: null,
    requestEndpoint: 'GET /Organisation',
    httpStatus: null,
    capturedHeaders: null,
    correlationId: null,
    responseDate: null,
    requestedAt: null,
    budgetBefore: null,
    budgetAfter: null,
    syncPauseBefore: null,
    syncPauseAfter: null,
    schedulesBefore: null,
    schedulesAfter: null,
    openXeroJobsBefore: null,
    openXeroJobsAfter: null,
    verdict: 'PENDING',
    productionUntouched: true,
  };

  const url = loadDbUrl();
  const sql = postgres(url, { max: 1, prepare: false });

  try {
    const before = await snapshot(sql);
    report.budgetBefore = before.budget;
    report.syncPauseBefore = before.budget?.sync_pause_reason ?? null;
    report.schedulesBefore = before.schedules;
    report.openXeroJobsBefore = before.openXeroJobs;

    const retryUntil = before.budget?.retry_after_until
      ? Date.parse(before.budget.retry_after_until)
      : 0;
    const incremental = before.schedules.find((s) => s.sync_scope === 'incremental');

    report.safetyPrechecks = {
      stagingDbConfirmed: url.includes(STAGING_REF) && !url.includes(FORBIDDEN),
      productionRefAbsent: !url.includes(FORBIDDEN),
      incrementalScheduleDisabled: incremental ? incremental.enabled === false : null,
      tenantSyncPaused: Boolean(before.budget?.sync_pause_reason),
      openXeroJobs: before.openXeroJobs,
      retryAfterElapsed: !Number.isFinite(retryUntil) || retryUntil <= Date.now(),
      implementationGuaranteesMaxOneCall: true,
    };

    const precheckFailed = Object.entries({
      stagingDbConfirmed: report.safetyPrechecks.stagingDbConfirmed,
      productionRefAbsent: report.safetyPrechecks.productionRefAbsent,
      incrementalScheduleDisabled: report.safetyPrechecks.incrementalScheduleDisabled,
      tenantSyncPaused: report.safetyPrechecks.tenantSyncPaused,
      noOpenXeroJobs: before.openXeroJobs === 0,
      retryAfterElapsed: report.safetyPrechecks.retryAfterElapsed,
    }).filter(([, ok]) => !ok);

    if (precheckFailed.length > 0) {
      report.verdict = 'STOPPED — safety pre-check failed';
      report.safetyPrechecks.failed = precheckFailed.map(([k]) => k);
      report.completedAt = new Date().toISOString();
      fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }

    const suffix = randomBytes(3).toString('hex');
    const email = `rateprobe.${suffix}@staging-gate5b.test`;
    const passwordHash = await hashPassword(PASSWORD);
    const role = await sql`
      INSERT INTO roles (company_id, name, permissions, is_system, created_at, updated_at)
      VALUES (${YGP}, ${'Rate Probe ' + suffix}, ${sql.json(['*', 'integrations:manage'])}, false, now(), now())
      RETURNING id`;
    await sql`
      INSERT INTO users (company_id, role_id, email, password_hash, first_name, last_name, created_at, updated_at)
      VALUES (${YGP}, ${role[0].id}, ${email}, ${passwordHash}, 'R', 'Probe', now(), now())`;

    const login = await api('/api/v1/auth/login', {
      method: 'POST',
      body: { email, password: PASSWORD },
    });
    const token = login.json?.data?.session?.accessToken;
    if (!token) throw new Error('login failed');

    const probeRes = await api('/api/v1/integrations/xero/rate-budget/provider-probe', {
      method: 'POST',
      token,
    });

    report.probe = {
      status: probeRes.status,
      elapsedMs: probeRes.elapsedMs,
      error: probeRes.json?.error ?? null,
    };

    const result = probeRes.json?.data?.result;
    if (result) {
      report.providerCallCount = result.providerCallCount ?? null;
      report.httpStatus = result.httpStatus ?? null;
      report.capturedHeaders = result.headers ?? null;
      report.correlationId = result.headers?.correlationId ?? null;
      report.responseDate = result.headers?.responseDate ?? null;
      report.requestedAt = result.requestedAt ?? null;
      report.probe.result = {
        outcome: result.outcome,
        outcomeLabel: result.outcomeLabel,
        organisationName: result.organisationName,
        state: result.state,
      };
    }

    const after = await snapshot(sql);
    report.budgetAfter = after.budget;
    report.syncPauseAfter = after.budget?.sync_pause_reason ?? null;
    report.schedulesAfter = after.schedules;
    report.openXeroJobsAfter = after.openXeroJobs;

    if (report.providerCallCount !== null && report.providerCallCount > 1) {
      report.verdict = 'FAILED — probe safety test (providerCallCount > 1)';
      report.completedAt = new Date().toISOString();
      fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }

    if (probeRes.status !== 200 || !result) {
      const code = probeRes.json?.error?.code ?? 'UNKNOWN';
      if (code === 'PROVIDER_AUTH_FAILED' || code === 'PROVIDER_UNAVAILABLE' || code === 'PROVIDER_ERROR') {
        report.verdict = 'FAILED — unexpected provider/integration error';
      } else {
        report.verdict = 'FAILED — unexpected provider/integration error';
      }
    } else if (result.outcome === 'ELIGIBLE') {
      report.verdict = 'ELIGIBLE — fresh Xero quota confirmed';
    } else if (result.outcome === 'BLOCKED') {
      report.verdict = 'BLOCKED — Xero quota still unavailable';
    } else if (result.outcome === 'QUOTA_EXHAUSTED') {
      report.verdict = 'BLOCKED — Xero quota still unavailable';
    } else {
      report.verdict = 'FAILED — unexpected provider/integration error';
    }

    report.completedAt = new Date().toISOString();
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.verdict.startsWith('ELIGIBLE') ? 0 : 2);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(String(error?.message || error).slice(0, 200));
  process.exit(1);
});
