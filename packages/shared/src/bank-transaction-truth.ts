/**
 * Row 109 — Canonical bank transaction truth
 *
 * Preserves legitimate source evidence only.
 * Never invents balances. Never stores banking credentials.
 * Duplicate source identity must not create duplicate canonical rows.
 * Staging: Xero writes = 0; money movement = 0.
 */

import {
  absoluteBankTransactionAmountCents,
  buildBankTransactionFingerprintCanonical,
  deriveBankTransactionDirection,
  type BankTransactionDirection,
} from './bank-transaction-control.js';
import {
  assertNoForbiddenBankCredentials,
  maskBankAccountIdentity,
} from './bank-feed-foundation.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';

export const BANK_TRANSACTION_TRUTH_KEY = 'bank-transaction-truth' as const;

export type CanonicalBankTransactionTruth = {
  companyId: string;
  bankAccountId: string;
  maskedAccountIdentity: string | null;
  importBatchId: string | null;
  importRowId: string | null;
  sourceFileHash: string | null;
  provider: string;
  externalTransactionId: string | null;
  transactionDate: string;
  postedDate: string | null;
  reference: string | null;
  description: string | null;
  /** Exact signed amount: credits positive, debits negative. */
  signedAmountCents: number;
  amountCents: number;
  direction: BankTransactionDirection;
  currency: string;
  /** Bank-provided balance ONLY when present — never invented. */
  bankProvidedBalanceCents: number | null;
  balanceInvented: false;
  sourceFingerprint: string;
  originalRawProvenance: Record<string, unknown>;
};

export type CanonicalTruthSourceInput = {
  companyId: string;
  bankAccountId: string;
  accountNumber?: string | null;
  accountCode?: string | null;
  accountName?: string | null;
  importBatchId?: string | null;
  importRowId?: string | null;
  sourceFileHash?: string | null;
  provider: string;
  externalTransactionId?: string | null;
  transactionDate: string;
  postedDate?: string | null;
  reference?: string | null;
  description?: string | null;
  /** Signed or absolute; direction derived when signed, or provided. */
  amountCents: number;
  direction?: BankTransactionDirection | null;
  currency?: string | null;
  /** Only pass when the bank/statement actually provided a balance. */
  bankProvidedBalanceCents?: number | null;
  inventBalance?: boolean;
  rawProvenance?: Record<string, unknown> | null;
};

export function signedBankAmountCents(
  amountCents: number,
  direction?: BankTransactionDirection | null,
): { signedAmountCents: number; amountCents: number; direction: BankTransactionDirection } {
  const dir = direction ?? deriveBankTransactionDirection(amountCents);
  const abs = absoluteBankTransactionAmountCents(amountCents);
  return {
    signedAmountCents: dir === 'debit' ? -abs : abs,
    amountCents: abs,
    direction: dir,
  };
}

/**
 * Build canonical truth from source evidence.
 * Missing source fields stay null/missing — never fabricated.
 */
export function buildCanonicalBankTransactionTruth(
  input: CanonicalTruthSourceInput,
): CanonicalBankTransactionTruth {
  assertNoForbiddenBankCredentials(input);
  if (input.inventBalance === true) {
    throw new Error('Row 109 must never invent a bank balance');
  }

  const amounts = signedBankAmountCents(input.amountCents, input.direction);
  const fingerprint = buildBankTransactionFingerprintCanonical({
    companyId: input.companyId,
    bankAccountId: input.bankAccountId,
    provider: input.provider,
    externalTransactionId: input.externalTransactionId,
    transactionDate: input.transactionDate,
    amountCents: amounts.amountCents,
    direction: amounts.direction,
    reference: input.reference,
    description: input.description,
  });

  const balance =
    input.bankProvidedBalanceCents === undefined || input.bankProvidedBalanceCents === null
      ? null
      : input.bankProvidedBalanceCents;

  return {
    companyId: input.companyId,
    bankAccountId: input.bankAccountId,
    maskedAccountIdentity: maskBankAccountIdentity({
      accountNumber: input.accountNumber,
      accountCode: input.accountCode,
      name: input.accountName,
    }),
    importBatchId: input.importBatchId ?? null,
    importRowId: input.importRowId ?? null,
    sourceFileHash: input.sourceFileHash ?? null,
    provider: input.provider,
    externalTransactionId: input.externalTransactionId?.trim() || null,
    transactionDate: input.transactionDate,
    postedDate: input.postedDate ?? null,
    reference: input.reference ?? null,
    description: input.description ?? null,
    signedAmountCents: amounts.signedAmountCents,
    amountCents: amounts.amountCents,
    direction: amounts.direction,
    currency: input.currency ?? 'ZAR',
    bankProvidedBalanceCents: balance,
    balanceInvented: false,
    sourceFingerprint: fingerprint,
    originalRawProvenance: {
      ...(input.rawProvenance ?? {}),
      sourceFileHash: input.sourceFileHash ?? null,
      importBatchId: input.importBatchId ?? null,
      importRowId: input.importRowId ?? null,
      externalTransactionId: input.externalTransactionId ?? null,
    },
  };
}

