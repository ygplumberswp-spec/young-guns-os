/**
 * Apply ONLY 0178_finance_title_free_legacy on staging.
 * Refuses production ref. Does not apply unrelated migrations (0149, 0174, etc.).
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
const MIGRATION_TAG = '0178_finance_title_free_legacy';
const PRIOR_TAG = '0177_finance_document_roundtrip_fields';
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
  console.error(`NO-GO: expected ${PRIOR_TAG} immediately before 0178, found ${prior?.tag ?? 'none'}`);
  process.exit(2);
}

const sqlPath = path.join(root, `drizzle/${MIGRATION_TAG}.sql`);
const migrationSql = fs.readFileSync(sqlPath, 'utf8');
const hash = crypto.createHash('sha256').update(migrationSql).digest('hex');

if (/\bDROP\s+NOT\s+NULL\b/i.test(migrationSql)) {
  console.error('NO-GO: 0178 SQL must not DROP NOT NULL on title columns');
  process.exit(2);
}

const db = postgres(env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

const PROTECTED_TABLES = [
  'customers',
  'jobs',
  'quotes',
  'invoices',
  'payments',
  'xero_bank_transactions',
];

async function titleColumnMeta(tableName) {
  const rows = await db`
    select is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${tableName}
      and column_name = 'title'
  `;
  return rows[0] ?? null;
}

async function protectedCounts() {
  const out = {};
  for (const table of PROTECTED_TABLES) {
    const rows = await db.unsafe(`select count(*)::int as n from "${table}"`);
    out[table] = rows[0].n;
  }
  const xeroAttachments = await db`
    select count(*)::int as n from xero_attachments
  `.catch(() => [{ n: null }]);
  out.xero_attachments = xeroAttachments[0].n;
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
  const count0177 = appliedTags.filter((t) => t === PRIOR_TAG).length;
  const count0178 = appliedTags.filter((t) => t === MIGRATION_TAG).length;
  const has0178Hash = migRows.some((row) => row.hash === hash);

  const xeroJobs = await db`
    select status, count(*)::int as n
    from xero_finance_sync_runs
    where status in ('pending', 'running')
    group by status
  `.catch(() => []);

  const pendingJournalTags = journal.entries
    .filter((e) => !appliedTags.includes(e.tag))
    .map((e) => e.tag);

  const precheck = {
    phase: 'precheck',
    stagingRef: STAGING_REF,
    appliedMigrationCount: migRows.length,
    lastAppliedJournalTag: appliedTags.at(-1) ?? null,
    count0177Applied: count0177,
    count0178Applied: count0178,
    has0178Hash,
    xeroIdle: xeroJobs.length === 0,
    xeroPendingOrRunning: xeroJobs,
    pendingJournalTags,
    backup: latestBackup
      ? {
          path: latestBackup.path,
          bytes: latestBackup.bytes,
          ageMs: backupAgeMs,
          ok: backupOk,
        }
      : { ok: false, reason: 'no_backup_found' },
    titleColumnsBefore: {
      quotes: await titleColumnMeta('quotes'),
      invoices: await titleColumnMeta('invoices'),
    },
    rowCountsBefore: await protectedCounts(),
    pendingHash: hash,
    journalWhen: entry.when,
    sqlSafety: {
      dropsNotNull: false,
      keepsNotNull: /\bSET\s+NOT\s+NULL\b/i.test(migrationSql),
      setsDefaultEmpty: migrationSql.includes("SET DEFAULT ''"),
    },
  };
  console.log(JSON.stringify(precheck, null, 2));

  if (PRECHECK_ONLY) {
    process.exit(0);
  }

  if (!backupOk) {
    console.error('NO-GO: run packages/db/scripts/staging-backup.mjs first (fresh backup required)');
    process.exit(3);
  }
  if (count0177 !== 1) {
    console.error(`NO-GO: 0177 must be applied exactly once (found ${count0177})`);
    process.exit(3);
  }
  if (count0178 > 0 || has0178Hash) {
    console.error('NO-GO: 0178 already applied');
    process.exit(3);
  }
  if (!precheck.xeroIdle) {
    console.error('NO-GO: Xero import/sync jobs are pending or running');
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
    count0178Applied: appliedTagsAfter.filter((t) => t === MIGRATION_TAG).length,
    titleColumnsAfter: {
      quotes: await titleColumnMeta('quotes'),
      invoices: await titleColumnMeta('invoices'),
    },
    rowCountsAfter: await protectedCounts(),
    migrationCount: migRowsAfter.length,
  };

  const rowCountsUnchanged = PROTECTED_TABLES.every(
    (table) => post.rowCountsAfter[table] === countsBefore[table],
  );
  const attachmentsUnchanged =
    post.rowCountsAfter.xero_attachments === precheck.rowCountsBefore.xero_attachments;

  const titleNotNullOk =
    post.titleColumnsAfter.quotes?.is_nullable === 'NO' &&
    post.titleColumnsAfter.invoices?.is_nullable === 'NO';

  console.log(
    JSON.stringify({ ...post, rowCountsUnchanged, attachmentsUnchanged, titleNotNullOk }, null, 2),
  );

  if (
    !titleNotNullOk ||
    post.count0178Applied !== 1 ||
    !rowCountsUnchanged ||
    !attachmentsUnchanged
  ) {
    console.error('NO-GO: post-apply verification failed');
    process.exit(4);
  }
} finally {
  await db.end({ timeout: 5 });
}
