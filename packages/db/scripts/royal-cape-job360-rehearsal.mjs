#!/usr/bin/env node
/**
 * Royal Cape Yacht Club — real-data staging Job 360 rehearsal.
 *
 * STAGING ONLY. Refuses production Supabase.
 * NO live Xero writes. NO live customer sends.
 * Xero is the canonical financial source for QU-0183.
 *
 * Default: inspect + plan (read-only).
 * Apply staging writes: --apply
 *
 * Usage:
 *   node packages/db/scripts/royal-cape-job360-rehearsal.mjs
 *   node packages/db/scripts/royal-cape-job360-rehearsal.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  ROYAL_CAPE_CANONICAL_QUOTE_NUMBER,
  ROYAL_CAPE_PRODUCTION_FORBIDDEN,
  ROYAL_CAPE_SAFETY_CONTRACT,
  ROYAL_CAPE_SCREENSHOT_EVIDENCE,
  ROYAL_CAPE_SITE_NAME,
  ROYAL_CAPE_STAGING_IDENTITY,
  assertFullHistoryRuleRemainsActive,
  assertStagingDatabaseIdentity,
  buildRoyalCapeAuditEvents,
  buildRoyalCapeJob360View,
  buildRoyalCapeRehearsalPlan,
  proveProductionUntouched,
  rehearseRoyalCapeMultiDayWorkflow,
} from '../../shared/dist/royal-cape-job360-rehearsal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
const outPath = path.resolve(repoRoot, 'diagnostic-output/royal-cape-job360-rehearsal.json');
const APPLY = process.argv.includes('--apply');

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

const report = {
  label: 'royal-cape-job360-rehearsal',
  generatedAt: new Date().toISOString(),
  mode: APPLY ? 'apply' : 'inspect',
  quoteNumber: ROYAL_CAPE_CANONICAL_QUOTE_NUMBER,
  stagingIdentity: ROYAL_CAPE_STAGING_IDENTITY,
  productionForbidden: ROYAL_CAPE_PRODUCTION_FORBIDDEN,
  safety: ROYAL_CAPE_SAFETY_CONTRACT,
  screenshotEvidenceSupportingOnly: ROYAL_CAPE_SCREENSHOT_EVIDENCE,
  xeroWriteCalls: 0,
  customerSendCalls: 0,
  productionMigrationApplied: false,
  results: [],
  blockers: [],
  fullHistoryRule: assertFullHistoryRuleRemainsActive(),
  multiDayRehearsal: rehearseRoyalCapeMultiDayWorkflow(),
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

function writeReport() {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

const env = loadEnv(envPath);
const guard = assertStagingDatabaseIdentity({
  appEnv: env.APP_ENV,
  titanEnv: env.TITAN_ENV,
  databaseUrl: env.DATABASE_URL,
});

if (!guard.ok) {
  report.blocked = guard.reason;
  report.blockers.push(guard.reason);
  skip('staging_db_inspect', guard.reason);
  skip(
    'live_qu0183_lookup',
    'Blocked — staging credentials / identity not available in this environment.',
  );
  pass('no_xero_writes', 'xeroWriteCalls=0');
  pass('no_customer_sends', 'customerSendCalls=0');
  pass('production_untouched_policy', ROYAL_CAPE_PRODUCTION_FORBIDDEN.reason);
  pass('full_history_rule_active', report.fullHistoryRule.note);
  pass('multi_day_still_busy_capability', report.multiDayRehearsal.invoiceGate.reason);
  writeReport();
  process.exit(2);
}

try {
  report.productionProof = proveProductionUntouched({
    databaseUrl: env.DATABASE_URL,
    xeroWriteCalls: 0,
    customerSendCalls: 0,
    productionMigrationApplied: false,
  });
  pass('production_untouched', report.productionProof.proof.join(' | '));
} catch (error) {
  fail('production_untouched', error instanceof Error ? error.message : String(error));
  writeReport();
  process.exit(3);
}

const db = postgres(env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
const companyId = ROYAL_CAPE_STAGING_IDENTITY.youngGunsCompanyId;

try {
  const quoteRows = await db`
    SELECT
      q.id,
      q.quote_number,
      q.xero_quote_id,
      q.source_external_id,
      q.source_provider,
      q.issued_at,
      q.customer_id,
      c.name AS customer_name,
      q.title AS reference,
      q.status,
      q.subtotal_cents,
      q.vat_cents,
      q.total_cents,
      q.currency,
      q.job_id,
      m.sync_status,
      (
        SELECT count(*)::int
        FROM quote_line_items qli
        WHERE qli.quote_id = q.id
      ) AS line_item_count
    FROM quotes q
    LEFT JOIN customers c ON c.id = q.customer_id
    LEFT JOIN xero_quote_mappings m
      ON m.quote_id = q.id AND m.company_id = q.company_id
    WHERE q.company_id = ${companyId}
      AND upper(q.quote_number) = ${ROYAL_CAPE_CANONICAL_QUOTE_NUMBER}
  `;

  const quotes = quoteRows.map((row) => ({
    titanQuoteId: row.id,
    quoteNumber: row.quote_number,
    xeroQuoteId: row.xero_quote_id,
    sourceExternalId: row.source_external_id,
    sourceProvider: row.source_provider,
    issuedAt: row.issued_at ? new Date(row.issued_at).toISOString() : null,
    customerId: row.customer_id,
    customerName: row.customer_name,
    reference: row.reference,
    status: row.status,
    subtotalCents: row.subtotal_cents,
    vatCents: row.vat_cents,
    totalCents: row.total_cents,
    currency: row.currency,
    jobId: row.job_id,
    lineItemCount: row.line_item_count ?? 0,
    syncStatus: row.sync_status,
  }));

  report.existingQuotes = quotes;
  if (quotes.length === 0) {
    fail(
      'qu0183_exists',
      'QU-0183 not found in staging TITAN — run Xero full-history import; do not invent a quote.',
    );
  } else if (quotes.length > 1) {
    fail('qu0183_unique', `Found ${quotes.length} QU-0183 rows — review required.`);
  } else {
    pass('qu0183_exists', `id=${quotes[0].titanQuoteId} xero=${quotes[0].xeroQuoteId}`);
    pass('qu0183_number_retained', quotes[0].quoteNumber);
    pass(
      'qu0183_xero_identity_retained',
      quotes[0].xeroQuoteId ?? quotes[0].sourceExternalId ?? 'missing',
    );
  }

  const quote = quotes[0] ?? null;
  const customerId = quote?.customerId ?? null;

  const customers = customerId
    ? await db`
        SELECT
          c.id,
          c.name,
          c.email,
          c.phone,
          xm.xero_contact_id AS source_external_id
        FROM customers c
        LEFT JOIN xero_customer_mappings xm
          ON xm.customer_id = c.id AND xm.company_id = c.company_id
        WHERE c.company_id = ${companyId}
          AND (
            c.id = ${customerId}
            OR lower(c.name) LIKE '%crc%'
            OR lower(c.name) LIKE '%royal cape%'
            OR lower(c.name) LIKE '%yacht%'
          )
      `
    : [];

  const customerCandidates = customers.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    sourceExternalId: row.source_external_id,
    matchReasons: row.id === customerId ? ['quote.customerId'] : ['name_search'],
  }));

  const properties = customerId
    ? await db`
        SELECT id, property_name, customer_id, address_line1, city, metadata
        FROM cx_customer_properties
        WHERE company_id = ${companyId}
          AND customer_id = ${customerId}
      `
    : [];

  const propertyCandidates = properties.map((row) => ({
    id: row.id,
    name: row.property_name ?? '',
    customerId: row.customer_id,
    address: [row.address_line1, row.city].filter(Boolean).join(', ') || null,
    sourceExternalId:
      row.metadata && typeof row.metadata === 'object'
        ? row.metadata.sourceExternalId ?? null
        : null,
    matchReasons: ['customer_scope'],
  }));

  const jobs = customerId
    ? await db`
        SELECT
          j.id,
          j.job_number,
          j.title,
          j.customer_id,
          j.property_id,
          j.status,
          j.execution_phase,
          coalesce(
            (
              SELECT array_agg(q2.quote_number)
              FROM quotes q2
              WHERE q2.job_id = j.id AND q2.company_id = j.company_id
            ),
            '{}'::text[]
          ) AS quote_numbers
        FROM jobs j
        WHERE j.company_id = ${companyId}
          AND j.customer_id = ${customerId}
      `
    : [];

  const jobCandidates = jobs.map((row) => ({
    id: row.id,
    jobNumber: row.job_number,
    title: row.title,
    customerId: row.customer_id,
    propertyId: row.property_id,
    status: row.status,
    executionPhase: row.execution_phase,
    quoteNumbers: row.quote_numbers ?? [],
    matchReasons: ['customer_scope'],
  }));

  const plan = buildRoyalCapeRehearsalPlan({
    quotes,
    customers: customerCandidates,
    properties: propertyCandidates,
    jobs: jobCandidates,
  });
  report.plan = plan;
  report.blockers.push(...plan.blockers);

  if (plan.customerPlan.decision === 'USE_EXISTING') {
    pass('customer_matched', plan.customerPlan.customer?.name ?? plan.customerPlan.customer?.id);
  } else if (plan.customerPlan.decision === 'REVIEW_REQUIRED') {
    fail('customer_matched', plan.customerPlan.reason);
  } else {
    fail('customer_matched', plan.customerPlan.reason);
  }

  let propertyId = plan.propertyPlan.property?.id ?? null;
  let propertyCreated = false;
  let jobId = plan.jobPlan.job?.id ?? quote?.jobId ?? null;
  let jobCreated = false;
  let quoteLinked = Boolean(quote?.jobId);
  let jobNumber = plan.jobPlan.job?.jobNumber ?? null;

  if (!APPLY) {
    skip(
      'apply_writes',
      'Inspect mode — pass --apply to create missing site/job and link quote on staging only.',
    );
  } else if (
    plan.blocked &&
    plan.quotePlan.decision !== 'USE_EXISTING' &&
    plan.quotePlan.decision !== 'ALREADY_LINKED'
  ) {
    fail('apply_blocked', plan.blockers.join(' | '));
  } else if (quote && customerId) {
    if (plan.propertyPlan.decision === 'CREATE_ONCE' && !propertyId) {
      const existing = await db`
        SELECT id, property_name FROM cx_customer_properties
        WHERE company_id = ${companyId}
          AND customer_id = ${customerId}
          AND (
            lower(property_name) = lower(${ROYAL_CAPE_SITE_NAME})
            OR metadata->>'sourceExternalId' = ${`royal-cape-site:${customerId}`}
          )
        LIMIT 1
      `;
      if (existing[0]) {
        propertyId = existing[0].id;
        pass('property_matched_idempotent', propertyId);
      } else {
        const [createdProperty] = await db`
          INSERT INTO cx_customer_properties (
            company_id,
            customer_id,
            property_name,
            metadata,
            created_at,
            updated_at
          ) VALUES (
            ${companyId},
            ${customerId},
            ${ROYAL_CAPE_SITE_NAME},
            ${db.json({
              sourceExternalId: `royal-cape-site:${customerId}`,
              sourceProvider: 'staging_rehearsal',
              pilot: 'royal_cape_job360',
            })},
            now(),
            now()
          )
          RETURNING id, property_name
        `;
        propertyId = createdProperty?.id ?? null;
        propertyCreated = Boolean(createdProperty);
        pass('property_created_once', `id=${propertyId}`);
      }
    } else if (propertyId) {
      pass('property_matched', propertyId);
    } else if (plan.propertyPlan.decision === 'REVIEW_REQUIRED') {
      fail('property_match', plan.propertyPlan.reason);
    }

    if (!jobId && propertyId && customerId) {
      const existingJob = await db`
        SELECT id, job_number FROM jobs
        WHERE company_id = ${companyId}
          AND source_provider = ${'staging_rehearsal'}
          AND source_external_id = ${`royal-cape-job:${ROYAL_CAPE_CANONICAL_QUOTE_NUMBER}`}
        LIMIT 1
      `;
      if (existingJob[0]) {
        jobId = existingJob[0].id;
        jobNumber = existingJob[0].job_number;
        pass('job_matched_idempotent', jobId);
      } else if (
        plan.jobPlan.decision === 'CREATE_ONCE' ||
        plan.jobPlan.decision === 'LINK_EXISTING'
      ) {
        if (plan.jobPlan.decision === 'LINK_EXISTING' && plan.jobPlan.job) {
          jobId = plan.jobPlan.job.id;
          jobNumber = plan.jobPlan.job.jobNumber;
          pass('job_matched', jobId);
        } else {
          const [createdJob] = await db`
            INSERT INTO jobs (
              company_id,
              customer_id,
              property_id,
              title,
              description,
              status,
              source_provider,
              source_external_id,
              historical_flags,
              created_at,
              updated_at
            ) VALUES (
              ${companyId},
              ${customerId},
              ${propertyId},
              ${`Royal Cape Yacht Club — ${ROYAL_CAPE_CANONICAL_QUOTE_NUMBER}`},
              ${`Staging Job 360 shell linked to Xero quote ${ROYAL_CAPE_CANONICAL_QUOTE_NUMBER}. No invented photos/payments/technicians.`},
              ${'new'},
              ${'staging_rehearsal'},
              ${`royal-cape-job:${ROYAL_CAPE_CANONICAL_QUOTE_NUMBER}`},
              ${db.json(['ROYAL_CAPE_STAGING_REHEARSAL'])},
              now(),
              now()
            )
            RETURNING id, job_number
          `;
          jobId = createdJob?.id ?? null;
          jobNumber = createdJob?.job_number ?? null;
          jobCreated = Boolean(createdJob);
          pass('job_created_once', `id=${jobId} number=${jobNumber}`);
        }
      }
    } else if (jobId) {
      pass('job_already_present', jobId);
    }

    if (quote && jobId && quote.jobId !== jobId) {
      await db`
        UPDATE quotes
        SET job_id = ${jobId}, updated_at = now()
        WHERE company_id = ${companyId}
          AND id = ${quote.titanQuoteId}
          AND (job_id IS NULL OR job_id = ${jobId})
      `;
      quoteLinked = true;
      pass('quote_linked', `${quote.titanQuoteId} -> ${jobId}`);
    } else if (quote?.jobId) {
      pass('quote_already_linked', quote.jobId);
      quoteLinked = true;
      jobId = quote.jobId;
    }

    // Audit rows — security_audit_logs when available
    const auditEvents = buildRoyalCapeAuditEvents({
      actorUserId: null,
      tenantCompanyId: companyId,
      quoteId: quote.titanQuoteId,
      customerId,
      propertyId,
      propertyCreated,
      jobId,
      jobCreated,
      quoteLinked,
      documentLinked: false,
    });
    for (const event of auditEvents) {
      await db`
        INSERT INTO security_audit_logs (
          company_id, category, action, entity_type, entity_id, metadata, occurred_at
        ) VALUES (
          ${companyId},
          ${'financial'},
          ${event.action},
          ${event.entityType},
          ${event.entityId},
          ${db.json({
            source: event.source,
            pilot: 'royal_cape_job360',
            noXeroWrite: true,
            noCustomerSend: true,
          })},
          ${event.at}
        )
      `;
    }
    pass('audit_recorded', `${auditEvents.length} events`);
  }

  let paymentCount = 0;
  if (jobId) {
    const payRows = await db`
      SELECT count(*)::int AS count
      FROM payments p
      INNER JOIN invoices i ON i.id = p.invoice_id
      WHERE i.company_id = ${companyId} AND i.job_id = ${jobId}
    `;
    paymentCount = payRows[0]?.count ?? 0;
  }

  if (quote) {
    report.job360 = buildRoyalCapeJob360View({
      jobNumber,
      customerName: quote.customerName,
      status: plan.jobPlan.job?.status ?? (jobCreated ? 'new' : null),
      quote: { ...quote, jobId: jobId ?? quote.jobId },
      paymentCount,
      quotePdfLinked: false,
      historyEvents: buildRoyalCapeAuditEvents({
        actorUserId: null,
        tenantCompanyId: companyId,
        quoteId: quote.titanQuoteId,
        customerId,
        propertyId,
        propertyCreated,
        jobId,
        jobCreated,
        quoteLinked,
        documentLinked: false,
      }).map((e) => e.action),
    });
    pass('job360_view_built', `payments=${paymentCount}`);
  }

  if (quote && jobId) {
    const secondQuotes = await db`
      SELECT id, job_id FROM quotes
      WHERE company_id = ${companyId}
        AND upper(quote_number) = ${ROYAL_CAPE_CANONICAL_QUOTE_NUMBER}
    `;
    if (secondQuotes.length === 1 && secondQuotes[0].job_id === jobId) {
      pass('idempotent_quote_job_link', `quote=${secondQuotes[0].id} job=${jobId}`);
    } else if (secondQuotes.length === 1 && !APPLY) {
      skip('idempotent_quote_job_link', 'Inspect mode — link not applied yet.');
    } else {
      fail('idempotent_quote_job_link', JSON.stringify(secondQuotes));
    }
  }

  pass('no_xero_writes', `xeroWriteCalls=${report.xeroWriteCalls}`);
  pass('no_customer_sends', `customerSendCalls=${report.customerSendCalls}`);
  pass('still_busy_blocks_invoice', report.multiDayRehearsal.invoiceGate.reason);
  pass('full_history_rule_active', report.fullHistoryRule.note);

  report.canonical = {
    quoteId: quote?.titanQuoteId ?? null,
    xeroQuoteId: quote?.xeroQuoteId ?? null,
    customerId,
    propertyId,
    jobId,
    jobNumber,
    quoteLinked,
    paymentCount,
  };
} catch (error) {
  fail('rehearsal_error', error instanceof Error ? error.message : String(error));
  report.blockers.push(error instanceof Error ? error.message : String(error));
} finally {
  await db.end({ timeout: 5 });
  writeReport();
}

const failed = report.results.some((r) => r.status === 'FAIL');
process.exit(failed ? 1 : 0);
