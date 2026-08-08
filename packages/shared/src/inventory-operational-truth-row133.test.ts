import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertRow133SafetyGates,
  canViewInventorySupplierCost,
  INVENTORY_TRUTH_ROYAL_CAPE,
  projectInventoryOperationalTruth,
  projectTechInventoryOperationalView,
  runInventoryOperationalTruthFixture,
} from './inventory-operational-truth-row133.js';

describe('Row 133 inventory operational truth', () => {
  it('fixture proves warehouse/van/reserve/use/low/out/reorder/price/RBAC', () => {
    const report = runInventoryOperationalTruthFixture();
    assert.equal(report.pass, true, JSON.stringify(report.proofs));
    assert.equal(report.xeroWrites, 0);
    assert.equal(report.truth.fabricatedStock, false);
    assert.equal(report.truth.availableQuantity, 22);
    assert.equal(report.truth.latestSupplierPriceCents, 1000);
    assert.equal(INVENTORY_TRUTH_ROYAL_CAPE.royalCapeQuoteNumber, 'QU-0183');
    assert.equal(assertRow133SafetyGates({ row92AutomationEnabled: false }).fabricatedStock, false);
  });

  it('never fabricates; threshold missing → NOT_CONFIGURED; tech denied cost', () => {
    const t = projectInventoryOperationalTruth({
      itemId: 'i1',
      sku: 'S1',
      name: 'Item',
      locations: [{ locationId: 'w', locationType: 'warehouse', quantityOnHand: 3 }],
      reorderLevel: null,
    });
    assert.equal(t.reorderAvailability, 'NOT_CONFIGURED');
    assert.equal(t.purchaseRequiredAvailability, 'NOT_CONFIGURED');
    assert.equal(t.latestSupplierPriceAvailability, 'NOT_AVAILABLE');

    assert.throws(() =>
      projectInventoryOperationalTruth({
        itemId: 'i2',
        sku: 'S2',
        name: 'Bad',
        locations: [{ locationId: 'w', locationType: 'warehouse', quantityOnHand: -1 }],
      }),
    );

    const tech = projectTechInventoryOperationalView(t);
    assert.equal(tech.supplierCostVisible, false);
    assert.equal(canViewInventorySupplierCost({ roleName: 'technician' }), false);
    assert.equal(canViewInventorySupplierCost({ roleName: 'owner' }), true);
  });
});
