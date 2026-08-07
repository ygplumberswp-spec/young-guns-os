/**
 * BANK-002A — apply ONLY 0190_finance_receipt_reconciliation to staging.
 * Uses hash-presence journal semantics (see apply-staging-journal-chain.mjs).
 *
 * Usage:
 *   node packages/db/scripts/apply-staging-0190-bank002.mjs           # dry run
 *   node packages/db/scripts/apply-staging-0190-bank002.mjs --apply
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
const TAG = '0190_finance_receipt_reconciliation';
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
  label: 'apply-staging-0190-bank002',
  mode: APPLY ? 'apply' : 'dry-run',
  stagingRef: STAGING,
  tag: TAG,
  startedAt: new Date().toISOString(),
  migrations: [],
};

function hashBody(body) {
  return crypto.createHash('sha256').update(body).digest('hex');
}

const PROTECTED_TABLES = [
  'companies',
  'users',
  'jobs',
  'job_direct_cost_entries',
  'bank_transactions',
  'bank_transaction_allocations',
  'documents',
  'suppliers',
];

try {
  const appliedRows = await db`SELECT hash, created_at FROM drizzle.__drizzle_migrations`;
  const appliedHashes = new Set(appliedRows.map((r) => r.hash));
  report.appliedBefore = appliedRows.length;
  report.journalCount = journal.entries.length;

  const protectedCountsBefore = {};
  for (const table of PROTECTED_TABLES) {
    const row = await db.unsafe(`SELECT count(*)::int AS n FROM ${table}`);
    protectedCountsBefore[table] = row[0].n;
  }
  report.protectedCountsBefore = protectedCountsBefore;

  const entry = journal.entries.find((e) => e.tag === TAG);
  if (!entry) {
    report.failure = { tag: TAG, error: 'not in journal' };
    throw new Error('migration not in journal');
  }

  const body = fs.readFileSync(path.join(root, `drizzle/${TAG}.sql`), 'utf8');
  const hash = hashBody(body);
  report.migrationHash = hash;
  report.migrationHashPrefix = hash.slice(0, 12);

  const item = {
    tag: TAG,
    hashPrefix: hash.slice(0, 12),
    alreadyApplied: appliedHashes.has(hash),
    destructive: /\b(DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE)\b/i.test(body),
    additiveObjects: [
      'supplier_aliases',
      'finance_receipt_records',
      'finance_receipt_transaction_links',
      'finance_receipt_audit_logs',
      'bank_transactions.confirmed_supplier_id',
      'bank_transaction_receipt_status.receipt_needs_review',
    ],
  };

  if (item.alreadyApplied) {
    item.action = 'skip_already_applied';
  } else if (APPLY) {
    const started = Date.now();
    await db.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${hash}, ${entry.when})`;
    });
    item.action = 'applied';
    item.ms = Date.now() - started;
  } else {
    item.action = 'would_apply';
  }
  report.migrations.push(item);

  const tablesAfter = await db`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'supplier_aliases',
        'finance_receipt_records',
        'finance_receipt_transaction_links',
        'finance_receipt_audit_logs'
      )
    ORDER BY table_name
  `;
  report.bank002TablesPresent = tablesAfter.map((r) => r.table_name);

  const confirmedCol = await db`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bank_transactions' AND column_name = 'confirmed_supplier_id'
  `;
  report.confirmedSupplierColumn = confirmedCol.length > 0;

  const protectedCountsAfter = {};
  for (const table of PROTECTED_TABLES) {
    const row = await db.unsafe(`SELECT count(*)::int AS n FROM ${table}`);
    protectedCountsAfter[table] = row[0].n;
  }
  report.protectedCountsAfter = protectedCountsAfter;
  report.protectedCountsUnchanged = PROTECTED_TABLES.every(
    (t) => protectedCountsBefore[t] === protectedCountsAfter[t],
  );

  const appliedAfter = await db`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`;
  report.appliedAfter = appliedAfter[0].n;
} finally {
  await db.end({ timeout: 5 });
}

report.finishedAt = new Date().toISOString();
report.migrationSafety = {
  additiveOnly: report.migrations.every((m) => !m.destructive),
  protectedCountsUnchanged: report.protectedCountsUnchanged,
  bank002TablesReady: report.bank002TablesPresent?.length === 4,
  confirmedSupplierColumn: report.confirmedSupplierColumn,
};

const outFile = path.join(
  repoRoot,
  `diagnostic-output/apply-staging-0190-bank002.${report.mode}.json`,
);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.failure) process.exit(5);
