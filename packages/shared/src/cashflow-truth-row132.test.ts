import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertCashflowLayersNotCollapsed,
  assertRow132SafetyGates,
  displayCashflowField,
  projectCashflowTruthRow132,
} from './cashflow-truth-row132.js';

describe('Row 132 cashflow truth', () => {
  it('separates invoiced vs cash; bank balance unavailable not R0; xero import ≠ live', () => {
    const truth = projectCashflowTruthRow132({
      invoicedRevenueCents: 1_000_000,
      cashReceivedCents: 400_000,
      spendCents: 250_000,
      receivablesCents: 600_000,
      payablesCents: 50_000,
      netCashMovementCents: 150_000,
      bankBalanceSource: 'xero_import_only',
      xeroImportedBankTransactionCount: 3142,
      supplierCommitmentsCents: 80_000,
    });
    assert.equal(truth.invoicedRevenue.amountCents, 1_000_000);
    assert.equal(truth.cashReceived.amountCents, 400_000);
    assert.notEqual(truth.invoicedRevenue.amountCents, truth.cashReceived.amountCents);
    assert.equal(truth.authorisedBankBalance.amountCents, null);
    assert.equal(displayCashflowField(truth.authorisedBankBalance), 'NOT AVAILABLE');
    assert.equal(truth.forecast7Day.availability, 'NOT_AVAILABLE');
    assertCashflowLayersNotCollapsed(truth);

    const noBank = projectCashflowTruthRow132({
      cashReceivedCents: 0,
      bankBalanceSource: 'none',
    });
    assert.equal(noBank.authorisedBankBalance.amountCents, null);
    assert.notEqual(displayCashflowField(noBank.authorisedBankBalance), '0');

    assert.equal(assertRow132SafetyGates({ row92AutomationEnabled: false }).xeroWrites, 0);
    assert.throws(() =>
      assertRow132SafetyGates({
        row92AutomationEnabled: false,
        treatedXeroImportAsLiveBalance: true,
      }),
    );
  });
});
