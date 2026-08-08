/**
 * Row 114 — Statement archive + visibility
 *
 * Preserves source statement evidence. Never invents missing metadata.
 * No OCR (Row117 later). Tech/Sub Tech/Client denied.
 * Staging: Xero writes = 0; money movement = 0.
 */

import { maskBankAccountIdentity } from './bank-feed-foundation.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';

export const BANK_STATEMENT_ARCHIVE_KEY = 'bank-statement-archive' as const;

export type BankStatementArchiveEvidence = {
  companyId: string;
  importBatchId: string;
  originalFilename: string;
  fileSourceHash: string;
  sourceProvider: string;
  maskedAccountIdentity: string | null;
  bankAccountCode: string | null;
  importedAt: string;
  actorUserId: string | null;
  /** Only when legitimately known from source — never invented. */
  statementPeriodFrom: string | null;
  statementPeriodTo: string | null;
  storageKey: string | null;
  mimeType: string | null;
  inventedMetadata: false;
};

export type BankStatementArchiveSourceInput = {
  companyId: string;
  importBatchId: string;
  originalFilename: string;
  fileChecksumSha256: string;
  sourceProvider?: string | null;
  bankAccountCode?: string | null;
  bankAccountName?: string | null;
  accountNumber?: string | null;
  importedAt: string;
  actorUserId?: string | null;
  statementPeriodFrom?: string | null;
  statementPeriodTo?: string | null;
  inventStatementPeriod?: boolean;
  storageKey?: string | null;
  mimeType?: string | null;
};

export function buildBankStatementArchiveEvidence(
  input: BankStatementArchiveSourceInput,
): BankStatementArchiveEvidence {
  if (input.inventStatementPeriod === true) {
    throw new Error('Row 114 must never invent statement period metadata');
  }
  if (!input.originalFilename?.trim()) {
    throw new Error('originalFilename is required source evidence');
  }
  if (!input.fileChecksumSha256?.trim()) {
    throw new Error('file/source hash is required source evidence');
  }

  const periodFrom = input.statementPeriodFrom ?? null;
  const periodTo = input.statementPeriodTo ?? null;
  if ((periodFrom && !periodTo) || (!periodFrom && periodTo)) {
    // Partial invented periods not allowed — keep both missing
    return {
      companyId: input.companyId,
      importBatchId: input.importBatchId,
      originalFilename: input.originalFilename,
      fileSourceHash: input.fileChecksumSha256,
      sourceProvider: input.sourceProvider?.trim() || 'manual_statement',
      maskedAccountIdentity: maskBankAccountIdentity({
        accountNumber: input.accountNumber,
        accountCode: input.bankAccountCode,
        name: input.bankAccountName,
      }),
      bankAccountCode: input.bankAccountCode ?? null,
      importedAt: input.importedAt,
      actorUserId: input.actorUserId ?? null,
      statementPeriodFrom: null,
      statementPeriodTo: null,
      storageKey: input.storageKey ?? null,
      mimeType: input.mimeType ?? null,
      inventedMetadata: false,
    };
  }

  return {
    companyId: input.companyId,
    importBatchId: input.importBatchId,
    originalFilename: input.originalFilename,
    fileSourceHash: input.fileChecksumSha256,
    sourceProvider: input.sourceProvider?.trim() || 'manual_statement',
    maskedAccountIdentity: maskBankAccountIdentity({
      accountNumber: input.accountNumber,
      accountCode: input.bankAccountCode,
      name: input.bankAccountName,
    }),
    bankAccountCode: input.bankAccountCode ?? null,
    importedAt: input.importedAt,
    actorUserId: input.actorUserId ?? null,
    statementPeriodFrom: periodFrom,
    statementPeriodTo: periodTo,
    storageKey: input.storageKey ?? null,
    mimeType: input.mimeType ?? null,
    inventedMetadata: false,
  };
}

export function canViewBankStatementArchive(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (
    role === 'technician' ||
    role === 'tech' ||
    role.includes('tech') ||
    role.includes('sub tech') ||
    role.includes('sub_tech') ||
    role.includes('subtech') ||
    role === 'client' ||
    role.includes('client')
  ) {
    return false;
  }
  const perms = input.permissions ?? [];
  if (perms.includes('*') || perms.includes('finance:read') || perms.includes('finance:write')) {
    return true;
  }
  return ['owner', 'company owner', 'admin', 'manager', 'office'].includes(role);
}

export function canManageBankStatementArchive(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  if (!canViewBankStatementArchive(input)) return false;
  const role = (input.roleName ?? '').toLowerCase();
  const perms = input.permissions ?? [];
  if (perms.includes('*') || perms.includes('finance:write')) return true;
  return ['owner', 'company owner', 'admin'].includes(role);
}

/** Denied surfaces for Tech/Sub Tech/Client. */
export function assertBankArchiveVisibilityDenied(input: {
  roleName?: string | null;
  surface: 'bank_statements' | 'balances' | 'bank_transactions' | 'reconciliation_internals';
}): void {
  if (canViewBankStatementArchive(input)) return;
  throw new Error(`DENIED: ${input.surface} not visible to ${input.roleName ?? 'unknown'}`);
}

export function assertNoBankArchiveClientLeak(payload: unknown, path = 'root'): void {
  if (payload == null || typeof payload !== 'object') return;
  if (Array.isArray(payload)) {
    payload.forEach((item, i) => assertNoBankArchiveClientLeak(item, `${path}[${i}]`));
    return;
  }
  const obj = payload as Record<string, unknown>;
  const forbidden = [
    'bankStatementArchiveInternal',
    'storageKey',
    'fullAccountNumber',
    'runningBalanceCents',
    'bankBalance',
    'reconciliationInternals',
    'username',
    'password',
    'pin',
    'otp',
    'cvv',
  ];
  for (const key of forbidden) {
    if (key in obj && obj[key] != null) {
      throw new Error(`Bank archive leak at ${path}.${key}`);
    }
  }
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') assertNoBankArchiveClientLeak(v, `${path}.${k}`);
  }
}

export function projectBankStatementArchiveForClient(
  evidence: BankStatementArchiveEvidence,
): Omit<BankStatementArchiveEvidence, 'storageKey'> & { storageKey: null } {
  return { ...evidence, storageKey: null };
}

export function assertRow114SafetyGates(input: {
  row92AutomationEnabled: boolean;
  row117OcrStarted?: boolean;
  row118Closed?: boolean;
  xeroWrites?: number;
  moneyMovement?: number;
}): { row92Off: true; row117NotStarted: true; row118NotClosed: true; xeroWrites: 0; moneyMovement: 0 } {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  if (input.row117OcrStarted === true) throw new Error('Row 117 OCR must not start during Row 114');
  if (input.row118Closed === true) throw new Error('Row 118 must remain OPEN');
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 114 requires Xero writes = 0');
  if ((input.moneyMovement ?? 0) !== 0) throw new Error('Row 114 requires money movement = 0');
  return {
    row92Off: true,
    row117NotStarted: true,
    row118NotClosed: true,
    xeroWrites: 0,
    moneyMovement: 0,
  };
}
