/**
 * Apply ONLY 0176_titan_finance_editor_fields on staging.
 * Refuses production ref. Does not apply unrelated migrations.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '../..');
const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const MIGRATION_TAG = '0176_titan_finance_editor_fields';

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

const env = loadEnv(envPath);
if (env.APP_ENV !== 'staging' || env.TITAN_ENV !== 'staging') {
  console.error('NO-GO: APP_ENV/TITAN_ENV must be staging');
  process.exit(2);
}
if (!env.DATABASE_URL || env.DATABASE_URL.toLowerCase().includes(FORBIDDEN)) {
  console.error('Refused: staging DATABASE_URL missing or forbidden ref');
  process.exit(2);
}

const journal = JSON.parse(
  fs.readFileSync(path.join(root, 'drizzle/meta/_journal.json'), 'utf8'),
);
const entry = journal.entries.find((e) => e.tag === MIGRATION_TAG);
if (!entry) {
  console.error(`Migration ${MIGRATION_TAG} not found in journal`);
  process.exit(2);
}

const prior = journal.entries[journal.entries.indexOf(entry) - 1];
if (prior?.tag !== '0175_titan_document_engine_yoco_links') {
  console.error(`NO-GO: expected 0175 immediately before 0176, found ${prior?.tag ?? 'none'}`);
  process.exit(2);
}

const sqlPath = path.join(root, `drizzle/${MIGRATION_TAG}.sql`);
const migrationSql = fs.readFileSync(sqlPath, 'utf8');
const hash = crypto.createHash('sha256').update(migrationSql).digest('hex');

const db = postgres(env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

const PROTECTED_TABLES = ['customers', 'jobs', 'quotes', 'invoices', 'payments'];

async function columnExists(columnName) {
  const rows = await db`
    select count(*)::int as n
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customers'
      and column_name = ${columnName}
  `;
  return rows[0].n === 1;
}

async function indexExists(indexName) {
  const rows = await db`
    select count(*)::int as n
    from pg_indexes
    where schemaname = 'public'
      and indexname = ${indexName}
  `;
  return rows[0].n === 1;
}

async function protectedCounts() {
  const out = {};
  for (const table of PROTECTED_TABLES) {
    const rows = await db.unsafe(`select count(*)::int as n from "${table}"`);
    out[table] = rows[0].n;
  }
  const xero = await db`
    select count(*)::int as n
    from integration_connections
    where provider = 'xero'
  `.catch(() => [{ n: null }]);
  out.xero_connections = xero[0].n;
  return out;
}

try {
  const migRows = await db`
    select hash, created_at
    from drizzle.__drizzle_migrations
    order by created_at asc, id asc
  `;
  const has0175 = migRows.some((row) => {
    const file = journal.entries.find((e) => e.when === Number(row.created_at));
    return file?.tag === '0175_titan_document_engine_yoco_links';
  });
  const lastTag = journal.entries[migRows.length - 1]?.tag ?? null;

  const precheck = {
    phase: 'precheck',
    appliedMigrationCount: migRows.length,
    lastAppliedJournalTag: lastTag,
    has0175Applied: has0175 || lastTag === '0175_titan_document_engine_yoco_links',
    columnsBefore: {
      company_name: await columnExists('company_name'),
      billing_address: await columnExists('billing_address'),
      site_address: await columnExists('site_address'),
      vat_number: await columnExists('vat_number'),
    },
    indexesBefore: {
      customers_company_name_idx: await indexExists('customers_company_name_idx'),
      customers_vat_number_idx: await indexExists('customers_vat_number_idx'),
    },
    rowCountsBefore: await protectedCounts(),
    pendingHash: hash,
    journalWhen: entry.when,
  };
  console.log(JSON.stringify(precheck, null, 2));

  if (!precheck.has0175Applied && precheck.appliedMigrationCount < 172) {
    console.error('NO-GO: staging must include migration 0175 before applying 0176');
    process.exit(3);
  }

  const existing = await db`
    select hash from drizzle.__drizzle_migrations where hash = ${hash}
  `;
  if (existing.length > 0) {
    console.log(JSON.stringify({ status: 'already_applied', tag: MIGRATION_TAG, hash }));
    process.exit(0);
  }

  const countsBefore = precheck.rowCountsBefore;

  await db.begin(async (tx) => {
    await tx.unsafe(migrationSql);
    await tx`
      insert into drizzle.__drizzle_migrations (hash, created_at)
      values (${hash}, ${entry.when})
    `;
  });

  const post = {
    phase: 'post-apply',
    status: 'applied',
    tag: MIGRATION_TAG,
    hash,
    columnsAfter: {
      company_name: await columnExists('company_name'),
      billing_address: await columnExists('billing_address'),
      site_address: await columnExists('site_address'),
      vat_number: await columnExists('vat_number'),
    },
    indexesAfter: {
      customers_company_name_idx: await indexExists('customers_company_name_idx'),
      customers_vat_number_idx: await indexExists('customers_vat_number_idx'),
    },
    rowCountsAfter: await protectedCounts(),
    migrationCount: (await db`select count(*)::int as n from drizzle.__drizzle_migrations`)[0].n,
  };

  const rowCountsUnchanged = PROTECTED_TABLES.every(
    (table) => post.rowCountsAfter[table] === countsBefore[table],
  );

  console.log(JSON.stringify({ ...post, rowCountsUnchanged }, null, 2));

  if (
    !post.columnsAfter.company_name ||
    !post.columnsAfter.billing_address ||
    !post.columnsAfter.site_address ||
    !post.columnsAfter.vat_number ||
    !post.indexesAfter.customers_company_name_idx ||
    !post.indexesAfter.customers_vat_number_idx ||
    !rowCountsUnchanged
  ) {
    console.error('NO-GO: post-apply verification failed');
    process.exit(4);
  }
} finally {
  await db.end({ timeout: 5 });
}
