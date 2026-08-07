/**
 * BANK-002 — Receipt reconciliation shared logic tests.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildReceiptMatchFingerprint,
  canAutoLinkReceiptMatch,
  canManageReceiptReconciliation,
  canTechnicianUploadJobReceipt,
  canViewReceiptReconciliation,
  deriveBankReceiptStatus,
  detectPossibleDuplicateReceipt,
  isDeterministicReceiptTransactionMatch,
  isReceiptRequiredForBankTransaction,
  normaliseSupplierAlias,
  resolveReceiptTaxFromMetadata,
  shouldEmitBankReceiptMissingFlag,
  suggestReceiptTransactionMatches,
  suggestSupplierWithAliases,
  sumActiveReceiptLinks,
} from './finance-receipt-reconciliation.js';

describe('BANK-002 receipt status', () => {
  it('1 attach receipt to transaction — status becomes attached', () => {
    const status = deriveBankReceiptStatus({
      direction: 'debit',
      category: 'fuel',
      linkedReceiptCount: 1,
      transactionAmountCents: 285000,
      receiptTotalCents: 285000,
    });
    assert.equal(status, 'receipt_attached');
  });

  it('3 missing receipt flagged', () => {
    const status = deriveBankReceiptStatus({
      direction: 'debit',
      category: 'fuel',
      linkedReceiptCount: 0,
    });
    assert.equal(status, 'receipt_missing');
    assert.equal(shouldEmitBankReceiptMissingFlag(status), true);
  });

  it('4 attached receipt resolves missing flag', () => {
    const before = deriveBankReceiptStatus({ direction: 'debit', category: 'fuel', linkedReceiptCount: 0 });
    const after = deriveBankReceiptStatus({
      direction: 'debit',
      category: 'fuel',
      linkedReceiptCount: 1,
      receiptDocumentId: 'doc-1',
    });
    assert.equal(before, 'receipt_missing');
    assert.equal(after, 'receipt_attached');
    assert.equal(shouldEmitBankReceiptMissingFlag(after), false);
  });

  it('5 attached != verified', () => {
    const attached = deriveBankReceiptStatus({
      direction: 'debit',
      category: 'fuel',
      linkedReceiptCount: 1,
      verifiedReceiptCount: 0,
    });
    const verified = deriveBankReceiptStatus({
      direction: 'debit',
      category: 'fuel',
      linkedReceiptCount: 1,
      verifiedReceiptCount: 1,
      verificationStatus: 'verified',
    });
    assert.equal(attached, 'receipt_attached');
    assert.equal(verified, 'receipt_verified');
  });

  it('6 owner verifies receipt', () => {
    const status = deriveBankReceiptStatus({
      direction: 'debit',
      category: 'supplier',
      linkedReceiptCount: 1,
      verifiedReceiptCount: 1,
      verificationStatus: 'verified',
    });
    assert.equal(status, 'receipt_verified');
  });

  it('13 transaction amount vs receipt mismatch → review', () => {
    const status = deriveBankReceiptStatus({
      direction: 'debit',
      category: 'fuel',
      linkedReceiptCount: 1,
      transactionAmountCents: 150000,
      receiptTotalCents: 80000,
    });
    assert.equal(status, 'receipt_needs_review');
  });

  it('21 receipt removal restores warning', () => {
    const afterRemoval = deriveBankReceiptStatus({
      direction: 'debit',
      category: 'fuel',
      linkedReceiptCount: 0,
    });
    assert.equal(afterRemoval, 'receipt_missing');
  });
});

describe('BANK-002 RBAC', () => {
  it('7 technician upload allowed where permitted', () => {
    assert.equal(canTechnicianUploadJobReceipt({ roleName: 'Technician', permissions: [] }), true);
  });

  it('8 technician bank access blocked', () => {
    const tech = { roleName: 'Technician', permissions: [] as string[] };
    assert.equal(canViewReceiptReconciliation(tech), false);
    assert.equal(canManageReceiptReconciliation(tech), false);
  });

  it('owner finance access permitted', () => {
    const owner = { roleName: 'Company Owner', permissions: ['*'] };
    assert.equal(canManageReceiptReconciliation(owner), true);
  });
});

describe('BANK-002 supplier alias suggestion', () => {
  it('9 supplier alias suggestion', () => {
    const suggestion = suggestSupplierWithAliases({
      description: 'BUILDERS WH 004521 CPT',
      suppliers: [{ id: 'sup-1', name: 'Builders Warehouse' }],
      aliases: [
        {
          supplierId: 'sup-1',
          aliasText: 'BUILDERS WH',
          normalisedAlias: normaliseSupplierAlias('BUILDERS WH'),
          isEnabled: true,
        },
      ],
    });
    assert.ok(suggestion);
    assert.equal(suggestion!.supplierId, 'sup-1');
    assert.equal(suggestion!.confidence, 'high');
  });

  it('10 alias does not auto-write without approval — suggestion only', () => {
    const suggestion = suggestSupplierWithAliases({
      description: 'RANDOM MERCHANT',
      suppliers: [{ id: 'sup-1', name: 'Builders Warehouse' }],
      aliases: [],
    });
    assert.equal(suggestion, null);
  });
});

describe('BANK-002 matching policy', () => {
  it('18 stale candidate fingerprint changes when transaction updates', () => {
    const fp1 = buildReceiptMatchFingerprint({
      receiptId: 'r-1',
      bankTransactionId: 'tx-1',
      receiptUpdatedAt: '2026-01-01T00:00:00.000Z',
      transactionUpdatedAt: '2026-01-01T00:00:00.000Z',
      transactionAllocatedAmountCents: 0,
      transactionReceiptStatus: 'receipt_missing',
    });
    const fp2 = buildReceiptMatchFingerprint({
      receiptId: 'r-1',
      bankTransactionId: 'tx-1',
      receiptUpdatedAt: '2026-01-01T00:00:00.000Z',
      transactionUpdatedAt: '2026-01-02T00:00:00.000Z',
      transactionAllocatedAmountCents: 285000,
      transactionReceiptStatus: 'receipt_verified',
    });
    assert.notEqual(fp1, fp2);
  });

  it('deterministic auto-link only from known bank transaction', () => {
    assert.equal(
      isDeterministicReceiptTransactionMatch({
        createdFromBankTransactionId: 'tx-1',
        targetBankTransactionId: 'tx-1',
      }),
      true,
    );
    assert.equal(
      canAutoLinkReceiptMatch({ linkMethod: 'deterministic', deterministic: true }),
      true,
    );
    assert.equal(
      canAutoLinkReceiptMatch({ linkMethod: 'manual', deterministic: false }),
      false,
    );
  });

  it('never auto-match amount/date/supplier alone — requires multi-signal threshold', () => {
    const amountOnly = suggestReceiptTransactionMatches({
      receipt: {
        id: 'r-1',
        totalAmountCents: 285000,
        documentDate: null,
        supplierId: 'sup-1',
        receiptNumber: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      transactions: [
        {
          id: 'tx-1',
          transactionDate: '2026-02-01',
          amountCents: 285000,
          direction: 'debit',
          description: 'OTHER MERCHANT',
          reference: null,
          merchantName: null,
          confirmedSupplierId: null,
          allocatedAmountCents: 0,
          receiptStatus: 'receipt_missing',
          updatedAt: '2026-01-01T00:00:00.000Z',
          hasActiveReceiptLink: false,
        },
      ],
    });
    assert.equal(amountOnly.length, 0);
  });
});

describe('BANK-002 multi-receipt reconciliation', () => {
  it('14 multiple receipts reconcile one transaction', () => {
    const total = sumActiveReceiptLinks([
      { amountCents: 80000, isActive: true },
      { amountCents: 70000, isActive: true },
    ]);
    assert.equal(total, 150000);
    const status = deriveBankReceiptStatus({
      direction: 'debit',
      category: 'supplier',
      linkedReceiptCount: 2,
      transactionAmountCents: 150000,
      receiptTotalCents: total,
    });
    assert.equal(status, 'receipt_attached');
  });
});

describe('BANK-002 duplicate detection', () => {
  it('2 same receipt not duplicated silently — flag possible duplicate', () => {
    const dup = detectPossibleDuplicateReceipt({
      fileChecksumSha256: 'abc123',
      existing: [{ id: 'r-0', fileChecksumSha256: 'abc123', receiptNumber: null, supplierId: null, documentDate: null, totalAmountCents: null }],
    });
    assert.ok(dup);
    assert.equal(dup!.duplicateFlag, 'POSSIBLE_DUPLICATE_RECEIPT');
  });
});

describe('BANK-002 tax basis from receipt metadata', () => {
  it('12 receipt resolves tax-basis confidence', () => {
    const resolved = resolveReceiptTaxFromMetadata({
      totalAmountCents: 11500,
      vatAmountCents: 1500,
      exclusiveTotalCents: 10000,
    });
    assert.equal(resolved.taxBasis, 'exclusive');
    assert.equal(resolved.economicExVatCents, 10000);
  });
});

describe('BANK-002 receipt requirement rules', () => {
  it('bank fee does not require receipt', () => {
    assert.equal(
      isReceiptRequiredForBankTransaction({ direction: 'debit', category: 'bank_fee' }),
      false,
    );
  });

  it('fuel requires receipt', () => {
    assert.equal(
      isReceiptRequiredForBankTransaction({ direction: 'debit', category: 'fuel' }),
      true,
    );
  });
});

describe('BANK-002 cent precision', () => {
  it('23 cent precision preserved in link sums', () => {
    assert.equal(sumActiveReceiptLinks([{ amountCents: 285000 }]), 285000);
  });
});
