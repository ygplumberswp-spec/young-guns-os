import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertNoBankTransactionTruthClientLeak,
  assertRow109SafetyGates,
  buildCanonicalBankTransactionTruth,
  canManageBankTransactionTruth,
  canViewBankTransactionTruth,
  shouldCreateCanonicalTransaction,
  signedBankAmountCents,
} from './bank-transaction-truth.js';

describe('Row 109 canonical bank transaction truth', () => {
  it('preserves source evidence; signed amount; never invents balance', () => {
    const truth = buildCanonicalBankTransactionTruth({
      companyId: 'co',
      bankAccountId: 'acc',
      accountNumber: '62123456789',
      importBatchId: 'batch-1',
      importRowId: 'row-1',
      sourceFileHash: 'sha256:abc',
      provider: 'manual_import',
      externalTransactionId: 'ext-1',
      transactionDate: '2026-08-01',
      postedDate: '2026-08-02',
      reference: 'REF-9',
      description: 'Supplier XYZ',
      amountCents: -15000,
      currency: 'ZAR',
      bankProvidedBalanceCents: null,
      rawProvenance: { line: 3 },
    });

    assert.equal(truth.signedAmountCents, -15000);
    assert.equal(truth.amountCents, 15000);
    assert.equal(truth.direction, 'debit');
    assert.equal(truth.bankProvidedBalanceCents, null);
    assert.equal(truth.balanceInvented, false);
    assert.equal(truth.sourceFileHash, 'sha256:abc');
    assert.equal(truth.maskedAccountIdentity, '••••6789');
    assert.equal(truth.importBatchId, 'batch-1');
    assert.equal(truth.externalTransactionId, 'ext-1');
    assert.ok(truth.sourceFingerprint.length > 0);
    assert.equal(truth.originalRawProvenance.line, 3);

    assert.throws(() =>
      buildCanonicalBankTransactionTruth({
        companyId: 'co',
        bankAccountId: 'acc',
        provider: 'manual_import',
        transactionDate: '2026-08-01',
        amountCents: 100,
        inventBalance: true,
      }),
    );

    const credit = signedBankAmountCents(2500, 'credit');
    assert.equal(credit.signedAmountCents, 2500);
  });

  it('duplicate source identity does not create second canonical row', () => {
    const a = buildCanonicalBankTransactionTruth({
      companyId: 'co',
      bankAccountId: 'acc',
      provider: 'fnb_statement',
      externalTransactionId: 'same-ext',
      transactionDate: '2026-08-01',
      amountCents: -100,
    });
    const b = buildCanonicalBankTransactionTruth({
      companyId: 'co',
      bankAccountId: 'acc',
      provider: 'fnb_statement',
      externalTransactionId: 'same-ext',
      transactionDate: '2026-08-01',
      amountCents: -100,
    });
    assert.equal(a.sourceFingerprint, b.sourceFingerprint);
    const decision = shouldCreateCanonicalTransaction({
      existingFingerprints: [a.sourceFingerprint],
      candidateFingerprint: b.sourceFingerprint,
    });
    assert.equal(decision.create, false);
    assert.equal(decision.reason, 'DUPLICATE_SOURCE_IDENTITY');
  });

  it('rejects credentials; RBAC; safety; missing stays missing', () => {
    assert.throws(() =>
      buildCanonicalBankTransactionTruth({
        companyId: 'co',
        bankAccountId: 'acc',
        provider: 'x',
        transactionDate: '2026-08-01',
        amountCents: 1,
        rawProvenance: { password: 'secret' },
      }),
    );
    const sparse = buildCanonicalBankTransactionTruth({
      companyId: 'co',
      bankAccountId: 'acc',
      provider: 'manual_import',
      transactionDate: '2026-08-01',
      amountCents: 500,
    });
    assert.equal(sparse.postedDate, null);
    assert.equal(sparse.reference, null);
    assert.equal(sparse.bankProvidedBalanceCents, null);

    assert.equal(canViewBankTransactionTruth({ roleName: 'owner' }), true);
    assert.equal(canManageBankTransactionTruth({ roleName: 'technician' }), false);
    assert.equal(canViewBankTransactionTruth({ roleName: 'client' }), false);
    assert.throws(() => assertNoBankTransactionTruthClientLeak({ pin: '1234' }));
    assert.equal(assertRow109SafetyGates({ row92AutomationEnabled: false }).xeroWrites, 0);
  });
});
