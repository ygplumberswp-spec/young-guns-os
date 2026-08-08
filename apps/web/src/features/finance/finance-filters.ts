import type {
  BoqDocumentSummary,
  DraftWorkspaceSummary,
  InvoiceSummary,
  PaymentSummary,
  QuoteSummary,
} from '@titan/shared';
import {
  invoiceMatchesCanonicalFilter,
  quoteMatchesCanonicalFilter,
  resolveCanonicalInvoiceDisplayStatus,
  resolveCanonicalQuoteDisplayStatus,
  type CanonicalInvoiceListFilter,
  type CanonicalQuoteListFilter,
} from '@titan/shared';

export type QuoteListFilter = CanonicalQuoteListFilter;

export type InvoiceListFilter = CanonicalInvoiceListFilter | 'cancelled';

export type BoqListFilter = 'all' | 'drafts' | 'approved' | 'archived';

export type PaymentListFilter = 'all' | 'allocated' | 'unallocated' | 'reversed';

export type CompactFilterOption<T extends string = string> = {
  id: T;
  label: string;
};

export const QUOTE_LIST_FILTERS: CompactFilterOption<QuoteListFilter>[] = [
  { id: 'all', label: 'All' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'awaiting_approval', label: 'Awaiting Approval' },
  { id: 'sent', label: 'Sent' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'declined', label: 'Declined' },
  { id: 'archived', label: 'Archived' },
];

export const INVOICE_LIST_FILTERS: CompactFilterOption<InvoiceListFilter>[] = [
  { id: 'all', label: 'All' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'awaiting_approval', label: 'Awaiting Approval' },
  { id: 'awaiting_payment', label: 'Awaiting Payment' },
  { id: 'partially_paid', label: 'Partially Paid' },
  { id: 'paid', label: 'Paid' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'voided', label: 'Voided' },
  { id: 'cancelled', label: 'Voided' },
  { id: 'archived', label: 'Archived' },
];

export const BOQ_LIST_FILTERS: CompactFilterOption<BoqListFilter>[] = [
  { id: 'all', label: 'All' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'approved', label: 'Approved' },
  { id: 'archived', label: 'Archived' },
];

export const PAYMENT_LIST_FILTERS: CompactFilterOption<PaymentListFilter>[] = [
  { id: 'all', label: 'All' },
  { id: 'allocated', label: 'Allocated' },
  { id: 'unallocated', label: 'Unallocated' },
  { id: 'reversed', label: 'Reversed/Refunded' },
];

/** Draft badge — never treat issued, approved, paid, or Xero-synced records as drafts. */
export function isQuoteDraft(quote: Pick<QuoteSummary, 'status' | 'isImmutable' | 'issuedAt'>): boolean {
  if (quote.status !== 'draft') return false;
  if (quote.isImmutable) return false;
  if (quote.issuedAt) return false;
  return true;
}

export function isInvoiceDraft(
  invoice: Pick<InvoiceSummary, 'status' | 'xeroInvoiceNumber' | 'numberAuthority'>,
): boolean {
  if (invoice.status !== 'draft') return false;
  if (invoice.xeroInvoiceNumber?.trim()) return false;
  if (invoice.numberAuthority === 'xero') return false;
  return true;
}

export function isBoqDraft(document: Pick<BoqDocumentSummary, 'status'>): boolean {
  return document.status === 'draft';
}

export function quoteDisplayStatus(quote: QuoteSummary): string {
  return resolveCanonicalQuoteDisplayStatus(quote);
}

export function invoiceDisplayStatus(
  invoice: InvoiceSummary,
  asOfDate?: string | null,
): string {
  const balanceDueCents =
    invoice.outstandingCents ??
    Math.max(0, (invoice.totalCents ?? 0) - (invoice.amountPaidCents ?? 0));
  return resolveCanonicalInvoiceDisplayStatus({
    status: invoice.status,
    dueDate: invoice.dueDate,
    balanceDueCents,
    asOfDate,
    xeroInvoiceNumber: invoice.xeroInvoiceNumber,
    numberAuthority: invoice.numberAuthority,
  });
}

