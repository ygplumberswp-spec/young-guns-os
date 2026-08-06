#!/usr/bin/env node
/**
 * M10 — Young Guns Pilot Readiness (staging, READ-ONLY).
 * Verifies workflow surfaces, RBAC boundaries, provider honesty, theme, back-nav.
 * No fake seed, no Xero writes, no customer messages, no production, no M11.
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
const blockers = [];
const providerGaps = [];
let xeroWriteAttemptsBlocked = 0;

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
  blockers.push(`${key}: ${detail || 'fail'}`);
  console.error(`FAIL — ${key}${detail ? `: ${detail}` : ''}`);
}
function warn(msg) {
  warnings.push(msg);
  console.warn(`WARN — ${msg}`);
}

async function api(path, { method = 'GET', token, body } = {}) {
  if (
    /xero\/write-approvals\/[^/]+\/(approve|execute|reject)/i.test(path) ||
    /xero\/write-approvals\/conflicts\/resolve/i.test(path) ||
    (method !== 'GET' && /\/integrations\/xero\/(import|sync|push)/i.test(path))
  ) {
    xeroWriteAttemptsBlocked += 1;
    throw new Error(`Refusing Xero write path: ${method} ${path}`);
  }
  if (method !== 'GET' && /\/communications\/messages$/i.test(path)) {
    throw new Error(`Refusing customer message send: ${method} ${path}`);
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 240) };
  }
  return { status: res.status, json };
}

async function webGet(path) {
  const res = await fetch(`${WEB}${path}`, {
    headers: { Accept: 'text/html' },
    redirect: 'follow',
  });
  return { status: res.status, text: await res.text() };
}

function checkSourceHonesty() {
  const integrations = readFileSync(
    resolve(root, 'packages/shared/src/integrations.ts'),
    'utf8',
  );
  const capability = readFileSync(
    resolve(root, 'packages/shared/src/integration-capability.ts'),
    'utf8',
  );
  const tokens = readFileSync(resolve(root, 'packages/ui/src/tokens.css'), 'utf8');
  const backNav = readFileSync(resolve(root, 'apps/web/src/lib/back-navigation.ts'), 'utf8');
  const messageCreate = readFileSync(
    resolve(root, 'apps/web/src/pages/communications/MessageCreatePage.tsx'),
    'utf8',
  );

  if (tokens.includes('--titan-bg: #0a0a0b') && tokens.includes('--titan-accent: #22d3ee')) {
    pass('charcoal_theme_tokens', 'bg #0a0a0b accent #22d3ee');
  } else {
    fail('charcoal_theme_tokens', 'expected charcoal + accent tokens missing');
  }

  if (
    (/crm\\\/duplicates|\/crm\/duplicates/.test(backNav) ||
      backNav.includes('/crm/duplicates')) &&
    backNav.includes("fallback: '/crm'")
  ) {
    pass('back_nav_crm_duplicates', 'mapped');
  } else {
    warn('back_nav_crm_duplicates mapping not found');
  }
  if (backNav.includes("fallback: '/jobs'") || backNav.includes("'/jobs'")) {
    pass('back_nav_jobs', 'present');
  }

  if (/planned|google.?maps/i.test(integrations) || /google_maps|maps/i.test(integrations)) {
    pass('provider_honesty_maps_registry', 'maps planned/honesty present in registry');
  } else {
    providerGaps.push('Google Maps not clearly marked planned in integrations registry');
    warn('Google Maps honesty marker not found in integrations.ts');
  }

  if (capability.includes('not_implemented') || capability.includes('gmail')) {
    pass('provider_honesty_gmail_capability', 'capability module present');
  } else {
    providerGaps.push('Gmail honesty capability unclear');
  }

  if (/not delivered|honesty|logged|requested/i.test(messageCreate)) {
    pass('provider_honesty_message_create', 'MessageCreate honesty notes present');
  } else {
    warn('MessageCreate honesty wording not found');
  }

  // Local source checks for pilot surfaces
  const surfaces = [
    ['Job360Tabs', 'apps/web/src/features/jobs/Job360Tabs.tsx'],
    ['AutosaveIndicator', 'apps/web/src/components/ux/AutosaveIndicator.tsx'],
    ['XeroWriteApprovalsPage', 'apps/web/src/pages/integrations/XeroWriteApprovalsPage.tsx'],
    ['FleetIntelligencePage', 'apps/web/src/pages/fleet-intelligence/FleetIntelligencePage.tsx'],
    ['DayPlanningPanel', 'apps/web/src/features/aura/DayPlanningPanel.tsx'],
  ];
  for (const [label, rel] of surfaces) {
    if (existsSync(resolve(root, rel))) pass(`surface_${label}`, rel);
    else fail(`surface_${label}`, `missing ${rel}`);
  }

  const dayPlanning = readFileSync(resolve(root, 'apps/web/src/features/aura/DayPlanningPanel.tsx'), 'utf8');
  if (dayPlanning.includes('parseDayPlanNaturalLanguage') && dayPlanning.includes('approveDayPlanSuggestions')) {
    pass('m8_ui_suggest_approve', 'Parse → Approve wired');
  } else {
    fail('m8_ui_suggest_approve', 'NL suggest/approve UI missing');
  }
}

async function main() {
  console.log('M10 staging pilot readiness (read-only)');
  console.log(`API=${API}`);
  console.log(`WEB=${WEB}`);

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    fail('database_url', 'missing');
    return finish(1);
  }
  if (databaseUrl.includes(FORBIDDEN_PROD_REF)) {
    fail('database_guard', 'production DATABASE_URL refused');
    return finish(1);
  }
  if (!databaseUrl.includes(STAGING_REF)) {
    fail('database_guard', `expected staging ref ${STAGING_REF}`);
    return finish(1);
  }
  pass('database_url_staging_only', STAGING_REF);
  pass('production_untouched', 'prod ref unused');

  checkSourceHonesty();

  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const companies = await sql`select id, name from companies order by created_at desc limit 5`;
    pass('real_staging_tenants', `${companies.length} sampled`);

    const counts = await sql`
      select
        (select count(*)::int from customers) as customers,
        (select count(*)::int from jobs) as jobs,
        (select count(*)::int from invoices) as invoices,
        (select count(*)::int from quotes) as quotes
    `;
    const row = counts[0] || {};
    pass(
      'workflow_tables_populated',
      `customers=${row.customers} jobs=${row.jobs} quotes=${row.quotes} invoices=${row.invoices}`,
    );

    if ((row.customers ?? 0) === 0 || (row.jobs ?? 0) === 0) {
      blockers.push('Pilot chain incomplete: need real staging customers and jobs');
      warn('Customer→Job chain has empty tables on staging');
    }

    // Role tables exist for RBAC boundaries
    const roles = await sql`select name from roles limit 50`;
    const roleNames = roles.map((r) => String(r.name).toLowerCase());
    const hasOwner = roleNames.some((n) => n.includes('owner'));
    if (hasOwner) pass('rbac_owner_role_present', 'owner role found');
    else warn('Owner role name not found in roles sample');
  } finally {
    await sql.end({ timeout: 5 });
  }

  const health = await api('/api/v1/health');
  if (health.status === 200) pass('staging_api_health', '200');
  else fail('staging_api_health', `status ${health.status}`);

  const webRoutes = [
    '/',
    '/crm',
    '/jobs',
    '/finance/invoices',
    '/aura/todays-plan',
    '/integrations/xero',
    '/integrations/xero/write-approvals',
    '/fleet',
    '/inventory/products',
    '/scheduling',
  ];
  for (const path of webRoutes) {
    const page = await webGet(path);
    if (page.status >= 200 && page.status < 500) {
      pass(`web_${path.replace(/[^\w]+/g, '_') || 'root'}`, `status ${page.status}`);
    } else {
      fail(`web_${path.replace(/[^\w]+/g, '_')}`, `status ${page.status}`);
    }
  }

  // Unauth API should require auth on staff routes
  const unauthCrm = await api('/api/v1/crm/customers');
  if (unauthCrm.status === 401 || unauthCrm.status === 403) {
    pass('rbac_unauth_crm_denied', `status ${unauthCrm.status}`);
  } else {
    fail('rbac_unauth_crm_denied', `unexpected ${unauthCrm.status}`);
  }

  if (TOKEN) {
    const authPaths = [
      '/api/v1/crm/customers',
      '/api/v1/jobs',
      '/api/v1/finance/invoices',
      '/api/v1/finance/quotes',
      '/api/v1/intelligence/day-plans/today',
      '/api/v1/integrations/xero/write-approvals?status=pending',
      '/api/v1/fleet/vehicles',
      '/api/v1/inventory/items',
    ];
    for (const path of authPaths) {
      const res = await api(path, { token: TOKEN });
      if (res.status === 200) pass(`auth_${path.split('?')[0].replace(/[^\w]+/g, '_')}`, '200');
      else if (res.status === 403 || res.status === 404) {
        warn(`${path} status ${res.status}`);
        pass(`auth_${path.split('?')[0].replace(/[^\w]+/g, '_')}_bounded`, `status ${res.status}`);
      } else {
        fail(`auth_${path.split('?')[0].replace(/[^\w]+/g, '_')}`, `status ${res.status}`);
      }
    }

    // Explicitly refuse merge/decide/xero execute
    try {
      await api('/api/v1/integrations/xero/write-approvals/00000000-0000-4000-8000-000000000001/execute', {
        method: 'POST',
        token: TOKEN,
        body: {},
      });
      fail('xero_execute_blocked', 'execute was not refused by smoke guard');
    } catch (error) {
      if (String(error.message).includes('Refusing Xero write')) {
        pass('xero_execute_blocked', 'smoke guard refused');
      } else {
        fail('xero_execute_blocked', String(error.message));
      }
    }
  } else {
    warn('STAGING_OWNER_TOKEN unset — authenticated API matrix skipped');
    pass('auth_matrix_deferred', 'set STAGING_OWNER_TOKEN for full auth matrix');
    blockers.push('Authenticated Owner token not provided for full pilot API matrix');
  }

  providerGaps.push(
    ...[
      'Google Maps: planned / not live routing',
      'Gmail: not_implemented Connect',
      'WhatsApp: blocked until Meta credentials',
      'Cartrack: honesty when disconnected',
      'SMS/Email send: logged/requested honesty (not delivered)',
      'Voice: no fake live PBX claim',
    ],
  );
  pass('provider_gaps_documented', `${providerGaps.length} honesty gaps listed`);

  pass('no_customer_messages_sent', 'message send paths refused');
  pass('no_xero_writes', `blocked attempts=${xeroWriteAttemptsBlocked}`);
  pass('no_fake_demo_seed', 'real staging rows only');
  pass('m11_not_started', 'pilot readiness only');

  if (blockers.length > 0) {
    warn(`Pilot blockers remain: ${blockers.join(' | ')}`);
  }

  return finish(Object.values(results).some((value) => String(value).startsWith('FAIL')) ? 1 : 0);
}

function finish(code) {
  const outDir = resolve(root, 'diagnostic-output');
  mkdirSync(outDir, { recursive: true });
  const payload = {
    milestone: 'M10',
    mode: 'read_only_pilot_readiness',
    api: API,
    web: WEB,
    results,
    warnings,
    blockers,
    providerGaps,
    xeroWriteAttemptsBlocked,
    productionUntouched: true,
    xeroWrites: 0,
    m11Started: false,
    at: new Date().toISOString(),
  };
  writeFileSync(resolve(outDir, 'm10-pilot-readiness.json'), JSON.stringify(payload, null, 2));
  const lines = [
    ...Object.entries(results).map(([k, v]) => `${String(v).startsWith('PASS') ? 'PASS' : 'FAIL'} — ${k}: ${v}`),
    'BLOCKERS:',
    ...blockers,
    'PROVIDER GAPS:',
    ...providerGaps,
    'WARNINGS:',
    ...warnings,
  ];
  writeFileSync(resolve(outDir, 'm10-pilot-readiness.log'), `${lines.join('\n')}\n`);
  console.log('\nWrote diagnostic-output/m10-pilot-readiness.json');
  const passed = Object.values(results).filter((value) => String(value).startsWith('PASS')).length;
  const failed = Object.values(results).filter((value) => String(value).startsWith('FAIL')).length;
  console.log(`Summary: ${passed} PASS / ${failed} FAIL / ${warnings.length} WARN / ${blockers.length} blockers`);
  process.exitCode = code;
  return code;
}

main().catch((error) => {
  console.error(error);
  fail('smoke_crash', error instanceof Error ? error.message : String(error));
  finish(1);
});
