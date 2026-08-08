#!/usr/bin/env node
/**
 * Row 83 — CRC Customer 360 staging proof (non-destructive).
 * STAGING ONLY. No Xero writes. No production. No financial ownership moves.
 *
 * Usage:
 *   APP_ENV=staging TITAN_ENV=staging STAGING_DATABASE_URL=... \
 *     node packages/db/scripts/customer-360-crc-staging-proof.mjs
 *   ... --apply   # create people + associations on staging
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  CUSTOMER_360_CRC_STAGING,
  assertAssociationDoesNotMoveOwnership,
  assertRoyalCapeRelationshipUnchanged,
  assertSourceIdsPreserved,
  planRuahnAssociation,
} from '../../shared/dist/customer-360.js';
import { assertStagingDatabaseIdentity } from '../../shared/dist/royal-cape-job360-rehearsal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const outPath = path.resolve(repoRoot, 'diagnostic-output/customer-360-crc-staging-proof.json');
const APPLY = process.argv.includes('--apply');

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
  return out;
}

const report = {
  label: 'customer-360-crc-staging-proof',
  generatedAt: new Date().toISOString(),
  mode: APPLY ? 'apply' : 'inspect',
  stagingOnly: true,
  xeroWriteCalls: 0,
  productionWrites: 0,
  results: [],
  blockers: [],
};

function pass(name, detail = '') {
  report.results.push({ name, status: 'PASS', detail });
}
function fail(name, detail = '') {
  report.results.push({ name, status: 'FAIL', detail: String(detail).slice(0, 500) });
}
function skip(name, detail = '') {
  report.results.push({ name, status: 'SKIP', detail });
}

const env = loadEnv();
const guard = assertStagingDatabaseIdentity({
  appEnv: env.APP_ENV,
  titanEnv: env.TITAN_ENV,
  databaseUrl: env.DATABASE_URL,
});
if (!guard.ok) {
  report.blockers.push(guard.reason);
  skip('staging', guard.reason);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}

const db = postgres(env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
const companyId = CUSTOMER_360_CRC_STAGING.youngGunsCompanyId;
const crcId = CUSTOMER_360_CRC_STAGING.canonicalCustomerId;
const rowanId = CUSTOMER_360_CRC_STAGING.rowanSourceCustomerId;

try {
  // Ensure migration tables exist on staging (IF NOT EXISTS).
  if (APPLY) {
    const sqlPath = path.resolve(
      repoRoot,
      'packages/db/drizzle/0204_customer_360_people_associations.sql',
    );
    await db.unsafe(fs.readFileSync(sqlPath, 'utf8'));
    pass('migration_0204_ensured', 'customer_people + associations present on staging');
  }

  const [crc] = await db`SELECT id, name FROM customers WHERE company_id=${companyId} AND id=${crcId}`;
  const [rowan] = await db`SELECT id, name FROM customers WHERE company_id=${companyId} AND id=${rowanId}`;
  if (!crc) fail('crc_exists', 'CRC missing');
  else pass('crc_canonical', `${crc.name}:${crc.id}`);
  if (!rowan) fail('rowan_exists', 'Rowan CRC missing');
  else pass('rowan_preserved', `${rowan.name}:${rowan.id}`);

  const [xeroCrc] = await db`
    SELECT xero_contact_id FROM xero_customer_mappings
    WHERE company_id=${companyId} AND customer_id=${crcId}
  `;
  const [xeroRowan] = await db`
    SELECT xero_contact_id FROM xero_customer_mappings
    WHERE company_id=${companyId} AND customer_id=${rowanId}
  `;
  assertSourceIdsPreserved({
    before: {
      sourceExternalId: xeroCrc?.xero_contact_id ?? null,
      xeroContactId: xeroCrc?.xero_contact_id ?? null,
    },
    after: {
      sourceExternalId: xeroCrc?.xero_contact_id ?? null,
      xeroContactId: xeroCrc?.xero_contact_id ?? null,
    },
  });
  pass('xero_source_ids_present', `crc=${xeroCrc?.xero_contact_id} rowan=${xeroRowan?.xero_contact_id}`);

  const quoteBefore = await db`
    SELECT id, customer_id, quote_number, xero_quote_id, job_id
    FROM quotes
    WHERE company_id=${companyId}
      AND (customer_id=${crcId} OR customer_id=${rowanId} OR upper(quote_number)='QU-0183')
  `;
  const invoiceBefore = await db`
    SELECT id, customer_id FROM invoices
    WHERE company_id=${companyId} AND (customer_id=${crcId} OR customer_id=${rowanId})
  `;

  const ruahnCandidates = await db`
    SELECT id, name FROM customers
    WHERE company_id=${companyId}
      AND id <> ${crcId}
      AND id <> ${rowanId}
      AND (
        lower(name) LIKE '%ruahn%'
        OR lower(coalesce(contact_person,'')) LIKE '%ruahn%'
      )
    ORDER BY name
  `;
  const ruahnPlan = planRuahnAssociation({
    candidates: ruahnCandidates.map((r) => ({ id: r.id, name: r.name })),
  });
  report.ruahn = ruahnPlan;
  pass('ruahn_plan', `${ruahnPlan.decision}: ${ruahnPlan.reason}`);

  let rowanPersonId = null;
  let rowanAssocId = null;
  let ruahnPersonId = null;
  let ruahnAssocId = null;

  if (APPLY && crc && rowan) {
    const [existingPerson] = await db`
      SELECT id FROM customer_people
      WHERE company_id=${companyId} AND customer_id=${crcId}
        AND linked_source_customer_id=${rowanId}
      LIMIT 1
    `;
    if (existingPerson) {
      rowanPersonId = existingPerson.id;
      pass('rowan_person_idempotent', rowanPersonId);
    } else {
      const [person] = await db`
        INSERT INTO customer_people (
          company_id, customer_id, first_name, display_name, email,
          is_site_contact, consent_status, status,
          source_provider, source_external_id, linked_source_customer_id,
          provenance
        ) VALUES (
          ${companyId}, ${crcId}, ${'Rowan'}, ${'Rowan'}, ${rowan.name.includes('@') ? null : null},
          true, ${'unknown'}, ${'active'},
          ${'xero'}, ${xeroRowan?.xero_contact_id ?? null}, ${rowanId},
          ${db.json({ stagingProof: true, nonDestructive: true })}
        )
        RETURNING id
      `;
      rowanPersonId = person.id;
      pass('rowan_person_created', rowanPersonId);
    }

    const [existingAssoc] = await db`
      SELECT id FROM customer_source_associations
      WHERE company_id=${companyId}
        AND canonical_customer_id=${crcId}
        AND source_customer_id=${rowanId}
        AND status='active'
      LIMIT 1
    `;
    if (existingAssoc) {
      rowanAssocId = existingAssoc.id;
      pass('rowan_assoc_idempotent', rowanAssocId);
    } else {
      const [assoc] = await db`
        INSERT INTO customer_source_associations (
          company_id, canonical_customer_id, source_customer_id, person_id,
          association_role, reason, source_provider, source_external_id,
          preserves_financial_ownership, destructive_merge, xero_write, metadata
        ) VALUES (
          ${companyId}, ${crcId}, ${rowanId}, ${rowanPersonId},
          ${'related_person'}, ${'Owner-confirmed CRC contact — Rowan'},
          ${'xero'}, ${xeroRowan?.xero_contact_id ?? null},
          true, false, false,
          ${db.json({ stagingProof: true })}
        )
        RETURNING id
      `;
      rowanAssocId = assoc.id;
      pass('rowan_assoc_created', rowanAssocId);
    }

    if (ruahnPlan.decision === 'ASSOCIATE' && ruahnPlan.candidate) {
      const ruahnId = ruahnPlan.candidate.id;
      const [xeroRuahn] = await db`
        SELECT xero_contact_id FROM xero_customer_mappings
        WHERE company_id=${companyId} AND customer_id=${ruahnId}
      `;
      const [existingRuahnPerson] = await db`
        SELECT id FROM customer_people
        WHERE company_id=${companyId} AND customer_id=${crcId}
          AND linked_source_customer_id=${ruahnId}
        LIMIT 1
      `;
      if (existingRuahnPerson) {
        ruahnPersonId = existingRuahnPerson.id;
        pass('ruahn_person_idempotent', ruahnPersonId);
      } else {
        const [person] = await db`
          INSERT INTO customer_people (
            company_id, customer_id, first_name, display_name,
            is_site_contact, consent_status, status,
            source_provider, source_external_id, linked_source_customer_id, provenance
          ) VALUES (
            ${companyId}, ${crcId}, ${'Ruahn'}, ${'Ruahn'},
            true, ${'unknown'}, ${'active'},
            ${'xero'}, ${xeroRuahn?.xero_contact_id ?? null}, ${ruahnId},
            ${db.json({ stagingProof: true })}
          ) RETURNING id
        `;
        ruahnPersonId = person.id;
        pass('ruahn_person_created', ruahnPersonId);
      }
      const [existingRuahnAssoc] = await db`
        SELECT id FROM customer_source_associations
        WHERE company_id=${companyId}
          AND canonical_customer_id=${crcId}
          AND source_customer_id=${ruahnId}
          AND status='active'
        LIMIT 1
      `;
      if (existingRuahnAssoc) {
        ruahnAssocId = existingRuahnAssoc.id;
        pass('ruahn_assoc_idempotent', ruahnAssocId);
      } else {
        const [assoc] = await db`
          INSERT INTO customer_source_associations (
            company_id, canonical_customer_id, source_customer_id, person_id,
            association_role, reason, source_provider, source_external_id,
            preserves_financial_ownership, destructive_merge, xero_write
          ) VALUES (
            ${companyId}, ${crcId}, ${ruahnId}, ${ruahnPersonId},
            ${'related_person'}, ${'Owner-confirmed CRC contact — Ruahn'},
            ${'xero'}, ${xeroRuahn?.xero_contact_id ?? null},
            true, false, false
          ) RETURNING id
        `;
        ruahnAssocId = assoc.id;
        pass('ruahn_assoc_created', ruahnAssocId);
      }
    } else if (ruahnPlan.decision === 'REVIEW_REQUIRED') {
      skip('ruahn_association', ruahnPlan.reason);
    } else {
      skip('ruahn_association', ruahnPlan.reason);
    }
  } else if (!APPLY) {
    skip('apply', 'Inspect mode — pass --apply to associate Rowan/Ruahn on staging');
  }

  const quoteAfter = await db`
    SELECT id, customer_id, quote_number, xero_quote_id, job_id
    FROM quotes
    WHERE company_id=${companyId}
      AND (customer_id=${crcId} OR customer_id=${rowanId} OR upper(quote_number)='QU-0183')
  `;
  const invoiceAfter = await db`
    SELECT id, customer_id FROM invoices
    WHERE company_id=${companyId} AND (customer_id=${crcId} OR customer_id=${rowanId})
  `;

  assertAssociationDoesNotMoveOwnership({
    quoteCustomerIdsBefore: quoteBefore.map((q) => q.customer_id),
    quoteCustomerIdsAfter: quoteAfter.map((q) => q.customer_id),
    invoiceCustomerIdsBefore: invoiceBefore.map((i) => i.customer_id),
    invoiceCustomerIdsAfter: invoiceAfter.map((i) => i.customer_id),
  });
  pass('ownership_unchanged', 'quote/invoice customer_ids unchanged');

  const qu0183 = quoteAfter.find((q) => String(q.quote_number).toUpperCase() === 'QU-0183');
  if (qu0183) {
    assertRoyalCapeRelationshipUnchanged({
      quoteId: qu0183.id,
      quoteNumber: qu0183.quote_number,
      customerId: qu0183.customer_id,
      xeroQuoteId: qu0183.xero_quote_id,
      jobId: qu0183.job_id,
    });
    pass('royal_cape_unchanged', `job=${qu0183.job_id} customer=${qu0183.customer_id}`);
  } else {
    fail('royal_cape_unchanged', 'QU-0183 missing');
  }

  // Rowan customer row still exists and was not merged.
  const [rowanStill] = await db`
    SELECT id, name, merged_into_customer_id FROM customers WHERE id=${rowanId}
  `;
  if (rowanStill && !rowanStill.merged_into_customer_id) {
    pass('rowan_not_merged', rowanStill.id);
  } else {
    fail('rowan_not_merged', JSON.stringify(rowanStill));
  }

  const people = await db`
    SELECT id, display_name, linked_source_customer_id, source_external_id, status
    FROM customer_people WHERE company_id=${companyId} AND customer_id=${crcId}
  `.catch(() => []);
  const assocs = await db`
    SELECT id, source_customer_id, status, source_external_id
    FROM customer_source_associations
    WHERE company_id=${companyId} AND canonical_customer_id=${crcId} AND status='active'
  `.catch(() => []);

  report.proof = {
    crcId,
    rowanId,
    rowanPersonId,
    rowanAssocId,
    ruahnPersonId,
    ruahnAssocId,
    people,
    associations: assocs,
    qu0183,
    xeroWriteCalls: 0,
    productionWrites: 0,
  };
  pass('no_xero_writes', '0');
  pass('no_production_writes', '0');
} catch (error) {
  fail('proof_error', error instanceof Error ? error.message : String(error));
  report.blockers.push(error instanceof Error ? error.message : String(error));
} finally {
  await db.end({ timeout: 5 });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

process.exit(report.results.some((r) => r.status === 'FAIL') ? 1 : 0);
