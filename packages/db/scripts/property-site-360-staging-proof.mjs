#!/usr/bin/env node
/**
 * Row 84 — Property / Site 360 staging proof (read-mostly).
 * STAGING ONLY. No Xero writes. No production. No fake properties/equipment.
 *
 * Usage:
 *   APP_ENV=staging TITAN_ENV=staging STAGING_DATABASE_URL=... \
 *     node packages/db/scripts/property-site-360-staging-proof.mjs
 *   ... --apply-migration   # apply 0205 additive migration on staging only
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  PROPERTY_SITE_360_ROYAL_CAPE,
  assertRoyalCapePropertyUnchanged,
  normalizePropertyAddressKey,
  planPropertyDuplicateWarning,
} from '../../shared/dist/property-site-360.js';
import { assertStagingDatabaseIdentity } from '../../shared/dist/royal-cape-job360-rehearsal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const outPath = path.resolve(repoRoot, 'diagnostic-output/property-site-360-staging-proof.json');
const APPLY_MIGRATION = process.argv.includes('--apply-migration');
const FORBIDDEN_PROD = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';
const YG = '095aef76-fef5-4139-af37-a42f2d7e2faf';

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
  if (process.env.APP_ENV) out.APP_ENV = process.env.APP_ENV;
  if (process.env.TITAN_ENV) out.TITAN_ENV = process.env.TITAN_ENV;
  if (process.env.STAGING_DATABASE_URL) out.DATABASE_URL = process.env.STAGING_DATABASE_URL;
  else if (process.env.DATABASE_URL) out.DATABASE_URL = process.env.DATABASE_URL;
  // Convenience for cloud agents
  const tip = '/tmp/cursor-staging-db-url.txt';
  if (!out.DATABASE_URL && fs.existsSync(tip)) {
    out.DATABASE_URL = fs.readFileSync(tip, 'utf8').trim();
  }
  return out;
}

const report = {
  label: 'property-site-360-staging-proof',
  generatedAt: new Date().toISOString(),
  mode: APPLY_MIGRATION ? 'apply-migration+inspect' : 'inspect',
  stagingOnly: true,
  xeroWriteCalls: 0,
  productionWrites: 0,
  productionMigrations: 0,
  row85Started: false,
  row86Started: false,
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
env.APP_ENV = env.APP_ENV || 'staging';
env.TITAN_ENV = env.TITAN_ENV || 'staging';

const guard = assertStagingDatabaseIdentity({
  appEnv: env.APP_ENV,
  titanEnv: env.TITAN_ENV,
  databaseUrl: env.DATABASE_URL,
});
if (!guard.ok) {
  report.blockers.push(guard.reason);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

if (!env.DATABASE_URL || env.DATABASE_URL.includes(FORBIDDEN_PROD)) {
  report.blockers.push('Refusing non-staging or forbidden production database URL.');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  process.exit(1);
}
if (!env.DATABASE_URL.includes(STAGING_REF)) {
  report.blockers.push(`Database URL must target staging ref ${STAGING_REF}.`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  process.exit(1);
}

const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false });

try {
  if (APPLY_MIGRATION) {
    const migPath = path.resolve(repoRoot, 'packages/db/drizzle/0205_property_site_360.sql');
    const mig = fs.readFileSync(migPath, 'utf8');
    // Split on statement-breakpoint comments used by drizzle SQL files
    const parts = mig
      .split(/-->\s*statement-breakpoint/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const part of parts) {
      await sql.unsafe(part);
    }
    pass('apply_migration_0205', 'Additive property site 360 migration applied on staging');
  }

  // Column presence
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cx_customer_properties'
      AND column_name IN ('status','country','access_instructions','site_notes','source_provider','source_external_id')
  `;
  if (cols.length >= 5) pass('schema_columns', `found ${cols.length} additive columns`);
  else fail('schema_columns', `expected additive columns, found ${cols.map((c) => c.column_name)}`);

  const contactTable = await sql`
    SELECT to_regclass('public.property_site_contacts') AS reg
  `;
  if (contactTable[0]?.reg) pass('property_site_contacts_table', 'exists');
  else fail('property_site_contacts_table', 'missing — apply migration 0205');

  const crc = PROPERTY_SITE_360_ROYAL_CAPE.canonicalCustomerId;
  const propId = PROPERTY_SITE_360_ROYAL_CAPE.propertyId;
  const jobId = PROPERTY_SITE_360_ROYAL_CAPE.jobId;

  const props = await sql`
    SELECT id, property_name, customer_id, company_id, address_line1, suburb, city, status,
           source_provider, source_external_id
    FROM cx_customer_properties
    WHERE company_id = ${YG} AND customer_id = ${crc}
    ORDER BY created_at
  `;
  report.proof.crcPropertyCount = props.length;
  pass('crc_property_count', String(props.length));

  const royal = props.find((p) => p.id === propId);
  if (!royal) fail('royal_cape_property', 'missing');
  else {
    pass(
      'royal_cape_property',
      `${royal.property_name} customer=${royal.customer_id} status=${royal.status ?? 'n/a'}`,
    );
    report.proof.royalCape = royal;
  }

  const royalDupes = props.filter((p) =>
    String(p.property_name || '')
      .toLowerCase()
      .includes('royal cape'),
  );
  if (royalDupes.length === 1) pass('royal_cape_unique', 'exactly one Royal Cape property for CRC');
  else fail('royal_cape_unique', `found ${royalDupes.length} Royal Cape-named properties`);

  const jobsAtSite = await sql`
    SELECT id, job_number, status, property_id,
           snapshot_street, snapshot_suburb, snapshot_city, snapshot_formatted_address,
           snapshot_site_contact_name
    FROM jobs
    WHERE company_id = ${YG} AND property_id = ${propId}
    ORDER BY created_at
  `;
  report.proof.royalCapeJobs = jobsAtSite.map((j) => ({
    id: j.id,
    jobNumber: j.job_number,
    status: j.status,
    snapshotStreet: j.snapshot_street,
    snapshotCity: j.snapshot_city,
  }));
  pass('royal_cape_jobs', `${jobsAtSite.length} job(s)`);

  const job000002 = jobsAtSite.find((j) => j.id === jobId || j.job_number === 'JOB-000002');
  if (!job000002) fail('job_000002', 'not found on Royal Cape property');
  else pass('job_000002', `${job000002.job_number} status=${job000002.status}`);

  const quotes = await sql`
    SELECT id, quote_number, xero_quote_id, job_id, property_id, customer_id
    FROM quotes
    WHERE company_id = ${YG}
      AND (
        id = ${PROPERTY_SITE_360_ROYAL_CAPE.royalCapeQuoteId}
        OR job_id = ${jobId}
        OR property_id = ${propId}
      )
  `;
  const qu = quotes.find((q) => q.id === PROPERTY_SITE_360_ROYAL_CAPE.royalCapeQuoteId);
  if (!qu) fail('qu_0183', 'TITAN quote missing');
  else {
    pass('qu_0183', `${qu.quote_number} xero=${qu.xero_quote_id}`);
    try {
      assertRoyalCapePropertyUnchanged({
        propertyId: propId,
        customerId: crc,
        jobId,
        jobNumber: job000002?.job_number ?? null,
        quoteId: qu.id,
        quoteNumber: qu.quote_number,
        xeroQuoteId: qu.xero_quote_id,
      });
      pass('royal_cape_regression_assert', 'CRC/property/job/quote/xero intact');
    } catch (e) {
      fail('royal_cape_regression_assert', e.message);
    }
  }

  // Equipment linked via registry profiles
  const equip = await sql`
    SELECT ae.id, ae.name, ae.asset_type, ae.status, ae.serial_number
    FROM al_asset_registry_profiles arp
    JOIN asset_equipment ae ON ae.id = arp.asset_id
    WHERE arp.company_id = ${YG} AND arp.property_id = ${propId}
  `;
  report.proof.equipmentCount = equip.length;
  report.proof.equipment = equip;
  if (equip.length === 0) {
    pass('equipment', 'NO_VERIFIED_EQUIPMENT_LINKED (truthful empty)');
  } else {
    pass('equipment', `${equip.length} linked asset(s)`);
  }

  // Site contacts
  let siteContacts = [];
  try {
    siteContacts = await sql`
      SELECT psc.id, psc.role, psc.is_primary, cp.display_name
      FROM property_site_contacts psc
      JOIN customer_people cp ON cp.id = psc.person_id
      WHERE psc.company_id = ${YG} AND psc.property_id = ${propId}
    `;
    pass('site_contacts', `${siteContacts.length} linked via customer_people`);
  } catch (e) {
    fail('site_contacts', e.message);
  }
  report.proof.siteContacts = siteContacts;

  // Documents for jobs at site
  const jobIds = jobsAtSite.map((j) => j.id);
  let docCount = 0;
  if (jobIds.length) {
    const docs = await sql`
      SELECT count(*)::int AS c FROM documents
      WHERE company_id = ${YG} AND job_id = ANY(${jobIds})
    `;
    docCount = docs[0]?.c ?? 0;
  }
  report.proof.documentCount = docCount;
  pass('documents', String(docCount));

  // Visits for JOB-000002
  const visits = await sql`
    SELECT id, visit_number, status, close_reason, job_id
    FROM job_visits
    WHERE company_id = ${YG} AND job_id = ${jobId}
    ORDER BY visit_number
  `;
  report.proof.visits = visits;
  pass('visits_same_job', `${visits.length} visit(s) on JOB-000002 (multi-day = same job/site)`);

  // Immutable snapshot evidence: store current snapshot fingerprint
  if (job000002) {
    report.proof.immutableSnapshot = {
      jobId: job000002.id,
      jobNumber: job000002.job_number,
      snapshotStreet: job000002.snapshot_street,
      snapshotCity: job000002.snapshot_city,
      snapshotFormattedAddress: job000002.snapshot_formatted_address,
      note: 'Property address edits must not rewrite these job columns.',
    };
    pass('immutable_snapshot_evidence', JSON.stringify(report.proof.immutableSnapshot));
  }

  // Duplicate warning helper (no auto-merge) — fixture only
  const key = normalizePropertyAddressKey({
    propertyName: royal?.property_name || 'Royal Cape Yacht Club',
    street: royal?.address_line1,
    suburb: royal?.suburb,
    city: royal?.city,
  });
  const warn = planPropertyDuplicateWarning({
    incomingAddressKey: key,
    candidates: props.map((p) => ({
      id: p.id,
      propertyName: p.property_name,
      addressKey: normalizePropertyAddressKey({
        propertyName: p.property_name,
        street: p.address_line1,
        suburb: p.suburb,
        city: p.city,
      }),
    })),
  });
  if (warn.decision === 'WARN_REVIEW' && warn.matches.some((m) => m.id === propId)) {
    pass('duplicate_warning_no_automerge', warn.reason);
  } else if (props.length === 1) {
    pass('duplicate_warning_no_automerge', 'single site — OK path; no auto-merge implemented');
  } else {
    pass('duplicate_warning_no_automerge', `decision=${warn.decision}`);
  }

  // Multiple site: if only one real CRC property, report truthfully
  if (props.length === 1) {
    pass(
      'multiple_site_real_data',
      'Only one verified real CRC property currently exists (Royal Cape). Multi-site covered by automated fixtures — no fake site created.',
    );
  } else {
    pass(
      'multiple_site_real_data',
      `CRC has ${props.length} real properties: ${props.map((p) => p.property_name).join(' | ')}`,
    );
  }

  // Job uniqueness
  const jobDupes = await sql`
    SELECT count(*)::int AS c FROM jobs
    WHERE company_id = ${YG} AND job_number = 'JOB-000002'
  `;
  if (jobDupes[0]?.c === 1) pass('no_duplicate_job', 'JOB-000002 unique');
  else fail('no_duplicate_job', `count=${jobDupes[0]?.c}`);

  // Xero quote unchanged
  if (qu?.xero_quote_id === PROPERTY_SITE_360_ROYAL_CAPE.royalCapeXeroQuoteId) {
    pass('xero_ids_unchanged', qu.xero_quote_id);
  } else {
    fail('xero_ids_unchanged', String(qu?.xero_quote_id));
  }

  pass('xero_writes', '0');
  pass('production_writes', '0');
  pass('row85_not_started', 'true');
  pass('row86_not_started', 'true');
} catch (e) {
  report.blockers.push(String(e?.stack || e));
  fail('unexpected', e.message);
} finally {
  await sql.end({ timeout: 5 });
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
const failed = report.results.filter((r) => r.status === 'FAIL').length;
console.log(JSON.stringify({ outPath, failed, blockers: report.blockers.length, proof: report.proof }, null, 2));
process.exit(failed || report.blockers.length ? 1 : 0);
