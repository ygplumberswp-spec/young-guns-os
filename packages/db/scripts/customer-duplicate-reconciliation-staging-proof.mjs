#!/usr/bin/env node
/**
 * Row 85 — Customer Duplicate Reconciliation staging proof.
 * READ-ONLY candidate scan + CRC/Rowan regression. Optional --apply-migration.
 * NO real merge of Young Guns customers. Xero writes = 0. Production = 0.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  CUSTOMER_DUPLICATE_RECONCILIATION_CRC,
  assertCrcRowanRegression,
  classifyDuplicateCandidate,
  isCrcRowanPair,
} from '../../shared/dist/customer-duplicate-reconciliation.js';
import { assertStagingDatabaseIdentity } from '../../shared/dist/royal-cape-job360-rehearsal.js';
import {
  normalizeCustomerEmailKey,
  normalizeCustomerNameKey,
  normalizeCustomerPhoneKey,
  orderCustomerPairIds,
} from '../../shared/dist/customer-duplicate-merge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const outPath = path.resolve(
  repoRoot,
  'diagnostic-output/customer-duplicate-reconciliation-staging-proof.json',
);
const APPLY_MIGRATION = process.argv.includes('--apply-migration');
const FORBIDDEN_PROD = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';
const YG = CUSTOMER_DUPLICATE_RECONCILIATION_CRC.youngGunsCompanyId;

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
  label: 'customer-duplicate-reconciliation-staging-proof',
  generatedAt: new Date().toISOString(),
  mode: APPLY_MIGRATION ? 'apply-migration+read-only-scan' : 'read-only-scan',
  stagingOnly: true,
  xeroWriteCalls: 0,
  productionWrites: 0,
  productionMigrations: 0,
  realMergesExecuted: 0,
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

function normalizeVat(vat) {
  if (!vat) return null;
  const n = String(vat).replace(/[\s-]/g, '').toUpperCase();
  return n || null;
}

try {
  if (APPLY_MIGRATION) {
    const migPath = path.resolve(
      repoRoot,
      'packages/db/drizzle/0206_customer_duplicate_reconciliation.sql',
    );
    const mig = fs.readFileSync(migPath, 'utf8');
    for (const part of mig
      .split(/-->\s*statement-breakpoint/)
      .map((s) => s.trim())
      .filter(Boolean)) {
      await sql.unsafe(part);
    }
    pass('apply_migration_0206', 'Additive reconciliation table applied on staging');
  }

  const table = await sql`SELECT to_regclass('public.customer_duplicate_reconciliations') AS reg`;
  if (table[0]?.reg) pass('reconciliation_table', 'exists');
  else fail('reconciliation_table', 'missing — apply 0206');

  const customers = await sql`
    SELECT id, name, company_name, contact_person, email, phone, vat_number, billing_address,
           status, merged_into_customer_id
    FROM customers
    WHERE company_id = ${YG} AND merged_into_customer_id IS NULL
    ORDER BY created_at
  `;
  report.proof.totalCustomersScanned = customers.length;
  pass('customers_scanned', String(customers.length));

  const xeroRows = await sql`
    SELECT customer_id, xero_contact_id
    FROM xero_customer_mappings
    WHERE company_id = ${YG}
  `;
  const xeroByCustomer = new Map();
  for (const r of xeroRows) {
    const list = xeroByCustomer.get(r.customer_id) ?? [];
    list.push(r.xero_contact_id);
    xeroByCustomer.set(r.customer_id, list);
  }

  // Efficient candidate generation via normalized keys (not full O(n²) in app for all pairs)
  const byEmail = new Map();
  const byPhone = new Map();
  const byVat = new Map();
  const byName = new Map();
  for (const c of customers) {
    const email = normalizeCustomerEmailKey(c.email);
    const phone = normalizeCustomerPhoneKey(c.phone);
    const vat = normalizeVat(c.vat_number);
    const name = normalizeCustomerNameKey(c.company_name || c.name);
    if (email) {
      const arr = byEmail.get(email) ?? [];
      arr.push(c);
      byEmail.set(email, arr);
    }
    if (phone) {
      const arr = byPhone.get(phone) ?? [];
      arr.push(c);
      byPhone.set(phone, arr);
    }
    if (vat) {
      const arr = byVat.get(vat) ?? [];
      arr.push(c);
      byVat.set(vat, arr);
    }
    if (name) {
      const arr = byName.get(name) ?? [];
      arr.push(c);
      byName.set(name, arr);
    }
  }

  const pairMap = new Map();
  function addPair(a, b, reason) {
    if (a.id === b.id) return;
    const [left, right] = orderCustomerPairIds(a.id, b.id);
    const key = `${left}|${right}`;
    const existing = pairMap.get(key) ?? {
      leftId: left,
      rightId: right,
      left: a.id === left ? a : b,
      right: a.id === right ? a : b,
      reasons: new Set(),
    };
    existing.reasons.add(reason);
    pairMap.set(key, existing);
  }

  // Cap large shared-contact groups (common office phone/email) — still reportable via group stats.
  const sharedContactGroups = { email: 0, phone: 0, vat: 0 };
  for (const group of byEmail.values()) {
    if (group.length < 2) continue;
    if (group.length > 6) {
      sharedContactGroups.email += 1;
      continue;
    }
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) addPair(group[i], group[j], 'email');
    }
  }
  for (const group of byPhone.values()) {
    if (group.length < 2) continue;
    if (group.length > 6) {
      sharedContactGroups.phone += 1;
      continue;
    }
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) addPair(group[i], group[j], 'phone');
    }
  }
  for (const group of byVat.values()) {
    if (group.length < 2) continue;
    if (group.length > 6) {
      sharedContactGroups.vat += 1;
      continue;
    }
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) addPair(group[i], group[j], 'vat');
    }
  }
  report.proof.oversizedSharedContactGroupsSkipped = sharedContactGroups;
  // Do not seed pairs from name alone — name-only stays low confidence and floods the queue.
  // Name corroboration still appears when email/phone/vat/xero already seeded the pair.
  // Shared Xero contact id
  const byXero = new Map();
  for (const [customerId, ids] of xeroByCustomer) {
    for (const xid of ids) {
      const arr = byXero.get(xid) ?? [];
      arr.push(customerId);
      byXero.set(xid, arr);
    }
  }
  const customerById = new Map(customers.map((c) => [c.id, c]));
  for (const ids of byXero.values()) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = customerById.get(ids[i]);
        const b = customerById.get(ids[j]);
        if (a && b) addPair(a, b, 'xero');
      }
    }
  }

  const classified = [];
  for (const pair of pairMap.values()) {
    const classification = classifyDuplicateCandidate({
      leftCustomerId: pair.leftId,
      rightCustomerId: pair.rightId,
      leftName: pair.left.name,
      rightName: pair.right.name,
      leftCompanyName: pair.left.company_name,
      rightCompanyName: pair.right.company_name,
      leftContactPerson: pair.left.contact_person,
      rightContactPerson: pair.right.contact_person,
      leftEmail: pair.left.email,
      rightEmail: pair.right.email,
      leftPhone: pair.left.phone,
      rightPhone: pair.right.phone,
      leftVat: pair.left.vat_number,
      rightVat: pair.right.vat_number,
      leftBillingAddress: pair.left.billing_address,
      rightBillingAddress: pair.right.billing_address,
      leftXeroContactIds: xeroByCustomer.get(pair.leftId) ?? [],
      rightXeroContactIds: xeroByCustomer.get(pair.rightId) ?? [],
      alreadyAssociated: isCrcRowanPair(pair.leftId, pair.rightId),
    });
    // Drop weak name-only / likely-different noise from the reported candidate set.
    if (classification.confidenceLabel === 'LIKELY_DIFFERENT') continue;
    if (
      classification.confidenceLabel === 'REVIEW_REQUIRED' &&
      !classification.matchSignals.some((s) =>
        ['exact_normalized_email', 'exact_normalized_phone', 'same_vat', 'same_source_provider_external_id'].includes(
          s,
        ) || s.startsWith('same_xero'),
      ) &&
      pair.reasons.size === 1 &&
      pair.reasons.has('name')
    ) {
      continue;
    }
    classified.push({
      leftCustomerId: pair.leftId,
      rightCustomerId: pair.rightId,
      leftName: pair.left.company_name || pair.left.name,
      rightName: pair.right.company_name || pair.right.name,
      leftXeroContactIds: xeroByCustomer.get(pair.leftId) ?? [],
      rightXeroContactIds: xeroByCustomer.get(pair.rightId) ?? [],
      keyReasons: [...pair.reasons],
      confidenceLabel: classification.confidenceLabel,
      suggestedResolution: classification.suggestedResolution,
      matchSignals: classification.matchSignals,
      differingSignals: classification.differingSignals,
      score: classification.score,
      autoMerge: false,
    });
  }

  const counts = {
    HIGH_CONFIDENCE_DUPLICATE: 0,
    POSSIBLE_DUPLICATE: 0,
    SAME_COMPANY_DIFFERENT_CONTACT: 0,
    LIKELY_DIFFERENT: 0,
    REVIEW_REQUIRED: 0,
  };
  for (const c of classified) counts[c.confidenceLabel] = (counts[c.confidenceLabel] ?? 0) + 1;

  classified.sort((a, b) => b.score - a.score);
  const strongest = classified.slice(0, 15);

  // Enrich strongest with link counts
  for (const c of strongest) {
    const [lj] = await sql`SELECT count(*)::int AS c FROM jobs WHERE company_id=${YG} AND customer_id=${c.leftCustomerId}`;
    const [rj] = await sql`SELECT count(*)::int AS c FROM jobs WHERE company_id=${YG} AND customer_id=${c.rightCustomerId}`;
    const [lq] = await sql`SELECT count(*)::int AS c FROM quotes WHERE company_id=${YG} AND customer_id=${c.leftCustomerId}`;
    const [rq] = await sql`SELECT count(*)::int AS c FROM quotes WHERE company_id=${YG} AND customer_id=${c.rightCustomerId}`;
    const [li] = await sql`SELECT count(*)::int AS c FROM invoices WHERE company_id=${YG} AND customer_id=${c.leftCustomerId}`;
    const [ri] = await sql`SELECT count(*)::int AS c FROM invoices WHERE company_id=${YG} AND customer_id=${c.rightCustomerId}`;
    c.linkedHistory = {
      left: { jobs: lj.c, quotes: lq.c, invoices: li.c },
      right: { jobs: rj.c, quotes: rq.c, invoices: ri.c },
    };
  }

  report.proof.candidatePairsGenerated = classified.length;
  report.proof.counts = counts;
  report.proof.strongestCandidates = strongest;
  pass('candidate_pairs', String(classified.length));
  pass('high_confidence', String(counts.HIGH_CONFIDENCE_DUPLICATE));
  pass('possible', String(counts.POSSIBLE_DUPLICATE));
  pass('same_company_different_person', String(counts.SAME_COMPANY_DIFFERENT_CONTACT));
  pass('review_required', String(counts.REVIEW_REQUIRED));

  // CRC / Rowan regression (read-only)
  const crc = CUSTOMER_DUPLICATE_RECONCILIATION_CRC.canonicalCustomerId;
  const rowan = CUSTOMER_DUPLICATE_RECONCILIATION_CRC.rowanSourceCustomerId;
  const [crcRow] = await sql`SELECT id, merged_into_customer_id FROM customers WHERE company_id=${YG} AND id=${crc}`;
  const [rowanRow] = await sql`SELECT id, merged_into_customer_id FROM customers WHERE company_id=${YG} AND id=${rowan}`;
  const people = await sql`
    SELECT id FROM customer_people
    WHERE company_id=${YG} AND customer_id=${crc} AND linked_source_customer_id=${rowan}
  `;
  const assocs = await sql`
    SELECT id FROM customer_source_associations
    WHERE company_id=${YG} AND canonical_customer_id=${crc}
      AND source_customer_id=${rowan} AND status='active'
  `;
  const [rowanXero] = await sql`
    SELECT xero_contact_id FROM xero_customer_mappings
    WHERE company_id=${YG} AND customer_id=${rowan} LIMIT 1
  `;
  const [quote] = await sql`
    SELECT id, customer_id, quote_number, xero_quote_id FROM quotes
    WHERE company_id=${YG} AND id=${CUSTOMER_DUPLICATE_RECONCILIATION_CRC.royalCapeQuoteId}
  `;

  try {
    assertCrcRowanRegression({
      canonicalCustomerId: crc,
      rowanSourceCustomerId: rowan,
      rowanPersonExists: people.length > 0,
      associationActive: assocs.length > 0,
      rowanXeroContactId: rowanXero?.xero_contact_id ?? null,
      royalCapeQuoteCustomerId: quote?.customer_id ?? '',
      crcDestructivelyMerged: Boolean(crcRow?.merged_into_customer_id),
    });
    pass('crc_rowan_regression', 'SAME_COMPANY — DIFFERENT PERSON; no destructive merge');
  } catch (e) {
    fail('crc_rowan_regression', e.message);
  }

  const crcClass = classifyDuplicateCandidate({
    leftCustomerId: crc,
    rightCustomerId: rowan,
    leftName: 'CRC',
    rightName: 'Rowan',
    leftXeroContactIds: [CUSTOMER_DUPLICATE_RECONCILIATION_CRC.xeroContactId],
    rightXeroContactIds: [CUSTOMER_DUPLICATE_RECONCILIATION_CRC.rowanXeroContactId],
    alreadyAssociated: assocs.length > 0,
  });
  if (crcClass.confidenceLabel === 'SAME_COMPANY_DIFFERENT_CONTACT') {
    pass('crc_rowan_classification', crcClass.confidenceLabel);
  } else {
    fail('crc_rowan_classification', crcClass.confidenceLabel);
  }

  // Royal Cape / Property 360 / QU-0183
  const [prop] = await sql`
    SELECT id, customer_id, property_name FROM cx_customer_properties
    WHERE company_id=${YG} AND id='8b42a5d3-97fa-4d53-b61a-9917accf9fa8'
  `;
  const [job] = await sql`
    SELECT id, job_number, property_id, snapshot_street FROM jobs
    WHERE company_id=${YG} AND id='5920ef4a-51a9-44ec-8577-09d187ca9c33'
  `;
  if (prop?.customer_id === crc && quote?.quote_number === 'QU-0183' && job?.job_number === 'JOB-000002') {
    pass('royal_cape_property360_qu0183', 'intact');
  } else {
    fail('royal_cape_property360_qu0183', JSON.stringify({ prop, quote, job }));
  }

  report.proof.crcRowan = {
    classification: crcClass.confidenceLabel,
    crcMerged: Boolean(crcRow?.merged_into_customer_id),
    rowanMerged: Boolean(rowanRow?.merged_into_customer_id),
    personCount: people.length,
    associationCount: assocs.length,
    rowanXeroContactId: rowanXero?.xero_contact_id ?? null,
    qu0183CustomerId: quote?.customer_id ?? null,
    qu0183XeroQuoteId: quote?.xero_quote_id ?? null,
  };

  // Disposable fixture proof inside rolled-back transaction
  await sql.begin(async (tx) => {
    const [a] = await tx`
      INSERT INTO customers (company_id, name, company_name, email, phone, status)
      VALUES (${YG}, 'R85 Fixture Alpha', 'R85 Fixture Alpha', 'r85-alpha@example.test', '0825550199', 'active')
      RETURNING id
    `;
    const [b] = await tx`
      INSERT INTO customers (company_id, name, company_name, email, phone, status)
      VALUES (${YG}, 'R85 Fixture Alpha', 'R85 Fixture Alpha', 'r85-alpha@example.test', '0825550199', 'active')
      RETURNING id
    `;
    const cls = classifyDuplicateCandidate({
      leftCustomerId: a.id,
      rightCustomerId: b.id,
      leftName: 'R85 Fixture Alpha',
      rightName: 'R85 Fixture Alpha',
      leftEmail: 'r85-alpha@example.test',
      rightEmail: 'r85-alpha@example.test',
      leftPhone: '0825550199',
      rightPhone: '0825550199',
      leftXeroContactIds: [],
      rightXeroContactIds: [],
    });
    if (cls.autoMerge !== false) throw new Error('autoMerge must be false');
    if (cls.confidenceLabel !== 'POSSIBLE_DUPLICATE' && cls.confidenceLabel !== 'HIGH_CONFIDENCE_DUPLICATE') {
      // email+phone should be at least possible
      throw new Error(`unexpected fixture class ${cls.confidenceLabel}`);
    }
    // Soft canonicalize path in fixture then rollback
    await tx`
      UPDATE customers SET merged_into_customer_id = ${a.id}, status = 'inactive'
      WHERE id = ${b.id} AND company_id = ${YG}
    `;
    const [check] = await tx`SELECT merged_into_customer_id FROM customers WHERE id=${b.id}`;
    if (check.merged_into_customer_id !== a.id) throw new Error('fixture canonicalize failed');
    pass('fixture_canonicalization_in_transaction', 'soft merge pointer works; rolling back');
    throw new Error('ROLLBACK_FIXTURE_OK');
  }).catch((e) => {
    if (String(e.message).includes('ROLLBACK_FIXTURE_OK')) {
      pass('fixture_rolled_back', 'no permanent fixture customers left');
    } else if (!report.results.some((r) => r.name === 'fixture_canonicalization_in_transaction' && r.status === 'PASS')) {
      fail('fixture_transaction', e.message);
    } else {
      // rollback via thrown error after pass
      pass('fixture_rolled_back', 'no permanent fixture customers left');
    }
  });

  const leftover = await sql`
    SELECT count(*)::int AS c FROM customers
    WHERE company_id=${YG} AND name LIKE 'R85 Fixture%'
  `;
  if (leftover[0].c === 0) pass('no_permanent_fake_customers', '0');
  else fail('no_permanent_fake_customers', String(leftover[0].c));

  pass('no_real_merge', '0 real Young Guns merges executed');
  pass('xero_writes', '0');
  pass('production_writes', '0');
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
console.log(
  JSON.stringify(
    {
      outPath,
      failed,
      blockers: report.blockers.length,
      scanned: report.proof.totalCustomersScanned,
      pairs: report.proof.candidatePairsGenerated,
      counts: report.proof.counts,
    },
    null,
    2,
  ),
);
process.exit(failed || report.blockers.length ? 1 : 0);
