import type {
  CreateInvoiceRequest,
  CreatePaymentRequest,
  CreateQuoteRequest,
  FinanceStats,
  InvoiceSummary,
  PaymentSummary,
  QuoteSummary,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchFinanceStats(accessToken: string): Promise<FinanceStats> {
  return request<FinanceStats>('/finance/stats', { accessToken });
}

export async function fetchQuotes(accessToken: string): Promise<QuoteSummary[]> {
  const data = await request<{ quotes: QuoteSummary[] }>('/finance/quotes', { accessToken });
  return data.quotes;
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

export async function fetchInvoices(accessToken: string): Promise<InvoiceSummary[]> {
  const data = await request<{ invoices: InvoiceSummary[] }>('/finance/invoices', { accessToken });
  return data.invoices;
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

export async function fetchPayments(accessToken: string): Promise<PaymentSummary[]> {
  const data = await request<{ payments: PaymentSummary[] }>('/finance/payments', { accessToken });
  return data.payments;
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
