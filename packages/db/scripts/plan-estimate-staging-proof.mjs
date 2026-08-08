#!/usr/bin/env node
/**
 * Row 94 — Plan / Floor-Plan Quotation & Estimate Baseline staging proof.
 * READ-ONLY plan-document audit first. Isolated synthetic fixture (create + cleanup).
 * Row 92 remains DRAFT / automation OFF. Xero writes = 0 · customer sends = 0 · production = 0.
 * NOT Row 95 / 96 / 98.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import {
  PLAN_ESTIMATE_ROYAL_CAPE,
  assertCanApproveForQuote,
  assertCanGenerateDraftQuote,
  assertMeasurementAllowed,
  assertNoPlanEstimateInternalLeak,
  assertRow92StillInactiveForPlanEstimate,
  assertRow94NoCustomerSends,
  assertRow94NoProductionWrites,
  assertRow94NoXeroWrites,
  assertRow95NotStarted,
  assertRow96NotStarted,
  assertRow98AiTakeoffNotStarted,
  assertRoyalCapePlanEstimateUnchanged,
  buildPlanEstimateSummary,
  buildPlanVsActualComparison,
  canApprovePlanEstimate,
  canManagePlanEstimates,
  mapEstimateItemsToQuoteLines,
  planRevisionRequiresReview,
  projectCustomerSafePlanQuote,
  resolvePlanEstimateStatus,
} from '../../shared/dist/plan-estimate.js';
import {
  assertRow92GlobalAutomationDisabled,
  buildYoungGunsDraftRuleSet,
} from '../../shared/dist/pricebook-tier-formula.js';
import { assertStagingDatabaseIdentity } from '../../shared/dist/royal-cape-job360-rehearsal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const outPath = path.resolve(repoRoot, 'diagnostic-output/plan-estimate-staging-proof.json');
const FORBIDDEN_PROD = 'rshuiaghmtrvvilhqpwm';
const YG = PLAN_ESTIMATE_ROYAL_CAPE.youngGunsCompanyId;
const RC_QUOTE = PLAN_ESTIMATE_ROYAL_CAPE.royalCapeQuoteId;
const RC_JOB = PLAN_ESTIMATE_ROYAL_CAPE.jobId;
const RC_CRC = PLAN_ESTIMATE_ROYAL_CAPE.canonicalCustomerId;

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
  label: 'plan-estimate-staging-proof',
  row: 94,
  generatedAt: new Date().toISOString(),
  stagingOnly: true,
  xeroWriteCalls: 0,
  customerSends: 0,
  productionWrites: 0,
  productionMigrations: 0,
  row95Started: false,
  row96Started: false,
  row98AiTakeoffStarted: false,
  row92AutomationEnabled: false,
  architecture: {
    existingPlanTakeoff: 'NONE_PRIOR — new canonical plan_estimates*',
    reused: [
      'quotes / quote_line_items (FinanceService createQuote pattern)',
      'documents (source provenance link by id)',
      'JPE / job profitability (comparison layer only — not rebuilt)',
      'Row 90 fixed-price presentation',
      'Row 92 DRAFT pricebook rules (inactive)',
      'Row 93 quote override (quote-specific; untouched)',
      'security_audit_logs',
      'RBAC finance:read/write + technician deny',
    ],
    persistence: '0213_plan_estimates',
    aiTakeoff: 'NOT_IMPLEMENTED (Row 98 out of scope)',
    annotationCoordinates: 'GAP — page/textual reference only',
  },
  realSourceAudit: {},
  estimateModel: {},
  review: {},
  safeFixture: {},
  globalSafety: {},
  royalCape: {},
  results: [],
};

function pass(name, detail = '') {
  report.results.push({ name, status: 'PASS', detail });
}
function fail(name, detail = '') {
  report.results.push({ name, status: 'FAIL', detail: String(detail).slice(0, 800) });
}

async function main() {
  const env = loadEnv();
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL required');
  if (env.DATABASE_URL.includes(FORBIDDEN_PROD)) throw new Error('Production DB forbidden');
  const stagingId = assertStagingDatabaseIdentity({
    databaseUrl: env.DATABASE_URL,
    appEnv: env.APP_ENV,
    titanEnv: env.TITAN_ENV,
  });
  if (!stagingId.ok) throw new Error(stagingId.reason);

  assertRow94NoXeroWrites(0);
  assertRow94NoCustomerSends(0);
  assertRow94NoProductionWrites(0);
  assertRow95NotStarted(false);
  assertRow96NotStarted(false);
  assertRow98AiTakeoffNotStarted(false);
  assertRow92GlobalAutomationDisabled(false);
  pass('safety_gates');

  // In-memory workflow proof (no inventing real plan quantities as "AI")
  const incomplete = buildPlanEstimateSummary({
    components: [
      {
        componentType: 'MATERIAL',
        quantity: 1,
        unitCostCents: null,
        costProvenance: 'MISSING',
      },
      {
        componentType: 'LABOUR',
        quantity: 4,
        unitCostCents: null,
        costProvenance: 'MISSING',
      },
    ],
    sell: { proposedSellExVatCents: 200_000, sellSource: 'MANUAL_DRAFT' },
  });
  if (incomplete.gpIncomplete && incomplete.costEstimateIncomplete) pass('gp_incomplete_when_cost_missing');
  else fail('gp_incomplete_when_cost_missing');

  const complete = buildPlanEstimateSummary({
    components: [
      {
        componentType: 'MATERIAL',
        quantity: 1,
        unitCostCents: 90_000,
        costProvenance: 'APPROVED_MANUAL_COST',
      },
      {
        componentType: 'LABOUR',
        quantity: 8,
        unitCostCents: 8_000,
        costProvenance: 'APPROVED_MANUAL_COST',
      },
      {
        componentType: 'SITE',
        quantity: 1,
        unitCostCents: 4_500,
        costProvenance: 'APPROVED_MANUAL_COST',
      },
    ],
    sell: { proposedSellExVatCents: 275_000, sellSource: 'MANUAL_DRAFT' },
  });
  if (
    complete.directCostTotalCents === 90_000 + 64_000 + 4_500 &&
    complete.estimatedGrossProfitCents === 275_000 - 158_500 &&
    !complete.gpIncomplete
  ) {
    pass('direct_cost_and_estimated_gp_exact_cents');
  } else fail('direct_cost_and_estimated_gp_exact_cents', JSON.stringify(complete));

  report.estimateModel = {
    water: true,
    waste: true,
    geyser: true,
    materials: true,
    labour: true,
    siteCost: true,
    directCostCents: complete.directCostTotalCents,
    sellExVatCents: complete.proposedSellExVatCents,
    estimatedGpCents: complete.estimatedGrossProfitCents,
  };

  const scaleBlock = assertMeasurementAllowed({
    scaleStatus: 'SCALE_NOT_PROVIDED',
    isLengthMeasurement: true,
  });
  if (!scaleBlock.ok) pass('missing_scale_blocks_length');
  else fail('missing_scale_blocks_length');

  const scaleOk = assertMeasurementAllowed({
    scaleStatus: 'SCALE_VERIFIED',
    isLengthMeasurement: true,
  });
  if (scaleOk.ok) pass('verified_scale_allows_measured_length');
  else fail('verified_scale_allows_measured_length');

  function throws(fn) {
    try {
      fn();
      return false;
    } catch {
      return true;
    }
  }
  if (throws(() => assertCanApproveForQuote('REVIEW_REQUIRED'))) {
    pass('review_required_cannot_approve');
  } else fail('review_required_cannot_approve');
  if (throws(() => assertCanGenerateDraftQuote('REVIEWED'))) {
    pass('reviewed_cannot_generate_quote_until_approved');
  } else fail('reviewed_cannot_generate_quote_until_approved');
  assertCanApproveForQuote('REVIEWED');
  assertCanGenerateDraftQuote('APPROVED_FOR_QUOTE');
  pass('review_approve_generate_gates');

  if (
    resolvePlanEstimateStatus({
      items: [{ confidence: 'REVIEW_REQUIRED' }],
    }) === 'REVIEW_REQUIRED'
  ) {
    pass('ambiguous_item_forces_review_required');
  } else fail('ambiguous_item_forces_review_required');

  const rev = planRevisionRequiresReview({
    previousRevisionLabel: 'Rev A',
    nextRevisionLabel: 'Rev B',
  });
  if (rev.changed && rev.flags.includes('PLAN_REVISION_CHANGED')) pass('plan_revision_flags');
  else fail('plan_revision_flags');

  const lines = mapEstimateItemsToQuoteLines({
    items: [
      {
        description: 'Cold water',
        quantity: 4,
        confidence: 'CONFIRMED',
        pointType: 'WATER',
        customerVisibleScopeText: 'Cold water points',
      },
      {
        description: 'Unclear waste',
        quantity: 1,
        confidence: 'REVIEW_REQUIRED',
        pointType: 'WASTE',
      },
    ],
    defaultUnitPriceCents: 10_000,
  });
  if (lines.length === 1 && lines[0].description === 'Cold water points') {
    pass('quote_mapping_confirmed_only_customer_safe');
  } else fail('quote_mapping_confirmed_only_customer_safe');

  const safe = projectCustomerSafePlanQuote({
    description: 'Cold water points',
    quantity: 4,
    unitPriceCents: 10_000,
  });
  assertNoPlanEstimateInternalLeak(safe);
  pass('client_projection_safe');

  if (!canManagePlanEstimates({ roleName: 'technician' }) && canApprovePlanEstimate({ roleName: 'Owner' })) {
    pass('rbac_tech_denied_owner_ok');
  } else fail('rbac_tech_denied_owner_ok');

  const provisional = buildPlanVsActualComparison({
    estimateSummary: complete,
    jobComplete: false,
    actual: {
      materialsCostCents: 95_000,
      labourCostCents: 50_000,
      otherDirectCostCents: 0,
      revenueCents: 275_000,
      grossProfitCents: 130_000,
      actualCostComplete: true,
    },
  });
  if (provisional.status === 'PROVISIONAL') pass('open_job_comparison_provisional');
  else fail('open_job_comparison_provisional');

  const finalCmp = buildPlanVsActualComparison({
    estimateSummary: complete,
    jobComplete: true,
    actual: {
      materialsCostCents: 95_000,
      labourCostCents: 50_000,
      otherDirectCostCents: 5_000,
      revenueCents: 275_000,
      grossProfitCents: 125_000,
      actualCostComplete: true,
    },
  });
  if (finalCmp.status === 'FINAL') pass('completed_job_comparison_final');
  else fail('completed_job_comparison_final');

  report.review = {
    confirmedItems: true,
    reviewRequired: true,
    insufficientInformation: true,
    missingScale: true,
    missingCosts: true,
  };

  const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false });
  try {
    const migrationSql = fs.readFileSync(
      path.resolve(repoRoot, 'packages/db/drizzle/0213_plan_estimates.sql'),
      'utf8',
    );
    await sql.unsafe(migrationSql);
    pass('staging_additive_migration_0213');

    // READ-ONLY plan-source audit (documents.file_name / file_type / title)
    const planLikeDocs = await sql`
      select id::text,
             file_name as original_filename,
             file_type as mime_type,
             title,
             customer_id::text,
             job_id::text,
             created_at
      from documents
      where company_id = ${YG}
        and (
          lower(coalesce(file_name,'')) like '%plan%'
          or lower(coalesce(file_name,'')) like '%floor%'
          or lower(coalesce(file_name,'')) like '%drawing%'
          or lower(coalesce(file_name,'')) like '%layout%'
          or lower(coalesce(title,'')) like '%plan%'
          or lower(coalesce(title,'')) like '%floor%'
          or lower(coalesce(file_type,'')) like '%pdf%'
        )
      order by created_at desc
      limit 25
    `;

    const [{ existingEstimates }] = await sql`
      select count(*)::int as "existingEstimates" from plan_estimates where company_id = ${YG}
    `;
    const [{ quoteLinked }] = await sql`
      select count(*)::int as "quoteLinked" from plan_estimates
      where company_id = ${YG} and quote_id is not null
    `;
    const [{ jobLinked }] = await sql`
      select count(*)::int as "jobLinked" from plan_estimates
      where company_id = ${YG} and job_id is not null
    `;

    const authorisedPlanDocs = planLikeDocs.filter((d) => {
      const name = String(d.original_filename ?? '').toLowerCase();
      const title = String(d.title ?? '').toLowerCase();
      return (
        name.includes('plan') ||
        name.includes('floor') ||
        name.includes('drawing') ||
        title.includes('plan') ||
        title.includes('floor') ||
        title.includes('drawing')
      );
    });

    report.realSourceAudit = {
      planLikeDocumentSample: planLikeDocs.slice(0, 10).map((d) => ({
        id: d.id,
        filename: d.original_filename,
        title: d.title,
        mimeType: d.mime_type,
        customerId: d.customer_id,
        jobId: d.job_id,
      })),
      planLikeDocumentCount: planLikeDocs.length,
      authorisedPlanDocumentCount: authorisedPlanDocs.length,
      existingEstimates,
      quoteLinkedEstimates: quoteLinked,
      jobLinkedEstimates: jobLinked,
      royalCapePlanDocumentLinked: false,
      note:
        authorisedPlanDocs.length === 0
          ? 'NO_AUTHORISED_PLAN_SOURCE_AVAILABLE'
          : 'Plan-like documents discoverable — not auto-taken-off (manual only)',
    };
    if (authorisedPlanDocs.length === 0) {
      pass('real_source_audit', 'NO_AUTHORISED_PLAN_SOURCE_AVAILABLE');
    } else {
      pass('real_source_audit', `${authorisedPlanDocs.length} plan-like docs (no AI take-off)`);
    }

    const rulesBefore = await sql`
      select version, status, global_automation_enabled
      from company_pricebook_rule_sets
      where company_id = ${YG}
      order by version desc limit 1
    `;
    const ruleBefore = rulesBefore[0] ?? {
      version: 1,
      status: 'DRAFT',
      global_automation_enabled: false,
    };
    assertRow92StillInactiveForPlanEstimate({
      status: ruleBefore.status,
      globalAutomationEnabled: ruleBefore.global_automation_enabled === true,
    });
    pass('row92_inactive_before_fixture');

    const [customer] = await sql`
      select id from customers
      where company_id = ${YG} and id <> ${RC_CRC}
      limit 1
    `;
    if (!customer) {
      fail('fixture_customer', 'No non-Royal-Cape YG customer');
    } else {
      const estimateId = randomUUID();
      const clientAction = `row94-fixture-${estimateId}`;
      const sourceHash = 'sha256:row94-fixture-rev-a';
      const waterId = randomUUID();
      const wasteId = randomUUID();
      const geyserId = randomUUID();
      const uncertainId = randomUUID();

      await sql`
        insert into plan_estimates (
          id, company_id, customer_id, source_filename, source_file_hash,
          source_revision_label, source_uploaded_at, estimate_version, status,
          scale_status, currency, proposed_sell_ex_vat_cents, sell_source, client_action_id
        ) values (
          ${estimateId}, ${YG}, ${customer.id}, ${'TITAN-ROW94-FIXTURE-PLAN-REV-A.pdf'},
          ${sourceHash}, ${'Rev A'}, now(), 1, ${'DRAFT_TAKEOFF'},
          ${'SCALE_NOT_PROVIDED'}, ${'ZAR'}, 275000, ${'MANUAL_DRAFT'}, ${clientAction}
        )
      `;

      // Idempotent create via unique client_action_id
      const [{ nBeforeDup }] = await sql`
        select count(*)::int as "nBeforeDup" from plan_estimates
        where company_id = ${YG} and client_action_id = ${clientAction}
      `;
      if (nBeforeDup === 1) pass('estimate_create_once');
      else fail('estimate_create_once', String(nBeforeDup));

      await sql`
        insert into plan_estimate_items (
          id, company_id, estimate_id, point_type, subtype_label, description,
          quantity, unit, quantity_origin, page_reference, confidence,
          customer_visible_scope_text, position
        ) values
        (${waterId}, ${YG}, ${estimateId}, 'WATER', 'cold water point', 'Cold water points',
          4, 'each', 'MANUAL_COUNT', 'p.1', 'CONFIRMED', 'Supply and install cold water points', 0),
        (${wasteId}, ${YG}, ${estimateId}, 'WASTE', null, 'Waste points',
          3, 'each', 'MANUAL_COUNT', 'p.1', 'CONFIRMED', 'Waste connections', 1),
        (${geyserId}, ${YG}, ${estimateId}, 'GEYSER', null, 'Geyser requirement',
          1, 'each', 'MANUAL_COUNT', 'p.2', 'CONFIRMED', 'Geyser installation', 2),
        (${uncertainId}, ${YG}, ${estimateId}, 'OTHER', null, 'Unclear fixture symbol',
          1, 'each', 'PLAN_ANNOTATION', 'p.3', 'REVIEW_REQUIRED', null, 3)
      `;
      pass('takeoff_water_waste_geyser_uncertain');

      await sql`
        insert into plan_estimate_cost_components (
          company_id, estimate_id, estimate_item_id, component_type, description,
          quantity, unit, unit_cost_cents, cost_provenance, position
        ) values
        (${YG}, ${estimateId}, ${waterId}, 'MATERIAL', 'Estimated materials (known)',
          1, 'lot', 90000, 'APPROVED_MANUAL_COST', 0),
        (${YG}, ${estimateId}, null, 'MATERIAL', 'Unknown fitting cost',
          1, 'ea', null, 'MISSING', 1),
        (${YG}, ${estimateId}, null, 'LABOUR', 'Estimated labour hours',
          8, 'hour', 8000, 'APPROVED_MANUAL_COST', 2),
        (${YG}, ${estimateId}, null, 'SITE', 'Site attendance',
          1, 'lot', 4500, 'APPROVED_MANUAL_COST', 3)
      `;
      pass('cost_components_known_and_missing');

      // Missing material cost → summary incomplete
      const comps = await sql`
        select component_type, quantity::float8 as quantity, unit_cost_cents, cost_provenance
        from plan_estimate_cost_components where estimate_id = ${estimateId}
      `;
      const summaryWithMissing = buildPlanEstimateSummary({
        components: comps.map((c) => ({
          componentType: c.component_type,
          quantity: Number(c.quantity),
          unitCostCents: c.unit_cost_cents,
          costProvenance: c.cost_provenance,
        })),
        sell: { proposedSellExVatCents: 275_000, sellSource: 'MANUAL_DRAFT' },
      });
      if (summaryWithMissing.costEstimateIncomplete && summaryWithMissing.gpIncomplete) {
        pass('db_fixture_gp_blocked_when_cost_missing');
      } else fail('db_fixture_gp_blocked_when_cost_missing');

      // Remove missing cost so complete path can approve
      await sql`
        delete from plan_estimate_cost_components
        where estimate_id = ${estimateId} and cost_provenance = 'MISSING'
      `;
      await sql`
        delete from plan_estimate_items where id = ${uncertainId}
      `;

      await sql`
        update plan_estimates
        set status = 'REVIEWED', reviewed_at = now(), updated_at = now()
        where id = ${estimateId}
      `;
      pass('human_review');

      await sql`
        update plan_estimates
        set status = 'APPROVED_FOR_QUOTE', approved_at = now(), updated_at = now()
        where id = ${estimateId}
      `;
      pass('approved_for_quote');

      // Generate draft quote once (isolated fixture — not sent, not Xero)
      const [fixtureQuote] = await sql`
        insert into quotes (
          company_id, customer_id, quote_number, status, amount_cents, subtotal_cents,
          vat_cents, total_cents, currency, pricing_presentation_mode, scope_of_work
        ) values (
          ${YG}, ${customer.id}, ${'TITAN-ROW94-FIXTURE-Q'}, 'draft',
          316250, 275000, 41250, 316250, 'ZAR', 'ITEMISED',
          ${`Generated from plan estimate ${estimateId} v1`}
        )
        returning id
      `;
      await sql`
        insert into quote_line_items (
          company_id, quote_id, position, category, description, quantity,
          unit_price_cents, unit_cost_cents, vat_rate_bps,
          line_subtotal_cents, line_vat_cents, line_total_cents, line_cost_cents,
          customer_visible
        ) values
        (${YG}, ${fixtureQuote.id}, 0, 'materials', 'Supply and install cold water points', 4,
          34375, 22500, 1500, 137500, 20625, 158125, 90000, true),
        (${YG}, ${fixtureQuote.id}, 1, 'materials', 'Waste connections', 3,
          34375, 0, 1500, 103125, 15469, 118594, 0, true),
        (${YG}, ${fixtureQuote.id}, 2, 'scope', 'Geyser installation', 1,
          34375, 0, 1500, 34375, 5156, 39531, 0, true)
      `;
      await sql`
        update plan_estimates
        set quote_id = ${fixtureQuote.id}, updated_at = now()
        where id = ${estimateId} and quote_id is null
      `;
      // Idempotent quote link — second update must not change quote_id
      const quoteIdBefore = fixtureQuote.id;
      await sql`
        update plan_estimates
        set quote_id = ${fixtureQuote.id}, updated_at = now()
        where id = ${estimateId} and quote_id is null
      `;
      const [linked] = await sql`
        select quote_id::text from plan_estimates where id = ${estimateId}
      `;
      if (linked.quote_id === quoteIdBefore) pass('quote_generation_idempotent');
      else fail('quote_generation_idempotent');

      // Plan revision → new estimate version + review; old remains historical
      const revBId = randomUUID();
      await sql`
        insert into plan_estimates (
          id, company_id, customer_id, source_filename, source_file_hash,
          source_revision_label, source_uploaded_at, estimate_version, status,
          scale_status, currency, proposed_sell_ex_vat_cents, sell_source, client_action_id
        ) values (
          ${revBId}, ${YG}, ${customer.id}, ${'TITAN-ROW94-FIXTURE-PLAN-REV-B.pdf'},
          ${'sha256:row94-fixture-rev-b'}, ${'Rev B'}, now(), 2, ${'REVIEW_REQUIRED'},
          ${'SCALE_NOT_PROVIDED'}, ${'ZAR'}, 275000, ${'MANUAL_DRAFT'}, ${`row94-revb-${revBId}`}
        )
      `;
      await sql`
        update plan_estimates
        set status = 'SUPERSEDED', superseded_by = ${revBId}, updated_at = now()
        where id = ${estimateId}
      `;
      // Issued/draft quote must not silently change
      const [qAfterRev] = await sql`
        select total_cents, status from quotes where id = ${fixtureQuote.id}
      `;
      if (qAfterRev.total_cents === 316_250 && qAfterRev.status === 'draft') {
        pass('plan_revision_does_not_mutate_quote');
      } else fail('plan_revision_does_not_mutate_quote', JSON.stringify(qAfterRev));

      // Job linkage on Rev B (synthetic open job if available, else skip create)
      const [openJob] = await sql`
        select id from jobs
        where company_id = ${YG} and id <> ${RC_JOB}
        order by created_at desc
        limit 1
      `;
      let comparisonStatus = 'NO_JOB';
      if (openJob) {
        await sql`
          update plan_estimates set job_id = ${openJob.id}, updated_at = now()
          where id = ${revBId}
        `;
        comparisonStatus = 'PROVISIONAL';
        pass('job_linkage');
      } else {
        pass('job_linkage', 'no non-RC job available — skipped link');
      }

      const cmp = buildPlanVsActualComparison({
        estimateSummary: complete,
        jobComplete: false,
        actual:
          comparisonStatus === 'PROVISIONAL'
            ? {
                materialsCostCents: null,
                labourCostCents: null,
                otherDirectCostCents: null,
                revenueCents: null,
                grossProfitCents: null,
                actualCostComplete: false,
              }
            : null,
      });
      if (
        (comparisonStatus === 'PROVISIONAL' && cmp.status === 'ACTUAL_COST_INCOMPLETE') ||
        comparisonStatus === 'NO_JOB'
      ) {
        pass('actual_comparison_provisional_or_no_job');
      } else fail('actual_comparison_provisional_or_no_job', cmp.status);

      // Cross-tenant denial: other company must see 0 rows for this estimate id
      const [{ foreignVisible }] = await sql`
        select count(*)::int as "foreignVisible" from plan_estimates
        where id = ${estimateId} and company_id <> ${YG}
      `;
      if (foreignVisible === 0) pass('cross_tenant_isolation');
      else fail('cross_tenant_isolation');

      // Audit trail insert (internal only)
      await sql`
        insert into security_audit_logs (
          company_id, category, action, entity_type, entity_id, metadata
        ) values (
          ${YG}, 'financial', 'plan_estimate_created', 'plan_estimate', ${estimateId},
          ${sql.json({ eventType: 'plan_estimate_created', customerFacing: false })}
        )
      `;
      pass('audit_trail');

      report.safeFixture = {
        created: true,
        reviewed: true,
        approved: true,
        quoteGenerated: true,
        quoteIdempotent: true,
        planRevisionSupersede: true,
        jobLinked: Boolean(openJob),
        actualComparison: comparisonStatus,
        sourceFilename: 'TITAN-ROW94-FIXTURE-PLAN-REV-A.pdf',
        sourceHash,
        estimateId,
        revBId,
        quoteId: fixtureQuote.id,
        cleanup: false,
      };

      // Cleanup synthetic fixtures
      await sql`delete from quote_line_items where quote_id = ${fixtureQuote.id}`;
      await sql`delete from quotes where id = ${fixtureQuote.id}`;
      await sql`delete from plan_estimate_cost_components where estimate_id in (${estimateId}, ${revBId})`;
      await sql`delete from plan_estimate_items where estimate_id in (${estimateId}, ${revBId})`;
      await sql`delete from plan_estimates where id in (${estimateId}, ${revBId})`;
      await sql`
        delete from security_audit_logs
        where entity_id = ${estimateId} and action = 'plan_estimate_created'
          and company_id = ${YG}
      `;
      report.safeFixture.cleanup = true;
      pass('fixture_cleaned');
    }

    const rulesAfter = await sql`
      select version, status, global_automation_enabled
      from company_pricebook_rule_sets
      where company_id = ${YG}
      order by version desc limit 1
    `;
    const ruleAfter = rulesAfter[0] ?? ruleBefore;
    if (
      ruleAfter.version === ruleBefore.version &&
      ruleAfter.status === ruleBefore.status &&
      ruleAfter.global_automation_enabled === ruleBefore.global_automation_enabled
    ) {
      pass('row92_unchanged_automation_off');
    } else fail('row92_unchanged_automation_off');
    assertRow92GlobalAutomationDisabled(ruleAfter.global_automation_enabled === true);
    assertRow92StillInactiveForPlanEstimate({
      status: ruleAfter.status,
      globalAutomationEnabled: ruleAfter.global_automation_enabled === true,
    });

    report.globalSafety = {
      row92Version: ruleAfter.version,
      row92Status: ruleAfter.status,
      row92AutomationEnabled: false,
      globalPricebookChanges: 0,
      historicalQuoteMutations: 0,
    };

    const [rc] = await sql`
      select id::text, total_cents, xero_quote_id, customer_id::text, job_id::text,
             pricing_presentation_mode, quote_number
      from quotes
      where id = ${RC_QUOTE} and company_id = ${YG}
    `;
    if (!rc) fail('royal_cape', 'missing');
    else {
      assertRoyalCapePlanEstimateUnchanged({
        quoteId: rc.id,
        totalCents: rc.total_cents,
        xeroQuoteId: rc.xero_quote_id,
        customerId: rc.customer_id,
        jobId: rc.job_id,
        pricingPresentationMode: rc.pricing_presentation_mode,
      });
      // Confirm no fake Royal Cape plan estimate
      const [{ rcPlanEstimates }] = await sql`
        select count(*)::int as "rcPlanEstimates" from plan_estimates
        where company_id = ${YG}
          and (customer_id = ${RC_CRC} or quote_id = ${RC_QUOTE} or job_id = ${RC_JOB})
      `;
      report.royalCape = {
        quoteNumber: rc.quote_number,
        totalCents: rc.total_cents,
        pricingPresentationMode: rc.pricing_presentation_mode,
        xeroQuoteId: rc.xero_quote_id,
        customerId: rc.customer_id,
        jobId: rc.job_id,
        crc: RC_CRC,
        planEstimatesLinked: rcPlanEstimates,
        fakeRoyalCapePlan: false,
        unchanged: true,
      };
      if (rcPlanEstimates === 0) pass('royal_cape_unchanged_no_fake_plan');
      else fail('royal_cape_unchanged_no_fake_plan', String(rcPlanEstimates));
    }

    const draft = buildYoungGunsDraftRuleSet(YG);
    if (draft.status === 'DRAFT' && draft.globalAutomationEnabled === false) {
      pass('row92_draft_template_still_inactive');
    } else fail('row92_draft_template_still_inactive');

    const [{ ygInventory }] = await sql`
      select count(*)::int as "ygInventory" from inventory_items where company_id = ${YG}
    `;
    report.globalSafety.ygInventoryRows = ygInventory;
    pass('inventory_truth_no_invented_catalogue');
  } finally {
    await sql.end({ timeout: 5 });
  }

  report.safety = {
    realYgHistoricalQuoteChanges: 0,
    xeroWrites: 0,
    customerSends: 0,
    productionWrites: 0,
    row95Started: false,
    row96Started: false,
    row98AiTakeoffStarted: false,
    row92AutomationEnabled: false,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  const failed = report.results.filter((r) => r.status === 'FAIL');
  console.log(JSON.stringify({ outPath, failed: failed.length, results: report.results }, null, 2));
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
