#!/usr/bin/env node
/**
 * Apply migration 0109_xero_two_way_sync_scaffolding on staging (idempotent).
 * Creates xero_write_approvals table + enum; conflict_metadata already present.
 * Inserts journal entry if missing. No destructive changes.
 */
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION_TAG = '0109_xero_two_way_sync_scaffolding';
const sqlPath = path.join(repoRoot, `packages/db/drizzle/${MIGRATION_TAG}.sql`);
const migrationSql = fs.readFileSync(sqlPath, 'utf8');
const hash = crypto.createHash('sha256').update(migrationSql).digest('hex');
const journal = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'packages/db/drizzle/meta/_journal.json'), 'utf8'),
);
const entry = journal.entries.find((e) => e.tag === MIGRATION_TAG);
if (!entry) throw new Error(`Journal entry missing for ${MIGRATION_TAG}`);

const statements = migrationSql
  .split('--> statement-breakpoint')
  .map((s) => s.trim())
  .filter(Boolean);

const scriptPath = path.join(repoRoot, '.tmp-apply-0109.mjs');
fs.writeFileSync(
  scriptPath,
  `import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const statements = ${JSON.stringify(statements)};
const hash = ${JSON.stringify(hash)};
const journalWhen = ${entry.when};
const results = [];
for (const statement of statements) {
  try {
    await sql.unsafe(statement);
    results.push({ ok: true, preview: statement.slice(0, 80).replace(/\\n/g, ' ') });
  } catch (err) {
    results.push({ ok: false, error: err.message, preview: statement.slice(0, 80).replace(/\\n/g, ' ') });
  }
}
const existingJournal = await sql\`select id from drizzle.__drizzle_migrations where hash = \${hash}\`;
let journalInserted = false;
if (existingJournal.length === 0) {
  await sql\`insert into drizzle.__drizzle_migrations (hash, created_at) values (\${hash}, \${String(journalWhen)})\`;
  journalInserted = true;
}
const tableExists = await sql\`
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'xero_write_approvals'
  ) AS exists\`;
const columns = await sql\`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'xero_write_approvals'
  ORDER BY ordinal_position\`;
const journalCount = await sql\`select count(*)::int as n from drizzle.__drizzle_migrations\`;
process.stdout.write(JSON.stringify({
  migrationTag: ${JSON.stringify(MIGRATION_TAG)},
  hash,
  statementResults: results,
  journalInserted,
  journalCount: journalCount[0]?.n ?? 0,
  xero_write_approvals: {
    exists: tableExists[0]?.exists ?? false,
    columns: columns.map(c => c.column_name),
  },
}, null, 2));
await sql.end();
`,
);

try {
  const raw = execSync(`railway run --service young-guns-os node ${scriptPath}`, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
  console.log(raw);
} finally {
  fs.rmSync(scriptPath, { force: true });
}
