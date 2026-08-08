/**
 * Row 110 — Deterministic bank transaction candidate matching
 *
 * Suggests candidates to Job / supplier / receipt / expense / invoice / payment.
 * Never silently matches ambiguity. Sequence/order alone is not proof.
 * Multiple plausible candidates → REVIEW_REQUIRED.
 * No Xero write. No JPE posting.
 */

import {
  absoluteBankTransactionAmountCents,
  normaliseBankTransactionText,
  suggestDirectCostMatches,
  type BankMatchCandidate,
  type BankMatchCandidateEvidence,
  type DirectCostMatchInput,
} from './bank-transaction-control.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';

export const BANK_TRANSACTION_MATCHING_KEY = 'bank-transaction-matching' as const;

export type BankMatchTargetType =
  | 'job'
  | 'supplier'
  | 'receipt'
  | 'expense'
  | 'invoice'
  | 'payment'
  | 'direct_cost'
  | 'other_finance';

export type BankMatchDisposition =
  | 'NO_CANDIDATES'
  | 'SINGLE_CANDIDATE'
  | 'REVIEW_REQUIRED'
  | 'DETERMINISTIC_UNIQUE';

export type ExpandedBankMatchCandidate = {
  targetType: BankMatchTargetType;
  targetId: string;
  targetLabel: string;
  confidence: 'high' | 'medium' | 'low';
  amountCents: number;
  amountDifferenceCents: number;
  reason: string;
  evidence: BankMatchCandidateEvidence[];
  /** Sequence/order never counts as evidence. */
  sequenceUsedAsProof: false;
};

export type MatchRecordInput = {
  id: string;
  label: string;
  amountCents: number;
  date?: string | null;
  reference?: string | null;
  identityText?: string | null;
  jobId?: string | null;
};

function daysBetween(a: string, b: string): number {
  const ms = Math.abs(Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10)));
  return Math.floor(ms / 86_400_000);
}

function scoreCandidate(input: {
  txAmount: number;
  txDate: string;
  haystack: string;
  record: MatchRecordInput;
  targetType: BankMatchTargetType;
}): ExpandedBankMatchCandidate | null {
  const evidence: BankMatchCandidateEvidence[] = [];
  let score = 0;
  const abs = absoluteBankTransactionAmountCents(input.record.amountCents);

  if (abs === input.txAmount) {
    score += 40;
    evidence.push({ signal: 'exact_amount', detail: 'Exact amount' });
  } else if (Math.abs(abs - input.txAmount) <= 100) {
    score += 10;
    evidence.push({ signal: 'near_amount', detail: 'Amount within R1' });
  } else {
    return null;
  }

  if (input.record.date) {
    const d = daysBetween(input.record.date, input.txDate);
    if (d === 0) {
      score += 20;
      evidence.push({ signal: 'same_date', detail: 'Same date' });
    } else if (d <= 3) {
      score += 10;
      evidence.push({ signal: 'date_proximity', detail: `Within ${d} day(s)` });
    }
  }

  if (input.record.reference) {
    const ref = normaliseBankTransactionText(input.record.reference);
    if (ref && input.haystack.includes(ref)) {
      score += 25;
      evidence.push({ signal: 'reference', detail: `Reference "${input.record.reference}"` });
    }
  }

  if (input.record.identityText) {
    const id = normaliseBankTransactionText(input.record.identityText);
    if (id.length >= 3 && input.haystack.includes(id)) {
      score += 20;
      evidence.push({
        signal: 'identity',
        detail: `Identity "${input.record.identityText}" in description`,
      });
    }
  }

  if (input.record.jobId && input.haystack.includes(normaliseBankTransactionText(input.record.jobId))) {
    score += 15;
    evidence.push({ signal: 'job_relationship', detail: 'Known job reference in text' });
  }

  // Require more than amount alone for medium+; amount+one other signal minimum
  if (evidence.length < 2 && score < 70) return null;
  if (score < 50) return null;

  const confidence: ExpandedBankMatchCandidate['confidence'] =
    score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low';

  return {
    targetType: input.targetType,
    targetId: input.record.id,
    targetLabel: input.record.label,
    confidence,
    amountCents: abs,
    amountDifferenceCents: abs - input.txAmount,
    reason: `Candidate ${input.targetType} match`,
    evidence,
    sequenceUsedAsProof: false,
  };
}

