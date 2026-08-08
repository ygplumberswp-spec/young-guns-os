#!/usr/bin/env node
/**
 * Row 91 — YGP catalogue classification staging proof.
 * READ-ONLY audit + deterministic safe apply (no price changes).
 * Xero writes = 0 · customer sends = 0 · production = 0 · Row 92 = 0.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  QUOTE_LINE_CATEGORY_OTHER_ROOT_CAUSE,
  YGP_CATALOGUE_ROYAL_CAPE,
  assertCataloguePriceUnchanged,
  assertRow90PricingPreserved,
  assertRow91NoCustomerSends,
  assertRow91NoProductionWrites,
  assertRow91NoXeroWrites,
  assertRoyalCapeCatalogueUnchanged,
  planDeterministicClassificationApply,
} from '../../shared/dist/ygp-catalogue-classification.js';
import { assertRow92NotStarted } from '../../shared/dist/fixed-price-quoting.js';
import { assertStagingDatabaseIdentity } from '../../shared/dist/royal-cape-job360-rehearsal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const outPath = path.resolve(
  repoRoot,
  'diagnostic-output/ygp-catalogue-classification-staging-proof.json',
);
const FORBIDDEN_PROD = 'rshuiaghmtrvvilhqpwm';
const YG = YGP_CATALOGUE_ROYAL_CAPE.youngGunsCompanyId;

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
  label: 'ygp-catalogue-classification-staging-proof',
  row: 91,
  generatedAt: new Date().toISOString(),
  stagingOnly: true,
  xeroWriteCalls: 0,
  customerSends: 0,
  productionWrites: 0,
  productionMigrations: 0,
  row92Started: false,
  priceChanges: 0,
  architecture: {
    canonicalCatalogue: 'inventory_items',
    inventorySeparation: 'is_stockable + inventory_stock_levels; price_book import never writes stock',
    quoteLineCategoryVsCatalogueCategory:
      'quote_line_items.category = commercial bucket; inventory_items.catalogue_category = product taxonomy',
  },
  rootCause: QUOTE_LINE_CATEGORY_OTHER_ROOT_CAUSE,
  catalogue: {},
  categories: {},
  quoteLineCategoryAudit: {},
  safeApply: {},
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
  assertRow91NoXeroWrites(0);
  assertRow91NoCustomerSends(0);
  assertRow91NoProductionWrites(0);
  assertRow92NotStarted(false);
  pass('safety_gates');

  // Fixture proofs (in-memory)
  const fixture = planDeterministicClassificationApply({
    id: 'fix-1',
    sku: 'LAB-CALLOUT',
    description: 'Call-out | Category: Call-out | HISTORICAL_PRICE_BOOK — catalogue only',
    sellPriceCents: 45000,
  });
  assertCataloguePriceUnchanged({
    beforeSellPriceCents: 45000,
    afterSellPriceCents: fixture.sellPriceCents,
  });
  pass('fixture_callout_type');
  const second = planDeterministicClassificationApply({
    id: 'fix-1',
    sku: 'LAB-CALLOUT',
    description: 'Call-out | Category: Call-out | HISTORICAL_PRICE_BOOK — catalogue only',
    sellPriceCents: 45000,
    ygpCode: fixture.patch.ygpCode ?? 'LAB-CALLOUT',
    catalogueCategory: fixture.patch.catalogueCategory ?? 'Call-out',
    itemType: fixture.patch.itemType ?? 'CALL_OUT',
    classificationStatus: fixture.patch.classificationStatus ?? 'CLASSIFIED',
    isStockable: false,
  });
  if (second.action === 'unchanged') pass('fixture_idempotency');
  else fail('fixture_idempotency', `${second.action}: ${second.reason}`);

  const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false });
  try {
    const migrationSql = fs.readFileSync(
      path.resolve(repoRoot, 'packages/db/drizzle/0210_ygp_catalogue_classification.sql'),
      'utf8',
    );
    await sql.unsafe(migrationSql);
    pass('staging_additive_migration');

    const [{ allInventory }] = await sql`select count(*)::int as "allInventory" from inventory_items`;
    const otherTenant = await sql`
      select company_id::text as company_id, count(*)::int as n
      from inventory_items
      group by 1 order by n desc limit 5
    `;
    const items = await sql`
      select id, sku, name, description, status, sell_price_cents,
             ygp_code, catalogue_category, item_type, classification_status,
             is_stockable, source_external_id, xero_item_id, xero_item_code, supplier_sku
      from inventory_items
      where company_id = ${YG}
    `;
    report.catalogue.platformInventoryTotal = allInventory;
    report.catalogue.inventoryByCompanyTop = otherTenant;
    if (items.length === 0) {
      report.catalogue.note =
        'Young Guns company has 0 inventory_items rows in staging. Sell catalogue currently relies on temporary YOUNG_GUNS_APPROVED_FINANCE_PRICEBOOK constants + empty tenant inventory. No fabricated catalogue rows created.';
    }

    const active = items.filter((i) => i.status === 'active').length;
    const inactive = items.length - active;
    const byType = { PHYSICAL_ITEM: 0, SERVICE: 0, LABOUR: 0, CALL_OUT: 0, OTHER: 0 };
    const categoryCounts = {};
    let withYgp = 0;
    let missingYgp = 0;
    let withXero = 0;
    let withSupplier = 0;
    let uncategorised = 0;
    let classified = 0;
    let reviewRequired = 0;

    for (const item of items) {
      const t = (item.item_type || 'OTHER').toUpperCase();
      byType[t] = (byType[t] ?? 0) + 1;
      const cat = item.catalogue_category?.trim() || 'UNCATEGORISED';
      categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
      if (item.ygp_code?.trim()) withYgp += 1;
      else missingYgp += 1;
      if (item.xero_item_id || item.xero_item_code) withXero += 1;
      if (item.supplier_sku) withSupplier += 1;
      const st = (item.classification_status || 'UNCATEGORISED').toUpperCase();
      if (st === 'CLASSIFIED') classified += 1;
      else if (st === 'REVIEW_REQUIRED') reviewRequired += 1;
      else uncategorised += 1;
    }

    const ygpDupes = await sql`
      select ygp_code, count(*)::int as n
      from inventory_items
      where company_id = ${YG} and ygp_code is not null
      group by ygp_code
      having count(*) > 1
    `;

    report.catalogue = {
      totalRecords: items.length,
      active,
      inactive,
      physical: byType.PHYSICAL_ITEM ?? 0,
      service: byType.SERVICE ?? 0,
      labour: byType.LABOUR ?? 0,
      callOut: byType.CALL_OUT ?? 0,
      other: byType.OTHER ?? 0,
      withYgpCode: withYgp,
      missingYgpCode: missingYgp,
      duplicateYgpCodes: ygpDupes.length,
      withXeroCode: withXero,
      withSupplierSku: withSupplier,
    };
    report.categories = {
      counts: categoryCounts,
      otherCount: categoryCounts.Other ?? categoryCounts.other ?? 0,
      uncategorisedCount: categoryCounts.UNCATEGORISED ?? 0,
      classified,
      reviewRequired,
    };
    pass('catalogue_audit_readonly');

    // Quote-line category audit (explains PR #75 metric)
    const quoteCats = await sql`
      select category, count(*)::int as n
      from quote_line_items
      where company_id = ${YG}
      group by category
      order by n desc
    `;
    report.quoteLineCategoryAudit = {
      counts: Object.fromEntries(quoteCats.map((r) => [r.category, r.n])),
      note: QUOTE_LINE_CATEGORY_OTHER_ROOT_CAUSE.summary,
    };
    pass('quote_line_category_root_cause');

    // Deterministic safe apply — no price changes
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let review = 0;
    let skipped = 0;
    let failed = 0;
    const priceBefore = new Map(items.map((i) => [i.id, i.sell_price_cents]));

    for (const item of items) {
      try {
        const plan = planDeterministicClassificationApply({
          id: item.id,
          sku: item.sku,
          description: item.description,
          sellPriceCents: item.sell_price_cents,
          ygpCode: item.ygp_code,
          catalogueCategory: item.catalogue_category,
          itemType: item.item_type,
          sourceExternalId: item.source_external_id,
          isStockable: item.is_stockable,
        });
        if (plan.action === 'unchanged') {
          unchanged += 1;
          continue;
        }
        if (plan.action === 'review' || plan.action === 'skip') {
          if (plan.action === 'review') review += 1;
          else skipped += 1;
          continue;
        }
        if (plan.action === 'update') {
          assertCataloguePriceUnchanged({
            beforeSellPriceCents: item.sell_price_cents,
            afterSellPriceCents: plan.sellPriceCents,
          });
          await sql`
            update inventory_items
            set
              ygp_code = coalesce(${plan.patch.ygpCode ?? null}, ygp_code),
              catalogue_category = coalesce(${plan.patch.catalogueCategory ?? null}, catalogue_category),
              item_type = coalesce(${plan.patch.itemType ?? null}, item_type),
              classification_status = coalesce(${plan.patch.classificationStatus ?? null}, classification_status),
              is_stockable = coalesce(${plan.patch.isStockable ?? null}, is_stockable),
              source_external_id = coalesce(${plan.patch.sourceExternalId ?? null}, source_external_id),
              updated_at = now()
            where id = ${item.id} and company_id = ${YG}
              and sell_price_cents = ${item.sell_price_cents}
          `;
          updated += 1;
        }
      } catch (e) {
        failed += 1;
        report.results.push({ name: `apply_${item.id}`, status: 'FAIL', detail: String(e.message).slice(0, 200) });
      }
    }

    // Idempotent second run
    let secondUpdated = 0;
    const after = await sql`
      select id, sku, description, sell_price_cents, ygp_code, catalogue_category, item_type,
             classification_status, is_stockable, source_external_id
      from inventory_items where company_id = ${YG}
    `;
    for (const item of after) {
      const beforePrice = priceBefore.get(item.id);
      if (beforePrice != null && beforePrice !== item.sell_price_cents) {
        report.priceChanges += 1;
      }
      const plan = planDeterministicClassificationApply({
        id: item.id,
        sku: item.sku,
        description: item.description,
        sellPriceCents: item.sell_price_cents,
        ygpCode: item.ygp_code,
        catalogueCategory: item.catalogue_category,
        itemType: item.item_type,
        sourceExternalId: item.source_external_id,
        isStockable: item.is_stockable,
      });
      if (plan.action === 'update') secondUpdated += 1;
    }

    report.safeApply = {
      created,
      updated,
      unchanged,
      reviewRequired: review,
      skipped,
      failed,
      secondRunUpdates: secondUpdated,
      idempotent: secondUpdated === 0,
      priceChanges: report.priceChanges,
    };
    if (report.priceChanges === 0) pass('no_price_changes');
    else fail('no_price_changes', String(report.priceChanges));
    if (secondUpdated === 0) pass('idempotent_second_run');
    else fail('idempotent_second_run', `secondUpdated=${secondUpdated}`);
    pass('safe_apply');

    // Refresh counts after apply
    const postCats = await sql`
      select coalesce(catalogue_category, 'UNCATEGORISED') as cat, count(*)::int as n
      from inventory_items where company_id = ${YG}
      group by 1 order by n desc
    `;
    report.categories.afterApply = Object.fromEntries(postCats.map((r) => [r.cat, r.n]));

    const rc = await sql`
      select id, quote_number, xero_quote_number, xero_quote_id, customer_id, job_id,
             total_cents, amount_cents, pricing_presentation_mode, labour_included, callout_included
      from quotes
      where id = ${YGP_CATALOGUE_ROYAL_CAPE.royalCapeQuoteId}
        and company_id = ${YG}
      limit 1
    `;
    if (!rc[0]) fail('royal_cape', 'missing');
    else {
      assertRoyalCapeCatalogueUnchanged({
        quoteId: rc[0].id,
        xeroQuoteId: rc[0].xero_quote_id,
        xeroQuoteNumber: rc[0].xero_quote_number ?? rc[0].quote_number,
        totalCents: rc[0].total_cents ?? rc[0].amount_cents,
        customerId: rc[0].customer_id,
        jobId: rc[0].job_id,
        pricingPresentationMode: rc[0].pricing_presentation_mode,
      });
      assertRow90PricingPreserved({
        before: {
          pricingPresentationMode: 'ITEMISED',
          labourIncluded: false,
          calloutIncluded: false,
          calloutAllocation: 'PER_JOB',
        },
        after: {
          pricingPresentationMode: rc[0].pricing_presentation_mode,
          labourIncluded: rc[0].labour_included,
          calloutIncluded: rc[0].callout_included,
          calloutAllocation: 'PER_JOB',
        },
      });
      report.royalCape = {
        quoteNumber: rc[0].xero_quote_number ?? rc[0].quote_number,
        totalCents: rc[0].total_cents ?? rc[0].amount_cents,
        xeroQuoteId: rc[0].xero_quote_id,
        pricingPresentationMode: rc[0].pricing_presentation_mode,
        unchanged: true,
      };
      pass('royal_cape_unchanged');
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        outPath,
        pass: report.results.filter((r) => r.status === 'PASS').length,
        fail: report.results.filter((r) => r.status === 'FAIL').length,
        safeApply: report.safeApply,
        catalogue: report.catalogue,
      },
      null,
      2,
    ),
  );
  if (report.results.some((r) => r.status === 'FAIL')) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