export function quoteMatchesFilter(quote: QuoteSummary, filter: QuoteListFilter): boolean {
  if (filter === 'drafts') return isQuoteDraft(quote);
  return quoteMatchesCanonicalFilter(quote, filter);
}

export function invoiceMatchesFilter(invoice: InvoiceSummary, filter: InvoiceListFilter): boolean {
  if (filter === 'drafts') return isInvoiceDraft(invoice);
  const balanceDueCents =
    invoice.outstandingCents ??
    Math.max(0, (invoice.totalCents ?? 0) - (invoice.amountPaidCents ?? 0));
  const canonicalFilter: CanonicalInvoiceListFilter =
    filter === 'cancelled' ? 'voided' : filter;
  return invoiceMatchesCanonicalFilter(
    {
      status: invoice.status,
      dueDate: invoice.dueDate,
      balanceDueCents,
      xeroInvoiceNumber: invoice.xeroInvoiceNumber,
      numberAuthority: invoice.numberAuthority,
    },
    canonicalFilter,
  );
}

export function boqMatchesFilter(document: BoqDocumentSummary, filter: BoqListFilter): boolean {
  switch (filter) {
    case 'all':
      return document.status !== 'cancelled';
    case 'drafts':
      return isBoqDraft(document);
    case 'approved':
      return document.status === 'approved';
    case 'archived':
      return document.status === 'cancelled' || document.status === 'converted';
    default:
      return true;
  }
}

export function paymentMatchesFilter(payment: PaymentSummary, filter: PaymentListFilter): boolean {
  switch (filter) {
    case 'all':
      return payment.amountCents >= 0;
    case 'allocated':
      return Boolean(payment.invoiceId) && payment.amountCents > 0;
    case 'unallocated':
      return Boolean(payment.invoiceId) && !payment.xeroPaymentId && payment.amountCents > 0;
    case 'reversed':
      return (
        payment.amountCents < 0 ||
        /refund|reversal|reversed/i.test(payment.reference ?? '')
      );
    default:
      return true;
  }
}

/** Workspace drafts with no persisted record — avoid duplicating rows already in the list. */
export function visibleWorkspaceDrafts<T extends { id: string }>(
  drafts: DraftWorkspaceSummary[],
  records: T[],
  options: {
    filter: string;
    isDraftRecord: (record: T) => boolean;
    includeArchived?: boolean;
  },
): DraftWorkspaceSummary[] {
  const recordIds = new Set(records.map((row) => row.id));
  return drafts.filter((draft) => {
    if (options.includeArchived) {
      return draft.status === 'archived';
    }
    if (draft.status !== 'active') return false;
    if (draft.recordId && recordIds.has(draft.recordId)) return false;
    if (options.filter === 'drafts' || options.filter === 'all') {
      if (draft.recordId) {
        const linked = records.find((row) => row.id === draft.recordId);
        if (linked && options.isDraftRecord(linked)) return false;
      }
      return true;
    }
    return false;
  });
}

export function quoteApiStatus(filter: QuoteListFilter): string | undefined {
  if (filter === 'drafts') return 'draft';
  if (filter === 'declined') return 'declined';
  if (filter === 'accepted') return 'accepted';
  if (filter === 'sent') return 'sent';
  return undefined;
}

export function invoiceApiStatus(filter: InvoiceListFilter): string | undefined {
  if (filter === 'drafts') return 'draft';
  if (filter === 'awaiting_payment') return 'sent';
  if (filter === 'partially_paid') return 'partial';
  if (filter === 'paid') return 'paid';
  if (filter === 'overdue') return 'overdue';
  if (filter === 'cancelled' || filter === 'archived') return 'cancelled';
  return undefined;
}

export function boqApiStatus(filter: BoqListFilter): string | undefined {
  if (filter === 'drafts') return 'draft';
  if (filter === 'approved') return 'approved';
  return undefined;
}
