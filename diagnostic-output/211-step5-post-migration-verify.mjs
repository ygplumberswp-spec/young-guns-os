/** 211 STEP 5 (post-verify) — schema + data integrity after the 0171 chain. READ-ONLY. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/db/package.json'),
);
const postgres = require('postgres');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const drizzleDir = path.resolve(repoRoot, 'packages/db/drizzle');

const text = fs.readFileSync(path.resolve(repoRoot, 'apps/api/.env.staging.local'), 'utf8');
const url = text.match(/^DATABASE_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '');
if (url.includes('rshuiaghmtrvvilhqpwm') || !url.includes('cpkuwtaipjxeipvbssvn')) {
  console.error('BLOCKED: not staging');
  process.exit(2);
}

const journal = JSON.parse(fs.readFileSync(path.join(drizzleDir, 'meta/_journal.json'), 'utf8'));
const sql = postgres(url, { max: 1, prepare: false });
const out = { label: '211-step5-post-migration-verify', generatedAt: new Date().toISOString() };

const has = async (t) => (await sql`SELECT to_regclass(${'public.' + t}) AS t`)[0].t !== null;

try {
  const rows = await sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations`;
  const appliedHashes = new Set(rows.map((r) => r.hash));
  out.journal = {
    journalEntries: journal.entries.length,
    appliedRows: rows.length,
    allJournalEntriesApplied: journal.entries.every((e) => {
      const f = path.join(drizzleDir, `${e.tag}.sql`);
      if (!fs.existsSync(f)) return false;
      return appliedHashes.has(crypto.createHash('sha256').update(fs.readFileSync(f, 'utf8')).digest('hex'));
    }),
    lastTag: journal.entries.at(-1).tag,
    createdAtNowAlignedToJournal: rows.every((r) => Number(r.created_at) <= 1754573400171),
  };

  // Tables created by 0171
  const t0171 = [
    'xero_accounts', 'xero_tracking_categories', 'xero_tracking_options',
    'xero_bills', 'xero_bill_line_items', 'xero_credit_notes',
    'xero_credit_note_allocations', 'xero_payment_allocations',
    'xero_attachments', 'xero_entity_coverage',
  ];
  out.tables0171 = {};
  for (const t of t0171) out.tables0171[t] = await has(t);
  out.all0171TablesPresent = Object.values(out.tables0171).every(Boolean);

  // Tables created by 0145 (xero finance foundation repair)
  const t0145 = ['xero_bank_transactions', 'xero_finance_sync_runs'];
  out.tables0145 = {};
  for (const t of t0145) out.tables0145[t] = await has(t);
  out.all0145TablesPresent = Object.values(out.tables0145).every(Boolean);

  out.indexesOnNewTables = await sql`
    SELECT tablename, count(*)::int AS index_count
    FROM pg_indexes WHERE schemaname='public'
      AND tablename = ANY(${[...t0171, ...t0145]})
    GROUP BY tablename ORDER BY tablename`;

  out.foreignKeysOnNewTables = await sql`
    SELECT c.conrelid::regclass::text AS table_name, count(*)::int AS fk_count
    FROM pg_constraint c
    WHERE c.contype='f' AND c.conrelid::regclass::text = ANY(${[...t0171, ...t0145]})
    GROUP BY 1 ORDER BY 1`;

  // Pre-existing data must be intact
  out.preservedCounts = {};
  for (const t of [
    'xero_sync_logs', 'xero_customer_mappings', 'xero_invoice_mappings',
    'xero_quote_mappings', 'xero_payment_mappings',
    'customers', 'invoices', 'quotes', 'payments', 'companies', 'users',
    'integration_connections', 'integration_sync_jobs', 'integration_sync_schedules',
  ]) {
    const [r] = await sql.unsafe(`SELECT count(*)::int AS n FROM ${t}`);
    out.preservedCounts[t] = r.n;
  }

  out.xeroConnection = (
    await sql`SELECT status, connected_at, last_sync_at,
                     (credentials_encrypted IS NOT NULL) AS credentials_present,
                     config->>'organisationName' AS organisation_name,
                     config->>'tenantId' AS tenant_id
              FROM integration_connections WHERE provider='xero' AND status='connected'`
  )[0];

  out.xeroSchedulePausedStillPaused = (
    await sql`SELECT s.enabled FROM integration_sync_schedules s
              JOIN integration_connectors c ON c.id = s.connector_id
              WHERE c.connector_key='xero'`
  ).map((r) => r.enabled);

  out.newTableRowCounts = {};
  for (const t of [...t0171, ...t0145]) {
    if (out.tables0171[t] || out.tables0145[t]) {
      const [r] = await sql.unsafe(`SELECT count(*)::int AS n FROM ${t}`);
      out.newTableRowCounts[t] = r.n;
    }
  }
} catch (e) {
  out.error = String(e.message || e);
} finally {
  await sql.end({ timeout: 5 });
}

fs.writeFileSync(
  path.resolve(repoRoot, 'diagnostic-output/211-step5-post-migration-verify.json'),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
