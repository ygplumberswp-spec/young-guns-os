import type {
  EvidenceAttachmentCategory,
  EvidenceUploadSource,
  UploadJobEvidenceRequest,
} from '@titan/shared';
import {
  EVIDENCE_UPLOAD_HARD_BATCH_CEILING,
  resolveEvidenceAttachmentCategory,
  validateEvidenceUploadFile,
} from '@titan/shared';

export async function evidenceFileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function normaliseEvidenceMimeType(file: File): string {
  const type = file.type.trim().toLowerCase();
  if (type) return type;
  const name = file.name.toLowerCase();
  if (name.endsWith('.heic')) return 'image/heic';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.pdf')) return 'application/pdf';
  return type;
}

export function validateEvidenceClientFile(file: File): string | null {
  const mimeType = normaliseEvidenceMimeType(file);
  const validation = validateEvidenceUploadFile({ mimeType, sizeBytes: file.size });
  return validation.ok ? null : validation.message;
}

export function clampEvidenceBatch(files: File[]): { accepted: File[]; truncated: number } {
  if (files.length <= EVIDENCE_UPLOAD_HARD_BATCH_CEILING) {
    return { accepted: files, truncated: 0 };
  }
  return {
    accepted: files.slice(0, EVIDENCE_UPLOAD_HARD_BATCH_CEILING),
    truncated: files.length - EVIDENCE_UPLOAD_HARD_BATCH_CEILING,
  };
}

export function newEvidenceClientActionId(prefix = 'evidence'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildEvidenceUploadRequest(input: {
  file: File;
  dataBase64: string;
  category: EvidenceAttachmentCategory;
  clientActionId: string;
  uploadSource: EvidenceUploadSource;
}): UploadJobEvidenceRequest {
  const resolved = resolveEvidenceAttachmentCategory(input.category);
  const mimeType = normaliseEvidenceMimeType(input.file);
  const documentationType = resolved?.documentationType ?? (mimeType === 'application/pdf' ? 'document' : 'photo');
  const evidencePhase = resolved?.evidencePhase ?? 'document';
  const title =
    resolved && (resolved.value === 'before_photo' || resolved.value === 'during_photo' || resolved.value === 'after_photo')
      ? `${resolved.label}`
      : input.file.name;

  return {
    documentationType,
    title,
    mimeType,
    dataBase64: input.dataBase64,
    fileName: input.file.name,
    evidencePhase,
    attachmentCategory: input.category,
    // Server forces false; never request client exposure from field/office upload.
    clientVisible: false,
    metadata: {
      attachmentCategory: input.category,
      uploadSource: input.uploadSource,
      capturedAt: new Date().toISOString(),
      originalName: input.file.name,
      sizeBytes: input.file.size,
      clientVisible: false,
    },
    clientActionId: input.clientActionId,
  };
}
