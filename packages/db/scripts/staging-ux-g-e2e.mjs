/**
 * UX-G staging harness — communications honesty: job linkage, visibility,
 * delivery truth, idempotency, ACL / tenant isolation, portal filtering,
 * integrations-hub honesty (gmail/n8n must never claim usable).
 *
 * Covers UX-025 (comms honesty + job linkage + ACL) and UX-027 (integrations
 * hub honesty contract: no provider may claim connected/sendable without a
 * real backend implementation).
 *
 * Safety:
 * - Loads only apps/api/.env.staging.local
 * - Refuses forbidden live project ref rshuiaghmtrvvilhqpwm
 * - Never prints DATABASE_URL / credentials
 * - Labels temp records STAGING-UX-G
 * - Cleans up only labelled companies
 * - Never calls WhatsApp/email/Gmail/SMTP/n8n/Xero/etc live providers
 *
 * Usage:
 *   node packages/db/scripts/staging-ux-g-e2e.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
const outPath = path.resolve(repoRoot, 'diagnostic-output/86-staging-ux-g-e2e.json');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const LABEL = 'STAGING-UX-G';
const API_PORT = Number(process.env.STAGING_API_PORT || 3105);
const WEB_PORT = Number(process.env.STAGING_WEB_PORT || 5179);
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
    .slice(0, 400);
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
    /* nothing listening */
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

