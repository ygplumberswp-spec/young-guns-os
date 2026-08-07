#!/usr/bin/env node
/**
 * XERO-002 Gate 5B-R — isolated read timeout diagnosis (sanitised timing only).
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
const STAGING_API = 'https://young-guns-os-staging.up.railway.app';
const YGP = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const OUT = path.join(repoRoot, 'diagnostic-output/xero-002-gate5b-read-timeout-diagnosis.json');
const SELECTION = path.join(repoRoot, 'diagnostic-output/xero-002-gate2-selection.json');
const EXPECTED_SHA = 'de60d2f99e439339135f0e3498169acd8dacc367';

async function timed(label, fn, timeoutMs = 90_000) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await fn(controller.signal);
    return {
      label,
      startedAt,
      completed: true,
      timedOut: false,
      elapsedMs: Date.now() - t0,
      ...result,
    };
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError' || /aborted/i.test(error.message));
    return {
      label,
      startedAt,
      completed: false,
      timedOut,
      elapsedMs: Date.now() - t0,
      category: timedOut ? 'timeout' : 'error',
      message: String(error?.message || error).slice(0, 200),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function api(pathname, { method = 'GET', token, body, signal } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${STAGING_API}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 120) };
  }
  return { status: res.status, json, retryAfter: res.headers.get('Retry-After') };
}

async function main() {
  const report = {
    label: 'XERO-002-gate5b-read-timeout-diagnosis',
    startedAt: new Date().toISOString(),
    expectedDeploySha: EXPECTED_SHA,
    deployment: {},
    operations: [],
    tokenCheck: {},
    verdict: 'PENDING',
  };

  const url = fs
    .readFileSync(path.join(repoRoot, 'apps/api/.env.staging.local'), 'utf8')
    .match(/^DATABASE_URL=(.+)$/m)[1]
    .trim()
    .replace(/^["']|["']$/g, '');

  const sql = postgres(url, { max: 1, prepare: false });

  try {
    report.deployment.health = await timed('health', () =>
      api('/api/v1/health/ready').then((r) => ({
        category: r.status === 200 ? 'ok' : 'degraded',
        status: r.status,
      })),
    );

    const [conn] = await sql`
      SELECT status,
             config->>'organisationName' AS org_name,
             config->'grantedScopes' AS scopes,
             config->>'lastTokenRefreshAt' AS last_token_refresh
      FROM integration_connections
      WHERE company_id = ${YGP}::uuid AND provider = 'xero'`;

    report.tokenCheck = {
      connectionStatus: conn?.status ?? null,
      organisationName: conn?.org_name ?? null,
      grantedScopeCount: Array.isArray(conn?.scopes) ? conn.scopes.length : 0,
      lastTokenRefreshAt: conn?.last_token_refresh ?? null,
    };

    const suffix = randomBytes(3).toString('hex');
    const email = `gate5br.${suffix}@staging-gate5b.test`;
    const passwordHash = await hashPassword('Gate5bReadDiag1!');
    const role = await sql`
      INSERT INTO roles (company_id, name, permissions, is_system, created_at, updated_at)
      VALUES (${YGP}, ${'Gate5BR ' + suffix}, ${sql.json(['*', 'integrations:manage'])}, false, now(), now())
      RETURNING id`;
    await sql`
      INSERT INTO users (company_id, role_id, email, password_hash, first_name, last_name, created_at, updated_at)
      VALUES (${YGP}, ${role[0].id}, ${email}, ${passwordHash}, 'G', '5BR', now(), now())`;
    const login = await api('/api/v1/auth/login', {
      method: 'POST',
      body: { email, password: 'Gate5bReadDiag1!' },
    });
    const token = login.json?.data?.session?.accessToken;

    report.operations.push(
      await timed('xero_connection_test', (signal) =>
        api('/api/v1/integrations/xero/test', { method: 'POST', token, signal }).then((r) => ({
          category: r.status === 200 ? 'ok' : r.status === 503 ? 'unavailable' : 'error',
          status: r.status,
          errorCode: r.json?.error?.code ?? null,
          retryAfter: r.retryAfter,
        })),
      ),
    );

    const selection = JSON.parse(fs.readFileSync(SELECTION, 'utf8'));

    report.operations.push(
      await timed('gate2_invoice_read', (signal) =>
        api('/api/v1/integrations/xero/gate2-readonly-proof', {
          method: 'POST',
          token,
          signal,
          body: {
            customerId: selection.selected.customerId,
            invoiceId: selection.selected.invoiceId,
          },
        }).then((r) => ({
          category: r.status === 200 ? 'ok' : r.status === 503 ? 'unavailable' : 'error',
          status: r.status,
          errorCode: r.json?.error?.code ?? null,
          invoiceIdMatch: r.json?.data?.result?.invoice?.invoiceIdMatch ?? null,
          retryAfter: r.retryAfter,
        })),
      ),
    );

    report.operations.push(
      await timed('gate5b_full_observation', (signal) =>
        api('/api/v1/integrations/xero/gate5b-payment-observation', {
          method: 'POST',
          token,
          signal,
          body: {
            invoiceId: selection.selected.invoiceId,
            runTargetedRefresh: true,
          },
        }).then((r) => ({
          category:
            r.status === 200
              ? 'ok'
              : r.status === 503
                ? 'unavailable'
                : r.status === 404
                  ? 'not_deployed'
                  : 'error',
          status: r.status,
          errorCode: r.json?.error?.code ?? null,
          providerOk: r.json?.data?.result?.payment?.providerOk ?? null,
          paymentIdMatch: r.json?.data?.result?.payment?.paymentIdMatch ?? null,
          targetedRefreshAttempted: r.json?.data?.result?.targetedRefresh?.attempted ?? null,
          retryAfter: r.retryAfter,
        })),
      ),
    );

    report.operations.push(
      await timed('gate4_route_probe', (signal) =>
        api('/api/v1/integrations/xero/gate4-controlled-invoice', {
          method: 'POST',
          token,
          signal,
          body: { invoiceId: '00000000-0000-0000-0000-000000000001' },
        }).then((r) => ({
          category: r.status === 404 ? 'not_deployed' : 'deployed',
          status: r.status,
          errorCode: r.json?.error?.code ?? null,
        })),
      ),
    );

    const gate5b = report.operations.find((o) => o.label === 'gate5b_full_observation');
    const gate4 = report.operations.find((o) => o.label === 'gate4_route_probe');

    report.deployment.gate4RouteDeployed = gate4?.status !== 404;
    report.deployment.gate5bRouteDeployed = gate5b?.status !== 404;
    report.deployment.inferredCommitIncludesGate5b =
      report.deployment.gate4RouteDeployed && report.deployment.gate5bRouteDeployed;

    const liveOk = gate5b?.status === 200 && gate5b?.providerOk === true;
    report.verdict = liveOk ? 'PASS' : report.deployment.inferredCommitIncludesGate5b ? 'PARTIAL' : 'BLOCKED';
  } finally {
    report.completedAt = new Date().toISOString();
    await sql.end({ timeout: 5 });
  }

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.verdict === 'PASS' ? 0 : report.verdict === 'PARTIAL' ? 2 : 1);
}

main().catch((error) => {
  console.error(String(error?.message || error).slice(0, 200));
  process.exit(1);
});
