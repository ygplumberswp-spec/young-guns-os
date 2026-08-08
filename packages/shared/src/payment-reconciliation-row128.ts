/**
 * Row 128 — Payment reconciliation (AURA suggestion only)
 *
 * Xero/bank payment → AURA candidate/confidence → human review when uncertain
 * → approval/allocation → invoice/job/customer balance truth → audit.
 * Never fakes a Xero write. AURA never independently reconciles uncertain money.
 */

import {
  applyHumanReconciliationReview,
  buildAuraBankMatchSuggestion,
  type AuraBankMatchSuggestion,
  type BankReconciliationReviewRecord,
  type BankReconciliationState,
} from './bank-reconciliation-states.js';
import {
  suggestBankTransactionMatches,
  type BankMatchDisposition,
  type ExpandedBankMatchCandidate,
  type MatchRecordInput,
} from './bank-transaction-matching.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';

export const PAYMENT_RECONCILIATION_ROW128_KEY = 'payment-reconciliation-row128' as const;

export type PaymentReconciliationHop =
  | 'xero_or_bank_payment'
  | 'aura_candidate_suggestion'
  | 'review_when_uncertain'
  | 'approval_allocation'
  | 'balance_truth'
  | 'audit';

export type PaymentBalanceTruth = {
  invoiceOutstandingCents: number | null;
  jobBalanceOwingCents: number | null;
  customerOutstandingCents: number | null;
  source: 'invoice_ledger' | 'job_ledger' | 'customer_rollup' | 'unknown';
  reconciledToSources: boolean;
};

export type AuraPaymentAllocationSuggestion = {
  kind: 'SUGGEST';
  suggestion: AuraBankMatchSuggestion;
  disposition: BankMatchDisposition;
  candidates: ExpandedBankMatchCandidate[];
  canIndependentlyReconcile: false;
  xeroWritePerformed: false;
};

export function suggestAuraPaymentAllocation(input: {
  transactionAmountCents: number;
  transactionDate: string;
  description?: string | null;
  reference?: string | null;
  invoices?: MatchRecordInput[];
  payments?: MatchRecordInput[];
  jobs?: MatchRecordInput[];
}): AuraPaymentAllocationSuggestion {
  const match = suggestBankTransactionMatches({
    transactionAmountCents: input.transactionAmountCents,
    transactionDate: input.transactionDate,
    description: input.description,
    reference: input.reference,
    invoices: input.invoices,
    payments: input.payments,
    jobs: input.jobs,
  });
  const suggestion = buildAuraBankMatchSuggestion({
    candidates: match.candidates,
    disposition: match.disposition,
  });
  return {
    kind: 'SUGGEST',
    suggestion,
    disposition: match.disposition,
    candidates: match.candidates,
    canIndependentlyReconcile: false,
    xeroWritePerformed: false,
  };
}

export function reviewAuraPaymentAllocation(input: {
  currentState: BankReconciliationState;
  nextState: BankReconciliationState;
  reviewedByUserId: string;
  reviewedAt: string;
  evidence: Record<string, unknown>;
  aura: AuraPaymentAllocationSuggestion;
  forceAuraReconcile?: boolean;
}): BankReconciliationReviewRecord {
  return applyHumanReconciliationReview({
    currentState: input.currentState,
    nextState: input.nextState,
    reviewedByUserId: input.reviewedByUserId,
    reviewedAt: input.reviewedAt,
    evidence: input.evidence,
    auraSuggestion: input.aura.suggestion,
    auraForcedReconcile: input.forceAuraReconcile === true,
  });
}

export function projectPaymentBalanceTruth(input: {
  invoiceOutstandingCents?: number | null;
  jobBalanceOwingCents?: number | null;
  customerOutstandingCents?: number | null;
}): PaymentBalanceTruth {
  const hasInvoice = input.invoiceOutstandingCents != null;
  const hasJob = input.jobBalanceOwingCents != null;
  const hasCustomer = input.customerOutstandingCents != null;
  return {
    invoiceOutstandingCents: input.invoiceOutstandingCents ?? null,
    jobBalanceOwingCents: input.jobBalanceOwingCents ?? null,
    customerOutstandingCents: input.customerOutstandingCents ?? null,
    source: hasInvoice
      ? 'invoice_ledger'
      : hasJob
        ? 'job_ledger'
        : hasCustomer
          ? 'customer_rollup'
          : 'unknown',
    reconciledToSources: hasInvoice || hasJob || hasCustomer,
  };
}

export function provePaymentReconciliationHops(input: {
  hasBankOrXeroPayment: boolean;
  aura: AuraPaymentAllocationSuggestion | null;
  review: BankReconciliationReviewRecord | null;
  balance: PaymentBalanceTruth;
  xeroWrites: number;
}): Array<{ hop: PaymentReconciliationHop; status: 'SUPPORTED' | 'BLOCKED' | 'INCOMPLETE' }> {
  if (input.xeroWrites !== 0) {
    throw new Error('Row 128 forbids Xero writes');
  }
  return [
    {
      hop: 'xero_or_bank_payment',
      status: input.hasBankOrXeroPayment ? 'SUPPORTED' : 'INCOMPLETE',
    },
    {
      hop: 'aura_candidate_suggestion',
      status: input.aura?.kind === 'SUGGEST' ? 'SUPPORTED' : 'INCOMPLETE',
    },
    {
      hop: 'review_when_uncertain',
      status:
        input.aura?.suggestion.requiresHumanReview && !input.review
          ? 'INCOMPLETE'
          : input.review || input.aura?.suggestion.requiresHumanReview === false
            ? 'SUPPORTED'
            : 'INCOMPLETE',
    },
    {
      hop: 'approval_allocation',
      status: input.review?.humanConfirmed ? 'SUPPORTED' : 'INCOMPLETE',
    },
    {
      hop: 'balance_truth',
      status: input.balance.reconciledToSources ? 'SUPPORTED' : 'INCOMPLETE',
    },
    {
      hop: 'audit',
      status: input.review?.reviewedByUserId ? 'SUPPORTED' : 'INCOMPLETE',
    },
  ];
}

export function assertRow128SafetyGates(input: {
  row92AutomationEnabled: boolean;
  xeroWrites?: number;
  auraIndependentReconcile?: boolean;
}): { row92Off: true; xeroWrites: 0; auraSuggestionOnly: true } {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 128 Xero writes must be 0');
  if (input.auraIndependentReconcile) {
    throw new Error('AURA cannot independently reconcile');
  }
  return { row92Off: true, xeroWrites: 0, auraSuggestionOnly: true };
}
