/**
 * 206 — Xero live staging verification (read-only DB evidence).
 * Prints NO secrets: credentials are reported as present/absent + length only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/db/package.json'),
);
const postgres = require('postgres');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';

function loadStagingDatabaseUrl() {
  const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
  const text = fs.readFileSync(envPath, 'utf8');
  const match = text.match(/^DATABASE_URL=(.+)$/m);
  return match?.[1]?.trim().replace(/^["']|["']$/g, '') || null;
}

const url = loadStagingDatabaseUrl();
if (!url || url.includes(FORBIDDEN) || !url.includes(STAGING_REF)) {
  console.error('BLOCKED: staging database url unavailable or not the staging project');
  process.exit(2);
}

const sql = postgres(url, { max: 1, prepare: false });
const out = { label: '206-xero-live-staging-verify', generatedAt: new Date().toISOString() };

async function tableExists(name) {
  const [r] = await sql`SELECT to_regclass(${'public.' + name}) AS t`;
  return r.t !== null;
}

try {
  // 1. Migration state
  const [mig] = await sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`;
  out.appliedMigrationRows = mig.n;

  // 2. Which xero history tables from migration 0171 exist
  const historyTables = [
    'xero_history_contacts',
    'xero_history_invoices',
    'xero_history_credit_notes',
    'xero_history_payments',
    'xero_history_bank_transactions',
    'xero_history_accounts',
    'xero_history_tracking_categories',
    'xero_history_tracking_options',
    'xero_history_attachments',
    'xero_history_quotes',
    'xero_sync_entity_status',
  ];
  out.historyTables = {};
  for (const t of historyTables) out.historyTables[t] = await tableExists(t);

  // 3. Companies
  out.companies = await sql`SELECT id, name FROM companies ORDER BY created_at LIMIT 10`;

  // 4. Xero integration connections (NO secret material selected)
  out.integrationConnectionColumns = (
    await sql`SELECT column_name FROM information_schema.columns
              WHERE table_schema='public' AND table_name='integration_connections'
              ORDER BY ordinal_position`
  ).map((r) => r.column_name);

  const secretish = /token|secret|credential|encrypt/i;
  const safeCols = out.integrationConnectionColumns.filter((c) => !secretish.test(c));
  const secretCols = out.integrationConnectionColumns.filter((c) => secretish.test(c));
  const presenceExprs = secretCols
    .map((c) => `(${c} IS NOT NULL AND length(${c}::text) > 0) AS ${c}_present`)
    .join(', ');
  out.xeroConnections = await sql.unsafe(
    `SELECT ${safeCols.join(', ')}${presenceExprs ? ', ' + presenceExprs : ''}
     FROM integration_connections WHERE provider = 'xero'`,
  );

  // 5. Import jobs
  if (await tableExists('xero_import_jobs')) {
    out.importJobs = await sql`
      SELECT id, company_id, status, stage, created_at, updated_at, completed_at, error
      FROM xero_import_jobs ORDER BY created_at DESC LIMIT 10
    `;
  } else {
    out.importJobs = 'table_absent';
  }

  // 6. Legacy mapping counts
  out.mappingCounts = {};
  for (const t of [
    'xero_customer_mappings',
    'xero_invoice_mappings',
    'xero_payment_mappings',
    'xero_quote_mappings',
    'xero_sync_logs',
  ]) {
    if (await tableExists(t)) {
      const [r] = await sql.unsafe(`SELECT count(*)::int AS n FROM ${t}`);
      out.mappingCounts[t] = r.n;
    } else out.mappingCounts[t] = 'table_absent';
  }

  // 7. History table counts if present
  out.historyCounts = {};
  for (const t of historyTables) {
    if (out.historyTables[t]) {
      const [r] = await sql.unsafe(`SELECT count(*)::int AS n FROM ${t}`);
      out.historyCounts[t] = r.n;
    }
  }
} catch (err) {
  out.error = String(err.message || err);
} finally {
  await sql.end({ timeout: 5 });
}

const outPath = path.resolve(repoRoot, 'diagnostic-output/206-xero-live-staging-verify.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