export function suggestBankTransactionMatches(input: {
  transactionAmountCents: number;
  transactionDate: string;
  description?: string | null;
  reference?: string | null;
  merchantName?: string | null;
  jobs?: MatchRecordInput[];
  suppliers?: MatchRecordInput[];
  receipts?: MatchRecordInput[];
  expenses?: MatchRecordInput[];
  invoices?: MatchRecordInput[];
  payments?: MatchRecordInput[];
  directCosts?: DirectCostMatchInput[];
  /** If true, fail — sequence must never be used as proof. */
  useSequenceAsProof?: boolean;
}): {
  candidates: ExpandedBankMatchCandidate[];
  disposition: BankMatchDisposition;
  autoMatched: false;
  jpePosted: false;
  xeroWrites: 0;
} {
  if (input.useSequenceAsProof === true) {
    throw new Error('Sequence/order alone is not proof for bank matching');
  }

  const txAmount = absoluteBankTransactionAmountCents(input.transactionAmountCents);
  const haystack = normaliseBankTransactionText(
    `${input.description ?? ''} ${input.reference ?? ''} ${input.merchantName ?? ''}`,
  );
  const candidates: ExpandedBankMatchCandidate[] = [];

  const groups: Array<[BankMatchTargetType, MatchRecordInput[] | undefined]> = [
    ['job', input.jobs],
    ['supplier', input.suppliers],
    ['receipt', input.receipts],
    ['expense', input.expenses],
    ['invoice', input.invoices],
    ['payment', input.payments],
  ];

  for (const [targetType, records] of groups) {
    for (const record of records ?? []) {
      const c = scoreCandidate({ txAmount, txDate: input.transactionDate, haystack, record, targetType });
      if (c) candidates.push(c);
    }
  }

  for (const dc of suggestDirectCostMatches({
    transactionAmountCents: input.transactionAmountCents,
    transactionDate: input.transactionDate,
    description: input.description ?? null,
    reference: input.reference ?? null,
    merchantName: input.merchantName ?? null,
    directCosts: input.directCosts ?? [],
  }) as BankMatchCandidate[]) {
    candidates.push({
      ...dc,
      targetType: 'direct_cost',
      sequenceUsedAsProof: false,
    });
  }

  candidates.sort((a, b) => {
    const rank = { high: 3, medium: 2, low: 1 };
    return rank[b.confidence] - rank[a.confidence];
  });

  const highOrMedium = candidates.filter((c) => c.confidence !== 'low');
  let disposition: BankMatchDisposition;
  if (candidates.length === 0) disposition = 'NO_CANDIDATES';
  else if (highOrMedium.length > 1) disposition = 'REVIEW_REQUIRED';
  else if (
    highOrMedium.length === 1 &&
    highOrMedium[0].confidence === 'high' &&
    highOrMedium[0].evidence.some((e) => e.signal === 'exact_amount') &&
    highOrMedium[0].evidence.length >= 2
  ) {
    disposition = 'DETERMINISTIC_UNIQUE';
  } else if (candidates.length === 1) disposition = 'SINGLE_CANDIDATE';
  else disposition = 'REVIEW_REQUIRED';

  return {
    candidates,
    disposition,
    autoMatched: false,
    jpePosted: false,
    xeroWrites: 0,
  };
}

export function assertBankMatchingSafety(input?: {
  autoMatched?: boolean;
  jpePosted?: boolean;
  xeroWrites?: number;
  silentAmbiguityMatched?: boolean;
}): { autoMatched: false; jpePosted: false; xeroWrites: 0 } {
  if (input?.autoMatched) throw new Error('Row 110 must not silently auto-match');
  if (input?.silentAmbiguityMatched) throw new Error('Ambiguous matches require REVIEW_REQUIRED');
  if (input?.jpePosted) throw new Error('Row 110 must not post JPE');
  if ((input?.xeroWrites ?? 0) !== 0) throw new Error('Row 110 requires Xero writes = 0');
  return { autoMatched: false, jpePosted: false, xeroWrites: 0 };
}

export function canViewBankTransactionMatching(input: {
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

export function assertRow110SafetyGates(input: {
  row92AutomationEnabled: boolean;
  row114PlusStarted?: boolean;
  xeroWrites?: number;
  moneyMovement?: number;
}): { row92Off: true; xeroWrites: 0; moneyMovement: 0 } {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  if (input.row114PlusStarted === true) throw new Error('Rows 114+ must not start during Row 110');
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 110 requires Xero writes = 0');
  if ((input.moneyMovement ?? 0) !== 0) throw new Error('Row 110 requires money movement = 0');
  return { row92Off: true, xeroWrites: 0, moneyMovement: 0 };
}
