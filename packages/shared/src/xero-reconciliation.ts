/**
 * Invoice reconciliation states — Yoco payment ≠ Xero reconciled (XERO-002 P0 — X-P0-7).
 */

export type XeroInvoiceReconciliationState =
  | 'invoice_issued'
  | 'yoco_payment_received'
  | 'xero_payment_recorded'
  | 'bank_transaction_imported'
  | 'bank_reconciliation_confirmed'
  | 'unmatched_payment'
  | 'partial_payment'
  | 'refund'
  | 'credit_allocation'
  | 'overpayment'
  | 'prepayment';

export type XeroInvoiceReconciliationSnapshot = {
  invoiceId: string;
  publicInvoiceNumber: string;
  state: XeroInvoiceReconciliationState;
  stateLabel: string;
  invoiceTotalCents: number;
  amountPaidCents: number;
  balanceDueCents: number;
  yocoPaymentEventId: string | null;
  xeroPaymentId: string | null;
  bankTransactionId: string | null;
  isReconciledInXero: boolean;
  /** True only when bank reconciliation evidence exists — not merely Yoco paid. */
  reconciliationProven: boolean;
  sourceLabel: string;
  lastUpdatedAt: string | null;
  completenessIndicator: 'complete' | 'partial' | 'missing';
  staleDataWarning: string | null;
};

export const XERO_RECONCILIATION_STATE_LABELS: Record<XeroInvoiceReconciliationState, string> = {
  invoice_issued: 'Invoice issued',
  yoco_payment_received: 'Yoco payment received',
  xero_payment_recorded: 'Xero payment recorded',
  bank_transaction_imported: 'Bank transaction imported',
  bank_reconciliation_confirmed: 'Bank reconciliation confirmed',
  unmatched_payment: 'Unmatched payment',
  partial_payment: 'Partial payment',
  refund: 'Refund',
  credit_allocation: 'Credit allocation',
  overpayment: 'Overpayment',
  prepayment: 'Prepayment',
};

export type XeroReconciliationInput = {
  invoiceId: string;
  publicInvoiceNumber: string;
  invoiceTotalCents: number;
  amountPaidCents: number;
  balanceDueCents: number;
  yocoPaymentEventId: string | null;
  xeroPaymentId: string | null;
  bankTransactionId: string | null;
  isReconciledInXero: boolean;
  lastUpdatedAt: string | null;
  hasRefund: boolean;
  hasCreditNote: boolean;
  hasOverpayment: boolean;
  hasPrepayment: boolean;
};

/** Derive reconciliation state without claiming reconciled from Yoco alone. */
export function deriveInvoiceReconciliationState(
  input: XeroReconciliationInput,
): XeroInvoiceReconciliationSnapshot {
  let state: XeroInvoiceReconciliationState = 'invoice_issued';

  if (input.hasRefund) {
    state = 'refund';
  } else if (input.hasCreditNote) {
    state = 'credit_allocation';
  } else if (input.hasOverpayment) {
    state = 'overpayment';
  } else if (input.hasPrepayment) {
    state = 'prepayment';
  } else if (input.isReconciledInXero && input.bankTransactionId) {
    state = 'bank_reconciliation_confirmed';
  } else if (input.bankTransactionId) {
    state = 'bank_transaction_imported';
  } else if (input.xeroPaymentId) {
    state = 'xero_payment_recorded';
  } else if (input.yocoPaymentEventId) {
    state = 'yoco_payment_received';
  } else if (input.amountPaidCents > 0 && input.balanceDueCents > 0) {
    state = 'partial_payment';
  } else if (input.yocoPaymentEventId && !input.xeroPaymentId) {
    state = 'unmatched_payment';
  }

  const reconciliationProven =
    state === 'bank_reconciliation_confirmed' && input.isReconciledInXero;

  let completenessIndicator: XeroInvoiceReconciliationSnapshot['completenessIndicator'] =
    'partial';
  if (reconciliationProven) {
    completenessIndicator = 'complete';
  } else if (!input.xeroPaymentId && !input.yocoPaymentEventId) {
    completenessIndicator = 'missing';
  }

  const staleDataWarning =
    input.yocoPaymentEventId && !input.xeroPaymentId
      ? 'Yoco payment recorded — Xero payment import not yet verified'
      : input.xeroPaymentId && !input.isReconciledInXero
        ? 'Xero payment recorded — bank reconciliation not confirmed'
        : null;

  return {
    invoiceId: input.invoiceId,
    publicInvoiceNumber: input.publicInvoiceNumber,
    state,
    stateLabel: XERO_RECONCILIATION_STATE_LABELS[state],
    invoiceTotalCents: input.invoiceTotalCents,
    amountPaidCents: input.amountPaidCents,
    balanceDueCents: input.balanceDueCents,
    yocoPaymentEventId: input.yocoPaymentEventId,
    xeroPaymentId: input.xeroPaymentId,
    bankTransactionId: input.bankTransactionId,
    isReconciledInXero: input.isReconciledInXero,
    reconciliationProven,
    sourceLabel: reconciliationProven
      ? 'Xero bank reconciliation'
      : input.xeroPaymentId
        ? 'Xero payment record'
        : input.yocoPaymentEventId
          ? 'Yoco payment event'
          : 'TITAN invoice ledger',
    lastUpdatedAt: input.lastUpdatedAt,
    completenessIndicator,
    staleDataWarning,
  };
}

/** Job profitability revenue must use collected cash, not unpaid invoice totals. */
export function jobProfitabilityFromSources(input: {
  quotedRevenueCents: number;
  invoicedRevenueCents: number;
  collectedCashCents: number;
  vatCents: number;
  directCostCents: number;
}): {
  revenueExVatCents: number;
  grossProfitCents: number;
  grossMarginBps: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  const revenueExVatCents = Math.max(input.collectedCashCents - input.vatCents, 0);

  if (input.invoicedRevenueCents > input.collectedCashCents) {
    warnings.push('Unpaid invoice amounts excluded from collected cash');
  }

  if (input.collectedCashCents === 0 && input.invoicedRevenueCents > 0) {
    warnings.push('No collected cash — revenue not counted as profit');
  }

  const grossProfitCents = revenueExVatCents - input.directCostCents;
  const grossMarginBps =
    revenueExVatCents > 0 ? Math.round((grossProfitCents / revenueExVatCents) * 10_000) : 0;

  return { revenueExVatCents, grossProfitCents, grossMarginBps, warnings };
}
