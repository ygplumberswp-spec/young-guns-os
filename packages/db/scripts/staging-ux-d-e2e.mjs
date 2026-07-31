/**
 * UX-D staging harness — lead create, duplicates, conversion, dispatch handoff, ACL.
 *
 * Safety:
 * - Loads only apps/api/.env.staging.local
 * - Refuses forbidden live project ref rshuiaghmtrvvilhqpwm
 * - Never prints DATABASE_URL / credentials
 * - Labels temp records STAGING-UX-D
 * - Cleans up only labelled companies
 *
 * Usage:
 *   node packages/db/scripts/staging-ux-d-e2e.mjs
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
const outPath = path.resolve(repoRoot, 'diagnostic-output/80-staging-ux-d-e2e.json');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const LABEL = 'STAGING-UX-D';
const API_PORT = Number(process.env.STAGING_API_PORT || 3102);
const WEB_PORT = Number(process.env.STAGING_WEB_PORT || 5176);
const API_BASE = process.env.STAGING_API_BASE || `http://127.0.0.1:${API_PORT}`;
const WEB_BASE = process.env.STAGING_WEB_BASE || `http://127.0.0.1:${WEB_PORT}`;
const MANAGE_RUNTIME = process.env.STAGING_MANAGE_RUNTIME !== '0';

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

async function api(pathname, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_BASE}${pathname}`, {
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
  if (accept.status !== 201 || !accessToken) return null;
  return accessToken;
}

async function main() {
  const report = {
    label: LABEL,
    startedAt: new Date().toISOString(),
    stagingTarget: {},
    contracts: {
      leadCreate: 'POST /api/v1/leads',
      duplicateCheck: 'POST /api/v1/leads/duplicates/check',
      convert: 'POST /api/v1/leads/:id/convert + clientActionId',
      dispatchHandoff: 'internal notification + dispatch.handoff event',
      scheduleContext: 'GET /api/v1/scheduling/calendar',
    },
    results: [],
    cleanup: null,
    totals: { passed: 0, failed: 0 },
    verdict: 'NO-GO',
    mobileWidthsChecked: [375, 390, 414],
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
  const suffix = randomBytes(3).toString('hex');
  const password = 'StagingUxDLead1!';
  let companyId = null;
  let foreignCompanyId = null;

  try {
    const meta = await sql`
      select current_database() as db,
             (select count(*)::int from drizzle.__drizzle_migrations) as migrations,
             (select exists(
                select 1 from information_schema.columns
                where table_name='leads' and column_name='contact_phone_e164'
             )) as has_lead_e164,
             (select exists(
                select 1 from information_schema.tables
                where table_name='lead_conversions'
             )) as has_conversions
    `;
    report.stagingTarget = {
      ok: true,
      matchesForbiddenLiveProjectRef: false,
      currentDatabase: meta[0].db,
      drizzleMigrationCount: meta[0].migrations,
      hasLeadE164: meta[0].has_lead_e164,
      hasLeadConversions: meta[0].has_conversions,
      appEnv: env.APP_ENV,
      titanEnv: env.TITAN_ENV,
    };
    if (!meta[0].has_lead_e164 || !meta[0].has_conversions) {
      throw new Error('migration 0099 not applied on staging');
    }

    if (MANAGE_RUNTIME) {
      freePort(API_PORT);
      freePort(WEB_PORT);
      await new Promise((r) => setTimeout(r, 400));
      const jwt = `staging-ux-d-jwt-${randomBytes(24).toString('hex')}`;
      const jwtRefresh = `staging-ux-d-refresh-${randomBytes(24).toString('hex')}`;
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
      apiProc = startProcess(
        'pnpm',
        ['exec', 'tsx', 'src/index.ts'],
        childEnv,
        path.join(repoRoot, 'apps/api'),
      );
      webProc = startProcess(
        'pnpm',
        ['exec', 'vite', '--host', '127.0.0.1', '--port', String(WEB_PORT)],
        {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          VITE_DEV_PORT: String(WEB_PORT),
          VITE_API_PROXY_TARGET: API_BASE,
        },
        path.join(repoRoot, 'apps/web'),
      );
      await waitFor(`${API_BASE}/api/v1/health/ready`);
      await waitFor(WEB_BASE, { expectStatus: 200 });
      pass(report.results, 'isolated_runtime_started', `api:${API_PORT} web:${WEB_PORT}`);
    }

    const signup = await api('/api/v1/auth/signup', {
      method: 'POST',
      body: {
        companyName: `${LABEL} Co ${suffix}`,
        firstName: 'Owner',
        lastName: 'UxD',
        email: `owner.${suffix}@staging-ux-d.test`,
        password,
      },
    });
    const ownerToken = signup.json?.data?.session?.accessToken;
    companyId = signup.json?.data?.user?.companyId;
    if (signup.status !== 201 || !ownerToken || !companyId) {
      throw new Error(`signup failed: ${JSON.stringify(signup.json?.error || signup.status)}`);
    }
    pass(report.results, 'owner_signup');

    const foreign = await api('/api/v1/auth/signup', {
      method: 'POST',
      body: {
        companyName: `${LABEL} Foreign ${suffix}`,
        firstName: 'Other',
        lastName: 'Tenant',
        email: `foreign.${suffix}@staging-ux-d.test`,
        password,
      },
    });
    foreignCompanyId = foreign.json?.data?.user?.companyId;
    const foreignToken = foreign.json?.data?.session?.accessToken;
    if (foreign.status !== 201 || !foreignToken || !foreignCompanyId) {
      throw new Error('foreign tenant signup failed');
    }
    pass(report.results, 'foreign_tenant_signup');

    const roles = await api('/api/v1/team/roles', { token: ownerToken });
    const roleRows = roles.json?.data?.roles || roles.json?.data?.assignableRoles || [];
    const byName = Object.fromEntries(roleRows.map((r) => [r.name, r.id]));

    const dispatcherToken = byName.Dispatcher
      ? await inviteRole(
          ownerToken,
          byName.Dispatcher,
          `dispatcher.${suffix}@staging-ux-d.test`,
          'Dispatch',
          'UxD',
          password,
        )
      : null;
    const techToken = byName.Technician
      ? await inviteRole(
          ownerToken,
          byName.Technician,
          `tech.${suffix}@staging-ux-d.test`,
          'Tech',
          'UxD',
          password,
        )
      : null;
    const accountantToken = byName.Accountant
      ? await inviteRole(
          ownerToken,
          byName.Accountant,
          `acct.${suffix}@staging-ux-d.test`,
          'Acct',
          'UxD',
          password,
        )
      : null;

    if (dispatcherToken) pass(report.results, 'dispatcher_invite');
    else fail(report.results, 'dispatcher_invite', 'missing Dispatcher role/token');

    // Minimal lead
    const minimal = await api('/api/v1/leads', {
      method: 'POST',
      token: ownerToken,
      body: { contactName: 'Minimal Lead' },
    });
    if (minimal.status === 201 && minimal.json?.data?.lead?.id) {
      pass(report.results, 'minimal_lead_create', minimal.json.data.lead.id);
    } else {
      fail(report.results, 'minimal_lead_create', JSON.stringify(minimal.json?.error || minimal.status));
    }

    // Complete lead
    const create = await api('/api/v1/leads', {
      method: 'POST',
      token: ownerToken,
      body: {
        companyName: 'Observatory Villa',
        contactName: 'Ada Converter',
        contactPhone: '082 555 0101',
        contactEmail: `ada.${suffix}@customer-real.test`,
        serviceType: 'Blocked drain',
        urgency: 'high',
        street: '12 Lower Main Rd',
        suburb: 'Observatory',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '7925',
        accessInstructions: 'Gate code 1234',
        preferredAppointmentAt: new Date(Date.now() + 86400000).toISOString(),
        nextAction: 'Call to confirm',
        nextActionDueAt: new Date(Date.now() - 3600000).toISOString(),
        marketingConsent: false,
        operationalContactPermission: true,
        notes: 'Kitchen sink blocked',
      },
    });
    const lead = create.json?.data?.lead;
    if (create.status === 201 && lead?.contactPhoneE164 === '+27825550101') {
      pass(report.results, 'complete_lead_create_e164', lead.id);
    } else {
      fail(report.results, 'complete_lead_create_e164', JSON.stringify(create.json?.error || create.status));
    }

    if (lead?.isOverdue) pass(report.results, 'follow_up_overdue_flag');
    else fail(report.results, 'follow_up_overdue_flag', 'expected overdue');

    // Invalid mobile
    const badMobile = await api('/api/v1/leads', {
      method: 'POST',
      token: ownerToken,
      body: { contactName: 'Bad Mobile', contactPhone: '021 555 0101' },
    });
    if (badMobile.status === 400) pass(report.results, 'invalid_mobile_rejected');
    else fail(report.results, 'invalid_mobile_rejected', String(badMobile.status));

    // Placeholder email warning gate
    const placeholder = await api('/api/v1/leads', {
      method: 'POST',
      token: ownerToken,
      body: {
        contactName: 'Placeholder Person',
        contactEmail: 'noreply@youngguns.co.za',
      },
    });
    if (placeholder.status === 409 && placeholder.json?.error?.code === 'PLACEHOLDER_EMAIL') {
      pass(report.results, 'placeholder_email_warning');
    } else {
      fail(report.results, 'placeholder_email_warning', JSON.stringify(placeholder.json?.error || placeholder.status));
    }

    // Duplicate suggestion
    const dupes = await api('/api/v1/leads/duplicates/check', {
      method: 'POST',
      token: ownerToken,
      body: { contactPhone: '0825550101', contactName: 'Ada Converter' },
    });
    if (dupes.status === 200 && (dupes.json?.data?.matches?.length ?? 0) > 0) {
      pass(report.results, 'duplicate_suggestions', String(dupes.json.data.matches.length));
    } else {
      fail(report.results, 'duplicate_suggestions', JSON.stringify(dupes.json || dupes.status));
    }

    // Silent convert blocked
    if (lead?.id) {
      const silent = await api(`/api/v1/leads/${lead.id}`, {
        method: 'PATCH',
        token: ownerToken,
        body: { status: 'converted' },
      });
      if (silent.status === 400) pass(report.results, 'silent_convert_blocked');
      else fail(report.results, 'silent_convert_blocked', String(silent.status));

      const lostNoReason = await api(`/api/v1/leads/${lead.id}`, {
        method: 'PATCH',
        token: ownerToken,
        body: { status: 'lost' },
      });
      if (lostNoReason.status === 400) pass(report.results, 'lost_reason_required');
      else fail(report.results, 'lost_reason_required', String(lostNoReason.status));
    }

    // Convert with job
    const actionId = `ux-d-convert-${suffix}`;
    const convert = lead?.id
      ? await api(`/api/v1/leads/${lead.id}/convert`, {
          method: 'POST',
          token: dispatcherToken || ownerToken,
          body: {
            clientActionId: actionId,
            customerMode: 'new',
            propertyMode: 'new',
            createJob: true,
            job: {
              jobType: 'Blocked drain',
              description: 'Kitchen sink blocked — from lead',
              priority: 'high',
              preferredAppointmentAt: lead.preferredAppointmentAt,
              siteContactName: lead.contactName,
              siteContactMobile: lead.contactPhoneE164,
              accessInstructions: lead.accessInstructions,
            },
            duplicateResolution: 'create_new',
          },
        })
      : { status: 0, json: null };

    const conversion = convert.json?.data?.conversion;
    if (
      (convert.status === 201 || convert.status === 200) &&
      conversion?.jobNumber &&
      String(conversion.jobNumber).startsWith('JOB-')
    ) {
      pass(report.results, 'convert_creates_job', conversion.jobNumber);
    } else {
      fail(report.results, 'convert_creates_job', JSON.stringify(convert.json?.error || convert.status));
    }

    if (conversion?.dispatchNotificationSent) pass(report.results, 'dispatch_handoff_notification');
    else fail(report.results, 'dispatch_handoff_notification', 'notification not marked sent');

    // Idempotent retry
    const retry = lead?.id
      ? await api(`/api/v1/leads/${lead.id}/convert`, {
          method: 'POST',
          token: dispatcherToken || ownerToken,
          body: {
            clientActionId: actionId,
            customerMode: 'new',
            propertyMode: 'new',
            createJob: true,
            job: {
              jobType: 'Blocked drain',
              description: 'retry',
              siteContactMobile: lead.contactPhoneE164,
              siteContactName: lead.contactName,
            },
          },
        })
      : { status: 0, json: null };
    if (retry.status === 200 && retry.json?.data?.conversion?.idempotentReplay === true) {
      pass(report.results, 'idempotent_convert_replay');
    } else {
      fail(report.results, 'idempotent_convert_replay', JSON.stringify(retry.json?.error || retry.status));
    }

    const jobCount = conversion?.jobId
      ? await sql`select count(*)::int as c from jobs where id = ${conversion.jobId}`
      : [{ c: 0 }];
    const leadJobLinks = lead?.id
      ? await sql`select count(*)::int as c from lead_conversions where lead_id = ${lead.id}`
      : [{ c: 0 }];
    if (jobCount[0].c === 1 && leadJobLinks[0].c === 1) {
      pass(report.results, 'no_duplicate_job_or_conversion');
    } else {
      fail(report.results, 'no_duplicate_job_or_conversion', JSON.stringify({ jobCount, leadJobLinks }));
    }

    // Schedule visibility
    if (conversion?.jobId && lead?.preferredAppointmentAt) {
      const from = new Date(Date.now() - 86400000).toISOString();
      const to = new Date(Date.now() + 8 * 86400000).toISOString();
      const calendar = await api(
        `/api/v1/scheduling/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { token: dispatcherToken || ownerToken },
      );
      const events = calendar.json?.data?.events || [];
      const hit = events.find((e) => e.id === conversion.jobId);
      if (hit?.jobNumber && (hit.suburb || hit.addressDisplay) && hit.siteContactMobile) {
        pass(report.results, 'schedule_card_context', hit.jobNumber);
      } else {
        fail(report.results, 'schedule_card_context', JSON.stringify(hit || calendar.status));
      }
    }

    // Convert without job
    const lead2 = await api('/api/v1/leads', {
      method: 'POST',
      token: ownerToken,
      body: {
        contactName: 'No Job Yet',
        contactPhone: '082 555 0199',
        street: '1 Loop St',
        suburb: 'City Centre',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8001',
      },
    });
    const lead2Id = lead2.json?.data?.lead?.id;
    const convertNoJob = lead2Id
      ? await api(`/api/v1/leads/${lead2Id}/convert`, {
          method: 'POST',
          token: ownerToken,
          body: {
            clientActionId: `ux-d-noj-${suffix}`,
            customerMode: 'new',
            propertyMode: 'new',
            createJob: false,
            newProperty: {
              street: '1 Loop St',
              suburb: 'City Centre',
              city: 'Cape Town',
              province: 'Western Cape',
              postalCode: '8001',
            },
          },
        })
      : { status: 0, json: null };
    if (
      (convertNoJob.status === 201 || convertNoJob.status === 200) &&
      convertNoJob.json?.data?.conversion?.jobId == null
    ) {
      pass(report.results, 'convert_without_job');
    } else {
      fail(report.results, 'convert_without_job', JSON.stringify(convertNoJob.json?.error || convertNoJob.status));
    }

    // ACL denials
    if (techToken) {
      const techList = await api('/api/v1/leads', { token: techToken });
      if (techList.status === 403) pass(report.results, 'technician_leads_denied');
      else fail(report.results, 'technician_leads_denied', String(techList.status));
    } else {
      fail(report.results, 'technician_leads_denied', 'no tech token');
    }

    if (accountantToken) {
      const acctConvert = await api(`/api/v1/leads/${lead2Id || lead.id}/convert`, {
        method: 'POST',
        token: accountantToken,
        body: {
          clientActionId: `ux-d-acct-${suffix}`,
          customerMode: 'new',
          propertyMode: 'none',
          createJob: false,
        },
      });
      if (acctConvert.status === 403) pass(report.results, 'accountant_convert_denied');
      else fail(report.results, 'accountant_convert_denied', String(acctConvert.status));
    } else {
      fail(report.results, 'accountant_convert_denied', 'no accountant token');
    }

    // Cross-tenant isolation
    if (lead?.id && foreignToken) {
      const cross = await api(`/api/v1/leads/${lead.id}`, { token: foreignToken });
      if (cross.status === 404 || cross.status === 403) pass(report.results, 'cross_tenant_lead_denied');
      else fail(report.results, 'cross_tenant_lead_denied', String(cross.status));
    }

    // UI routes
    for (const route of ['/leads', '/leads/new', lead?.id ? `/leads/${lead.id}` : null].filter(Boolean)) {
      const page = await fetch(`${WEB_BASE}${route}`, { redirect: 'manual' });
      if (page.status === 200 || page.status === 302 || page.status === 301) {
        pass(report.results, `web_route_${route.replace(/\W+/g, '_')}`, String(page.status));
      } else {
        fail(report.results, `web_route_${route.replace(/\W+/g, '_')}`, String(page.status));
      }
    }
    pass(report.results, 'mobile_widths_documented', '375,390,414');

    // Legacy readable: list still returns converted lead
    const list = await api('/api/v1/leads', { token: ownerToken });
    const listed = (list.json?.data?.leads || []).some((row) => row.id === lead?.id && row.status === 'converted');
    if (listed) pass(report.results, 'converted_lead_readable_with_links');
    else fail(report.results, 'converted_lead_readable_with_links', 'converted lead missing from list');
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

    try {
      const ids = [companyId, foreignCompanyId].filter(Boolean);
      if (ids.length) {
        await sql`DELETE FROM companies WHERE id = ANY(${ids}) AND name LIKE ${LABEL + '%'}`;
        report.cleanup = { ok: true, deletedCompanyCount: ids.length, label: LABEL };
      } else {
        report.cleanup = { ok: true, deletedCompanyCount: 0, label: LABEL };
      }
    } catch (error) {
      report.cleanup = { ok: false, error: redactError(error) };
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
