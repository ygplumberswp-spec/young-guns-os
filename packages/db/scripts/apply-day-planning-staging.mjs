/**
 * Apply Day Planning migrations 0113–0116 on staging only.
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
const MIGRATION_TAGS = [
  '0113_company_day_plans',
  '0114_company_business_rules',
  '0115_company_day_plan_extend',
  '0116_company_day_plan_follow_ups',
];

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

const db = postgres(env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

const results = [];

try {
  for (const tag of MIGRATION_TAGS) {
    const entry = journal.entries.find((e) => e.tag === tag);
    if (!entry) {
      results.push({ tag, status: 'missing_from_journal' });
      continue;
    }

    const sqlPath = path.join(root, `drizzle/${tag}.sql`);
    const migrationSql = fs.readFileSync(sqlPath, 'utf8');
    const hash = crypto.createHash('sha256').update(migrationSql).digest('hex');

    const existing = await db`
      select hash from drizzle.__drizzle_migrations where hash = ${hash}
    `;

    if (existing.length > 0) {
      results.push({ tag, status: 'already_applied' });
      continue;
    }

    await db.begin(async (tx) => {
      await tx.unsafe(migrationSql);
      await tx`
        insert into drizzle.__drizzle_migrations (hash, created_at)
        values (${hash}, ${entry.when})
      `;
    });

    results.push({ tag, status: 'applied' });
  }

  const tables = await db`
    select
      to_regclass('public.company_day_plans') as day_plans,
      to_regclass('public.company_business_rules') as business_rules,
      to_regclass('public.company_day_plan_follow_ups') as follow_ups
  `;

  const migCount = await db`select count(*)::int as n from drizzle.__drizzle_migrations`;

  console.log(
    JSON.stringify(
      {
        status: 'complete',
        results,
        migrationCount: migCount[0].n,
        tables: tables[0],
      },
      null,
      2,
    ),
  );
} finally {
  await db.end({ timeout: 5 });
}
