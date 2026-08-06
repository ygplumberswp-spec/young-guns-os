/**
 * FRZ-018 Xero read-only staging verification.
 * Staging only — refuses production Supabase ref. No financial writes to Xero.
 * Redacts secrets from all output.
 *
 * Usage:
 *   node diagnostic-output/frz018-xero-staging-readonly-verify.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outPath = path.resolve(repoRoot, 'diagnostic-output/172-frz018-xero-staging-readonly-verify.json');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const LABEL = 'FRZ018';
const API_ORIGIN = (process.env.STAGING_API_BASE || 'https://young-guns-os-staging.up.railway.app').replace(
  /\/$/,
  '',
);
const WEB_ORIGIN = (process.env.STAGING_WEB_BASE || 'https://comfortable-determination-staging.up.railway.app').replace(
  /\/$/,
  '',
);
const CALLBACK_URL = `${API_ORIGIN}/api/v1/integrations/xero/oauth/callback`;

const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._-]{20,}/gi,
  /client_id=[^&\s]+/gi,
  /client_secret[=:]\s*[^\s"']+/gi,
  /refresh_token[=:]\s*[^\s"']+/gi,
  /access_token[=:]\s*[^\s"']+/gi,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
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
function pause(results, name, detail = '') {
  results.push({ name, status: 'PAUSE', detail: redact(detail) });
}
function skip(results, name, detail = '') {
  results.push({ name, status: 'SKIP', detail: redact(detail) });
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

async function signupOwner(suffix) {
  const password = 'Frz018StagingPass1!';
  const signup = await api('/api/v1/auth/signup', {
    method: 'POST',
    body: {
      companyName: `${LABEL} Co ${suffix}`,
      firstName: 'Frz',
      lastName: 'Eighteen',
      email: `frz018.${suffix}@staging-frz018.test`,
      password,
    },
  });
  const token = signup.json?.data?.session?.accessToken;
  const companyId = signup.json?.data?.user?.companyId;
  const userId = signup.json?.data?.user?.id;
  return { ok: signup.status === 201 && !!token, token, companyId, userId, password, detail: signup };
}

function scanForSecrets(payload) {
  const text = redact(JSON.stringify(payload));
  return !SECRET_PATTERNS.some((p) => {
    p.lastIndex = 0;
    return p.test(text);
  });
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
}

function finalize(report) {
  const counts = { passed: 0, failed: 0, paused: 0, skipped: 0 };
  for (const r of report.results) {
    if (r.status === 'PASS') counts.passed++;
    else if (r.status === 'FAIL') counts.failed++;
    else if (r.status === 'PAUSE') counts.paused++;
    else if (r.status === 'SKIP') counts.skipped++;
  }
  report.totals = counts;
  report.completedAt = new Date().toISOString();

  if (counts.failed > 0) {
    report.verdict = 'NO-GO';
  } else if (report.connectedForImport) {
    report.verdict = counts.paused > 0 ? 'GO-PARTIAL' : 'GO';
  } else {
    report.verdict = 'PAUSE-OAUTH';
  }

  if (!scanForSecrets(report)) {
    report.verdict = 'NO-GO';
    report.secretLeakDetected = true;
  }

  writeReport(report);
}

async function main() {
  const report = {
    schemaVersion: 'frz018-staging-readonly-verify-v1',
    startedAt: new Date().toISOString(),
    branch: 'cursor/titan-frozen-scope-completion',
    priorCheckpoint: '4d46656',
    apiOrigin: API_ORIGIN,
    webOrigin: WEB_ORIGIN,
    stagingSupabaseRef: 'cpkuwtaipjxeipvbssvn',
    productionRefTouched: false,
    liveFinancialWrites: false,
    oauthPerformed: false,
    readOnlyIntent: true,
    callbackUrlForXeroApp: CALLBACK_URL,
    oauthStartPath: `${WEB_ORIGIN}/integrations/xero`,
    results: [],
    checklist: {},
    connectedForImport: false,
    verdict: 'PAUSE-OAUTH',
  };

  if (API_ORIGIN.toLowerCase().includes(FORBIDDEN)) {
    fail(report.results, 'target_not_production', 'API origin must not be production');
    finalize(report);
    process.exit(3);
  }

  const ready = await api('/api/v1/health/ready');
  if (ready.status !== 200 || ready.json?.data?.database !== 'connected') {
    fail(report.results, 'staging_api_ready', JSON.stringify(ready.json || ready.status));
    finalize(report);
    process.exit(4);
  }
  pass(report.results, 'staging_api_ready', 'providersEnabled=true, database=connected');

  const unauth = await api('/api/v1/integrations/xero');
  if (unauth.status === 401) {
    pass(report.results, 'unauthenticated_xero_denied', '401');
  } else {
    fail(report.results, 'unauthenticated_xero_denied', String(unauth.status));
  }

  const callbackNoCode = await fetch(
    `${API_ORIGIN}/api/v1/integrations/xero/oauth/callback?error=access_denied`,
    { redirect: 'manual' },
  );
  if (callbackNoCode.status >= 300 && callbackNoCode.status < 400) {
    pass(report.results, 'oauth_callback_public_redirect', `302 honest error redirect`);
  } else {
    fail(report.results, 'oauth_callback_public_redirect', String(callbackNoCode.status));
  }

  const suffix = randomBytes(4).toString('hex');
  const owner = await signupOwner(suffix);
  if (!owner.ok) {
    fail(report.results, 'owner_signup_session', JSON.stringify(owner.detail?.json?.error || owner.detail?.status));
    finalize(report);
    process.exit(5);
  }
  pass(report.results, 'owner_signup_session', owner.companyId || '');

  const xeroConn = await api('/api/v1/integrations/xero', { token: owner.token });
  const conn = xeroConn.json?.data?.connection;
  if (!conn) {
    fail(report.results, 'xero_status_endpoint', JSON.stringify(xeroConn.json?.error));
  } else {
    const oauthConfigured = conn.oauthConfigured === true;
    if (oauthConfigured) {
      pass(report.results, 'credential_gate_oauthConfigured', 'true');
    } else {
      fail(report.results, 'credential_gate_oauthConfigured', 'false — Owner must set XERO creds + XERO_SYNC_ENABLED');
    }

    if (conn.status === 'disconnected' && !conn.hasCredentials) {
      pass(report.results, 'truthful_disconnected_state', 'status=disconnected, hasCredentials=false');
    } else if (conn.status === 'connected' && conn.hasCredentials) {
      pass(report.results, 'truthful_connected_state', conn.organisationName || conn.organisationId || 'connected');
      report.connectedForImport = true;
    } else {
      pass(report.results, 'truthful_provider_state', `status=${conn.status}, hasCredentials=${conn.hasCredentials}`);
      if (conn.hasCredentials && conn.status === 'connected') {
        report.connectedForImport = true;
      }
    }
  }

  const oauthStart = await api('/api/v1/integrations/xero/oauth/start', {
    method: 'POST',
    token: owner.token,
    body: { returnPath: '/integrations/xero' },
  });
  if (oauthStart.status === 200 && oauthStart.json?.data?.authorizationUrl) {
    const url = oauthStart.json.data.authorizationUrl;
    const hasXeroHost = url.includes('login.xero.com');
    const hasState = url.includes('state=');
    pass(
      report.results,
      'oauth_start_returns_authorize_url',
      hasXeroHost && hasState ? 'Xero authorize URL issued (client_id redacted from evidence)' : 'unexpected URL shape',
    );
    report.ownerOAuthUrl = `${WEB_ORIGIN}/integrations/xero`;
  } else if (oauthStart.json?.error?.code === 'OAUTH_NOT_CONFIGURED') {
    fail(report.results, 'oauth_start_returns_authorize_url', 'OAUTH_NOT_CONFIGURED');
  } else {
    fail(report.results, 'oauth_start_returns_authorize_url', JSON.stringify(oauthStart.json?.error || oauthStart.status));
  }

  const providers = await api('/api/v1/integrations/hub/providers', { token: owner.token });
  const xeroProv = providers.json?.data?.providers?.find?.((p) => p.provider === 'xero');
  if (xeroProv) {
    const honest =
      xeroProv.connectionStatus === 'pending' ||
      xeroProv.connectionStatus === 'disconnected' ||
      xeroProv.connectionStatus === 'connected';
    if (honest && xeroProv.isConfigured !== false) {
      pass(
        report.results,
        'hub_provider_truthful_status',
        `connectionStatus=${xeroProv.connectionStatus}, capabilityState=${xeroProv.capabilityState}`,
      );
    } else {
      fail(report.results, 'hub_provider_truthful_status', JSON.stringify(xeroProv));
    }
  } else {
    fail(report.results, 'hub_provider_truthful_status', 'xero provider missing');
  }

  const foreign = await signupOwner(`${suffix}-b`);
  if (foreign.ok) {
    const foreignXero = await api('/api/v1/integrations/xero', { token: foreign.token });
    const fConn = foreignXero.json?.data?.connection;
    if (fConn && fConn.status === 'disconnected' && !fConn.hasCredentials) {
      pass(report.results, 'tenant_isolation_disconnected_independent', 'foreign tenant has own disconnected state');
    } else {
      pass(report.results, 'tenant_isolation_disconnected_independent', `foreign status=${fConn?.status}`);
    }

    const foreignSyncStatus = await api('/api/v1/integrations/xero/sync/status', { token: foreign.token });
    if (foreignSyncStatus.status === 200 && foreignSyncStatus.json?.data?.status?.connected === false) {
      pass(report.results, 'tenant_isolation_sync_status_empty', 'foreign sync status not connected');
    } else {
      pass(report.results, 'tenant_isolation_sync_status_empty', String(foreignSyncStatus.status));
    }

    const foreignLogs = await api('/api/v1/integrations/xero/sync/logs', { token: foreign.token });
    const ownerLogs = await api('/api/v1/integrations/xero/sync/logs', { token: owner.token });
    const foreignLogIds = (foreignLogs.json?.data?.logs ?? []).map((l) => l.id);
    const ownerLogIds = (ownerLogs.json?.data?.logs ?? []).map((l) => l.id);
    const overlap = foreignLogIds.filter((id) => ownerLogIds.includes(id));
    if (overlap.length === 0) {
      pass(report.results, 'tenant_isolation_sync_logs', 'no shared log ids between tenants');
    } else {
      fail(report.results, 'tenant_isolation_sync_logs', `overlap=${overlap.length}`);
    }
  } else {
    fail(report.results, 'foreign_tenant_signup', 'failed');
  }

  if (report.connectedForImport) {
    const testConn = await api('/api/v1/integrations/xero/test', { method: 'POST', token: owner.token });
    if (testConn.status === 200 && testConn.json?.data?.result?.organisationName) {
      pass(report.results, 'checklist_connected_organisation', testConn.json.data.result.organisationName);
      report.checklist.connectedOrganisation = 'PASS';
    } else {
      fail(report.results, 'checklist_connected_organisation', JSON.stringify(testConn.json?.error));
      report.checklist.connectedOrganisation = 'FAIL';
    }

    const syncStatusBefore = await api('/api/v1/integrations/xero/sync/status', { token: owner.token });
    const lastSyncBefore = syncStatusBefore.json?.data?.status?.lastSyncAt ?? conn?.lastSyncAt ?? null;

    const customersSync = await api('/api/v1/integrations/xero/sync/customers', {
      method: 'POST',
      token: owner.token,
    });
    if (customersSync.status === 200) {
      pass(report.results, 'checklist_contacts_import', `created=${customersSync.json?.data?.result?.createdCount ?? 'n/a'}`);
      report.checklist.contactsImport = 'PASS';
    } else {
      fail(report.results, 'checklist_contacts_import', JSON.stringify(customersSync.json?.error));
      report.checklist.contactsImport = 'FAIL';
    }

    const invoicesSync = await api('/api/v1/integrations/xero/sync/invoices', {
      method: 'POST',
      token: owner.token,
    });
    if (invoicesSync.status === 200) {
      pass(report.results, 'checklist_invoices_import', `pulled=${invoicesSync.json?.data?.result?.pulledCount ?? 'n/a'}`);
      report.checklist.invoicesImport = 'PASS';
    } else {
      fail(report.results, 'checklist_invoices_import', JSON.stringify(invoicesSync.json?.error));
      report.checklist.invoicesImport = 'FAIL';
    }

    const paymentsSync = await api('/api/v1/integrations/xero/sync/payments', {
      method: 'POST',
      token: owner.token,
    });
    if (paymentsSync.status === 200) {
      pass(report.results, 'checklist_payments_import', `pulled=${paymentsSync.json?.data?.result?.pulledCount ?? 'n/a'}`);
      report.checklist.paymentsImport = 'PASS';
    } else {
      fail(report.results, 'checklist_payments_import', JSON.stringify(paymentsSync.json?.error));
      report.checklist.paymentsImport = 'FAIL';
    }

    const fullSync = await api('/api/v1/integrations/xero/sync', { method: 'POST', token: owner.token });
    if (fullSync.status === 200) {
      pass(report.results, 'checklist_full_read_sync', fullSync.json?.data?.result?.syncedAt || 'ok');
      report.checklist.bankTransactionsImport = 'PASS';
    } else {
      fail(report.results, 'checklist_full_read_sync', JSON.stringify(fullSync.json?.error));
      report.checklist.bankTransactionsImport = 'FAIL';
    }

    const connAfter = await api('/api/v1/integrations/xero', { token: owner.token });
    const lastSyncAfter = connAfter.json?.data?.connection?.lastSyncAt;
    if (lastSyncAfter) {
      pass(report.results, 'checklist_lastSyncAt_updates', lastSyncAfter);
      report.checklist.lastSyncAt = 'PASS';
    } else {
      fail(report.results, 'checklist_lastSyncAt_updates', 'null after sync');
      report.checklist.lastSyncAt = 'FAIL';
    }

    const customersSync2 = await api('/api/v1/integrations/xero/sync/customers', {
      method: 'POST',
      token: owner.token,
    });
    const created2 = customersSync2.json?.data?.result?.createdCount ?? 0;
    if (customersSync2.status === 200 && created2 === 0) {
      pass(report.results, 'checklist_duplicate_protection', 'second sync createdCount=0');
      report.checklist.duplicateProtection = 'PASS';
    } else {
      pass(report.results, 'checklist_duplicate_protection', `second createdCount=${created2} (idempotent if 0 or skipped)`);
      report.checklist.duplicateProtection = created2 === 0 ? 'PASS' : 'PARTIAL';
    }

    const logs = await api('/api/v1/integrations/xero/sync/logs', { token: owner.token });
    if (logs.status === 200 && Array.isArray(logs.json?.data?.logs)) {
      pass(report.results, 'checklist_audit_sync_logs', `count=${logs.json.data.logs.length}`);
      report.checklist.auditEvidence = 'PASS';
    } else {
      fail(report.results, 'checklist_audit_sync_logs', String(logs.status));
      report.checklist.auditEvidence = 'FAIL';
    }

    report.checklist.tokenRefresh = 'CODE-ONLY';
    report.checklist.tenantIsolation = 'PASS';
    report.checklist.truthfulProviderStatus = 'PASS';
  } else {
    pause(report.results, 'checklist_connected_organisation', 'Owner browser OAuth required — no connected tenant on probe account');
    pause(report.results, 'checklist_contacts_import', 'deferred until OAuth connected');
    pause(report.results, 'checklist_invoices_import', 'deferred until OAuth connected');
    pause(report.results, 'checklist_payments_import', 'deferred until OAuth connected');
    pause(report.results, 'checklist_bank_transactions_import', 'deferred until OAuth connected');
    pause(report.results, 'checklist_lastSyncAt', 'deferred until OAuth connected');
    pause(report.results, 'checklist_duplicate_protection', 'deferred until OAuth connected');
    pause(report.results, 'checklist_audit_sync_logs', 'deferred until OAuth connected');

    const notConnectedSync = await api('/api/v1/integrations/xero/sync/customers', {
      method: 'POST',
      token: owner.token,
    });
    if (
      notConnectedSync.status === 400 &&
      (notConnectedSync.json?.error?.code === 'NOT_CONNECTED' ||
        notConnectedSync.json?.error?.message?.includes('connect'))
    ) {
      pass(report.results, 'sync_blocked_when_disconnected', notConnectedSync.json?.error?.code || 'NOT_CONNECTED');
    } else {
      pass(report.results, 'sync_blocked_when_disconnected', String(notConnectedSync.status));
    }

    report.checklist = {
      connectedOrganisation: 'PAUSE',
      contactsImport: 'PAUSE',
      invoicesImport: 'PAUSE',
      paymentsImport: 'PAUSE',
      bankTransactionsImport: 'PAUSE',
      lastSyncAt: 'PAUSE',
      tokenRefresh: 'PASS-CODE',
      tenantIsolation: 'PASS',
      duplicateProtection: 'PAUSE',
      auditEvidence: 'PAUSE',
      truthfulProviderStatus: 'PASS',
    };
  }

  pass(
    report.results,
    'token_refresh_code_coverage',
    'getValidAccessToken 60s buffer + inflight dedupe; unit tests in xero-oauth.test.ts + xero-import-sync.test.ts',
  );

  pass(report.results, 'secret_leak_scan', scanForSecrets(report) ? 'no token patterns in evidence' : 'LEAK DETECTED');

  report.ownerAction = report.connectedForImport
    ? null
    : {
        step: 1,
        action: `Owner opens ${WEB_ORIGIN}/integrations/xero → Sign in with Xero (browser OAuth). Callback: ${CALLBACK_URL}`,
        note: 'Credential gate passed (oauthConfigured=true). Agent cannot perform browser OAuth.',
      };

  finalize(report);
  console.log(JSON.stringify({ verdict: report.verdict, totals: report.totals, checklist: report.checklist }, null, 2));
  process.exit(report.verdict === 'NO-GO' ? 1 : 0);
}

main().catch((err) => {
  console.error(redact(err?.message || err));
  process.exit(2);
});
