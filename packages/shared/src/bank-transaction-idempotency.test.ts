import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { buildBankTransactionFingerprintCanonical } from './bank-transaction-control.js';
import {
  assertRow112SafetyGates,
  bankSourceIdempotencyKey,
  buildCorrectionRecord,
  buildReversalRecord,
  decideBankImportIdempotency,
} from './bank-transaction-idempotency.js';

function fp(external?: string) {
  return {
    companyId: 'co',
    bankAccountId: 'acc',
    provider: 'manual_import',
    externalTransactionId: external ?? null,
    transactionDate: '2026-08-01',
    amountCents: 1000,
    direction: 'debit' as const,
    reference: 'R1',
    description: 'Desc',
  };
}

describe('Row 112 bank idempotency / corrections / reversals', () => {
  it('same transaction retry → no duplicate', () => {
    const input = fp('ext-1');
    const fingerprint = buildBankTransactionFingerprintCanonical(input);
    const first = decideBankImportIdempotency({
      fingerprintInput: input,
      existingFingerprints: [],
      existingIdempotencyKeys: [],
    });
    assert.equal(first.action, 'INSERT');
    const retry = decideBankImportIdempotency({
      fingerprintInput: input,
      existingFingerprints: [fingerprint],
      existingIdempotencyKeys: [],
    });
    assert.equal(retry.action, 'SKIP_DUPLICATE');
    assert.equal(retry.reason, 'SAME_TRANSACTION_RETRY');
  });

  it('same statement retry → no duplicate', () => {
    const hash = createHash('sha256').update('statement.csv').digest('hex');
    const input = fp();
    const fingerprint = buildBankTransactionFingerprintCanonical(input);
    const key = bankSourceIdempotencyKey({
      companyId: 'co',
      bankAccountId: 'acc',
      provider: 'manual_import',
      sourceFingerprint: fingerprint,
      statementFileHash: hash,
      statementRowIndex: 0,
    });
    const retry = decideBankImportIdempotency({
      fingerprintInput: input,
      existingFingerprints: [],
      existingIdempotencyKeys: [key],
      statementFileHash: hash,
      statementRowIndex: 0,
    });
    assert.equal(retry.action, 'SKIP_DUPLICATE');
    assert.equal(retry.reason, 'SAME_STATEMENT_RETRY');
  });

  it('correction preserves history; reversal links; no silent overwrite; audit', () => {
    const decision = decideBankImportIdempotency({
      fingerprintInput: fp('ext-2'),
      existingFingerprints: [],
      existingIdempotencyKeys: [],
      correctionOfTransactionId: 'tx-old',
    });
    assert.equal(decision.action, 'CORRECT');
    if (decision.action === 'CORRECT') {
      assert.equal(decision.supersedesTransactionId, 'tx-old');
    }

    const correction = buildCorrectionRecord({
      originalTransactionId: 'tx-old',
      correctedTransactionId: 'tx-new',
      original: { amountCents: 1000, description: 'A' },
      corrected: { amountCents: 1200, description: 'A' },
    });
    assert.equal(correction.preservedOriginal, true);
    assert.equal(correction.silentOverwrite, false);
    assert.deepEqual(correction.changedFields, ['amountCents']);
    assert.equal(correction.auditAction, 'bank_transaction.corrected');
    assert.throws(() =>
      buildCorrectionRecord({
        originalTransactionId: 'same',
        correctedTransactionId: 'same',
        original: {},
        corrected: {},
      }),
    );

    const revDecision = decideBankImportIdempotency({
      fingerprintInput: fp('ext-3'),
      existingFingerprints: [],
      existingIdempotencyKeys: [],
      reversalOfTransactionId: 'tx-orig',
    });
    assert.equal(revDecision.action, 'REVERSE');
    const reversal = buildReversalRecord({
      originalTransactionId: 'tx-orig',
      reversalTransactionId: 'tx-rev',
    });
    assert.equal(reversal.relationship, 'REVERSAL_OF');
    assert.equal(reversal.preservedOriginal, true);

    assert.throws(() =>
      decideBankImportIdempotency({
        fingerprintInput: fp(),
        existingFingerprints: [],
        existingIdempotencyKeys: [],
        silentOverwrite: true,
      }),
    );
    assert.equal(assertRow112SafetyGates({ row92AutomationEnabled: false }).silentOverwrite, false);
  });
});
