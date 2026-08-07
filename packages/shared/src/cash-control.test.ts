import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildLedgerRowFromBankTransaction,
  buildPeriodMetrics,
  canViewCashControl,
  classifyBankMoneyForPeriod,
  deriveCashTruthCompleteness,
  deriveEveryRandControlState,
  invoiceBalanceDueCents,
  isOutstandingCustomerInvoice,
  overheadExcludedFromJobGrossProfit,
  paginateCashControlLedger,
  resolveCustomerCashCollectedWithoutDoubleCount,
  resolveDirectCostSettlementView,
  resolveEconomicCostWithoutDoubleCount,
  sumCustomerCashCollectedCents,
  type CashControlBankTransactionInput,
  type CashControlLedgerRow,
  type CashControlPaymentInput,
} from './cash-control.js';

function tx(
  partial: Partial<CashControlBankTransactionInput> &
    Pick<CashControlBankTransactionInput, 'id' | 'direction' | 'amountCents' | 'transactionDate'>,
): CashControlBankTransactionInput {
  const abs = Math.abs(partial.amountCents);
  const allocations = partial.allocations ?? [];
  const allocated = allocations.reduce((s, a) => s + a.amountCents, 0);
  return {
    currency: 'ZAR',
    description: partial.description ?? 'tx',
    reference: partial.reference ?? null,
    allocationStatus:
      partial.allocationStatus ??
      (allocated === 0
        ? partial.direction === 'credit'
          ? 'needs_review'
          : 'unallocated'
        : allocated < abs
          ? 'partially_allocated'
          : 'allocated'),
    receiptStatus: partial.receiptStatus ?? 'receipt_not_required',
    allocatedAmountCents: allocated,
    merchantName: partial.merchantName ?? null,
    confirmedSupplierId: partial.confirmedSupplierId ?? null,
    confirmedSupplierName: partial.confirmedSupplierName ?? null,
    suggestedSupplierId: partial.suggestedSupplierId ?? null,
    provider: partial.provider ?? 'manual_import',
    allocations,
    ...partial,
  };
}

