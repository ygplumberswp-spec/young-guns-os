/**
 * CONTROLLED production migration 0094–0104 (journal 93 → 104).
 *
 * - Loads apps/api/.env DATABASE_URL internally (never prints it)
 * - Requires authorized production fingerprint (forbidden live ref)
 * - Preflight: journal 93, companies 131, users 131, customers 239, 0094 safety
 * - Applies drizzle-kit migrate once, then idempotent re-run
 * - Postflight validation + redacted evidence
 *
 * Usage (from packages/db):
 *   node scripts/migrate-production-0094-0104.mjs
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '../..');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const apiEnvPath = path.join(repoRoot, 'apps/api/.env');
const outPath = path.join(repoRoot, 'diagnostic-output/production-migration-0094-0104-redacted.json');
const EXPECTED_FP_PREFIX = null; // filled from live URL hash; recorded in report

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

function redact(text) {
  return String(text || '')
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, '[REDACTED_URL]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]')
    .slice(0, 4000);
}

function fingerprint(url) {
  return crypto.createHash('sha256').update(String(url)).digest('hex').slice(0, 12);
}

function stop(report, reason, extra = {}) {
  report.ok = false;
  report.verdict = 'NO-GO';
  report.stopReason = reason;
  Object.assign(report, extra);
  report.finishedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.error(JSON.stringify({ stop: true, reason, verdict: 'NO-GO' }, null, 2));
  process.exit(3);
}

async function countMigrations(sql) {
  const rows = await sql`select count(*)::int as c from drizzle.__drizzle_migrations`;
  return rows[0].c;
}

async function aggregates(sql) {
  const one = async (table) => {
    const r = await sql.unsafe(`select count(*)::int as c from ${table}`);
    return r[0].c;
  };
  const roles = await sql`
    select r.name as role_name, count(*)::int as c
    from users u
    join roles r on r.id = u.role_id
    group by r.name
    order by c desc
  `;
  const canonicalRoles = await sql`
    select name from roles
    where name in (
      'Platform Owner','Company Owner','Manager','Dispatcher','Accountant','Technician','Client','Member','Owner'
    )
    group by name
    order by name
  `;
  return {
    companies: await one('companies'),
    users: await one('users'),
    customers: await one('customers'),
    jobs: await one('jobs'),
    roleNameCounts: roles.map((r) => ({ roleName: r.role_name, userCount: r.c })),
    canonicalRoleNamesPresent: canonicalRoles.map((r) => r.name),
  };
}

async function nineFourSafety(sql) {
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
}

async function schemaChecks(sql) {
  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema='public' and table_name in (
      'job_number_counters','job_crew_members','job_material_lines','job_variations',
      'job_completion_snapshots','lead_conversions','n8n_connections','n8n_executions',
      'customer_marketing_consents','customer_marketing_consent_audits'
    )
    order by table_name
  `;
  const indexes = await sql`
    select indexname from pg_indexes
    where schemaname='public' and indexname in (
      'jobs_company_job_number_uidx',
      'customer_marketing_consents_company_customer_channel_uidx'
    )
    order by indexname
  `;
  const enums = await sql`
    select t.typname from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname='public' and t.typname in (
      'job_priority','marketing_consent_channel','marketing_consent_status'
    )
    order by t.typname
  `;
  const jobCols = await sql`
    select column_name from information_schema.columns
    where table_schema='public' and table_name='jobs'
      and column_name in ('job_number','snapshot_suburb','snapshot_city','priority')
    order by column_name
  `;
  return {
    tables: tables.map((t) => t.table_name),
    indexes: indexes.map((i) => i.indexname),
    enums: enums.map((e) => e.typname),
    jobColumns: jobCols.map((c) => c.column_name),
  };
}

function runMigrate(databaseUrl) {
  const drizzleKitBin = path.join(root, 'node_modules/.bin/drizzle-kit');
  const childEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    DOTENV_CONFIG_PATH: '',
    APP_ENV: 'production-migrate',
    TITAN_ENV: 'production-migrate',
  };
  const result = spawnSync(drizzleKitBin, ['migrate'], {
    cwd: root,
    env: childEnv,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: redact(result.stdout),
    stderr: redact(result.stderr),
  };
}

async function withAdvisoryLock(sql, fn) {
  // session-level advisory lock; unique key for TITAN prod migrate
  const LOCK_KEY = 9401042026;
  const got = await sql`select pg_try_advisory_lock(${LOCK_KEY}) as ok`;
  if (!got[0].ok) {
    throw new Error('ADVISORY_LOCK_NOT_ACQUIRED');
  }
  try {
    return await fn();
  } finally {
    await sql`select pg_advisory_unlock(${LOCK_KEY})`;
  }
}

async function main() {
  const report = {
    startedAt: new Date().toISOString(),
    mode: 'controlled_production_migration_0094_0104',
    authorized: true,
    providersCalled: false,
    envFilesModified: false,
    deploymentPerformed: false,
    backupRestored: false,
    ok: false,
    verdict: 'NO-GO',
  };

  if (!fs.existsSync(apiEnvPath)) stop(report, 'API_ENV_MISSING');
  const env = loadEnv(apiEnvPath);
  const url = env.DATABASE_URL;
  if (!url) stop(report, 'DATABASE_URL_MISSING');
  if (!url.toLowerCase().includes(FORBIDDEN)) stop(report, 'TARGET_NOT_AUTHORIZED_PRODUCTION_REF');

  const fp = fingerprint(url);
  report.productionFingerprintPrefix = fp;
  report.matchesAuthorizedProductionRef = true;

  const backupPath = path.join(
    process.env.HOME || '',
    'TitanAura-ProtectedBackups/titan-prod-logical-2026-07-31T12-59-33-501Z.dump',
  );
  report.protectedBackupPresent = fs.existsSync(backupPath);

  const sql = postgres(url, {
    max: 1,
    prepare: false,
    onnotice: () => {},
    ssl: 'require',
    connection: { statement_timeout: 600000 },
  });

  try {
    await withAdvisoryLock(sql, async () => {
      // PREFLIGHT
      const preMigrations = await countMigrations(sql);
      const preAggs = await aggregates(sql);
      const preSafety = await nineFourSafety(sql);
      report.preflight = {
        journal: preMigrations,
        aggregates: {
          companies: preAggs.companies,
          users: preAggs.users,
          customers: preAggs.customers,
          jobs: preAggs.jobs,
        },
        roleNameCounts: preAggs.roleNameCounts,
        nineFourSafety: preSafety,
      };

      if (preMigrations !== 93) stop(report, 'PREFLIGHT_JOURNAL_NOT_93', { preMigrations });
      if (preAggs.companies !== 131 || preAggs.users !== 131 || preAggs.customers !== 239) {
        stop(report, 'PREFLIGHT_COUNTS_MISMATCH', {
          expected: { companies: 131, users: 131, customers: 239 },
          actual: {
            companies: preAggs.companies,
            users: preAggs.users,
            customers: preAggs.customers,
          },
        });
      }
      if (!preSafety.safe) stop(report, 'PREFLIGHT_0094_AMBIGUITY', { preSafety });

      const ownerCount = preAggs.roleNameCounts.find((r) => r.roleName === 'Owner')?.userCount ?? 0;
      if (ownerCount !== 131) stop(report, 'PREFLIGHT_OWNER_COUNT_NOT_131', { ownerCount });

      // MIGRATE
      const migrate1 = runMigrate(url);
      report.migrateFirst = {
        exitCode: migrate1.status,
        stdoutTail: migrate1.stdout.slice(-2000),
        stderrTail: migrate1.stderr.slice(-2000),
      };
      if (migrate1.status !== 0) {
        stop(report, 'MIGRATE_FAILED', { migrateFirst: report.migrateFirst });
      }

      // POSTFLIGHT
      const postMigrations = await countMigrations(sql);
      const postAggs = await aggregates(sql);
      const postSafety = await nineFourSafety(sql);
      const schema = await schemaChecks(sql);
      const hashDupes = await sql`
        select hash, count(*)::int as c
        from drizzle.__drizzle_migrations
        group by hash
        having count(*) > 1
      `;

      const companyOwner =
        postAggs.roleNameCounts.find((r) => r.roleName === 'Company Owner')?.userCount ?? 0;
      const ownerLeft = postAggs.roleNameCounts.find((r) => r.roleName === 'Owner')?.userCount ?? 0;

      const requiredTables = [
        'job_number_counters',
        'job_crew_members',
        'job_material_lines',
        'lead_conversions',
        'n8n_connections',
        'n8n_executions',
        'customer_marketing_consents',
      ];
      const missingTables = requiredTables.filter((t) => !schema.tables.includes(t));

      report.postflight = {
        journal: postMigrations,
        aggregates: {
          companies: postAggs.companies,
          users: postAggs.users,
          customers: postAggs.customers,
          jobs: postAggs.jobs,
        },
        roleNameCounts: postAggs.roleNameCounts,
        nineFourSafety: postSafety,
        schema,
        duplicateMigrationHashes: hashDupes.length,
        canonicalRoleNamesPresent: postAggs.canonicalRoleNamesPresent,
        remap: {
          companyOwnerCount: companyOwner,
          ownerRemaining: ownerLeft,
          expectedCompanyOwner: 131,
          expectedOwnerRemaining: 0,
        },
      };

      const validationErrors = [];
      if (postMigrations !== 104) validationErrors.push('journal_not_104');
      if (postAggs.companies !== 131) validationErrors.push('companies_changed');
      if (postAggs.users !== 131) validationErrors.push('users_changed');
      if (postAggs.customers !== 239) validationErrors.push('customers_changed');
      if (companyOwner !== 131 || ownerLeft !== 0) validationErrors.push('role_remap_mismatch');
      if (!postSafety.safe) validationErrors.push('platform_owner_ambiguity');
      if (hashDupes.length > 0) validationErrors.push('duplicate_migration_hashes');
      if (missingTables.length) validationErrors.push(`missing_tables:${missingTables.join(',')}`);
      if (!schema.indexes.includes('jobs_company_job_number_uidx')) {
        validationErrors.push('missing_job_number_index');
      }
      if (!postAggs.canonicalRoleNamesPresent.includes('Company Owner')) {
        validationErrors.push('missing_company_owner_role');
      }

      report.validationErrors = validationErrors;
      if (validationErrors.length) stop(report, 'POSTFLIGHT_VALIDATION_FAILED', { validationErrors });

      // IDEMPOTENT RE-MIGRATE
      const migrate2 = runMigrate(url);
      const afterRepeat = await countMigrations(sql);
      report.idempotency = {
        exitCode: migrate2.status,
        journalAfter: afterRepeat,
        ok: migrate2.status === 0 && afterRepeat === 104,
        stdoutTail: migrate2.stdout.slice(-800),
        stderrTail: migrate2.stderr.slice(-800),
      };
      if (!report.idempotency.ok) stop(report, 'IDEMPOTENCY_FAILED', { idempotency: report.idempotency });

      report.ok = true;
      report.verdict = 'GO_FOR_PRODUCTION_HOSTING_FOUNDATION';
      report.finishedAt = new Date().toISOString();
      report.summary = {
        preJournal: 93,
        postJournal: 104,
        companies: 131,
        users: 131,
        customers: 239,
        roleRemap: 'Owner×131 → Company Owner×131',
      };
    });
  } catch (err) {
    if (err?.message === 'ADVISORY_LOCK_NOT_ACQUIRED') {
      stop(report, 'ADVISORY_LOCK_NOT_ACQUIRED');
    }
    stop(report, 'UNHANDLED', { error: redact(err?.stack || err) });
  } finally {
    await sql.end({ timeout: 10 });
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        fingerprintPrefix: report.productionFingerprintPrefix,
        preJournal: report.preflight?.journal,
        postJournal: report.postflight?.journal,
        remap: report.postflight?.remap,
        aggregates: report.postflight?.aggregates,
        idempotency: report.idempotency,
        schemaTables: report.postflight?.schema?.tables,
        outPath,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

main();
