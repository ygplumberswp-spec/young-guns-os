import type { DocumentPhoto } from '@titan/shared';
import {
  ensureFinanceInvoiceDocument,
  ensureFinanceQuoteDocument,
  saveTitanDocumentDraft,
} from '../../lib/document-engine-api-client';

export async function linkFinanceDocumentPhotos(
  accessToken: string,
  input: {
    documentType: 'quote' | 'invoice';
    quoteId?: string;
    invoiceId?: string;
    documentNumber: string;
    title: string;
    customerId?: string | null;
    jobId?: string | null;
    photos: DocumentPhoto[];
  },
): Promise<void> {
  if (!input.photos.length) return;

  const detail =
    input.documentType === 'quote' && input.quoteId
      ? await ensureFinanceQuoteDocument(accessToken, input.quoteId, {
          documentNumber: input.documentNumber,
          title: input.title,
          customerId: input.customerId ?? null,
          jobId: input.jobId ?? null,
        })
      : input.invoiceId
        ? await ensureFinanceInvoiceDocument(accessToken, input.invoiceId, {
            documentNumber: input.documentNumber,
            title: input.title,
            customerId: input.customerId ?? null,
            jobId: input.jobId ?? null,
          })
        : null;

  if (!detail) return;
  await saveTitanDocumentDraft(accessToken, detail.document.id, { photos: input.photos });
}
