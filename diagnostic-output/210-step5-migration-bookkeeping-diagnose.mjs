/**
 * 210 STEP 5 (diagnosis) — why drizzle-kit applied nothing.
 * READ-ONLY. Matches applied migration hashes against the SQL files on disk to prove whether
 * drizzle.__drizzle_migrations.created_at has drifted away from the journal `when` values.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
const out = { label: '210-step5-migration-bookkeeping-diagnose', generatedAt: new Date().toISOString() };

// drizzle-orm hashes the raw SQL file contents with sha256.
const hashByTag = new Map();
for (const entry of journal.entries) {
  const file = path.join(drizzleDir, `${entry.tag}.sql`);
  if (!fs.existsSync(file)) continue;
  const body = fs.readFileSync(file, 'utf8');
  hashByTag.set(crypto.createHash('sha256').update(body).digest('hex'), entry);
}

try {
  const rows = await sql`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
  out.appliedRowCount = rows.length;
  out.journalEntryCount = journal.entries.length;

  const matched = [];
  const orphans = [];
  for (const r of rows) {
    const entry = hashByTag.get(r.hash);
    if (entry) {
      matched.push({
        id: r.id,
        tag: entry.tag,
        journalWhen: String(entry.when),
        dbCreatedAt: String(r.created_at),
        drifted: String(entry.when) !== String(r.created_at),
      });
    } else {
      orphans.push({ id: r.id, createdAt: String(r.created_at), hashPrefix: r.hash.slice(0, 12) });
    }
  }

  out.matchedCount = matched.length;
  out.orphanCount = orphans.length;
  out.orphans = orphans;
  out.driftedCount = matched.filter((m) => m.drifted).length;
  out.sampleDrifted = matched.filter((m) => m.drifted).slice(0, 5);
  out.sampleAligned = matched.filter((m) => !m.drifted).slice(0, 5);

  const appliedTags = new Set(matched.map((m) => m.tag));
  out.pendingTags = journal.entries.filter((e) => !appliedTags.has(e.tag)).map((e) => e.tag);
  out.pendingCount = out.pendingTags.length;

  // This is the value drizzle compares every journal `when` against.
  const maxCreatedAt = rows.reduce((max, r) => (Number(r.created_at) > max ? Number(r.created_at) : max), 0);
  const maxJournalWhen = Math.max(...journal.entries.map((e) => Number(e.when)));
  out.migratorComparison = {
    maxAppliedCreatedAt: maxCreatedAt,
    maxJournalWhen,
    everyJournalWhenBelowMaxApplied: maxJournalWhen < maxCreatedAt,
    explanation:
      'drizzle-orm applies a migration only when journal `when` (folderMillis) is greater than the ' +
      'newest created_at already in drizzle.__drizzle_migrations. Past migrations were stamped with ' +
      'wall-clock time instead of the journal `when`, so every genuinely pending migration now looks older.',
  };
} catch (e) {
  out.error = String(e.message || e);
} finally {
  await sql.end({ timeout: 5 });
}

fs.writeFileSync(
  path.resolve(repoRoot, 'diagnostic-output/210-step5-migration-bookkeeping-diagnose.json'),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
