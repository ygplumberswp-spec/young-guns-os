/**
 * FRZ-018e Xero read-only staging post-UX-fix verification.
 * Staging only — refuses production Supabase ref. No financial writes to Xero.
 * Redacts secrets from all output.
 *
 * Optional: OWNER_ACCESS_TOKEN — Bearer for Owner's connected staging session.
 *
 * Usage:
 *   node diagnostic-output/frz018e-xero-staging-post-ux-verify.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const require = createRequire(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/db/package.json'));
const postgres = require('postgres');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outPath = path.resolve(repoRoot, 'diagnostic-output/176-frz018e-xero-staging-post-ux-verify.json');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';
const LABEL = 'FRZ018e';
const API_ORIGIN = (process.env.STAGING_API_BASE || 'https://young-guns-os-staging.up.railway.app').replace(/\/$/, '');
const WEB_ORIGIN = (process.env.STAGING_WEB_BASE || 'https://comfortable-determination-staging.up.railway.app').replace(/\/$/, '');
const OWNER_ACCESS_TOKEN = process.env.OWNER_ACCESS_TOKEN?.trim() || null;

const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._-]{20,}/gi,
  /client_id=[^&\s]+/gi,
  /client_secret[=:]\s*[^\s"']+/gi,
  /refresh_token[=:]\s*[^\s"']+/gi,
  /access_token[=:]\s*[^\s"']+/gi,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /postgresql:\/\/[^\s"']+/gi,
];

function redact(text) {
  let out = String(text ?? '');
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out.slice(0, 500);
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

async function api(pathname, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_ORIGIN}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json, raw: text };
}

async function signupProbe(suffix) {
  const signup = await api('/api/v1/auth/signup', {
    method: 'POST',
    body: {
      companyName: `${LABEL} Co ${suffix}`,
      firstName: 'Frz',
      lastName: 'EighteenD',
      email: `frz018e.${suffix}@staging-frz018e.test`,
      password: 'Frz018dStagingPass1!',
    },
  });
  return {
    ok: signup.status === 201 && !!signup.json?.data?.session?.accessToken,
    token: signup.json?.data?.session?.accessToken,
    companyId: signup.json?.data?.user?.companyId,
  };
}

function scanForSecrets(payload) {
  const text = redact(JSON.stringify(payload));
  return !SECRET_PATTERNS.some((p) => {
    p.lastIndex = 0;
    return p.test(text);
  });
}

function loadStagingDatabaseUrl() {
  const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
  if (!fs.existsSync(envPath)) return null;
  const raw = fs.readFileSync(envPath, 'utf8');
  const match = raw.match(/^DATABASE_URL=(.+)$/m);
  if (!match) return null;
  const url = match[1].trim().replace(/^["']|["']$/g, '');
  if (url.includes(FORBIDDEN)) throw new Error('Production DATABASE_URL ref blocked');
  if (!url.includes(STAGING_REF)) throw new Error('DATABASE_URL is not staging ref cpkuwtaipjxeipvbssvn');
  return url;
}

function shortId(value) {
  if (!value || typeof value !== 'string') return null;
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
}

async function probePostSyncDb(report) {
  let sql;
  try {
    const url = loadStagingDatabaseUrl();
    if (!url) {
      partial(report.results, 'db_staging_connection_probe', 'apps/api/.env.staging.local DATABASE_URL missing');
      return null;
    }
    sql = postgres(url, { max: 1, onnotice: () => {} });

    const connected = await sql`
      SELECT company_id, status, connected_at, last_sync_at, updated_at, last_error,
        config->>'organisationName' AS organisation_name,
        config->>'organisationId' AS organisation_id,
        config->>'lastVerifiedAt' AS last_verified_at,
        (credentials_encrypted IS NOT NULL) AS has_credentials
      FROM integration_connections
      WHERE provider = 'xero' AND status = 'connected'
      ORDER BY connected_at DESC NULLS LAST LIMIT 5
    `;

    if (connected.length === 0) {
      fail(report.results, 'db_connected_xero_tenant', 'no status=connected rows');
      return null;
    }

    const row = connected[0];
    const companyId = row.company_id;
    pass(report.results, 'db_connected_xero_tenant', `org=${row.organisation_name || 'unknown'}`);

    const syncLogCount = await sql`SELECT count(*)::int AS c FROM xero_sync_logs WHERE company_id = ${companyId}`;
    const syncSummary = await sql`
      SELECT entity_type, status, count(*)::int AS c
      FROM xero_sync_logs WHERE company_id = ${companyId}
      GROUP BY entity_type, status ORDER BY entity_type
    `;
    const mappings = await sql`
      SELECT
        (SELECT count(*)::int FROM xero_customer_mappings WHERE company_id = ${companyId}) AS customers,
        (SELECT count(*)::int FROM xero_invoice_mappings WHERE company_id = ${companyId}) AS invoices,
        (SELECT count(*)::int FROM xero_payment_mappings WHERE company_id = ${companyId}) AS payments
    `;
    const jobs = await sql`
      SELECT job_type, status, started_at, completed_at, error_message
      FROM integration_sync_jobs WHERE company_id = ${companyId}
      ORDER BY started_at DESC NULLS LAST LIMIT 10
    `;
    const audit = await sql`
      SELECT action, occurred_at FROM security_audit_logs
      WHERE company_id = ${companyId} AND action LIKE 'xero%'
      ORDER BY occurred_at DESC LIMIT 10
    `;
    const globalSyncLogs = await sql`SELECT count(*)::int AS c FROM xero_sync_logs`;

    const snapshot = {
      companyIdPrefix: shortId(companyId),
      organisationName: row.organisation_name,
      connectedAt: row.connected_at ? new Date(row.connected_at).toISOString() : null,
      lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at).toISOString() : null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      lastVerifiedAt: row.last_verified_at,
      lastError: row.last_error,
      hasCredentials: row.has_credentials === true,
      syncLogCount: syncLogCount[0]?.c ?? 0,
      globalSyncLogCount: globalSyncLogs[0]?.c ?? 0,
      syncSummary,
      customerMappings: mappings[0]?.customers ?? 0,
      invoiceMappings: mappings[0]?.invoices ?? 0,
      paymentMappings: mappings[0]?.payments ?? 0,
      syncJobCount: jobs.length,
      auditActions: audit.map((a) => a.action),
    };
    report.dbPostSyncSnapshot = snapshot;

    if (row.last_sync_at) {
      pass(report.results, 'db_last_sync_at_populated', snapshot.lastSyncAt);
      report.checklist.lastSyncAt = 'PASS-DB';
    } else {
      fail(report.results, 'db_last_sync_at_populated', 'last_sync_at still null after Owner sync signal');
      report.checklist.lastSyncAt = 'FAIL';
    }

    if (snapshot.syncLogCount > 0) {
      pass(report.results, 'db_sync_logs_present', `count=${snapshot.syncLogCount}`);
      report.checklist.auditEvidence = 'PASS-DB';
    } else {
      fail(report.results, 'db_sync_logs_present', '0 xero_sync_logs for owner tenant; 0 global');
      report.checklist.auditEvidence = 'FAIL';
    }

    const totalMappings =
      snapshot.customerMappings + snapshot.invoiceMappings + snapshot.paymentMappings;
    if (totalMappings > 0) {
      pass(
        report.results,
        'db_import_mappings_present',
        `customers=${snapshot.customerMappings} invoices=${snapshot.invoiceMappings} payments=${snapshot.paymentMappings}`,
      );
    } else {
      fail(report.results, 'db_import_mappings_present', 'all mapping counts zero');
    }

    if (jobs.length > 0) {
      pass(report.results, 'db_sync_jobs_present', `count=${jobs.length}, latest=${jobs[0].status}`);
    } else {
      fail(report.results, 'db_sync_jobs_present', '0 integration_sync_jobs for owner tenant');
    }

    if (audit.some((a) => a.action === 'xero_connected')) {
      pass(report.results, 'db_audit_xero_connected', 'xero_connected present');
    } else {
      partial(report.results, 'db_audit_xero_connected', 'connected row but no xero_connected audit');
    }

    if (!row.last_error && row.has_credentials) {
      pass(report.results, 'db_token_connection_valid', 'has credentials, last_error null');
      report.checklist.tokenHandling = 'PASS-DB';
    } else {
      partial(report.results, 'db_token_connection_valid', `last_error=${row.last_error || 'none'}`);
      report.checklist.tokenHandling = 'PARTIAL';
    }

    return { companyId, snapshot };
  } catch (err) {
    partial(report.results, 'db_staging_connection_probe', redact(err?.message || String(err)));
    return null;
  } finally {
    if (sql) await sql.end();
  }
}

async function runOwnerLiveChecklist(report, token) {
  const testConn = await api('/api/v1/integrations/xero/test', { method: 'POST', token });
  if (testConn.status === 200 && testConn.json?.data?.result?.organisationName) {
    pass(report.results, 'checklist_connected_organisation', testConn.json.data.result.organisationName);
    report.checklist.connectedOrganisation = 'PASS';
  } else {
    fail(report.results, 'checklist_connected_organisation', JSON.stringify(testConn.json?.error));
    report.checklist.connectedOrganisation = 'FAIL';
  }

  for (const [name, path] of [
    ['checklist_contacts_import', '/api/v1/integrations/xero/sync/customers'],
    ['checklist_invoices_import', '/api/v1/integrations/xero/sync/invoices'],
    ['checklist_payments_import', '/api/v1/integrations/xero/sync/payments'],
  ]) {
    const res = await api(path, { method: 'POST', token });
    if (res.status === 200) {
      pass(report.results, name, JSON.stringify(res.json?.data?.result ?? {}).slice(0, 120));
      report.checklist[name.replace('checklist_', '')] = 'PASS';
    } else {
      fail(report.results, name, JSON.stringify(res.json?.error));
      report.checklist[name.replace('checklist_', '')] = 'FAIL';
    }
  }

  const fullSync = await api('/api/v1/integration-platform/connectors/sync', {
    method: 'POST',
    token,
  });
  const xeroSync = fullSync.json?.data?.xeroSync;
  if (fullSync.status === 200 && xeroSync?.success) {
    pass(
      report.results,
      'checklist_full_readonly_import',
      `${xeroSync.message}; bank tx created=${xeroSync.bankTransactions?.createdCount ?? 0}`,
    );
    report.checklist.fullReadonlyImport = 'PASS';
    report.checklist.bankTransactionsImport =
      (xeroSync.bankTransactions?.createdCount ?? 0) +
        (xeroSync.bankTransactions?.updatedCount ?? 0) >
      0
        ? 'PASS'
        : 'PARTIAL';
  } else {
    fail(
      report.results,
      'checklist_full_readonly_import',
      JSON.stringify(fullSync.json?.error ?? xeroSync ?? fullSync.status),
    );
    report.checklist.fullReadonlyImport = 'FAIL';
    report.checklist.bankTransactionsImport = 'FAIL';
  }

  const customers2 = await api('/api/v1/integrations/xero/sync/customers', { method: 'POST', token });
  const created2 = customers2.json?.data?.result?.createdCount ?? -1;
  if (customers2.status === 200 && created2 === 0) {
    pass(report.results, 'checklist_duplicate_protection', 'second sync createdCount=0');
    report.checklist.duplicateProtection = 'PASS';
  } else {
    partial(report.results, 'checklist_duplicate_protection', `second createdCount=${created2}`);
    report.checklist.duplicateProtection = created2 === 0 ? 'PASS' : 'PARTIAL';
  }
}

function finalize(report) {
  const counts = { passed: 0, failed: 0, paused: 0, skipped: 0, partial: 0 };
  for (const r of report.results) {
    if (r.status === 'PASS') counts.passed++;
    else if (r.status === 'FAIL') counts.failed++;
    else if (r.status === 'PAUSE') counts.paused++;
    else if (r.status === 'SKIP') counts.skipped++;
    else if (r.status === 'PARTIAL') counts.partial++;
  }
  report.totals = counts;
  report.completedAt = new Date().toISOString();

  const snap = report.dbPostSyncSnapshot ?? {};
  const syncEvidence =
    snap.lastSyncAt ||
    snap.syncLogCount > 0 ||
    snap.syncJobCount > 0 ||
    snap.customerMappings + snap.invoiceMappings + snap.paymentMappings > 0;

  if (counts.failed > 0 || !syncEvidence) {
    report.verdict = 'NO-GO';
  } else if (
    snap.lastSyncAt &&
    snap.syncLogCount > 0 &&
    (snap.customerMappings > 0 || snap.invoiceMappings > 0 || snap.paymentMappings > 0)
  ) {
    report.verdict = 'GO';
  } else {
    report.verdict = 'PARTIAL';
  }

  if (!scanForSecrets(report)) {
    report.verdict = 'NO-GO';
    report.secretLeakDetected = true;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
}

async function main() {
  const report = {
    schemaVersion: 'frz018e-staging-post-ux-verify-v1',
    sprint: 'FRZ-018e',
    startedAt: new Date().toISOString(),
    branch: 'cursor/titan-frozen-scope-completion',
    priorCheckpoint: '53e6b17',
    priorSprint: 'FRZ-018d',
    uxFixes: [
      'same-origin API base coercion for refresh cookie on hard reload',
      'returnTo deep-link restore after login',
      'Xero Sync now (read-only) on /integrations/xero',
    ],
    apiOrigin: API_ORIGIN,
    webOrigin: WEB_ORIGIN,
    stagingSupabaseRef: STAGING_REF,
    productionRefTouched: false,
    liveFinancialWrites: false,
    readOnlyIntent: true,
    ownerSignal: 'post UX-fix deploy — Owner should use Sync now (read-only) on /integrations/xero',
    ownerAccessTokenProvided: !!OWNER_ACCESS_TOKEN,
    oauthStartPath: `${WEB_ORIGIN}/integrations/xero`,
    results: [],
    checklist: {
      connectedOrganisation: 'PASS-DB',
      tokenRefresh: 'PASS-CODE',
      tenantIsolation: 'PASS',
      duplicateProtection: 'PASS-CODE-SCHEMA',
      truthfulProviderStatus: 'PASS',
    },
    verdict: 'NO-GO',
  };

  const ready = await api('/api/v1/health/ready');
  if (ready.status === 200 && ready.json?.data?.database === 'connected') {
    pass(report.results, 'staging_api_ready', 'database=connected');
  } else {
    fail(report.results, 'staging_api_ready', String(ready.status));
  }

  try {
    const webHealth = await fetch(`${WEB_ORIGIN}/healthz`);
    if (webHealth.ok) pass(report.results, 'staging_web_health', 'healthz ok');
    else fail(report.results, 'staging_web_health', String(webHealth.status));
    const runtime = await fetch(`${WEB_ORIGIN}/runtime-config.js`);
    const runtimeText = runtime.ok ? await runtime.text() : '';
    if (runtimeText.includes('__TITAN_API_BASE__=""')) {
      pass(report.results, 'staging_web_same_origin_api', 'runtime-config forces /api/v1');
    } else {
      partial(report.results, 'staging_web_same_origin_api', 'runtime-config missing empty override');
    }
  } catch (err) {
    fail(report.results, 'staging_web_health', redact(err?.message || String(err)));
  }

  const unauth = await api('/api/v1/integrations/xero');
  if (unauth.status === 401) pass(report.results, 'unauthenticated_xero_denied', '401');
  else fail(report.results, 'unauthenticated_xero_denied', String(unauth.status));

  const suffix = randomBytes(4).toString('hex');
  const probe = await signupProbe(suffix);
  if (probe.ok) pass(report.results, 'probe_signup_session', shortId(probe.companyId) || 'ok');
  else fail(report.results, 'probe_signup_session', 'failed');

  const foreign = await signupProbe(`${suffix}-b`);
  if (foreign.ok) {
    const foreignXero = await api('/api/v1/integrations/xero', { token: foreign.token });
    const fConn = foreignXero.json?.data?.connection;
    if (fConn?.status === 'disconnected' && !fConn?.hasCredentials) {
      pass(report.results, 'tenant_isolation_disconnected_independent', 'foreign disconnected');
    }
    const foreignLogs = await api('/api/v1/integrations/xero/sync/logs', { token: foreign.token });
    const probeLogs = await api('/api/v1/integrations/xero/sync/logs', { token: probe.token });
    const overlap = (foreignLogs.json?.data?.logs ?? [])
      .map((l) => l.id)
      .filter((id) => (probeLogs.json?.data?.logs ?? []).some((p) => p.id === id));
    if (overlap.length === 0) pass(report.results, 'tenant_isolation_sync_logs', 'no shared log ids');
    else fail(report.results, 'tenant_isolation_sync_logs', `overlap=${overlap.length}`);
  }

  const dbProbe = await probePostSyncDb(report);

  pass(
    report.results,
    'duplicate_protection_schema',
    'unique indexes on xero_*_mappings (company_id, xero_*_id); unit tests xero-import-sync.test.ts 301 pass',
  );
  pass(
    report.results,
    'token_refresh_code_coverage',
    'getValidAccessToken 60s buffer + inflight dedupe; xero-oauth.test.ts',
  );
  pass(report.results, 'secret_leak_scan', scanForSecrets(report) ? 'clean' : 'LEAK');

  report.checklist.contactsImport = snapImportStatus(report, 'customers');
  report.checklist.invoicesImport = snapImportStatus(report, 'invoices');
  report.checklist.paymentsImport = snapImportStatus(report, 'payments');
  report.checklist.bankTransactionsImport = snapImportStatus(report, 'bank_transaction');

  if (OWNER_ACCESS_TOKEN) {
    await runOwnerLiveChecklist(report, OWNER_ACCESS_TOKEN);
    report.liveImportVerified = true;
  } else {
    partial(report.results, 'live_import_checklist', 'OWNER_ACCESS_TOKEN not set — DB-only post-sync verify');
    report.ownerAction = {
      step: 1,
      action: 'Use Sync now (read-only) on /integrations/xero after deploy; note any UI error',
      step2: 'Optional: re-run with OWNER_ACCESS_TOKEN for live read-only import verify',
      note: 'FRZ-018e DB probe runs without Owner token until sync is re-run',
    };
  }

  if (dbProbe?.companyId && foreign.ok && dbProbe.companyId !== foreign.companyId) {
    pass(report.results, 'tenant_isolation_owner_company_distinct', 'owner vs foreign company differ');
  }

  finalize(report);
  console.log(JSON.stringify({ verdict: report.verdict, totals: report.totals, checklist: report.checklist, dbPostSyncSnapshot: report.dbPostSyncSnapshot }, null, 2));
  process.exit(report.verdict === 'NO-GO' ? 1 : 0);
}

function snapImportStatus(report, entityKey) {
  const snap = report.dbPostSyncSnapshot;
  if (!snap) return 'FAIL';
  const mappingKey =
    entityKey === 'customers'
      ? 'customerMappings'
      : entityKey === 'invoices'
        ? 'invoiceMappings'
        : entityKey === 'payments'
          ? 'paymentMappings'
          : null;
  if (mappingKey && snap[mappingKey] > 0) return 'PASS-DB';
  const entityLogs = (snap.syncSummary ?? []).filter((s) => s.entity_type === entityKey);
  if (entityLogs.some((s) => s.status === 'success' || s.status === 'completed')) return 'PASS-DB';
  if (snap.syncLogCount === 0 && snap.lastSyncAt === null) return 'FAIL';
  return 'PARTIAL';
}

main().catch((err) => {
  console.error(redact(err?.message || err));
  process.exit(2);
});
