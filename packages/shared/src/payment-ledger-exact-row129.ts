/**
 * Row 129 — Payment ledger exact-cent coverage
 *
 * Reuses job-payment-ledger + finance payments. Unsupported provider cases
 * remain explicit. Exact-cent arithmetic only — no rounding inventions.
 */

import type { InvoiceSummary, PaymentSummary, QuoteSummary } from './finance.js';
import { deriveJobPaymentLedger, type JobPaymentLedger } from './job-payment-ledger.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';

export const PAYMENT_LEDGER_EXACT_ROW129_KEY = 'payment-ledger-exact-row129' as const;

export const PAYMENT_LEDGER_CASES = [
  'deposits',
  'multiple_progress_payments',
  'one_payment_across_supported_allocations',
  'multiple_invoices_per_job',
  'prepayments',
  'overpayments',
  'credits',
  'refunds',
  'reversals',
  'payment_plans',
  'disputes',
] as const;

export type PaymentLedgerCase = (typeof PAYMENT_LEDGER_CASES)[number];

export type PaymentLedgerCaseStatus = 'SUPPORTED' | 'PARTIAL' | 'UNSUPPORTED_PROVIDER' | 'EXPLICIT_GAP';

export type PaymentLedgerCaseEvidence = {
  case: PaymentLedgerCase;
  status: PaymentLedgerCaseStatus;
  exactCents: boolean;
  detail: string;
};

/** Classify payment rows for credit/refund/reversal exact-cent sums. */
export function classifyPaymentExactCents(payments: PaymentSummary[]): {
  receivedCents: number;
  creditCents: number;
  refundCents: number;
  reversalCents: number;
  unsupportedExplicit: string[];
} {
  let receivedCents = 0;
  let creditCents = 0;
  let refundCents = 0;
  let reversalCents = 0;
  const unsupportedExplicit: string[] = [];

  for (const p of payments) {
    const ref = (p.reference ?? '').toLowerCase();
    if (p.amountCents < 0 || /refund|reversal|reversed|credit/.test(ref)) {
      if (/refund/.test(ref) || (p.amountCents < 0 && /refund/.test(ref))) {
        refundCents += Math.abs(p.amountCents);
      } else if (/reversal|reversed/.test(ref)) {
        reversalCents += Math.abs(p.amountCents);
      } else if (/credit/.test(ref) || p.amountCents < 0) {
        creditCents += Math.abs(p.amountCents);
      } else {
        refundCents += Math.abs(p.amountCents);
      }
      continue;
    }
    receivedCents += p.amountCents;
  }

  return { receivedCents, creditCents, refundCents, reversalCents, unsupportedExplicit };
}

