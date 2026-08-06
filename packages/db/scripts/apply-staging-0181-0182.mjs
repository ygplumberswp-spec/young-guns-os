/**
 * XERO-003B — apply ONLY 0181 and 0182 to staging (hash-guarded, skips 0174).
 *
 * Usage:
 *   node scripts/apply-staging-0181-0182.mjs           # dry-run
 *   node scripts/apply-staging-0181-0182.mjs --apply
 *   node scripts/apply-staging-0181-0182.mjs --apply --only 0181_xero_realtime_intersync
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
const onlyIndex = process.argv.indexOf('--only');
const ONLY = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : null;

const TAGS = [
  { tag: '0181_xero_realtime_intersync', when: 1785866000000 },
  { tag: '0182_bank_statement_manual_import', when: 1785867000000 },
];

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

const selected = ONLY ? TAGS.filter((t) => t.tag === ONLY) : TAGS;
if (ONLY && selected.length === 0) {
  console.error(JSON.stringify({ ok: false, error: `unknown --only tag ${ONLY}` }));
  process.exit(4);
}

const db = postgres(env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

const report = {
  label: 'apply-staging-0181-0182',
  mode: APPLY ? 'apply' : 'dry-run',
  startedAt: new Date().toISOString(),
  stagingRef: STAGING,
  planned: [],
  applied: [],
  skipped: [],
  failure: null,
};

try {
  const appliedRows = await db`SELECT hash, created_at FROM drizzle.__drizzle_migrations`;
  const appliedHashes = new Set(appliedRows.map((r) => r.hash));
  report.appliedBefore = appliedRows.length;

  for (const { tag, when } of selected) {
    const file = path.join(root, `drizzle/${tag}.sql`);
    if (!fs.existsSync(file)) {
      report.failure = { tag, error: 'migration file missing' };
      break;
    }
    const body = fs.readFileSync(file, 'utf8');
    const hash = crypto.createHash('sha256').update(body).digest('hex');
    const partialTableCheck =
      tag === '0181_xero_realtime_intersync'
        ? await db`SELECT to_regclass('public.xero_webhook_events') IS NOT NULL AS exists`
        : tag === '0182_bank_statement_manual_import'
          ? await db`SELECT to_regclass('public.bank_statement_import_batches') IS NOT NULL AS exists`
          : [{ exists: false }];

    if (appliedHashes.has(hash)) {
      report.skipped.push({ tag, reason: 'hash already in journal' });
      continue;
    }
    if (partialTableCheck[0]?.exists) {
      report.failure = { tag, error: 'partial apply detected — table exists but hash missing' };
      break;
    }

    report.planned.push({ tag, hash: hash.slice(0, 12) + '…' });

    if (APPLY) {
      const startedAt = Date.now();
      try {
        await db.begin(async (tx) => {
          await tx.unsafe(body);
          await tx`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${hash}, ${when})`;
        });
        appliedHashes.add(hash);
        report.applied.push({ tag, ms: Date.now() - startedAt });
        console.log(`applied ${tag} (${Date.now() - startedAt}ms)`);
      } catch (error) {
        report.failure = {
          tag,
          message: error?.message ?? String(error),
          code: error?.code ?? null,
        };
        break;
      }
    }
  }

  const after = await db`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`;
  report.appliedAfter = after[0].n;
} finally {
  await db.end({ timeout: 5 });
}

report.finishedAt = new Date().toISOString();
const outFile = path.join(
  repoRoot,
  `diagnostic-output/apply-staging-0181-0182.${report.mode}.json`,
);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.failure) process.exit(5);
