import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import type {
  FinanceDocumentAttachment,
  FinanceJobEvidencePickerItem,
  LinkFinanceJobEvidenceRequest,
  ReorderFinanceAttachmentsRequest,
  UpdateFinanceAttachmentRequest,
  UploadFinanceAttachmentRequest,
} from '@titan/shared';
import {
  financeAttachmentIsImage,
  normaliseFinanceAttachmentOrder,
  validateFinanceAttachmentFile,
  type FinanceDocumentPreviewAttachment,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  financeDocumentAttachments,
  invoices,
  mobileJobDocumentation,
  quotes,
} from '@titan/db';
import {
  decodeFinanceAttachmentBase64,
  FinanceAttachmentStorageService,
} from './finance-attachment-storage.service.js';
import { JobEvidenceStorageService } from './job-evidence-storage.service.js';

export class FinanceAttachmentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FinanceAttachmentError';
  }
}

type FinanceAttachmentActor = {
  companyId: string;
  userId: string;
};

type DocumentScope =
  | { quoteId: string; invoiceId?: never; draftClientActionId?: never }
  | { invoiceId: string; quoteId?: never; draftClientActionId?: never }
  | { draftClientActionId: string; quoteId?: never; invoiceId?: never };

function toAttachment(row: typeof financeDocumentAttachments.$inferSelect): FinanceDocumentAttachment {
  return {
    id: row.id,
    companyId: row.companyId,
    quoteId: row.quoteId,
    invoiceId: row.invoiceId,
    draftClientActionId: row.draftClientActionId,
    source: row.source,
    jobId: row.jobId,
    documentationId: row.documentationId,
    storageKey: row.storageKey,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    caption: row.caption,
    sortOrder: row.sortOrder,
    includeInPdf: row.includeInPdf,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function scopeDocumentMatch(scope: DocumentScope) {
  if ('quoteId' in scope && scope.quoteId) {
    return eq(financeDocumentAttachments.quoteId, scope.quoteId);
  }
  if ('invoiceId' in scope && scope.invoiceId) {
    return eq(financeDocumentAttachments.invoiceId, scope.invoiceId);
  }
  if ('draftClientActionId' in scope && scope.draftClientActionId) {
    return eq(financeDocumentAttachments.draftClientActionId, scope.draftClientActionId);
  }
  throw new FinanceAttachmentError('VALIDATION_ERROR', 'Document scope is required');
}

function scopeWhere(companyId: string, scope: DocumentScope) {
  return and(eq(financeDocumentAttachments.companyId, companyId), scopeDocumentMatch(scope));
}

export class FinanceAttachmentService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly storage: FinanceAttachmentStorageService,
    private readonly jobEvidenceStorage: JobEvidenceStorageService,
  ) {}

  async listAttachments(
    companyId: string,
    scope: DocumentScope,
  ): Promise<FinanceDocumentAttachment[]> {
    const rows = await this.db.query.financeDocumentAttachments.findMany({
      where: scopeWhere(companyId, scope),
      orderBy: [asc(financeDocumentAttachments.sortOrder), asc(financeDocumentAttachments.createdAt)],
    });
    return normaliseFinanceAttachmentOrder(rows.map(toAttachment));
  }

  async uploadAttachment(
    actor: FinanceAttachmentActor,
    scope: DocumentScope,
    input: UploadFinanceAttachmentRequest,
  ): Promise<FinanceDocumentAttachment> {
    await this.assertDocumentScope(actor.companyId, scope);

    if (input.clientActionId) {
      const replay = await this.db.query.financeDocumentAttachments.findFirst({
        where: and(
          eq(financeDocumentAttachments.companyId, actor.companyId),
          eq(financeDocumentAttachments.clientActionId, input.clientActionId),
        ),
      });
      if (replay) return toAttachment(replay);
    }

    const buffer = decodeFinanceAttachmentBase64(input.dataBase64);
    const validation = validateFinanceAttachmentFile({
      mimeType: input.mimeType,
      sizeBytes: buffer.byteLength,
    });
    if (!validation.ok) {
      throw new FinanceAttachmentError(validation.code, validation.message);
    }

    const stored = await this.storage.store({
      companyId: actor.companyId,
      mimeType: input.mimeType,
      buffer,
      originalFileName: input.fileName,
    });

    const sortOrder = await this.nextSortOrder(actor.companyId, scope);
    const includeInPdf =
      input.includeInPdf ?? financeAttachmentIsImage(input.mimeType);

    const [created] = await this.db
      .insert(financeDocumentAttachments)
      .values({
        companyId: actor.companyId,
        quoteId: 'quoteId' in scope ? scope.quoteId ?? null : null,
        invoiceId: 'invoiceId' in scope ? scope.invoiceId ?? null : null,
        draftClientActionId:
          'draftClientActionId' in scope ? scope.draftClientActionId ?? null : null,
        source: 'upload',
        storageKey: stored.storageKey,
        fileName: stored.originalFileName,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        caption: input.caption?.trim() || null,
        sortOrder,
        includeInPdf,
        checksumSha256: stored.checksumSha256,
        uploadedByUserId: actor.userId,
        clientActionId: input.clientActionId ?? null,
      })
      .returning();

    if (!created) throw new FinanceAttachmentError('CREATE_FAILED', 'Unable to save attachment');
    return toAttachment(created);
  }

  async linkJobEvidence(
    actor: FinanceAttachmentActor,
    scope: DocumentScope,
    input: LinkFinanceJobEvidenceRequest,
  ): Promise<FinanceDocumentAttachment> {
    await this.assertDocumentScope(actor.companyId, scope);

    const doc = await this.db.query.mobileJobDocumentation.findFirst({
      where: and(
        eq(mobileJobDocumentation.id, input.documentationId),
        eq(mobileJobDocumentation.companyId, actor.companyId),
      ),
    });
    if (!doc || !doc.storageKey) {
      throw new FinanceAttachmentError('NOT_FOUND', 'Job evidence not found or has no stored file');
    }

    const existing = await this.db.query.financeDocumentAttachments.findFirst({
      where: and(
        eq(financeDocumentAttachments.companyId, actor.companyId),
        eq(financeDocumentAttachments.documentationId, input.documentationId),
        scopeDocumentMatch(scope),
      ),
    });
    if (existing) return toAttachment(existing);

    const sortOrder = await this.nextSortOrder(actor.companyId, scope);
    const mimeType = doc.mimeType ?? 'application/octet-stream';
    const includeInPdf =
      input.includeInPdf ?? financeAttachmentIsImage(mimeType);

    const [created] = await this.db
      .insert(financeDocumentAttachments)
      .values({
        companyId: actor.companyId,
        quoteId: 'quoteId' in scope ? scope.quoteId ?? null : null,
        invoiceId: 'invoiceId' in scope ? scope.invoiceId ?? null : null,
        draftClientActionId:
          'draftClientActionId' in scope ? scope.draftClientActionId ?? null : null,
        source: 'job_evidence',
        jobId: doc.jobId,
        documentationId: doc.id,
        storageKey: null,
        fileName: doc.fileName ?? doc.title,
        mimeType,
        sizeBytes: doc.sizeBytes ?? 0,
        caption: input.caption?.trim() || doc.title,
        sortOrder,
        includeInPdf,
        uploadedByUserId: actor.userId,
        clientActionId: input.clientActionId ?? null,
      })
      .returning();

    if (!created) throw new FinanceAttachmentError('CREATE_FAILED', 'Unable to link job evidence');
    return toAttachment(created);
  }

  async updateAttachment(
    actor: FinanceAttachmentActor,
    attachmentId: string,
    input: UpdateFinanceAttachmentRequest,
  ): Promise<FinanceDocumentAttachment> {
    const current = await this.getAttachmentRow(actor.companyId, attachmentId);
    const [updated] = await this.db
      .update(financeDocumentAttachments)
      .set({
        caption: input.caption !== undefined ? input.caption?.trim() || null : current.caption,
        includeInPdf: input.includeInPdf ?? current.includeInPdf,
        sortOrder: input.sortOrder ?? current.sortOrder,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(financeDocumentAttachments.id, attachmentId),
          eq(financeDocumentAttachments.companyId, actor.companyId),
        ),
      )
      .returning();

    if (!updated) throw new FinanceAttachmentError('NOT_FOUND', 'Attachment not found');
    return toAttachment(updated);
  }

  async reorderAttachments(
    actor: FinanceAttachmentActor,
    scope: DocumentScope,
    input: ReorderFinanceAttachmentsRequest,
  ): Promise<FinanceDocumentAttachment[]> {
    const rows = await this.db.query.financeDocumentAttachments.findMany({
      where: scopeWhere(actor.companyId, scope),
    });
    const allowed = new Set(rows.map((row) => row.id));
    if (input.attachmentIds.some((id) => !allowed.has(id))) {
      throw new FinanceAttachmentError('VALIDATION_ERROR', 'Attachment list is invalid for this document');
    }

    await Promise.all(
      input.attachmentIds.map((id, index) =>
        this.db
          .update(financeDocumentAttachments)
          .set({ sortOrder: index, updatedAt: new Date() })
          .where(
            and(
              eq(financeDocumentAttachments.id, id),
              eq(financeDocumentAttachments.companyId, actor.companyId),
            ),
          ),
      ),
    );

    return this.listAttachments(actor.companyId, scope);
  }

  async deleteAttachment(actor: FinanceAttachmentActor, attachmentId: string): Promise<void> {
    const row = await this.getAttachmentRow(actor.companyId, attachmentId);
    await this.db
      .delete(financeDocumentAttachments)
      .where(
        and(
          eq(financeDocumentAttachments.id, attachmentId),
          eq(financeDocumentAttachments.companyId, actor.companyId),
        ),
      );
    void row;
  }

  async replaceAttachment(
    actor: FinanceAttachmentActor,
    attachmentId: string,
    input: UploadFinanceAttachmentRequest,
  ): Promise<FinanceDocumentAttachment> {
    const current = await this.getAttachmentRow(actor.companyId, attachmentId);
    if (current.source !== 'upload') {
      throw new FinanceAttachmentError(
        'VALIDATION_ERROR',
        'Linked job evidence cannot be replaced — remove and re-link instead',
      );
    }

    const buffer = decodeFinanceAttachmentBase64(input.dataBase64);
    const validation = validateFinanceAttachmentFile({
      mimeType: input.mimeType,
      sizeBytes: buffer.byteLength,
    });
    if (!validation.ok) {
      throw new FinanceAttachmentError(validation.code, validation.message);
    }

    const stored = await this.storage.store({
      companyId: actor.companyId,
      mimeType: input.mimeType,
      buffer,
      originalFileName: input.fileName,
    });

    const [updated] = await this.db
      .update(financeDocumentAttachments)
      .set({
        storageKey: stored.storageKey,
        fileName: stored.originalFileName,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        checksumSha256: stored.checksumSha256,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(financeDocumentAttachments.id, attachmentId),
          eq(financeDocumentAttachments.companyId, actor.companyId),
        ),
      )
      .returning();

    if (!updated) throw new FinanceAttachmentError('NOT_FOUND', 'Attachment not found');
    return toAttachment(updated);
  }

  async linkStagingAttachments(
    companyId: string,
    draftClientActionId: string,
    target: { quoteId?: string; invoiceId?: string },
  ): Promise<number> {
    if (!target.quoteId && !target.invoiceId) return 0;
    const result = await this.db
      .update(financeDocumentAttachments)
      .set({
        quoteId: target.quoteId ?? null,
        invoiceId: target.invoiceId ?? null,
        draftClientActionId: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(financeDocumentAttachments.companyId, companyId),
          eq(financeDocumentAttachments.draftClientActionId, draftClientActionId),
        ),
      )
      .returning({ id: financeDocumentAttachments.id });
    return result.length;
  }

  async listSelectableJobEvidence(
    companyId: string,
    jobId: string,
    scope: DocumentScope,
  ): Promise<FinanceJobEvidencePickerItem[]> {
    const docs = await this.db.query.mobileJobDocumentation.findMany({
      where: and(
        eq(mobileJobDocumentation.companyId, companyId),
        eq(mobileJobDocumentation.jobId, jobId),
        or(
          eq(mobileJobDocumentation.documentationType, 'photo'),
          eq(mobileJobDocumentation.documentationType, 'document'),
        ),
      ),
      orderBy: [desc(mobileJobDocumentation.createdAt)],
    });

    const linked = await this.db.query.financeDocumentAttachments.findMany({
      where: and(
        eq(financeDocumentAttachments.companyId, companyId),
        inArray(
          financeDocumentAttachments.documentationId,
          docs.map((doc) => doc.id),
        ),
        scopeWhere(companyId, scope),
      ),
    });
    const linkedIds = new Set(linked.map((row) => row.documentationId).filter(Boolean));

    return docs
      .filter((doc) => doc.storageKey)
      .map((doc) => {
        const haystack = `${doc.title} ${doc.fileName ?? ''}`.toLowerCase();
        const evidenceKind =
          doc.documentationType === 'photo'
            ? 'photo'
            : haystack.includes('coc') || haystack.includes('certificate')
              ? 'coc'
              : 'document';
        return {
          documentationId: doc.id,
          jobId: doc.jobId,
          fileName: doc.fileName ?? doc.title,
          mimeType: doc.mimeType ?? 'application/octet-stream',
          sizeBytes: doc.sizeBytes,
          title: doc.title,
          documentationType: doc.documentationType,
          evidenceKind,
          createdAt: doc.createdAt.toISOString(),
          alreadyLinked: linkedIds.has(doc.id),
        } satisfies FinanceJobEvidencePickerItem;
      });
  }

  async buildPreviewAttachments(
    companyId: string,
    scope: DocumentScope,
  ): Promise<FinanceDocumentPreviewAttachment[]> {
    const attachments = await this.listAttachments(companyId, scope);
    const included = attachments.filter((item) => item.includeInPdf);
    const previewItems: FinanceDocumentPreviewAttachment[] = [];

    for (const attachment of included) {
      const content = await this.readAttachmentContent(companyId, attachment.id);
      const mimeType = content.mimeType.toLowerCase();
      if (!financeAttachmentIsImage(mimeType) && mimeType !== 'application/pdf') continue;
      previewItems.push({
        fileName: content.fileName,
        mimeType,
        caption: attachment.caption,
        dataUrl: `data:${mimeType};base64,${content.buffer.toString('base64')}`,
      });
    }

    return previewItems;
  }

  async readAttachmentContent(
    companyId: string,
    attachmentId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const row = await this.getAttachmentRow(companyId, attachmentId);

    if (row.source === 'upload' && row.storageKey) {
      const { buffer, metadata } = await this.storage.read({
        companyId,
        storageKey: row.storageKey,
      });
      return { buffer, mimeType: metadata.mimeType, fileName: row.fileName };
    }

    if (row.source === 'job_evidence' && row.jobId && row.documentationId) {
      const doc = await this.db.query.mobileJobDocumentation.findFirst({
        where: and(
          eq(mobileJobDocumentation.id, row.documentationId),
          eq(mobileJobDocumentation.companyId, companyId),
          eq(mobileJobDocumentation.jobId, row.jobId),
        ),
      });
      if (!doc?.storageKey) {
        throw new FinanceAttachmentError('NOT_FOUND', 'Linked job evidence file not found');
      }
      const { buffer, metadata } = await this.jobEvidenceStorage.read({
        companyId,
        jobId: row.jobId,
        storageKey: doc.storageKey,
      });
      return { buffer, mimeType: metadata.mimeType, fileName: row.fileName };
    }

    throw new FinanceAttachmentError('NOT_FOUND', 'Attachment content unavailable');
  }

  private async getAttachmentRow(companyId: string, attachmentId: string) {
    const row = await this.db.query.financeDocumentAttachments.findFirst({
      where: and(
        eq(financeDocumentAttachments.id, attachmentId),
        eq(financeDocumentAttachments.companyId, companyId),
      ),
    });
    if (!row) throw new FinanceAttachmentError('NOT_FOUND', 'Attachment not found');
    return row;
  }

  private async nextSortOrder(companyId: string, scope: DocumentScope): Promise<number> {
    const [row] = await this.db
      .select({ max: sql<number>`coalesce(max(${financeDocumentAttachments.sortOrder}), -1)::int` })
      .from(financeDocumentAttachments)
      .where(scopeWhere(companyId, scope));
    return (row?.max ?? -1) + 1;
  }

  private async assertDocumentScope(companyId: string, scope: DocumentScope): Promise<void> {
    if ('quoteId' in scope && scope.quoteId) {
      const quote = await this.db.query.quotes.findFirst({
        where: and(eq(quotes.id, scope.quoteId), eq(quotes.companyId, companyId)),
      });
      if (!quote) throw new FinanceAttachmentError('NOT_FOUND', 'Quote not found');
      return;
    }
    if ('invoiceId' in scope && scope.invoiceId) {
      const invoice = await this.db.query.invoices.findFirst({
        where: and(eq(invoices.id, scope.invoiceId), eq(invoices.companyId, companyId)),
      });
      if (!invoice) throw new FinanceAttachmentError('NOT_FOUND', 'Invoice not found');
      return;
    }
    if ('draftClientActionId' in scope && scope.draftClientActionId?.trim()) return;
    throw new FinanceAttachmentError('VALIDATION_ERROR', 'Document scope is required');
  }
}
