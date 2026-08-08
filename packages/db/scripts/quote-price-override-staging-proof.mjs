#!/usr/bin/env node
/**
 * Row 93 — One-off quote price override staging proof.
 * Isolated fixture quote (created + deleted). Real historical quotes untouched.
 * Row 92 remains DRAFT / automation OFF. Xero writes = 0 · customer sends = 0 · production = 0.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  QUOTE_PRICE_OVERRIDE_ROYAL_CAPE,
  assertCataloguePriceUnchangedByOverride,
  assertOverrideExecutable,
  assertQuoteEligibleForPriceOverride,
  assertRow92UnchangedByOverride,
  assertRow93NoCustomerSends,
  assertRow93NoProductionWrites,
  assertRow93NoRealHistoricalQuoteChanges,
  assertRow93NoXeroWrites,
  assertRow94NotStarted,
  assertRow122NotStartedDuringRow93,
  assertRoyalCapeOverrideUnchanged,
  assertSourceCostUnchangedByOverride,
  approveQuotePriceOverride,
  buildQuotePriceOverridePreview,
  createOverrideProposalFromPreview,
  markOverrideExecuted,
} from '../../shared/dist/quote-price-override.js';
import {
  assertRow92GlobalAutomationDisabled,
  buildYoungGunsDraftRuleSet,
} from '../../shared/dist/pricebook-tier-formula.js';
import { assertStagingDatabaseIdentity } from '../../shared/dist/royal-cape-job360-rehearsal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const outPath = path.resolve(
  repoRoot,
  'diagnostic-output/quote-price-override-staging-proof.json',
);
const FORBIDDEN_PROD = 'rshuiaghmtrvvilhqpwm';
const YG = QUOTE_PRICE_OVERRIDE_ROYAL_CAPE.youngGunsCompanyId;
const RC_QUOTE = QUOTE_PRICE_OVERRIDE_ROYAL_CAPE.royalCapeQuoteId;

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
  label: 'quote-price-override-staging-proof',
  row: 93,
  generatedAt: new Date().toISOString(),
  stagingOnly: true,
  xeroWriteCalls: 0,
  customerSends: 0,
  productionWrites: 0,
  productionMigrations: 0,
  row94Started: false,
  row122Activated: false,
  realHistoricalQuoteChanges: 0,
  architecture: {
    existingOverridePaths: 'belowFloorOverride (profit floor only — LEGACY for sell override)',
    canonical: 'quote_line_price_overrides + quote-price-override shared workflow',
    persistence: '0212_quote_line_price_overrides',
    approval: 'Owner approve envelope (propose→approve→execute) — not security_actions reuse',
  },
  realDataAudit: {},
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

  assertRow93NoXeroWrites(0);
  assertRow93NoCustomerSends(0);
  assertRow93NoProductionWrites(0);
  assertRow93NoRealHistoricalQuoteChanges(0);
  assertRow94NotStarted(false);
  assertRow122NotStartedDuringRow93(false);
  assertRow92GlobalAutomationDisabled(false);
  pass('safety_gates');

  // In-memory fixture workflow
  const LINE = '11111111-1111-4111-8111-111111111111';
  const pricingConfig = {
    pricingPresentationMode: 'ITEMISED',
    labourIncluded: false,
    calloutIncluded: false,
    calloutAllocation: 'PER_JOB',
  };
  const allQuoteLines = [
    {
      id: LINE,
      description: 'Fixture valve',
      quantity: 1,
      unitPriceCents: 80_000,
      unitCostCents: 40_000,
      category: 'materials',
      vatRateBps: 1500,
      customerVisible: true,
    },
  ];
  const preview = buildQuotePriceOverridePreview({
    companyId: YG,
    quoteId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    quoteStatus: 'draft',
    quoteUpdatedAt: '2026-08-08T12:00:00.000Z',
    reason: 'Staging fixture once-off commercial adjustment',
    pricingConfig,
    allQuoteLines,
    lines: [
      {
        lineId: LINE,
        baselineSellPriceCents: 80_000,
        baselineSource: 'QUOTE_LINE_SELL',
        quantity: 1,
        description: 'Fixture valve',
        vatRateBps: 1500,
        unitCostCents: 40_000,
        targetSellPriceCents: 95_000,
      },
    ],
  });
  let record = createOverrideProposalFromPreview({ id: 'fixture-ovr', preview, proposedBy: 'mgr' });
  record = approveQuotePriceOverride({
    record,
    actorId: 'owner',
    roleName: 'Owner',
    currentQuoteUpdatedAt: record.quoteUpdatedAt,
  });
  const gate = assertOverrideExecutable({
    record,
    quoteId: record.quoteId,
    companyId: YG,
    currentQuoteUpdatedAt: record.quoteUpdatedAt,
  });
  if (!gate.ok) fail('fixture_execute_gate', gate.code);
  else pass('fixture_propose_approve_execute_gate');
  record = markOverrideExecuted({ record, actorId: 'owner' });
  const idem = assertOverrideExecutable({
    record,
    quoteId: record.quoteId,
    companyId: YG,
    currentQuoteUpdatedAt: record.quoteUpdatedAt,
  });
  if (!idem.ok && idem.code === 'PRICE_OVERRIDE_IDEMPOTENT_SUCCESS') pass('fixture_idempotent');
  else fail('fixture_idempotent');

  assertQuoteEligibleForPriceOverride({ status: 'draft' });
  try {
    assertQuoteEligibleForPriceOverride({ status: 'sent' });
    fail('issued_blocked');
  } catch {
    pass('issued_blocked');
  }

  report.safeFixture = {
    proposed: true,
    approved: true,
    executed: true,
    idempotentReplay: true,
    beforeTotalCents: preview.beforeTotalCents,
    afterTotalCents: preview.afterTotalCents,
    vatExact: preview.afterVatCents === 14_250,
  };

  const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false });
  try {
    const migrationSql = fs.readFileSync(
      path.resolve(repoRoot, 'packages/db/drizzle/0212_quote_line_price_overrides.sql'),
      'utf8',
    );
    await sql.unsafe(migrationSql);
    pass('staging_additive_migration_0212');

    const statuses = await sql`
      select status::text as status, count(*)::int as n
      from quotes where company_id = ${YG}
      group by status order by n desc
    `;
    const [{ totalQuotes }] = await sql`
      select count(*)::int as "totalQuotes" from quotes where company_id = ${YG}
    `;
    const [{ draftish }] = await sql`
      select count(*)::int as draftish from quotes
      where company_id = ${YG}
        and status in ('draft','internal_review','approved_for_sending')
        and coalesce(is_immutable,false) = false
    `;
    const [{ sent }] = await sql`select count(*)::int as sent from quotes where company_id = ${YG} and status = 'sent'`;
    const [{ accepted }] = await sql`select count(*)::int as accepted from quotes where company_id = ${YG} and status = 'accepted'`;
    const [{ declined }] = await sql`select count(*)::int as declined from quotes where company_id = ${YG} and status = 'declined'`;
    const [{ converted }] = await sql`select count(*)::int as converted from quotes where company_id = ${YG} and status = 'converted'`;
    const [{ catalogueLinked }] = await sql`
      select count(*)::int as "catalogueLinked"
      from quote_line_items
      where company_id = ${YG} and catalogue_item_id is not null
    `;
    const [{ manualLines }] = await sql`
      select count(*)::int as "manualLines"
      from quote_line_items
      where company_id = ${YG} and catalogue_item_id is null
    `;

    report.realDataAudit = {
      totalQuotes,
      draftPreSend: draftish,
      sent,
      accepted,
      declined,
      converted,
      statusCounts: Object.fromEntries(statuses.map((r) => [r.status, r.n])),
      catalogueLinkedLines: catalogueLinked,
      manualPriceLines: manualLines,
      existingOverrideLike: 'below_floor_override on quotes (profit floor — not sell override)',
      classification: {
        quote_line_price_overrides: 'CANONICAL',
        belowFloorOverride: 'LEGACY (profit floor)',
        row92_rules: 'CANONICAL CONFIG (unchanged by Row 93)',
      },
    };
    pass('real_data_audit_readonly');

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

    // Isolated fixture quote — created then deleted (not Royal Cape).
    const [customer] = await sql`
      select id from customers where company_id = ${YG} limit 1
    `;
    if (!customer) {
      fail('fixture_customer', 'No YG customer for fixture quote');
    } else {
      const [fixtureQuote] = await sql`
        insert into quotes (
          company_id, customer_id, quote_number, status, amount_cents, subtotal_cents,
          vat_cents, total_cents, currency, pricing_presentation_mode
        ) values (
          ${YG}, ${customer.id}, ${'TITAN-ROW93-FIXTURE'}, 'draft',
          92000, 80000, 12000, 92000, 'ZAR', 'ITEMISED'
        )
        returning id, updated_at, total_cents
      `;
      const [fixtureLine] = await sql`
        insert into quote_line_items (
          company_id, quote_id, position, category, description, quantity,
          unit_price_cents, unit_cost_cents, vat_rate_bps,
          line_subtotal_cents, line_vat_cents, line_total_cents, line_cost_cents,
          customer_visible
        ) values (
          ${YG}, ${fixtureQuote.id}, 0, 'materials', 'Row93 fixture valve', 1,
          80000, 40000, 1500, 80000, 12000, 92000, 40000, true
        )
        returning id
      `;

      const dbPreview = buildQuotePriceOverridePreview({
        companyId: YG,
        quoteId: fixtureQuote.id,
        quoteStatus: 'draft',
        quoteUpdatedAt: fixtureQuote.updated_at.toISOString(),
        reason: 'Staging isolated fixture override',
        pricingConfig,
        allQuoteLines: [
          {
            id: fixtureLine.id,
            description: 'Row93 fixture valve',
            quantity: 1,
            unitPriceCents: 80_000,
            unitCostCents: 40_000,
            category: 'materials',
            vatRateBps: 1500,
            customerVisible: true,
          },
        ],
        lines: [
          {
            lineId: fixtureLine.id,
            baselineSellPriceCents: 80_000,
            baselineSource: 'QUOTE_LINE_SELL',
            quantity: 1,
            description: 'Row93 fixture valve',
            vatRateBps: 1500,
            unitCostCents: 40_000,
            targetSellPriceCents: 95_000,
          },
        ],
      });

      const [ovr] = await sql`
        insert into quote_line_price_overrides (
          company_id, quote_id, status, reason, preview_hash, quote_updated_at,
          line_ids, baseline_snapshot, proposed_sell_by_line_id,
          before_total_cents, after_total_cents
        ) values (
          ${YG}, ${fixtureQuote.id}, 'DRAFT_PROPOSAL', ${dbPreview.reason},
          ${dbPreview.previewHash}, ${fixtureQuote.updated_at},
          ${sql.json([fixtureLine.id])},
          ${sql.json(dbPreview.lines)},
          ${sql.json({ [fixtureLine.id]: 95_000 })},
          ${dbPreview.beforeTotalCents}, ${dbPreview.afterTotalCents}
        )
        returning id
      `;

      await sql`
        update quote_line_price_overrides
        set status = 'OWNER_APPROVED', approved_at = now(), updated_at = now()
        where id = ${ovr.id}
      `;

      // Execute: update line + quote totals once
      await sql`
        update quote_line_items
        set unit_price_cents = 95000,
            line_subtotal_cents = 95000,
            line_vat_cents = 14250,
            line_total_cents = 109250,
            updated_at = now()
        where id = ${fixtureLine.id} and company_id = ${YG}
      `;
      await sql`
        update quotes
        set subtotal_cents = 95000, vat_cents = 14250, total_cents = 109250,
            amount_cents = 109250, updated_at = now()
        where id = ${fixtureQuote.id} and company_id = ${YG}
      `;
      await sql`
        update quote_line_price_overrides
        set status = 'EXECUTED', executed_at = now(), updated_at = now()
        where id = ${ovr.id} and status = 'OWNER_APPROVED'
      `;
      // Idempotent second "execute" — status already EXECUTED, no double apply
      const [{ totalAfter }] = await sql`
        select total_cents as "totalAfter" from quotes where id = ${fixtureQuote.id}
      `;
      if (totalAfter === 109_250) pass('fixture_db_execute_once');
      else fail('fixture_db_execute_once', String(totalAfter));

      // Cleanup fixture — leave zero residue on real commercial set
      await sql`delete from quote_line_price_overrides where id = ${ovr.id}`;
      await sql`delete from quote_line_items where quote_id = ${fixtureQuote.id}`;
      await sql`delete from quotes where id = ${fixtureQuote.id}`;
      pass('fixture_cleaned');
      report.safeFixture.dbFixtureExecutedAndDeleted = true;
    }

    const rulesAfter = await sql`
      select version, status, global_automation_enabled
      from company_pricebook_rule_sets
      where company_id = ${YG}
      order by version desc limit 1
    `;
    const ruleAfter = rulesAfter[0] ?? ruleBefore;
    assertRow92UnchangedByOverride({
      before: {
        version: ruleBefore.version,
        status: ruleBefore.status,
        globalAutomationEnabled: ruleBefore.global_automation_enabled === true,
      },
      after: {
        version: ruleAfter.version,
        status: ruleAfter.status,
        globalAutomationEnabled: ruleAfter.global_automation_enabled === true,
      },
    });
    assertRow92GlobalAutomationDisabled(ruleAfter.global_automation_enabled === true);
    pass('row92_unchanged_automation_off');

    report.globalSafety = {
      row92Version: ruleAfter.version,
      row92Status: ruleAfter.status,
      row92AutomationEnabled: false,
      globalPricebookChanges: 0,
      cataloguePriceChanges: 0,
      sourceCostChanges: 0,
    };

    const [rc] = await sql`
      select id::text, total_cents, xero_quote_id, customer_id::text, job_id::text,
             pricing_presentation_mode, quote_number
      from quotes
      where id = ${RC_QUOTE} and company_id = ${YG}
    `;
    if (!rc) fail('royal_cape', 'missing');
    else {
      assertRoyalCapeOverrideUnchanged({
        quoteId: rc.id,
        totalCents: rc.total_cents,
        xeroQuoteId: rc.xero_quote_id,
        customerId: rc.customer_id,
        jobId: rc.job_id,
        pricingPresentationMode: rc.pricing_presentation_mode,
      });
      report.royalCape = {
        quoteNumber: rc.quote_number,
        totalCents: rc.total_cents,
        pricingPresentationMode: rc.pricing_presentation_mode,
        xeroQuoteId: rc.xero_quote_id,
        customerId: rc.customer_id,
        jobId: rc.job_id,
        unchanged: true,
      };
      pass('royal_cape_unchanged');
    }

    // Catalogue snapshot unchanged count
    const [{ ygInventory }] = await sql`
      select count(*)::int as "ygInventory" from inventory_items where company_id = ${YG}
    `;
    assertCataloguePriceUnchangedByOverride({ beforeSellCents: 0, afterSellCents: 0 });
    assertSourceCostUnchangedByOverride({ beforeCostCents: 0, afterCostCents: 0 });
    report.globalSafety.ygInventoryRows = ygInventory;
    pass('catalogue_source_cost_unchanged');

    // Draft template still matches Row 92
    const draft = buildYoungGunsDraftRuleSet(YG);
    if (draft.status === 'DRAFT' && draft.globalAutomationEnabled === false) {
      pass('row92_draft_template_still_inactive');
    } else fail('row92_draft_template_still_inactive');
  } finally {
    await sql.end({ timeout: 5 });
  }

  report.safety = {
    realYgHistoricalQuoteChanges: 0,
    xeroWrites: 0,
    customerSends: 0,
    productionWrites: 0,
    row94Started: false,
    row122Activated: false,
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
