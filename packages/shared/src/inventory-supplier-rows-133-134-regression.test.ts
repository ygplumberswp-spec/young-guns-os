/**
 * Combined regression for Rows 133–134.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertRow133SafetyGates,
  runInventoryOperationalTruthFixture,
} from './inventory-operational-truth-row133.js';
import {
  assertRow134SafetyGates,
  runSupplierOperationalRecordFixture,
} from './supplier-operational-record-row134.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';
import { QUOTE_LIFECYCLE_ROYAL_CAPE } from './quote-lifecycle.js';

describe('Rows 133–134 inventory/supplier regression', () => {
  it('Row133 inventory truth + Row134 supplier record + safety', () => {
    const inv = runInventoryOperationalTruthFixture();
    assert.equal(inv.pass, true);
    assert.equal(assertRow133SafetyGates({ row92AutomationEnabled: false }).xeroWrites, 0);

    const sup = runSupplierOperationalRecordFixture();
    assert.equal(sup.pass, true);
    assert.equal(assertRow134SafetyGates({ row92AutomationEnabled: false }).xeroWrites, 0);

    assertRow92GlobalAutomationDisabled(false);
    assert.equal(QUOTE_LIFECYCLE_ROYAL_CAPE.quoteNumber, 'QU-0183');
  });
});
