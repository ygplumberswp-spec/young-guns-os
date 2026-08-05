import { and, eq } from 'drizzle-orm';
import { isEligibleCocEvidenceMetadata, type OperationalReportPhoto } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { mobileJobDocumentation } from '@titan/db';
import type { JobEvidenceStorageService } from './job-evidence-storage.service.js';

export async function embedJobEvidencePhotos(
  db: DatabaseClient,
  storage: JobEvidenceStorageService,
  companyId: string,
  jobId: string,
  photoIds: Array<{ id: string; title: string; caption?: string | null; role?: OperationalReportPhoto['role'] }>,
): Promise<OperationalReportPhoto[]> {
  const results: OperationalReportPhoto[] = [];

  for (const ref of photoIds) {
    const doc = await db.query.mobileJobDocumentation.findFirst({
      where: and(
        eq(mobileJobDocumentation.id, ref.id),
        eq(mobileJobDocumentation.companyId, companyId),
        eq(mobileJobDocumentation.jobId, jobId),
      ),
    });
    if (!doc?.storageKey) {
      results.push({ title: ref.title, caption: ref.caption, role: ref.role, dataUrl: null });
      continue;
    }

    try {
      const { buffer, metadata } = await storage.read({
        companyId,
        jobId,
        storageKey: doc.storageKey,
      });
      const mimeType = metadata.mimeType.toLowerCase();
      const dataUrl =
        mimeType.startsWith('image/') ? `data:${mimeType};base64,${buffer.toString('base64')}` : null;
      results.push({
        title: ref.title,
        caption: ref.caption ?? doc.title,
        role: ref.role,
        dataUrl,
      });
    } catch {
      results.push({ title: ref.title, caption: ref.caption, role: ref.role, dataUrl: null });
    }
  }

  return results;
}

export async function embedJobSignature(
  db: DatabaseClient,
  storage: JobEvidenceStorageService,
  companyId: string,
  jobId: string,
  signatureDocId: string | null,
): Promise<string | null> {
  if (!signatureDocId) return null;

  const doc = await db.query.mobileJobDocumentation.findFirst({
    where: and(
      eq(mobileJobDocumentation.id, signatureDocId),
      eq(mobileJobDocumentation.companyId, companyId),
      eq(mobileJobDocumentation.jobId, jobId),
    ),
  });
  if (!doc?.storageKey) return null;

  try {
    const { buffer, metadata } = await storage.read({
      companyId,
      jobId,
      storageKey: doc.storageKey,
    });
    const mimeType = metadata.mimeType.toLowerCase();
    if (!mimeType.startsWith('image/')) return null;
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

export function findTypedCocEvidence(
  evidence: Array<{ id: string; title: string; metadata: Record<string, unknown> | null }>,
): { id: string; title: string } | null {
  const match = evidence.find((row) => isEligibleCocEvidenceMetadata(row.metadata));
  return match ? { id: match.id, title: match.title } : null;
}
