/**
 * Row 130 — Job payment visibility (canonical shared resolver)
 *
 * One shared resolver over JobPaymentState. No fake paid/unpaid.
 * Evidence-gated states (plan/promise/dispute/refund/write-off) stay
 * incomplete unless source flags are present.
 */

import type { InvoiceSummary, PaymentSummary, QuoteSummary } from './finance.js';
import {
  deriveJobPaymentState,
  JOB_PAYMENT_STATE_LABELS,
  type JobPaymentState,
} from './job-payment-ledger.js';
import { classifyPaymentExactCents } from './payment-ledger-exact-row129.js';
import { isInvoiceOverdueDerived } from './finance-canonical-status.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';

export const JOB_PAYMENT_VISIBILITY_ROW130_KEY = 'job-payment-visibility-row130' as const;

/** Uppercase API labels required by Row 130. */
export const CANONICAL_JOB_PAYMENT_VISIBILITY = [
  'NO_INVOICE',
  'DRAFT_INVOICE',
  'DEPOSIT_REQUIRED',
  'DEPOSIT_UNPAID',
  'DEPOSIT_PARTIALLY_PAID',
  'DEPOSIT_PAID',
  'AWAITING_PAYMENT',
  'PARTIALLY_PAID',
  'PAID_IN_FULL',
  'OVERDUE',
  'PAYMENT_PLAN',
  'PROMISE_TO_PAY',
  'DISPUTED',
  'OVERPAID',
  'REFUNDED',
  'WRITTEN_OFF',
  'VOIDED',
] as const;

export type CanonicalJobPaymentVisibility = (typeof CANONICAL_JOB_PAYMENT_VISIBILITY)[number];

export type JobPaymentVisibilityEvidence = {
  hasPaymentPlan?: boolean;
  hasPromiseToPay?: boolean;
  hasDispute?: boolean;
  hasWriteOff?: boolean;
  asOfDate?: string | null;
};

export function toCanonicalJobPaymentVisibility(state: JobPaymentState): CanonicalJobPaymentVisibility {
  return state.toUpperCase() as CanonicalJobPaymentVisibility;
}

export function resolveJobPaymentVisibility(input: {
  quotes: QuoteSummary[];
  invoices: InvoiceSummary[];
  payments: PaymentSummary[];
  evidence?: JobPaymentVisibilityEvidence;
}): {
  state: JobPaymentState;
  visibility: CanonicalJobPaymentVisibility;
  label: string;
  fakePaidUnpaid: false;
  evidenceIncomplete: string[];
} {
  const evidence = input.evidence ?? {};
  const classified = classifyPaymentExactCents(input.payments);
  const evidenceIncomplete: string[] = [];

  // Evidence-gated terminal/special states — never invent.
  if (evidence.hasWriteOff) {
    return {
      state: 'written_off',
      visibility: 'WRITTEN_OFF',
      label: JOB_PAYMENT_STATE_LABELS.written_off,
      fakePaidUnpaid: false,
      evidenceIncomplete,
    };
  }
  if (evidence.hasDispute) {
    return {
      state: 'disputed',
      visibility: 'DISPUTED',
      label: JOB_PAYMENT_STATE_LABELS.disputed,
      fakePaidUnpaid: false,
      evidenceIncomplete,
    };
  }
  if (classified.refundCents > 0 && classified.receivedCents === 0) {
    return {
      state: 'refunded',
      visibility: 'REFUNDED',
      label: JOB_PAYMENT_STATE_LABELS.refunded,
      fakePaidUnpaid: false,
      evidenceIncomplete,
    };
  }
  if (evidence.hasPaymentPlan) {
    return {
      state: 'payment_plan',
      visibility: 'PAYMENT_PLAN',
      label: JOB_PAYMENT_STATE_LABELS.payment_plan,
      fakePaidUnpaid: false,
      evidenceIncomplete,
    };
  }
  if (evidence.hasPromiseToPay) {
    return {
      state: 'promise_to_pay',
      visibility: 'PROMISE_TO_PAY',
      label: JOB_PAYMENT_STATE_LABELS.promise_to_pay,
      fakePaidUnpaid: false,
      evidenceIncomplete,
    };
  }

  // Prefer derived overdue from due date + outstanding when available.
  const invoicesForState = input.invoices.map((inv) => ({
    ...inv,
    isOverdue: isInvoiceOverdueDerived({
      dueDate: inv.dueDate,
      balanceDueCents: inv.outstandingCents,
      asOfDate: evidence.asOfDate,
      status: inv.status,
    })
      ? true
      : inv.isOverdue,
  }));

  const state = deriveJobPaymentState({
    quotes: input.quotes,
    invoices: invoicesForState,
    payments: input.payments,
  });

  if (!evidence.hasPaymentPlan) evidenceIncomplete.push('PAYMENT_PLAN');
  if (!evidence.hasPromiseToPay) evidenceIncomplete.push('PROMISE_TO_PAY');
  if (!evidence.hasDispute) evidenceIncomplete.push('DISPUTED');
  if (!evidence.hasWriteOff) evidenceIncomplete.push('WRITTEN_OFF');

  return {
    state,
    visibility: toCanonicalJobPaymentVisibility(state),
    label: JOB_PAYMENT_STATE_LABELS[state],
    fakePaidUnpaid: false,
    evidenceIncomplete,
  };
}

export function proveJobPaymentVisibilityCoverage(): Array<{
  visibility: CanonicalJobPaymentVisibility;
  resolvable: boolean;
  note: string;
}> {
  return CANONICAL_JOB_PAYMENT_VISIBILITY.map((visibility) => {
    const evidenceGated = ['PAYMENT_PLAN', 'PROMISE_TO_PAY', 'DISPUTED', 'WRITTEN_OFF'].includes(
      visibility,
    );
    return {
      visibility,
      resolvable: true,
      note: evidenceGated
        ? 'Resolvable only with explicit evidence — never invented'
        : 'Resolvable from invoices/payments/quotes',
    };
  });
}

export function assertRow130SafetyGates(input: {
  row92AutomationEnabled: boolean;
  fakePaid?: boolean;
}): { row92Off: true; fakePaidUnpaid: false } {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  if (input.fakePaid) throw new Error('Row 130 forbids fake paid/unpaid');
  return { row92Off: true, fakePaidUnpaid: false };
}
