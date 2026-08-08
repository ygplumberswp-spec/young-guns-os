import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertRow119SafetyGates,
  canViewFinancePageTruth,
  formatFinanceTruthDisplay,
  projectCashflowTruth,
  projectPayablesTruth,
  projectReceivablesTruth,
} from './finance-page-truth.js';

describe('Row 119 finance page truth', () => {
  it('no false R0 when not connected; empty set is EMPTY 0; incomplete stays incomplete', () => {
    const disconnected = projectReceivablesTruth({ invoices: [], xeroConnected: false });
    assert.equal(disconnected.availability, 'NOT_CONNECTED');
    assert.equal(disconnected.totalOutstanding.amountCents, null);
    assert.equal(formatFinanceTruthDisplay(disconnected.totalOutstanding), 'NOT CONNECTED');

    const empty = projectReceivablesTruth({ invoices: [], xeroConnected: true });
    assert.equal(empty.availability, 'EMPTY');
    assert.equal(empty.totalOutstanding.amountCents, 0);
    assert.equal(empty.totalOutstanding.reconciledToSources, true);

    const incomplete = projectReceivablesTruth({
      xeroConnected: true,
      invoices: [
        { id: '1', status: 'sent', balanceDueCents: 1000, isOverdue: true },
        { id: '2', status: 'sent', balanceDueCents: null },
      ],
    });
    assert.equal(incomplete.availability, 'INCOMPLETE');
    assert.equal(incomplete.totalOutstanding.amountCents, null);

    const ok = projectReceivablesTruth({
      xeroConnected: true,
      invoices: [
        { id: '1', status: 'sent', balanceDueCents: 1000, isOverdue: true },
        { id: '2', status: 'partial', balanceDueCents: 500, isOverdue: false },
        { id: '3', status: 'paid', balanceDueCents: 0 },
      ],
    });
    assert.equal(ok.totalOutstanding.amountCents, 1500);
    assert.equal(ok.overdue.amountCents, 1000);
    assert.equal(ok.totalOutstanding.reconciledToSources, true);
  });

  it('payables/cashflow honest availability', () => {
    const unsupported = projectPayablesTruth({
      bills: [],
      xeroBillsImportSupported: false,
      xeroConnected: true,
    });
    assert.equal(unsupported.availability, 'NOT_AVAILABLE');

    const bills = projectPayablesTruth({
      bills: [
        { id: 'b1', amountDueCents: 2000, status: 'AUTHORISED' },
        { id: 'b2', amountDueCents: 3000, status: 'AUTHORISED' },
      ],
      xeroBillsImportSupported: true,
      xeroConnected: true,
    });
    assert.equal(bills.totalDue.amountCents, 5000);

    const cashDisc = projectCashflowTruth({
      bankTransactionCount: 0,
      knownMoneyInCents: null,
      knownMoneyOutCents: null,
      bankConnectedOrImportReady: false,
    });
    assert.equal(cashDisc.availability, 'NOT_CONNECTED');
    assert.equal(cashDisc.moneyIn.amountCents, null);

    const cashOk = projectCashflowTruth({
      bankTransactionCount: 10,
      knownMoneyInCents: 100,
      knownMoneyOutCents: 40,
      cashControlCompleteness: 'VERIFIED',
      bankConnectedOrImportReady: true,
    });
    assert.equal(cashOk.moneyIn.amountCents, 100);
    assert.equal(cashOk.moneyOut.amountCents, 40);
  });

  it('RBAC + safety', () => {
    assert.equal(canViewFinancePageTruth({ roleName: 'owner' }), true);
    assert.equal(canViewFinancePageTruth({ roleName: 'technician' }), false);
    assert.equal(canViewFinancePageTruth({ roleName: 'client' }), false);
    assert.equal(assertRow119SafetyGates({ row92AutomationEnabled: false }).xeroWrites, 0);
  });
});
