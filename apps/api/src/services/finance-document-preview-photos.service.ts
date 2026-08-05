import type { DocumentPhoto, FinanceDocumentPreviewAttachment } from '@titan/shared';
import { documentPhotoIncludedInPdf } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { and, eq } from 'drizzle-orm';
import { mobileJobDocumentation } from '@titan/db';
import type { JobEvidenceStorageService } from './job-evidence-storage.service.js';
import type { FinanceDocumentEvidenceStorageService } from './finance-document-evidence-storage.service.js';

export async function buildFinancePreviewAttachments(
  db: DatabaseClient,
  jobStorage: JobEvidenceStorageService,
  financeStorage: FinanceDocumentEvidenceStorageService,
  companyId: string,
  photos: DocumentPhoto[] | undefined,
): Promise<FinanceDocumentPreviewAttachment[]> {
  if (!photos?.length) return [];

  const included = photos.filter(documentPhotoIncludedInPdf);
  const attachments: FinanceDocumentPreviewAttachment[] = [];

  for (const photo of included) {
    if (photo.source === 'finance_direct' && photo.storageKey) {
      try {
        const { metadata, buffer } = await financeStorage.read({
          companyId,
          storageKey: photo.storageKey,
        });
        const mimeType = metadata.mimeType.toLowerCase();
        if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') continue;
        attachments.push({
          fileName: photo.fileName,
          mimeType,
          caption: photo.caption,
          dataUrl: mimeType.startsWith('image/') ? `data:${mimeType};base64,${buffer.toString('base64')}` : null,
          role: photo.role,
        });
      } catch {
        continue;
      }
      continue;
    }

    const doc = await db.query.mobileJobDocumentation.findFirst({
      where: and(
        eq(mobileJobDocumentation.id, photo.documentationId),
        eq(mobileJobDocumentation.companyId, companyId),
        eq(mobileJobDocumentation.jobId, photo.jobId),
      ),
    });
    if (!doc?.storageKey) continue;

    const { buffer, metadata } = await jobStorage.read({
      companyId,
      jobId: photo.jobId,
      storageKey: doc.storageKey,
    });
    const mimeType = metadata.mimeType.toLowerCase();
    if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') continue;

    attachments.push({
      fileName: photo.fileName,
      mimeType,
      caption: photo.caption,
      dataUrl: mimeType.startsWith('image/') ? `data:${mimeType};base64,${buffer.toString('base64')}` : null,
      role: photo.role,
    });
  }

  return attachments;
}
