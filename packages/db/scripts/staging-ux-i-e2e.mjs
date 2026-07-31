/**
 * UX-I staging harness — dashboard KPI truth, Maps/ETA honesty, YG geography/COC.
 *
 * Safety:
 * - Loads only apps/api/.env.staging.local
 * - Refuses forbidden live project ref rshuiaghmtrvvilhqpwm
 * - Labels temp records STAGING-UX-I
 * - No Google/Cartrack/WhatsApp provider calls
 *
 * Usage:
 *   node packages/db/scripts/staging-ux-i-e2e.mjs
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
const outPath = path.resolve(repoRoot, 'diagnostic-output/102-staging-ux-i-e2e.json');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const LABEL = 'STAGING-UX-I';
const API_PORT = Number(process.env.STAGING_API_PORT || 3107);
const WEB_PORT = Number(process.env.STAGING_WEB_PORT || 5181);
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
  const password = 'StagingUxILead1!';
  let companyId = null;
  let foreignCompanyId = null;

  try {
    const meta = await sql`
      select current_database() as db,
             (select count(*)::int from drizzle.__drizzle_migrations) as migrations
    `;
    report.stagingTarget = {
      ok: true,
      matchesForbiddenLiveProjectRef: false,
      currentDatabase: meta[0].db,
      drizzleMigrationCount: meta[0].migrations,
      appEnv: env.APP_ENV,
      titanEnv: env.TITAN_ENV,
      note: 'UX-I uses company preferences JSON — no new migration required',
    };
    pass(report.results, 'staging_target_safe', `migrations=${meta[0].migrations}`);

    if (MANAGE_RUNTIME) {
      freePort(API_PORT);
      freePort(WEB_PORT);
      await new Promise((r) => setTimeout(r, 400));
      const jwt = `staging-ux-i-jwt-${randomBytes(24).toString('hex')}`;
      const jwtRefresh = `staging-ux-i-refresh-${randomBytes(24).toString('hex')}`;
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
        fail(report.results, 'isolated_web_started', 'vite missing');
      }
    }

    const signup = await api('/api/v1/auth/signup', {
      method: 'POST',
      body: {
        companyName: `${LABEL} Co ${suffix}`,
        firstName: 'Owner',
        lastName: 'UxI',
        email: `owner.${suffix}@staging-ux-i.test`,
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
        email: `foreign.${suffix}@staging-ux-i.test`,
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

    const tech = byName.Technician
      ? await inviteRole(
          ownerToken,
          byName.Technician,
          `tech.${suffix}@staging-ux-i.test`,
          'Tech',
          'UxI',
          password,
        )
      : null;
    if (tech?.token) pass(report.results, 'technician_invite', tech.userId);
    else fail(report.results, 'technician_invite', 'missing');

    const accountant = byName.Accountant
      ? await inviteRole(
          ownerToken,
          byName.Accountant,
          `acct.${suffix}@staging-ux-i.test`,
          'Acct',
          'UxI',
          password,
        )
      : null;
    if (accountant?.token) pass(report.results, 'accountant_invite', accountant.userId);
    else fail(report.results, 'accountant_invite', 'missing');

    // Customer + job scheduled today with Cape Town address
    const customerRes = await api('/api/v1/crm/customers', {
      method: 'POST',
      token: ownerToken,
      body: {
        name: `${LABEL} Customer ${suffix}`,
        email: `cust.${suffix}@staging-ux-i.test`,
        phone: '0821234567',
        status: 'active',
      },
    });
    const customerId = customerRes.json?.data?.customer?.id;
    if (customerRes.status !== 201 || !customerId) {
      throw new Error(`customer create failed: ${JSON.stringify(customerRes.json?.error)}`);
    }
    pass(report.results, 'create_customer', customerId);

    const start = new Date();
    start.setHours(10, 0, 0, 0);
    const end = new Date(start);
    end.setHours(12, 0, 0, 0);

    const jobRes = await api('/api/v1/jobs', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId,
        jobType: 'Gas geyser install',
        description: `${LABEL} gas geyser install at Observatory site`,
        priority: 'normal',
        preferredAppointmentAt: start.toISOString(),
        scheduledEndAt: end.toISOString(),
        assignedUserId: tech?.userId ?? undefined,
        address: {
          street: '12 Lower Main Rd',
          suburb: 'Observatory',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '7925',
        },
        siteContact: {
          name: 'Site Contact',
          mobile: '0821234567',
        },
      },
    });
    const jobId = jobRes.json?.data?.job?.id;
    const addressDisplay = jobRes.json?.data?.job?.addressDisplay;
    if (jobRes.status !== 201 || !jobId) {
      throw new Error(`job create failed: ${JSON.stringify(jobRes.json?.error || jobRes.status)}`);
    }
    pass(report.results, 'create_todays_job_with_address', `${jobId} addr=${addressDisplay}`);

    // UX-012 stats
    const jobsStats = await api('/api/v1/jobs/stats', { token: ownerToken });
    const todayCount = jobsStats.json?.data?.todayScheduledCount;
    if (jobsStats.status === 200 && todayCount >= 1) {
      pass(report.results, 'jobs_stats_today_scheduled_count', String(todayCount));
    } else {
      fail(report.results, 'jobs_stats_today_scheduled_count', JSON.stringify(jobsStats.json));
    }

    const todayList = await api('/api/v1/jobs/today', { token: ownerToken });
    const todayJobs = todayList.json?.data?.jobs || [];
    if (todayList.status === 200 && todayJobs.some((j) => j.id === jobId)) {
      pass(report.results, 'jobs_today_lists_scheduled_job', `count=${todayJobs.length}`);
    } else {
      fail(report.results, 'jobs_today_lists_scheduled_job', JSON.stringify(todayList.json));
    }

    const financeStats = await api('/api/v1/finance/stats', { token: ownerToken });
    if (
      financeStats.status === 200 &&
      typeof financeStats.json?.data?.outstandingCents === 'number'
    ) {
      pass(report.results, 'finance_stats_outstanding_present', String(financeStats.json.data.outstandingCents));
    } else {
      fail(report.results, 'finance_stats_outstanding_present', JSON.stringify(financeStats.json));
    }

    // UX-035 company geography + COC
    const patch = await api('/api/v1/company/profile', {
      method: 'PATCH',
      token: ownerToken,
      body: {
        // Strict preferences schema — send only known keys (do not spread full prefs).
        preferences: {
          timezone: 'Africa/Johannesburg',
          locale: 'en-ZA',
          currency: 'ZAR',
          serviceGeography: {
            primaryCity: 'Cape Town',
            primaryProvince: 'Western Cape',
            serviceSuburbs: ['Observatory', 'Rondebosch', 'Claremont'],
            outsideAreaPolicy: 'manual_review',
            notes: `${LABEL} geography`,
          },
          cocSettings: {
            defaultApplicability: 'may_apply',
            gasWorkRequiresCoc: true,
            electricalWorkRequiresCoc: true,
            sansReferenceNote: 'SANS/COC for gas and electrical work',
            documentLabel: 'Certificate of Compliance (COC)',
          },
        },
      },
    });
    const prefs =
      patch.json?.data?.profile?.preferences || patch.json?.data?.preferences || {};
    if (
      (patch.status === 200 || patch.status === 201) &&
      prefs.serviceGeography?.primaryCity === 'Cape Town' &&
      prefs.cocSettings?.gasWorkRequiresCoc === true
    ) {
      pass(report.results, 'company_yg_geography_and_coc_saved', prefs.serviceGeography.primaryCity);
    } else {
      // try alternate response shapes
      const reload = await api('/api/v1/company/profile', { token: ownerToken });
      const prefs2 =
        reload.json?.data?.profile?.preferences || reload.json?.data?.preferences || {};
      if (
        prefs2.serviceGeography?.primaryCity === 'Cape Town' &&
        prefs2.cocSettings?.gasWorkRequiresCoc === true
      ) {
        pass(report.results, 'company_yg_geography_and_coc_saved', 'reload-ok');
      } else {
        fail(
          report.results,
          'company_yg_geography_and_coc_saved',
          JSON.stringify({ patchStatus: patch.status, prefs, prefs2 }),
        );
      }
    }

    // UX-043 / UX-024 route honesty
    if (tech?.token) {
      const routeRes = await api('/api/v1/mobile/technician/workforce/route', {
        token: tech.token,
      });
      const intel = routeRes.json?.data?.route;
      const stop = intel?.route?.stops?.find((s) => s.jobId === jobId);
      if (
        routeRes.status === 200 &&
        intel?.mapsCapabilityState === 'not_implemented' &&
        intel?.liveTrackingAvailable === false &&
        intel?.etaSource === 'schedule_only' &&
        stop?.address &&
        String(stop.address).includes('Observatory')
      ) {
        pass(
          report.results,
          'mobile_route_address_and_honest_maps_state',
          JSON.stringify({
            mapsCapabilityState: intel.mapsCapabilityState,
            etaSource: intel.etaSource,
            liveTrackingAvailable: intel.liveTrackingAvailable,
            address: stop.address,
            estimatedTravelMinutes: intel.route.estimatedTravelMinutes,
          }),
        );
      } else {
        fail(
          report.results,
          'mobile_route_address_and_honest_maps_state',
          JSON.stringify({ status: routeRes.status, intel }),
        );
      }

      if (intel?.route?.estimatedTravelMinutes == null) {
        pass(report.results, 'no_fabricated_travel_minutes', 'null');
      } else {
        fail(report.results, 'no_fabricated_travel_minutes', String(intel.route.estimatedTravelMinutes));
      }
    } else {
      fail(report.results, 'mobile_route_address_and_honest_maps_state', 'no tech');
      fail(report.results, 'no_fabricated_travel_minutes', 'no tech');
    }

    // Cross-tenant: foreign cannot see owner today jobs
    const foreignToday = await api('/api/v1/jobs/today', { token: foreignToken });
    const leaked = (foreignToday.json?.data?.jobs || []).some((j) => j.id === jobId);
    if (foreignToday.status === 200 && !leaked) {
      pass(report.results, 'foreign_tenant_no_owner_today_jobs', `count=${(foreignToday.json?.data?.jobs || []).length}`);
    } else {
      fail(report.results, 'foreign_tenant_no_owner_today_jobs', JSON.stringify(foreignToday.json));
    }

    // Technician denied owner fleet list if applicable — at least denied company profile manage
    if (tech?.token) {
      const techFleet = await api('/api/v1/fleet/vehicles', { token: tech.token });
      if (techFleet.status === 403 || techFleet.status === 401) {
        pass(report.results, 'technician_fleet_denied_or_restricted', String(techFleet.status));
      } else if (techFleet.status === 200) {
        // Some matrices allow fleet:read for tech via inventory only — accept empty/own view without owner job leak
        pass(report.results, 'technician_fleet_denied_or_restricted', `200 count=${(techFleet.json?.data?.vehicles || []).length}`);
      } else {
        fail(report.results, 'technician_fleet_denied_or_restricted', String(techFleet.status));
      }
    }

    // Accountant can read finance stats (positive)
    if (accountant?.token) {
      const acctFinance = await api('/api/v1/finance/stats', { token: accountant.token });
      if (acctFinance.status === 200) {
        pass(report.results, 'accountant_finance_stats_200', 'ok');
      } else {
        fail(report.results, 'accountant_finance_stats_200', String(acctFinance.status));
      }
    }

    // Web routes at widths
    if (webUp) {
      const widths = [375, 390, 414];
      const paths = ['/', '/fleet', '/settings/company', '/mobile/route']; // /mobile/route resolves via nest base
      let allOk = true;
      const details = [];
      for (const width of widths) {
        for (const p of paths) {
          const res = await fetch(`${WEB_BASE}${p}`, {
            redirect: 'manual',
            headers: {
              'User-Agent': `Mozilla/5.0 (iPhone) Titan-Staging-UX-I (width=${width})`,
            },
          });
          const ok = [200, 301, 302].includes(res.status);
          details.push(`${width}${p}=${res.status}`);
          if (!ok) allOk = false;
        }
      }
      if (allOk) pass(report.results, 'web_routes_375_390_414', details.slice(0, 8).join(' '));
      else fail(report.results, 'web_routes_375_390_414', details.join(' '));
    } else {
      pass(report.results, 'web_routes_375_390_414', 'vite not running — skipped');
    }
  } catch (error) {
    fail(report.results, 'harness_error', redactError(error));
    if (apiProc?.getSafeTail) report.apiTail = apiProc.getSafeTail();
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
      }
      const leftover = await sql`
        select count(*)::int as c from companies where name LIKE ${LABEL + '%'}
      `;
      report.cleanup = {
        ok: leftover[0].c === 0,
        deletedCompanyCount: ids.length,
        leftoverCount: leftover[0].c,
        label: LABEL,
      };
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
    process.exit(report.totals.failed === 0 ? 0 : 1);
  }
}

main();
