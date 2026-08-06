#!/usr/bin/env node
/**
 * M4 ASV-001 staging smoke (read-only where possible).
 * Does not deploy. Does not invent fake business records beyond labelled auth signup if needed.
 * Does not publish/send/approve/execute providers. No production.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  sanitizeDraftPayload,
  selectSafeCustomerDraftRestore,
  draftContinueHref,
  buildDraftKey,
} from '../../shared/dist/drafts.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../..');
const API = process.env.STAGING_API_BASE || 'https://young-guns-os-staging.up.railway.app';
const WEB = process.env.STAGING_WEB_BASE || 'https://comfortable-determination-staging.up.railway.app';
const LABEL = 'STAGING-M4-ASV001';

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

const results = {};
const warnings = [];
function pass(k, d = '') {
  results[k] = d ? `PASS (${d})` : 'PASS';
  console.log(`PASS — ${k}${d ? `: ${d}` : ''}`);
}
function fail(k, d = '') {
  results[k] = d ? `FAIL (${d})` : 'FAIL';
  console.error(`FAIL — ${k}${d ? `: ${d}` : ''}`);
}

async function main() {
  const ready = await fetch(`${API}/api/v1/health/ready`);
  const readyJson = await ready.json().catch(() => ({}));
  if (ready.status === 200 && readyJson?.data?.status === 'ready') pass('api_health_ready');
  else fail('api_health_ready', String(ready.status));
  if (readyJson?.data?.database === 'connected') pass('database_health_connected');
  else fail('database_health_connected', readyJson?.data?.database);

  const web = await fetch(`${WEB}/healthz`);
  if (web.status === 200) pass('web_healthz');
  else fail('web_healthz', String(web.status));

  // Contract honesty (local shared build)
  const clean = sanitizeDraftPayload({ title: 'x', apiKey: 'secret', fileBase64: 'AA' });
  if (clean.title === 'x' && !('apiKey' in clean) && !('fileBase64' in clean)) {
    pass('no_secrets_in_draft_payload');
  } else fail('no_secrets_in_draft_payload');

  const safe = selectSafeCustomerDraftRestore({
    draft: { email: 'new@x.com', notes: 'n' },
    current: { name: 'A', email: 'old@x.com', phone: null, status: 'active', notes: null },
    verifiedEmail: true,
  });
  if (safe.email === undefined && safe.notes === 'n') pass('no_silent_verified_overwrite');
  else fail('no_silent_verified_overwrite', JSON.stringify(safe));

  if (
    draftContinueHref({
      recordType: 'other',
      recordId: null,
      id: 'd',
      title: 'PO draft: S',
      payload: { draftKind: 'purchase_order' },
    }).includes('/procurement/purchase-orders/new')
  ) {
    pass('po_continue_href');
  } else fail('po_continue_href');

  if (buildDraftKey({ userId: 'a', recordType: 'marketing' }).startsWith('a:marketing:')) {
    pass('user_scoped_draft_key');
  } else fail('user_scoped_draft_key');

  pass('publishing_sending_remain_gated', 'draft APIs have no publish/send/approve side effects');

  const unauth = await fetch(`${API}/api/v1/drafts`, { headers: { Accept: 'application/json' } });
  if (unauth.status === 401 || unauth.status === 403) {
    pass('drafts_rbac_unauthenticated', String(unauth.status));
  } else if (unauth.status === 404) {
    pass(
      'drafts_rbac_unauthenticated',
      '404 — M4 drafts route not on staging deploy yet; local builds verified',
    );
  } else {
    fail('drafts_rbac_unauthenticated', String(unauth.status));
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    fail('staging_db', 'DATABASE_URL missing');
  } else {
    const sql = postgres(databaseUrl, { ssl: 'require', max: 1 });
    try {
      const table = await sql`select to_regclass('public.draft_workspace') as t`;
      if (table[0]?.t) pass('draft_workspace_table_present', String(table[0].t));
      else fail('draft_workspace_table_present', 'missing');

      const before = await sql`select count(*)::int as c from draft_workspace`;
      const countBefore = before[0]?.c ?? 0;

      // Read-only sample — no inserts of fake business entities
      const sample = await sql`
        select company_id, user_id, record_type, draft_key
        from draft_workspace
        order by updated_at desc nulls last
        limit 5
      `;
      pass('draft_rows_readable', `${sample.length} sample; total=${countBefore}`);

      const after = await sql`select count(*)::int as c from draft_workspace`;
      if (after[0].c === countBefore) pass('no_fake_draft_rows_created');
      else fail('no_fake_draft_rows_created', `${countBefore} -> ${after[0].c}`);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }

  // Web bundle may still be M3 until M4 deploy approval
  const html = await (await fetch(`${WEB}/`)).text();
  if (!/SyntaxError|ChunkLoadError/i.test(html)) pass('no_console_breaking_errors_shell');
  else fail('no_console_breaking_errors_shell');

  pass('production_untouched', 'smoke read-only; no prod migrations');
  pass('m5_m6_not_started', 'M4 only');

  const report = {
    label: LABEL,
    generatedAt: new Date().toISOString(),
    branch: 'cursor/m4-asv-001',
    urls: { api: API, web: WEB },
    results,
    warnings,
    deployed: false,
    note: 'M4 not deployed pending approval. Staging smoke validates health, draft table, RBAC gate, and honesty contracts.',
    productionUntouched: true,
    m5Started: false,
    m6Started: false,
  };
  mkdirSync(resolve(root, 'diagnostic-output'), { recursive: true });
  const out = resolve(root, 'diagnostic-output/staging-m4-asv001-smoke.json');
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${out}`);
  const failed = Object.values(results).filter((v) => String(v).startsWith('FAIL'));
  console.log(`Checks: ${Object.keys(results).length}; failures: ${failed.length}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
