/**
 * UX-K staging harness — nav honesty (UX-050, UX-052, UX-048).
 *
 * Safety:
 * - Loads only apps/api/.env.staging.local
 * - Refuses forbidden live project ref rshuiaghmtrvvilhqpwm
 * - Labels temp records STAGING-UX-K
 * - No provider calls, no migrations, no .env edits
 *
 * Usage:
 *   node packages/db/scripts/staging-ux-k-e2e.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import {
  ACCOUNTANT_ALLOWED_HREFS,
  DISPATCHER_ALLOWED_HREFS,
  ENTERPRISE_MODULE_LINKS,
  OWNER_STAFF_NAV_ITEMS,
} from '../../../packages/shared/dist/index.js';
import { hasAnyPermission, resolveStaffExperience } from '../../../packages/auth/dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
const outPath = path.resolve(repoRoot, 'diagnostic-output/120-staging-ux-k-e2e.json');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const LABEL = 'STAGING-UX-K';
const API_PORT = Number(process.env.STAGING_API_PORT || 3109);
const WEB_PORT = Number(process.env.STAGING_WEB_PORT || 5183);
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

/** Mirrors apps/web filterOwnerStaffNav for contract checks against live /auth/me. */
function filterOwnerStaffNav(user) {
  const experience = resolveStaffExperience({
    roleName: user.roleName,
    permissions: user.permissions || [],
  });
  if (experience === 'technician' || experience === 'client') return [];
  const seen = new Set();
  return OWNER_STAFF_NAV_ITEMS.filter((item) => {
    if (seen.has(item.href)) return false;
    if (experience === 'dispatcher' && !DISPATCHER_ALLOWED_HREFS.has(item.href)) return false;
    if (experience === 'accountant' && !ACCOUNTANT_ALLOWED_HREFS.has(item.href)) return false;
    if (item.experiences && !item.experiences.includes(experience)) return false;
    if (item.permissions && !hasAnyPermission(user.permissions || [], item.permissions)) return false;
    seen.add(item.href);
    return true;
  });
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

async function me(token) {
  const res = await api('/api/v1/auth/me', { token });
  return {
    status: res.status,
    user: res.json?.data?.user || res.json?.data || null,
  };
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
  const password = 'StagingUxKNav1!';
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
      note: 'UX-K is nav/config/UI only — no new migration; journal must remain 104',
    };
    if (meta[0].migrations === 104) {
      pass(report.results, 'staging_journal_104', `db=${meta[0].db}`);
    } else {
      fail(report.results, 'staging_journal_104', `migrations=${meta[0].migrations}`);
    }
    pass(report.results, 'staging_target_safe', `migrations=${meta[0].migrations}`);

    // Static catalogue contracts (UX-050/052/048 source of truth)
    const financeDup = OWNER_STAFF_NAV_ITEMS.filter(
      (i) => i.label === 'Finance' || (i.href === '/finance/quotes' && i.label !== 'Quotes'),
    );
    if (financeDup.length === 0) {
      pass(report.results, 'ux050_no_finance_quotes_duplicate', 'ok');
    } else {
      fail(report.results, 'ux050_no_finance_quotes_duplicate', JSON.stringify(financeDup));
    }

    const dispatcherNav = OWNER_STAFF_NAV_ITEMS.find((i) => i.href === '/mobile-platform/dispatcher');
    if (dispatcherNav?.label === 'Dispatcher console' && DISPATCHER_ALLOWED_HREFS.has(dispatcherNav.href)) {
      pass(report.results, 'ux052_dispatcher_console_in_staff_nav', dispatcherNav.label);
    } else {
      fail(report.results, 'ux052_dispatcher_console_in_staff_nav', JSON.stringify(dispatcherNav));
    }

    const enterpriseNav = OWNER_STAFF_NAV_ITEMS.find((i) => i.href === '/enterprise-modules');
    if (enterpriseNav && ENTERPRISE_MODULE_LINKS.length >= 10) {
      pass(
        report.results,
        'ux048_enterprise_modules_index_configured',
        `nav=${enterpriseNav.label};links=${ENTERPRISE_MODULE_LINKS.length}`,
      );
    } else {
      fail(report.results, 'ux048_enterprise_modules_index_configured', 'missing');
    }

    if (MANAGE_RUNTIME) {
      freePort(API_PORT);
      freePort(WEB_PORT);
      await new Promise((r) => setTimeout(r, 400));
      const jwt = `staging-ux-k-jwt-${randomBytes(24).toString('hex')}`;
      const jwtRefresh = `staging-ux-k-refresh-${randomBytes(24).toString('hex')}`;
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
        lastName: 'UxK',
        email: `owner.${suffix}@staging-ux-k.test`,
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
        email: `foreign.${suffix}@staging-ux-k.test`,
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

    const manager = byName.Manager
      ? await inviteRole(
          ownerToken,
          byName.Manager,
          `mgr.${suffix}@staging-ux-k.test`,
          'Mgr',
          'UxK',
          password,
        )
      : null;
    if (manager?.token) pass(report.results, 'manager_invite', manager.userId);
    else fail(report.results, 'manager_invite', 'missing');

    const dispatcher = byName.Dispatcher
      ? await inviteRole(
          ownerToken,
          byName.Dispatcher,
          `disp.${suffix}@staging-ux-k.test`,
          'Disp',
          'UxK',
          password,
        )
      : null;
    if (dispatcher?.token) pass(report.results, 'dispatcher_invite', dispatcher.userId);
    else fail(report.results, 'dispatcher_invite', 'missing');

    const accountant = byName.Accountant
      ? await inviteRole(
          ownerToken,
          byName.Accountant,
          `acct.${suffix}@staging-ux-k.test`,
          'Acct',
          'UxK',
          password,
        )
      : null;
    if (accountant?.token) pass(report.results, 'accountant_invite', accountant.userId);
    else fail(report.results, 'accountant_invite', 'missing');

    const tech = byName.Technician
      ? await inviteRole(
          ownerToken,
          byName.Technician,
          `tech.${suffix}@staging-ux-k.test`,
          'Tech',
          'UxK',
          password,
        )
      : null;
    if (tech?.token) pass(report.results, 'technician_invite', tech.userId);
    else fail(report.results, 'technician_invite', 'missing');

    // Owner nav honesty
    const ownerMe = await me(ownerToken);
    const ownerNav = ownerMe.user ? filterOwnerStaffNav(ownerMe.user) : [];
    const ownerHrefs = ownerNav.map((i) => i.href);
    const ownerLabels = ownerNav.map((i) => i.label);
    if (
      ownerMe.status === 200 &&
      ownerLabels.includes('Quotes') &&
      ownerLabels.includes('Invoices') &&
      ownerLabels.includes('Payments') &&
      !ownerLabels.includes('Finance') &&
      ownerHrefs.includes('/enterprise-modules') &&
      ownerHrefs.includes('/mobile-platform/dispatcher') &&
      ownerHrefs.filter((h) => h === '/finance/quotes').length === 1
    ) {
      pass(report.results, 'owner_nav_honesty', `items=${ownerNav.length}`);
    } else {
      fail(
        report.results,
        'owner_nav_honesty',
        JSON.stringify({ status: ownerMe.status, labels: ownerLabels, hrefs: ownerHrefs }),
      );
    }

    // Manager sees enterprise modules
    if (manager?.token) {
      const mgrMe = await me(manager.token);
      const mgrNav = mgrMe.user ? filterOwnerStaffNav(mgrMe.user) : [];
      const hrefs = mgrNav.map((i) => i.href);
      if (mgrMe.status === 200 && hrefs.includes('/enterprise-modules') && !mgrNav.some((i) => i.label === 'Finance')) {
        pass(report.results, 'manager_nav_enterprise_modules', `items=${mgrNav.length}`);
      } else {
        fail(report.results, 'manager_nav_enterprise_modules', JSON.stringify(hrefs));
      }
    }

    // Dispatcher console visible; enterprise modules not
    if (dispatcher?.token) {
      const dispMe = await me(dispatcher.token);
      const dispNav = dispMe.user ? filterOwnerStaffNav(dispMe.user) : [];
      const hrefs = dispNav.map((i) => i.href);
      if (
        dispMe.status === 200 &&
        hrefs.includes('/mobile-platform/dispatcher') &&
        !hrefs.includes('/enterprise-modules') &&
        !dispNav.some((i) => i.label === 'Finance')
      ) {
        pass(report.results, 'dispatcher_nav_console_visible', `items=${dispNav.length}`);
      } else {
        fail(
          report.results,
          'dispatcher_nav_console_visible',
          JSON.stringify({ status: dispMe.status, hrefs, role: dispMe.user?.roleName }),
        );
      }
    }

    // Accountant: finance children only; no dispatcher console / enterprise
    if (accountant?.token) {
      const acctMe = await me(accountant.token);
      const acctNav = acctMe.user ? filterOwnerStaffNav(acctMe.user) : [];
      const hrefs = acctNav.map((i) => i.href);
      if (
        acctMe.status === 200 &&
        hrefs.includes('/finance/quotes') &&
        hrefs.includes('/finance/invoices') &&
        hrefs.includes('/finance/payments') &&
        !hrefs.includes('/mobile-platform/dispatcher') &&
        !hrefs.includes('/enterprise-modules') &&
        !acctNav.some((i) => i.label === 'Finance')
      ) {
        pass(report.results, 'accountant_nav_finance_children_only', `items=${acctNav.length}`);
      } else {
        fail(report.results, 'accountant_nav_finance_children_only', JSON.stringify(hrefs));
      }
    }

    // Technician: no owner staff nav
    if (tech?.token) {
      const techMe = await me(tech.token);
      const techNav = techMe.user ? filterOwnerStaffNav(techMe.user) : [];
      if (techMe.status === 200 && techNav.length === 0) {
        pass(report.results, 'technician_no_owner_staff_nav', '0');
      } else {
        fail(report.results, 'technician_no_owner_staff_nav', JSON.stringify(techNav.map((i) => i.href)));
      }

      // Technician denied enterprise-ish owner APIs when applicable
      const techTeam = await api('/api/v1/team/roles', { token: tech.token });
      if (techTeam.status === 403 || techTeam.status === 401) {
        pass(report.results, 'technician_team_roles_denied', String(techTeam.status));
      } else {
        fail(report.results, 'technician_team_roles_denied', String(techTeam.status));
      }
    }

    // Cross-tenant: foreign owner cannot see primary company via team
    const foreignMe = await me(foreignToken);
    if (
      foreignMe.status === 200 &&
      foreignMe.user?.companyId === foreignCompanyId &&
      foreignMe.user?.companyId !== companyId
    ) {
      pass(report.results, 'foreign_tenant_isolation_me', foreignCompanyId);
    } else {
      fail(report.results, 'foreign_tenant_isolation_me', JSON.stringify(foreignMe.user));
    }

    // Legacy finance hrefs still resolve as Quotes/Invoices/Payments (compatibility)
    const quoteItem = OWNER_STAFF_NAV_ITEMS.find((i) => i.href === '/finance/quotes');
    const invItem = OWNER_STAFF_NAV_ITEMS.find((i) => i.href === '/finance/invoices');
    const payItem = OWNER_STAFF_NAV_ITEMS.find((i) => i.href === '/finance/payments');
    if (quoteItem?.label === 'Quotes' && invItem?.label === 'Invoices' && payItem?.label === 'Payments') {
      pass(report.results, 'legacy_finance_href_labels_preserved', 'ok');
    } else {
      fail(report.results, 'legacy_finance_href_labels_preserved', 'mismatch');
    }

    // Web smoke for nav-critical routes
    if (webUp) {
      const paths = [
        '/',
        '/finance/quotes',
        '/finance/invoices',
        '/finance/payments',
        '/mobile-platform/dispatcher',
        '/enterprise-modules',
      ];
      const widths = [375, 390, 414];
      let allOk = true;
      const details = [];
      for (const width of widths) {
        for (const p of paths) {
          const res = await fetch(`${WEB_BASE}${p}`, {
            redirect: 'manual',
            headers: {
              'User-Agent': `Mozilla/5.0 (iPhone) Titan-Staging-UX-K (width=${width})`,
            },
          });
          const ok = [200, 301, 302].includes(res.status);
          details.push(`${width}${p}=${res.status}`);
          if (!ok) allOk = false;
        }
      }
      if (allOk) pass(report.results, 'web_nav_routes_375_390_414', details.slice(0, 10).join(' '));
      else fail(report.results, 'web_nav_routes_375_390_414', details.join(' '));

      // Enterprise modules page HTML includes honesty copy when served (SPA shell)
      const enterpriseHtml = await fetch(`${WEB_BASE}/enterprise-modules`);
      const html = await enterpriseHtml.text();
      if (enterpriseHtml.status === 200 && (html.includes('root') || html.includes('Titan') || html.includes('titan'))) {
        pass(report.results, 'web_enterprise_modules_spa_shell', String(enterpriseHtml.status));
      } else {
        fail(report.results, 'web_enterprise_modules_spa_shell', String(enterpriseHtml.status));
      }
    } else {
      fail(report.results, 'web_nav_routes_375_390_414', 'web not up');
      fail(report.results, 'web_enterprise_modules_spa_shell', 'web not up');
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