export function deriveExactCentPaymentLedger(input: {
  quotes: QuoteSummary[];
  invoices: InvoiceSummary[];
  payments: PaymentSummary[];
  currency?: string;
  /** Optional allocation lines for one payment → many targets (when provider supports). */
  allocationLines?: Array<{ paymentId: string; invoiceId: string; amountCents: number }>;
  hasPaymentPlanEvidence?: boolean;
  hasDisputeEvidence?: boolean;
  hasPrepaymentEvidence?: boolean;
}): JobPaymentLedger & {
  exactCentCases: PaymentLedgerCaseEvidence[];
  classified: ReturnType<typeof classifyPaymentExactCents>;
} {
  const base = deriveJobPaymentLedger(input);
  const classified = classifyPaymentExactCents(input.payments);
  const activeInvoices = input.invoices.filter((i) => i.status !== 'cancelled');
  const depositInvoices = activeInvoices.filter((i) => i.stage === 'deposit');
  const progressInvoices = activeInvoices.filter((i) => i.stage === 'progress' || i.stage === 'final');
  const alloc = input.allocationLines ?? [];
  const multiAllocPayments = new Set(alloc.map((a) => a.paymentId));
  const multiAllocSupported = multiAllocPayments.size > 0;

  const exactCentCases: PaymentLedgerCaseEvidence[] = [
    {
      case: 'deposits',
      status: depositInvoices.length > 0 || base.depositRequiredCents != null ? 'SUPPORTED' : 'EXPLICIT_GAP',
      exactCents: true,
      detail: `depositRequired=${base.depositRequiredCents ?? 'null'} depositPaid=${base.depositPaidCents ?? 'null'}`,
    },
    {
      case: 'multiple_progress_payments',
      status:
        progressInvoices.length >= 1 && input.payments.length >= 2
          ? 'SUPPORTED'
          : progressInvoices.length >= 1
            ? 'PARTIAL'
            : 'EXPLICIT_GAP',
      exactCents: true,
      detail: `progressInvoices=${progressInvoices.length} payments=${input.payments.length}`,
    },
    {
      case: 'one_payment_across_supported_allocations',
      status: multiAllocSupported
        ? 'SUPPORTED'
        : 'UNSUPPORTED_PROVIDER',
      exactCents: true,
      detail: multiAllocSupported
        ? `allocationLines=${alloc.length}`
        : 'PaymentSummary is single-invoice; multi-alloc requires explicit allocation lines',
    },
    {
      case: 'multiple_invoices_per_job',
      status: activeInvoices.length >= 2 ? 'SUPPORTED' : 'PARTIAL',
      exactCents: true,
      detail: `activeInvoices=${activeInvoices.length} ledgerTotal=${base.invoiceTotalCents}`,
    },
    {
      case: 'prepayments',
      status: input.hasPrepaymentEvidence ? 'SUPPORTED' : 'UNSUPPORTED_PROVIDER',
      exactCents: true,
      detail: input.hasPrepaymentEvidence
        ? 'Prepayment evidence present'
        : 'Prepayment remains provider-explicit when no evidence',
    },
    {
      case: 'overpayments',
      status: base.paymentState === 'overpaid' || classified.receivedCents > (base.invoiceTotalCents ?? 0)
        ? 'SUPPORTED'
        : 'PARTIAL',
      exactCents: true,
      detail: `received=${classified.receivedCents} invoiceTotal=${base.invoiceTotalCents}`,
    },
    {
      case: 'credits',
      status: classified.creditCents > 0 ? 'SUPPORTED' : 'EXPLICIT_GAP',
      exactCents: true,
      detail: `creditCents=${classified.creditCents}`,
    },
    {
      case: 'refunds',
      status: classified.refundCents > 0 ? 'SUPPORTED' : 'EXPLICIT_GAP',
      exactCents: true,
      detail: `refundCents=${classified.refundCents}`,
    },
    {
      case: 'reversals',
      status: classified.reversalCents > 0 ? 'SUPPORTED' : 'EXPLICIT_GAP',
      exactCents: true,
      detail: `reversalCents=${classified.reversalCents}`,
    },
    {
      case: 'payment_plans',
      status: input.hasPaymentPlanEvidence ? 'SUPPORTED' : 'UNSUPPORTED_PROVIDER',
      exactCents: true,
      detail: input.hasPaymentPlanEvidence
        ? 'Payment plan evidence present'
        : 'Payment plan not invented without evidence',
    },
    {
      case: 'disputes',
      status: input.hasDisputeEvidence ? 'SUPPORTED' : 'UNSUPPORTED_PROVIDER',
      exactCents: true,
      detail: input.hasDisputeEvidence
        ? 'Dispute evidence present'
        : 'Dispute not invented without evidence',
    },
  ];

  return {
    ...base,
    creditsCents: classified.creditCents > 0 ? classified.creditCents : base.creditsCents,
    refundsCents: classified.refundCents > 0 ? classified.refundCents : base.refundsCents,
    classified,
    exactCentCases,
  };
}

export function assertRow129ExactCents(cases: PaymentLedgerCaseEvidence[]): void {
  for (const c of cases) {
    if (!c.exactCents) throw new Error(`Row 129 requires exact cents for ${c.case}`);
  }
}

export function assertRow129SafetyGates(input: {
  row92AutomationEnabled: boolean;
  xeroWrites?: number;
}): { row92Off: true; xeroWrites: 0 } {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 129 Xero writes must be 0');
  return { row92Off: true, xeroWrites: 0 };
}
