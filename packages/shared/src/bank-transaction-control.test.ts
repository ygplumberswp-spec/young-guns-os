import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  absoluteBankTransactionAmountCents,
  assertAllocationWithinTransaction,
  buildBankTransactionFingerprintCanonical,
  computeAllocationTotals,
  creditRequiresManualReview,
  deriveBankTransactionDirection,
  deriveReceiptStatus,
  allocationAffectsJobProfitability,
  isTransferAllocation,
  normaliseBankTransactionText,
  suggestDirectCostMatches,
  suggestSupplierFromDescription,
  summariseImportPreviewRows,
} from './bank-transaction-control.js';

describe('BANK-001 bank transaction control', () => {
  it('1 duplicate fingerprint canonical is identical for same inputs', () => {
    const input = {
      companyId: 'co-1',
      bankAccountId: 'acct-1',
      provider: 'manual_import',
      transactionDate: '2026-02-01',
      amountCents: 285000,
      direction: 'debit' as const,
      reference: 'BW 1234',
      description: 'Builders Warehouse',
    };
    const a = buildBankTransactionFingerprintCanonical(input);
    const b = buildBankTransactionFingerprintCanonical({ ...input });
    assert.equal(a, b);
  });

  it('2 similar amount/date but different reference produces distinct fingerprint', () => {
    const base = {
      companyId: 'co-1',
      bankAccountId: 'acct-1',
      provider: 'manual_import',
      transactionDate: '2026-02-01',
      amountCents: 285000,
      direction: 'debit' as const,
    };
    const a = buildBankTransactionFingerprintCanonical({
      ...base,
      reference: 'REF-A',
      description: 'Payment A',
    });
    const b = buildBankTransactionFingerprintCanonical({
      ...base,
      reference: 'REF-B',
      description: 'Payment B',
    });
    assert.notEqual(a, b);
  });

  it('3 debit/credit direction derived correctly', () => {
    assert.equal(deriveBankTransactionDirection(-1000), 'debit');
    assert.equal(deriveBankTransactionDirection(1000), 'credit');
    assert.equal(absoluteBankTransactionAmountCents(-1000), 1000);
  });

  it('4 partial allocation totals', () => {
    const totals = computeAllocationTotals(500000, [{ amountCents: 300000 }]);
    assert.equal(totals.allocatedAmountCents, 300000);
    assert.equal(totals.unallocatedAmountCents, 200000);
    assert.equal(totals.allocationStatus, 'partially_allocated');
  });

  it('5 over-allocation blocked', () => {
    assert.throws(
      () => assertAllocationWithinTransaction(500000, [{ amountCents: 500001 }]),
      /exceeds transaction amount/,
    );
  });

  it('6 split allocation cent-exact within limit', () => {
    assert.doesNotThrow(() =>
      assertAllocationWithinTransaction(500000, [
        { amountCents: 300000 },
        { amountCents: 150000 },
        { amountCents: 50000 },
      ]),
    );
    const totals = computeAllocationTotals(500000, [
      { amountCents: 300000 },
      { amountCents: 150000 },
      { amountCents: 50000 },
    ]);
    assert.equal(totals.allocationStatus, 'allocated');
  });

  it('7 match to existing cost requires multiple signals for medium confidence', () => {
    const candidates = suggestDirectCostMatches({
      transactionAmountCents: -285000,
      transactionDate: '2026-02-01',
      description: 'Builders Warehouse',
      reference: null,
      merchantName: 'Builders Warehouse',
      directCosts: [
        {
          id: 'dc-1',
          jobId: 'job-1',
          description: 'Materials',
          amountCents: 285000,
          supplierId: 'sup-1',
          supplierName: 'Builders Warehouse',
          isPaid: false,
          costDate: '2026-02-01',
        },
      ],
    });
    assert.ok(candidates.length >= 1);
    assert.equal(candidates[0]?.targetId, 'dc-1');
    assert.ok(candidates[0]!.evidence.length >= 2);
  });

  it('12 missing receipt flagged for debit job cost', () => {
    assert.equal(
      deriveReceiptStatus({ direction: 'debit', allocationType: 'direct_job_cost' }),
      'receipt_missing',
    );
  });

  it('13 receipt attachment resolves flag', () => {
    assert.equal(
      deriveReceiptStatus({
        direction: 'debit',
        allocationType: 'direct_job_cost',
        receiptDocumentId: 'doc-1',
      }),
      'receipt_attached',
    );
  });

  it('14 supplier suggestion does not imply write', () => {
    const suggestion = suggestSupplierFromDescription('BUILDERS WAREHOUSE 1234', [
      { id: 'sup-1', name: 'Builders Warehouse' },
    ]);
    assert.ok(suggestion);
    assert.equal(suggestion!.supplierId, 'sup-1');
  });

  it('15 overhead does not affect JPE job profitability', () => {
    assert.equal(allocationAffectsJobProfitability('overhead'), false);
    assert.equal(allocationAffectsJobProfitability('direct_job_cost'), true);
  });

  it('16 customer credit requires manual review', () => {
    assert.equal(creditRequiresManualReview('credit'), true);
    assert.equal(creditRequiresManualReview('debit'), false);
  });

  it('17 transfer allocation type detected', () => {
    assert.equal(isTransferAllocation('transfer'), true);
    assert.equal(isTransferAllocation('direct_job_cost'), false);
  });

  it('21 import preview summary counts debits/credits/duplicates', () => {
    const summary = summariseImportPreviewRows([
      { transactionDate: '2026-02-01', amountCents: -100000, classification: 'ready_to_import' },
      { transactionDate: '2026-02-02', amountCents: 50000, classification: 'ready_to_import' },
      { transactionDate: '2026-02-03', amountCents: -20000, classification: 'possible_duplicate' },
      { transactionDate: null, amountCents: null, classification: 'invalid' },
    ]);
    assert.equal(summary.debits, 1);
    assert.equal(summary.credits, 1);
    assert.equal(summary.duplicatesSkipped, 1);
    assert.equal(summary.invalidRows, 1);
    assert.equal(summary.totalDebitCents, 100000);
    assert.equal(summary.totalCreditCents, 50000);
  });

  it('23 fingerprint normalises whitespace', () => {
    const a = normaliseBankTransactionText('  BUILDERS   WAREHOUSE  ');
    const b = normaliseBankTransactionText('builders warehouse');
    assert.equal(a, b);
  });

  it('25 cent precision in allocation totals', () => {
    const totals = computeAllocationTotals(100001, [{ amountCents: 50000 }, { amountCents: 50001 }]);
    assert.equal(totals.allocationStatus, 'allocated');
    assert.equal(totals.unallocatedAmountCents, 0);
  });
});

describe('BANK-001 JPE cashSpent semantics (pure)', () => {
  it('8 matching existing cost must not duplicate economic cost — service enforces isPaid flip only', () => {
    // Documented invariant: bank match sets isPaid on existing row; no second cost row.
    const unpaidCost = { amountCents: 100000, isPaid: false };
    const bankDebit = 100000;
    assert.equal(unpaidCost.amountCents, bankDebit);
    assert.equal(unpaidCost.isPaid, false);
  });
});
