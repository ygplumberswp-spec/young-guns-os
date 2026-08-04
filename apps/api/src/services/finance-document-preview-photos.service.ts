import type { DocumentPhoto, FinanceDocumentPreviewAttachment } from '@titan/shared';
import { documentPhotoIncludedInPdf } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { and, eq } from 'drizzle-orm';
import { mobileJobDocumentation } from '@titan/db';
import type { JobEvidenceStorageService } from './job-evidence-storage.service.js';

export async function buildFinancePreviewAttachments(
  db: DatabaseClient,
  storage: JobEvidenceStorageService,
  companyId: string,
  photos: DocumentPhoto[] | undefined,
): Promise<FinanceDocumentPreviewAttachment[]> {
  if (!photos?.length) return [];

  const included = photos.filter(documentPhotoIncludedInPdf);
  const attachments: FinanceDocumentPreviewAttachment[] = [];

  for (const photo of included) {
    const doc = await db.query.mobileJobDocumentation.findFirst({
      where: and(
        eq(mobileJobDocumentation.id, photo.documentationId),
        eq(mobileJobDocumentation.companyId, companyId),
        eq(mobileJobDocumentation.jobId, photo.jobId),
      ),
    });
    if (!doc?.storageKey) continue;

    const { buffer, metadata } = await storage.read({
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
      dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
    });
  }

  return attachments;
}
