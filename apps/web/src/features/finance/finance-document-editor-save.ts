import type { DocumentPhoto } from '@titan/shared';
import { linkFinanceDocumentPhotos } from './finance-document-photos-persist';

export type LinkFinancePhotosInput = {
  documentType: 'quote' | 'invoice';
  recordId: string;
  documentNumber: string;
  title: string;
  customerId?: string | null;
  jobId?: string | null;
  photos: DocumentPhoto[];
};

/** Links staged or in-memory photos to the persisted Document Engine record. Never blocks save. */
export async function linkPhotosAfterFinanceSave(
  accessToken: string,
  input: LinkFinancePhotosInput,
): Promise<void> {
  if (!input.photos.length) return;
  try {
    await linkFinanceDocumentPhotos(accessToken, {
      documentType: input.documentType,
      quoteId: input.documentType === 'quote' ? input.recordId : undefined,
      invoiceId: input.documentType === 'invoice' ? input.recordId : undefined,
      documentNumber: input.documentNumber,
      title: input.title,
      customerId: input.customerId ?? null,
      jobId: input.jobId ?? null,
      photos: input.photos,
    });
  } catch {
    // Upload or link failure must never block Save or Save Draft.
  }
}
