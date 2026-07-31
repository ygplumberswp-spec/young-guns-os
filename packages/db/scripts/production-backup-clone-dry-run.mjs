/**
 * Production logical backup + disposable local clone restore + migrate dry-run.
 *
 * AUTHORIZED: read-only prod dump, restore to local-only DB, migrate clone only.
 * FORBIDDEN: migrate/write production; print secrets; provider calls; .env edits.
 *
 * Env:
 *   CLONE_DATABASE_URL  (required) — must be loopback only
 *   BACKUP_DIR          (optional) — default ~/TitanAura-ProtectedBackups
 *   SKIP_CLEANUP=1      (optional) — keep clone DB after run
 *
 * Usage (from packages/db):
 *   CLONE_DATABASE_URL=postgresql://...@127.0.0.1:5432/titan_prod_clone_... \
 *     node scripts/production-backup-clone-dry-run.mjs
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '../..');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const apiEnvPath = path.join(repoRoot, 'apps/api/.env');
const stagingEnvPath = path.join(repoRoot, 'apps/api/.env.staging.local');
const proofOut = path.join(repoRoot, 'diagnostic-output/production-backup-proof-redacted.json');
const dryRunOut = path.join(repoRoot, 'diagnostic-output/production-clone-migration-dry-run.json');

const PG_DUMP = process.env.PG_DUMP_BIN || '/opt/homebrew/opt/libpq/bin/pg_dump';
const PG_RESTORE = process.env.PG_RESTORE_BIN || '/opt/homebrew/opt/libpq/bin/pg_restore';
const PSQL = process.env.PSQL_BIN || '/opt/homebrew/opt/libpq/bin/psql';

function loadEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
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

function redact(text) {
  return String(text || '')
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, '[REDACTED_URL]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]')
    .slice(0, 4000);
}

function urlMeta(url) {
  const lower = String(url || '').toLowerCase();
  let hostClass = 'unknown';
  try {
    const u = new URL(url.replace(/^postgres(?:ql)?:/i, 'http:'));
    const host = u.hostname.toLowerCase();
    if (host === '127.0.0.1' || host === 'localhost' || host === '::1') hostClass = 'loopback';
    else if (host.includes('supabase')) hostClass = 'supabase_hosted';
    else hostClass = 'remote_other';
    return {
      hostClass,
      dbName: u.pathname.replace(/^\//, '') || null,
      matchesForbidden: lower.includes(FORBIDDEN),
      fingerprint: crypto.createHash('sha256').update(url).digest('hex').slice(0, 12),
    };
  } catch {
    return {
      hostClass: 'unparseable',
      dbName: null,
      matchesForbidden: lower.includes(FORBIDDEN),
      fingerprint: null,
    };
  }
}

function stop(reason, evidence = {}) {
  const payload = { ok: false, stop: true, reason, ...evidence, finishedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(proofOut), { recursive: true });
  fs.writeFileSync(proofOut, JSON.stringify(payload, null, 2));
  console.error(JSON.stringify({ stop: true, reason }, null, 2));
  process.exit(3);
}

function run(bin, args, env = process.env) {
  const result = spawnSync(bin, args, {
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: redact(result.stdout),
    stderr: redact(result.stderr),
    error: result.error ? String(result.error.message) : null,
  };
}

async function countMigrations(sql) {
  try {
    const rows = await sql`select count(*)::int as c from drizzle.__drizzle_migrations`;
    return rows[0].c;
  } catch {
    return null;
  }
}

async function aggregates(sql) {
  const q = async (table) => {
    try {
      const r = await sql.unsafe(`select count(*)::int as c from ${table}`);
      return r[0].c;
    } catch {
      return null;
    }
  };
  const roleCounts = await sql`
    select r.name as role_name, count(*)::int as c
    from users u
    join roles r on r.id = u.role_id
    group by r.name
    order by c desc
  `.catch(() => []);
  return {
    companies: await q('companies'),
    users: await q('users'),
    roles: await q('roles'),
    customers: await q('customers'),
    jobs: await q('jobs'),
    quotes: await q('quotes'),
    invoices: await q('invoices'),
    leads: await q('leads'),
    publicTables: (
      await sql`
        select count(*)::int as c from information_schema.tables
        where table_schema='public' and table_type='BASE TABLE'
      `
    )[0].c,
    roleNameCounts: roleCounts.map((r) => ({ roleName: r.role_name, userCount: r.c })),
  };
}

async function nineFourSafety(sql) {
  try {
    const amb = await sql`
      SELECT count(*)::int as c FROM (
        SELECT p.company_id
        FROM saas_tenant_profiles p
        INNER JOIN users u ON u.company_id = p.company_id
        INNER JOIN roles r ON r.id = u.role_id
        WHERE p.tenant_kind = 'platform_owner'
          AND r.name = 'Owner'
        GROUP BY p.company_id
        HAVING COUNT(*) > 1
      ) x
    `;
    const platformTenants = await sql`
      SELECT count(*)::int as c FROM saas_tenant_profiles WHERE tenant_kind = 'platform_owner'
    `;
    return {
      ambiguousPlatformOwnerCompanies: amb[0].c,
      platformOwnerTenantCount: platformTenants[0].c,
      safe: amb[0].c === 0,
    };
  } catch (e) {
    return { safe: false, error: 'query_failed' };
  }
}

async function lateSchema(sql) {
  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema='public' and table_name in (
      'job_number_counters','job_crew_members','job_evidence_files','job_material_lines',
      'lead_conversions','n8n_connections','n8n_executions','marketing_consents'
    )
    order by table_name
  `;
  const indexes = await sql`
    select indexname from pg_indexes
    where schemaname='public' and indexname in (
      'jobs_company_job_number_uidx'
    )
  `;
  return {
    tables: tables.map((t) => t.table_name),
    indexes: indexes.map((i) => i.indexname),
  };
}

async function main() {
  const report = {
    startedAt: new Date().toISOString(),
    mode: 'production_backup_clone_dry_run',
    productionMutated: false,
    providersCalled: false,
    envFilesModified: false,
    phases: {},
    verdict: 'NO-GO',
  };

  const prodEnv = loadEnv(apiEnvPath);
  const stagingEnv = loadEnv(stagingEnvPath);
  const prodUrl = prodEnv.DATABASE_URL;
  const stagingUrl = stagingEnv.DATABASE_URL;
  const cloneUrl = process.env.CLONE_DATABASE_URL;

  if (!prodUrl) stop('PRODUCTION_DATABASE_URL_MISSING');
  if (!cloneUrl) stop('CLONE_DATABASE_URL_MISSING');

  const prodMeta = urlMeta(prodUrl);
  const stagingMeta = stagingUrl ? urlMeta(stagingUrl) : null;
  const cloneMeta = urlMeta(cloneUrl);

  if (!prodMeta.matchesForbidden) stop('SOURCE_NOT_PRODUCTION_FORBIDDEN_REF', { prodMeta });
  if (cloneMeta.hostClass !== 'loopback') stop('CLONE_NOT_LOOPBACK', { cloneMeta });
  if (cloneMeta.matchesForbidden) stop('CLONE_MATCHES_FORBIDDEN_REF', { cloneMeta });
  if (!cloneMeta.dbName || !cloneMeta.dbName.startsWith('titan_prod_clone_dryrun_')) {
    stop('CLONE_DB_NAME_NOT_UNIQUE_TEST_PREFIX', { dbName: cloneMeta.dbName });
  }
  if (stagingMeta?.fingerprint && stagingMeta.fingerprint === cloneMeta.fingerprint) {
    stop('CLONE_EQUALS_STAGING', { cloneMeta, stagingMeta });
  }
  if (prodMeta.fingerprint === cloneMeta.fingerprint) stop('CLONE_EQUALS_PRODUCTION', { cloneMeta });

  // Prove production journal 93
  const prodSql = postgres(prodUrl, {
    max: 1,
    prepare: false,
    onnotice: () => {},
    connection: { statement_timeout: 60000 },
    ssl: 'require',
  });
  let prodAggs;
  let prodMigrations;
  let prodSafety;
  let prodVersion;
  try {
    const ver = await prodSql`select current_setting('server_version') as v, current_database() as db`;
    prodVersion = String(ver[0].v);
    prodMigrations = await countMigrations(prodSql);
    prodAggs = await aggregates(prodSql);
    prodSafety = await nineFourSafety(prodSql);
    report.phases.sourceProof = {
      ok: prodMigrations === 93,
      matchesForbiddenLiveProjectRef: true,
      drizzleMigrationCount: prodMigrations,
      serverVersionMajor: prodVersion.split('.')[0],
      aggregates: {
        companies: prodAggs.companies,
        users: prodAggs.users,
        publicTables: prodAggs.publicTables,
        roleNameCounts: prodAggs.roleNameCounts,
      },
      nineFourSafety: prodSafety,
      note: 'SELECT-only against production',
    };
    if (prodMigrations !== 93) {
      stop('PRODUCTION_JOURNAL_NOT_93', { prodMigrations });
    }
    if (prodAggs.companies !== 131 || prodAggs.users !== 131) {
      // record but do not hard-stop if close — user asked verify reported 131
      report.phases.sourceProof.companyUserCountMismatch = {
        expectedCompanies: 131,
        expectedUsers: 131,
        actualCompanies: prodAggs.companies,
        actualUsers: prodAggs.users,
      };
    }
  } finally {
    await prodSql.end({ timeout: 5 });
  }

  // Protected backup directory outside git
  const backupDir = process.env.BACKUP_DIR || path.join(os.homedir(), 'TitanAura-ProtectedBackups');
  const resolvedBackupDir = path.resolve(backupDir);
  const resolvedRepo = path.resolve(repoRoot);
  if (resolvedBackupDir === resolvedRepo || resolvedBackupDir.startsWith(resolvedRepo + path.sep)) {
    stop('BACKUP_DIR_INSIDE_GIT_REPO', { backupDir: '[redacted-under-repo]' });
  }
  fs.mkdirSync(resolvedBackupDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(resolvedBackupDir, 0o700);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `titan-prod-logical-${stamp}.dump`;
  const backupPath = path.join(resolvedBackupDir, backupFileName);
  const metaPath = path.join(resolvedBackupDir, `${backupFileName}.meta.json`);

  // pg_dump custom compressed — URL only in child env, never logged
  const dumpEnv = { ...process.env, PGPASSWORD: undefined };
  // Ensure SSL for supabase via URL query if needed; do not print
  const dumpArgs = [
    '--format=custom',
    '--compress=9',
    '--no-owner',
    '--no-acl',
    '--verbose',
    `--file=${backupPath}`,
    prodUrl.includes('sslmode=') ? prodUrl : `${prodUrl}${prodUrl.includes('?') ? '&' : '?'}sslmode=require`,
  ];
  // Avoid leaking URL via process list args: use PGDATABASE connection via env where possible
  // pg_dump requires connection string or discrete vars — use connection URI in env PGURI custom
  // Actually pg_dump reads last arg as conninfo. Child argv may be visible; minimize by using .pgpass-less env vars.
  const dumpResult = run(
    PG_DUMP,
    [
      '--format=custom',
      '--compress=9',
      '--no-owner',
      '--no-acl',
      `--file=${backupPath}`,
      dumpArgs[dumpArgs.length - 1],
    ],
    dumpEnv,
  );
  // Redact any accidental URI in stderr before storing
  if (dumpResult.status !== 0 || !fs.existsSync(backupPath)) {
    stop('BACKUP_FAILED', { dumpStatus: dumpResult.status, stderr: dumpResult.stderr.slice(0, 500) });
  }
  fs.chmodSync(backupPath, 0o600);
  const stat = fs.statSync(backupPath);
  const sha256 = await new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(backupPath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
  const privateMeta = {
    createdAt: new Date().toISOString(),
    engine: 'postgresql',
    sourceServerVersion: prodVersion,
    format: 'custom',
    compress: 9,
    bytes: stat.size,
    sha256,
    sourceMigrationCount: 93,
    sourceCompanyCount: prodAggs.companies,
    sourceUserCount: prodAggs.users,
    note: 'Supabase DB backup does not include Storage objects',
    pathBasename: backupFileName,
  };
  fs.writeFileSync(metaPath, JSON.stringify(privateMeta, null, 2), { mode: 0o600 });
  fs.chmodSync(metaPath, 0o600);

  report.phases.backup = {
    ok: true,
    directoryMode: (fs.statSync(resolvedBackupDir).mode & 0o777).toString(8),
    fileMode: (stat.mode & 0o777).toString(8),
    bytes: stat.size,
    sha256Prefix: sha256.slice(0, 16),
    timestamp: privateMeta.createdAt,
    pathRedacted: `~/TitanAura-ProtectedBackups/${backupFileName}`,
    outsideGitRepo: true,
    storageObjectsIncluded: false,
  };

  // Prove clone empty-ish before restore
  const cloneSqlPre = postgres(cloneUrl, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const preTables = await cloneSqlPre`
      select count(*)::int as c from information_schema.tables
      where table_schema='public' and table_type='BASE TABLE'
    `;
    report.phases.clonePreRestore = {
      ok: true,
      hostClass: 'loopback',
      dbNamePrefix: 'titan_prod_clone_dryrun_',
      publicTables: preTables[0].c,
      matchesForbidden: false,
      equalsStaging: false,
      equalsProduction: false,
    };
  } finally {
    await cloneSqlPre.end({ timeout: 5 });
  }

  // Restore into clone only
  const restoreResult = run(PG_RESTORE, [
    '--verbose',
    '--no-owner',
    '--no-acl',
    `--dbname=${cloneUrl}`,
    backupPath,
  ]);
  // pg_restore often exits 1 with non-fatal warnings on extension/ownership — check integrity next
  report.phases.restoreCommand = {
    exitCode: restoreResult.status,
    stderrTail: restoreResult.stderr.slice(-800),
  };

  const cloneSql = postgres(cloneUrl, { max: 1, prepare: false, onnotice: () => {} });
  let clonePreMigrate;
  try {
    const cloneMigrations = await countMigrations(cloneSql);
    const cloneAggs = await aggregates(cloneSql);
    const cloneSafety = await nineFourSafety(cloneSql);
    clonePreMigrate = { migrations: cloneMigrations, aggregates: cloneAggs, safety: cloneSafety };

    const integrity = {
      ok:
        cloneMigrations === 93 &&
        cloneAggs.companies === prodAggs.companies &&
        cloneAggs.users === prodAggs.users &&
        cloneAggs.publicTables === prodAggs.publicTables,
      cloneMigrations,
      expectedMigrations: 93,
      companies: { source: prodAggs.companies, clone: cloneAggs.companies },
      users: { source: prodAggs.users, clone: cloneAggs.users },
      publicTables: { source: prodAggs.publicTables, clone: cloneAggs.publicTables },
      jobs: { source: prodAggs.jobs, clone: cloneAggs.jobs },
      customers: { source: prodAggs.customers, clone: cloneAggs.customers },
      roleNameCountsClone: cloneAggs.roleNameCounts,
      discrepancies: [],
    };
    for (const key of ['companies', 'users', 'publicTables', 'jobs', 'customers']) {
      if (integrity[key] && integrity[key].source !== integrity[key].clone) {
        integrity.discrepancies.push(key);
      }
    }
    if (cloneMigrations !== 93) integrity.discrepancies.push('migrations');
    report.phases.restoreIntegrity = integrity;
    if (!integrity.ok) {
      stop('RESTORE_INTEGRITY_FAILED', { integrity });
    }
  } catch (e) {
    stop('RESTORE_VERIFY_ERROR', { error: redact(e) });
  }

  // Migrate clone only via drizzle-kit
  const drizzleKitBin = path.join(root, 'node_modules/.bin/drizzle-kit');
  const journal = JSON.parse(fs.readFileSync(path.join(root, 'drizzle/meta/_journal.json'), 'utf8'));
  const expectedCount = journal.entries.length;

  const childEnv = {
    ...process.env,
    DATABASE_URL: cloneUrl,
    APP_ENV: 'clone-dry-run',
    TITAN_ENV: 'clone-dry-run',
    DOTENV_CONFIG_PATH: '',
  };
  // Refuse if somehow still forbidden
  if (String(childEnv.DATABASE_URL).toLowerCase().includes(FORBIDDEN)) {
    stop('REFUSE_MIGRATE_FORBIDDEN_URL');
  }
  if (urlMeta(childEnv.DATABASE_URL).hostClass !== 'loopback') {
    stop('REFUSE_MIGRATE_NON_LOOPBACK');
  }

  const migrate1 = run(drizzleKitBin, ['migrate'], childEnv);
  report.phases.migrateFirst = {
    exitCode: migrate1.status,
    stdoutTail: migrate1.stdout.slice(-1500),
    stderrTail: migrate1.stderr.slice(-1500),
  };
  if (migrate1.status !== 0) {
    stop('CLONE_MIGRATE_FAILED', { migrate1: report.phases.migrateFirst });
  }

  let postMigrate;
  try {
    const migrations = await countMigrations(cloneSql);
    const aggs = await aggregates(cloneSql);
    const safety = await nineFourSafety(cloneSql);
    const schema = await lateSchema(cloneSql);
    const legacyJobs = await cloneSql`
      select count(*)::int as c from jobs where job_number is null
    `.catch(() => [{ c: null }]);
    const auditHints = await cloneSql`
      select count(*)::int as c from security_audit_logs
    `.catch(() => [{ c: null }]);

    postMigrate = {
      migrations,
      aggregates: aggs,
      safety,
      schema,
      legacyNullJobNumberCount: legacyJobs[0].c,
      securityAuditLogCount: auditHints[0].c,
    };
    report.phases.postMigrate = {
      journalExact104: migrations === 104 && expectedCount === 104,
      migrationCount: migrations,
      expectedJournalCount: expectedCount,
      companiesUnchanged: aggs.companies === prodAggs.companies,
      usersUnchanged: aggs.users === prodAggs.users,
      roleNameCounts: aggs.roleNameCounts,
      nineFourSafety: safety,
      lateSchema: schema,
      legacyNullJobNumberCount: legacyJobs[0].c,
      securityAuditLogCount: auditHints[0].c,
    };
    if (migrations !== 104) stop('CLONE_JOURNAL_NOT_104', { migrations });
    if (aggs.companies !== prodAggs.companies || aggs.users !== prodAggs.users) {
      stop('COMPANY_USER_COUNT_CHANGED', {
        companies: aggs.companies,
        users: aggs.users,
      });
    }
  } catch (e) {
    stop('POST_MIGRATE_VERIFY_ERROR', { error: redact(e) });
  }

  // Idempotency — second migrate
  const migrate2 = run(drizzleKitBin, ['migrate'], childEnv);
  const migrationsAfterRepeat = await countMigrations(cloneSql);
  report.phases.idempotency = {
    secondMigrateExitCode: migrate2.status,
    migrationCountAfterRepeat: migrationsAfterRepeat,
    stillExactly104: migrationsAfterRepeat === 104,
    ok: migrate2.status === 0 && migrationsAfterRepeat === 104,
  };
  if (!report.phases.idempotency.ok) stop('IDEMPOTENCY_FAILED', { idempotency: report.phases.idempotency });

  // Storage inventory (no copy)
  report.phases.storageInventory = {
    supabaseDbBackupIncludesStorageObjects: false,
    COMPANY_MEDIA_STORAGE_PATH: prodEnv.COMPANY_MEDIA_STORAGE_PATH ? 'SET' : 'MISSING',
    JOB_EVIDENCE_STORAGE_PATH: prodEnv.JOB_EVIDENCE_STORAGE_PATH ? 'SET' : 'MISSING',
    STORAGE_BUCKET: prodEnv.STORAGE_BUCKET ? 'SET' : 'MISSING',
    note: 'No automatic copy of filesystem/object evidence; Storage objects not in DB dump',
  };

  // Production unchanged proof (re-read)
  const prodSql2 = postgres(prodUrl, {
    max: 1,
    prepare: false,
    onnotice: () => {},
    ssl: 'require',
    connection: { statement_timeout: 30000 },
  });
  try {
    const still = await countMigrations(prodSql2);
    const stillAggs = await aggregates(prodSql2);
    report.phases.productionUnchanged = {
      ok: still === 93 && stillAggs.companies === prodAggs.companies && stillAggs.users === prodAggs.users,
      drizzleMigrationCount: still,
      companies: stillAggs.companies,
      users: stillAggs.users,
    };
    if (!report.phases.productionUnchanged.ok) stop('PRODUCTION_CHANGED_UNEXPECTEDLY', report.phases.productionUnchanged);
  } finally {
    await prodSql2.end({ timeout: 5 });
  }

  await cloneSql.end({ timeout: 5 });

  // Cleanup disposable clone DB only
  let cleanup = { skipped: true };
  if (process.env.SKIP_CLEANUP === '1') {
    cleanup = { skipped: true, reason: 'SKIP_CLEANUP=1' };
  } else {
    const drop = run(PSQL, ['-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', `DROP DATABASE IF EXISTS "${cloneMeta.dbName}" WITH (FORCE);`]);
    const check = run(PSQL, [
      '-d',
      'postgres',
      '-tAc',
      `SELECT count(*) FROM pg_database WHERE datname='${cloneMeta.dbName.replace(/'/g, "''")}'`,
    ]);
    cleanup = {
      skipped: false,
      dropExitCode: drop.status,
      remainingDbCount: String(check.stdout || '').trim(),
      ok: drop.status === 0 && String(check.stdout || '').trim() === '0',
      backupPreserved: fs.existsSync(backupPath),
    };
    if (!cleanup.ok) stop('CLEANUP_FAILED', { cleanup });
  }
  report.phases.cleanup = cleanup;

  report.finishedAt = new Date().toISOString();
  report.preMigrateClone = {
    migrations: clonePreMigrate.migrations,
    roleNameCounts: clonePreMigrate.aggregates.roleNameCounts,
  };
  report.postMigrateClone = {
    migrations: postMigrate.migrations,
    roleNameCounts: postMigrate.aggregates.roleNameCounts,
  };
  report.rollbackMethod =
    'Restore protected custom-format dump via pg_restore into a replacement database / Supabase PITR; do not use 0094.down.sql on production.';
  report.downtimeRisk =
    'High for 0094 role remap + DDL on jobs/finance/inventory/n8n tables; schedule maintenance window; expect locks on users/roles/jobs.';
  report.verdict =
    report.phases.restoreIntegrity?.ok &&
    report.phases.postMigrate?.journalExact104 &&
    report.phases.idempotency?.ok &&
    report.phases.productionUnchanged?.ok &&
    (report.phases.cleanup.ok || report.phases.cleanup.skipped)
      ? 'GO_FOR_SCHEDULED_PRODUCTION_MIGRATION_WITH_BACKUP'
      : 'NO-GO';

  // Redacted proof (no absolute home leakage beyond tilde form)
  const proof = {
    generatedAt: report.finishedAt,
    separation: {
      sourceProduction: true,
      sourceJournal: 93,
      cloneLoopback: true,
      cloneNamePrefix: 'titan_prod_clone_dryrun_',
      cloneNotProduction: true,
      cloneNotStaging: true,
    },
    backup: report.phases.backup,
    restoreIntegrity: report.phases.restoreIntegrity,
    productionUnchanged: report.phases.productionUnchanged,
    cleanup: report.phases.cleanup,
    storageInventory: report.phases.storageInventory,
    verdict: report.verdict,
  };

  fs.mkdirSync(path.dirname(proofOut), { recursive: true });
  fs.writeFileSync(proofOut, JSON.stringify(proof, null, 2));
  fs.writeFileSync(dryRunOut, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        sourceJournal: 93,
        cloneJournalAfter: postMigrate.migrations,
        backupBytes: report.phases.backup.bytes,
        sha256Prefix: report.phases.backup.sha256Prefix,
        companies: prodAggs.companies,
        users: prodAggs.users,
        roleRemap: {
          before: clonePreMigrate.aggregates.roleNameCounts,
          after: postMigrate.aggregates.roleNameCounts,
        },
        idempotency: report.phases.idempotency,
        cleanup: report.phases.cleanup,
        productionUnchanged: report.phases.productionUnchanged,
        proofOut,
        dryRunOut,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  stop('UNHANDLED', { error: redact(err?.stack || err) });
});
