/** 206b — staging migration watermark + xero table inventory (read-only, no secrets). */
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

const text = fs.readFileSync(path.resolve(repoRoot, 'apps/api/.env.staging.local'), 'utf8');
const url = text.match(/^DATABASE_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '');
if (!url.includes('cpkuwtaipjxeipvbssvn')) { console.error('BLOCKED: not staging'); process.exit(2); }

const journal = JSON.parse(
  fs.readFileSync(path.resolve(repoRoot, 'packages/db/drizzle/meta/_journal.json'), 'utf8'),
);
const sql = postgres(url, { max: 1, prepare: false });
const out = { label: '206b-xero-staging-migration-state', generatedAt: new Date().toISOString() };

try {
  const rows = await sql`SELECT id, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`;
  out.appliedCount = rows.length;
  out.journalCount = journal.entries.length;
  const byWhen = new Map(journal.entries.map((e) => [String(e.when), e.tag]));
  const lastRows = rows.slice(-3);
  out.lastAppliedRows = lastRows.map((r) => ({
    createdAt: String(r.created_at),
    matchedJournalTag: byWhen.get(String(r.created_at)) ?? 'unmatched',
  }));
  const appliedWhens = new Set(rows.map((r) => String(r.created_at)));
  out.missingMigrations = journal.entries
    .filter((e) => !appliedWhens.has(String(e.when)))
    .map((e) => e.tag);

  out.xeroTables = (
    await sql`SELECT table_name FROM information_schema.tables
              WHERE table_schema='public' AND table_name LIKE 'xero%' ORDER BY table_name`
  ).map((r) => r.table_name);

  out.importJobTables = (
    await sql`SELECT table_name FROM information_schema.tables
              WHERE table_schema='public' AND table_name LIKE '%import%job%' ORDER BY table_name`
  ).map((r) => r.table_name);
} catch (e) {
  out.error = String(e.message || e);
} finally {
  await sql.end({ timeout: 5 });
}

fs.writeFileSync(
  path.resolve(repoRoot, 'diagnostic-output/206b-xero-staging-migration-state.json'),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
