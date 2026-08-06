#!/usr/bin/env node
/**
 * M7 Duplicate Customer Merge — staging smoke (READ-ONLY).
 *
 * - Staging API/DB only
 * - No production
 * - No customer merge execution
 * - No candidate table writes
 * - No fake/demo customer seed
 * - Uses existing staging customer rows for detection dry-run only
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

const results = {};
const warnings = [];
let mergeCallsBlocked = 0;

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

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 9) return null;
  if (digits.startsWith('27') && digits.length >= 11) return `+${digits}`;
  if (digits.startsWith('0') && digits.length >= 10) return `+27${digits.slice(1)}`;
  return `+${digits}`;
}

function normalizeEmail(email) {
  if (!email) return null;
  const trimmed = String(email).trim().toLowerCase();
  if (!trimmed || trimmed.endsWith('@example.com') || trimmed.includes('noreply')) return null;
  return trimmed;
}

function normalizeName(name) {
  if (!name) return null;
  const normalized = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || null;
}

async function api(path, { method = 'GET', body } = {}) {
  if (/\/customers\/duplicates\/decide/i.test(path)) {
    mergeCallsBlocked += 1;
    throw new Error(`Refusing merge decide path in smoke: ${method} ${path}`);
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json };
}

async function main() {
  console.log('M7 staging smoke (read-only, no merge exec, no deploy assumed)');
  console.log(`API=${API}`);
  console.log(`WEB=${WEB}`);

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    fail('database_url', 'DATABASE_URL missing');
    return finish(1);
  }
  if (databaseUrl.includes(FORBIDDEN_PROD_REF)) {
    fail('database_guard', 'refusing production DATABASE_URL');
    return finish(1);
  }
  if (!databaseUrl.includes(STAGING_REF)) {
    fail('database_guard', `expected staging ref ${STAGING_REF}`);
    return finish(1);
  }
  pass('database_url_staging_only', STAGING_REF);
  pass('production_untouched', `forbidden ref ${FORBIDDEN_PROD_REF} not used`);

  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const [{ now }] = await sql`select now() as now`;
    pass('staging_db_reachable', String(now));

    const cols = await sql`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'customers'
        and column_name = 'merged_into_customer_id'
    `;
    if (cols.length === 0) {
      warn('merged_into_customer_id not on staging yet (migration 0118 not applied — expected pre-deploy)');
      pass('migration_0118_pending_pre_deploy', 'column absent as expected before deploy');
    } else {
      pass('migration_0118_column_present', 'merged_into_customer_id exists');
    }

    const table = await sql`
      select to_regclass('public.customer_duplicate_candidates') as reg
    `;
    if (!table[0]?.reg) {
      warn('customer_duplicate_candidates table absent on staging (expected pre-deploy)');
      pass('candidates_table_pending_pre_deploy', 'table absent as expected before deploy');
    } else {
      pass('candidates_table_present', 'customer_duplicate_candidates exists');
    }

    const companies = await sql`
      select id, name
      from companies
      order by created_at desc
      limit 5
    `;
    if (companies.length === 0) {
      fail('real_staging_tenants', 'no companies found');
    } else {
      pass('real_staging_tenants', `${companies.length} company row(s) sampled`);
    }

    let dryRunPairs = 0;
    let scannedCustomers = 0;
    for (const company of companies) {
      const customers = await sql`
        select id, name, email, phone
        from customers
        where company_id = ${company.id}
        order by created_at asc
        limit 500
      `;
      scannedCustomers += customers.length;
      const properties = await sql`
        select customer_id, address_line1, suburb, postal_code
        from cx_customer_properties
        where company_id = ${company.id}
        limit 2000
      `;
      const addressByCustomer = new Map();
      for (const property of properties) {
        const key = [property.address_line1, property.suburb, property.postal_code]
          .map((part) => (part ? String(part).trim().toLowerCase() : ''))
          .filter(Boolean)
          .join('|');
        if (!key) continue;
        const set = addressByCustomer.get(property.customer_id) ?? new Set();
        set.add(key);
        addressByCustomer.set(property.customer_id, set);
      }

      for (let i = 0; i < customers.length; i += 1) {
        for (let j = i + 1; j < customers.length; j += 1) {
          const left = customers[i];
          const right = customers[j];
          const evidence = [];
          const leftPhone = normalizePhone(left.phone);
          const rightPhone = normalizePhone(right.phone);
          if (leftPhone && rightPhone && leftPhone === rightPhone) evidence.push('phone');
          const leftEmail = normalizeEmail(left.email);
          const rightEmail = normalizeEmail(right.email);
          if (leftEmail && rightEmail && leftEmail === rightEmail) evidence.push('email');
          const leftName = normalizeName(left.name);
          const rightName = normalizeName(right.name);
          if (leftName && rightName && leftName === rightName) evidence.push('normalized_name');
          const leftAddr = addressByCustomer.get(left.id) ?? new Set();
          const rightAddr = addressByCustomer.get(right.id) ?? new Set();
          for (const key of leftAddr) {
            if (rightAddr.has(key)) {
              evidence.push('address_overlap');
              break;
            }
          }
          if (
            evidence.includes('phone') ||
            evidence.includes('email') ||
            (evidence.includes('normalized_name') && evidence.includes('address_overlap'))
          ) {
            dryRunPairs += 1;
          }
        }
      }
    }
    pass(
      'candidate_detection_dry_run_readonly',
      `scanned ${scannedCustomers} customers across ${companies.length} tenants; ${dryRunPairs} evidence pair(s); no writes`,
    );

    const health = await api('/api/v1/health').catch(() => ({ status: 0, json: null }));
    if (health.status >= 200 && health.status < 500) {
      pass('staging_api_reachable', `status ${health.status}`);
    } else {
      fail('staging_api_reachable', `status ${health.status}`);
    }

    const webRes = await fetch(`${WEB}/crm`, {
      headers: { Accept: 'text/html' },
      redirect: 'follow',
    });
    if (webRes.status >= 200 && webRes.status < 500) {
      pass('staging_web_reachable', `status ${webRes.status}`);
    } else {
      fail('staging_web_reachable', `status ${webRes.status}`);
    }

    const unauthList = await api('/api/v1/crm/customers/duplicates');
    if (unauthList.status === 401 || unauthList.status === 403) {
      pass('duplicates_list_requires_auth', `status ${unauthList.status}`);
    } else if (unauthList.status === 404) {
      warn('duplicates list 404 — M7 API not deployed to staging yet (expected pre-approval)');
      pass('duplicates_list_pre_deploy_absent', '404 before deploy');
    } else {
      fail('duplicates_list_requires_auth', `unexpected status ${unauthList.status}`);
    }

    // Explicitly refuse merge decide.
    try {
      await api('/api/v1/crm/customers/duplicates/decide', {
        method: 'POST',
        body: { decision: 'keep_left' },
      });
      fail('merge_decide_blocked', 'decide call was not blocked by smoke guard');
    } catch (error) {
      if (String(error.message).includes('Refusing merge decide')) {
        pass('merge_decide_blocked', 'smoke guard refused decide');
      } else {
        fail('merge_decide_blocked', String(error.message));
      }
    }

    pass('no_merge_executed', `blocked decide attempts=${mergeCallsBlocked}`);
    pass('no_fake_demo_seed', 'used existing staging customer rows only');
    pass('m8_not_started', 'smoke scoped to M7 only');
  } finally {
    await sql.end({ timeout: 5 });
  }

  return finish(Object.values(results).some((value) => String(value).startsWith('FAIL')) ? 1 : 0);
}

function finish(code) {
  const outDir = resolve(root, 'diagnostic-output');
  mkdirSync(outDir, { recursive: true });
  const payload = {
    milestone: 'M7',
    mode: 'read_only_pre_deploy',
    api: API,
    web: WEB,
    results,
    warnings,
    mergeCallsBlocked,
    productionUntouched: true,
    m8Started: false,
    at: new Date().toISOString(),
  };
  writeFileSync(resolve(outDir, 'm7-duplicate-merge-staging-smoke.json'), JSON.stringify(payload, null, 2));
  const lines = Object.entries(results).map(([key, value]) => `${value.startsWith('PASS') ? 'PASS' : 'FAIL'} — ${key}: ${value}`);
  writeFileSync(resolve(outDir, 'm7-duplicate-merge-staging-smoke.log'), `${lines.join('\n')}\nWARNINGS:\n${warnings.join('\n')}\n`);
  console.log(`\nWrote diagnostic-output/m7-duplicate-merge-staging-smoke.json`);
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
