import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { provePricebookSafety } from './pricebook-safety-row122.js';

describe('Row 122 pricebook safety', () => {
  it('keeps global markup DRAFT/OFF; blocks activation without Owner approval; isolates override', () => {
    const proved = provePricebookSafety({
      globalAutomationEnabled: false,
      ruleSetStatus: 'DRAFT',
      ownerApprovalPresentForActivation: false,
      ruleSetBefore: { version: 1, status: 'DRAFT', globalAutomationEnabled: false },
      ruleSetAfter: { version: 1, status: 'DRAFT', globalAutomationEnabled: false },
      catalogueSellBefore: 1000,
      catalogueSellAfter: 1000,
      sourceCostBefore: 400,
      sourceCostAfter: 400,
      priorOverrideSellCents: 1500,
      newQuoteLineSellCents: 1000,
      catalogueSellCents: 1000,
    });
    assert.equal(proved.globalMarkupDraftOff, true);
    assert.equal(proved.noGlobalMutation, true);
    assert.throws(() =>
      provePricebookSafety({
        globalAutomationEnabled: false,
        ruleSetStatus: 'ACTIVE',
        ownerApprovalPresentForActivation: false,
      }),
    );
  });
});
