/**
 * Row 112 — Idempotency / corrections / reversals
 *
 * Repeated import/sync must be duplicate-safe.
 * Corrections preserve history. Reversals keep original + reversal link.
 * No silent historical overwrite. Audit retained.
 */

import {
  buildBankTransactionFingerprintCanonical,
  type BankTransactionFingerprintInput,
} from './bank-transaction-control.js';
import { shouldCreateCanonicalTransaction } from './bank-transaction-truth.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';

export const BANK_TRANSACTION_IDEMPOTENCY_KEY = 'bank-transaction-idempotency' as const;

export type BankIdempotencyDecision =
  | { action: 'INSERT'; reason: 'NEW_SOURCE' }
  | { action: 'SKIP_DUPLICATE'; reason: 'SAME_TRANSACTION_RETRY' | 'SAME_STATEMENT_RETRY' }
  | { action: 'CORRECT'; reason: 'CORRECTED_SOURCE'; supersedesTransactionId: string }
  | { action: 'REVERSE'; reason: 'REVERSAL'; originalTransactionId: string };

export function bankSourceIdempotencyKey(parts: {
  companyId: string;
  bankAccountId: string;
  provider: string;
  externalTransactionId?: string | null;
  sourceFingerprint: string;
  statementFileHash?: string | null;
  statementRowIndex?: number | null;
}): string {
  if (parts.externalTransactionId?.trim()) {
    return [
      parts.companyId,
      parts.bankAccountId,
      parts.provider,
      parts.externalTransactionId.trim(),
    ].join('|');
  }
  if (parts.statementFileHash != null && parts.statementRowIndex != null) {
    return [
      parts.companyId,
      parts.bankAccountId,
      'statement',
      parts.statementFileHash,
      String(parts.statementRowIndex),
    ].join('|');
  }
  return [parts.companyId, parts.bankAccountId, parts.sourceFingerprint].join('|');
}

export function decideBankImportIdempotency(input: {
  fingerprintInput: BankTransactionFingerprintInput;
  existingFingerprints: ReadonlyArray<string>;
  existingIdempotencyKeys: ReadonlyArray<string>;
  statementFileHash?: string | null;
  statementRowIndex?: number | null;
  /** Prior import of same statement file hash. */
  statementAlreadyImported?: boolean;
  /** Corrected source payload for an existing canonical id. */
  correctionOfTransactionId?: string | null;
  /** Explicit reversal of an existing canonical id. */
  reversalOfTransactionId?: string | null;
  silentOverwrite?: boolean;
}): BankIdempotencyDecision {
  if (input.silentOverwrite === true) {
    throw new Error('Silent historical overwrite is forbidden');
  }

  if (input.reversalOfTransactionId) {
    return {
      action: 'REVERSE',
      reason: 'REVERSAL',
      originalTransactionId: input.reversalOfTransactionId,
    };
  }

  if (input.correctionOfTransactionId) {
    return {
      action: 'CORRECT',
      reason: 'CORRECTED_SOURCE',
      supersedesTransactionId: input.correctionOfTransactionId,
    };
  }

  const fingerprint = buildBankTransactionFingerprintCanonical(input.fingerprintInput);
  const create = shouldCreateCanonicalTransaction({
    existingFingerprints: input.existingFingerprints,
    candidateFingerprint: fingerprint,
  });
  if (!create.create) {
    return { action: 'SKIP_DUPLICATE', reason: 'SAME_TRANSACTION_RETRY' };
  }

  const idemKey = bankSourceIdempotencyKey({
    companyId: input.fingerprintInput.companyId,
    bankAccountId: input.fingerprintInput.bankAccountId,
    provider: input.fingerprintInput.provider,
    externalTransactionId: input.fingerprintInput.externalTransactionId,
    sourceFingerprint: fingerprint,
    statementFileHash: input.statementFileHash,
    statementRowIndex: input.statementRowIndex,
  });
  if (input.existingIdempotencyKeys.includes(idemKey) || input.statementAlreadyImported === true) {
    return { action: 'SKIP_DUPLICATE', reason: 'SAME_STATEMENT_RETRY' };
  }

  return { action: 'INSERT', reason: 'NEW_SOURCE' };
}

export type BankTransactionCorrectionRecord = {
  originalTransactionId: string;
  correctedTransactionId: string;
  preservedOriginal: true;
  silentOverwrite: false;
  auditAction: 'bank_transaction.corrected';
  changedFields: string[];
};

export function buildCorrectionRecord(input: {
  originalTransactionId: string;
  correctedTransactionId: string;
  original: Record<string, unknown>;
  corrected: Record<string, unknown>;
}): BankTransactionCorrectionRecord {
  if (input.originalTransactionId === input.correctedTransactionId) {
    throw new Error('Correction must create a new version row — no silent overwrite');
  }
  const changedFields = Object.keys(input.corrected).filter(
    (k) => JSON.stringify(input.original[k]) !== JSON.stringify(input.corrected[k]),
  );
  return {
    originalTransactionId: input.originalTransactionId,
    correctedTransactionId: input.correctedTransactionId,
    preservedOriginal: true,
    silentOverwrite: false,
    auditAction: 'bank_transaction.corrected',
    changedFields,
  };
}

export type BankTransactionReversalRecord = {
  originalTransactionId: string;
  reversalTransactionId: string;
  relationship: 'REVERSAL_OF';
  preservedOriginal: true;
  auditAction: 'bank_transaction.reversed';
};

export function buildReversalRecord(input: {
  originalTransactionId: string;
  reversalTransactionId: string;
}): BankTransactionReversalRecord {
  if (input.originalTransactionId === input.reversalTransactionId) {
    throw new Error('Reversal must be a distinct transaction');
  }
  return {
    originalTransactionId: input.originalTransactionId,
    reversalTransactionId: input.reversalTransactionId,
    relationship: 'REVERSAL_OF',
    preservedOriginal: true,
    auditAction: 'bank_transaction.reversed',
  };
}

export function assertRow112SafetyGates(input: {
  row92AutomationEnabled: boolean;
  row114PlusStarted?: boolean;
  xeroWrites?: number;
  moneyMovement?: number;
  silentOverwrite?: boolean;
}): { row92Off: true; xeroWrites: 0; moneyMovement: 0; silentOverwrite: false } {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  if (input.row114PlusStarted === true) throw new Error('Rows 114+ must not start during Row 112');
  if (input.silentOverwrite === true) throw new Error('Silent overwrite forbidden');
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 112 requires Xero writes = 0');
  if ((input.moneyMovement ?? 0) !== 0) throw new Error('Row 112 requires money movement = 0');
  return { row92Off: true, xeroWrites: 0, moneyMovement: 0, silentOverwrite: false };
}
