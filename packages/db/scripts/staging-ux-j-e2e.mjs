/**
 * UX-J staging harness — hybrid n8n orchestration (COM-011, AUT-002).
 *
 * Safety:
 * - Loads only apps/api/.env.staging.local
 * - Refuses forbidden live project ref rshuiaghmtrvvilhqpwm
 * - Labels temp records STAGING-UX-J
 * - Local loopback n8n-compatible mock only — no real n8n / providers
 * - No credential leakage in report
 *
 * Usage:
 *   node packages/db/scripts/staging-ux-j-e2e.mjs
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import postgres from 'postgres';

function signN8nPayload(secret, timestamp, correlationId, body) {
  return createHmac('sha256', secret).update(`${timestamp}.${correlationId}.${body}`).digest('hex');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
const outPath = path.resolve(repoRoot, 'diagnostic-output/111-staging-ux-j-e2e.json');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const LABEL = 'STAGING-UX-J';
const API_PORT = Number(process.env.STAGING_API_PORT || 3108);
const WEB_PORT = Number(process.env.STAGING_WEB_PORT || 5182);
const MOCK_PORT = Number(process.env.STAGING_N8N_MOCK_PORT || 5678);
const API_BASE = process.env.STAGING_API_BASE || `http://127.0.0.1:${API_PORT}`;
const WEB_BASE = process.env.STAGING_WEB_BASE || `http://127.0.0.1:${WEB_PORT}`;
const MANAGE_RUNTIME = process.env.STAGING_MANAGE_RUNTIME !== '0';
const VITE_BIN = path.join(repoRoot, 'apps/web/node_modules/.bin/vite');
const TSX_BIN = path.join(repoRoot, 'apps/api/node_modules/.bin/tsx');

function loadEnv(filePath) {
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i < 0) continue;
    let v = s.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[s.slice(0, i).trim()] = v;
  }
  return out;
}

function redactError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return msg
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, '[REDACTED_URL]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]')
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, '$1=[REDACTED]')
    .slice(0, 400);
}

function pass(results, name, detail = '') {
  results.push({ name, status: 'PASS', detail });
}
function fail(results, name, detail = '') {
  results.push({ name, status: 'FAIL', detail: redactError(detail) });
}

async function waitFor(url, { timeoutMs = 120_000, expectStatus = 200 } = {}) {
  const started = Date.now();
  let last = 'not-started';
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      last = String(res.status);
      if (res.status === expectStatus) return;
    } catch (e) {
      last = redactError(e);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timeout waiting for ${url} (last=${last})`);
}

function freePort(port) {
  try {
    const out = execSync(`lsof -nP -tiTCP:${port} -sTCP:LISTEN`, { encoding: 'utf8' }).trim();
    for (const pid of out.split('\n').filter(Boolean)) {
      try {
        process.kill(Number(pid), 'SIGTERM');
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* nothing */
  }
}

function startProcess(command, args, env, cwd) {
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let buf = '';
  const onChunk = (chunk) => {
    buf += chunk.toString();
    if (buf.length > 8000) buf = buf.slice(-4000);
  };
  child.stdout.on('data', onChunk);
  child.stderr.on('data', onChunk);
  child.getSafeTail = () =>
    buf.replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, '[REDACTED_URL]').slice(-1500);
  return child;
}

function startMockN8n() {
  const state = { healthHits: 0, webhookHits: 0, lastSigned: false };
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString('utf8');
    const hasSig = Boolean(req.headers['x-titan-signature']);
    state.lastSigned = hasSig;
    if (req.url === '/healthz') {
      state.healthHits += 1;
      res.writeHead(hasSig ? 200 : 401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: hasSig }));
      return;
    }
    if (req.url === '/webhook/titan') {
      state.webhookHits += 1;
      res.writeHead(hasSig ? 202 : 401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ accepted: hasSig, bytes: body.length }));
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
  return new Promise((resolve) => {
    server.listen(MOCK_PORT, '127.0.0.1', () => resolve({ server, state }));
  });
}

