import type {
  CocAttachmentState,
  DocumentEditScope,
  DocumentPhoto,
  DocumentSection,
  TitanDocumentStatus,
  TitanDocumentType,
  TitanReportKind,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as DocumentEngineApiClientError };

export type TitanDocumentSummary = {
  id: string;
  documentType: TitanDocumentType;
  reportKind: TitanReportKind | null;
  status: TitanDocumentStatus;
  version: number;
  documentNumber: string;
  title: string;
  customerId: string | null;
  propertyId: string | null;
  jobId: string | null;
  invoiceId: string | null;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TitanPaymentLinkView = {
  id: string;
  invoiceId: string;
  status: string;
  amountCents: number;
  currency: string;
  documentVersion: number;
  paymentUrl: string | null;
  providerPaymentLinkId: string | null;
  providerOrderId: string | null;
  /** Server-rendered SVG built from the stored Yoco URL, or null when absent. */
  qrSvg: string | null;
  payable: boolean;
  lastError: string | null;
  paidAt: string | null;
  auditCorrelationId: string | null;
};

export type TitanDocumentDetail = {
  document: TitanDocumentSummary;
  sections: DocumentSection[];
  photos: DocumentPhoto[];
  coc: CocAttachmentState;
  editScope: DocumentEditScope;
  paymentLink: TitanPaymentLinkView | null;
};

export type PaymentLinkPreview = {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string | null;
  outstandingCents: number;
  currency: string;
  documentVersion: number;
  eligibility: { eligible: boolean; code: string; reason: string };
  yocoConnected: boolean;
  /** Plain-language description of exactly what approval will do. */
  summary: { headline: string; lines: string[]; blocked: boolean; blockedReason: string | null };
  action: { action: 'create' | 'reuse' | 'regenerate' | 'none'; reason: string };
  existingLink: TitanPaymentLinkView | null;
  externalCallMade: boolean;
};

const BASE = '/documents/engine';

export async function listTitanDocuments(
  accessToken: string,
  filter: { documentType?: TitanDocumentType; status?: TitanDocumentStatus } = {},
) {
  const params = new URLSearchParams();
  if (filter.documentType) params.set('documentType', filter.documentType);
  if (filter.status) params.set('status', filter.status);
  const query = params.toString();

  return request<TitanDocumentSummary[]>(`${BASE}${query ? `?${query}` : ''}`, { accessToken });
}

export async function fetchTitanDocument(accessToken: string, documentId: string) {
  return request<TitanDocumentDetail>(`${BASE}/${documentId}`, { accessToken });
}

export async function createTitanDocument(
  accessToken: string,
  body: {
    documentType: TitanDocumentType;
    reportKind?: TitanReportKind | null;
    documentNumber: string;
    title: string;
    customerId?: string | null;
    propertyId?: string | null;
    jobId?: string | null;
    invoiceId?: string | null;
    quoteId?: string | null;
  },
) {
  return request<TitanDocumentSummary>(BASE, { method: 'POST', accessToken, body });
}

export async function saveTitanDocumentDraft(
  accessToken: string,
  documentId: string,
  patch: {
    title?: string;
    sections?: DocumentSection[];
    photos?: DocumentPhoto[];
    content?: Record<string, unknown>;
    cocDocumentationId?: string | null;
  },
) {
  return request<TitanDocumentSummary>(`${BASE}/${documentId}`, {
    method: 'PATCH',
    accessToken,
    body: patch,
  });
}

export async function ensureFinanceQuoteDocument(
  accessToken: string,
  quoteId: string,
  body: {
    documentNumber: string;
    title: string;
    customerId?: string | null;
    jobId?: string | null;
  },
): Promise<TitanDocumentDetail> {
  return request<TitanDocumentDetail>(`${BASE}/finance/quotes/${quoteId}/ensure`, {
    method: 'POST',
    accessToken,
    body,
  });
}

export async function ensureFinanceInvoiceDocument(
  accessToken: string,
  invoiceId: string,
  body: {
    documentNumber: string;
    title: string;
    customerId?: string | null;
    jobId?: string | null;
  },
): Promise<TitanDocumentDetail> {
  return request<TitanDocumentDetail>(`${BASE}/finance/invoices/${invoiceId}/ensure`, {
    method: 'POST',
    accessToken,
    body,
  });
}

export async function issueTitanDocument(
  accessToken: string,
  documentId: string,
  changeSummary?: string,
) {
  return request<TitanDocumentSummary>(`${BASE}/${documentId}/issue`, {
    method: 'POST',
    accessToken,
    body: { changeSummary },
  });
}

export async function fetchTitanDocumentVersions(accessToken: string, documentId: string) {
  return request<
    Array<{
      id: string;
      version: number;
      status: TitanDocumentStatus;
      changeSummary: string | null;
      createdAt: string;
    }>
  >(`${BASE}/${documentId}/versions`, { accessToken });
}

/** Draft step: describes the pending Yoco call without making it. */
export async function previewInvoicePaymentLink(accessToken: string, invoiceId: string) {
  return request<PaymentLinkPreview>(`${BASE}/invoices/${invoiceId}/payment-link/preview`, {
    accessToken,
  });
}

/** Approve & Execute: one Owner approval creates exactly one link. */
export async function approveInvoicePaymentLink(
  accessToken: string,
  invoiceId: string,
  body: { approvedOutstandingCents: number; documentId?: string | null },
) {
  return request<{ link: TitanPaymentLinkView; reused: boolean; correlationId: string }>(
    `${BASE}/invoices/${invoiceId}/payment-link`,
    { method: 'POST', accessToken, body },
  );
}

export type FinanceDirectPhotoUploadResult = {
  fileId: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  fileName: string;
  jobId: string;
  source: 'finance_direct';
};

export async function uploadFinanceStagingPhoto(
  accessToken: string,
  draftClientActionId: string,
  body: { fileName: string; mimeType: string; dataBase64: string; clientActionId?: string },
) {
  return request<FinanceDirectPhotoUploadResult>(
    `${BASE}/finance/staging/${encodeURIComponent(draftClientActionId)}/photos/upload`,
    { method: 'POST', accessToken, body },
  );
}

export async function uploadFinanceDocumentPhoto(
  accessToken: string,
  documentId: string,
  body: { fileName: string; mimeType: string; dataBase64: string; clientActionId?: string },
) {
  return request<FinanceDirectPhotoUploadResult>(
    `${BASE}/finance/documents/${documentId}/photos/upload`,
    { method: 'POST', accessToken, body },
  );
}

export function financeDirectPhotoContentUrl(storageKey: string): string {
  const params = new URLSearchParams({ storageKey });
  return `/api/v1/documents/engine/finance/photos/content?${params.toString()}`;
}
