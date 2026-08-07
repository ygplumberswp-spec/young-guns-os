/**
 * JPE-004A — apply ONLY 0186_job_financial_linkage and 0187_job_cost_capture to staging.
 * Uses hash-presence journal semantics (see apply-staging-journal-chain.mjs).
 *
 * Usage:
 *   node packages/db/scripts/apply-staging-0186-0187-jpe.mjs           # dry run
 *   node packages/db/scripts/apply-staging-0186-0187-jpe.mjs --apply
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
const TAGS = ['0186_job_financial_linkage', '0187_job_cost_capture'];
const APPLY = process.argv.includes('--apply');

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
if (env.APP_ENV !== 'staging' || env.TITAN_ENV !== 'staging') process.exit(2);
if (!env.DATABASE_URL?.includes(STAGING) || env.DATABASE_URL.includes(FORBIDDEN)) process.exit(3);

const journal = JSON.parse(fs.readFileSync(path.join(root, 'drizzle/meta/_journal.json'), 'utf8'));
const db = postgres(env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

const report = {
  label: 'apply-staging-0186-0187-jpe',
  mode: APPLY ? 'apply' : 'dry-run',
  stagingRef: STAGING,
  tags: TAGS,
  startedAt: new Date().toISOString(),
  migrations: [],
};

function hashBody(body) {
  return crypto.createHash('sha256').update(body).digest('hex');
}

try {
  const appliedRows = await db`SELECT hash, created_at FROM drizzle.__drizzle_migrations`;
  const appliedHashes = new Set(appliedRows.map((r) => r.hash));
  report.appliedBefore = appliedRows.length;

  const timeCountBefore = await db`SELECT count(*)::int AS n FROM mobile_time_entries`;
  report.timeEntryCountBefore = timeCountBefore[0].n;

  const colBefore = await db`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mobile_time_entries' AND column_name = 'client_action_id'
  `;
  report.clientActionColumnBefore = colBefore.length > 0;

  for (const tag of TAGS) {
    const entry = journal.entries.find((e) => e.tag === tag);
    if (!entry) {
      report.failure = { tag, error: 'not in journal' };
      break;
    }
    const body = fs.readFileSync(path.join(root, `drizzle/${tag}.sql`), 'utf8');
    const hash = hashBody(body);
    const item = {
      tag,
      hashPrefix: hash.slice(0, 12),
      alreadyApplied: appliedHashes.has(hash),
      destructive: /\b(DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE)\b/i.test(body),
    };
    if (item.alreadyApplied) {
      item.action = 'skip_already_applied';
    } else if (APPLY) {
      const started = Date.now();
      await db.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${hash}, ${entry.when})`;
      });
      appliedHashes.add(hash);
      item.action = 'applied';
      item.ms = Date.now() - started;
    } else {
      item.action = 'would_apply';
    }
    report.migrations.push(item);
  }

  const colAfter = await db`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mobile_time_entries' AND column_name = 'client_action_id'
  `;
  report.clientActionColumnAfter = colAfter.length > 0;

  const idxAfter = await db`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'mobile_time_entries'
      AND indexname = 'mobile_time_entries_company_client_action_idx'
  `;
  report.clientActionIndexAfter = idxAfter.length > 0;

  const timeCountAfter = await db`SELECT count(*)::int AS n FROM mobile_time_entries`;
  report.timeEntryCountAfter = timeCountAfter[0].n;
  report.timeEntryCountUnchanged = report.timeEntryCountBefore === report.timeEntryCountAfter;

  const appliedAfter = await db`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`;
  report.appliedAfter = appliedAfter[0].n;
} finally {
  await db.end({ timeout: 5 });
}

report.finishedAt = new Date().toISOString();
report.migrationSafety = {
  additiveOnly: report.migrations.every((m) => !m.destructive),
  timeEntriesPreserved: report.timeEntryCountUnchanged,
  clientActionIdReady: report.clientActionColumnAfter,
  idempotencyIndexReady: report.clientActionIndexAfter,
};

const outFile = path.join(
  repoRoot,
  `diagnostic-output/apply-staging-0186-0187-jpe.${report.mode}.json`,
);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.failure) process.exit(5);
