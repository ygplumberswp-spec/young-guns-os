/**
 * Row 115 — Bank health + exceptions
 *
 * Truthful intake/reconciliation health for Owner Financial Command / AURA.
 * No fake connection, balance, transaction count, or health state.
 * Tech/Client denied. AURA may summarize attention items only.
 */

import type { BankFeedFoundationMode, BankFeedConnectionStatus } from './bank-feed-foundation.js';
import type { BankReconciliationState } from './bank-reconciliation-states.js';
import type { OwnerFinancialAttentionItem, OwnerFinancialAttentionPriority } from './owner-financial-command.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';

export const BANK_HEALTH_EXCEPTIONS_KEY = 'bank-health-exceptions' as const;

export type BankHealthOperatingSnapshot = {
  operatingMode: BankFeedFoundationMode;
  connectionImportStatus: BankFeedConnectionStatus;
  lastSuccessfulIntakeAt: string | null;
  lastAttemptedIntakeAt: string | null;
  statementBatchCount: number;
  unmatchedCount: number;
  possibleMatchCount: number;
  reviewRequiredCount: number;
  partiallyReconciledCount: number;
  providerImportErrorCount: number;
  staleIntake: boolean;
  staleIntakeWarning: string | null;
  /** Never fabricate — only when a legitimate bank-provided balance exists. */
  bankBalanceCents: number | null;
  balanceFabricated: false;
  connectedClaim: boolean;
  fabricatedHealth: false;
};

export type BankHealthInput = {
  operatingMode: BankFeedFoundationMode;
  connectionImportStatus: BankFeedConnectionStatus;
  lastSuccessfulIntakeAt?: string | null;
  lastAttemptedIntakeAt?: string | null;
  statementBatchCount: number;
  reconStateCounts: Partial<Record<BankReconciliationState, number>>;
  providerImportErrorCount?: number;
  /** Deterministic stale window in hours (default 168 = 7d). */
  staleAfterHours?: number;
  nowIso?: string;
  /** Only pass when bank actually provided a balance. */
  bankProvidedBalanceCents?: number | null;
  inventBalance?: boolean;
  inventConnection?: boolean;
  inventTransactionCount?: boolean;
  inventHealth?: boolean;
};

function hoursBetween(aIso: string, bIso: string): number {
  return Math.abs(Date.parse(aIso) - Date.parse(bIso)) / 3_600_000;
}

export function buildBankHealthSnapshot(input: BankHealthInput): BankHealthOperatingSnapshot {
  if (input.inventBalance === true) throw new Error('Must not fabricate bank balance');
  if (input.inventConnection === true) throw new Error('Must not fabricate connection');
  if (input.inventTransactionCount === true) throw new Error('Must not fabricate transaction count');
  if (input.inventHealth === true) throw new Error('Must not fabricate health state');

  const counts = input.reconStateCounts;
  const now = input.nowIso ?? new Date().toISOString();
  const staleAfter = input.staleAfterHours ?? 168;
  const lastSuccess = input.lastSuccessfulIntakeAt ?? null;
  const lastAttempt = input.lastAttemptedIntakeAt ?? null;

  let staleIntake = false;
  let staleIntakeWarning: string | null = null;
  if (lastSuccess) {
    const age = hoursBetween(lastSuccess, now);
    if (age > staleAfter) {
      staleIntake = true;
      staleIntakeWarning = `Last successful intake is older than ${staleAfter} hours`;
    }
  } else if (input.statementBatchCount === 0 && input.operatingMode === 'CONTROLLED_STATEMENT_IMPORT') {
    // Deterministic: never successfully intake'd — not a fake health claim
    staleIntake = false;
    staleIntakeWarning = null;
  } else if (!lastSuccess && lastAttempt) {
    staleIntake = true;
    staleIntakeWarning = 'Intake attempted but never succeeded';
  }

  const connectedClaim = input.connectionImportStatus === 'CONNECTED_READ_ONLY';

  return {
    operatingMode: input.operatingMode,
    connectionImportStatus: input.connectionImportStatus,
    lastSuccessfulIntakeAt: lastSuccess,
    lastAttemptedIntakeAt: lastAttempt,
    statementBatchCount: input.statementBatchCount,
    unmatchedCount: counts.UNMATCHED ?? 0,
    possibleMatchCount: counts.POSSIBLE_MATCH ?? 0,
    reviewRequiredCount: counts.REVIEW_REQUIRED ?? 0,
    partiallyReconciledCount: counts.PARTIAL ?? 0,
    providerImportErrorCount: input.providerImportErrorCount ?? 0,
    staleIntake,
    staleIntakeWarning,
    bankBalanceCents:
      input.bankProvidedBalanceCents === undefined ? null : input.bankProvidedBalanceCents,
    balanceFabricated: false,
    connectedClaim,
    fabricatedHealth: false,
  };
}

