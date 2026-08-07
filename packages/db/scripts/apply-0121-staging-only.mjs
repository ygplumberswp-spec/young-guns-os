/**
 * Apply 0121 Communications Platform V1 on staging only.
 * Loads apps/api/.env.staging.local; refuses production ref.
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
const STAGING = 'cpkuwtaipjxeipvbssvn';
const TAG = '0121_communications_platform_v1';

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
  console.error(JSON.stringify({ ok: false, error: 'APP_ENV/TITAN_ENV must be staging' }));
  process.exit(2);
}
if (!env.DATABASE_URL || env.DATABASE_URL.includes(FORBIDDEN) || !env.DATABASE_URL.includes(STAGING)) {
  console.error(JSON.stringify({ ok: false, error: 'DATABASE_URL staging guard failed' }));
  process.exit(3);
}

const journal = JSON.parse(fs.readFileSync(path.join(root, 'drizzle/meta/_journal.json'), 'utf8'));
const entry = journal.entries.find((e) => e.tag === TAG);
if (!entry) {
  console.error(JSON.stringify({ ok: false, error: 'journal entry missing' }));
  process.exit(4);
}

const migrationSql = fs.readFileSync(path.join(root, `drizzle/${TAG}.sql`), 'utf8');
const hash = crypto.createHash('sha256').update(migrationSql).digest('hex');
const db = postgres(env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

try {
  const beforeCount = await db`select count(*)::int as n from drizzle.__drizzle_migrations`;
  const existing = await db`select hash from drizzle.__drizzle_migrations where hash = ${hash}`;
  let status;
  if (existing.length > 0) {
    status = 'already_applied';
  } else {
    await db.begin(async (tx) => {
      await tx.unsafe(migrationSql);
      await tx`
        insert into drizzle.__drizzle_migrations (hash, created_at)
        values (${hash}, ${entry.when})
      `;
    });
    status = 'applied';
  }

  const tables = await db`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'comm_platform_accounts',
        'comm_platform_inbox_index',
        'comm_platform_personal_threads',
        'comm_platform_import_decisions',
        'comm_platform_gmail_drafts'
      )
    order by table_name
  `;
  const afterCount = await db`select count(*)::int as n from drizzle.__drizzle_migrations`;

  console.log(
    JSON.stringify(
      {
        ok: true,
        tag: TAG,
        status,
        hashPrefix: hash.slice(0, 12),
        journalWhen: entry.when,
        migrationCountBefore: beforeCount[0].n,
        migrationCountAfter: afterCount[0].n,
        stagingRefConfirmed: STAGING,
        productionRefTouched: false,
        tables: tables.map((t) => t.table_name),
      },
      null,
      2,
    ),
  );
} finally {
  await db.end({ timeout: 5 });
}
