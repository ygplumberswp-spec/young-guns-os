/**
 * Apply 0122 Gmail OAuth provider enum on staging only.
 * Loads apps/api/.env.staging.local; refuses production ref.
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
const TAG = '0122_gmail_oauth_provider';

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
if (!env.DATABASE_URL || env.DATABASE_URL.includes(FORBIDDEN) || !env.DATABASE_URL.includes(STAGING)) {
  console.error(JSON.stringify({ ok: false, error: 'DATABASE_URL staging guard failed' }));
  process.exit(3);
}

const journal = JSON.parse(fs.readFileSync(path.join(root, 'drizzle/meta/_journal.json'), 'utf8'));
const entry = journal.entries.find((e) => e.tag === TAG);
if (!entry) {
  console.error(JSON.stringify({ ok: false, error: 'journal entry missing' }));
  process.exit(4);
}

const migrationSql = fs.readFileSync(path.join(root, `drizzle/${TAG}.sql`), 'utf8');
const hash = crypto.createHash('sha256').update(migrationSql).digest('hex');
const db = postgres(env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

try {
  const existing = await db`select hash from drizzle.__drizzle_migrations where hash = ${hash}`;
  let status;
  if (existing.length > 0) {
    status = 'already_applied';
  } else {
    await db.begin(async (tx) => {
      await tx.unsafe(migrationSql);
      await tx`
        insert into drizzle.__drizzle_migrations (hash, created_at)
        values (${hash}, ${entry.when})
      `;
    });
    status = 'applied';
  }

  const providerEnum = await db`
    select e.enumlabel
    from pg_type t
    join pg_enum e on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'integration_provider'
    order by e.enumsortorder
  `;
  const linkEnum = await db`
    select e.enumlabel
    from pg_type t
    join pg_enum e on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'comm_platform_link_target_type'
    order by e.enumsortorder
  `;

  console.log(JSON.stringify({
    ok: true,
    migration: TAG,
    status,
    hash,
    hasGmailProvider: providerEnum.some((r) => r.enumlabel === 'gmail'),
    hasLeadLinkTarget: linkEnum.some((r) => r.enumlabel === 'lead'),
    dbGuard: { stagingRef: STAGING, productionRefBlocked: FORBIDDEN },
  }, null, 2));
} finally {
  await db.end({ timeout: 5 });
}
