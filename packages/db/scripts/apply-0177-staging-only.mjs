/**
 * Apply ONLY 0177_finance_document_roundtrip_fields on staging.
 * Refuses production ref. Does not apply unrelated migrations.
 * Requires a recent staging backup file to exist before apply.
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
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';
const MIGRATION_TAG = '0177_finance_document_roundtrip_fields';
const PRIOR_TAG = '0176_titan_finance_editor_fields';
const BACKUP_DIR = '/home/ubuntu/titan-staging-backups';
const BACKUP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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

function findLatestBackup() {
  if (!fs.existsSync(BACKUP_DIR)) return null;
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((name) => name.startsWith('titan-staging-') && name.endsWith('.dump'))
    .map((name) => {
      const fullPath = path.join(BACKUP_DIR, name);
      const stat = fs.statSync(fullPath);
      return { path: fullPath, name, mtimeMs: stat.mtimeMs, bytes: stat.size };
    })
    .filter((row) => row.bytes > 0)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0] ?? null;
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
if (!env.DATABASE_URL.includes(STAGING_REF)) {
  console.error(`NO-GO: DATABASE_URL must target staging ref ${STAGING_REF}`);
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
if (prior?.tag !== PRIOR_TAG) {
  console.error(`NO-GO: expected ${PRIOR_TAG} immediately before 0177, found ${prior?.tag ?? 'none'}`);
  process.exit(2);
}

const sqlPath = path.join(root, `drizzle/${MIGRATION_TAG}.sql`);
const migrationSql = fs.readFileSync(sqlPath, 'utf8');
const hash = crypto.createHash('sha256').update(migrationSql).digest('hex');

const db = postgres(env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

const PROTECTED_TABLES = ['customers', 'jobs', 'quotes', 'invoices', 'payments'];

async function columnExists(tableName, columnName) {
  const rows = await db`
    select count(*)::int as n
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${tableName}
      and column_name = ${columnName}
  `;
  return rows[0].n === 1;
}

async function protectedCounts() {
  const out = {};
  for (const table of PROTECTED_TABLES) {
    const rows = await db.unsafe(`select count(*)::int as n from "${table}"`);
    out[table] = rows[0].n;
  }
  return out;
}

function journalTagForHash(migRows, journalEntries) {
  return migRows.map((row) => {
    const file = journalEntries.find((e) => e.when === Number(row.created_at));
    return file?.tag ?? null;
  });
}

const PRECHECK_ONLY = process.argv.includes('--precheck-only');

try {
  const latestBackup = findLatestBackup();
  const backupAgeMs = latestBackup ? Date.now() - latestBackup.mtimeMs : null;
  const backupOk =
    latestBackup != null &&
    latestBackup.bytes > 0 &&
    backupAgeMs != null &&
    backupAgeMs <= BACKUP_MAX_AGE_MS;

  const migRows = await db`
    select id, hash, created_at
    from drizzle.__drizzle_migrations
    order by created_at asc, id asc
  `;
  const appliedTags = journalTagForHash(migRows, journal.entries);
  const count0176 = appliedTags.filter((t) => t === PRIOR_TAG).length;
  const count0177 = appliedTags.filter((t) => t === MIGRATION_TAG).length;
  const has0177Hash = migRows.some((row) => row.hash === hash);

  const precheck = {
    phase: 'precheck',
    stagingRef: STAGING_REF,
    appliedMigrationCount: migRows.length,
    lastAppliedJournalTag: appliedTags.at(-1) ?? null,
    count0176Applied: count0176,
    count0177Applied: count0177,
    has0177Hash,
    backup: latestBackup
      ? {
          path: latestBackup.path,
          bytes: latestBackup.bytes,
          ageMs: backupAgeMs,
          ok: backupOk,
        }
      : { ok: false, reason: 'no_backup_found' },
    columnsBefore: {
      quotes_billing_address: await columnExists('quotes', 'billing_address'),
      quotes_site_address: await columnExists('quotes', 'site_address'),
      quotes_postal_address: await columnExists('quotes', 'postal_address'),
      invoices_billing_address: await columnExists('invoices', 'billing_address'),
      invoices_site_address: await columnExists('invoices', 'site_address'),
      invoices_postal_address: await columnExists('invoices', 'postal_address'),
    },
    rowCountsBefore: await protectedCounts(),
    pendingHash: hash,
    journalWhen: entry.when,
  };
  console.log(JSON.stringify(precheck, null, 2));

  if (PRECHECK_ONLY) {
    process.exit(0);
  }

  if (!backupOk) {
    console.error('NO-GO: run packages/db/scripts/staging-backup.mjs first (fresh backup required)');
    process.exit(3);
  }
  if (count0176 !== 1) {
    console.error(`NO-GO: 0176 must be applied exactly once (found ${count0176})`);
    process.exit(3);
  }
  if (count0177 > 0 || has0177Hash) {
    console.error('NO-GO: 0177 already applied');
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

  const migRowsAfter = await db`
    select id, hash, created_at
    from drizzle.__drizzle_migrations
    order by created_at asc, id asc
  `;
  const appliedTagsAfter = journalTagForHash(migRowsAfter, journal.entries);

  const post = {
    phase: 'post-apply',
    status: 'applied',
    tag: MIGRATION_TAG,
    hash,
    count0177Applied: appliedTagsAfter.filter((t) => t === MIGRATION_TAG).length,
    columnsAfter: {
      quotes_billing_address: await columnExists('quotes', 'billing_address'),
      quotes_site_address: await columnExists('quotes', 'site_address'),
      quotes_postal_address: await columnExists('quotes', 'postal_address'),
      invoices_billing_address: await columnExists('invoices', 'billing_address'),
      invoices_site_address: await columnExists('invoices', 'site_address'),
      invoices_postal_address: await columnExists('invoices', 'postal_address'),
    },
    rowCountsAfter: await protectedCounts(),
    migrationCount: migRowsAfter.length,
  };

  const rowCountsUnchanged = PROTECTED_TABLES.every(
    (table) => post.rowCountsAfter[table] === countsBefore[table],
  );

  const columnsOk =
    post.columnsAfter.quotes_billing_address &&
    post.columnsAfter.quotes_site_address &&
    post.columnsAfter.quotes_postal_address &&
    post.columnsAfter.invoices_billing_address &&
    post.columnsAfter.invoices_site_address &&
    post.columnsAfter.invoices_postal_address;

  console.log(JSON.stringify({ ...post, rowCountsUnchanged, columnsOk }, null, 2));

  if (!columnsOk || post.count0177Applied !== 1 || !rowCountsUnchanged) {
    console.error('NO-GO: post-apply verification failed');
    process.exit(4);
  }
} finally {
  await db.end({ timeout: 5 });
}
