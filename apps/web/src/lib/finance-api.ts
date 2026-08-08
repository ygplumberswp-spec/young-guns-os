import type {
  CreateInvoiceFromQuoteRequest,
  CreateInvoiceRequest,
  CreatePaymentRequest,
  CreateQuoteRequest,
  CreateQuoteVersionRequest,
  FinanceCatalogueItemSearchResult,
  FinanceCustomerSearchResult,
  FinanceDocumentPreviewInput,
  FinanceDocumentPreviewModel,
  FinanceListQuery,
  FinanceStats,
  InvoiceDetail,
  InvoiceSummary,
  JobFinanceSummary,
  PaymentDetail,
  PaymentSummary,
  QuoteDetail,
  QuoteSummary,
  UpdateInvoiceRequest,
  UpdateQuoteRequest,
} from '@titan/shared';
import { request, requestBlob } from './api-client';

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

export async function searchFinanceCustomers(
  accessToken: string,
  query: string,
): Promise<FinanceCustomerSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  const data = await request<{ customers: FinanceCustomerSearchResult[] }>(
    `/finance/customers/search?${params.toString()}`,
    { accessToken },
  );
  return data.customers;
}

export async function searchFinanceCatalogue(
  accessToken: string,
  query: string,
  filters?: { category?: string | null; itemType?: string | null },
): Promise<FinanceCatalogueItemSearchResult[]> {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query);
  if (filters?.category?.trim()) params.set('category', filters.category.trim());
  if (filters?.itemType?.trim()) params.set('itemType', filters.itemType.trim());
  const data = await request<{ items: FinanceCatalogueItemSearchResult[] }>(
    `/finance/catalogue/search?${params.toString()}`,
    { accessToken },
  );
  return data.items;
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

export async function createInvoiceFromJob(
  accessToken: string,
  jobId: string,
  body: CreateInvoiceFromQuoteRequest,
): Promise<InvoiceSummary> {
  const data = await request<{ invoice: InvoiceSummary }>(`/finance/jobs/${jobId}/invoices`, {
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

export async function updateInvoice(
  accessToken: string,
  invoiceId: string,
  body: UpdateInvoiceRequest,
): Promise<InvoiceDetail> {
  const data = await request<{ invoice: InvoiceDetail }>(`/finance/invoices/${invoiceId}`, {
    method: 'PATCH',
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

export async function previewFinanceDocument(
  accessToken: string,
  body: FinanceDocumentPreviewInput,
): Promise<FinanceDocumentPreviewModel> {
  const data = await request<{ preview: FinanceDocumentPreviewModel }>('/finance/documents/preview', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.preview;
}

export type FinanceDocumentPdfPreview = {
  blob: Blob;
  filename: string;
};

export async function previewFinanceDocumentPdf(
  accessToken: string,
  body: FinanceDocumentPreviewInput,
): Promise<FinanceDocumentPdfPreview> {
  const blob = await requestBlob('/finance/documents/preview/pdf', {
    method: 'POST',
    accessToken,
    body,
    timeoutMs: 60_000,
    headers: { 'Content-Type': 'application/json', Accept: 'application/pdf' },
  });

  if (blob.type && blob.type !== 'application/pdf') {
    throw new Error('Preview did not return a PDF document');
  }

  const filename =
    body.kind === 'quote' ? 'YGP-Draft-Quote.pdf' : 'YGP-Draft-Invoice.pdf';

  return { blob, filename };
}

export async function fetchJobCostControlQueue(
  accessToken: string,
): Promise<import('@titan/shared').JobCostControlQueue> {
  const data = await request<{ queue: import('@titan/shared').JobCostControlQueue }>(
    '/finance/job-cost-control',
    { accessToken },
  );
  return data.queue;
}

export async function fetchJobLinkageControlQueue(
  accessToken: string,
): Promise<import('@titan/shared').JobLinkageControlQueue> {
  const data = await request<{ queue: import('@titan/shared').JobLinkageControlQueue }>(
    '/finance/job-linkage-control',
    { accessToken },
  );
  return data.queue;
}

export type PricebookRuleSetDto = import('@titan/shared').PricebookRuleSet;

export async function fetchPricebookRuleSet(accessToken: string): Promise<{
  ruleSet: PricebookRuleSetDto;
  persisted: boolean;
  globalAutomationEnabled: false;
  message: string;
}> {
  return request('/finance/pricebook-rules', { accessToken });
}

export async function savePricebookRuleDraft(
  accessToken: string,
  body: {
    name?: string;
    baseCostType?: PricebookRuleSetDto['baseCostType'];
    status?: 'DRAFT' | 'INACTIVE';
    tiers: PricebookRuleSetDto['tiers'];
  },
): Promise<{ ruleSet: PricebookRuleSetDto; created: boolean; unchanged: boolean }> {
  const data = await request<{
    ruleSet: PricebookRuleSetDto;
    created: boolean;
    unchanged: boolean;
  }>('/finance/pricebook-rules/draft', {
    accessToken,
    method: 'PUT',
    body,
  });
  return data;
}

export async function previewPricebookBaseCost(
  accessToken: string,
  body: { baseCostCents: number | null; isDiscountedNet?: boolean; costSource?: string },
): Promise<{
  result: import('@titan/shared').PricebookResolveResult;
  ruleStatus: string;
  ruleVersion: number;
  globalAutomationEnabled: false;
  applied: 0;
}> {
  return request('/finance/pricebook-rules/preview', {
    accessToken,
    method: 'POST',
    body,
  });
}

export async function fetchPricebookBulkImpact(accessToken: string): Promise<{
  rows: import('@titan/shared').PricebookBulkImpactRow[];
  applied: 0;
  proposedCount: number;
  missingCostCount: number;
  reviewRequiredCount: number;
  catalogueRowCount: number;
  globalAutomationEnabled: false;
  note: string;
}> {
  return request('/finance/pricebook-rules/bulk-impact', { accessToken });
}