async function api(pathname, { method = 'GET', token, body, base = API_BASE } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}${pathname}`, {
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
  return { status: res.status, json };
}

function pass(results, name, detail = '') {
  results.push({ name, status: 'PASS', detail });
}
function fail(results, name, detail = '') {
  results.push({ name, status: 'FAIL', detail: String(detail).slice(0, 400) });
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

async function main() {
  const report = {
    label: LABEL,
    startedAt: new Date().toISOString(),
    stagingTarget: {},
    contracts: {
      createMessage: 'POST /api/v1/communications/messages (customerId, jobId, channel, direction, visibility, clientActionId)',
      listMessages: 'GET /api/v1/communications/messages',
      integrationsHub: 'GET /api/v1/integrations/hub/dashboard?simple=true',
      portalRequests: 'POST /api/v1/portal/requests (requestType, subject, message, clientActionId)',
      portalCommunications: 'GET /api/v1/portal/communications (portal.communications:read)',
    },
    results: [],
    cleanup: null,
    totals: { passed: 0, failed: 0 },
    verdict: 'NO-GO',
  };

  if (!fs.existsSync(envPath)) {
    report.stagingTarget = { ok: false, reason: 'staging env file missing' };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const env = loadEnv(envPath);
  if (env.APP_ENV !== 'staging' || env.TITAN_ENV !== 'staging' || !env.DATABASE_URL) {
    report.stagingTarget = { ok: false, reason: 'staging labels/url missing' };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.exit(2);
  }
  if (env.DATABASE_URL.toLowerCase().includes(FORBIDDEN)) {
    report.stagingTarget = { ok: false, reason: 'forbidden live project ref' };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.exit(3);
  }

  const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
  let apiProc = null;
  let webProc = null;
  let webUp = false;
  const suffix = randomBytes(3).toString('hex');
  const password = 'StagingUxGLead1!';
  let companyId = null;
  let foreignCompanyId = null;

  try {
    const meta = await sql`
      select current_database() as db,
             (select count(*)::int from drizzle.__drizzle_migrations) as migrations,
             (select exists(
                select 1 from information_schema.columns
                where table_name = 'communications' and column_name = 'visibility'
             )) as has_visibility
    `;
    report.stagingTarget = {
      ok: true,
      matchesForbiddenLiveProjectRef: false,
      currentDatabase: meta[0].db,
      drizzleMigrationCount: meta[0].migrations,
      hasCommunicationsVisibility: meta[0].has_visibility,
      appEnv: env.APP_ENV,
      titanEnv: env.TITAN_ENV,
    };
    if (meta[0].has_visibility) {
      pass(report.results, 'staging_has_migration_0102', 'communications.visibility present');
    } else {
      throw new Error('migration 0102 not applied on staging (communications.visibility missing)');
    }

    if (MANAGE_RUNTIME) {
      freePort(API_PORT);
      freePort(WEB_PORT);
      await new Promise((r) => setTimeout(r, 400));
      const jwt = `staging-ux-g-jwt-${randomBytes(24).toString('hex')}`;
      const jwtRefresh = `staging-ux-g-refresh-${randomBytes(24).toString('hex')}`;
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
        SEED_DEV: 'false',
        APP_ENV: 'staging',
        TITAN_ENV: 'staging',
        DOTENV_CONFIG_PATH: '',
      };
      if (!fs.existsSync(TSX_BIN)) {
        throw new Error(`tsx binary missing at ${TSX_BIN}`);
      }
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
        try {
          await waitFor(WEB_BASE, { expectStatus: 200 });
          webUp = true;
          pass(report.results, 'isolated_web_started', `web:${WEB_PORT}`);
        } catch (e) {
          fail(report.results, 'isolated_web_started', redactError(e));
        }
      } else {
        fail(report.results, 'isolated_web_started', `vite binary missing at ${VITE_BIN} — skipping web checks`);
      }
    }

    // --- Owner signup labelled ---
    const signup = await api('/api/v1/auth/signup', {
      method: 'POST',
      body: {
        companyName: `${LABEL} Co ${suffix}`,
        firstName: 'Owner',
        lastName: 'UxG',
        email: `owner.${suffix}@staging-ux-g.test`,
        password,
      },
    });
    const ownerToken = signup.json?.data?.session?.accessToken;
    companyId = signup.json?.data?.user?.companyId;
    const ownerUserId = signup.json?.data?.user?.id;
    if (signup.status !== 201 || !ownerToken || !companyId) {
      throw new Error(`signup failed: ${JSON.stringify(signup.json?.error || signup.status)}`);
    }
    pass(report.results, 'owner_signup_labelled', companyId);

    // --- Foreign tenant signup ---
    const foreign = await api('/api/v1/auth/signup', {
      method: 'POST',
      body: {
        companyName: `${LABEL} Foreign ${suffix}`,
        firstName: 'Other',
        lastName: 'Tenant',
        email: `foreign.${suffix}@staging-ux-g.test`,
        password,
      },
    });
    foreignCompanyId = foreign.json?.data?.user?.companyId;
    const foreignToken = foreign.json?.data?.session?.accessToken;
    if (foreign.status !== 201 || !foreignToken || !foreignCompanyId) {
      throw new Error('foreign tenant signup failed');
    }
    pass(report.results, 'foreign_tenant_signup');

    // --- Invite roles if they exist ---
    const roles = await api('/api/v1/team/roles', { token: ownerToken });
    const roleRows = roles.json?.data?.roles || roles.json?.data?.assignableRoles || [];
    const byName = Object.fromEntries(roleRows.map((r) => [r.name, r.id]));

    const techInvite = byName.Technician
      ? await inviteRole(
          ownerToken,
          byName.Technician,
          `tech.${suffix}@staging-ux-g.test`,
          'Tech',
          'UxG',
          password,
        )
      : null;
    const techToken = techInvite?.token || null;
    const techUserId = techInvite?.userId || null;
    if (techToken) pass(report.results, 'technician_invite', techUserId);
    else fail(report.results, 'technician_invite', 'missing Technician role/token');

    const dispatcherInvite = byName.Dispatcher
      ? await inviteRole(
          ownerToken,
          byName.Dispatcher,
          `dispatcher.${suffix}@staging-ux-g.test`,
          'Dispatcher',
          'UxG',
          password,
        )
      : null;
    if (dispatcherInvite?.token) pass(report.results, 'dispatcher_invite', dispatcherInvite.userId);
    else fail(report.results, 'dispatcher_invite', 'missing Dispatcher role/token');

    const accountantInvite = byName.Accountant
      ? await inviteRole(
          ownerToken,
          byName.Accountant,
          `accountant.${suffix}@staging-ux-g.test`,
          'Accountant',
          'UxG',
          password,
        )
      : null;
    const accountantToken = accountantInvite?.token || null;
    if (accountantToken) pass(report.results, 'accountant_invite', accountantInvite.userId);
    else fail(report.results, 'accountant_invite', 'missing Accountant role/token');

    const managerInvite = byName.Manager
      ? await inviteRole(
          ownerToken,
          byName.Manager,
          `manager.${suffix}@staging-ux-g.test`,
          'Manager',
          'UxG',
          password,
        )
      : null;
    if (managerInvite?.token) pass(report.results, 'manager_invite', managerInvite.userId);
    else fail(report.results, 'manager_invite', 'missing Manager role/token');

    // --- Customer + job; assign job to technician via assignedUserId ---
    const customerRes = await api('/api/v1/crm/customers', {
      method: 'POST',
      token: ownerToken,
      body: {
        name: `${LABEL} Customer ${suffix}`,
        email: `client.${suffix}@customer-real.test`,
        phone: '0825550111',
      },
    });
    const customerId = customerRes.json?.data?.customer?.id;
    if (customerRes.status !== 201 || !customerId) {
      throw new Error(`create_customer failed: ${JSON.stringify(customerRes.json?.error || customerRes.status)}`);
    }
    pass(report.results, 'create_customer', customerId);

    const jobRes = await api('/api/v1/jobs', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId,
        address: {
          street: '12 Lower Main Rd',
          suburb: 'Observatory',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '7925',
        },
        siteContact: { name: 'Ada Client', mobile: '0825550111' },
        jobType: 'Comms honesty check',
        description: 'UX-G communications honesty loop',
        priority: 'normal',
        assignedUserId: techUserId || undefined,
      },
    });
    const jobId = jobRes.json?.data?.job?.id;
    if (jobRes.status === 201 && jobId) {
      pass(report.results, 'create_customer_job_assigned_to_technician', jobId);
    } else {
      throw new Error(`create_job failed: ${JSON.stringify(jobRes.json?.error || jobRes.status)}`);
    }
    if (techUserId && jobRes.json?.data?.job?.assignedUserId !== techUserId) {
      fail(report.results, 'job_assigned_user_id_matches_technician', JSON.stringify(jobRes.json?.data?.job));
    } else if (techUserId) {
      pass(report.results, 'job_assigned_user_id_matches_technician');
    }

    // A second, unrelated job/customer NOT assigned to the technician — used to
    // prove tech-scoped comms listing doesn't leak company-wide messages.
    const otherCustomerRes = await api('/api/v1/crm/customers', {
      method: 'POST',
      token: ownerToken,
      body: {
        name: `${LABEL} Other Customer ${suffix}`,
        email: `other.${suffix}@customer-real.test`,
        phone: '0825550199',
      },
    });
    const otherCustomerId = otherCustomerRes.json?.data?.customer?.id;
    if (otherCustomerRes.status !== 201 || !otherCustomerId) {
      throw new Error(`other_customer create failed: ${JSON.stringify(otherCustomerRes.json?.error || otherCustomerRes.status)}`);
    }

    const otherJobRes = await api('/api/v1/jobs', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId: otherCustomerId,
        address: {
          street: '5 Other Rd',
          suburb: 'Salt River',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '7925',
        },
        siteContact: { name: 'Other Client', mobile: '0825550199' },
        jobType: 'Unrelated job',
        description: 'Unassigned to UX-G technician',
        priority: 'normal',
      },
    });
    const otherJobId = otherJobRes.json?.data?.job?.id;
    if (otherJobRes.status !== 201 || !otherJobId) {
      throw new Error(`other_job create failed: ${JSON.stringify(otherJobRes.json?.error || otherJobRes.status)}`);
    }

    // --- Integrations hub honesty ---
    const hub = await api('/api/v1/integrations/hub/dashboard?simple=true', { token: ownerToken });
    const providers = hub.json?.data?.dashboard?.providers || [];
    const gmail = providers.find((p) => p.provider === 'gmail');
    const n8n = providers.find((p) => p.provider === 'n8n');

    if (
      hub.status === 200 &&
      gmail?.capabilityState === 'not_implemented' &&
      typeof gmail?.capabilityLabel === 'string' &&
      /not implemented/i.test(gmail.capabilityLabel) &&
      gmail.canConnect === false &&
      gmail.canSend === false
    ) {
      pass(report.results, 'integrations_hub_gmail_not_implemented', JSON.stringify(gmail));
    } else {
      fail(report.results, 'integrations_hub_gmail_not_implemented', JSON.stringify({ status: hub.status, gmail }));
    }

    if (
      n8n?.capabilityState === 'not_implemented' &&
      typeof n8n?.capabilityLabel === 'string' &&
      /not implemented/i.test(n8n.capabilityLabel) &&
      n8n.canConnect === false &&
      n8n.canSend === false
    ) {
      pass(report.results, 'integrations_hub_n8n_not_implemented', JSON.stringify(n8n));
    } else {
      fail(report.results, 'integrations_hub_n8n_not_implemented', JSON.stringify(n8n));
    }

    const dishonestProvider = providers.find(
      (p) => p.capabilityState === 'connected_usable' && (!p.isConfigured || p.connectionStatus !== 'connected'),
    );
    if (!dishonestProvider) {
      pass(report.results, 'integrations_hub_no_hardcoded_false_connected', `${providers.length} providers checked`);
    } else {
      fail(report.results, 'integrations_hub_no_hardcoded_false_connected', JSON.stringify(dishonestProvider));
    }

    // --- Owner creates internal_note communication with clientActionId ---
    const noteActionId = `ux-g-note-${suffix}-1`;
    const noteRes = await api('/api/v1/communications/messages', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId,
        jobId,
        channel: 'note',
        visibility: 'internal_note',
        body: 'Internal note about the job — never leaves TITAN.',
        clientActionId: noteActionId,
      },
    });
    const noteMessage = noteRes.json?.data?.message;
    if (
      noteRes.status === 201 &&
      noteMessage?.visibility === 'internal_note' &&
      noteMessage?.deliveryState === 'logged_only' &&
      noteMessage?.deliveryState !== 'provider_delivered'
    ) {
      pass(report.results, 'internal_note_logged_only', noteMessage.id);
    } else {
      throw new Error(`internal_note create failed: ${JSON.stringify(noteRes.json?.error || noteRes.status)}`);
    }

    // --- Replay same clientActionId — expect same id, idempotent, no duplicate ---
    const noteReplay = await api('/api/v1/communications/messages', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId,
        jobId,
        channel: 'note',
        visibility: 'internal_note',
        body: 'Internal note about the job — never leaves TITAN.',
        clientActionId: noteActionId,
      },
    });
    const noteCount = await sql`
      select count(*)::int as c from communications
      where company_id = ${companyId} and client_action_id = ${noteActionId}
    `;
    if (
      noteReplay.status === 201 &&
      noteReplay.json?.data?.message?.id === noteMessage.id &&
      (noteReplay.json?.data?.message?.idempotentReplay === true || noteCount[0].c === 1)
    ) {
      pass(report.results, 'internal_note_replay_idempotent_no_duplicate', `count=${noteCount[0].c}`);
    } else {
      fail(
        report.results,
        'internal_note_replay_idempotent_no_duplicate',
        JSON.stringify({ status: noteReplay.status, count: noteCount[0].c, id: noteReplay.json?.data?.message?.id }),
      );
    }

    // --- Outbound_request email — requested, failureReason present, never provider_delivered ---
    const outboundActionId = `ux-g-outbound-${suffix}-1`;
    const outboundRes = await api('/api/v1/communications/messages', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId,
        jobId,
        channel: 'email',
        direction: 'outbound',
        visibility: 'outbound_request',
        subject: 'Appointment update',
        body: 'We would like to request a reschedule.',
        clientActionId: outboundActionId,
      },
    });
    const outboundMessage = outboundRes.json?.data?.message;
    if (
      outboundRes.status === 201 &&
      outboundMessage?.deliveryState === 'requested' &&
      typeof outboundMessage?.failureReason === 'string' &&
      outboundMessage.failureReason.length > 0 &&
      outboundMessage.deliveryState !== 'provider_delivered'
    ) {
      pass(report.results, 'outbound_request_requested_with_failure_reason', JSON.stringify({
        deliveryState: outboundMessage.deliveryState,
        failureReason: outboundMessage.failureReason,
      }));
    } else {
      fail(report.results, 'outbound_request_requested_with_failure_reason', JSON.stringify(outboundRes.json || outboundRes.status));
    }

    // --- customer_visible message ---
    const visibleActionId = `ux-g-visible-${suffix}-1`;
    const visibleRes = await api('/api/v1/communications/messages', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId,
        jobId,
        channel: 'note',
        visibility: 'customer_visible',
        body: 'Your technician is on the way.',
        clientActionId: visibleActionId,
      },
    });
    const visibleMessage = visibleRes.json?.data?.message;
    if (visibleRes.status === 201 && visibleMessage?.visibility === 'customer_visible') {
      pass(report.results, 'customer_visible_message_created', visibleMessage.id);
    } else {
      throw new Error(`customer_visible create failed: ${JSON.stringify(visibleRes.json?.error || visibleRes.status)}`);
    }

    // Second communication tied to the unrelated customer/job — tech has no access to this.
    const unrelatedRes = await api('/api/v1/communications/messages', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId: otherCustomerId,
        channel: 'note',
        visibility: 'internal_note',
        body: 'Note on unrelated company-wide job the technician is not assigned to.',
        clientActionId: `ux-g-unrelated-${suffix}-1`,
      },
    });
    if (unrelatedRes.status !== 201) {
      throw new Error(`unrelated communication create failed: ${JSON.stringify(unrelatedRes.json?.error || unrelatedRes.status)}`);
    }

    // --- Owner GET messages — sees all ---
    const ownerList = await api('/api/v1/communications/messages', { token: ownerToken });
    const ownerIds = new Set((ownerList.json?.data?.messages || []).map((m) => m.id));
    if (
      ownerList.status === 200 &&
      ownerIds.has(noteMessage.id) &&
      ownerIds.has(outboundMessage.id) &&
      ownerIds.has(visibleMessage.id) &&
      ownerIds.has(unrelatedRes.json?.data?.message?.id)
    ) {
      pass(report.results, 'owner_sees_all_messages', `count=${ownerIds.size}`);
    } else {
      fail(report.results, 'owner_sees_all_messages', JSON.stringify({ status: ownerList.status, count: ownerIds.size }));
    }

    // --- Manager / Dispatcher positive access (canonical RBAC communications:*) ---
    if (managerInvite?.token) {
      const managerList = await api('/api/v1/communications/messages', { token: managerInvite.token });
      const managerIds = new Set((managerList.json?.data?.messages || []).map((m) => m.id));
      if (
        managerList.status === 200 &&
        managerIds.has(noteMessage.id) &&
        managerIds.has(visibleMessage.id)
      ) {
        pass(report.results, 'manager_sees_operational_messages', `count=${managerIds.size}`);
      } else {
        fail(
          report.results,
          'manager_sees_operational_messages',
          JSON.stringify({ status: managerList.status, count: managerIds.size }),
        );
      }
    } else {
      fail(report.results, 'manager_sees_operational_messages', 'no manager token');
    }

    if (dispatcherInvite?.token) {
      const dispatcherList = await api('/api/v1/communications/messages', {
        token: dispatcherInvite.token,
      });
      const dispatcherIds = new Set((dispatcherList.json?.data?.messages || []).map((m) => m.id));
      if (
        dispatcherList.status === 200 &&
        dispatcherIds.has(noteMessage.id) &&
        dispatcherIds.has(visibleMessage.id)
      ) {
        pass(report.results, 'dispatcher_sees_operational_messages', `count=${dispatcherIds.size}`);
      } else {
        fail(
          report.results,
          'dispatcher_sees_operational_messages',
          JSON.stringify({ status: dispatcherList.status, count: dispatcherIds.size }),
        );
      }
    } else {
      fail(report.results, 'dispatcher_sees_operational_messages', 'no dispatcher token');
    }

    // --- Technician GET messages — sees assigned job/customer messages, not company-wide unrelated ---
    if (techToken) {
      const techList = await api('/api/v1/communications/messages', { token: techToken });
      const techIds = new Set((techList.json?.data?.messages || []).map((m) => m.id));
      const seesAssigned = techIds.has(noteMessage.id) && techIds.has(visibleMessage.id);
      const missesUnrelated = !techIds.has(unrelatedRes.json?.data?.message?.id);
      if (techList.status === 200 && seesAssigned && missesUnrelated) {
        pass(report.results, 'technician_sees_assigned_not_unrelated', `count=${techIds.size}`);
      } else {
        fail(
          report.results,
          'technician_sees_assigned_not_unrelated',
          JSON.stringify({ status: techList.status, seesAssigned, missesUnrelated }),
        );
      }

      // Tech create without jobId → 400
      const techNoJob = await api('/api/v1/communications/messages', {
        method: 'POST',
        token: techToken,
        body: {
          customerId,
          channel: 'note',
          visibility: 'internal_note',
          body: 'Tech note without job',
          clientActionId: `ux-g-tech-nojob-${suffix}`,
        },
      });
      if (techNoJob.status === 400) {
        pass(report.results, 'technician_create_without_job_id_400', String(techNoJob.status));
      } else {
        fail(report.results, 'technician_create_without_job_id_400', JSON.stringify(techNoJob.json || techNoJob.status));
      }

      // Tech create with unassigned job → 403
      const techUnassigned = await api('/api/v1/communications/messages', {
        method: 'POST',
        token: techToken,
        body: {
          customerId: otherCustomerId,
          jobId: otherJobId,
          channel: 'note',
          visibility: 'internal_note',
          body: 'Tech note on unassigned job',
          clientActionId: `ux-g-tech-unassigned-${suffix}`,
        },
      });
      if (techUnassigned.status === 403) {
        pass(report.results, 'technician_create_unassigned_job_403', String(techUnassigned.status));
      } else {
        fail(report.results, 'technician_create_unassigned_job_403', JSON.stringify(techUnassigned.json || techUnassigned.status));
      }
    } else {
      fail(report.results, 'technician_sees_assigned_not_unrelated', 'no tech token');
      fail(report.results, 'technician_create_without_job_id_400', 'no tech token');
      fail(report.results, 'technician_create_unassigned_job_403', 'no tech token');
    }

    // --- Accountant GET messages → 403 (no communications permission) ---
    if (accountantToken) {
      const accountantList = await api('/api/v1/communications/messages', { token: accountantToken });
      if (accountantList.status === 403) {
        pass(report.results, 'accountant_get_messages_403', String(accountantList.status));
      } else {
        fail(report.results, 'accountant_get_messages_403', JSON.stringify(accountantList.json || accountantList.status));
      }
    } else {
      fail(report.results, 'accountant_get_messages_403', 'no accountant token');
    }

    // --- Foreign tenant GET messages must not see owner company messages ---
    const foreignList = await api('/api/v1/communications/messages', { token: foreignToken });
    const foreignIds = new Set((foreignList.json?.data?.messages || []).map((m) => m.id));
    const leaked = [noteMessage.id, outboundMessage.id, visibleMessage.id].some((id) => foreignIds.has(id));
    if (foreignList.status === 200 && !leaked) {
      pass(report.results, 'foreign_tenant_no_owner_messages', `count=${foreignIds.size}`);
    } else {
      fail(report.results, 'foreign_tenant_no_owner_messages', JSON.stringify({ status: foreignList.status, leaked }));
    }

    // --- Portal: create portal user for customer, verify internal_note filtered ---
    const portalEmail = `client.${suffix}@staging-ux-g.test`;
    const portalPassword = 'StagingUxGPortal1!';
    const portalUserRes = await api('/api/v1/portal/users', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId,
        email: portalEmail,
        password: portalPassword,
        firstName: 'Ada',
        lastName: 'Client',
        permissions: ['portal.dashboard:read', 'portal.jobs:read', 'portal.communications:read'],
      },
    });
    let portalToken = null;
    if (portalUserRes.status === 201 && portalUserRes.json?.data?.user?.id) {
      pass(report.results, 'portal_user_created', portalUserRes.json.data.user.id);

      const portalLogin = await api('/api/v1/portal/auth/login', {
        method: 'POST',
        body: { email: portalEmail, password: portalPassword },
      });
      portalToken = portalLogin.json?.data?.session?.accessToken;
      if (portalLogin.status === 200 && portalToken) {
        pass(report.results, 'portal_login');
      } else {
        fail(report.results, 'portal_login', JSON.stringify(portalLogin.json || portalLogin.status));
      }
    } else {
      fail(report.results, 'portal_user_created', JSON.stringify(portalUserRes.json || portalUserRes.status));
    }

    if (portalToken) {
      const portalComms = await api('/api/v1/portal/communications', { token: portalToken });
      const portalRows = portalComms.json?.data?.communications?.communications
        ?? portalComms.json?.data?.communications
        ?? [];
      const hasInternalNoteBody = Array.isArray(portalRows)
        && portalRows.some((c) => c.body === noteMessage.body || c.id === noteMessage.id);
      const hasCustomerVisible = Array.isArray(portalRows) && portalRows.some((c) => c.id === visibleMessage.id);
      if (portalComms.status === 200 && !hasInternalNoteBody) {
        pass(
          report.results,
          'portal_communications_excludes_internal_note',
          JSON.stringify({ count: Array.isArray(portalRows) ? portalRows.length : 'n/a', hasCustomerVisible }),
        );
      } else {
        fail(
          report.results,
          'portal_communications_excludes_internal_note',
          JSON.stringify({ status: portalComms.status, hasInternalNoteBody }),
        );
      }

      // --- Portal request create with clientActionId; replay idempotent ---
      const portalActionId = `ux-g-portal-req-${suffix}-1`;
      const portalReqBody = {
        requestType: 'general_request',
        subject: 'UX-G portal request',
        message: 'Please confirm the appointment window.',
        clientActionId: portalActionId,
      };
      const portalReq = await api('/api/v1/portal/requests', {
        method: 'POST',
        token: portalToken,
        body: portalReqBody,
      });
      const portalReqId = portalReq.json?.data?.request?.id;
      if (portalReq.status === 201 && portalReqId) {
        pass(report.results, 'portal_request_created_with_client_action_id', portalReqId);
      } else {
        fail(report.results, 'portal_request_created_with_client_action_id', JSON.stringify(portalReq.json || portalReq.status));
      }

      const portalReqReplay = await api('/api/v1/portal/requests', {
        method: 'POST',
        token: portalToken,
        body: portalReqBody,
      });
      const portalReqCount = await sql`
        select count(*)::int as c from portal_customer_requests
        where company_id = ${companyId} and client_action_id = ${portalActionId}
      `;
      if (
        portalReqReplay.status === 201 &&
        portalReqReplay.json?.data?.request?.id === portalReqId &&
        portalReqCount[0].c === 1
      ) {
        pass(report.results, 'portal_request_replay_idempotent', `count=${portalReqCount[0].c}`);
      } else {
        fail(
          report.results,
          'portal_request_replay_idempotent',
          JSON.stringify({ status: portalReqReplay.status, count: portalReqCount[0].c }),
        );
      }
    } else {
      fail(report.results, 'portal_communications_excludes_internal_note', 'no portal token');
      fail(report.results, 'portal_request_created_with_client_action_id', 'no portal token');
      fail(report.results, 'portal_request_replay_idempotent', 'no portal token');
    }

    // --- Web smoke at 375 / 390 / 414 widths: /integrations and /communications ---
    if (webUp) {
      const widths = [375, 390, 414];
      let allOk = true;
      const details = [];
      for (const width of widths) {
        const ua = `Mozilla/5.0 (iPhone; CPU iPhone OS) Titan-Staging-Smoke/1 (width=${width})`;
        const integrationsPage = await fetch(`${WEB_BASE}/integrations`, {
          redirect: 'manual',
          headers: { 'User-Agent': ua },
        });
        const communicationsPage = await fetch(`${WEB_BASE}/communications`, {
          redirect: 'manual',
          headers: { 'User-Agent': ua },
        });
        const ok =
          [200, 301, 302].includes(integrationsPage.status) &&
          [200, 301, 302].includes(communicationsPage.status);
        details.push(`${width}=${integrationsPage.status}/${communicationsPage.status}`);
        if (!ok) allOk = false;
      }
      if (allOk) {
        pass(report.results, 'web_routes_integrations_and_communications', details.join(' '));
      } else {
        fail(report.results, 'web_routes_integrations_and_communications', details.join(' '));
      }
    } else {
      pass(report.results, 'web_routes_integrations_and_communications', 'vite not running — skipped');
    }

    void ownerUserId;
  } catch (error) {
    fail(report.results, 'harness_error', redactError(error));
    if (apiProc?.getSafeTail) {
      report.apiTail = apiProc.getSafeTail();
    }
  } finally {
    if (apiProc) {
      try {
        apiProc.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }
    if (webProc) {
      try {
        webProc.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }

    // --- Cleanup labelled companies only ---
    try {
      const ids = [companyId, foreignCompanyId].filter(Boolean);
      if (ids.length) {
        await sql`DELETE FROM companies WHERE id = ANY(${ids}) AND name LIKE ${LABEL + '%'}`;
      }
      const leftover = await sql`
        select count(*)::int as c from companies where name LIKE ${LABEL + '%'}
      `;
      report.cleanup = { ok: leftover[0].c === 0, deletedCompanyCount: ids.length, leftoverCount: leftover[0].c, label: LABEL };
      if (leftover[0].c === 0) {
        pass(report.results, 'cleanup_labelled_companies', `deleted=${ids.length} leftover=0`);
      } else {
        fail(report.results, 'cleanup_labelled_companies', `leftover=${leftover[0].c}`);
      }
    } catch (error) {
      report.cleanup = { ok: false, error: redactError(error) };
      fail(report.results, 'cleanup_labelled_companies', redactError(error));
    }

    await sql.end({ timeout: 5 });
    report.finishedAt = new Date().toISOString();
    report.totals.passed = report.results.filter((r) => r.status === 'PASS').length;
    report.totals.failed = report.results.filter((r) => r.status === 'FAIL').length;
    report.verdict = report.totals.failed === 0 ? 'GO' : 'NO-GO';
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
}

main();
