import type { InvoiceSummary, PaymentSummary, QuoteSummary } from './finance.js';
import type { JobExecutionPhase } from './job-execution.js';
import type { JobStatus } from './jobs.js';

/** Truthful payment states — only assigned when underlying records support them. */
export type JobPaymentState =
  | 'no_invoice'
  | 'draft_invoice'
  | 'deposit_required'
  | 'deposit_unpaid'
  | 'deposit_partially_paid'
  | 'deposit_paid'
  | 'awaiting_payment'
  | 'partially_paid'
  | 'paid_in_full'
  | 'overdue'
  | 'payment_plan'
  | 'promise_to_pay'
  | 'disputed'
  | 'overpaid'
  | 'refunded'
  | 'written_off'
  | 'voided';

export const JOB_PAYMENT_STATE_LABELS: Record<JobPaymentState, string> = {
  no_invoice: 'No invoice',
  draft_invoice: 'Draft invoice',
  deposit_required: 'Deposit required',
  deposit_unpaid: 'Deposit unpaid',
  deposit_partially_paid: 'Deposit partially paid',
  deposit_paid: 'Deposit paid',
  awaiting_payment: 'Awaiting payment',
  partially_paid: 'Partially paid',
  paid_in_full: 'Paid in full',
  overdue: 'Overdue',
  payment_plan: 'Payment plan',
  promise_to_pay: 'Promise to pay',
  disputed: 'Disputed',
  overpaid: 'Overpaid',
  refunded: 'Refunded',
  written_off: 'Written off',
  voided: 'Voided',
};

export type JobPaymentLedger = {
  quotedCents: number | null;
  approvedQuoteCents: number | null;
  invoiceTotalCents: number | null;
  jobTotalCents: number | null;
  depositRequiredCents: number | null;
  depositPaidCents: number | null;
  totalReceivedCents: number;
  creditsCents: number | null;
  refundsCents: number | null;
  writeOffsCents: number | null;
  balanceOwingCents: number | null;
  overdueCents: number | null;
  nextDueDate: string | null;
  paymentState: JobPaymentState;
  paymentStateLabel: string;
  lastPaymentAt: string | null;
  paymentCount: number;
  currency: string;
  /** False when no quotes, invoices or payments exist — UI must not show false zeroes. */
  hasFinanceData: boolean;
};

export type JobListFinanceSnapshot = Pick<
  JobPaymentLedger,
  | 'jobTotalCents'
  | 'depositRequiredCents'
  | 'depositPaidCents'
  | 'totalReceivedCents'
  | 'balanceOwingCents'
  | 'paymentState'
  | 'paymentStateLabel'
  | 'lastPaymentAt'
  | 'paymentCount'
  | 'currency'
  | 'hasFinanceData'
> & {
  quoteStatus: string | null;
  invoiceStatus: string | null;
};

export type DeriveJobPaymentLedgerInput = {
  quotes: QuoteSummary[];
  invoices: InvoiceSummary[];
  payments: PaymentSummary[];
  currency?: string;
};

