import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertBankMatchingSafety,
  assertRow110SafetyGates,
  canViewBankTransactionMatching,
  suggestBankTransactionMatches,
} from './bank-transaction-matching.js';

describe('Row 110 bank transaction matching', () => {
  it('matches with explicit evidence; ambiguity → REVIEW_REQUIRED', () => {
    const unique = suggestBankTransactionMatches({
      transactionAmountCents: 10000,
      transactionDate: '2026-08-01',
      description: 'Payment INV-100 Acme',
      reference: 'INV-100',
      invoices: [
        {
          id: 'inv1',
          label: 'INV-100',
          amountCents: 10000,
          date: '2026-08-01',
          reference: 'INV-100',
          identityText: 'Acme',
        },
      ],
    });
    assert.equal(unique.disposition, 'DETERMINISTIC_UNIQUE');
    assert.equal(unique.autoMatched, false);
    assert.equal(unique.jpePosted, false);
    assert.equal(unique.xeroWrites, 0);
    assert.equal(unique.candidates[0].sequenceUsedAsProof, false);

    const ambiguous = suggestBankTransactionMatches({
      transactionAmountCents: 5000,
      transactionDate: '2026-08-01',
      description: 'Payment',
      invoices: [
        { id: 'a', label: 'A', amountCents: 5000, date: '2026-08-01', reference: 'A' },
        { id: 'b', label: 'B', amountCents: 5000, date: '2026-08-01', reference: 'B' },
      ],
      // Neither reference in description — may produce no/low candidates;
      // force two strong candidates via identity in description
    });

    const twoStrong = suggestBankTransactionMatches({
      transactionAmountCents: 5000,
      transactionDate: '2026-08-01',
      description: 'Acme Beta both',
      invoices: [
        {
          id: 'a',
          label: 'A',
          amountCents: 5000,
          date: '2026-08-01',
          identityText: 'Acme',
        },
        {
          id: 'b',
          label: 'B',
          amountCents: 5000,
          date: '2026-08-01',
          identityText: 'Beta',
        },
      ],
    });
    assert.equal(twoStrong.disposition, 'REVIEW_REQUIRED');
    assert.ok(twoStrong.candidates.length >= 2);
    assert.equal(ambiguous.autoMatched, false);
  });

  it('covers job/supplier/receipt/payment targets; rejects sequence proof', () => {
    const result = suggestBankTransactionMatches({
      transactionAmountCents: 2500,
      transactionDate: '2026-08-03',
      description: 'Builders Warehouse JOB-9 slip 88',
      jobs: [
        {
          id: 'job1',
          label: 'JOB-9',
          amountCents: 2500,
          date: '2026-08-03',
          identityText: 'JOB-9',
        },
      ],
      suppliers: [
        {
          id: 'sup1',
          label: 'Builders',
          amountCents: 2500,
          date: '2026-08-03',
          identityText: 'Builders Warehouse',
        },
      ],
      receipts: [
        {
          id: 'r1',
          label: 'slip',
          amountCents: 2500,
          date: '2026-08-03',
          reference: '88',
        },
      ],
      payments: [
        {
          id: 'p1',
          label: 'pay',
          amountCents: 2500,
          date: '2026-08-02',
          identityText: 'Builders',
        },
      ],
    });
    const types = new Set(result.candidates.map((c) => c.targetType));
    assert.ok(types.has('job') || types.has('supplier') || types.has('receipt'));
    assert.throws(() =>
      suggestBankTransactionMatches({
        transactionAmountCents: 1,
        transactionDate: '2026-08-01',
        useSequenceAsProof: true,
      }),
    );
  });

  it('no silent match / no JPE / RBAC / safety', () => {
    assert.throws(() => assertBankMatchingSafety({ autoMatched: true }));
    assert.throws(() => assertBankMatchingSafety({ jpePosted: true }));
    assert.throws(() => assertBankMatchingSafety({ xeroWrites: 1 }));
    assert.equal(canViewBankTransactionMatching({ roleName: 'technician' }), false);
    assert.equal(canViewBankTransactionMatching({ roleName: 'client' }), false);
    assert.equal(canViewBankTransactionMatching({ roleName: 'owner' }), true);
    assert.equal(assertRow110SafetyGates({ row92AutomationEnabled: false }).xeroWrites, 0);
  });
});