/** Same source identity → do not create a second canonical transaction. */
export function shouldCreateCanonicalTransaction(input: {
  existingFingerprints: ReadonlySet<string> | ReadonlyArray<string>;
  candidateFingerprint: string;
}): { create: boolean; reason: 'NEW' | 'DUPLICATE_SOURCE_IDENTITY' } {
  const set =
    input.existingFingerprints instanceof Set
      ? input.existingFingerprints
      : new Set(input.existingFingerprints);
  if (set.has(input.candidateFingerprint)) {
    return { create: false, reason: 'DUPLICATE_SOURCE_IDENTITY' };
  }
  return { create: true, reason: 'NEW' };
}

export function canViewBankTransactionTruth(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role === 'client' || role.includes('tech')) return false;
  const perms = input.permissions ?? [];
  if (perms.includes('*') || perms.includes('finance:read') || perms.includes('finance:write')) {
    return true;
  }
  return ['owner', 'company owner', 'admin', 'manager', 'office'].includes(role);
}

export function canManageBankTransactionTruth(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role === 'client' || role.includes('tech')) return false;
  const perms = input.permissions ?? [];
  if (perms.includes('*') || perms.includes('finance:write')) return true;
  return ['owner', 'company owner', 'admin'].includes(role);
}

export function assertNoBankTransactionTruthClientLeak(payload: unknown, path = 'root'): void {
  if (payload == null || typeof payload !== 'object') return;
  if (Array.isArray(payload)) {
    payload.forEach((item, i) => assertNoBankTransactionTruthClientLeak(item, `${path}[${i}]`));
    return;
  }
  const obj = payload as Record<string, unknown>;
  const forbidden = [
    'username',
    'password',
    'pin',
    'otp',
    'cvv',
    'fullAccountNumber',
    'bankTransactionTruthInternal',
    'serverTokenReference',
  ];
  for (const key of forbidden) {
    if (key in obj && obj[key] != null) {
      throw new Error(`Bank transaction truth leak at ${path}.${key}`);
    }
  }
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') assertNoBankTransactionTruthClientLeak(v, `${path}.${k}`);
  }
}

export function assertRow109SafetyGates(input: {
  row92AutomationEnabled: boolean;
  row114PlusStarted?: boolean;
  xeroWrites?: number;
  moneyMovement?: number;
}): {
  row92Off: true;
  row114PlusNotStarted: true;
  xeroWrites: 0;
  moneyMovement: 0;
} {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  if (input.row114PlusStarted === true) throw new Error('Rows 114+ must not start during Row 109');
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 109 requires Xero writes = 0');
  if ((input.moneyMovement ?? 0) !== 0) throw new Error('Row 109 requires money movement = 0');
  return {
    row92Off: true,
    row114PlusNotStarted: true,
    xeroWrites: 0,
    moneyMovement: 0,
  };
}

export function redactBankTransactionTruthForClient<T extends Record<string, unknown>>(row: T): T {
  const copy = { ...row };
  delete copy.username;
  delete copy.password;
  delete copy.pin;
  delete copy.otp;
  delete copy.cvv;
  delete copy.fullAccountNumber;
  delete copy.serverTokenReference;
  return copy;
}