function sumCents(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

function activeInvoices(invoices: InvoiceSummary[]): InvoiceSummary[] {
  return invoices.filter((invoice) => invoice.status !== 'cancelled');
}

function depositInvoices(invoices: InvoiceSummary[]): InvoiceSummary[] {
  return activeInvoices(invoices).filter((invoice) => invoice.stage === 'deposit');
}

function computeDepositRequiredCents(
  acceptedQuote: QuoteSummary | null,
  invoices: InvoiceSummary[],
): number | null {
  const depositInvoiceTotal = sumCents(depositInvoices(invoices).map((invoice) => invoice.totalCents));
  if (depositInvoiceTotal > 0) return depositInvoiceTotal;
  if (acceptedQuote?.depositPercent && acceptedQuote.depositPercent > 0) {
    return Math.round((acceptedQuote.totalCents * acceptedQuote.depositPercent) / 100);
  }
  if (acceptedQuote?.depositPercent === 0) return 0;
  return null;
}

function computeDepositPaidCents(invoices: InvoiceSummary[], payments: PaymentSummary[]): number {
  const depositInvoiceIds = new Set(depositInvoices(invoices).map((invoice) => invoice.id));
  if (depositInvoiceIds.size === 0) return 0;
  return sumCents(
    payments.filter((payment) => depositInvoiceIds.has(payment.invoiceId)).map((payment) => payment.amountCents),
  );
}

export function deriveJobPaymentState(input: DeriveJobPaymentLedgerInput): JobPaymentState {
  const { quotes, invoices, payments } = input;
  const active = activeInvoices(invoices);
  const acceptedQuote = quotes.find((quote) => quote.status === 'accepted') ?? null;
  const hasVoidedOnly =
    invoices.length > 0 && active.length === 0 && invoices.every((invoice) => invoice.status === 'cancelled');

  if (hasVoidedOnly) return 'voided';
  if (active.length === 0) {
    if (acceptedQuote && computeDepositRequiredCents(acceptedQuote, invoices) != null) {
      const required = computeDepositRequiredCents(acceptedQuote, invoices)!;
      if (required > 0) return 'deposit_required';
    }
    return 'no_invoice';
  }

  if (active.every((invoice) => invoice.status === 'draft')) return 'draft_invoice';

  const invoiceTotalCents = sumCents(active.map((invoice) => invoice.totalCents));
  const totalReceivedCents = sumCents(payments.map((payment) => payment.amountCents));
  const balanceOwingCents = sumCents(active.map((invoice) => invoice.outstandingCents));
  const overdueCents = sumCents(
    active.filter((invoice) => invoice.isOverdue).map((invoice) => invoice.outstandingCents),
  );
  const depositRequired = computeDepositRequiredCents(acceptedQuote, invoices);
  const depositPaid = computeDepositPaidCents(invoices, payments);

  if (depositRequired != null && depositRequired > 0) {
    if (depositPaid <= 0) return 'deposit_unpaid';
    if (depositPaid < depositRequired) return 'deposit_partially_paid';
    if (balanceOwingCents > 0 && depositPaid >= depositRequired) {
      // Deposit satisfied; fall through to balance states below unless only deposit invoice exists.
    } else if (balanceOwingCents === 0 && depositPaid >= depositRequired) {
      return invoiceTotalCents > 0 && totalReceivedCents >= invoiceTotalCents ? 'paid_in_full' : 'deposit_paid';
    }
  }

  if (totalReceivedCents > invoiceTotalCents && invoiceTotalCents > 0) return 'overpaid';
  if (balanceOwingCents === 0 && totalReceivedCents > 0) return 'paid_in_full';
  if (overdueCents > 0) return 'overdue';
  if (totalReceivedCents > 0 && balanceOwingCents > 0) return 'partially_paid';
  if (balanceOwingCents > 0 && totalReceivedCents === 0) return 'awaiting_payment';

  return 'awaiting_payment';
}

export function deriveJobPaymentLedger(input: DeriveJobPaymentLedgerInput): JobPaymentLedger {
  const currency =
    input.currency ??
    input.quotes[0]?.currency ??
    input.invoices[0]?.currency ??
    input.payments[0]?.currency ??
    'ZAR';

  const acceptedQuote = input.quotes.find((quote) => quote.status === 'accepted') ?? null;
  const active = activeInvoices(input.invoices);
  const quotedCents =
    input.quotes.length > 0 ? sumCents(input.quotes.map((quote) => quote.totalCents)) : null;
  const approvedQuoteCents = acceptedQuote?.totalCents ?? null;
  const invoiceTotalCents = active.length > 0 ? sumCents(active.map((invoice) => invoice.totalCents)) : null;
  const jobTotalCents = invoiceTotalCents ?? approvedQuoteCents ?? quotedCents;
  const depositRequiredCents = computeDepositRequiredCents(acceptedQuote, input.invoices);
  const depositPaidCents =
    depositRequiredCents != null ? computeDepositPaidCents(input.invoices, input.payments) : null;
  const totalReceivedCents = sumCents(input.payments.map((payment) => payment.amountCents));
  const balanceOwingCents =
    active.length > 0 ? sumCents(active.map((invoice) => invoice.outstandingCents)) : null;
  const overdueCents =
    active.length > 0
      ? sumCents(
          active.filter((invoice) => invoice.isOverdue).map((invoice) => invoice.outstandingCents),
        )
      : null;
  const nextDueDate =
    active
      .filter((invoice) => invoice.dueDate && invoice.outstandingCents > 0)
      .map((invoice) => invoice.dueDate!)
      .sort()[0] ?? null;
  const lastPaymentAt =
    input.payments.length > 0
      ? [...input.payments].sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0]!.paidAt
      : null;
  const paymentState = deriveJobPaymentState(input);
  const hasFinanceData =
    input.quotes.length > 0 || input.invoices.length > 0 || input.payments.length > 0;

  return {
    quotedCents,
    approvedQuoteCents,
    invoiceTotalCents,
    jobTotalCents,
    depositRequiredCents,
    depositPaidCents,
    totalReceivedCents,
    creditsCents: null,
    refundsCents: null,
    writeOffsCents: null,
    balanceOwingCents,
    overdueCents,
    nextDueDate,
    paymentState,
    paymentStateLabel: JOB_PAYMENT_STATE_LABELS[paymentState],
    lastPaymentAt,
    paymentCount: input.payments.length,
    currency,
    hasFinanceData,
  };
}

