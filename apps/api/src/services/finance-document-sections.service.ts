import { and, eq, isNotNull } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import { mobileJobDocumentation, titanDocuments } from '@titan/db';
import {
  emptyFinanceDocumentContent,
  isEligibleCocEvidenceMetadata,
  normalizeFinanceDocumentContent,
  resolveCocAttachment as buildCocAttachmentState,
  type FinanceDocumentContent,
  type FinanceDocumentSectionsSnapshot,
} from '@titan/shared';

export class FinanceDocumentSectionsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FinanceDocumentSectionsError';
  }
}

export type CocEvidenceOption = {
  id: string;
  fileName: string;
  title: string;
  mimeType: string;
  uploadedAt: string;
};

export class FinanceDocumentSectionsService {
  constructor(private readonly db: DatabaseClient) {}

  async loadSections(input: {
    companyId: string;
    quoteId?: string | null;
    invoiceId?: string | null;
  }): Promise<FinanceDocumentSectionsSnapshot> {
    const row = await this.findDocumentRow(input);
    if (!row) {
      return { content: emptyFinanceDocumentContent(), cocDocumentationId: null };
    }
    return {
      content: normalizeFinanceDocumentContent(row.content as FinanceDocumentContent),
      cocDocumentationId: row.cocDocumentationId ?? null,
    };
  }

