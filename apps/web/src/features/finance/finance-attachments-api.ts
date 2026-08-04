import type {
  FinanceDocumentAttachment,
  FinanceJobEvidencePickerItem,
  LinkFinanceJobEvidenceRequest,
  ReorderFinanceAttachmentsRequest,
  UpdateFinanceAttachmentRequest,
  UploadFinanceAttachmentRequest,
} from '@titan/shared';
import { request } from '../../lib/api-client';

export async function fetchQuoteAttachments(
  accessToken: string,
  quoteId: string,
): Promise<FinanceDocumentAttachment[]> {
  const data = await request<{ attachments: FinanceDocumentAttachment[] }>(
    `/finance/quotes/${quoteId}/attachments`,
    { accessToken },
  );
  return data.attachments;
}

export async function fetchInvoiceAttachments(
  accessToken: string,
  invoiceId: string,
): Promise<FinanceDocumentAttachment[]> {
  const data = await request<{ attachments: FinanceDocumentAttachment[] }>(
    `/finance/invoices/${invoiceId}/attachments`,
    { accessToken },
  );
  return data.attachments;
}

export async function fetchStagingAttachments(
  accessToken: string,
  clientActionId: string,
): Promise<FinanceDocumentAttachment[]> {
  const data = await request<{ attachments: FinanceDocumentAttachment[] }>(
    `/finance/attachments/staging/${clientActionId}`,
    { accessToken },
  );
  return data.attachments;
}

export async function uploadQuoteAttachment(
  accessToken: string,
  quoteId: string,
  body: UploadFinanceAttachmentRequest,
): Promise<FinanceDocumentAttachment> {
  const data = await request<{ attachment: FinanceDocumentAttachment }>(
    `/finance/quotes/${quoteId}/attachments`,
    { method: 'POST', accessToken, body },
  );
  return data.attachment;
}

export async function uploadInvoiceAttachment(
  accessToken: string,
  invoiceId: string,
  body: UploadFinanceAttachmentRequest,
): Promise<FinanceDocumentAttachment> {
  const data = await request<{ attachment: FinanceDocumentAttachment }>(
    `/finance/invoices/${invoiceId}/attachments`,
    { method: 'POST', accessToken, body },
  );
  return data.attachment;
}

export async function uploadStagingAttachment(
  accessToken: string,
  clientActionId: string,
  body: UploadFinanceAttachmentRequest,
): Promise<FinanceDocumentAttachment> {
  const data = await request<{ attachment: FinanceDocumentAttachment }>(
    `/finance/attachments/staging/${clientActionId}`,
    { method: 'POST', accessToken, body },
  );
  return data.attachment;
}

export async function linkStagingAttachmentsToDocument(
  accessToken: string,
  clientActionId: string,
  target: { quoteId?: string; invoiceId?: string },
): Promise<number> {
  const data = await request<{ linked: number }>(
    `/finance/attachments/staging/${clientActionId}/link-document`,
    { method: 'POST', accessToken, body: target },
  );
  return data.linked;
}

export async function updateFinanceAttachment(
  accessToken: string,
  attachmentId: string,
  body: UpdateFinanceAttachmentRequest,
): Promise<FinanceDocumentAttachment> {
  const data = await request<{ attachment: FinanceDocumentAttachment }>(
    `/finance/attachments/${attachmentId}`,
    { method: 'PATCH', accessToken, body },
  );
  return data.attachment;
}

export async function reorderQuoteAttachments(
  accessToken: string,
  quoteId: string,
  body: ReorderFinanceAttachmentsRequest,
): Promise<FinanceDocumentAttachment[]> {
  const data = await request<{ attachments: FinanceDocumentAttachment[] }>(
    `/finance/quotes/${quoteId}/attachments/reorder`,
    { method: 'POST', accessToken, body },
  );
  return data.attachments;
}

export async function reorderInvoiceAttachments(
  accessToken: string,
  invoiceId: string,
  body: ReorderFinanceAttachmentsRequest,
): Promise<FinanceDocumentAttachment[]> {
  const data = await request<{ attachments: FinanceDocumentAttachment[] }>(
    `/finance/invoices/${invoiceId}/attachments/reorder`,
    { method: 'POST', accessToken, body },
  );
  return data.attachments;
}

export async function deleteFinanceAttachment(
  accessToken: string,
  attachmentId: string,
): Promise<void> {
  await request<undefined>(`/finance/attachments/${attachmentId}`, {
    method: 'DELETE',
    accessToken,
  });
}

export async function replaceFinanceAttachment(
  accessToken: string,
  attachmentId: string,
  body: UploadFinanceAttachmentRequest,
): Promise<FinanceDocumentAttachment> {
  const data = await request<{ attachment: FinanceDocumentAttachment }>(
    `/finance/attachments/${attachmentId}/replace`,
    { method: 'POST', accessToken, body },
  );
  return data.attachment;
}

export async function linkQuoteJobEvidence(
  accessToken: string,
  quoteId: string,
  body: LinkFinanceJobEvidenceRequest,
): Promise<FinanceDocumentAttachment> {
  const data = await request<{ attachment: FinanceDocumentAttachment }>(
    `/finance/quotes/${quoteId}/attachments/link-evidence`,
    { method: 'POST', accessToken, body },
  );
  return data.attachment;
}

export async function linkInvoiceJobEvidence(
  accessToken: string,
  invoiceId: string,
  body: LinkFinanceJobEvidenceRequest,
): Promise<FinanceDocumentAttachment> {
  const data = await request<{ attachment: FinanceDocumentAttachment }>(
    `/finance/invoices/${invoiceId}/attachments/link-evidence`,
    { method: 'POST', accessToken, body },
  );
  return data.attachment;
}

export async function linkStagingJobEvidence(
  accessToken: string,
  draftClientActionId: string,
  body: LinkFinanceJobEvidenceRequest,
): Promise<FinanceDocumentAttachment> {
  const data = await request<{ attachment: FinanceDocumentAttachment }>(
    `/finance/attachments/staging/${draftClientActionId}/link-evidence`,
    { method: 'POST', accessToken, body },
  );
  return data.attachment;
}

export async function reorderStagingAttachments(
  accessToken: string,
  draftClientActionId: string,
  body: ReorderFinanceAttachmentsRequest,
): Promise<FinanceDocumentAttachment[]> {
  const data = await request<{ attachments: FinanceDocumentAttachment[] }>(
    `/finance/attachments/staging/${draftClientActionId}/reorder`,
    { method: 'POST', accessToken, body },
  );
  return data.attachments;
}

export async function fetchSelectableJobEvidence(
  accessToken: string,
  jobId: string,
  scope: { quoteId?: string; invoiceId?: string; draftClientActionId?: string },
): Promise<FinanceJobEvidencePickerItem[]> {
  const params = new URLSearchParams();
  if (scope.quoteId) params.set('quoteId', scope.quoteId);
  if (scope.invoiceId) params.set('invoiceId', scope.invoiceId);
  if (scope.draftClientActionId) params.set('draftClientActionId', scope.draftClientActionId);
  const data = await request<{ items: FinanceJobEvidencePickerItem[] }>(
    `/finance/jobs/${jobId}/selectable-evidence?${params.toString()}`,
    { accessToken },
  );
  return data.items;
}

export function financeAttachmentContentUrl(attachmentId: string): string {
  return `/api/v1/finance/attachments/${attachmentId}/content`;
}
