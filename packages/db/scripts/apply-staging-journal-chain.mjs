/**
 * Apply the drizzle journal chain to STAGING in journal order.
 *
 * Why this exists rather than `drizzle-kit migrate`:
 * drizzle-orm decides what to apply by comparing each journal `when` against the newest
 * created_at already recorded, so a single out-of-order entry is skipped permanently. This
 * repository's journal is non-monotonic in five places — most importantly
 * 0145_xero_finance_foundation_repair — and five historical rows were stamped with wall-clock
 * time instead of their journal `when`, which pushed the threshold past every pending entry.
 *
 * This applies the same migration files, in journal array order, deciding purely on migration
 * hash presence. It creates nothing by hand, renumbers nothing, and stops on the first failure.
 *
 * Usage (from packages/db):
 *   node scripts/apply-staging-journal-chain.mjs            # dry run
 *   node scripts/apply-staging-journal-chain.mjs --apply
 *   node scripts/apply-staging-journal-chain.mjs --apply --through 0171_xero_complete_historical_sync
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

const APPLY = process.argv.includes('--apply');
const REALIGN = !process.argv.includes('--no-realign');
const throughIndex = process.argv.indexOf('--through');
const THROUGH = throughIndex >= 0 ? process.argv[throughIndex + 1] : null;

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
if (
  !env.DATABASE_URL ||
  env.DATABASE_URL.toLowerCase().includes(FORBIDDEN) ||
  !env.DATABASE_URL.includes(STAGING)
) {
  console.error(JSON.stringify({ ok: false, error: 'DATABASE_URL staging guard failed' }));
  process.exit(3);
}

const journal = JSON.parse(fs.readFileSync(path.join(root, 'drizzle/meta/_journal.json'), 'utf8'));
const db = postgres(env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

const report = {
  label: 'apply-staging-journal-chain',
  mode: APPLY ? 'apply' : 'dry-run',
  startedAt: new Date().toISOString(),
  through: THROUGH,
  realignedRows: [],
  applied: [],
  skippedAlreadyApplied: 0,
  failure: null,
};

try {
  const appliedRows = await db`SELECT hash, created_at FROM drizzle.__drizzle_migrations`;
  const appliedHashes = new Set(appliedRows.map((r) => r.hash));
  report.appliedBefore = appliedRows.length;

  const planned = [];
  for (const entry of journal.entries) {
    const file = path.join(root, `drizzle/${entry.tag}.sql`);
    if (!fs.existsSync(file)) {
      report.failure = { tag: entry.tag, error: 'migration file missing on disk' };
      break;
    }
    const body = fs.readFileSync(file, 'utf8');
    const hash = crypto.createHash('sha256').update(body).digest('hex');
    if (appliedHashes.has(hash)) {
      report.skippedAlreadyApplied += 1;
      continue;
    }
    planned.push({ entry, hash, body });
    if (THROUGH && entry.tag === THROUGH) break;
  }

  report.plannedCount = planned.length;
  report.plannedTags = planned.map((p) => p.entry.tag);

  if (report.failure) throw new Error(report.failure.error);

  // Realign historical rows stamped with wall-clock time back to their journal `when`, so the
  // standard drizzle-kit migrate threshold is meaningful again after this run.
  if (APPLY && REALIGN) {
    const hashToWhen = new Map();
    for (const entry of journal.entries) {
      const file = path.join(root, `drizzle/${entry.tag}.sql`);
      if (!fs.existsSync(file)) continue;
      const h = crypto.createHash('sha256').update(fs.readFileSync(file, 'utf8')).digest('hex');
      hashToWhen.set(h, { when: entry.when, tag: entry.tag });
    }
    for (const row of appliedRows) {
      const target = hashToWhen.get(row.hash);
      if (!target) continue;
      if (String(row.created_at) === String(target.when)) continue;
      await db`UPDATE drizzle.__drizzle_migrations SET created_at = ${target.when} WHERE hash = ${row.hash}`;
      report.realignedRows.push({
        tag: target.tag,
        from: String(row.created_at),
        to: String(target.when),
      });
    }
  }

  if (APPLY) {
    for (const { entry, hash, body } of planned) {
      const startedAt = Date.now();
      try {
        await db.begin(async (tx) => {
          await tx.unsafe(body);
          await tx`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${hash}, ${entry.when})`;
        });
        report.applied.push({ tag: entry.tag, ms: Date.now() - startedAt });
        console.log(`applied ${entry.tag} (${Date.now() - startedAt}ms)`);
      } catch (error) {
        report.failure = {
          tag: entry.tag,
          message: error?.message ?? String(error),
          code: error?.code ?? null,
          detail: error?.detail ?? null,
          position: error?.position ?? null,
          where: error?.where ?? null,
        };
        console.error(`FAILED at ${entry.tag}: ${report.failure.message}`);
        break;
      }
    }
  }

  const after = await db`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`;
  report.appliedAfter = after[0].n;
  report.journalCount = journal.entries.length;
  report.complete = report.appliedAfter === journal.entries.length && !report.failure;
} finally {
  await db.end({ timeout: 5 });
}

report.finishedAt = new Date().toISOString();
fs.mkdirSync(path.join(repoRoot, 'diagnostic-output'), { recursive: true });
fs.writeFileSync(
  path.join(repoRoot, `diagnostic-output/apply-staging-journal-chain.${report.mode}.json`),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      mode: report.mode,
      appliedBefore: report.appliedBefore,
      appliedAfter: report.appliedAfter,
      journalCount: report.journalCount,
      plannedCount: report.plannedCount,
      appliedNow: report.applied.length,
      realigned: report.realignedRows.length,
      complete: report.complete,
      failure: report.failure,
    },
    null,
    2,
  ),
);

if (report.failure) process.exit(5);
