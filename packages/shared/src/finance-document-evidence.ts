/** Finance quote/invoice direct evidence — bytes stored outside job evidence when no job is linked. */

import { validateFinancePhotoFile, validateFinancePhotoMagicBytes } from './finance-document-photo-utils.js';

/** Sentinel job id for document-engine photos backed by finance direct storage. */
export const FINANCE_DIRECT_EVIDENCE_SCOPE = '00000000-0000-4000-8000-000000000001';

/**
 * Staged direct uploads live under `staging/{draftClientActionId}` with per-file JSON metadata
 * including `createdAt`. Abandoned staging folders may be purged by a tenant-scoped retention
 * job once no finance document references the draft correlation id.
 */
export const FINANCE_STAGING_EVIDENCE_RETENTION_NOTE =
  'Abandoned staged finance evidence may be deleted after retention once unreferenced.';

export type FinanceDocumentEvidenceSource = 'job_evidence' | 'finance_direct';

export function isFinanceDirectEvidenceJobId(jobId: string): boolean {
  return jobId === FINANCE_DIRECT_EVIDENCE_SCOPE;
}

export function validateFinanceDirectUpload(input: {
  mimeType: string;
  buffer: Buffer;
}): { ok: true } | { ok: false; code: string; message: string } {
  const fileValidation = validateFinancePhotoFile({
    mimeType: input.mimeType,
    sizeBytes: input.buffer.length,
  });
  if (!fileValidation.ok) {
    return { ok: false, code: 'INVALID_FILE_TYPE', message: fileValidation.message };
  }
  if (!validateFinancePhotoMagicBytes(input.mimeType, input.buffer)) {
    return {
      ok: false,
      code: 'INVALID_FILE_CONTENT',
      message: 'File contents do not match the declared type',
    };
  }
  return { ok: true };
}

export function buildFinanceDirectStorageKey(input: {
  companyId: string;
  scope: 'staging' | 'document';
  scopeId: string;
  fileId: string;
}): string {
  const scopeId = input.scopeId.trim();
  if (!scopeId || scopeId.includes('..') || scopeId.includes('/')) {
    throw new Error('Invalid finance evidence scope id');
  }
  return `${input.companyId}/finance/${input.scope}/${scopeId}/${input.fileId}.bin`;
}
