/**
 * Apply ONLY 0108_secure_session_enhancements on staging (auth session fix).
 * Refuses production ref. Does not apply 0109+.
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
const MIGRATION_TAG = '0108_secure_session_enhancements';

function loadEnv(filePath) {
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i < 0) continue;
    out[s.slice(0, i).trim()] = s.slice(i + 1).trim();
  }
  return out;
}

const env = loadEnv(envPath);
if (!env.DATABASE_URL || env.DATABASE_URL.includes(FORBIDDEN)) {
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

const sqlPath = path.join(root, `drizzle/${MIGRATION_TAG}.sql`);
const migrationSql = fs.readFileSync(sqlPath, 'utf8');
const hash = crypto.createHash('sha256').update(migrationSql).digest('hex');

const db = postgres(env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

try {
  const existing = await db`
    select hash from drizzle.__drizzle_migrations where hash = ${hash}
  `;
  if (existing.length > 0) {
    console.log(JSON.stringify({ status: 'already_applied', tag: MIGRATION_TAG }));
    process.exit(0);
  }

  const colsBefore = await db`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'sessions'
    order by column_name
  `;

  await db.begin(async (tx) => {
    await tx.unsafe(migrationSql);
    await tx`
      insert into drizzle.__drizzle_migrations (hash, created_at)
      values (${hash}, ${entry.when})
    `;
  });

  const colsAfter = await db`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'sessions'
    order by column_name
  `;

  const migCount = await db`select count(*)::int as n from drizzle.__drizzle_migrations`;

  console.log(
    JSON.stringify(
      {
        status: 'applied',
        tag: MIGRATION_TAG,
        migrationCount: migCount[0].n,
        addedColumns: colsAfter
          .map((c) => c.column_name)
          .filter((c) => !colsBefore.map((x) => x.column_name).includes(c)),
      },
      null,
      2,
    ),
  );
} finally {
  await db.end({ timeout: 5 });
}
