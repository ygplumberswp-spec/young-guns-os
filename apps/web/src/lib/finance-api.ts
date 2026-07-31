import type {
  CreateInvoiceFromQuoteRequest,
  CreateInvoiceRequest,
  CreatePaymentRequest,
  CreateQuoteRequest,
  CreateQuoteVersionRequest,
  FinanceListQuery,
  FinanceStats,
  InvoiceDetail,
  InvoiceSummary,
  JobFinanceSummary,
  PaymentDetail,
  PaymentSummary,
  QuoteDetail,
  QuoteSummary,
  UpdateQuoteRequest,
} from '@titan/shared';
import { request } from './api-client';

function toQuery(query?: FinanceListQuery): string {
  if (!query) return '';
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set('q', query.q.trim());
  if (query.status?.trim()) params.set('status', query.status.trim());
  if (query.outstandingOnly) params.set('outstandingOnly', 'true');
  if (query.overdueOnly) params.set('overdueOnly', 'true');
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

export async function fetchFinanceStats(accessToken: string): Promise<FinanceStats> {
  return request<FinanceStats>('/finance/stats', { accessToken });
}

export async function fetchQuotes(
  accessToken: string,
  query?: FinanceListQuery,
): Promise<QuoteSummary[]> {
  const data = await request<{ quotes: QuoteSummary[] }>(`/finance/quotes${toQuery(query)}`, {
    accessToken,
  });
  return data.quotes;
}

export async function fetchQuote(accessToken: string, quoteId: string): Promise<QuoteDetail> {
  const data = await request<{ quote: QuoteDetail }>(`/finance/quotes/${quoteId}`, { accessToken });
  return data.quote;
}

export async function createQuote(
  accessToken: string,
  body: CreateQuoteRequest,
): Promise<QuoteSummary> {
  const data = await request<{ quote: QuoteSummary }>('/finance/quotes', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.quote;
}

export async function updateQuote(
  accessToken: string,
  quoteId: string,
  body: UpdateQuoteRequest,
): Promise<QuoteDetail> {
  const data = await request<{ quote: QuoteDetail }>(`/finance/quotes/${quoteId}`, {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.quote;
}

export async function issueQuote(accessToken: string, quoteId: string): Promise<QuoteDetail> {
  const data = await request<{ quote: QuoteDetail }>(`/finance/quotes/${quoteId}/issue`, {
    method: 'POST',
    accessToken,
    body: {},
  });
  return data.quote;
}

export async function createQuoteVersion(
  accessToken: string,
  quoteId: string,
  body: CreateQuoteVersionRequest,
): Promise<QuoteSummary> {
  const data = await request<{ quote: QuoteSummary }>(`/finance/quotes/${quoteId}/versions`, {
    method: 'POST',
    accessToken,
    body,
  });
  return data.quote;
}

export async function createInvoiceFromQuote(
  accessToken: string,
  quoteId: string,
  body: CreateInvoiceFromQuoteRequest,
): Promise<InvoiceSummary> {
  const data = await request<{ invoice: InvoiceSummary }>(`/finance/quotes/${quoteId}/invoices`, {
    method: 'POST',
    accessToken,
    body,
  });
  return data.invoice;
}

export async function fetchInvoices(
  accessToken: string,
  query?: FinanceListQuery,
): Promise<InvoiceSummary[]> {
  const data = await request<{ invoices: InvoiceSummary[] }>(`/finance/invoices${toQuery(query)}`, {
    accessToken,
  });
  return data.invoices;
}

export async function fetchInvoice(accessToken: string, invoiceId: string): Promise<InvoiceDetail> {
  const data = await request<{ invoice: InvoiceDetail }>(`/finance/invoices/${invoiceId}`, {
    accessToken,
  });
  return data.invoice;
}

export async function createInvoice(
  accessToken: string,
  body: CreateInvoiceRequest,
): Promise<InvoiceSummary> {
  const data = await request<{ invoice: InvoiceSummary }>('/finance/invoices', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.invoice;
}

export async function fetchPayments(
  accessToken: string,
  query?: FinanceListQuery,
): Promise<PaymentSummary[]> {
  const data = await request<{ payments: PaymentSummary[] }>(`/finance/payments${toQuery(query)}`, {
    accessToken,
  });
  return data.payments;
}

export async function fetchPayment(accessToken: string, paymentId: string): Promise<PaymentDetail> {
  const data = await request<{ payment: PaymentDetail }>(`/finance/payments/${paymentId}`, {
    accessToken,
  });
  return data.payment;
}

export async function createPayment(
  accessToken: string,
  body: CreatePaymentRequest,
): Promise<PaymentSummary> {
  const data = await request<{ payment: PaymentSummary }>('/finance/payments', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.payment;
}

export async function fetchJobFinanceSummary(
  accessToken: string,
  jobId: string,
): Promise<JobFinanceSummary> {
  const data = await request<{ summary: JobFinanceSummary }>(
    `/finance/jobs/${jobId}/finance-summary`,
    { accessToken },
  );
  return data.summary;
}
