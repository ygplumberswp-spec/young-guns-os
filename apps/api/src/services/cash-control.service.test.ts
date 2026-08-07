/**
 * CASH-001 service-level proofs (pure composition + RBAC).
 * DB-backed paths are covered via shared pure helpers + route envelope.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  buildPeriodMetrics,
  canViewCashControl,
  deriveCashTruthCompleteness,
  resolveCustomerCashCollectedWithoutDoubleCount,
  resolveEconomicCostWithoutDoubleCount,
  type CashControlBankTransactionInput,
  type CashControlPaymentInput,
} from '@titan/shared';
import { CashControlError } from './cash-control.service.js';

const here = dirname(fileURLToPath(import.meta.url));

function tx(
  partial: Partial<CashControlBankTransactionInput> &
    Pick<CashControlBankTransactionInput, 'id' | 'direction' | 'amountCents' | 'transactionDate'>,
): CashControlBankTransactionInput {
  const allocations = partial.allocations ?? [];
  const abs = Math.abs(partial.amountCents);
  const allocated = allocations.reduce((s, a) => s + a.amountCents, 0);
  return {
    currency: 'ZAR',
    description: 'tx',
    reference: null,
    allocationStatus:
      allocated === 0
        ? partial.direction === 'credit'
          ? 'needs_review'
          : 'unallocated'
        : allocated < abs
          ? 'partially_allocated'
          : 'allocated',
    receiptStatus: 'receipt_not_required',
    allocatedAmountCents: allocated,
    merchantName: null,
    confirmedSupplierId: null,
    confirmedSupplierName: null,
    suggestedSupplierId: null,
    provider: 'manual_import',
    allocations,
    ...partial,
  };
}

describe('CASH-001 CashControlService invariants', () => {
  it('blocks technician and client via shared RBAC', () => {
    assert.equal(canViewCashControl({ roleName: 'Technician', permissions: ['finance:read'] }), false);
    assert.equal(canViewCashControl({ roleName: 'Client', permissions: ['portal.invoices:read'] }), false);
    assert.equal(canViewCashControl({ roleName: 'Owner', permissions: ['finance:read'] }), true);
    assert.equal(canViewCashControl({ roleName: 'Accountant', permissions: ['finance:write'] }), true);
  });

  it('CashControlError carries FORBIDDEN code for RBAC failures', () => {
    const err = new CashControlError('FORBIDDEN', 'blocked');
    assert.equal(err.code, 'FORBIDDEN');
  });

  it('customer payment + bank credit same event → cash collected once', () => {
    const payments: CashControlPaymentInput[] = [
      {
        id: 'p1',
        amountCents: 500000,
        paidAt: '2026-08-07T12:00:00.000Z',
        invoiceId: 'inv1',
        xeroPaymentId: 'xp1',
      },
    ];
    const credit = tx({
      id: 'c1',
      direction: 'credit',
      amountCents: 500000,
      transactionDate: '2026-08-07',
      allocations: [
        {
          id: 'a1',
          transactionId: 'c1',
          amountCents: 500000,
          allocationType: 'customer_payment',
        },
      ],
    });
    const period = buildPeriodMetrics({
      periodKey: 'today',
      fromDate: '2026-08-07',
      toDate: '2026-08-07',
      payments,
      transactions: [credit],
    });
    const resolved = resolveCustomerCashCollectedWithoutDoubleCount({
      payments,
      bankCustomerPaymentAllocationCents: 500000,
      fromDate: '2026-08-07',
      toDate: '2026-08-07',
    });
    assert.equal(period.moneyIn.customerCashCollectedCents, 500000);
    assert.equal(resolved.doubleCountAvoidedCents, 500000);
  });

  it('direct cost + receipt + bank = one economic cost', () => {
    const r = resolveEconomicCostWithoutDoubleCount({
      directCostAmountCents: 100000,
      receiptAmountCents: 100000,
      bankPaymentAmountCents: 100000,
    });
    assert.equal(r.economicCostCents, 100000);
    assert.equal(r.cashSpentCents, 100000);
  });

  it('incomplete bank coverage → INCOMPLETE completeness', () => {
    const result = deriveCashTruthCompleteness({
      bankCoverageIncomplete: true,
      unexplainedDebitCents: 0,
      unexplainedCreditCents: 0,
      partialAllocationCount: 0,
      missingReceiptCount: 0,
      unknownSupplierCount: 0,
      unpaidJobCostCents: 0,
    });
    assert.equal(result.completeness, 'INCOMPLETE');
  });

  it('tenant scope is enforced by actor.companyId on service methods (contract)', () => {
    const source = readFileSync(join(here, 'cash-control.service.ts'), 'utf8');
    assert.ok(source.includes('eq(bankTransactions.companyId, companyId)'));
    assert.ok(source.includes('eq(payments.companyId, companyId)'));
    assert.ok(source.includes('eq(invoices.companyId, actor.companyId)'));
    assert.ok(source.includes('eq(jobDirectCostEntries.companyId, actor.companyId)'));
  });
});
)
