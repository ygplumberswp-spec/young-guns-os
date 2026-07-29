export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'partial' | 'overdue' | 'cancelled';

export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'other';

export const QUOTE_STATUS_OPTIONS: Array<{ value: QuoteStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'expired', label: 'Expired' },
];

export const INVOICE_STATUS_OPTIONS: Array<{ value: InvoiceStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'paid', label: 'Paid' },
  { value: 'partial', label: 'Partial' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const PAYMENT_METHOD_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'other', label: 'Other' },
];

export type QuoteSummary = {
  id: string;
  quoteNumber: string;
  title: string;
  status: QuoteStatus;
  customerId: string;
  customerName: string;
  jobId: string | null;
  jobTitle: string | null;
  amountCents: number;
  currency: string;
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceSummary = {
  id: string;
  invoiceNumber: string;
  title: string;
  status: InvoiceStatus;
  customerId: string;
  customerName: string;
  jobId: string | null;
  jobTitle: string | null;
  amountCents: number;
  amountPaidCents: number;
  currency: string;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentSummary = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceTitle: string;
  customerName: string;
  amountCents: number;
  currency: string;
  method: PaymentMethod;
  reference: string | null;
  paidAt: string;
  createdAt: string;
};

export type FinanceStats = {
  openQuoteCount: number;
  revenueMtdCents: number;
  currency: string;
  invoiceCount: number;
  paymentCount: number;
};

export type CreateQuoteRequest = {
  customerId: string;
  jobId?: string | null;
  title: string;
  status?: QuoteStatus;
  amountCents: number;
  currency?: string;
  validUntil?: string | null;
  notes?: string | null;
};

export type CreateInvoiceRequest = {
  customerId: string;
  jobId?: string | null;
  quoteId?: string | null;
  title: string;
  status?: InvoiceStatus;
  amountCents: number;
  currency?: string;
  dueDate?: string | null;
  notes?: string | null;
  issuedAt?: string | null;
};

export type CreatePaymentRequest = {
  invoiceId: string;
  amountCents: number;
  currency?: string;
  method?: PaymentMethod;
  reference?: string | null;
  paidAt?: string;
  notes?: string | null;
};

export function formatMoney(amountCents: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(amountCents / 100);
}

export function parseMoneyInput(value: string): number | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.replace(/[^0-9.-]/g, '');
  const parsed = Number.parseFloat(normalized);

  if (Number.isNaN(parsed)) {
    return null;
  }

  return Math.round(parsed * 100);
}
