/**
 * XERO-002A — Distinct financial lifecycle states.
 * Never equate quote created with sent, Yoco paid with Xero reconciled, etc.
 */

export type XeroFinancialTruthState =
  | 'quote_created_titan'
  | 'quote_created_xero'
  | 'quote_sent_customer'
  | 'quote_accepted'
  | 'invoice_created_titan'
  | 'invoice_created_xero'
  | 'yoco_payment_link_created'
  | 'yoco_payment_completed'
  | 'xero_payment_recorded'
  | 'bank_transaction_imported'
  | 'xero_payment_reconciled'
  | 'invoice_fully_settled';

export type XeroFinancialTruthRow = {
  state: XeroFinancialTruthState;
  label: string;
  /** What TITAN may claim on UI at this state. */
  ownerVisibleClaim: string;
  /** States that must NOT be assumed equivalent. */
  notEquivalentTo: XeroFinancialTruthState[];
};

export const XERO_FINANCIAL_TRUTH_MATRIX: readonly XeroFinancialTruthRow[] = [
  {
    state: 'quote_created_titan',
    label: 'Quote created in TITAN',
    ownerVisibleClaim: 'Draft quote in TITAN — not yet in Xero',
    notEquivalentTo: ['quote_sent_customer', 'quote_accepted', 'invoice_created_titan'],
  },
  {
    state: 'quote_created_xero',
    label: 'Quote created in Xero',
    ownerVisibleClaim: 'Official Xero quote exists',
    notEquivalentTo: ['quote_sent_customer', 'quote_accepted'],
  },
  {
    state: 'quote_sent_customer',
    label: 'Quote sent to customer',
    ownerVisibleClaim: 'Customer-facing quote issued',
    notEquivalentTo: ['quote_accepted', 'invoice_created_titan', 'yoco_payment_completed'],
  },
  {
    state: 'quote_accepted',
    label: 'Quote accepted',
    ownerVisibleClaim: 'Customer accepted — not yet invoiced',
    notEquivalentTo: ['invoice_created_xero', 'yoco_payment_completed', 'xero_payment_recorded'],
  },
  {
    state: 'invoice_created_titan',
    label: 'Invoice created in TITAN',
    ownerVisibleClaim: 'TITAN invoice draft — official Xero number not assigned until push',
    notEquivalentTo: ['invoice_created_xero', 'yoco_payment_completed', 'invoice_fully_settled'],
  },
  {
    state: 'invoice_created_xero',
    label: 'Invoice created in Xero',
    ownerVisibleClaim: 'Official Xero invoice number assigned',
    notEquivalentTo: ['yoco_payment_completed', 'xero_payment_reconciled', 'invoice_fully_settled'],
  },
  {
    state: 'yoco_payment_link_created',
    label: 'Yoco payment link created',
    ownerVisibleClaim: 'Payment link available — no cash collected yet',
    notEquivalentTo: ['yoco_payment_completed', 'xero_payment_recorded'],
  },
  {
    state: 'yoco_payment_completed',
    label: 'Yoco payment completed',
    ownerVisibleClaim: 'Yoco reported payment — Xero reconciliation not proven',
    notEquivalentTo: ['xero_payment_recorded', 'xero_payment_reconciled', 'invoice_fully_settled'],
  },
  {
    state: 'xero_payment_recorded',
    label: 'Xero payment recorded',
    ownerVisibleClaim: 'Xero payment row imported or pushed',
    notEquivalentTo: ['bank_transaction_imported', 'xero_payment_reconciled'],
  },
  {
    state: 'bank_transaction_imported',
    label: 'Bank transaction imported',
    ownerVisibleClaim: 'Bank feed line present — not reconciled until Xero confirms',
    notEquivalentTo: ['xero_payment_reconciled', 'invoice_fully_settled'],
  },
  {
    state: 'xero_payment_reconciled',
    label: 'Xero payment reconciled',
    ownerVisibleClaim: 'Xero authoritative reconciliation evidence',
    notEquivalentTo: ['yoco_payment_completed'],
  },
  {
    state: 'invoice_fully_settled',
    label: 'Invoice fully settled',
    ownerVisibleClaim: 'Outstanding balance zero with authoritative payment evidence',
    notEquivalentTo: ['quote_accepted', 'yoco_payment_completed'],
  },
] as const;

/** Returns matrix rows whose states must never be conflated with the input. */
export function forbiddenFinancialTruthEquivalences(
  state: XeroFinancialTruthState,
): XeroFinancialTruthState[] {
  const row = XERO_FINANCIAL_TRUTH_MATRIX.find((entry) => entry.state === state);
  return row?.notEquivalentTo ?? [];
}
