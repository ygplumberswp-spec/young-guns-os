/**
 * JPE-001B — apply ONLY 0184_job_profitability_engine to staging.
 * Skips 0183 (Xero rate-budget) per Xero isolation rules.
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
const TAG = '0184_job_profitability_engine';
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
const entry = journal.entries.find((e) => e.tag === TAG);
if (!entry) {
  console.error('0184 not in journal');
  process.exit(4);
}

const body = fs.readFileSync(path.join(root, `drizzle/${TAG}.sql`), 'utf8');
const hash = crypto.createHash('sha256').update(body).digest('hex');
const db = postgres(env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

const report = {
  label: 'apply-staging-0184-jpe',
  mode: APPLY ? 'apply' : 'dry-run',
  stagingRef: STAGING,
  tag: TAG,
  hashPrefix: hash.slice(0, 12),
  startedAt: new Date().toISOString(),
};

try {
  const applied = await db`SELECT hash FROM drizzle.__drizzle_migrations`;
  report.appliedBefore = applied.length;
  report.alreadyApplied = applied.some((r) => r.hash === hash);

  const tables = [
    'job_profitability_adjustments',
    'job_direct_cost_entries',
    'job_profitability_snapshots',
  ];
  report.tablesBefore = {};
  for (const t of tables) {
    const r = await db`SELECT to_regclass(${`public.${t}`}) IS NOT NULL AS exists`;
    report.tablesBefore[t] = Boolean(r[0]?.exists);
  }

  if (report.alreadyApplied) {
    report.action = 'skip_already_applied';
  } else if (Object.values(report.tablesBefore).some(Boolean)) {
    report.action = 'blocked_partial_schema';
    report.failure = 'JPE tables exist but migration hash missing';
  } else if (APPLY) {
    const started = Date.now();
    await db.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${hash}, ${entry.when})`;
    });
    report.action = 'applied';
    report.ms = Date.now() - started;
  } else {
    report.action = 'would_apply';
  }

  report.tablesAfter = {};
  for (const t of tables) {
    const r = await db`SELECT to_regclass(${`public.${t}`}) IS NOT NULL AS exists`;
    report.tablesAfter[t] = Boolean(r[0]?.exists);
  }
  const after = await db`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`;
  report.appliedAfter = after[0].n;
} finally {
  await db.end({ timeout: 5 });
}

report.finishedAt = new Date().toISOString();
const outFile = path.join(repoRoot, `diagnostic-output/apply-staging-0184-jpe.${report.mode}.json`);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.failure) process.exit(5);
