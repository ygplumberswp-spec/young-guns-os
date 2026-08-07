import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPiCostComparison,
  buildPiPurchaseSnapshot,
  buildPiSupplierSnapshot,
  buildPurchaseRecommendationDraft,
  canAccessProcurementIntelligence,
  canApproveProcurementIntelligence,
  canWriteProcurementIntelligence,
  defaultPiSettings,
  listPiAuraConnections,
  PI_PRODUCT_COPY,
  suggestedReorderQuantity,
} from './procurement-intelligence.js';

describe('supplier & procurement intelligence', () => {
  it('RBAC mirrors inventory intelligence; Technician/Client denied; Owner approves', () => {
    assert.equal(
      canAccessProcurementIntelligence({
        roleName: 'Manager',
        permissions: ['procurement:read'],
      }),
      true,
    );
    assert.equal(
      canAccessProcurementIntelligence({
        roleName: 'Technician',
        permissions: ['*', 'procurement:write'],
      }),
      false,
    );
    assert.equal(
      canWriteProcurementIntelligence({
        roleName: 'Manager',
        permissions: ['procurement:read'],
      }),
      false,
    );
    assert.equal(
      canApproveProcurementIntelligence({
        roleName: 'Company Owner',
        permissions: ['procurement:write'],
      }),
      true,
    );
    assert.equal(
      canApproveProcurementIntelligence({
        roleName: 'Manager',
        permissions: ['procurement:write'],
      }),
      false,
    );
  });

  it('honest empty supplier / purchase snapshots — never invents', () => {
    const emptySuppliers = buildPiSupplierSnapshot({
      supplierCount: 0,
      activeSupplierCount: 0,
      pricingRecordCount: 0,
    });
    assert.equal(emptySuppliers.availability, 'unavailable');
    assert.ok(emptySuppliers.rationale.toLowerCase().includes('unavailable'));

    const emptyPurchases = buildPiPurchaseSnapshot({
      purchaseOrderCount: 0,
      pendingApprovalCount: 0,
      openOrderCount: 0,
      completedOrderCount: 0,
      totalSpendCents: 0,
    });
    assert.equal(emptyPurchases.availability, 'unavailable');
    assert.equal(emptyPurchases.totalSpendCents, null);
  });

  it('cost comparison unavailable without real pricing lines', () => {
    const empty = buildPiCostComparison({ productKey: 'valve', lines: [] });
    assert.equal(empty.availability, 'unavailable');
    assert.equal(empty.savingsOpportunityCents, null);

    const compared = buildPiCostComparison({
      productKey: 'valve',
      lines: [
        {
          supplierId: 's1',
          supplierName: 'A',
          unitCostCents: 1000,
          source: 'supplier_product',
          productName: 'Valve',
          leadTimeDays: 2,
        },
        {
          supplierId: 's2',
          supplierName: 'B',
          unitCostCents: 800,
          source: 'price_catalogue',
          productName: 'Valve',
          leadTimeDays: 5,
        },
      ],
    });
    assert.equal(compared.availability, 'available');
    assert.equal(compared.lowestUnitCostCents, 800);
    assert.equal(compared.highestUnitCostCents, 1000);
    assert.equal(compared.savingsOpportunityCents, 200);
    assert.equal(compared.lines[0]?.unitCostCents, 800);
  });

  it('purchase recommendation drafts never claim auto-purchase', () => {
    const draft = buildPurchaseRecommendationDraft({
      kind: 'purchase_suggestion',
      sku: 'SKU-1',
      name: 'Gasket',
      quantityOnHand: 0,
      reorderLevel: 5,
      suggestedQuantity: 5,
      unitCostCents: 250,
    });
    assert.ok(/draft|not a purchase order|never auto/i.test(draft.body));
    assert.ok(PI_PRODUCT_COPY.thisLayer.includes('Never auto-purchases'));
    const settings = defaultPiSettings();
    assert.equal(settings.autoPurchaseEnabled, false);
  });

  it('suggested reorder quantity grounded in reorder math only', () => {
    assert.equal(suggestedReorderQuantity({ quantityOnHand: 2, reorderLevel: 5 }), 3);
    assert.equal(suggestedReorderQuantity({ quantityOnHand: 5, reorderLevel: 5 }), null);
    assert.equal(suggestedReorderQuantity({ quantityOnHand: 0, reorderLevel: 0 }), null);
  });

  it('lists AURA connections including inventory intelligence and procurement', () => {
    const links = listPiAuraConnections();
    assert.ok(links.some((l) => l.target === 'inventory_intelligence'));
    assert.ok(links.some((l) => l.target === 'procurement'));
    assert.ok(links.every((l) => l.href.startsWith('/')));
  });
});