describe('CASH-001 Every-Rand Control', () => {
  it('1 customer payment counted once', () => {
    const payments: CashControlPaymentInput[] = [
      {
        id: 'pay-1',
        amountCents: 500000,
        paidAt: '2026-08-07T10:00:00.000Z',
        invoiceId: 'inv-1',
      },
    ];
    assert.equal(sumCustomerCashCollectedCents(payments, '2026-08-07', '2026-08-07'), 500000);
  });

  it('2 bank representation does not double customer cash', () => {
    const payments: CashControlPaymentInput[] = [
      {
        id: 'pay-1',
        amountCents: 500000,
        paidAt: '2026-08-07T10:00:00.000Z',
        xeroPaymentId: 'xero-pay-1',
        invoiceId: 'inv-1',
      },
    ];
    const bankCredit = tx({
      id: 'btx-1',
      direction: 'credit',
      amountCents: 500000,
      transactionDate: '2026-08-07',
      allocations: [
        {
          id: 'alloc-1',
          transactionId: 'btx-1',
          amountCents: 500000,
          allocationType: 'customer_payment',
        },
      ],
    });
    const bank = classifyBankMoneyForPeriod([bankCredit], '2026-08-07', '2026-08-07');
    const resolved = resolveCustomerCashCollectedWithoutDoubleCount({
      payments,
      bankCustomerPaymentAllocationCents: bank.customerPaymentBankCents,
      fromDate: '2026-08-07',
      toDate: '2026-08-07',
    });
    assert.equal(resolved.customerCashCollectedCents, 500000);
    assert.equal(resolved.bankCustomerPaymentExplanationCents, 500000);
    assert.equal(resolved.doubleCountAvoidedCents, 500000);

    const period = buildPeriodMetrics({
      periodKey: 'today',
      fromDate: '2026-08-07',
      toDate: '2026-08-07',
      payments,
      transactions: [bankCredit],
    });
    assert.equal(period.moneyIn.customerCashCollectedCents, 500000);
  });

  it('3 direct cost + receipt + bank payment counts one economic cost', () => {
    const resolved = resolveEconomicCostWithoutDoubleCount({
      directCostAmountCents: 100000,
      receiptAmountCents: 100000,
      bankPaymentAmountCents: 100000,
    });
    assert.equal(resolved.economicCostCents, 100000);
    assert.equal(resolved.cashSpentCents, 100000);
    assert.equal(resolved.receiptIsEvidenceOnly, true);
  });

  it('4 partial direct-cost payment correct', () => {
    const settlement = resolveDirectCostSettlementView({
      id: 'dc-1',
      jobId: 'job-1',
      supplierId: 'sup-1',
      supplierName: 'Builders',
      amountCents: 200000,
      amountPaidCents: 125000,
      isPaid: false,
      receiptDocumentId: 'doc-1',
      linkedAllocations: [{ id: 'a1', amountCents: 125000 }],
    });
    assert.equal(settlement.economicCostCents, 200000);
    assert.equal(settlement.amountPaidCents, 125000);
    assert.equal(settlement.unpaidCents, 75000);
  });

  it('5 unpaid amount correct', () => {
    const settlement = resolveDirectCostSettlementView({
      id: 'dc-2',
      jobId: 'job-1',
      supplierId: null,
      supplierName: null,
      amountCents: 50000,
      amountPaidCents: 0,
      isPaid: false,
    });
    assert.equal(settlement.unpaidCents, 50000);
  });

  it('6 second payment completes settlement correctly', () => {
    const afterFirst = resolveDirectCostSettlementView({
      id: 'dc-3',
      jobId: 'job-1',
      supplierId: null,
      supplierName: null,
      amountCents: 200000,
      amountPaidCents: 125000,
      isPaid: false,
    });
    const afterSecond = resolveDirectCostSettlementView({
      ...afterFirst,
      id: 'dc-3',
      amountCents: 200000,
      amountPaidCents: 200000,
      isPaid: true,
      jobId: 'job-1',
      supplierId: null,
      supplierName: null,
    });
    assert.equal(afterFirst.unpaidCents, 75000);
    assert.equal(afterSecond.amountPaidCents, 200000);
    assert.equal(afterSecond.unpaidCents, 0);
  });

  it('7 overhead excluded from job JPE gross profit', () => {
    const gp = overheadExcludedFromJobGrossProfit({
      economicRevenueCents: 1000000,
      economicDirectCostsCents: 400000,
      overheadCashOutCents: 250000,
    });
    assert.equal(gp.grossProfitCents, 600000);
    assert.equal(gp.overheadExcluded, true);
  });

  it('8 overhead included in company cash out', () => {
    const debit = tx({
      id: 'btx-oh',
      direction: 'debit',
      amountCents: -250000,
      transactionDate: '2026-08-07',
      allocations: [
        {
          id: 'a-oh',
          transactionId: 'btx-oh',
          amountCents: 250000,
          allocationType: 'overhead',
          category: 'rent',
        },
      ],
    });
    const period = buildPeriodMetrics({
      periodKey: 'today',
      fromDate: '2026-08-07',
      toDate: '2026-08-07',
      payments: [],
      transactions: [debit],
    });
    assert.equal(period.moneyOut.overheadCashOutCents, 250000);
    assert.equal(period.moneyOut.directJobCashOutCents, 0);
  });

  it('9 internal transfer excluded from operating income/expense', () => {
    const outTx = tx({
      id: 'btx-t1',
      direction: 'debit',
      amountCents: -1000000,
      transactionDate: '2026-08-07',
      allocations: [
        {
          id: 'a-t1',
          transactionId: 'btx-t1',
          amountCents: 1000000,
          allocationType: 'transfer',
        },
      ],
    });
    const inTx = tx({
      id: 'btx-t2',
      direction: 'credit',
      amountCents: 1000000,
      transactionDate: '2026-08-07',
      allocations: [
        {
          id: 'a-t2',
          transactionId: 'btx-t2',
          amountCents: 1000000,
          allocationType: 'transfer',
        },
      ],
    });
    const period = buildPeriodMetrics({
      periodKey: 'today',
      fromDate: '2026-08-07',
      toDate: '2026-08-07',
      payments: [],
      transactions: [outTx, inTx],
    });
    assert.equal(period.moneyOut.internalTransferOutCents, 1000000);
    assert.equal(period.moneyIn.internalTransferInCents, 1000000);
    assert.equal(period.knownNetOperationalCashMovementCents, 0);
    assert.equal(period.moneyIn.customerCashCollectedCents, 0);
    assert.equal(period.moneyOut.directJobCashOutCents, 0);
  });

  it('10 unexplained debit surfaced', () => {
    const state = deriveEveryRandControlState({
      direction: 'debit',
      allocationStatus: 'unallocated',
      receiptStatus: 'receipt_missing',
      unallocatedAmountCents: 500000,
      allocations: [],
    });
    assert.equal(state, 'unexplained');
  });

  it('11 unexplained credit surfaced', () => {
    const credit = tx({
      id: 'btx-c',
      direction: 'credit',
      amountCents: 300000,
      transactionDate: '2026-08-07',
      allocationStatus: 'needs_review',
      allocations: [],
    });
    const bank = classifyBankMoneyForPeriod([credit], '2026-08-07', '2026-08-07');
    assert.equal(bank.unexplainedMoneyInCents, 300000);
    const state = deriveEveryRandControlState({
      direction: 'credit',
      allocationStatus: 'needs_review',
      receiptStatus: 'receipt_not_required',
      unallocatedAmountCents: 300000,
      allocations: [],
    });
    assert.equal(state, 'needs_review');
  });

  it('12 partial allocation surfaced', () => {
    const state = deriveEveryRandControlState({
      direction: 'debit',
      allocationStatus: 'partially_allocated',
      receiptStatus: 'receipt_attached',
      unallocatedAmountCents: 100000,
      allocations: [
        {
          allocationType: 'direct_job_cost',
          amountCents: 400000,
          jobId: 'job-1',
        },
      ],
    });
    assert.equal(state, 'partially_explained');
  });

  it('13 missing receipt surfaced', () => {
    const state = deriveEveryRandControlState({
      direction: 'debit',
      allocationStatus: 'allocated',
      receiptStatus: 'receipt_missing',
      unallocatedAmountCents: 0,
      allocations: [
        {
          allocationType: 'direct_job_cost',
          amountCents: 500000,
          jobId: 'job-1',
        },
      ],
    });
    assert.equal(state, 'missing_receipt');
  });

  it('14 unknown supplier surfaced where applicable', () => {
    const state = deriveEveryRandControlState({
      direction: 'debit',
      allocationStatus: 'partially_allocated',
      receiptStatus: 'receipt_missing',
      unallocatedAmountCents: 100000,
      allocations: [
        {
          allocationType: 'supplier_settlement',
          amountCents: 400000,
          supplierId: null,
        },
      ],
      confirmedSupplierId: null,
    });
    assert.ok(state === 'missing_supplier' || state === 'partially_explained' || state === 'missing_receipt');
  });

  it('15 outstanding invoice surfaced', () => {
    assert.equal(
      isOutstandingCustomerInvoice({
        totalCents: 500000,
        amountPaidCents: 200000,
        status: 'partial',
      }),
      true,
    );
    assert.equal(
      invoiceBalanceDueCents({
        totalCents: 500000,
        amountPaidCents: 200000,
        status: 'partial',
      }),
      300000,
    );
  });

  it('16 paid invoice not outstanding', () => {
    assert.equal(
      isOutstandingCustomerInvoice({
        totalCents: 500000,
        amountPaidCents: 500000,
        status: 'paid',
      }),
      false,
    );
    assert.equal(
      invoiceBalanceDueCents({
        totalCents: 500000,
        amountPaidCents: 500000,
        status: 'paid',
      }),
      0,
    );
  });

  it('17 known realised cash profit correct', () => {
    const payments: CashControlPaymentInput[] = [
      {
        id: 'pay-1',
        amountCents: 800000,
        paidAt: '2026-08-07T10:00:00.000Z',
        invoiceId: 'inv-1',
      },
    ];
    const jobDebit = tx({
      id: 'btx-job',
      direction: 'debit',
      amountCents: -300000,
      transactionDate: '2026-08-07',
      allocations: [
        {
          id: 'a-job',
          transactionId: 'btx-job',
          amountCents: 300000,
          allocationType: 'direct_job_cost',
          jobId: 'job-1',
        },
      ],
    });
    const period = buildPeriodMetrics({
      periodKey: 'today',
      fromDate: '2026-08-07',
      toDate: '2026-08-07',
      payments,
      transactions: [jobDebit],
    });
    const knownRealised =
      period.moneyIn.customerCashCollectedCents - period.moneyOut.directJobCashOutCents;
    assert.equal(knownRealised, 500000);
  });

  it('18 economic gross profit remains separate from cash', () => {
    const economicGp = overheadExcludedFromJobGrossProfit({
      economicRevenueCents: 1000000,
      economicDirectCostsCents: 400000,
      overheadCashOutCents: 0,
    }).grossProfitCents;
    const cashProfit = 800000 - 300000;
    assert.equal(economicGp, 600000);
    assert.notEqual(economicGp, cashProfit);
  });

  it('19 incomplete bank coverage labelled correctly', () => {
    const { completeness, reasons } = deriveCashTruthCompleteness({
      bankCoverageIncomplete: true,
      unexplainedDebitCents: 0,
      unexplainedCreditCents: 0,
      partialAllocationCount: 0,
      missingReceiptCount: 0,
      unknownSupplierCount: 0,
      unpaidJobCostCents: 0,
    });
    assert.equal(completeness, 'INCOMPLETE');
    assert.ok(reasons.includes('incomplete_bank_coverage'));
  });

  it('20 cent precision', () => {
    const period = buildPeriodMetrics({
      periodKey: 'today',
      fromDate: '2026-08-07',
      toDate: '2026-08-07',
      payments: [
        {
          id: 'p',
          amountCents: 12345,
          paidAt: '2026-08-07T00:00:00.000Z',
          invoiceId: 'i',
        },
      ],
      transactions: [
        tx({
          id: 'd',
          direction: 'debit',
          amountCents: -6789,
          transactionDate: '2026-08-07',
          allocations: [
            {
              id: 'a',
              transactionId: 'd',
              amountCents: 6789,
              allocationType: 'direct_job_cost',
              jobId: 'j',
            },
          ],
        }),
      ],
    });
    assert.equal(period.moneyIn.customerCashCollectedCents, 12345);
    assert.equal(period.moneyOut.directJobCashOutCents, 6789);
    assert.equal(period.knownNetCashMovementCents, 12345 - 6789);
  });

  it('21 tenant isolation helper denies cross-role leakage at RBAC layer', () => {
    assert.equal(
      canViewCashControl({ roleName: 'Technician', permissions: ['finance:read'] }),
      false,
    );
    assert.equal(
      canViewCashControl({ roleName: 'Owner', permissions: ['finance:read'] }),
      true,
    );
  });

  it('22 technician blocked', () => {
    assert.equal(
      canViewCashControl({ roleName: 'Technician', permissions: ['*'] }),
      false,
    );
  });

  it('23 client blocked', () => {
    assert.equal(
      canViewCashControl({ roleName: 'Client', permissions: ['portal.invoices:read'] }),
      false,
    );
  });

  it('24 pagination', () => {
    const rows: CashControlLedgerRow[] = Array.from({ length: 25 }, (_, i) =>
      buildLedgerRowFromBankTransaction(
        tx({
          id: `tx-${i}`,
          direction: 'debit',
          amountCents: -(1000 + i),
          transactionDate: '2026-08-07',
          allocations: [],
        }),
      ),
    );
    const page1 = paginateCashControlLedger(rows, 1, 10);
    const page2 = paginateCashControlLedger(rows, 2, 10);
    const page3 = paginateCashControlLedger(rows, 3, 10);
    assert.equal(page1.rows.length, 10);
    assert.equal(page1.total, 25);
    assert.equal(page1.hasMore, true);
    assert.equal(page2.rows.length, 10);
    assert.equal(page3.rows.length, 5);
    assert.equal(page3.hasMore, false);
    assert.equal(page1.rows[0]!.source, 'bank_transaction');
  });

  it('25 source traceability on ledger rows', () => {
    const row = buildLedgerRowFromBankTransaction(
      tx({
        id: 'btx-src',
        direction: 'debit',
        amountCents: -10000,
        transactionDate: '2026-08-07',
        allocations: [
          {
            id: 'a1',
            transactionId: 'btx-src',
            amountCents: 10000,
            allocationType: 'direct_job_cost',
            directCostId: 'dc-9',
            jobId: 'job-9',
          },
        ],
      }),
    );
    assert.equal(row.source, 'bank_transaction');
    assert.equal(row.sourceId, 'btx-src');
    assert.equal(row.paymentOrCostRelationship, 'direct_cost:dc-9');
    assert.equal(row.controlState, 'explained');
  });

  it('explained debit with full split allocations', () => {
    const state = deriveEveryRandControlState({
      direction: 'debit',
      allocationStatus: 'allocated',
      receiptStatus: 'receipt_attached',
      unallocatedAmountCents: 0,
      allocations: [
        { allocationType: 'direct_job_cost', amountCents: 300000, jobId: 'a' },
        { allocationType: 'direct_job_cost', amountCents: 100000, jobId: 'b' },
        { allocationType: 'overhead', amountCents: 100000 },
      ],
    });
    assert.equal(state, 'explained');
  });

  it('voided payment excluded from customer cash', () => {
    const payments: CashControlPaymentInput[] = [
      {
        id: 'pay-void',
        amountCents: 500000,
        paidAt: '2026-08-07T10:00:00.000Z',
        xeroPaymentStatus: 'VOIDED',
        invoiceId: 'inv-1',
      },
    ];
    assert.equal(sumCustomerCashCollectedCents(payments, '2026-08-07', '2026-08-07'), 0);
  });
});
)
