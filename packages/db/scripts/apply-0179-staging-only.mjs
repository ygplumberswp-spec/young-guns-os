/**
 * Apply ONLY 0179_social_connection_foundation on staging.
 * Refuses production ref. Requires fresh staging backup before apply.
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
const MIGRATION_TAG = '0179_social_connection_foundation';
const PRIOR_TAG = '0178_finance_title_free_legacy';
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
  console.error(`NO-GO: expected ${PRIOR_TAG} immediately before 0179, found ${prior?.tag ?? 'none'}`);
  process.exit(2);
}

const sqlPath = path.join(root, `drizzle/${MIGRATION_TAG}.sql`);
const migrationSql = fs.readFileSync(sqlPath, 'utf8');
const hash = crypto.createHash('sha256').update(migrationSql).digest('hex');

const db = postgres(env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

const PROTECTED_TABLES = [
  'fb_connections',
  'fb_oauth_states',
  'whatsapp_connections',
  'social_media_connections',
];

async function tableExists(tableName) {
  const rows = await db`
    select count(*)::int as n
    from information_schema.tables
    where table_schema = 'public'
      and table_name = ${tableName}
  `;
  return rows[0].n === 1;
}

async function enumExists(enumName) {
  const rows = await db`
    select count(*)::int as n
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = ${enumName}
  `;
  return rows[0].n === 1;
}

async function protectedCounts() {
  const out = {};
  for (const table of PROTECTED_TABLES) {
    if (await tableExists(table)) {
      const rows = await db.unsafe(`select count(*)::int as n from "${table}"`);
      out[table] = rows[0].n;
    } else {
      out[table] = null;
    }
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
  const count0178 = appliedTags.filter((t) => t === PRIOR_TAG).length;
  const count0179 = appliedTags.filter((t) => t === MIGRATION_TAG).length;
  const has0179Hash = migRows.some((row) => row.hash === hash);

  const pendingJournalTags = journal.entries
    .filter((e) => !appliedTags.includes(e.tag))
    .map((e) => e.tag);

  const precheck = {
    phase: 'precheck',
    stagingRef: STAGING_REF,
    appliedMigrationCount: migRows.length,
    lastAppliedJournalTag: appliedTags.at(-1) ?? null,
    count0178Applied: count0178,
    count0179Applied: count0179,
    has0179Hash,
    pendingJournalTags,
    backup: latestBackup
      ? {
          path: latestBackup.path,
          bytes: latestBackup.bytes,
          ageMs: backupAgeMs,
          ok: backupOk,
        }
      : { ok: false, reason: 'no_backup_found' },
    schemaBefore: {
      socialOauthStatesTable: await tableExists('social_oauth_states'),
      socialConnectionProviderEnum: await enumExists('social_connection_provider'),
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
  if (count0178 !== 1) {
    console.error(`NO-GO: 0178 must be applied exactly once (found ${count0178})`);
    process.exit(3);
  }
  if (count0179 > 0 || has0179Hash) {
    console.error('NO-GO: 0179 already applied');
    process.exit(3);
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
    count0179Applied: appliedTagsAfter.filter((t) => t === MIGRATION_TAG).length,
    schemaAfter: {
      socialOauthStatesTable: await tableExists('social_oauth_states'),
      socialConnectionProviderEnum: await enumExists('social_connection_provider'),
      initiatorRoleOnSocialOauthStates: await db`
        select count(*)::int as n
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'social_oauth_states'
          and column_name = 'initiator_role_name'
      `.then((r) => r[0].n === 1),
    },
    rowCountsAfter: await protectedCounts(),
    migrationCount: migRowsAfter.length,
  };

  const rowCountsUnchanged = PROTECTED_TABLES.every((table) => {
    if (countsBefore[table] == null) return true;
    return post.rowCountsAfter[table] === countsBefore[table];
  });

  console.log(JSON.stringify({ ...post, rowCountsUnchanged }, null, 2));

  if (
    !post.schemaAfter.socialOauthStatesTable ||
    !post.schemaAfter.socialConnectionProviderEnum ||
    !post.schemaAfter.initiatorRoleOnSocialOauthStates ||
    post.count0179Applied !== 1 ||
    !rowCountsUnchanged
  ) {
    console.error('NO-GO: post-apply verification failed');
    process.exit(4);
  }
} finally {
  await db.end({ timeout: 5 });
}
