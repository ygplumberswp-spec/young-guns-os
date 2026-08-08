/**
 * Row 111 — Reconciliation states + AURA suggestions
 *
 * States: UNMATCHED | POSSIBLE_MATCH | PARTIAL | REVIEWED | RECONCILED | REVIEW_REQUIRED
 * AURA may SUGGEST candidate/confidence/evidence — cannot independently reconcile uncertain money.
 * Human review required for uncertainty. Preserve who/when/evidence.
 */

import type { BankMatchDisposition, ExpandedBankMatchCandidate } from './bank-transaction-matching.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';

export const BANK_RECONCILIATION_STATES_KEY = 'bank-reconciliation-states' as const;

export const BANK_RECONCILIATION_STATES = [
  'UNMATCHED',
  'POSSIBLE_MATCH',
  'PARTIAL',
  'REVIEWED',
  'RECONCILED',
  'REVIEW_REQUIRED',
] as const;

export type BankReconciliationState = (typeof BANK_RECONCILIATION_STATES)[number];

export type AuraBankMatchSuggestion = {
  kind: 'SUGGEST';
  candidate: ExpandedBankMatchCandidate | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  evidence: ExpandedBankMatchCandidate['evidence'];
  reasons: string[];
  /** AURA cannot independently reconcile uncertain money. */
  canIndependentlyReconcile: false;
  requiresHumanReview: boolean;
};

export type BankReconciliationReviewRecord = {
  state: BankReconciliationState;
  previousState: BankReconciliationState | null;
  reviewedByUserId: string;
  reviewedAt: string;
  evidence: Record<string, unknown>;
  auraSuggestion: AuraBankMatchSuggestion | null;
  humanConfirmed: boolean;
};

/** Map Row110 disposition + allocation into Row111 vocabulary. */
export function resolveBankReconciliationState(input: {
  disposition: BankMatchDisposition;
  candidateCount: number;
  allocatedAmountCents: number;
  transactionAmountCents: number;
  humanReviewed?: boolean;
  humanReconciled?: boolean;
}): BankReconciliationState {
  if (input.humanReconciled === true) return 'RECONCILED';
  if (input.humanReviewed === true) return 'REVIEWED';

  const abs = Math.abs(input.transactionAmountCents);
  if (input.allocatedAmountCents > 0 && input.allocatedAmountCents < abs) {
    return 'PARTIAL';
  }
  if (input.disposition === 'REVIEW_REQUIRED') return 'REVIEW_REQUIRED';
  if (input.disposition === 'DETERMINISTIC_UNIQUE' || input.disposition === 'SINGLE_CANDIDATE') {
    return 'POSSIBLE_MATCH';
  }
  if (input.candidateCount === 0 || input.disposition === 'NO_CANDIDATES') return 'UNMATCHED';
  return 'REVIEW_REQUIRED';
}

export function buildAuraBankMatchSuggestion(input: {
  candidates: ExpandedBankMatchCandidate[];
  disposition: BankMatchDisposition;
}): AuraBankMatchSuggestion {
  const top = input.candidates[0] ?? null;
  const uncertain =
    input.disposition === 'REVIEW_REQUIRED' ||
    input.disposition === 'NO_CANDIDATES' ||
    !top ||
    top.confidence !== 'high';

  return {
    kind: 'SUGGEST',
    candidate: top,
    confidence: top?.confidence ?? 'none',
    evidence: top?.evidence ?? [],
    reasons: top
      ? [top.reason, ...top.evidence.map((e) => `${e.signal}: ${e.detail}`)]
      : ['No candidates'],
    canIndependentlyReconcile: false,
    requiresHumanReview: uncertain || input.disposition !== 'DETERMINISTIC_UNIQUE',
  };
}

/**
 * Apply human review transition. Uncertain money cannot be auto-reconciled by AURA.
 */
export function applyHumanReconciliationReview(input: {
  currentState: BankReconciliationState;
  nextState: BankReconciliationState;
  reviewedByUserId: string;
  reviewedAt: string;
  evidence: Record<string, unknown>;
  auraSuggestion?: AuraBankMatchSuggestion | null;
  auraForcedReconcile?: boolean;
}): BankReconciliationReviewRecord {
  if (input.auraForcedReconcile === true) {
    throw new Error('AURA cannot independently reconcile uncertain money');
  }
  if (!input.reviewedByUserId?.trim()) {
    throw new Error('Human reviewer required');
  }
  if (input.nextState === 'RECONCILED' && input.currentState === 'REVIEW_REQUIRED') {
    // Allowed only with human confirmation + evidence
    if (!input.evidence || Object.keys(input.evidence).length === 0) {
      throw new Error('RECONCILED from REVIEW_REQUIRED requires evidence');
    }
  }

  return {
    state: input.nextState,
    previousState: input.currentState,
    reviewedByUserId: input.reviewedByUserId,
    reviewedAt: input.reviewedAt,
    evidence: input.evidence,
    auraSuggestion: input.auraSuggestion ?? null,
    humanConfirmed: true,
  };
}

/** Bridge legacy BANK-001 statuses → Row111 vocabulary (read projection). */
export function mapLegacyReconciliationStatus(
  legacy: 'unreconciled' | 'partially_reconciled' | 'reconciled',
): BankReconciliationState {
  if (legacy === 'reconciled') return 'RECONCILED';
  if (legacy === 'partially_reconciled') return 'PARTIAL';
  return 'UNMATCHED';
}

export function canViewBankReconciliation(input: {
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

export function canManageBankReconciliation(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role === 'client' || role.includes('tech')) return false;
  const perms = input.permissions ?? [];
  if (perms.includes('*') || perms.includes('finance:write')) return true;
  return ['owner', 'company owner', 'admin'].includes(role);
}

export function assertRow111SafetyGates(input: {
  row92AutomationEnabled: boolean;
  row114PlusStarted?: boolean;
  xeroWrites?: number;
  moneyMovement?: number;
}): { row92Off: true; xeroWrites: 0; moneyMovement: 0 } {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  if (input.row114PlusStarted === true) throw new Error('Rows 114+ must not start during Row 111');
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 111 requires Xero writes = 0');
  if ((input.moneyMovement ?? 0) !== 0) throw new Error('Row 111 requires money movement = 0');
  return { row92Off: true, xeroWrites: 0, moneyMovement: 0 };
}
