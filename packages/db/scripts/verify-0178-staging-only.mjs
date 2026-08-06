/**
 * Read-only verification for 0178_finance_title_free_legacy on staging.
 * Does not apply migrations. Refuses production.
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

const sqlPath = path.join(root, `drizzle/${MIGRATION_TAG}.sql`);
const hash = crypto.createHash('sha256').update(fs.readFileSync(sqlPath, 'utf8')).digest('hex');
const db = postgres(env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

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

function journalTagForHash(migRows, journalEntries) {
  return migRows.map((row) => {
    const file = journalEntries.find((e) => e.when === Number(row.created_at));
    return file?.tag ?? null;
  });
}

try {
  const migRows = await db`
    select id, hash, created_at
    from drizzle.__drizzle_migrations
    order by created_at asc, id asc
  `;
  const appliedTags = journalTagForHash(migRows, journal.entries);
  const count0178 = appliedTags.filter((t) => t === MIGRATION_TAG).length;
  const hasHash = migRows.some((row) => row.hash === hash);

  const titleQuotes = await titleColumnMeta('quotes');
  const titleInvoices = await titleColumnMeta('invoices');

  const report = {
    phase: 'verify-readonly',
    tag: MIGRATION_TAG,
    stagingRef: STAGING_REF,
    applied: count0178 > 0 || hasHash,
    countApplied: count0178,
    hasExpectedHash: hasHash,
    titleColumns: {
      quotes: titleQuotes,
      invoices: titleInvoices,
    },
    lastAppliedJournalTag: appliedTags.at(-1) ?? null,
  };

  report.ok =
    report.applied &&
    titleQuotes?.is_nullable === 'NO' &&
    titleInvoices?.is_nullable === 'NO';

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
} finally {
  await db.end({ timeout: 5 });
}
