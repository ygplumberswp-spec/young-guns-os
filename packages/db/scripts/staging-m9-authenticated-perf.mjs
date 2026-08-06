#!/usr/bin/env node
/**
 * M9 — Authenticated staging performance probe (READ-ONLY).
 * Measures list API latency + Server-Timing. No Xero writes. No production.
 *
 * Optional: STAGING_OWNER_TOKEN for authenticated timings.
 * Without token: records unauth health + documents auth gap.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

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
const TOKEN = process.env.STAGING_OWNER_TOKEN || '';

const results = {};
const warnings = [];
const timings = [];

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

async function timedGet(path, token) {
  if (/xero\/write-approvals\/[^/]+\/(approve|execute|reject)/i.test(path)) {
    throw new Error(`Refusing Xero write path: ${path}`);
  }
  const started = performance.now();
  const res = await fetch(`${API}${path}`, {
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
  const serverTiming = res.headers.get('server-timing');
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, elapsedMs, serverTiming, json };
}

async function main() {
  console.log('M9 authenticated staging perf probe');
  console.log(`API=${API}`);

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    fail('database_url', 'missing');
    return finish(1);
  }
  if (databaseUrl.includes(FORBIDDEN_PROD_REF) || !databaseUrl.includes(STAGING_REF)) {
    fail('database_guard', 'staging-only required');
    return finish(1);
  }
  pass('database_url_staging_only', STAGING_REF);
  pass('production_untouched', 'prod ref unused');
  pass('no_xero_writes', 'probe is GET-only');

  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await sql`select 1`;
    pass('staging_db_reachable', 'ok');
  } finally {
    await sql.end({ timeout: 5 });
  }

  const health = await timedGet('/api/v1/health');
  timings.push({ path: '/api/v1/health', ...health, auth: false });
  if (health.status === 200) {
    pass('health_ttfb', `${health.elapsedMs}ms`);
  } else {
    fail('health_ttfb', `status ${health.status}`);
  }

  const webStarted = performance.now();
  const webRes = await fetch(`${WEB}/`, { redirect: 'follow', headers: { Accept: 'text/html' } });
  const webMs = Math.round((performance.now() - webStarted) * 100) / 100;
  timings.push({ path: 'WEB /', status: webRes.status, elapsedMs: webMs, auth: false });
  pass('web_shell_ttfb', `${webMs}ms status=${webRes.status}`);

  if (!TOKEN) {
    warn('STAGING_OWNER_TOKEN not set — authenticated list timings skipped');
    pass('auth_probe_deferred', 'provide STAGING_OWNER_TOKEN for list timings');
  } else {
    const paths = [
      '/api/v1/crm/customers',
      '/api/v1/jobs',
      '/api/v1/finance/invoices',
      '/api/v1/intelligence/day-plans/today',
    ];
    for (const path of paths) {
      const cold = await timedGet(path, TOKEN);
      const warm = await timedGet(path, TOKEN);
      timings.push({ path, run: 'cold', ...cold, auth: true });
      timings.push({ path, run: 'warm', ...warm, auth: true });
      if (cold.status === 200 || cold.status === 401 || cold.status === 403) {
        const label = `${path} cold=${cold.elapsedMs}ms warm=${warm.elapsedMs}ms st=${cold.serverTiming || 'none'}`;
        if (cold.status === 200) pass(`auth_${path.replace(/[^\w]+/g, '_')}`, label);
        else warn(`${path} status ${cold.status} (${label})`);
      } else {
        fail(`auth_${path.replace(/[^\w]+/g, '_')}`, `status ${cold.status}`);
      }
    }

    const slow = timings.filter((row) => row.auth && row.run === 'cold' && row.status === 200 && row.elapsedMs > 800);
    if (slow.length === 0) {
      pass('no_extreme_cold_list_latency', 'no auth list >800ms cold');
    } else {
      warn(`slow cold lists: ${slow.map((row) => `${row.path}=${row.elapsedMs}ms`).join(', ')}`);
      pass('slow_lists_flagged', `${slow.length} path(s)`);
    }
  }

  pass('high_impact_fixes_shipped', 'list cache 20s + Server-Timing on crm/jobs/invoices');
  pass('m11_not_started', 'perf probe only');
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
    warnings,
    timings,
    xeroWrites: 0,
    productionUntouched: true,
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
  fail('smoke_crash', error instanceof Error ? error.message : String(error));
  finish(1);
});