export function deriveJobListFinanceSnapshot(input: DeriveJobPaymentLedgerInput & {
  quoteStatus?: string | null;
  invoiceStatus?: string | null;
}): JobListFinanceSnapshot {
  const ledger = deriveJobPaymentLedger(input);
  const latestQuote = input.quotes[0] ?? null;
  const latestInvoice = input.invoices[0] ?? null;

  return {
    jobTotalCents: ledger.jobTotalCents,
    depositRequiredCents: ledger.depositRequiredCents,
    depositPaidCents: ledger.depositPaidCents,
    totalReceivedCents: ledger.totalReceivedCents,
    balanceOwingCents: ledger.balanceOwingCents,
    paymentState: ledger.paymentState,
    paymentStateLabel: ledger.paymentStateLabel,
    lastPaymentAt: ledger.lastPaymentAt,
    paymentCount: ledger.paymentCount,
    currency: ledger.currency,
    hasFinanceData: ledger.hasFinanceData,
    quoteStatus: input.quoteStatus ?? latestQuote?.status ?? null,
    invoiceStatus: input.invoiceStatus ?? latestInvoice?.status ?? null,
  };
}

/** Display lifecycle label combining job status, execution phase and finance context. */
export type JobLifecycleLabel =
  | 'New'
  | 'Awaiting quote'
  | 'Quote sent'
  | 'Quote accepted'
  | 'Scheduled'
  | 'Assigned'
  | 'Travelling'
  | 'On site'
  | 'Waiting for parts'
  | 'Waiting for customer'
  | 'Work completed'
  | 'Ready to invoice'
  | 'Invoiced'
  | 'Partially paid'
  | 'Paid'
  | 'Cancelled'
  | 'Archived';

export function deriveJobLifecycleLabel(input: {
  status: JobStatus;
  executionPhase?: JobExecutionPhase | null;
  quotes?: QuoteSummary[];
  invoices?: InvoiceSummary[];
  quoteStatus?: string | null;
  invoiceStatus?: string | null;
  ledger: Pick<JobPaymentLedger, 'paymentState' | 'hasFinanceData'>;
}): JobLifecycleLabel {
  if (input.status === 'cancelled') return 'Cancelled';

  const quotes = input.quotes ?? [];
  const invoices = input.invoices ?? [];
  const sentQuote = quotes.find((quote) =>
    ['sent', 'viewed', 'accepted'].includes(quote.status),
  );
  const acceptedQuote = quotes.find((quote) => quote.status === 'accepted');
  const hasInvoice =
    invoices.some((invoice) => invoice.status !== 'cancelled') ||
    (input.invoiceStatus != null && input.invoiceStatus !== 'cancelled');
  const phase = input.executionPhase ?? null;

  if (input.ledger.paymentState === 'paid_in_full') return 'Paid';
  if (input.ledger.paymentState === 'partially_paid' || input.ledger.paymentState === 'overdue') {
    return 'Partially paid';
  }
  if (hasInvoice) return 'Invoiced';
  if (input.status === 'completed') return 'Ready to invoice';
  if (phase === 'completed' || phase === 'ready_to_complete') return 'Work completed';
  if (phase === 'awaiting_parts') return 'Waiting for parts';
  if (phase === 'awaiting_customer') return 'Waiting for customer';
  if (phase === 'on_site' || phase === 'in_progress') return 'On site';
  if (phase === 'en_route') return 'Travelling';
  if (phase === 'assigned' || phase === 'accepted') return 'Assigned';
  if (input.status === 'scheduled') return 'Scheduled';
  if (acceptedQuote || input.quoteStatus === 'accepted') return 'Quote accepted';
  if (sentQuote || input.quoteStatus === 'sent' || input.quoteStatus === 'viewed') return 'Quote sent';
  if (quotes.length === 0 && !input.ledger.hasFinanceData && !input.quoteStatus) return 'Awaiting quote';
  return 'New';
}
