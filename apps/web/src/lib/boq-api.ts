import { request } from './api-client';
import type {
  BoqDocumentDetail,
  BoqDocumentSummary,
  ConvertBoqToQuoteRequest,
  CreateBoqDocumentRequest,
  UpdateBoqDocumentRequest,
} from '@titan/shared';

export async function fetchBoqDocuments(
  accessToken: string,
  query?: { q?: string; status?: string },
): Promise<BoqDocumentSummary[]> {
  const params = new URLSearchParams();
  if (query?.q?.trim()) params.set('q', query.q.trim());
  if (query?.status?.trim()) params.set('status', query.status.trim());
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const data = await request<{ documents: BoqDocumentSummary[] }>(`/boq${suffix}`, { accessToken });
  return data.documents;
}

export async function fetchBoqDocument(accessToken: string, id: string): Promise<BoqDocumentDetail> {
  const data = await request<{ document: BoqDocumentDetail }>(`/boq/${id}`, { accessToken });
  return data.document;
}

export async function createBoqDocument(
  accessToken: string,
  body: CreateBoqDocumentRequest,
): Promise<BoqDocumentSummary> {
  const data = await request<{ document: BoqDocumentSummary }>('/boq', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.document;
}

export async function updateBoqDocument(
  accessToken: string,
  id: string,
  body: UpdateBoqDocumentRequest,
): Promise<BoqDocumentDetail> {
  const data = await request<{ document: BoqDocumentDetail }>(`/boq/${id}`, {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.document;
}

export async function convertBoqToQuote(
  accessToken: string,
  id: string,
  body: ConvertBoqToQuoteRequest,
) {
  const data = await request<{ quote: { id: string } }>(`/boq/${id}/convert-to-quote`, {
    method: 'POST',
    accessToken,
    body,
  });
  return data.quote;
}

export type BoqWorkbookImportDetail = {
  import: {
    id: string;
    originalFilename: string;
    fileHashSha256: string;
    revisionLabel: string | null;
    importVersion: number;
    status: string;
    sheetOrder: string[];
    warnings: string[];
    auraNarrativeFacts: string[];
  };
  sheets: Array<{ id: string; sheetName: string; sheetOrder: number }>;
  rows: Array<{
    id: string;
    sheetName: string;
    originalRowNumber: number;
    sectionLabel: string | null;
    rowKind: string;
    itemCode: string | null;
    description: string | null;
    unit: string | null;
    quantity: string | null;
    formulaText: string | null;
    displayValue: string | null;
    warnings: string[];
    reviewState: string;
  }>;
  automaticPricing: false;
  supplierMatching: false;
  idempotentReplay?: boolean;
};

export async function importBoqWorkbook(
  accessToken: string,
  body: {
    originalFilename: string;
    contentBase64: string;
    revisionLabel?: string | null;
    clientActionId?: string | null;
  },
): Promise<BoqWorkbookImportDetail> {
  const data = await request<BoqWorkbookImportDetail>('/finance/boq-imports', {
    method: 'POST',
    accessToken,
    body,
  });
  return data;
}

export async function fetchBoqWorkbookImport(
  accessToken: string,
  importId: string,
): Promise<BoqWorkbookImportDetail> {
  const data = await request<BoqWorkbookImportDetail>(`/finance/boq-imports/${importId}`, {
    accessToken,
  });
  return data;
}

export type SupplierQuoteMatchDetail = {
  import: {
    id: string;
    originalFilename: string;
    fileHashSha256: string;
    supplierName: string | null;
    status: string;
    auraNarrativeFacts: string[];
  };
  lines: Array<{
    id: string;
    clientKey: string;
    supplierSku: string | null;
    description: string | null;
    unit: string | null;
    quantity: string | null;
    unitPriceCents: number | null;
    vatBasis: string;
  }>;
  proposals: Array<{
    id: string;
    proposalKey: string;
    matchState: string;
    signalsUsed: string[];
    warnings: string[];
    boqImportRowId: string | null;
    supplierSku: string | null;
    description: string | null;
    unitPriceCents: number | null;
    vatBasis: string;
    humanConfirmed: boolean;
  }>;
  catalogueMutation: false;
  quotePriceMutation: false;
  idempotentReplay?: boolean;
};

export async function runSupplierQuoteBoqMatch(
  accessToken: string,
  boqImportId: string,
  body: {
    originalFilename: string;
    supplierName?: string | null;
    revisionLabel?: string | null;
    clientActionId?: string | null;
    supplierLines: Array<{
      clientKey: string;
      sourceLineOrder: number;
      supplierSku?: string | null;
      description?: string | null;
      unit?: string | null;
      quantity?: number | null;
      packSize?: number | null;
      unitPriceCents?: number | null;
      vatBasis?: 'INCLUSIVE' | 'EXCLUSIVE' | 'UNKNOWN' | null;
      currency?: string | null;
    }>;
  },
): Promise<SupplierQuoteMatchDetail> {
  const data = await request<SupplierQuoteMatchDetail>(
    `/finance/boq-imports/${boqImportId}/supplier-quote-matches`,
    { method: 'POST', accessToken, body },
  );
  return data;
}

export async function fetchSupplierQuoteMatch(
  accessToken: string,
  importId: string,
): Promise<SupplierQuoteMatchDetail> {
  const data = await request<SupplierQuoteMatchDetail>(
    `/finance/supplier-quote-imports/${importId}`,
    { accessToken },
  );
  return data;
}

export async function confirmSupplierQuoteMatchProposal(
  accessToken: string,
  importId: string,
  proposalId: string,
) {
  return request(`/finance/supplier-quote-imports/${importId}/proposals/${proposalId}/confirm`, {
    method: 'POST',
    accessToken,
  });
}

export async function rejectSupplierQuoteMatchProposal(
  accessToken: string,
  importId: string,
  proposalId: string,
) {
  return request(`/finance/supplier-quote-imports/${importId}/proposals/${proposalId}/reject`, {
    method: 'POST',
    accessToken,
  });
}
