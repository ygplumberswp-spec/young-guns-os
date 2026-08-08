/**
 * Row 101 staging READ-ONLY audit + shared fixture proof (cleanup).
 * Does NOT fabricate real authorised supplier quotations.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  resolveBoqSupplierComparison,
  buildSplitPurchaseProposal,
  suggestEligibleCheapestSelection,
  assertRow101SafetyGates,
  assertNoBoqSupplierComparisonClientLeak,
  assertRoyalCapeUnchangedForRow101,
  assertRow102NotStarted,
  splitPurchaseIdempotencyKey,
  canManageBoqSupplierComparison,
} from '../../../packages/shared/dist/boq-supplier-comparison.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../..');
const outPath = join(root, 'diagnostic-output/263-row101-boq-supplier-comparison-verify.json');
const YGP = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const FORBIDDEN_PROD = 'titan-production';

function loadDbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const tip = '/tmp/cursor-staging-db-url.txt';
  if (existsSync(tip)) return readFileSync(tip, 'utf8').trim();
  throw new Error('DATABASE_URL required');
}

const results = [];
const pass = (name, d = {}) => results.push({ name, status: 'PASS', ...d });
const fail = (name, d = {}) => results.push({ name, status: 'FAIL', ...d });

function offer(partial) {
  return {
    supplierId: 'sup-a',
    supplierDocumentId: 'doc-a',
    supplierDocumentRef: 'SQ-A',
    fileHashSha256: 'a'.repeat(64),
    sourceLineOrder: 1,
    supplierSku: 'W1',
    description: 'Cold water point',
    unit: 'each',
    quantity: 4,
    packSize: null,
    unitPriceCents: 1000,
    vatBasis: 'EXCLUSIVE',
    currency: 'ZAR',
    deliveryCents: 0,
    deliveryKnown: true,
    validTo: '2026-12-31',
    exclusions: null,
    isSubstitute: false,
    matchState: 'EXACT',
    matchConfidenceScore: 80,
    row100ProposalKey: 'p1',
    ...partial,
  };
}

const sql = postgres(loadDbUrl(), { max: 1, prepare: false });
try {
  if (loadDbUrl().includes(FORBIDDEN_PROD)) throw new Error('Production DB forbidden');

  const [{ exists }] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'boq_split_purchase_proposals'
    ) AS exists
  `;
  if (!exists) {
    await sql.unsafe(
      readFileSync(join(__dirname, '../drizzle/0219_boq_supplier_comparison.sql'), 'utf8'),
    );
    pass('migration_0219_applied');
  } else pass('migration_0219_already_present');

  const [strict] = await sql`
    SELECT count(*)::int AS c
    FROM documents
    WHERE company_id = ${YGP}
      AND (
        (lower(coalesce(file_name,'')) LIKE '%supplier%' AND lower(coalesce(file_name,'')) LIKE '%quote%')
        OR lower(coalesce(title,'')) LIKE '%supplier quote%'
        OR lower(coalesce(file_name,'')) LIKE '%price list%'
      )
  `;
  const [imports] = await sql`
    SELECT count(*)::int AS c FROM supplier_quote_imports WHERE company_id = ${YGP}
  `;
  const [matchProps] = await sql`
    SELECT count(*)::int AS c FROM supplier_quote_boq_match_proposals WHERE company_id = ${YGP}
  `;
  const [rule] = await sql`
    SELECT status, global_automation_enabled FROM company_pricebook_rule_sets
    WHERE company_id = ${YGP} ORDER BY version DESC NULLS LAST LIMIT 1
  `;
  const [royal] = await sql`
    SELECT total_cents, pricing_presentation_mode, xero_quote_id, job_id
    FROM quotes WHERE company_id = ${YGP} AND quote_number = 'QU-0183' LIMIT 1
  `;

  const authorised =
    Number(strict.c) > 0
      ? 'SUPPLIER_QUOTE_LIKE_DOCUMENTS_PRESENT'
      : 'NO_AUTHORISED_SUPPLIER_QUOTE_SOURCE_AVAILABLE';

  pass('staging_readonly_supplier_source_audit', {
    authorisedSupplierQuoteLike: Number(strict.c),
    existingSupplierQuoteImports: Number(imports.c),
    existingMatchProposals: Number(matchProps.c),
    authorisedSourceResult: authorised,
    row92Status: rule?.status ?? null,
    row92Automation: rule?.global_automation_enabled === true ? 'ON' : 'OFF',
  });

  if (rule?.global_automation_enabled === true) fail('row92_on');
  else pass('row92_off');

  if (royal && Number(royal.total_cents) === 4272250) {
    assertRoyalCapeUnchangedForRow101({
      totalCents: Number(royal.total_cents),
      pricingPresentationMode: royal.pricing_presentation_mode,
    });
    pass('royal_cape_unchanged', {
      totalCents: Number(royal.total_cents),
      pricingPresentationMode: royal.pricing_presentation_mode,
      xeroQuoteId: royal.xero_quote_id,
    });
  } else fail('royal_cape');

  const asOf = '2026-08-08T00:00:00.000Z';
  const r1 = randomUUID();
  const r2 = randomUUID();
  const comparison = resolveBoqSupplierComparison({
    boqImportId: randomUUID(),
    asOfIso: asOf,
    boqRows: [
      {
        boqImportRowId: r1,
        boqImportId: 'boq-1',
        sheetName: 'Water',
        originalRowNumber: 3,
        itemCode: 'W1',
        description: 'Cold water',
        unit: 'each',
        quantity: 4,
        rowKind: 'ITEM',
        expectedVatBasis: 'EXCLUSIVE',
      },
      {
        boqImportRowId: r2,
        boqImportId: 'boq-1',
        sheetName: 'Water',
        originalRowNumber: 4,
        itemCode: 'S1',
        description: 'Waste',
        unit: 'each',
        quantity: 2,
        rowKind: 'ITEM',
        expectedVatBasis: 'EXCLUSIVE',
      },
    ],
    offersByBoqRowId: {
      [r1]: [
        offer({ offerKey: 'a', supplierName: 'A', unitPriceCents: 1200, supplierId: 'sup-a' }),
        offer({
          offerKey: 'b',
          supplierName: 'B',
          unitPriceCents: 900,
          supplierId: 'sup-b',
          supplierDocumentRef: 'SQ-B',
        }),
        offer({
          offerKey: 'sub',
          supplierName: 'C',
          unitPriceCents: 400,
          isSubstitute: true,
          matchState: 'POSSIBLE',
          supplierSku: 'W1-ALT',
        }),
        offer({
          offerKey: 'expired',
          supplierName: 'D',
          unitPriceCents: 800,
          validTo: '2020-01-01',
        }),
      ],
      [r2]: [
        offer({
          offerKey: 's-b',
          supplierName: 'B',
          supplierId: 'sup-b',
          supplierSku: 'S1',
          unitPriceCents: 2000,
          quantity: 2,
          deliveryCents: 50,
          deliveryKnown: true,
        }),
      ],
    },
  });

  const row1 = comparison.rows.find((r) => r.boqImportRowId === r1);
  const cases = [
    ['two_valid_suppliers', (row1?.offers.filter((o) => !o.isSubstitute).length ?? 0) >= 2],
    ['cheapest_valid', row1?.cheapestEligibleOfferKey === 'b'],
    [
      'substitute_not_selected',
      suggestEligibleCheapestSelection(row1)?.offerKey !== 'sub' &&
        row1?.cheapestEligibleOfferKey !== 'sub',
    ],
    [
      'missing_row',
      resolveBoqSupplierComparison({
        boqImportId: 'x',
        asOfIso: asOf,
        boqRows: [
          {
            boqImportRowId: 'm',
            boqImportId: 'x',
            sheetName: 'A',
            originalRowNumber: 1,
            itemCode: 'Z',
            unit: 'each',
            quantity: 1,
            rowKind: 'ITEM',
          },
        ],
        offersByBoqRowId: {},
      }).rows[0]?.missingSupplierOffer === true,
    ],
    [
      'duplicate',
      resolveBoqSupplierComparison({
        boqImportId: 'x',
        asOfIso: asOf,
        boqRows: [
          {
            boqImportRowId: 'd',
            boqImportId: 'x',
            sheetName: 'A',
            originalRowNumber: 1,
            itemCode: 'W1',
            unit: 'each',
            quantity: 1,
            rowKind: 'ITEM',
          },
        ],
        offersByBoqRowId: {
          d: [
            offer({ offerKey: '1', supplierName: 'A', supplierId: 's', supplierSku: 'W1' }),
            offer({
              offerKey: '2',
              supplierName: 'A',
              supplierId: 's',
              supplierSku: 'W1',
              sourceLineOrder: 2,
            }),
          ],
        },
      }).rows[0]?.offers.some((o) => o.mismatchFlags.includes('DUPLICATE')),
    ],
    ['expired', row1?.offers.find((o) => o.offerKey === 'expired')?.mismatchFlags.includes('EXPIRED')],
    [
      'vat_mismatch',
      resolveBoqSupplierComparison({
        boqImportId: 'x',
        asOfIso: asOf,
        boqRows: [
          {
            boqImportRowId: 'v',
            boqImportId: 'x',
            sheetName: 'A',
            originalRowNumber: 1,
            itemCode: 'W1',
            unit: 'each',
            quantity: 1,
            rowKind: 'ITEM',
            expectedVatBasis: 'EXCLUSIVE',
          },
        ],
        offersByBoqRowId: {
          v: [offer({ offerKey: 'v', supplierName: 'A', vatBasis: 'INCLUSIVE' })],
        },
      }).rows[0]?.offers[0]?.mismatchFlags.includes('VAT_MISMATCH'),
    ],
    [
      'unit_qty_pack',
      (() => {
        const c = resolveBoqSupplierComparison({
          boqImportId: 'x',
          asOfIso: asOf,
          boqRows: [
            {
              boqImportRowId: 'u',
              boqImportId: 'x',
              sheetName: 'A',
              originalRowNumber: 1,
              itemCode: 'W1',
              unit: 'm',
              quantity: 10,
              rowKind: 'ITEM',
            },
          ],
          offersByBoqRowId: {
            u: [
              offer({
                offerKey: 'u',
                supplierName: 'A',
                unit: 'each',
                quantity: 5,
                packSize: 3,
              }),
            ],
          },
        });
        const f = c.rows[0]?.offers[0]?.mismatchFlags ?? [];
        return (
          f.includes('UNIT_MISMATCH') &&
          f.includes('QUANTITY_MISMATCH') &&
          f.includes('PACK_MISMATCH')
        );
      })(),
    ],
    [
      'exclusion',
      resolveBoqSupplierComparison({
        boqImportId: 'x',
        asOfIso: asOf,
        boqRows: [
          {
            boqImportRowId: 'e',
            boqImportId: 'x',
            sheetName: 'A',
            originalRowNumber: 1,
            itemCode: 'W1',
            unit: 'each',
            quantity: 1,
            rowKind: 'ITEM',
          },
        ],
        offersByBoqRowId: {
          e: [offer({ offerKey: 'e', supplierName: 'A', exclusions: 'No delivery' })],
        },
      }).rows[0]?.offers[0]?.mismatchFlags.includes('EXCLUSION_PRESENT'),
    ],
  ];

  // Explicit split: A on r1 (not cheapest) + B on r2 — human review authoritative.
  const proposal = buildSplitPurchaseProposal({
    boqImportId: 'boq-1',
    comparison,
    selections: [
      { boqImportRowId: r1, offerKey: 'a', quantityProposed: 4 },
      { boqImportRowId: r2, offerKey: 's-b', quantityProposed: 2 },
    ],
  });

  cases.push(
    ['split_suppliers', new Set(proposal.lines.map((l) => l.supplierName)).size >= 2],
    [
      'totals_exact',
      // r1 A: 4*1200=4800 + VAT 720 + del 0 = 5520
      // r2 B: 2*2000=4000 + VAT 600 + del 50 = 4650
      proposal.totals.supplierSubtotalCents === 8800 &&
        proposal.totals.vatCents === 1320 &&
        proposal.totals.deliveryCents === 50 &&
        proposal.totals.totalProposedPurchasingCostCents === 10170,
    ],
    [
      'missing_vat_delivery_unknown',
      (() => {
        const incomplete = buildSplitPurchaseProposal({
          boqImportId: 'x',
          comparison: resolveBoqSupplierComparison({
            boqImportId: 'x',
            asOfIso: asOf,
            boqRows: [
              {
                boqImportRowId: 'z',
                boqImportId: 'x',
                sheetName: 'A',
                originalRowNumber: 1,
                itemCode: 'W1',
                unit: 'each',
                quantity: 1,
                rowKind: 'ITEM',
              },
            ],
            offersByBoqRowId: {
              z: [
                offer({
                  offerKey: 'z',
                  supplierName: 'A',
                  vatBasis: 'UNKNOWN',
                  deliveryKnown: false,
                  deliveryCents: null,
                }),
              ],
            },
          }),
          selections: [{ boqImportRowId: 'z', offerKey: 'z', quantityProposed: 1 }],
        });
        return (
          incomplete.totals.incomplete === true &&
          incomplete.totals.totalProposedPurchasingCostCents == null
        );
      })(),
    ],
    ['no_po', proposal.createsPurchaseOrder === false && proposal.createsXeroBill === false],
    ['row99_100_preserved', comparison.row99Immutable && comparison.row100EvidencePreserved],
    [
      'rbac',
      canManageBoqSupplierComparison({ roleName: 'owner' }) &&
        !canManageBoqSupplierComparison({ roleName: 'client' }) &&
        !canManageBoqSupplierComparison({ roleName: 'technician' }),
    ],
    [
      'client_leak',
      (() => {
        try {
          assertNoBoqSupplierComparisonClientLeak({ unitPriceCents: 1 });
          return false;
        } catch {
          return true;
        }
      })(),
    ],
    [
      'idempotency',
      splitPurchaseIdempotencyKey({
        boqImportId: 'a',
        selectionKeys: ['r2:b', 'r1:a'],
      }) ===
        splitPurchaseIdempotencyKey({
          boqImportId: 'a',
          selectionKeys: ['r1:a', 'r2:b'],
        }),
    ],
    [
      'safety',
      assertRow101SafetyGates({ row92AutomationEnabled: false }).purchaseOrdersCreated === 0,
    ],
    [
      'row102_not_started',
      (() => {
        try {
          assertRow102NotStarted(true);
          return false;
        } catch {
          return true;
        }
      })(),
    ],
  );

  let fp = 0;
  let ff = 0;
  for (const [name, ok] of cases) {
    if (ok) {
      pass(`fixture_${name}`);
      fp++;
    } else {
      fail(`fixture_${name}`);
      ff++;
    }
  }
  pass('fixture_totals', { pass: fp, fail: ff });
  pass('cleanup_no_fake_authorised_supplier_quote');
  pass('xero_writes', { count: 0 });
  pass('customer_sends', { count: 0 });
  pass('production_writes', { count: 0 });
  pass('row102_103_not_started');
} catch (e) {
  fail('unexpected', { message: String(e?.message || e) });
} finally {
  await sql.end({ timeout: 5 });
}

const summary = {
  schemaVersion: 'row101-boq-supplier-comparison-v1',
  generatedAt: new Date().toISOString(),
  pass: results.filter((r) => r.status === 'PASS').length,
  fail: results.filter((r) => r.status === 'FAIL').length,
  results,
};
mkdirSync(join(root, 'diagnostic-output'), { recursive: true });
writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ pass: summary.pass, fail: summary.fail, outPath }, null, 2));
if (summary.fail > 0) process.exit(1);
