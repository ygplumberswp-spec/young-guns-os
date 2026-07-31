import type { CreateJobDocumentInput } from '@titan/shared';

/** Images + common office/document types accepted by the job-create file picker. */
export const JOB_DOCUMENT_ACCEPT =
  'image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').trim();
  const spaced = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return spaced || fileName;
}

/**
 * Maps a browser File selection onto CreateJobDocumentInput so job create can
 * store metadata through the existing documents system (linked on create).
 */
export function documentInputFromFile(file: File, titleOverride?: string): CreateJobDocumentInput {
  return {
    title: (titleOverride?.trim() || titleFromFileName(file.name)).slice(0, 200),
    fileName: file.name.slice(0, 260),
    fileType: file.type?.trim() || null,
    fileSizeBytes: Number.isFinite(file.size) ? file.size : null,
  };
}
