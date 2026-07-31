/**
 * Apply drizzle journal to staging only.
 * - Loads apps/api/.env.staging.local
 * - Refuses forbidden live project ref
 * - Never prints DATABASE_URL / credentials
 *
 * Usage (from packages/db):
 *   node scripts/migrate-staging-safe.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '../..');
const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';

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
  console.error('NO-GO: APP_ENV/TITAN_ENV must be staging');
  process.exit(2);
}
if (!env.DATABASE_URL) {
  console.error('NO-GO: DATABASE_URL missing');
  process.exit(2);
}
if (env.DATABASE_URL.toLowerCase().includes(FORBIDDEN)) {
  console.error('NO-GO: refuses forbidden live project ref');
  process.exit(3);
}

const journal = JSON.parse(fs.readFileSync(path.join(root, 'drizzle/meta/_journal.json'), 'utf8'));
const expectedTags = journal.entries.map((e) => e.tag);
const expectedCount = expectedTags.length;

console.log(
  JSON.stringify({
    phase: 'pre-migrate',
    expectedJournalCount: expectedCount,
    firstTag: expectedTags[0],
    lastTag: expectedTags[expectedCount - 1],
    has0094: expectedTags.includes('0094_canonical_role_matrix'),
    has0095: expectedTags.includes('0095_job_operational_contract'),
  }),
);

const childEnv = {
  ...process.env,
  DATABASE_URL: env.DATABASE_URL,
  APP_ENV: 'staging',
  TITAN_ENV: 'staging',
  // Prevent accidental use of apps/api/.env by drizzle tooling
  DOTENV_CONFIG_PATH: '',
};

const drizzleKitBin = path.join(root, 'node_modules/.bin/drizzle-kit');
const result = spawnSync(drizzleKitBin, ['migrate'], {
  cwd: root,
  env: childEnv,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

function redact(text) {
  return String(text || '')
    .replace(/postgresql:\/\/[^\s"']+/gi, '[redacted-db-url]')
    .replace(/postgres:\/\/[^\s"']+/gi, '[redacted-db-url]');
}

const stdout = redact(result.stdout);
const stderr = redact(result.stderr);
console.log(JSON.stringify({ phase: 'drizzle-kit-migrate', exitCode: result.status }));
if (stdout.trim()) console.log(stdout.slice(0, 4000));
if (stderr.trim()) console.error(stderr.slice(0, 4000));

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
try {
  const rows = await sql`
    select id, hash, created_at
    from drizzle.__drizzle_migrations
    order by created_at asc, id asc
  `;
  const appliedCount = rows.length;
  const has0096Tables = await sql`
    select count(*)::int as n
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'job_crew_members',
        'job_vehicle_assignments',
        'job_workflow_events',
        'job_variations',
        'job_completion_snapshots',
        'job_material_lines'
      )
  `;
  const report = {
    phase: 'post-migrate',
    expectedJournalCount: expectedCount,
    appliedMigrationRowCount: appliedCount,
    countsMatch: appliedCount === expectedCount,
    lastAppliedCreatedAt: rows.at(-1)?.created_at ?? null,
    appliedHashCount: rows.length,
    uxBTablesPresent: has0096Tables[0].n === 6,
    has0096: expectedTags.includes('0096_job_execution_crew_contract'),
  };
  console.log(JSON.stringify(report, null, 2));
  fs.mkdirSync(path.join(repoRoot, 'diagnostic-output'), { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, 'diagnostic-output/32-staging-migrate-0096-result.json'),
    JSON.stringify({ ...report, drizzleKitExitCode: result.status }, null, 2),
  );
  if (!report.countsMatch || !report.uxBTablesPresent) {
    console.error('NO-GO: applied migration count or UX-B tables mismatch');
    process.exit(4);
  }
} finally {
  await sql.end({ timeout: 5 });
}