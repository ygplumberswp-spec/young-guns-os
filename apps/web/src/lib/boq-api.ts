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
