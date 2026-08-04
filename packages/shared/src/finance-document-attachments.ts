/** Finance quote/invoice photos and file attachments (Phase J-6.4). */

export const FINANCE_ATTACHMENT_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
] as const;

export type FinanceAttachmentMimeType = (typeof FINANCE_ATTACHMENT_ALLOWED_MIME_TYPES)[number];

export type FinanceAttachmentSource = 'upload' | 'job_evidence';

export type FinanceDocumentAttachment = {
  id: string;
  companyId: string;
  quoteId: string | null;
  invoiceId: string | null;
  draftClientActionId: string | null;
  source: FinanceAttachmentSource;
  jobId: string | null;
  /** References `mobile_job_documentation.id` when source is job_evidence — no duplicate bytes. */
  documentationId: string | null;
  storageKey: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  caption: string | null;
  sortOrder: number;
  includeInPdf: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FinanceJobEvidencePickerItem = {
  documentationId: string;
  jobId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  title: string;
  documentationType: string;
  evidenceKind: 'photo' | 'document' | 'coc';
  createdAt: string;
  alreadyLinked: boolean;
};

export type UploadFinanceAttachmentRequest = {
  fileName: string;
  mimeType: string;
  dataBase64: string;
  clientActionId?: string | null;
  caption?: string | null;
  includeInPdf?: boolean;
};

export type LinkFinanceJobEvidenceRequest = {
  documentationId: string;
  caption?: string | null;
  includeInPdf?: boolean;
  clientActionId?: string | null;
};

export type UpdateFinanceAttachmentRequest = {
  caption?: string | null;
  includeInPdf?: boolean;
  sortOrder?: number;
};

export type ReorderFinanceAttachmentsRequest = {
  attachmentIds: string[];
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

export function isFinanceAttachmentMimeType(value: string): value is FinanceAttachmentMimeType {
  return (FINANCE_ATTACHMENT_ALLOWED_MIME_TYPES as readonly string[]).includes(value.toLowerCase());
}

export function validateFinanceAttachmentFile(input: {
  mimeType: string;
  sizeBytes: number;
}): { ok: true } | { ok: false; code: string; message: string } {
  const mime = input.mimeType.trim().toLowerCase();
  if (!isFinanceAttachmentMimeType(mime)) {
    return {
      ok: false,
      code: 'INVALID_FILE_TYPE',
      message: 'Files must be JPG, PNG, WebP, HEIC or PDF',
    };
  }
  if (input.sizeBytes <= 0) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'File is empty' };
  }
  const max = mime === 'application/pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (input.sizeBytes > max) {
    return {
      ok: false,
      code: 'FILE_TOO_LARGE',
      message: `File exceeds the ${Math.round(max / (1024 * 1024))} MB limit`,
    };
  }
  return { ok: true };
}

export function financeAttachmentContentPath(attachmentId: string): string {
  return `/finance/attachments/${attachmentId}/content`;
}

export function financeAttachmentIsImage(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith('image/');
}

export function normaliseFinanceAttachmentOrder(
  attachments: readonly FinanceDocumentAttachment[],
): FinanceDocumentAttachment[] {
  return [...attachments]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
    .map((item, index) => ({ ...item, sortOrder: index }));
}

export function mergeFinanceAttachmentUpdates(
  attachment: FinanceDocumentAttachment,
  update: UpdateFinanceAttachmentRequest,
): FinanceDocumentAttachment {
  return {
    ...attachment,
    caption: update.caption !== undefined ? update.caption : attachment.caption,
    includeInPdf:
      update.includeInPdf !== undefined ? update.includeInPdf : attachment.includeInPdf,
    sortOrder: update.sortOrder !== undefined ? update.sortOrder : attachment.sortOrder,
  };
}
