/**
 * Combined regression for Rows 119–126 (+ related finance proofs).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertRow119SafetyGates,
  projectReceivablesTruth,
} from './finance-page-truth.js';
import {
  assertRow121SafetyGates,
  proveBillingLifecycleCoverage,
  proveQuoteLifecycleCoverage,
} from './finance-lifecycle-coverage.js';
import { provePricebookSafety } from './pricebook-safety-row122.js';
import {
  assertRow123SafetyGates,
  provePlanEstimateToActualProfitHandoff,
} from './plan-estimate-actual-profit-row123.js';
import {
  invoiceMatchesCanonicalFilter,
  resolveCanonicalInvoiceDisplayStatus,
} from './finance-canonical-status.js';
import { assertIssuedInvoiceMutationAllowed } from './issued-invoice-protection.js';
import { resolveInvoiceRowActions } from './invoice-row-actions.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';
import { QUOTE_LIFECYCLE_ROYAL_CAPE } from './quote-lifecycle.js';

describe('Rows 119–126 combined finance regression', () => {
  it('Row119 no false R0 + safety', () => {
    const disc = projectReceivablesTruth({ invoices: [], xeroConnected: false });
    assert.equal(disc.totalOutstanding.amountCents, null);
    assert.equal(assertRow119SafetyGates({ row92AutomationEnabled: false }).xeroWrites, 0);
  });

  it('Row121 quote+billing coverage', () => {
    assert.ok(proveQuoteLifecycleCoverage().every((c) => c.status === 'SUPPORTED'));
    assert.ok(proveBillingLifecycleCoverage().every((c) => c.status === 'SUPPORTED'));
    assert.equal(assertRow121SafetyGates({ row92AutomationEnabled: false }).customerSends, 0);
  });

  it('Row122 pricebook DRAFT/OFF + isolation', () => {
    const proved = provePricebookSafety({
      globalAutomationEnabled: false,
      ruleSetStatus: 'DRAFT',
      ownerApprovalPresentForActivation: false,
      ruleSetBefore: { version: 1, status: 'DRAFT', globalAutomationEnabled: false },
      ruleSetAfter: { version: 1, status: 'DRAFT', globalAutomationEnabled: false },
      catalogueSellBefore: 100,
      catalogueSellAfter: 100,
      sourceCostBefore: 40,
      sourceCostAfter: 40,
    });
    assert.equal(proved.globalMarkupDraftOff, true);
  });

  it('Row123 incomplete without inventing', () => {
    const handoff = provePlanEstimateToActualProfitHandoff({
      hasPlanTakeoff: true,
      hasWaterWasteGeyserQuantities: false,
      hasMaterials: true,
      hasLabour: true,
      hasSiteDirectCost: true,
      estimatedGpCents: null,
      hasQuoteLink: true,
      hasJobLink: false,
      actualProfitAfterCloseCents: null,
      jobClosed: false,
    });
    assert.equal(handoff.inventedValues, false);
    assert.equal(handoff.completeness, 'INCOMPLETE');
    assert.equal(assertRow123SafetyGates({ row92AutomationEnabled: false }).inventedValues, false);
  });

  it('Row124 overdue derived; filters share resolver', () => {
    const overdue = resolveCanonicalInvoiceDisplayStatus({
      status: 'sent',
      dueDate: '2020-01-01',
      balanceDueCents: 100,
      asOfDate: '2024-01-01',
    });
    assert.equal(overdue, 'Overdue');
    assert.equal(
      invoiceMatchesCanonicalFilter(
        { status: 'sent', dueDate: '2020-01-01', balanceDueCents: 100, asOfDate: '2024-01-01' },
        'overdue',
      ),
      true,
    );
  });

  it('Row125 issued blocked; Row126 role matrix; Row92 OFF; Royal Cape id stable', () => {
    assert.equal(
      assertIssuedInvoiceMutationAllowed(
        { status: 'sent', issuedAt: '2024-01-01', invoiceNumber: 'INV-1' },
        'edit',
      ).allowed,
      false,
    );
    assert.deepEqual(
      resolveInvoiceRowActions({ role: 'technician', invoice: { status: 'draft' } }),
      ['view'],
    );
    assertRow92GlobalAutomationDisabled(false);
    assert.equal(QUOTE_LIFECYCLE_ROYAL_CAPE.quoteNumber, 'QU-0183');
  });
});
