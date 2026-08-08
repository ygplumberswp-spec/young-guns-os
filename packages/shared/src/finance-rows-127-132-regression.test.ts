/**
 * Combined regression for Rows 127–132.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertRow127AcceptanceGate,
  proveProcureToPayCoverage,
} from './procure-to-pay-row127.js';
import {
  assertRow128SafetyGates,
  suggestAuraPaymentAllocation,
} from './payment-reconciliation-row128.js';
import {
  assertRow129ExactCents,
  deriveExactCentPaymentLedger,
} from './payment-ledger-exact-row129.js';
import {
  CANONICAL_JOB_PAYMENT_VISIBILITY,
  resolveJobPaymentVisibility,
} from './job-payment-visibility-row130.js';
import { projectReceivablesAgeing } from './receivables-ageing-row131.js';
import {
  assertCashflowLayersNotCollapsed,
  projectCashflowTruthRow132,
} from './cashflow-truth-row132.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';
import { QUOTE_LIFECYCLE_ROYAL_CAPE } from './quote-lifecycle.js';

describe('Rows 127–132 combined regression', () => {
  it('Row127 procure-to-pay mid-chain + explicit gaps', () => {
    const cells = proveProcureToPayCoverage();
    assertRow127AcceptanceGate(cells);
    assert.equal(cells.find((c) => c.step === 'need')?.status, 'NOT_AVAILABLE');
  });

  it('Row128 AURA suggestion only', () => {
    const aura = suggestAuraPaymentAllocation({
      transactionAmountCents: 5000,
      transactionDate: '2024-06-01',
      description: 'pay INV-9',
      reference: 'INV-9',
      invoices: [
        { id: 'i9', label: 'INV-9', amountCents: 5000, reference: 'INV-9', date: '2024-06-01' },
      ],
    });
    assert.equal(aura.xeroWritePerformed, false);
    assert.equal(assertRow128SafetyGates({ row92AutomationEnabled: false }).auraSuggestionOnly, true);
  });

  it('Row129 exact-cent cases + Row130 visibility + Row131 ageing + Row132 layers', () => {
    const ledger = deriveExactCentPaymentLedger({
      quotes: [],
      invoices: [],
      payments: [],
    });
    assertRow129ExactCents(ledger.exactCentCases);
    assert.equal(CANONICAL_JOB_PAYMENT_VISIBILITY.length, 17);
    assert.equal(
      resolveJobPaymentVisibility({ quotes: [], invoices: [], payments: [] }).visibility,
      'NO_INVOICE',
    );
    const ageing = projectReceivablesAgeing({
      asOfDate: '2024-06-01',
      invoices: [{ id: '1', dueDate: '2024-05-01', outstandingCents: 100 }],
    });
    assert.ok(ageing.buckets.some((b) => b.count > 0));
    const cash = projectCashflowTruthRow132({
      invoicedRevenueCents: 10,
      cashReceivedCents: 4,
      bankBalanceSource: 'xero_import_only',
      xeroImportedBankTransactionCount: 1,
    });
    assertCashflowLayersNotCollapsed(cash);
    assertRow92GlobalAutomationDisabled(false);
    assert.equal(QUOTE_LIFECYCLE_ROYAL_CAPE.quoteNumber, 'QU-0183');
  });
});
