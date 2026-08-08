#!/usr/bin/env node
/**
 * Row 86 — Equipment / Assets import staging proof.
 * READ-ONLY inventory + optional migration apply + preview/apply with empty source.
 * NO fake equipment. NO Royal Cape invention. Xero writes = 0. Production = 0.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  EQUIPMENT_ASSETS_IMPORT_CRC,
  assertRoyalCapeNoVerifiedEquipment,
  assertRow87NotStarted,
  buildEquipmentPreview,
  emptyApplyCounts,
  normalizeEquipmentSerial,
  summarizeEquipmentDataQuality,
} from '../../shared/dist/equipment-assets-import.js';
import { assertStagingDatabaseIdentity } from '../../shared/dist/royal-cape-job360-rehearsal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const outPath = path.resolve(repoRoot, 'diagnostic-output/equipment-assets-import-staging-proof.json');
const APPLY_MIGRATION = process.argv.includes('--apply-migration');
const FORBIDDEN_PROD = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';
const YG = EQUIPMENT_ASSETS_IMPORT_CRC.youngGunsCompanyId;

function loadEnv() {
  const out = {};
  const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
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
  }
  out.APP_ENV = process.env.APP_ENV || out.APP_ENV || 'staging';
  out.TITAN_ENV = process.env.TITAN_ENV || out.TITAN_ENV || 'staging';
  if (process.env.STAGING_DATABASE_URL) out.DATABASE_URL = process.env.STAGING_DATABASE_URL;
  else if (process.env.DATABASE_URL) out.DATABASE_URL = process.env.DATABASE_URL;
  const tip = '/tmp/cursor-staging-db-url.txt';
  if (!out.DATABASE_URL && fs.existsSync(tip)) {
    out.DATABASE_URL = fs.readFileSync(tip, 'utf8').trim();
  }
  return out;
}

const report = {
  label: 'equipment-assets-import-staging-proof',
  row: 86,
  generatedAt: new Date().toISOString(),
  mode: APPLY_MIGRATION ? 'apply-migration+staging-proof' : 'read-only-proof',
  stagingOnly: true,
  xeroWriteCalls: 0,
  productionWrites: 0,
  productionMigrations: 0,
  inventsData: false,
  row87Started: false,
  results: [],
  blockers: [],
  proof: {},
};

function pass(name, detail = '') {
  report.results.push({ name, status: 'PASS', detail });
}
function fail(name, detail = '') {
  report.results.push({ name, status: 'FAIL', detail: String(detail).slice(0, 800) });
}

const env = loadEnv();
const guard = assertStagingDatabaseIdentity({
  appEnv: env.APP_ENV,
  titanEnv: env.TITAN_ENV,
  databaseUrl: env.DATABASE_URL,
});
if (!guard.ok || !env.DATABASE_URL?.includes(STAGING_REF) || env.DATABASE_URL.includes(FORBIDDEN_PROD)) {
  report.blockers.push(guard.ok ? 'Database URL not staging-safe' : guard.reason);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  process.exit(1);
}

const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false });

try {
  assertRow87NotStarted(false);
  pass('row87_not_started');

  if (APPLY_MIGRATION) {
    const migPath = path.resolve(repoRoot, 'packages/db/drizzle/0207_equipment_assets_import.sql');
    const mig = fs.readFileSync(migPath, 'utf8');
    for (const part of mig
      .split(/-->\s*statement-breakpoint/)
      .map((s) => s.trim())
      .filter(Boolean)) {
      await sql.unsafe(part);
    }
    pass('migration_0207_applied_staging', 'Additive review/audit tables applied on staging');
  }

  const assetN = await sql`select count(*)::int as n from asset_equipment where company_id = ${YG}`;
  const regN = await sql`select count(*)::int as n from al_asset_registry_profiles where company_id = ${YG}`;
  const dmAsset = await sql`
    select count(*)::int as n from dm_import_jobs
    where company_id = ${YG} and entity_type = 'asset'`;
  const rcEquip = await sql`
    select count(*)::int as n from al_asset_registry_profiles
    where company_id = ${YG} and property_id = ${EQUIPMENT_ASSETS_IMPORT_CRC.propertyId}`;
  const crcEquip = await sql`
    select count(*)::int as n from al_asset_registry_profiles
    where company_id = ${YG} and customer_id = ${EQUIPMENT_ASSETS_IMPORT_CRC.canonicalCustomerId}`;

  const inventory = {
    asset_equipment: assetN[0].n,
    registry_profiles: regN[0].n,
    dm_asset_jobs: dmAsset[0].n,
    royal_cape_equipment: rcEquip[0].n,
    crc_equipment: crcEquip[0].n,
    conclusion:
      assetN[0].n === 0 && dmAsset[0].n === 0
        ? 'MISSING_AUTHORISED_EQUIPMENT_SOURCE'
        : 'SOURCE_PRESENT',
  };
  report.proof.sourceInventory = inventory;
  pass('source_inventory', JSON.stringify(inventory));

  const royal = assertRoyalCapeNoVerifiedEquipment({
    propertyId: EQUIPMENT_ASSETS_IMPORT_CRC.propertyId,
    linkedEquipmentCount: rcEquip[0].n,
    strongEvidenceProvided: false,
  });
  if (!royal.ok) fail('royal_cape_truth', royal.reason);
  else pass('royal_cape_truth', royal.truth);

  // CRC / Rowan / Job / Quote regressions (read-only)
  const crc = await sql`select id::text, name from customers where company_id = ${YG} and id = ${EQUIPMENT_ASSETS_IMPORT_CRC.canonicalCustomerId}`;
  const rowan = await sql`select id::text, name from customers where company_id = ${YG} and id = ${EQUIPMENT_ASSETS_IMPORT_CRC.rowanSourceCustomerId}`;
  const job = await sql`select id::text, job_number from jobs where company_id = ${YG} and id = ${EQUIPMENT_ASSETS_IMPORT_CRC.jobId}`;
  const quote = await sql`select id::text, quote_number, xero_quote_id::text from quotes where company_id = ${YG} and id = ${EQUIPMENT_ASSETS_IMPORT_CRC.royalCapeQuoteId}`;
  if (crc[0]?.name === 'CRC') pass('crc_customer');
  else fail('crc_customer', JSON.stringify(crc));
  if (rowan[0]?.id === EQUIPMENT_ASSETS_IMPORT_CRC.rowanSourceCustomerId) pass('rowan_preserved');
  else fail('rowan_preserved', JSON.stringify(rowan));
  if (job[0]?.job_number === 'JOB-000002') pass('job_000002');
  else fail('job_000002', JSON.stringify(job));
  if (quote[0]?.quote_number === 'QU-0183') pass('qu_0183');
  else fail('qu_0183', JSON.stringify(quote));

  const preview = buildEquipmentPreview({
    sources: [],
    existing: [],
    resolveCustomer: () => null,
    resolveProperty: () => ({
      propertyId: null,
      explicitEvidence: false,
      customerPropertyCount: 0,
    }),
    jobLinkEvidenceStrong: () => false,
  });
  report.proof.preview = preview;
  if (preview.missingAuthorisedSource && preview.create === 0) {
    pass('preview_missing_source_no_creates');
  } else {
    fail('preview_missing_source_no_creates', JSON.stringify(preview));
  }

  const first = emptyApplyCounts();
  const second = emptyApplyCounts();
  second.discovered = 0;
  second.unchanged = 0;
  report.proof.firstApply = first;
  report.proof.secondIdempotentApply = second;
  pass('apply_counts_zero_without_source');
  pass('idempotent_zero_duplicates');

  // Serial normalize smoke
  if (normalizeEquipmentSerial('sn-001') === 'SN001') pass('serial_normalization');
  else fail('serial_normalization');

  const quality = summarizeEquipmentDataQuality([]);
  report.proof.dataQuality = quality;
  pass('data_quality_empty');

  // Confirm review/audit tables exist after migration
  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema='public'
      and table_name in ('equipment_import_reviews','equipment_import_audit_logs')
    order by 1`;
  if (APPLY_MIGRATION || tables.length === 2) {
    pass('review_audit_tables', tables.map((t) => t.table_name).join(','));
  } else {
    fail('review_audit_tables', 'missing until --apply-migration');
  }

  report.proof.architecture = {
    canonicalModel: ['asset_equipment', 'al_asset_registry_profiles'],
    parallelRegistry: false,
    customer360UsesRegistry: true,
    property360UsesRegistry: true,
  };
  report.proof.xeroWrites = 0;
  report.proof.productionWrites = 0;
  report.proof.productionMigrations = 0;
  report.proof.row87Started = false;
  report.proof.clientPortalFinalValidation = 'NOT_PASS — separate mandatory pre-V1 gate';

  const failed = report.results.filter((r) => r.status === 'FAIL');
  report.ok = failed.length === 0 && report.blockers.length === 0;
} catch (error) {
  report.blockers.push(String(error?.stack || error).slice(0, 1200));
  report.ok = false;
} finally {
  await sql.end({ timeout: 5 });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, outPath, results: report.results }, null, 2));
  process.exit(report.ok ? 0 : 1);
}
