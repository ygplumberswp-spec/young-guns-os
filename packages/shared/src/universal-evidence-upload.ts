/**
 * Universal camera / gallery / file upload contracts for TITAN job evidence.
 * Internal slips/receipts/evidence are never client-visible by default.
 */

import {
  FINANCE_PHOTO_ACCEPT,
  FINANCE_PHOTO_ALLOWED_MIME_TYPES,
  validateFinancePhotoFile,
  validateFinancePhotoMagicBytes,
} from './finance-document-photo-utils.js';
import type { JobEvidencePhase } from './job-evidence.js';
import type { MobileDocumentationType } from './mobile-workforce.js';

/** Operational attachment categories across job + paperwork workflows. */
export type EvidenceAttachmentCategory =
  | 'before_photo'
  | 'after_photo'
  | 'during_photo'
  | 'other_job_evidence'
  | 'job_card'
  | 'supplier_slip'
  | 'receipt'
  | 'coc'
  | 'inspection_report'
  | 'service_report'
  | 'customer_paperwork'
  | 'supplier_document'
  | 'other_attachment';

export const EVIDENCE_ATTACHMENT_CATEGORY_OPTIONS: Array<{
  value: EvidenceAttachmentCategory;
  label: string;
  /** Default: never auto-expose to Client portal. */
  defaultClientVisible: boolean;
  evidencePhase: JobEvidencePhase;
  documentationType: MobileDocumentationType;
}> = [
  { value: 'before_photo', label: 'Before photo', defaultClientVisible: false, evidencePhase: 'before', documentationType: 'photo' },
  { value: 'during_photo', label: 'During photo', defaultClientVisible: false, evidencePhase: 'during', documentationType: 'photo' },
  { value: 'after_photo', label: 'After photo', defaultClientVisible: false, evidencePhase: 'after', documentationType: 'photo' },
  { value: 'other_job_evidence', label: 'Other job evidence', defaultClientVisible: false, evidencePhase: 'document', documentationType: 'document' },
  { value: 'job_card', label: 'Job card', defaultClientVisible: false, evidencePhase: 'document', documentationType: 'document' },
  { value: 'supplier_slip', label: 'Supplier slip', defaultClientVisible: false, evidencePhase: 'document', documentationType: 'document' },
  { value: 'receipt', label: 'Receipt', defaultClientVisible: false, evidencePhase: 'document', documentationType: 'document' },
  { value: 'coc', label: 'COC', defaultClientVisible: false, evidencePhase: 'document', documentationType: 'document' },
  { value: 'inspection_report', label: 'Inspection report', defaultClientVisible: false, evidencePhase: 'document', documentationType: 'inspection_form' },
  { value: 'service_report', label: 'Service report', defaultClientVisible: false, evidencePhase: 'document', documentationType: 'document' },
  { value: 'customer_paperwork', label: 'Customer paperwork', defaultClientVisible: false, evidencePhase: 'document', documentationType: 'document' },
  { value: 'supplier_document', label: 'Supplier document', defaultClientVisible: false, evidencePhase: 'document', documentationType: 'document' },
  { value: 'other_attachment', label: 'Other attachment', defaultClientVisible: false, evidencePhase: 'document', documentationType: 'document' },
];

/** Soft guidance only — do not impose a low hard cap that blocks 50+ photos. */
export const EVIDENCE_UPLOAD_RECOMMENDED_BATCH_SIZE = 100;
/** Absolute safety ceiling for a single picker selection (memory), not a business photo limit. */
export const EVIDENCE_UPLOAD_HARD_BATCH_CEILING = 250;

export const UNIVERSAL_EVIDENCE_ACCEPT = FINANCE_PHOTO_ACCEPT;

export const UNIVERSAL_EVIDENCE_ALLOWED_MIME_TYPES = FINANCE_PHOTO_ALLOWED_MIME_TYPES;

export type EvidenceUploadSource = 'camera' | 'gallery' | 'file' | 'drag_drop';

export type EvidenceUploadItemStatus =
  | 'queued'
  | 'reading'
  | 'uploading'
  | 'pending_sync'
  | 'synced'
  | 'failed';

export function resolveEvidenceAttachmentCategory(
  value: string | null | undefined,
): (typeof EVIDENCE_ATTACHMENT_CATEGORY_OPTIONS)[number] | null {
  return EVIDENCE_ATTACHMENT_CATEGORY_OPTIONS.find((option) => option.value === value) ?? null;
}

export function defaultClientVisibleForCategory(category: EvidenceAttachmentCategory): boolean {
  return resolveEvidenceAttachmentCategory(category)?.defaultClientVisible ?? false;
}

/** Internal operational evidence must never auto-expose to Client. */
export function isInternalEvidenceCategory(category: EvidenceAttachmentCategory): boolean {
  return (
    category === 'supplier_slip' ||
    category === 'receipt' ||
    category === 'supplier_document' ||
    category === 'other_job_evidence' ||
    category === 'job_card' ||
    category === 'coc' ||
    category === 'inspection_report' ||
    category === 'service_report'
  );
}

export function validateEvidenceUploadFile(input: {
  mimeType: string;
  sizeBytes: number;
}): { ok: true } | { ok: false; message: string } {
  return validateFinancePhotoFile(input);
}

export function validateEvidenceUploadMagicBytes(mimeType: string, buffer: Buffer): boolean {
  return validateFinancePhotoMagicBytes(mimeType, buffer);
}

export function evidenceUploadProgressLabel(input: {
  completed: number;
  total: number;
  currentFileName?: string | null;
  status?: EvidenceUploadItemStatus;
}): string {
  const base = `Uploading ${input.completed}/${input.total}`;
  if (input.status === 'pending_sync') return `PENDING SYNC · ${base}`;
  if (input.currentFileName) return `${base} · ${input.currentFileName}`;
  return base;
}

export function mapPhaseToAttachmentCategory(
  phase: JobEvidencePhase | 'before' | 'during' | 'after' | 'document',
): EvidenceAttachmentCategory {
  switch (phase) {
    case 'before':
      return 'before_photo';
    case 'during':
      return 'during_photo';
    case 'after':
      return 'after_photo';
    case 'signature':
      return 'other_attachment';
    case 'document':
    default:
      return 'other_job_evidence';
  }
}

/**
 * Client portal visibility gate. Only explicitly shared attachments may appear
 * for customers — internal slips/receipts/evidence stay hidden by default.
 */
export function isAttachmentVisibleToClient(doc: {
  clientVisible?: boolean | null;
}): boolean {
  return doc.clientVisible === true;
}
