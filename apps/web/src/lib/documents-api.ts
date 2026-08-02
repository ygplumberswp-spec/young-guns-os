import type {
  CreateDocumentCategoryRequest,
  CreateDocumentRequest,
  ComplianceWorkspaceResponse,
  DocumentCategorySummary,
  DocumentDetail,
  DocumentSummary,
  DocumentsStats,
  UpdateDocumentRequest,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchDocumentsComplianceWorkspace(
  accessToken: string,
): Promise<ComplianceWorkspaceResponse> {
  return request<ComplianceWorkspaceResponse>('/documents/compliance/workspace', { accessToken });
}

export async function fetchDocumentsStats(accessToken: string): Promise<DocumentsStats> {
  return request<DocumentsStats>('/documents/stats', { accessToken });
}

export async function fetchDocumentCategories(
  accessToken: string,
): Promise<DocumentCategorySummary[]> {
  const data = await request<{ categories: DocumentCategorySummary[] }>('/documents/categories', {
    accessToken,
  });
  return data.categories;
}

export async function createDocumentCategory(
  accessToken: string,
  body: CreateDocumentCategoryRequest,
): Promise<DocumentCategorySummary> {
  const data = await request<{ category: DocumentCategorySummary }>('/documents/categories', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.category;
}

export async function fetchDocuments(accessToken: string): Promise<DocumentSummary[]> {
  const data = await request<{ documents: DocumentSummary[] }>('/documents/documents', {
    accessToken,
  });
  return data.documents;
}

export async function fetchDocument(
  accessToken: string,
  documentId: string,
): Promise<DocumentDetail> {
  const data = await request<{ document: DocumentDetail }>(`/documents/documents/${documentId}`, {
    accessToken,
  });
  return data.document;
}

export async function createDocument(
  accessToken: string,
  body: CreateDocumentRequest,
): Promise<DocumentDetail> {
  const data = await request<{ document: DocumentDetail }>('/documents/documents', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.document;
}

export async function updateDocument(
  accessToken: string,
  documentId: string,
  body: UpdateDocumentRequest,
): Promise<DocumentDetail> {
  const data = await request<{ document: DocumentDetail }>(`/documents/documents/${documentId}`, {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.document;
}
