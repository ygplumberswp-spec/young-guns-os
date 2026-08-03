/**
 * 209 STEP 4 — safety review of every pending staging migration up to 0171.
 * READ-ONLY. Flags destructive / irreversible / long-running statements and cross-checks
 * whether the objects they touch currently hold data on staging.
 */
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
const drizzleDir = path.resolve(repoRoot, 'packages/db/drizzle');

const text = fs.readFileSync(path.resolve(repoRoot, 'apps/api/.env.staging.local'), 'utf8');
const url = text.match(/^DATABASE_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '');
if (url.includes('rshuiaghmtrvvilhqpwm') || !url.includes('cpkuwtaipjxeipvbssvn')) {
  console.error('BLOCKED: not staging');
  process.exit(2);
}

const journal = JSON.parse(fs.readFileSync(path.join(drizzleDir, 'meta/_journal.json'), 'utf8'));
const sql = postgres(url, { max: 1, prepare: false });
const out = { label: '209-step4-migration-safety-review', generatedAt: new Date().toISOString() };

// Statements that can lose data or rewrite a populated table.
const DESTRUCTIVE = [
  { key: 'drop_table', re: /\bDROP\s+TABLE\b/i, severity: 'destructive' },
  { key: 'drop_column', re: /\bDROP\s+COLUMN\b/i, severity: 'destructive' },
  { key: 'drop_schema', re: /\bDROP\s+SCHEMA\b/i, severity: 'destructive' },
  { key: 'truncate', re: /\bTRUNCATE\b/i, severity: 'destructive' },
  { key: 'delete_from', re: /\bDELETE\s+FROM\b/i, severity: 'destructive' },
  { key: 'rename_table', re: /\bALTER\s+TABLE\s+[^\n;]*\bRENAME\s+TO\b/i, severity: 'rename' },
  { key: 'rename_column', re: /\bRENAME\s+COLUMN\b/i, severity: 'rename' },
  { key: 'alter_column_type', re: /\bALTER\s+COLUMN\b[^\n;]*\b(TYPE|SET\s+DATA\s+TYPE)\b/i, severity: 'rewrite' },
  { key: 'set_not_null', re: /\bALTER\s+COLUMN\b[^\n;]*\bSET\s+NOT\s+NULL\b/i, severity: 'constraint' },
  { key: 'drop_constraint', re: /\bDROP\s+CONSTRAINT\b/i, severity: 'constraint' },
  { key: 'drop_index', re: /\bDROP\s+INDEX\b/i, severity: 'constraint' },
  { key: 'drop_type', re: /\bDROP\s+TYPE\b/i, severity: 'destructive' },
  { key: 'update_data', re: /^\s*UPDATE\s+/im, severity: 'data_backfill' },
  { key: 'create_index_non_concurrent', re: /\bCREATE\s+(UNIQUE\s+)?INDEX\b(?!\s+CONCURRENTLY)/i, severity: 'long_running_possible' },
];

try {
  const applied = await sql`SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`;
  const appliedWhens = new Set(applied.map((r) => String(r.created_at)));
  out.journalCount = journal.entries.length;
  out.appliedCount = applied.length;

  const pending = journal.entries.filter((e) => !appliedWhens.has(String(e.when)));
  out.pendingCount = pending.length;
  out.pendingTags = pending.map((e) => e.tag);
  out.lastPendingTag = pending.at(-1)?.tag ?? null;
  out.chainReaches0171 = out.pendingTags.includes('0171_xero_complete_historical_sync');

  // Tables that currently hold rows on staging — a destructive op on these is the real risk.
  const populated = await sql`
    SELECT relname AS table_name, n_live_tup::bigint AS live_rows
    FROM pg_stat_user_tables WHERE schemaname = 'public' AND n_live_tup > 0
    ORDER BY n_live_tup DESC`;
  const populatedSet = new Map(populated.map((r) => [r.table_name, Number(r.live_rows)]));
  out.populatedTableCount = populatedSet.size;
  out.top10PopulatedTables = populated.slice(0, 10).map((r) => `${r.table_name}=${r.live_rows}`);

  const findings = [];
  for (const entry of pending) {
    const file = path.join(drizzleDir, `${entry.tag}.sql`);
    if (!fs.existsSync(file)) {
      findings.push({ tag: entry.tag, issue: 'MIGRATION_FILE_MISSING', severity: 'blocker' });
      continue;
    }
    const body = fs.readFileSync(file, 'utf8');
    // Ignore commented-out lines.
    const code = body
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');

    for (const rule of DESTRUCTIVE) {
      if (!rule.re.test(code)) continue;
      const lines = code
        .split('\n')
        .filter((l) => rule.re.test(l))
        .map((l) => l.trim().slice(0, 200));
      // Which of the touched tables already hold data?
      const touchedPopulated = [...populatedSet.keys()].filter((t) =>
        lines.some((l) => new RegExp(`\\b"?${t}"?\\b`).test(l)),
      );
      findings.push({
        tag: entry.tag,
        rule: rule.key,
        severity: rule.severity,
        occurrences: lines.length,
        sample: lines.slice(0, 3),
        touchesPopulatedTables: touchedPopulated.map((t) => `${t}(${populatedSet.get(t)} rows)`),
      });
    }
  }

  out.findings = findings;
  out.blockers = findings.filter(
    (f) => ['destructive', 'rename', 'rewrite'].includes(f.severity) && f.touchesPopulatedTables.length > 0,
  );
  out.blockerCount = out.blockers.length;
  out.severityCounts = findings.reduce((acc, f) => {
    acc[f.severity ?? f.issue] = (acc[f.severity ?? f.issue] ?? 0) + 1;
    return acc;
  }, {});

  // 0171 specifics
  const f0171 = path.join(drizzleDir, '0171_xero_complete_historical_sync.sql');
  const body0171 = fs.readFileSync(f0171, 'utf8');
  out.migration0171 = {
    bytes: body0171.length,
    createTableCount: (body0171.match(/CREATE TABLE/gi) ?? []).length,
    createIndexCount: (body0171.match(/CREATE\s+(UNIQUE\s+)?INDEX/gi) ?? []).length,
    foreignKeyCount: (body0171.match(/FOREIGN KEY/gi) ?? []).length,
    dropStatements: (body0171.match(/\bDROP\b[^\n;]*/gi) ?? []).slice(0, 10),
  };
} catch (e) {
  out.error = String(e.message || e);
} finally {
  await sql.end({ timeout: 5 });
}

fs.writeFileSync(
  path.resolve(repoRoot, 'diagnostic-output/209-step4-migration-safety-review.json'),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