  async saveSections(
    actor: { companyId: string; userId: string | null },
    input: {
      quoteId?: string | null;
      invoiceId?: string | null;
      jobId?: string | null;
      documentNumber: string;
      title: string;
      customerId?: string | null;
      content?: FinanceDocumentContent | null;
      cocDocumentationId?: string | null;
    },
  ): Promise<FinanceDocumentSectionsSnapshot> {
    const content = normalizeFinanceDocumentContent(input.content ?? {});
    let cocDocumentationId =
      input.cocDocumentationId === undefined ? undefined : input.cocDocumentationId;

    if (cocDocumentationId) {
      await this.assertCocEvidenceEligible(actor.companyId, input.jobId ?? null, cocDocumentationId);
    } else if (cocDocumentationId === null) {
      cocDocumentationId = null;
    }

    const existing = await this.findDocumentRow({
      companyId: actor.companyId,
      quoteId: input.quoteId,
      invoiceId: input.invoiceId,
    });

    if (!existing) {
      const documentType = input.quoteId ? 'quote' : 'invoice';
      const [created] = await this.db
        .insert(titanDocuments)
        .values({
          companyId: actor.companyId,
          documentType,
          documentNumber: input.documentNumber,
          title: input.title,
          customerId: input.customerId ?? null,
          jobId: input.jobId ?? null,
          quoteId: input.quoteId ?? null,
          invoiceId: input.invoiceId ?? null,
          content: content as unknown as Record<string, unknown>,
          cocDocumentationId: cocDocumentationId ?? null,
          createdByUserId: actor.userId,
        })
        .returning();
      if (!created) {
        throw new FinanceDocumentSectionsError('SAVE_FAILED', 'Unable to save document sections');
      }
      return {
        content,
        cocDocumentationId: created.cocDocumentationId ?? null,
      };
    }

    const [updated] = await this.db
      .update(titanDocuments)
      .set({
        content: content as unknown as Record<string, unknown>,
        ...(cocDocumentationId !== undefined ? { cocDocumentationId } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(titanDocuments.id, existing.id), eq(titanDocuments.companyId, actor.companyId)))
      .returning();

    if (!updated) {
      throw new FinanceDocumentSectionsError('SAVE_FAILED', 'Unable to update document sections');
    }

    return {
      content: normalizeFinanceDocumentContent(updated.content as FinanceDocumentContent),
      cocDocumentationId: updated.cocDocumentationId ?? null,
    };
  }

  async listCocEvidence(companyId: string, jobId: string): Promise<CocEvidenceOption[]> {
    const rows = await this.db
      .select({
        id: mobileJobDocumentation.id,
        fileName: mobileJobDocumentation.fileName,
        title: mobileJobDocumentation.title,
        mimeType: mobileJobDocumentation.mimeType,
        metadata: mobileJobDocumentation.metadata,
        storageKey: mobileJobDocumentation.storageKey,
        createdAt: mobileJobDocumentation.createdAt,
      })
      .from(mobileJobDocumentation)
      .where(
        and(
          eq(mobileJobDocumentation.companyId, companyId),
          eq(mobileJobDocumentation.jobId, jobId),
          isNotNull(mobileJobDocumentation.storageKey),
        ),
      );

    return rows
      .filter((row) => isEligibleCocEvidenceMetadata(row.metadata as Record<string, unknown>))
      .map((row) => ({
        id: row.id,
        fileName: row.fileName?.trim() || row.title?.trim() || 'COC evidence',
        title: row.title?.trim() || row.fileName?.trim() || 'COC evidence',
        mimeType: row.mimeType?.trim() || 'application/octet-stream',
        uploadedAt: row.createdAt.toISOString(),
      }));
  }

  async resolveCocAttachment(
    companyId: string,
    jobId: string | null,
    cocDocumentationId: string | null,
  ) {
    if (!jobId || !cocDocumentationId) {
      return { status: 'not_attached' as const };
    }

    const rows = await this.db
      .select({
        id: mobileJobDocumentation.id,
        jobId: mobileJobDocumentation.jobId,
        fileName: mobileJobDocumentation.fileName,
        mimeType: mobileJobDocumentation.mimeType,
        sizeBytes: mobileJobDocumentation.sizeBytes,
        storageKey: mobileJobDocumentation.storageKey,
        metadata: mobileJobDocumentation.metadata,
      })
      .from(mobileJobDocumentation)
      .where(
        and(
          eq(mobileJobDocumentation.id, cocDocumentationId),
          eq(mobileJobDocumentation.companyId, companyId),
        ),
      )
      .limit(1);

    const record = rows[0];
    if (
      !record ||
      record.jobId !== jobId ||
      !record.storageKey ||
      !isEligibleCocEvidenceMetadata(record.metadata as Record<string, unknown>)
    ) {
      return { status: 'not_attached' as const };
    }

    return buildCocAttachmentState({
      documentId: record.id,
      jobId: record.jobId,
      fileName: record.fileName,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      hasStoredFile: Boolean(record.storageKey),
    });
  }

  private async findDocumentRow(input: {
    companyId: string;
    quoteId?: string | null;
    invoiceId?: string | null;
  }) {
    if (input.quoteId) {
      return this.db.query.titanDocuments.findFirst({
        where: and(
          eq(titanDocuments.companyId, input.companyId),
          eq(titanDocuments.quoteId, input.quoteId),
        ),
      });
    }
    if (input.invoiceId) {
      return this.db.query.titanDocuments.findFirst({
        where: and(
          eq(titanDocuments.companyId, input.companyId),
          eq(titanDocuments.invoiceId, input.invoiceId),
        ),
      });
    }
    return null;
  }

  private async assertCocEvidenceEligible(
    companyId: string,
    jobId: string | null,
    documentationId: string,
  ) {
    if (!jobId) {
      throw new FinanceDocumentSectionsError(
        'VALIDATION_ERROR',
        'A linked job is required before attaching COC evidence',
      );
    }

    const rows = await this.db
      .select({
        id: mobileJobDocumentation.id,
        jobId: mobileJobDocumentation.jobId,
        storageKey: mobileJobDocumentation.storageKey,
        metadata: mobileJobDocumentation.metadata,
      })
      .from(mobileJobDocumentation)
      .where(
        and(
          eq(mobileJobDocumentation.id, documentationId),
          eq(mobileJobDocumentation.companyId, companyId),
        ),
      )
      .limit(1);

    const record = rows[0];
    if (
      !record ||
      record.jobId !== jobId ||
      !record.storageKey ||
      !isEligibleCocEvidenceMetadata(record.metadata as Record<string, unknown>)
    ) {
      throw new FinanceDocumentSectionsError(
        'VALIDATION_ERROR',
        'Selected COC evidence is not available for this job',
      );
    }
  }
}