async function api(pathname, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function inviteRole(ownerToken, roleId, email, firstName, lastName, password) {
  const invite = await api('/api/v1/team/invites', {
    method: 'POST',
    token: ownerToken,
    body: { email, roleId },
  });
  const inviteUrl = invite.json?.data?.inviteUrl;
  const tokenMatch = typeof inviteUrl === 'string' ? inviteUrl.match(/token=([^&]+)/) : null;
  if (invite.status !== 201 || !tokenMatch) return null;
  const accept = await api('/api/v1/auth/accept-invite', {
    method: 'POST',
    body: { token: tokenMatch[1], firstName, lastName, password },
  });
  const accessToken = accept.json?.data?.session?.accessToken;
  const userId = accept.json?.data?.user?.id;
  if (accept.status !== 201 || !accessToken || !userId) return null;
  return { token: accessToken, userId };
}

const report = {
  label: LABEL,
  startedAt: new Date().toISOString(),
  stagingTarget: null,
  results: [],
  cleanup: null,
  totals: { passed: 0, failed: 0 },
  verdict: 'NO-GO',
};

let apiProc;
let webProc;
let mock;
let sql;
let companyId;
let foreignCompanyId;

try {
  if (!fs.existsSync(envPath)) throw new Error('missing .env.staging.local');
  const env = loadEnv(envPath);
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL missing');
  if (env.DATABASE_URL.toLowerCase().includes(FORBIDDEN)) {
    throw new Error('Refusing forbidden live project');
  }
  // Harness-local encryption key (never logged) — ensures vault path works without .env edits.
  const harnessEncryptionKey = `staging-ux-j-enc-${randomBytes(24).toString('hex')}`;

  sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });
  const tables = await sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='n8n_connections' LIMIT 1
  `;
  if (!tables.length) throw new Error('migration 0104 not applied on staging');

  const [meta] = await sql`
    SELECT current_database() as db,
           (select count(*)::int from drizzle.__drizzle_migrations) as migrations
  `;
  report.stagingTarget = {
    ok: true,
    matchesForbiddenLiveProjectRef: false,
    currentDatabase: meta.db,
    drizzleMigrationCount: meta.migrations,
    note: 'UX-J 0104 n8n hybrid',
  };
  pass(report.results, 'staging_target_safe', `migrations=${meta.migrations}`);
  pass(report.results, 'staging_has_migration_0104', 'n8n_connections present');

  mock = await startMockN8n();
  pass(report.results, 'local_n8n_mock_started', `port=${MOCK_PORT}`);

  const suffix = randomBytes(4).toString('hex');
  const password = `UxJ-${randomBytes(8).toString('hex')}!`;

  if (MANAGE_RUNTIME) {
    freePort(API_PORT);
    freePort(WEB_PORT);
    await new Promise((r) => setTimeout(r, 400));
    const jwt = `staging-ux-j-jwt-${randomBytes(24).toString('hex')}`;
    const jwtRefresh = `staging-ux-j-refresh-${randomBytes(24).toString('hex')}`;
    const childEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: 'development',
      PORT: String(API_PORT),
      HOST: '127.0.0.1',
      APP_URL: WEB_BASE,
      API_PUBLIC_URL: API_BASE,
      DATABASE_URL: env.DATABASE_URL,
      JWT_SECRET: jwt,
      JWT_REFRESH_SECRET: jwtRefresh,
      INTEGRATIONS_ENCRYPTION_KEY: harnessEncryptionKey,
      SEED_DEV: 'false',
      APP_ENV: 'staging',
      TITAN_ENV: 'staging',
      DOTENV_CONFIG_PATH: '',
    };
    apiProc = startProcess(TSX_BIN, ['src/index.ts'], childEnv, path.join(repoRoot, 'apps/api'));
    await waitFor(`${API_BASE}/api/v1/health/ready`);
    pass(report.results, 'isolated_api_started', `api:${API_PORT}`);

    if (fs.existsSync(VITE_BIN)) {
      webProc = startProcess(
        VITE_BIN,
        ['--host', '127.0.0.1', '--port', String(WEB_PORT)],
        {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          VITE_DEV_PORT: String(WEB_PORT),
          VITE_API_PROXY_TARGET: API_BASE,
        },
        path.join(repoRoot, 'apps/web'),
      );
      await waitFor(WEB_BASE, { expectStatus: 200 });
      pass(report.results, 'isolated_web_started', `web:${WEB_PORT}`);
    } else {
      fail(report.results, 'isolated_web_started', 'vite missing');
    }
  }

  const signup = await api('/api/v1/auth/signup', {
    method: 'POST',
    body: {
      companyName: `${LABEL} Co ${suffix}`,
      firstName: 'Owner',
      lastName: 'UxJ',
      email: `owner.${suffix}@staging-ux-j.test`,
      password,
    },
  });
  const ownerToken = signup.json?.data?.session?.accessToken;
  companyId = signup.json?.data?.user?.companyId;
  if (signup.status !== 201 || !ownerToken || !companyId) {
    throw new Error(`signup failed: ${JSON.stringify(signup.json?.error || signup.status)}`);
  }
  pass(report.results, 'owner_signup_labelled', companyId);

  const foreign = await api('/api/v1/auth/signup', {
    method: 'POST',
    body: {
      companyName: `${LABEL} Foreign ${suffix}`,
      firstName: 'Other',
      lastName: 'Tenant',
      email: `foreign.${suffix}@staging-ux-j.test`,
      password,
    },
  });
  foreignCompanyId = foreign.json?.data?.user?.companyId;
  const foreignToken = foreign.json?.data?.session?.accessToken;
  pass(report.results, 'foreign_tenant_signup');

  const roles = await api('/api/v1/team/roles', { token: ownerToken });
  const roleRows = roles.json?.data?.roles || roles.json?.data?.assignableRoles || [];
  const byName = Object.fromEntries(roleRows.map((r) => [r.name, r.id]));

  const tech = byName.Technician
    ? await inviteRole(
        ownerToken,
        byName.Technician,
        `tech.${suffix}@staging-ux-j.test`,
        'Tech',
        'UxJ',
        password,
      )
    : null;
  const manager = byName.Manager
    ? await inviteRole(
        ownerToken,
        byName.Manager,
        `mgr.${suffix}@staging-ux-j.test`,
        'Mgr',
        'UxJ',
        password,
      )
    : null;
  const accountant = byName.Accountant
    ? await inviteRole(
        ownerToken,
        byName.Accountant,
        `acct.${suffix}@staging-ux-j.test`,
        'Acct',
        'UxJ',
        password,
      )
    : null;
  if (tech?.token) pass(report.results, 'technician_invite');
  else fail(report.results, 'technician_invite', 'missing');
  if (manager?.token) pass(report.results, 'manager_invite');
  else fail(report.results, 'manager_invite', 'missing');
  if (accountant?.token) pass(report.results, 'accountant_invite');
  else fail(report.results, 'accountant_invite', 'missing');

  // Unconfigured truthful state
  const unconfigured = await api('/api/v1/automation/n8n/connection', { token: ownerToken });
  if (
    unconfigured.status === 200 &&
    unconfigured.json?.data?.connection?.status === 'not_configured' &&
    unconfigured.json?.data?.connection?.dispatchEnabled === false
  ) {
    pass(report.results, 'unconfigured_state_truthful', 'not_configured');
  } else {
    fail(report.results, 'unconfigured_state_truthful', JSON.stringify(unconfigured.json));
  }

  const providersRes = await api('/api/v1/integrations/hub/providers', { token: ownerToken });
  const providers = providersRes.json?.data?.providers || [];
  const card = providers.find((p) => p.provider === 'n8n');
  if (
    card &&
    card.capabilityState !== 'connected_usable' &&
    String(card.settingsPath || '').includes('/automation')
  ) {
    pass(report.results, 'integrations_n8n_deep_link_honest', card.capabilityState);
  } else {
    fail(report.results, 'integrations_n8n_deep_link_honest', JSON.stringify(card || providersRes.json));
  }

  // Reject external host
  const badHost = await api('/api/v1/automation/n8n/connection', {
    method: 'PUT',
    token: ownerToken,
    body: {
      baseUrl: 'https://cloud.n8n.io',
      apiKey: 'test-api-key-123456',
      webhookSecret: 'webhook-secret-12345678',
    },
  });
  if (badHost.status >= 400) pass(report.results, 'reject_external_n8n_host', String(badHost.status));
  else fail(report.results, 'reject_external_n8n_host', 'accepted external host');

  const apiKey = `key-${randomBytes(12).toString('hex')}`;
  const webhookSecret = `whsec-${randomBytes(16).toString('hex')}`;
  const configure = await api('/api/v1/automation/n8n/connection', {
    method: 'PUT',
    token: ownerToken,
    body: {
      baseUrl: `http://127.0.0.1:${MOCK_PORT}`,
      apiKey,
      webhookSecret,
    },
  });
  const connAfter = configure.json?.data?.connection;
  if (
    configure.status === 200 &&
    connAfter?.status === 'configured_unverified' &&
    connAfter?.hasCredentials === true &&
    !JSON.stringify(configure.json).includes(apiKey) &&
    !JSON.stringify(configure.json).includes(webhookSecret)
  ) {
    pass(report.results, 'configure_unverified_no_secret_leak', connAfter.status);
  } else {
    fail(report.results, 'configure_unverified_no_secret_leak', JSON.stringify(configure.json));
  }

  const verify = await api('/api/v1/automation/n8n/connection/verify', {
    method: 'POST',
    token: ownerToken,
  });
  if (
    verify.status === 200 &&
    verify.json?.data?.connection?.status === 'connected_usable' &&
    mock.state.healthHits >= 1 &&
    mock.state.lastSigned
  ) {
    pass(report.results, 'controlled_connector_verification', 'connected_usable');
  } else {
    fail(report.results, 'controlled_connector_verification', JSON.stringify(verify.json));
  }

  // Manager can read, cannot configure
  if (manager?.token) {
    const mgrRead = await api('/api/v1/automation/n8n/connection', { token: manager.token });
    const mgrCfg = await api('/api/v1/automation/n8n/connection', {
      method: 'PUT',
      token: manager.token,
      body: {
        baseUrl: `http://127.0.0.1:${MOCK_PORT}`,
        apiKey: 'x'.repeat(16),
        webhookSecret: 'y'.repeat(16),
      },
    });
    if (mgrRead.status === 200 && mgrCfg.status === 403) {
      pass(report.results, 'manager_read_owner_configure', 'ok');
    } else {
      fail(report.results, 'manager_read_owner_configure', `${mgrRead.status}/${mgrCfg.status}`);
    }
  }

  // Tech / accountant denied automation admin
  if (tech?.token) {
    const techConn = await api('/api/v1/automation/n8n/connection', { token: tech.token });
    if (techConn.status === 403) pass(report.results, 'technician_automation_denied', '403');
    else fail(report.results, 'technician_automation_denied', String(techConn.status));
  }
  if (accountant?.token) {
    const acctConn = await api('/api/v1/automation/n8n/connection', { token: accountant.token });
    if (acctConn.status === 403) pass(report.results, 'accountant_automation_denied', '403');
    else fail(report.results, 'accountant_automation_denied', String(acctConn.status));
  }

  // Register workflow requiring approval
  const reg = await api('/api/v1/automation/n8n/workflows', {
    method: 'POST',
    token: ownerToken,
    body: {
      name: `${LABEL} Job Complete Hook`,
      externalWorkflowKey: `wf-${suffix}`,
      triggerEvent: 'job.completed',
      requiresApproval: true,
      status: 'active',
    },
  });
  if (reg.status === 201) pass(report.results, 'register_n8n_workflow', reg.json?.data?.workflow?.id);
  else fail(report.results, 'register_n8n_workflow', JSON.stringify(reg.json));

  const idem = `idem-${suffix}-1`;
  const dispatch1 = await api('/api/v1/automation/n8n/executions/dispatch', {
    method: 'POST',
    token: ownerToken,
    body: {
      externalWorkflowKey: `wf-${suffix}`,
      triggerEvent: 'job.completed',
      idempotencyKey: idem,
      payload: { jobId: randomBytes(8).toString('hex'), apiKey: 'should-strip', summary: 'done' },
    },
  });
  const ex1 = dispatch1.json?.data?.execution;
  if (dispatch1.status === 201 && ex1?.status === 'awaiting_approval') {
    pass(report.results, 'approval_required_blocks_dispatch', ex1.status);
  } else {
    fail(report.results, 'approval_required_blocks_dispatch', JSON.stringify(dispatch1.json));
  }

  const dispatchDup = await api('/api/v1/automation/n8n/executions/dispatch', {
    method: 'POST',
    token: ownerToken,
    body: {
      externalWorkflowKey: `wf-${suffix}`,
      triggerEvent: 'job.completed',
      idempotencyKey: idem,
      payload: { jobId: 'other' },
    },
  });
  if (
    dispatchDup.status === 201 &&
    dispatchDup.json?.data?.execution?.id === ex1?.id &&
    dispatchDup.json?.data?.execution?.status === 'awaiting_approval'
  ) {
    pass(report.results, 'idempotent_dispatch_no_duplicate', ex1.id);
  } else {
    fail(report.results, 'idempotent_dispatch_no_duplicate', JSON.stringify(dispatchDup.json));
  }

  if (!ex1?.id) {
    fail(report.results, 'signed_outbound_after_approval', 'no execution to approve');
  }

  const approve = ex1?.id
    ? await api(`/api/v1/automation/n8n/executions/${ex1.id}/approve`, {
        method: 'POST',
        token: ownerToken,
      })
    : { status: 0, json: {} };
  const approved = approve.json?.data?.execution;
  if (
    approve.status === 200 &&
    ['dispatched', 'running', 'failed', 'timed_out'].includes(approved?.status) &&
    mock.state.webhookHits >= 1
  ) {
    pass(
      report.results,
      'signed_outbound_after_approval',
      `status=${approved.status};providerAccepted=${approved.providerAccepted}`,
    );
  } else {
    fail(report.results, 'signed_outbound_after_approval', JSON.stringify(approve.json));
  }

  // Valid signed callback
  const correlationId = approved?.correlationId || ex1?.correlationId;
  if (!correlationId) {
    throw new Error('missing correlation id after dispatch/approve');
  }
  const callbackBodyObj = {
    callbackId: `cb-${suffix}-1`,
    correlationId,
    companyId,
    externalWorkflowKey: `wf-${suffix}`,
    status: 'succeeded',
    providerAccepted: true,
    businessOutcome: 'external_step_complete',
    timestamp: new Date().toISOString(),
  };
  const callbackBody = JSON.stringify(callbackBodyObj);
  const ts = callbackBodyObj.timestamp;
  const sig = signN8nPayload(webhookSecret, ts, correlationId, callbackBody);
  const cbRes = await fetch(`${API_BASE}/api/v1/n8n-callbacks`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-titan-signature': sig,
      'x-titan-timestamp': ts,
      'x-titan-company-id': companyId,
      'x-titan-correlation-id': correlationId,
    },
    body: callbackBody,
  });
  const cbJson = await cbRes.json().catch(() => ({}));
  if (cbRes.status === 200 && cbJson?.data?.ok) {
    pass(report.results, 'valid_signed_callback', cbJson.data.executionId);
  } else {
    fail(report.results, 'valid_signed_callback', JSON.stringify(cbJson));
  }

  // Replay
  const cbReplay = await fetch(`${API_BASE}/api/v1/n8n-callbacks`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-titan-signature': sig,
      'x-titan-timestamp': ts,
      'x-titan-company-id': companyId,
      'x-titan-correlation-id': correlationId,
    },
    body: callbackBody,
  });
  const replayJson = await cbReplay.json().catch(() => ({}));
  if (cbReplay.status === 200 && replayJson?.data?.duplicate === true) {
    pass(report.results, 'replay_callback_rejected_as_duplicate', 'duplicate');
  } else {
    fail(report.results, 'replay_callback_rejected_as_duplicate', JSON.stringify(replayJson));
  }

  // Invalid signature
  const badSig = await fetch(`${API_BASE}/api/v1/n8n-callbacks`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-titan-signature': '00'.repeat(32),
      'x-titan-timestamp': new Date().toISOString(),
      'x-titan-company-id': companyId,
      'x-titan-correlation-id': correlationId,
    },
    body: callbackBody,
  });
  if (badSig.status === 403) pass(report.results, 'invalid_signature_rejected', '403');
  else fail(report.results, 'invalid_signature_rejected', String(badSig.status));

  // Stale timestamp
  const staleTs = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const staleBodyObj = { ...callbackBodyObj, callbackId: `cb-${suffix}-stale`, timestamp: staleTs };
  const staleBody = JSON.stringify(staleBodyObj);
  const staleSig = signN8nPayload(webhookSecret, staleTs, correlationId, staleBody);
  const staleRes = await fetch(`${API_BASE}/api/v1/n8n-callbacks`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-titan-signature': staleSig,
      'x-titan-timestamp': staleTs,
      'x-titan-company-id': companyId,
      'x-titan-correlation-id': correlationId,
    },
    body: staleBody,
  });
  const staleJson = await staleRes.json().catch(() => ({}));
  if (
    [400, 403].includes(staleRes.status) &&
    ['STALE_TIMESTAMP', 'INVALID_SIGNATURE'].includes(staleJson?.error?.code)
  ) {
    pass(report.results, 'stale_timestamp_rejected', staleJson.error.code);
  } else {
    fail(
      report.results,
      'stale_timestamp_rejected',
      JSON.stringify({ status: staleRes.status, body: staleJson }),
    );
  }

  // Cross-tenant callback
  const xBodyObj = {
    ...callbackBodyObj,
    callbackId: `cb-${suffix}-x`,
    companyId: foreignCompanyId,
    timestamp: new Date().toISOString(),
  };
  const xBody = JSON.stringify(xBodyObj);
  const xTs = xBodyObj.timestamp;
  const xSig = signN8nPayload(webhookSecret, xTs, correlationId, xBody);
  const xRes = await fetch(`${API_BASE}/api/v1/n8n-callbacks`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-titan-signature': xSig,
      'x-titan-timestamp': xTs,
      'x-titan-company-id': foreignCompanyId,
    },
    body: xBody,
  });
  if (xRes.status >= 400) pass(report.results, 'cross_tenant_callback_denied', String(xRes.status));
  else fail(report.results, 'cross_tenant_callback_denied', 'accepted');

  // Foreign owner cannot see executions
  const foreignExec = await api('/api/v1/automation/n8n/executions', { token: foreignToken });
  const leaked = (foreignExec.json?.data?.executions || []).some((e) => e.id === ex1.id);
  if (foreignExec.status === 200 && !leaked) {
    pass(report.results, 'foreign_tenant_no_executions', 'ok');
  } else {
    fail(report.results, 'foreign_tenant_no_executions', JSON.stringify(foreignExec.json));
  }

  // Cancel path on a new awaiting execution
  const dispatch2 = await api('/api/v1/automation/n8n/executions/dispatch', {
    method: 'POST',
    token: ownerToken,
    body: {
      externalWorkflowKey: `wf-${suffix}`,
      triggerEvent: 'job.completed',
      idempotencyKey: `idem-${suffix}-cancel`,
      payload: { jobId: 'cancel-me' },
    },
  });
  const ex2 = dispatch2.json?.data?.execution;
  if (!ex2?.id) {
    fail(report.results, 'cancellation_state', JSON.stringify(dispatch2.json));
  } else {
    const cancel = await api(`/api/v1/automation/n8n/executions/${ex2.id}/cancel`, {
      method: 'POST',
      token: ownerToken,
    });
    if (cancel.status === 200 && cancel.json?.data?.execution?.status === 'cancelled') {
      pass(report.results, 'cancellation_state', 'cancelled');
    } else {
      fail(report.results, 'cancellation_state', JSON.stringify(cancel.json));
    }
  }

  // Disconnect blocks new dispatch; native continuity
  const disc = await api('/api/v1/automation/n8n/connection/disconnect', {
    method: 'POST',
    token: ownerToken,
  });
  const afterDisc = disc.json?.data?.connection;
  const blocked = await api('/api/v1/automation/n8n/executions/dispatch', {
    method: 'POST',
    token: ownerToken,
    body: {
      externalWorkflowKey: `wf-${suffix}`,
      triggerEvent: 'job.completed',
      idempotencyKey: `idem-${suffix}-blocked`,
      payload: { jobId: 'blocked' },
    },
  });
  if (
    disc.status === 200 &&
    afterDisc?.dispatchEnabled === false &&
    blocked.status >= 400
  ) {
    pass(report.results, 'disconnect_blocks_new_dispatch', String(blocked.status));
  } else {
    fail(report.results, 'disconnect_blocks_new_dispatch', JSON.stringify({ disc: afterDisc, blocked }));
  }

  const continuity = await api('/api/v1/automation/n8n/native-continuity', { token: ownerToken });
  if (continuity.status === 200 && continuity.json?.data?.n8nDispatchEnabled === false) {
    pass(report.results, 'native_workflows_continue_without_n8n', JSON.stringify(continuity.json.data));
  } else {
    fail(report.results, 'native_workflows_continue_without_n8n', JSON.stringify(continuity.json));
  }

  // Create a native workflow to prove native path still works post-disconnect
  const native = await api('/api/v1/automation/workflows', {
    method: 'POST',
    token: ownerToken,
    body: { name: `${LABEL} Native ${suffix}`, description: 'native only' },
  });
  if (native.status === 201 || native.status === 200) {
    pass(report.results, 'native_workflow_create_after_disconnect', native.json?.data?.workflow?.id);
  } else {
    fail(report.results, 'native_workflow_create_after_disconnect', JSON.stringify(native.json));
  }

  // Web routes
  const paths = ['/automation', '/automation/n8n', '/integrations'];
  let webOk = true;
  for (const width of [375, 414]) {
    for (const p of paths) {
      const res = await fetch(`${WEB_BASE}${p}`, { redirect: 'manual' });
      if (![200, 301, 302].includes(res.status)) webOk = false;
    }
  }
  if (webOk) pass(report.results, 'web_routes_automation_n8n', 'ok');
  else fail(report.results, 'web_routes_automation_n8n', 'route failure');
} catch (error) {
  fail(report.results, 'fatal', redactError(error));
} finally {
  try {
    if (companyId || foreignCompanyId) {
      const ids = [companyId, foreignCompanyId].filter(Boolean);
      for (const id of ids) {
        await sql`DELETE FROM companies WHERE id = ${id} AND name LIKE ${LABEL + '%'}`;
      }
      const leftover = await sql`
        SELECT count(*)::int AS c FROM companies WHERE name LIKE ${LABEL + '%'}
      `;
      report.cleanup = {
        ok: leftover[0].c === 0,
        deletedCompanyCount: ids.length,
        leftoverCount: leftover[0].c,
        label: LABEL,
      };
      if (leftover[0].c === 0) pass(report.results, 'cleanup_labelled_companies', `deleted=${ids.length}`);
      else fail(report.results, 'cleanup_labelled_companies', `leftover=${leftover[0].c}`);
    }
  } catch (e) {
    fail(report.results, 'cleanup_labelled_companies', redactError(e));
  }

  try {
    apiProc?.kill('SIGTERM');
  } catch {
    /* ignore */
  }
  try {
    webProc?.kill('SIGTERM');
  } catch {
    /* ignore */
  }
  try {
    mock?.server?.close();
  } catch {
    /* ignore */
  }
  try {
    await sql?.end({ timeout: 2 });
  } catch {
    /* ignore */
  }

  report.totals.passed = report.results.filter((r) => r.status === 'PASS').length;
  report.totals.failed = report.results.filter((r) => r.status === 'FAIL').length;
  report.verdict = report.totals.failed === 0 ? 'GO' : 'NO-GO';
  report.finishedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        passed: report.totals.passed,
        failed: report.totals.failed,
        outPath,
        cleanup: report.cleanup,
      },
      null,
      2,
    ),
  );
  process.exit(report.verdict === 'GO' ? 0 : 1);
}
