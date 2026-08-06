import type { InvoiceStage, InvoiceSummary, JobFinanceSummary, QuoteSummary } from './finance.js';

export type JobCashChainStepId = 'booked' | 'completed' | 'invoiced' | 'paid';

export type JobCashChainStep = {
  id: JobCashChainStepId;
  label: string;
  done: boolean;
  detail: string | null;
};

/** Freeze §9 / §11 — Booked → Completed → Invoiced → Paid chain for office billing workflow. */
export function deriveJobCashChainSteps(input: {
  jobStatus: string;
  hasCompletionSnapshot: boolean;
  financeSummary: Pick<JobFinanceSummary, 'invoices' | 'payments'> | null;
}): JobCashChainStep[] {
  const invoiceRows = input.financeSummary?.invoices ?? [];
  const paymentRows = input.financeSummary?.payments ?? [];
  const invoiced = invoiceRows.length > 0;
  const paid =
    paymentRows.length > 0 ||
    (invoiceRows.length > 0 && invoiceRows.every((invoice) => invoice.status === 'paid'));
  const completed = input.jobStatus === 'completed' || input.hasCompletionSnapshot;
  let completedDetail = 'Awaiting gated mobile completion';
  if (input.hasCompletionSnapshot) {
    completedDetail = 'Gated mobile completion snapshot recorded';
  } else if (input.jobStatus === 'completed') {
    completedDetail =
      'Office status is completed — no gated mobile snapshot on record yet';
  }

  const outstandingCents = invoiceRows.reduce((sum, invoice) => sum + invoice.outstandingCents, 0);

  return [
    {
      id: 'booked',
      label: 'Booked',
      done: true,
      detail: 'Job exists in TITAN',
    },
    {
      id: 'completed',
      label: 'Completed',
      done: completed,
      detail: completedDetail,
    },
    {
      id: 'invoiced',
      label: 'Invoiced',
      done: invoiced,
      detail: invoiced
        ? `${invoiceRows.length} invoice(s) linked`
        : 'No invoice linked yet',
    },
    {
      id: 'paid',
      label: 'Paid',
      done: paid && outstandingCents === 0,
      detail:
        outstandingCents > 0
          ? 'Outstanding balance remains'
          : paid
            ? 'Payments recorded'
            : 'No payments recorded',
    },
  ];
}

export function findAcceptedQuoteForInvoicing(quotes: QuoteSummary[]): QuoteSummary | null {
  return quotes.find((quote) => quote.status === 'accepted') ?? null;
}

/** Suggest the next deposit/progress/final stage based on invoices already on the job. */
export function suggestNextInvoiceStage(
  invoices: InvoiceSummary[],
  options: { depositPercent?: number | null } = {},
): InvoiceStage {
  const stages = new Set(invoices.map((invoice) => invoice.stage));
  if (options.depositPercent && options.depositPercent > 0 && !stages.has('deposit')) {
    return 'deposit';
  }
  if (stages.has('deposit') && !stages.has('final') && !stages.has('progress')) {
    return 'final';
  }
  if (stages.has('progress') && !stages.has('final')) {
    return 'final';
  }
  if (stages.size === 0) {
    return 'standard';
  }
  return 'standard';
}

export function canInvoiceFromAcceptedQuote(quotes: QuoteSummary[]): boolean {
  return findAcceptedQuoteForInvoicing(quotes) != null;
}

export function buildPaymentRecordHref(input: {
  invoiceId?: string | null;
  jobId?: string | null;
}): string {
  const params = new URLSearchParams();
  if (input.invoiceId) params.set('invoiceId', input.invoiceId);
  if (input.jobId) params.set('jobId', input.jobId);
  const query = params.toString();
  return query ? `/finance/payments/new?${query}` : '/finance/payments/new';
}

export const XERO_SYNC_BLOCKED_REASON = {
  notConfigured: 'Xero OAuth is not configured on this server.',
  notConnected: 'Connect Xero before running entity sync.',
} as const;
