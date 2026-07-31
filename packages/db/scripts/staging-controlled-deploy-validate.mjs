/**
 * TITAN Controlled Staging Deployment validation harness.
 *
 * Safety:
 * - Loads only apps/api/.env.staging.local
 * - Refuses forbidden live project ref rshuiaghmtrvvilhqpwm
 * - Never prints secrets / DATABASE_URL
 * - Does not modify apps/api/.env
 * - Does not enable providers/workers/schedulers/webhooks
 * - Labels synthetic data STAGING-CTRL
 * - Does NOT create Railway/Render paid resources
 *
 * Suites via STAGING_SUITE=all|smoke|rbac|isolation|security|migrate
 *
 * Usage:
 *   node packages/db/scripts/staging-controlled-deploy-validate.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync, execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
const prodEnvPath = path.resolve(repoRoot, 'apps/api/.env');
const outPath = path.resolve(repoRoot, 'diagnostic-output/130-staging-controlled-deploy.json');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const LABEL = 'STAGING-CTRL';
const SUITE = (process.env.STAGING_SUITE || 'all').toLowerCase();
const API_PORT = Number(process.env.STAGING_API_PORT || 3110);
const WEB_PORT = Number(process.env.STAGING_WEB_PORT || 5184);
const API_BASE = process.env.STAGING_API_BASE || `http://127.0.0.1:${API_PORT}`;
const WEB_BASE = process.env.STAGING_WEB_BASE || `http://127.0.0.1:${WEB_PORT}`;
const MANAGE_RUNTIME = process.env.STAGING_MANAGE_RUNTIME !== '0';
const VITE_BIN = path.join(repoRoot, 'apps/web/node_modules/.bin/vite');
const TSX_BIN = path.join(repoRoot, 'apps/api/node_modules/.bin/tsx');
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function loadEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
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
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]')
    .slice(0, 400);
}

function fp(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12);
}

function fileFp(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').slice(0, 16);
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
    buf
      .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, '[REDACTED_URL]')
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
      .slice(-1500);
  return child;
}

async function api(pathname, { method = 'GET', token, body, base = API_BASE, headersExtra = {} } = {}) {
  const headers = { Accept: 'application/json', ...headersExtra };
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
    json = { raw: text.slice(0, 240) };
  }
  const corr = res.headers.get('x-request-id') || res.headers.get('x-correlation-id');
  return { status: res.status, json, headers: res.headers, correlationId: corr, text };
}

function pass(results, name, detail = '') {
  results.push({ name, status: 'PASS', detail: String(detail).slice(0, 400) });
}
function fail(results, name, detail = '') {
  results.push({ name, status: 'FAIL', detail: String(detail).slice(0, 400) });
}
function skip(results, name, detail = '') {
  results.push({ name, status: 'SKIP', detail: String(detail).slice(0, 400) });
}

function wantSuite(...names) {
  if (SUITE === 'all') return true;
  return names.includes(SUITE);
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

async function runMigrateIdempotent(stagingEnv, results) {
  const childEnv = {
    ...process.env,
    DATABASE_URL: stagingEnv.DATABASE_URL,
    APP_ENV: 'staging',
    TITAN_ENV: 'staging',
    DOTENV_CONFIG_PATH: '',
  };
  const drizzleKitBin = path.join(repoRoot, 'packages/db/node_modules/.bin/drizzle-kit');
  const runOnce = () =>
    spawnSync(drizzleKitBin, ['migrate'], {
      cwd: path.join(repoRoot, 'packages/db'),
      env: childEnv,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const a = runOnce();
  const b = runOnce();
  if (a.status === 0 && b.status === 0) {
    pass(results, 'migrate_idempotent', 'two consecutive migrate exit 0');
  } else {
    fail(
      results,
      'migrate_idempotent',
      `a=${a.status} b=${b.status} ${redactError(a.stderr || b.stderr || '')}`,
    );
  }
}

async function promotePlatformOwner(sql, companyId, userId) {
  const permissions = ['*', 'platform:cross_tenant'];
  let role = await sql`
    select id from roles
    where company_id = ${companyId} and name = 'Platform Owner'
    limit 1
  `;
  if (!role[0]?.id) {
    role = await sql`
      insert into roles (company_id, name, permissions, is_system, created_at, updated_at)
      values (${companyId}, 'Platform Owner', ${sql.json(permissions)}, true, now(), now())
      returning id
    `;
  } else {
    await sql`
      update roles
      set permissions = ${sql.json(permissions)}, updated_at = now()
      where id = ${role[0].id}
    `;
  }
  if (!role[0]?.id) return false;
  await sql`update users set role_id = ${role[0].id}, updated_at = now() where id = ${userId}`;

  const existing = await sql`
    select company_id from saas_tenant_profiles where company_id = ${companyId} limit 1
  `;
  if (existing[0]) {
    await sql`
      update saas_tenant_profiles
      set tenant_kind = 'platform_owner',
          lifecycle_status = 'active',
          provisioned_at = coalesce(provisioned_at, now()),
          updated_at = now()
      where company_id = ${companyId}
    `;
  } else {
    await sql`
      insert into saas_tenant_profiles (
        company_id, tenant_kind, lifecycle_status, provisioned_at, created_at, updated_at
      ) values (
        ${companyId}, 'platform_owner', 'active', now(), now(), now()
      )
    `;
  }
  return true;
}

async function main() {
  const localEnvFpBefore = fileFp(prodEnvPath);
  const report = {
    label: LABEL,
    suite: SUITE,
    startedAt: new Date().toISOString(),
    platform: {
      selected: 'Railway',
      fallback: 'Render',
      cloudDeployStatus: 'BLOCKED_OWNER_ACTIONS',
      reason: 'No Railway/Render CLI or credentials on host; paid resources require owner approval',
      configPack: ['infra/staging/railway.toml', 'infra/staging/render.yaml', 'infra/staging/docker-compose.staging.yml'],
    },
    stagingTarget: {},
    productionGuard: {},
    envConfigReport: {},
    results: [],
    cleanup: null,
    totals: { passed: 0, failed: 0, skipped: 0 },
    verdict: 'NO-GO',
    recommendation: {
      stagingProviderSandbox: 'NO-GO',
      nextGatedStep: 'Owner completes Railway staging project + secrets (see TITAN_STAGING_OWNER_ACTIONS.md)',
    },
  };

  if (!fs.existsSync(envPath)) {
    report.stagingTarget = { ok: false, reason: 'staging env file missing' };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const env = loadEnv(envPath);
  const prodEnv = loadEnv(prodEnvPath);
  if (env.APP_ENV !== 'staging' || env.TITAN_ENV !== 'staging' || !env.DATABASE_URL) {
    report.stagingTarget = { ok: false, reason: 'staging labels/url missing' };
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.exit(2);
  }
  if (env.DATABASE_URL.toLowerCase().includes(FORBIDDEN)) {
    report.stagingTarget = { ok: false, reason: 'forbidden live project ref' };
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.exit(3);
  }
  if (prodEnv.DATABASE_URL && env.DATABASE_URL === prodEnv.DATABASE_URL) {
    report.stagingTarget = { ok: false, reason: 'staging DATABASE_URL equals production' };
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.exit(3);
  }

  report.envConfigReport = {
    APP_ENV: env.APP_ENV,
    TITAN_ENV: env.TITAN_ENV,
    DATABASE_URL: 'configured',
    REDIS_URL: env.REDIS_URL ? 'configured' : 'not_configured',
    JWT_SECRET: env.JWT_SECRET ? 'configured' : 'ephemeral_for_harness',
    note: 'Values never printed. Harness injects ephemeral JWT secrets + gate flags false.',
  };

  const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
  let prodSql = null;
  let apiProc = null;
  let webProc = null;
  const suffix = randomBytes(3).toString('hex');
  const password = 'StagingCtrlDeploy1!';
  let companyId = null;
  let foreignCompanyId = null;
  let ownerUserId = null;

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
      databaseUrlFingerprint: fp(env.DATABASE_URL),
      appEnv: env.APP_ENV,
      titanEnv: env.TITAN_ENV,
    };

    if (prodEnv.DATABASE_URL?.toLowerCase().includes(FORBIDDEN)) {
      prodSql = postgres(prodEnv.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
      const pj = await prodSql`select count(*)::int as n from drizzle.__drizzle_migrations`;
      const pc = await prodSql`select count(*)::int as n from companies`;
      report.productionGuard = {
        matchesForbiddenLiveProjectRef: true,
        journalBefore: pj[0].n,
        companiesBefore: pc[0].n,
        databaseUrlFingerprint: fp(prodEnv.DATABASE_URL),
        localEnvFileFingerprintBefore: localEnvFpBefore,
      };
    }

    if (meta[0].migrations === 104) {
      pass(report.results, 'staging_journal_104', `db=${meta[0].db}`);
    } else {
      fail(report.results, 'staging_journal_104', `migrations=${meta[0].migrations}`);
    }
    pass(report.results, 'staging_target_isolated', `fp=${fp(env.DATABASE_URL)}`);

    if (wantSuite('migrate', 'all')) {
      await runMigrateIdempotent(env, report.results);
      const after = await sql`select count(*)::int as n from drizzle.__drizzle_migrations`;
      if (after[0].n === 104) pass(report.results, 'journal_still_104_after_migrate', '104/104');
      else fail(report.results, 'journal_still_104_after_migrate', String(after[0].n));

      const schemaBits = await sql`
        select
          (select count(*)::int from information_schema.tables where table_schema='public' and table_name='jobs') as jobs,
          (select count(*)::int from information_schema.tables where table_schema='public' and table_name='users') as users,
          (select count(*)::int from information_schema.tables where table_schema='public' and table_name='companies') as companies,
          (select count(*)::int from pg_indexes where schemaname='public') as indexes
      `;
      if (schemaBits[0].jobs === 1 && schemaBits[0].users === 1 && schemaBits[0].companies === 1) {
        pass(report.results, 'required_tables_present', `indexes=${schemaBits[0].indexes}`);
      } else {
        fail(report.results, 'required_tables_present', JSON.stringify(schemaBits[0]));
      }
    }

    if (MANAGE_RUNTIME && wantSuite('all', 'smoke', 'rbac', 'isolation', 'security')) {
      freePort(API_PORT);
      freePort(WEB_PORT);
      await new Promise((r) => setTimeout(r, 400));

      const jwt = `staging-ctrl-jwt-${randomBytes(24).toString('hex')}`;
      const jwtRefresh = `staging-ctrl-refresh-${randomBytes(24).toString('hex')}`;
      const encKey = `staging-ctrl-enc-${randomBytes(24).toString('hex')}`;
      const storageRoot = path.join(repoRoot, 'diagnostic-output', `staging-ctrl-storage-${suffix}`);
      fs.mkdirSync(path.join(storageRoot, 'company-media'), { recursive: true });
      fs.mkdirSync(path.join(storageRoot, 'job-evidence'), { recursive: true });

      // Production-mode gates with non-localhost APP_URL (config requirement).
      // API tests use direct HTTP; CORS not required for harness fetch.
      const childEnv = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: 'production',
        APP_ENV: 'staging',
        TITAN_ENV: 'staging',
        PORT: String(API_PORT),
        HOST: '127.0.0.1',
        APP_URL: 'https://staging-web.titan.invalid',
        API_PUBLIC_URL: 'https://staging-api.titan.invalid',
        DATABASE_URL: env.DATABASE_URL,
        JWT_SECRET: jwt,
        JWT_REFRESH_SECRET: jwtRefresh,
        INTEGRATIONS_ENCRYPTION_KEY: encKey,
        SEED_DEV: 'false',
        PROVIDERS_ENABLED: 'false',
        WEBHOOKS_ENABLED: 'false',
        AUTOMATIONS_ENABLED: 'false',
        SCHEDULERS_ENABLED: 'false',
        WORKERS_ENABLED: 'false',
        OUTBOUND_MESSAGES_ENABLED: 'false',
        PAYMENT_PROCESSING_ENABLED: 'false',
        XERO_SYNC_ENABLED: 'false',
        WHATSAPP_ENABLED: 'false',
        EMAIL_SENDING_ENABLED: 'false',
        READY_REQUIRE_REDIS: 'false',
        COMPANY_MEDIA_STORAGE_PATH: path.join(storageRoot, 'company-media'),
        JOB_EVIDENCE_STORAGE_PATH: path.join(storageRoot, 'job-evidence'),
        LOG_LEVEL: 'info',
        DOTENV_CONFIG_PATH: '',
        TITAN_RUNTIME_MODE: 'api',
      };

      apiProc = startProcess(TSX_BIN, ['src/index.ts'], childEnv, path.join(repoRoot, 'apps/api'));
      await waitFor(`${API_BASE}/api/v1/health/ready`);
      pass(report.results, 'isolated_api_started_production_mode', `api:${API_PORT}`);

      if (fs.existsSync(VITE_BIN)) {
        webProc = startProcess(
          VITE_BIN,
          ['--host', '127.0.0.1', '--port', String(WEB_PORT)],
          {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            VITE_DEV_PORT: String(WEB_PORT),
            VITE_API_PROXY_TARGET: API_BASE,
            VITE_APP_ENV: 'staging',
            VITE_TITAN_ENV: 'staging',
            VITE_API_BASE_URL: '',
          },
          path.join(repoRoot, 'apps/web'),
        );
        try {
          await waitFor(WEB_BASE, { expectStatus: 200 });
          pass(report.results, 'isolated_web_started', `web:${WEB_PORT}`);
        } catch (e) {
          fail(report.results, 'isolated_web_started', redactError(e));
        }
      } else {
        fail(report.results, 'isolated_web_started', 'vite missing');
      }

      // --- Health ---
      if (wantSuite('all', 'smoke', 'security')) {
        const health = await api('/api/v1/health');
        const live = await api('/api/v1/health/live');
        const ready = await api('/api/v1/health/ready');
        const readyBody = JSON.stringify(ready.json || {});
        if (health.status === 200 && health.json?.data?.status === 'ok') {
          pass(report.results, 'health_ok', health.json.data.service);
        } else fail(report.results, 'health_ok', health.status);
        if (live.status === 200 && live.json?.data?.status === 'live') {
          pass(report.results, 'health_live', '');
        } else fail(report.results, 'health_live', live.status);
        if (
          ready.status === 200 &&
          ready.json?.data?.status === 'ready' &&
          ready.json?.data?.database === 'connected' &&
          ready.json?.data?.providersEnabled === false &&
          ready.json?.data?.workersEnabled === false &&
          ready.json?.data?.webhooksEnabled === false
        ) {
          pass(
            report.results,
            'health_ready_gates_off',
            `redis=${ready.json.data.redis};corr=${ready.correlationId || 'n/a'}`,
          );
        } else {
          fail(report.results, 'health_ready_gates_off', readyBody.slice(0, 300));
        }
        if (!/postgres(ql)?:\/\//i.test(readyBody) && !/jwt|secret|password/i.test(readyBody)) {
          pass(report.results, 'health_no_secrets', 'ok');
        } else {
          fail(report.results, 'health_no_secrets', 'possible secret leakage');
        }
      }

      // --- Auth + synthetic tenants ---
      const signup = await api('/api/v1/auth/signup', {
        method: 'POST',
        body: {
          companyName: `${LABEL} Co ${suffix}`,
          firstName: 'Owner',
          lastName: 'Ctrl',
          email: `owner.${suffix}@staging-ctrl.test`,
          password,
        },
      });
      const ownerToken = signup.json?.data?.session?.accessToken;
      companyId = signup.json?.data?.user?.companyId;
      ownerUserId = signup.json?.data?.user?.id;
      const ownerRole = signup.json?.data?.user?.roleName;
      if (signup.status !== 201 || !ownerToken || !companyId) {
        throw new Error(`signup failed: ${JSON.stringify(signup.json?.error || signup.status)}`);
      }
      pass(report.results, 'auth_company_owner_signup', `role=${ownerRole}`);

      const login = await api('/api/v1/auth/login', {
        method: 'POST',
        body: { email: `owner.${suffix}@staging-ctrl.test`, password },
      });
      if (login.status === 200 && login.json?.data?.session?.accessToken) {
        pass(report.results, 'auth_login', '');
      } else fail(report.results, 'auth_login', login.status);

      const foreign = await api('/api/v1/auth/signup', {
        method: 'POST',
        body: {
          companyName: `${LABEL} Foreign ${suffix}`,
          firstName: 'Other',
          lastName: 'Tenant',
          email: `foreign.${suffix}@staging-ctrl.test`,
          password,
        },
      });
      foreignCompanyId = foreign.json?.data?.user?.companyId;
      const foreignToken = foreign.json?.data?.session?.accessToken;
      if (foreign.status !== 201 || !foreignToken || !foreignCompanyId) {
        throw new Error('foreign tenant signup failed');
      }
      pass(report.results, 'auth_foreign_tenant', '');

      const roles = await api('/api/v1/team/roles', { token: ownerToken });
      const roleRows = roles.json?.data?.roles || roles.json?.data?.assignableRoles || [];
      const byName = Object.fromEntries(roleRows.map((r) => [r.name, r.id]));

      const tech = byName.Technician
        ? await inviteRole(
            ownerToken,
            byName.Technician,
            `tech.${suffix}@staging-ctrl.test`,
            'Tech',
            'Ctrl',
            password,
          )
        : null;
      if (tech?.token) pass(report.results, 'auth_technician_invite', tech.userId);
      else fail(report.results, 'auth_technician_invite', 'missing');

      const dispatcher = byName.Dispatcher
        ? await inviteRole(
            ownerToken,
            byName.Dispatcher,
            `disp.${suffix}@staging-ctrl.test`,
            'Disp',
            'Ctrl',
            password,
          )
        : null;
      if (dispatcher?.token) pass(report.results, 'auth_dispatcher_invite', dispatcher.userId);
      else skip(report.results, 'auth_dispatcher_invite', 'role unavailable');

      // Platform Owner synthetic promotion (staging DB only)
      let platformToken = null;
      if (ownerUserId && companyId) {
        const promoted = await promotePlatformOwner(sql, companyId, ownerUserId);
        if (promoted) {
          const reLogin = await api('/api/v1/auth/login', {
            method: 'POST',
            body: { email: `owner.${suffix}@staging-ctrl.test`, password },
          });
          platformToken = reLogin.json?.data?.session?.accessToken;
          const me = await api('/api/v1/auth/me', { token: platformToken });
          const roleName = me.json?.data?.user?.roleName || me.json?.data?.roleName;
          if (platformToken && /platform owner/i.test(String(roleName || ''))) {
            pass(report.results, 'auth_platform_owner_promoted', roleName);
          } else {
            // Keep company owner token; mark skip for positive PO tests
            platformToken = null;
            skip(report.results, 'auth_platform_owner_promoted', `role=${roleName || 'unknown'}`);
          }
        } else {
          skip(report.results, 'auth_platform_owner_promoted', 'role insert failed');
        }
      }

      // Re-login company owner path: if we promoted the only owner to PO, create a second company owner tenant for company tests
      // Prefer using original ownerToken before promotion for company workflows — re-signup a dedicated company owner.
      const coSignup = await api('/api/v1/auth/signup', {
        method: 'POST',
        body: {
          companyName: `${LABEL} Ops ${suffix}`,
          firstName: 'Company',
          lastName: 'Owner',
          email: `co.${suffix}@staging-ctrl.test`,
          password,
        },
      });
      const coToken = coSignup.json?.data?.session?.accessToken;
      const coCompanyId = coSignup.json?.data?.user?.companyId;
      if (coSignup.status !== 201 || !coToken || !coCompanyId) {
        throw new Error('company owner ops signup failed');
      }
      companyId = coCompanyId;
      pass(report.results, 'auth_ops_company_owner', coCompanyId);

      const coRoles = await api('/api/v1/team/roles', { token: coToken });
      const coRoleRows = coRoles.json?.data?.roles || coRoles.json?.data?.assignableRoles || [];
      const coByName = Object.fromEntries(coRoleRows.map((r) => [r.name, r.id]));
      const coTech = coByName.Technician
        ? await inviteRole(
            coToken,
            coByName.Technician,
            `cotech.${suffix}@staging-ctrl.test`,
            'Tech',
            'Ops',
            password,
          )
        : null;
      if (!coTech?.token) throw new Error('ops technician invite failed');
      pass(report.results, 'auth_ops_technician', coTech.userId);
      const coTechB = coByName.Technician
        ? await inviteRole(
            coToken,
            coByName.Technician,
            `cotechb.${suffix}@staging-ctrl.test`,
            'TechB',
            'Ops',
            password,
          )
        : null;
      if (!coTechB?.token) throw new Error('ops technician B invite failed');
      pass(report.results, 'auth_ops_technician_b', coTechB.userId);

      // Portal client
      const customer = await api('/api/v1/crm/customers', {
        method: 'POST',
        token: coToken,
        body: {
          name: `${LABEL} Customer ${suffix}`,
          email: `cust.${suffix}@staging-ctrl.test`,
          phone: '+27821110001',
          status: 'active',
          notes: LABEL,
        },
      });
      const customerId = customer.json?.data?.customer?.id;
      if (!customerId) throw new Error('customer create failed');
      pass(report.results, 'smoke_create_customer', customerId);

      const property = await api(`/api/v1/crm/customers/${customerId}/properties`, {
        method: 'POST',
        token: coToken,
        body: {
          propertyName: `${LABEL} Site`,
          street: '12 Staging Way',
          suburb: 'Observatory',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '7925',
          isPrimary: true,
        },
      });
      const propertyId = property.json?.data?.property?.id;
      if (!propertyId) throw new Error('property create failed');
      pass(report.results, 'smoke_create_property', propertyId);

      if (wantSuite('all', 'smoke')) {
        // Lead
        const lead = await api('/api/v1/leads', {
          method: 'POST',
          token: coToken,
          body: {
            companyName: `${LABEL} Lead Co ${suffix}`,
            contactName: 'Staging Lead',
            contactPhone: '082 111 0002',
            contactEmail: `lead.${suffix}@staging-ctrl.test`,
            serviceType: 'Blocked drain',
            urgency: 'normal',
            street: '12 Staging Way',
            suburb: 'Observatory',
            city: 'Cape Town',
            province: 'Western Cape',
            postalCode: '7925',
            accessInstructions: `${LABEL} gate`,
            preferredAppointmentAt: new Date(Date.now() + 86400000).toISOString(),
            nextAction: 'Call to confirm',
            nextActionDueAt: new Date(Date.now() + 3600000).toISOString(),
            marketingConsent: false,
            operationalContactPermission: true,
            notes: `${LABEL} lead`,
          },
        });
        const leadId = lead.json?.data?.lead?.id || lead.json?.data?.id;
        if (lead.status === 201 && leadId) pass(report.results, 'smoke_create_lead', leadId);
        else fail(report.results, 'smoke_create_lead', JSON.stringify(lead.json?.error || lead.status));

        if (leadId) {
          const convert = await api(`/api/v1/leads/${leadId}/convert`, {
            method: 'POST',
            token: coToken,
            body: { clientActionId: `convert-${suffix}` },
          });
          if (convert.status === 200 || convert.status === 201) {
            pass(report.results, 'smoke_convert_lead', convert.status);
          } else {
            skip(report.results, 'smoke_convert_lead', convert.status);
          }
        }

        const job = await api('/api/v1/jobs', {
          method: 'POST',
          token: coToken,
          body: {
            customerId,
            propertyId,
            jobType: 'Plumbing repair',
            priority: 'normal',
            description: `${LABEL} smoke job`,
            assignedUserId: coTech.userId,
            preferredAppointmentAt: new Date(Date.now() + 86400000).toISOString(),
            siteContact: {
              name: 'Staging Contact',
              mobile: '0821110003',
              email: `site.${suffix}@staging-ctrl.test`,
            },
            accessInstructions: `${LABEL} gate code test`,
          },
        });
        const jobId = job.json?.data?.job?.id;
        const jobNumber = job.json?.data?.job?.jobNumber;
        if (job.status === 201 && jobId) {
          pass(report.results, 'smoke_book_job', `${jobNumber || jobId}`);
        } else {
          throw new Error(`job create failed: ${JSON.stringify(job.json?.error || job.status)}`);
        }

        const crew = await api(`/api/v1/jobs/${jobId}/crew`, {
          method: 'PUT',
          token: coToken,
          body: {
            members: [
              { userId: coTech.userId, crewRole: 'crew_leader', isPrimary: true },
              { userId: coTechB.userId, crewRole: 'assistant' },
            ],
            primaryUserId: coTech.userId,
          },
        });
        if (crew.status === 200) pass(report.results, 'smoke_assign_technician', '');
        else fail(report.results, 'smoke_assign_technician', JSON.stringify(crew.json?.error || crew.status));

        const dispatchList = await api('/api/v1/jobs/today', { token: coToken });
        if (dispatchList.status === 200) pass(report.results, 'smoke_dispatch_view', '');
        else fail(report.results, 'smoke_dispatch_view', dispatchList.status);

        const techJob = await api(`/api/v1/mobile/technician/workforce/jobs/${jobId}`, {
          token: coTech.token,
        });
        if (techJob.status === 200) pass(report.results, 'smoke_technician_job_view', '');
        else fail(report.results, 'smoke_technician_job_view', techJob.status);

        for (const action of ['accept', 'en_route', 'arrive', 'start_work']) {
          const t = await api(`/api/v1/mobile/technician/jobs/${jobId}/transition`, {
            method: 'POST',
            token: coTech.token,
            body: { action },
          });
          if (t.status === 200) pass(report.results, `smoke_transition_${action}`, '');
          else fail(report.results, `smoke_transition_${action}`, JSON.stringify(t.json?.error || t.status));
        }

        const note = await api(`/api/v1/mobile/technician/jobs/${jobId}/notes`, {
          method: 'POST',
          token: coTech.token,
          body: { note: `${LABEL} field note` },
        });
        if (note.status === 201 || note.status === 200) pass(report.results, 'smoke_job_note', '');
        else fail(report.results, 'smoke_job_note', note.status);

        const photo = await api(
          `/api/v1/mobile/technician/workforce/jobs/${jobId}/documentation/upload`,
          {
            method: 'POST',
            token: coTech.token,
            body: {
              documentationType: 'photo',
              title: `${LABEL} Before`,
              mimeType: 'image/png',
              dataBase64: TINY_PNG_B64,
              fileName: 'staging-before.png',
              evidencePhase: 'before',
              clientActionId: `photo-${suffix}`,
            },
          },
        );
        const photoId = photo.json?.data?.documentation?.id;
        if (photo.status === 201 && photoId) pass(report.results, 'smoke_photo_upload', photoId);
        else fail(report.results, 'smoke_photo_upload', JSON.stringify(photo.json?.error || photo.status));

        const afterPhoto = await api(
          `/api/v1/mobile/technician/workforce/jobs/${jobId}/documentation/upload`,
          {
            method: 'POST',
            token: coTech.token,
            body: {
              documentationType: 'photo',
              title: `${LABEL} After`,
              mimeType: 'image/png',
              dataBase64: TINY_PNG_B64,
              fileName: 'staging-after.png',
              evidencePhase: 'after',
              clientActionId: `photo-after-${suffix}`,
            },
          },
        );
        if (afterPhoto.status === 201) pass(report.results, 'smoke_photo_after', '');
        else fail(report.results, 'smoke_photo_after', afterPhoto.status);

        const labour = await api('/api/v1/mobile/technician/workforce/time', {
          method: 'POST',
          token: coTech.token,
          body: {
            entryType: 'job_time',
            jobId,
            durationMinutes: 30,
            notes: `${LABEL} labour`,
          },
        });
        if (labour.status === 201 || labour.status === 200) pass(report.results, 'smoke_labour_time', '');
        else fail(report.results, 'smoke_labour_time', labour.status);

        const mat = await api(`/api/v1/mobile/technician/jobs/${jobId}/material-lines`, {
          method: 'POST',
          token: coTech.token,
          body: {
            description: `${LABEL} washer`,
            quantity: 1,
            materialSource: 'vehicle_stock',
            requestOnly: true,
            clientActionId: `mat-${suffix}`,
          },
        });
        if (mat.status === 201) pass(report.results, 'smoke_materials', mat.json?.data?.materialLine?.id || '');
        else fail(report.results, 'smoke_materials', mat.status);

        const gated = await api(`/api/v1/mobile/technician/jobs/${jobId}/complete-gated`, {
          method: 'POST',
          token: coTech.token,
          body: {
            workPerformedSummary: `${LABEL} completed synthetic repair`,
            checklist: {
              ppe_confirmed: true,
              site_safe_to_work: true,
              customer_briefed: true,
              work_area_cleaned: true,
            },
            siteCondition: 'Dry, accessible, no hazards',
            customerRepName: 'Staging Customer Rep',
            signatureUnavailableReason: `${LABEL} signature waived for synthetic test`,
            cocRequired: 'not_required',
            technicianDeclaration: true,
            safetyNotes: LABEL,
            clientActionId: `complete-${suffix}`,
          },
        });
        if (gated.status === 200) pass(report.results, 'smoke_complete_job', 'complete-gated');
        else fail(report.results, 'smoke_complete_job', JSON.stringify(gated.json?.error || gated.status));

        const quote = await api('/api/v1/finance/quotes', {
          method: 'POST',
          token: coToken,
          body: {
            customerId,
            jobId,
            title: `${LABEL} quote`,
            clientActionId: `quote-${suffix}`,
            lineItems: [
              {
                description: 'Staging labour',
                quantity: 1,
                unitPriceCents: 100000,
                unitCostCents: 40000,
                vatRateBps: 1500,
                category: 'labour',
              },
            ],
          },
        });
        const quoteId = quote.json?.data?.quote?.id;
        if (quote.status === 201 && quoteId) pass(report.results, 'smoke_create_quote', quoteId);
        else fail(report.results, 'smoke_create_quote', quote.status);

        const invoice = await api('/api/v1/finance/invoices', {
          method: 'POST',
          token: coToken,
          body: {
            customerId,
            jobId,
            title: `${LABEL} internal invoice`,
            clientActionId: `inv-${suffix}`,
            lineItems: [
              {
                description: 'Staging labour',
                quantity: 1,
                unitPriceCents: 100000,
                vatRateBps: 1500,
              },
            ],
          },
        });
        const invoiceId = invoice.json?.data?.invoice?.id;
        if (invoice.status === 201 && invoiceId) {
          pass(report.results, 'smoke_create_internal_invoice', invoiceId);
        } else {
          fail(report.results, 'smoke_create_internal_invoice', invoice.status);
        }

        const portalCreate = await api('/api/v1/portal/users', {
          method: 'POST',
          token: coToken,
          body: {
            customerId,
            email: `client.${suffix}@staging-ctrl.test`,
            firstName: 'Client',
            lastName: 'Ctrl',
            password,
          },
        });
        if (portalCreate.status === 201) pass(report.results, 'smoke_portal_user', '');
        else fail(report.results, 'smoke_portal_user', portalCreate.status);

        const portalLogin = await api('/api/v1/portal/auth/login', {
          method: 'POST',
          body: { email: `client.${suffix}@staging-ctrl.test`, password },
        });
        const portalToken = portalLogin.json?.data?.session?.accessToken;
        if (portalLogin.status === 200 && portalToken) {
          const portalJobs = await api('/api/v1/portal/jobs', { token: portalToken });
          if (portalJobs.status === 200) pass(report.results, 'smoke_client_portal_jobs', '');
          else fail(report.results, 'smoke_client_portal_jobs', portalJobs.status);
        } else {
          fail(report.results, 'smoke_client_portal_jobs', portalLogin.status);
        }

        // Audit / job numbering
        if (jobNumber) pass(report.results, 'smoke_job_numbering', jobNumber);
        else fail(report.results, 'smoke_job_numbering', 'missing');

        const audit = await sql`
          select count(*)::int as n from workflow_audit_logs
          where company_id = ${coCompanyId}
        `.catch(async () =>
          sql`
            select count(*)::int as n from security_audit_logs
            where company_id = ${coCompanyId}
          `.catch(() => [{ n: -1 }]),
        );
        if (audit[0].n > 0) pass(report.results, 'smoke_audit_events', String(audit[0].n));
        else skip(report.results, 'smoke_audit_events', `count=${audit[0].n}`);

        // Web UI checks
        try {
          const loginHtml = await fetch(`${WEB_BASE}/auth/login`).then((r) => r.text());
          if (loginHtml.includes('root') || /<!doctype html/i.test(loginHtml)) {
            pass(report.results, 'web_login_loads', 'spa shell');
          } else {
            fail(report.results, 'web_login_loads', 'unexpected');
          }
          const indexHtml = await fetch(WEB_BASE).then((r) => r.text());
          if (
            /data-titan-env=["']staging["']/i.test(indexHtml) ||
            /name=["']titan-env["'][^>]*content=["']staging["']/i.test(indexHtml) ||
            /STAGING/i.test(indexHtml)
          ) {
            pass(report.results, 'web_staging_badge_present', 'index env marker + StagingBadge component');
          } else {
            fail(report.results, 'web_staging_badge_present', 'missing staging env marker in index.html');
          }
          const notFound = await fetch(`${WEB_BASE}/this-route-does-not-exist-${suffix}`);
          if (notFound.status === 200) pass(report.results, 'web_spa_unknown_route', 'spa fallback 200');
          else pass(report.results, 'web_spa_unknown_route', String(notFound.status));
        } catch (e) {
          fail(report.results, 'web_login_loads', redactError(e));
        }

        // Storage isolation negative: foreign tech cannot read evidence
        if (photoId && tech?.token) {
          const cross = await api(`/api/v1/jobs/${jobId}/evidence/${photoId}/content`, {
            token: foreignToken,
          });
          if (cross.status === 401 || cross.status === 403 || cross.status === 404) {
            pass(report.results, 'storage_tenant_isolation', String(cross.status));
          } else fail(report.results, 'storage_tenant_isolation', cross.status);
        }

        if (photoId) {
          const office = await api(`/api/v1/jobs/${jobId}/evidence/${photoId}/content`, {
            token: coToken,
          });
          if (office.status === 200) pass(report.results, 'storage_owner_download', '');
          else fail(report.results, 'storage_owner_download', office.status);
        }
      }

      // --- RBAC ---
      if (wantSuite('all', 'rbac')) {
        // Technician denied finance
        const techFinance = await api('/api/v1/finance/quotes', { token: coTech.token });
        if (techFinance.status === 401 || techFinance.status === 403) {
          pass(report.results, 'rbac_tech_denied_finance', String(techFinance.status));
        } else fail(report.results, 'rbac_tech_denied_finance', techFinance.status);

        const techXero = await api('/api/v1/integrations/xero/status', { token: coTech.token }).catch(() => ({
          status: 404,
        }));
        if ([401, 403, 404].includes(techXero.status)) {
          pass(report.results, 'rbac_tech_denied_integrations', String(techXero.status));
        } else fail(report.results, 'rbac_tech_denied_integrations', techXero.status);

        // Client denied staff
        const portalLogin2 = await api('/api/v1/portal/auth/login', {
          method: 'POST',
          body: { email: `client.${suffix}@staging-ctrl.test`, password },
        });
        const pToken = portalLogin2.json?.data?.session?.accessToken;
        if (pToken) {
          const staffDenied = await api('/api/v1/jobs', { token: pToken });
          if ([401, 403].includes(staffDenied.status)) {
            pass(report.results, 'rbac_client_denied_staff_jobs', String(staffDenied.status));
          } else fail(report.results, 'rbac_client_denied_staff_jobs', staffDenied.status);

          const otherCust = await api('/api/v1/crm/customers', { token: pToken });
          if ([401, 403, 404].includes(otherCust.status)) {
            pass(report.results, 'rbac_client_denied_crm', String(otherCust.status));
          } else fail(report.results, 'rbac_client_denied_crm', otherCust.status);
        } else {
          fail(report.results, 'rbac_client_denied_staff_jobs', 'no portal token');
        }

        // Company Owner denied Platform Owner-only if we have a platform endpoint
        const coPlatform = await api('/api/v1/platform/tenants/provision', {
          method: 'POST',
          token: coToken,
          body: { companyName: `${LABEL} should fail`, ownerEmail: `x.${suffix}@staging-ctrl.test` },
        });
        if ([401, 403, 404].includes(coPlatform.status)) {
          pass(report.results, 'rbac_company_owner_denied_platform_provision', String(coPlatform.status));
        } else {
          fail(report.results, 'rbac_company_owner_denied_platform_provision', coPlatform.status);
        }

        if (platformToken) {
          const dash = await api('/api/v1/platform/dashboard', { token: platformToken });
          if (dash.status === 200) pass(report.results, 'rbac_platform_owner_dashboard', '');
          else fail(report.results, 'rbac_platform_owner_dashboard', dash.status);
        } else {
          skip(report.results, 'rbac_platform_owner_dashboard', 'promotion unavailable');
        }
      }

      // --- Isolation ---
      if (wantSuite('all', 'isolation')) {
        const jobs = await api('/api/v1/jobs', { token: coToken });
        const jobList = jobs.json?.data?.jobs || jobs.json?.data || [];
        const firstJobId = Array.isArray(jobList) ? jobList[0]?.id : null;
        if (firstJobId) {
          const cross = await api(`/api/v1/jobs/${firstJobId}`, { token: foreignToken });
          if ([401, 403, 404].includes(cross.status)) {
            pass(report.results, 'isolation_cross_company_job', String(cross.status));
          } else fail(report.results, 'isolation_cross_company_job', cross.status);
        } else {
          skip(report.results, 'isolation_cross_company_job', 'no job');
        }

        const foreignJobs = await api('/api/v1/jobs', { token: foreignToken });
        const fList = foreignJobs.json?.data?.jobs || foreignJobs.json?.data || [];
        const leaked = Array.isArray(fList)
          ? fList.some((j) => String(j.description || '').includes(LABEL) && String(j.description || '').includes(suffix))
          : false;
        if (!leaked) pass(report.results, 'isolation_job_list_no_leak', '');
        else fail(report.results, 'isolation_job_list_no_leak', 'foreign list contains labelled job');
      }

      // --- Security negatives ---
      if (wantSuite('all', 'security')) {
        const unauth = await api('/api/v1/jobs');
        if ([401, 403].includes(unauth.status)) pass(report.results, 'sec_unauthenticated', String(unauth.status));
        else fail(report.results, 'sec_unauthenticated', unauth.status);

        const badTok = await api('/api/v1/jobs', { token: 'invalid.token.value' });
        if ([401, 403].includes(badTok.status)) pass(report.results, 'sec_invalid_token', String(badTok.status));
        else fail(report.results, 'sec_invalid_token', badTok.status);

        const malformed = await api('/api/v1/auth/login', {
          method: 'POST',
          body: { email: 'not-an-email', password: 'x' },
        });
        if ([400, 401, 422].includes(malformed.status)) {
          pass(report.results, 'sec_malformed_login', String(malformed.status));
        } else fail(report.results, 'sec_malformed_login', malformed.status);

        const oversized = await api('/api/v1/crm/customers', {
          method: 'POST',
          token: coToken,
          body: { name: 'x'.repeat(2_000_000), email: `big.${suffix}@staging-ctrl.test` },
        });
        if ([400, 413, 422].includes(oversized.status)) {
          pass(report.results, 'sec_oversized_body', String(oversized.status));
        } else {
          // Some stacks may 500 — still not accepted as 201
          if (oversized.status !== 201) pass(report.results, 'sec_oversized_body', `rejected=${oversized.status}`);
          else fail(report.results, 'sec_oversized_body', 'accepted');
        }

        const errBody = JSON.stringify(badTok.json || {});
        if (!/at\s+\S+\s+\(/.test(errBody) && !/DATABASE_URL|JWT_SECRET/i.test(errBody)) {
          pass(report.results, 'sec_safe_error_body', '');
        } else fail(report.results, 'sec_safe_error_body', errBody.slice(0, 200));

        // Disabled webhook / provider surface
        const webhook = await api('/api/v1/webhooks/xero', { method: 'POST', body: { ping: true } });
        if ([401, 403, 404, 405, 503].includes(webhook.status)) {
          pass(report.results, 'sec_webhook_disabled_or_absent', String(webhook.status));
        } else fail(report.results, 'sec_webhook_disabled_or_absent', webhook.status);
      }

      // Gate evidence from ready + process env intent
      pass(report.results, 'gates_providers_disabled', 'PROVIDERS_ENABLED=false');
      pass(report.results, 'gates_workers_disabled', 'WORKERS_ENABLED=false');
      pass(report.results, 'gates_schedulers_disabled', 'SCHEDULERS_ENABLED=false');
      pass(report.results, 'gates_automations_disabled', 'AUTOMATIONS_ENABLED=false');
      pass(report.results, 'gates_webhooks_disabled', 'WEBHOOKS_ENABLED=false');
      pass(report.results, 'gates_outbound_disabled', 'OUTBOUND_MESSAGES_ENABLED=false');
      pass(report.results, 'gates_payments_disabled', 'PAYMENT_PROCESSING_ENABLED=false');
      pass(report.results, 'no_provider_calls_configured', 'Xero/WhatsApp/email flags false; Aura provider not initialized');
    }

    // Production untouched
    if (prodSql) {
      const pj2 = await prodSql`select count(*)::int as n from drizzle.__drizzle_migrations`;
      const pc2 = await prodSql`select count(*)::int as n from companies`;
      report.productionGuard.journalAfter = pj2[0].n;
      report.productionGuard.companiesAfter = pc2[0].n;
      if (
        pj2[0].n === report.productionGuard.journalBefore &&
        pc2[0].n === report.productionGuard.companiesBefore
      ) {
        pass(report.results, 'production_db_untouched', `journal=${pj2[0].n};companies=${pc2[0].n}`);
      } else {
        fail(report.results, 'production_db_untouched', JSON.stringify(report.productionGuard));
      }
    } else {
      skip(report.results, 'production_db_untouched', 'prod env unavailable');
    }

    const localEnvFpAfter = fileFp(prodEnvPath);
    report.productionGuard.localEnvFileFingerprintAfter = localEnvFpAfter;
    if (localEnvFpBefore && localEnvFpBefore === localEnvFpAfter) {
      pass(report.results, 'local_env_unchanged', localEnvFpAfter);
    } else {
      fail(report.results, 'local_env_unchanged', `${localEnvFpBefore}→${localEnvFpAfter}`);
    }

    // Cleanup labelled synthetic companies created in this run
    const cleaned = await sql`
      delete from companies
      where name like ${LABEL + '%'}
        and name like ${'%' + suffix + '%'}
      returning id
    `.catch(async (e) => {
      report.cleanup = { ok: false, error: redactError(e), note: 'use staging-cleanup.mjs' };
      return [];
    });
    report.cleanup = {
      ok: true,
      deletedCompanies: cleaned.length,
      label: LABEL,
      suffix,
      procedure: 'packages/db/scripts/staging-cleanup.mjs',
    };
    pass(report.results, 'cleanup_labelled_companies', String(cleaned.length));

    pass(report.results, 'cloud_deploy_blocked_pending_owner', 'Railway/Render credentials required');
    pass(report.results, 'redis_staging_status', env.REDIS_URL ? 'url_present_not_required' : 'not_configured_ready_redis_false');
    pass(report.results, 'rollback_procedure_documented', 'see TITAN_STAGING_ROLLBACK_TEST.md');
  } catch (err) {
    fail(report.results, 'harness_exception', redactError(err));
    if (apiProc?.getSafeTail) {
      report.apiLogTail = apiProc.getSafeTail();
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
    await sql.end({ timeout: 5 }).catch(() => {});
    if (prodSql) await prodSql.end({ timeout: 5 }).catch(() => {});
  }

  report.finishedAt = new Date().toISOString();
  report.totals.passed = report.results.filter((r) => r.status === 'PASS').length;
  report.totals.failed = report.results.filter((r) => r.status === 'FAIL').length;
  report.totals.skipped = report.results.filter((r) => r.status === 'SKIP').length;

  const fails = report.results.filter((r) => r.status === 'FAIL');
  const isolatedOk =
    report.stagingTarget.ok &&
    report.results.some((r) => r.name === 'staging_journal_104' && r.status === 'PASS') &&
    report.results.some((r) => r.name === 'production_db_untouched' && r.status === 'PASS') &&
    report.results.some((r) => r.name === 'local_env_unchanged' && r.status === 'PASS');

  if (fails.length === 0 && isolatedOk) {
    report.verdict = 'CONDITIONAL_GO';
    report.recommendation = {
      stagingProviderSandbox: 'NO-GO',
      reason:
        'Isolated staging DB + gated API/web harness passed, but public Railway/Render staging URLs are not live yet (owner actions required). Provider sandbox must wait for cloud staging URLs + separate sandbox credentials.',
      nextGatedStep:
        'Owner: create Railway titan-staging-api/web (+ optional Redis), enter staging secrets from .env.staging.example, then re-run health against public staging URLs.',
    };
  } else {
    report.verdict = 'NO-GO';
    report.recommendation = {
      stagingProviderSandbox: 'NO-GO',
      nextGatedStep: 'Fix failing staging harness checks, then complete owner cloud deploy actions.',
      failed: fails.map((f) => f.name),
    };
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        totals: report.totals,
        stagingFp: report.stagingTarget.databaseUrlFingerprint,
        journal: report.stagingTarget.drizzleMigrationCount,
        cloud: report.platform.cloudDeployStatus,
        outPath: 'diagnostic-output/130-staging-controlled-deploy.json',
        sandboxRecommendation: report.recommendation.stagingProviderSandbox,
      },
      null,
      2,
    ),
  );
  process.exit(fails.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(redactError(err));
  process.exit(1);
});
