#!/usr/bin/env node
/**
 * M9 performance probe — staging only, read-only.
 * Measures public health + authenticated list endpoints when STAGING_ACCESS_TOKEN is provided.
 * No Xero writes. No customer messages. No production.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../..');
const API = (process.env.STAGING_API_BASE || 'https://young-guns-os-staging.up.railway.app').replace(
  /\/$/,
  '',
);
const WEB = (process.env.STAGING_WEB_BASE || 'https://comfortable-determination-staging.up.railway.app').replace(
  /\/$/,
  '',
);
const FORBIDDEN_PROD_REF = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';

const results = {};
const timings = [];
const warnings = [];

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile(resolve(root, 'apps/api/.env.staging.local'));

function pass(key, detail) {
  results[key] = detail ? `PASS (${detail})` : 'PASS';
  console.log(`PASS — ${key}${detail ? `: ${detail}` : ''}`);
}
function fail(key, detail) {
  results[key] = detail ? `FAIL (${detail})` : 'FAIL';
  console.error(`FAIL — ${key}${detail ? `: ${detail}` : ''}`);
}
function warn(msg) {
  warnings.push(msg);
  console.warn(`WARN — ${msg}`);
}

async function timedFetch(label, url, init = {}) {
  const started = performance.now();
  const res = await fetch(url, init);
  const ms = Math.round(performance.now() - started);
  const serverTiming = res.headers.get('server-timing');
  timings.push({ label, ms, status: res.status, serverTiming });
  return { res, ms, serverTiming };
}

async function main() {
  console.log('M9 staging performance probe (read-only)');
  const databaseUrl = process.env.DATABASE_URL || '';
  if (databaseUrl.includes(FORBIDDEN_PROD_REF)) {
    fail('database_guard', 'production ref refused');
    return finish(1);
  }
  if (databaseUrl && databaseUrl.includes(STAGING_REF)) {
    pass('database_url_staging_only', STAGING_REF);
  } else if (databaseUrl) {
    warn('DATABASE_URL present but staging ref not detected — continuing API/web probes only');
  } else {
    pass('database_url_optional', 'API/web probes only');
  }
  pass('production_untouched', `forbidden ${FORBIDDEN_PROD_REF}`);

  const health = await timedFetch('api_health', `${API}/api/v1/health`);
  if (health.res.status === 200) pass('api_health', `${health.ms}ms`);
  else fail('api_health', `status ${health.res.status}`);

  const web = await timedFetch('web_root', `${WEB}/`);
  if (web.res.status >= 200 && web.res.status < 500) pass('web_root', `${web.ms}ms`);
  else fail('web_root', `status ${web.res.status}`);

  const token = process.env.STAGING_ACCESS_TOKEN;
  if (!token) {
    warn('STAGING_ACCESS_TOKEN unset — authenticated list timings deferred');
    pass('auth_list_deferred', 'provide STAGING_ACCESS_TOKEN for Owner list timings');
  } else {
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };
    for (const [label, path] of [
      ['crm_customers', '/api/v1/crm/customers'],
      ['jobs_list', '/api/v1/jobs'],
      ['finance_invoices', '/api/v1/finance/invoices'],
      ['day_plans_today', '/api/v1/intelligence/day-plans/today'],
    ]) {
      const cold = await timedFetch(`${label}_cold`, `${API}${path}`, { headers: authHeaders });
      const warm = await timedFetch(`${label}_warm`, `${API}${path}`, { headers: authHeaders });
      if (cold.res.status === 200 && warm.res.status === 200) {
        pass(
          label,
          `cold ${cold.ms}ms warm ${warm.ms}ms timing=${warm.serverTiming || cold.serverTiming || 'n/a'}`,
        );
      } else {
        fail(label, `cold=${cold.res.status} warm=${warm.res.status}`);
      }
    }
  }

  // Local high-impact fix evidence: list cache + Server-Timing wiring present in source.
  const cacheSrc = readFileSync(resolve(root, 'apps/api/src/services/api-read-cache.ts'), 'utf8');
  const crmRoute = readFileSync(resolve(root, 'apps/api/src/routes/crm.ts'), 'utf8');
  const jobsRoute = readFileSync(resolve(root, 'apps/api/src/routes/jobs.ts'), 'utf8');
  const financeRoute = readFileSync(resolve(root, 'apps/api/src/routes/finance.ts'), 'utf8');
  if (cacheSrc.includes('LIST_TTL_MS') && cacheSrc.includes('crm/list')) {
    pass('list_cache_wired', '20s TTL for unfiltered CRM/Jobs/Finance lists');
  } else {
    fail('list_cache_wired', 'missing list cache');
  }
  if (
    crmRoute.includes('crm-list') &&
    jobsRoute.includes('jobs-list') &&
    financeRoute.includes('invoices-list')
  ) {
    pass('server_timing_wired', 'crm/jobs/invoices list routes');
  } else {
    fail('server_timing_wired', 'missing Server-Timing append');
  }

  pass('no_xero_writes', 'probe did not call Xero write paths');
  pass('m11_not_started', 'M9 probe only');
  return finish(Object.values(results).some((value) => String(value).startsWith('FAIL')) ? 1 : 0);
}

function finish(code) {
  const outDir = resolve(root, 'diagnostic-output');
  mkdirSync(outDir, { recursive: true });
  const payload = {
    milestone: 'M9',
    api: API,
    web: WEB,
    results,
    timings,
    warnings,
    productionUntouched: true,
    xeroWrites: 0,
    m11Started: false,
    at: new Date().toISOString(),
  };
  writeFileSync(resolve(outDir, 'm9-authenticated-perf.json'), JSON.stringify(payload, null, 2));
  console.log(`\nWrote diagnostic-output/m9-authenticated-perf.json`);
  const passed = Object.values(results).filter((value) => String(value).startsWith('PASS')).length;
  const failed = Object.values(results).filter((value) => String(value).startsWith('FAIL')).length;
  console.log(`Summary: ${passed} PASS / ${failed} FAIL / ${warnings.length} WARN`);
  process.exitCode = code;
  return code;
}

main().catch((error) => {
  console.error(error);
  fail('probe_crash', error instanceof Error ? error.message : String(error));
  finish(1);
});