/** AURA attention items only — summarize, never invent. */
export function buildBankHealthAuraAttention(
  health: BankHealthOperatingSnapshot,
): OwnerFinancialAttentionItem[] {
  const items: OwnerFinancialAttentionItem[] = [];

  const push = (
    sourceId: string,
    label: string,
    priority: OwnerFinancialAttentionPriority,
    count: number,
  ) => {
    if (count <= 0) return;
    items.push({
      priority,
      kind: 'bank_exception',
      label,
      amountCents: null,
      count,
      href: '/finance/bank-control',
      source: 'bank_health',
      sourceId,
    });
  };

  if (health.connectionImportStatus === 'PROVIDER_ERROR') {
    push(
      'bank-provider-error',
      'Bank provider/import errors need attention',
      'critical',
      Math.max(1, health.providerImportErrorCount),
    );
  }
  push('bank-review-required', 'Bank transactions require review', 'high', health.reviewRequiredCount);
  push('bank-unmatched', 'Unmatched bank transactions', 'high', health.unmatchedCount);
  push(
    'bank-possible-match',
    'Possible bank matches awaiting confirmation',
    'normal',
    health.possibleMatchCount,
  );
  push(
    'bank-partial',
    'Partially reconciled bank transactions',
    'normal',
    health.partiallyReconciledCount,
  );
  if (health.staleIntake && health.staleIntakeWarning) {
    items.push({
      priority: 'normal',
      kind: 'bank_exception',
      label: health.staleIntakeWarning,
      amountCents: null,
      count: 1,
      href: '/finance/bank-control',
      source: 'bank_health',
      sourceId: 'bank-stale-intake',
    });
  }
  if (health.operatingMode === 'PROVIDER_UNAVAILABLE' || health.operatingMode === 'NOT_CONFIGURED') {
    items.push({
      priority: 'normal',
      kind: 'bank_exception',
      label: 'Bank feed unavailable — controlled statement import only',
      amountCents: null,
      count: 1,
      href: '/finance/bank-transactions/import',
      source: 'bank_health',
      sourceId: 'bank-mode',
    });
  }

  return items;
}

export function canViewBankHealth(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role.includes('tech') || role === 'client' || role.includes('client')) {
    return false;
  }
  const perms = input.permissions ?? [];
  if (perms.includes('*') || perms.includes('finance:read') || perms.includes('finance:write')) {
    return true;
  }
  return ['owner', 'company owner', 'admin', 'manager', 'office'].includes(role);
}

export function assertBankHealthDeniedToTechClient(roleName: string | null | undefined): void {
  if (!canViewBankHealth({ roleName })) {
    throw new Error('Bank health denied to Tech/Client');
  }
}

export function assertRow115SafetyGates(input: {
  row92AutomationEnabled: boolean;
  row117OcrStarted?: boolean;
  xeroWrites?: number;
  moneyMovement?: number;
}): { row92Off: true; xeroWrites: 0; moneyMovement: 0 } {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  if (input.row117OcrStarted === true) throw new Error('Row 117 OCR must not start during Row 115');
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 115 requires Xero writes = 0');
  if ((input.moneyMovement ?? 0) !== 0) throw new Error('Row 115 requires money movement = 0');
  return { row92Off: true, xeroWrites: 0, moneyMovement: 0 };
}
