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
