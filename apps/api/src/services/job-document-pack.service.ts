import { and, desc, eq, sql } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import {
  cxCustomerDocuments,
  customers,
  documents,
  jobDocumentPackItems,
  jobDocumentPacks,
  jobs,
} from '@titan/db';
import type {
  CreateJobDocumentPackRequest,
  JobDocumentPackDetail,
  JobDocumentPackItemInput,
  JobDocumentPackSummary,
  SendJobDocumentPackRequest,
  UpdateJobDocumentPackRequest,
} from '@titan/shared';
import {
  canEditJobDocumentPack,
  canSendJobDocumentPack,
  inferPackItemTypeFromDocument,
  nextJobDocumentPackApprovalAction,
  portalAccessTypeForPackItem,
} from '@titan/shared';

export class JobDocumentPackError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'JobDocumentPackError';
  }
}

type PackActor = { companyId: string; userId: string };

type PackSummaryRow = typeof jobDocumentPacks.$inferSelect & {
  job: typeof jobs.$inferSelect | null;
  customer: typeof customers.$inferSelect | null;
  items: Array<typeof jobDocumentPackItems.$inferSelect>;
};

type PackDetailRow = typeof jobDocumentPacks.$inferSelect & {
  job: typeof jobs.$inferSelect | null;
  customer: typeof customers.$inferSelect | null;
  items: Array<
    typeof jobDocumentPackItems.$inferSelect & {
      document: typeof documents.$inferSelect | null;
    }
  >;
};

export class JobDocumentPackService {
  constructor(private readonly db: DatabaseClient) {}

  async listPacks(
    companyId: string,
    query: { jobId?: string } = {},
  ): Promise<JobDocumentPackSummary[]> {
    const rows = await this.db.query.jobDocumentPacks.findMany({
      where: and(
        eq(jobDocumentPacks.companyId, companyId),
        query.jobId ? eq(jobDocumentPacks.jobId, query.jobId) : undefined,
      ),
      with: { job: true, customer: true, items: true },
      orderBy: [desc(jobDocumentPacks.updatedAt)],
    });

    return rows.map((row) => toPackSummary(row));
  }

  async getPack(companyId: string, packId: string): Promise<JobDocumentPackDetail | null> {
    const row = await this.db.query.jobDocumentPacks.findFirst({
      where: and(eq(jobDocumentPacks.id, packId), eq(jobDocumentPacks.companyId, companyId)),
      with: {
        job: true,
        customer: true,
        items: {
          with: { document: true },
          orderBy: (items, { asc }) => [asc(items.position)],
        },
      },
    });
    if (!row) return null;
    return toPackDetail(row);
  }

  async createPack(actor: PackActor, input: CreateJobDocumentPackRequest): Promise<JobDocumentPackDetail> {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.companyId, actor.companyId), eq(jobs.id, input.jobId)),
      columns: { id: true, customerId: true, title: true },
    });
    if (!job?.customerId) {
      throw new JobDocumentPackError('NOT_FOUND', 'Job not found or missing customer');
    }

    if (input.clientActionId) {
      const existing = await this.db.query.jobDocumentPacks.findFirst({
        where: and(
          eq(jobDocumentPacks.companyId, actor.companyId),
          eq(jobDocumentPacks.clientActionId, input.clientActionId),
        ),
        columns: { id: true },
      });
      if (existing) {
        const pack = await this.getPack(actor.companyId, existing.id);
        if (!pack) throw new JobDocumentPackError('NOT_FOUND', 'Pack not found');
        return pack;
      }
    }

    const items =
      input.items?.length ? input.items : await this.suggestItemsForJob(actor.companyId, input.jobId);

    if (!items.length) {
      throw new JobDocumentPackError(
        'VALIDATION_ERROR',
        'At least one document is required — link documents to this job first',
      );
    }

    const [created] = await this.db
      .insert(jobDocumentPacks)
      .values({
        companyId: actor.companyId,
        jobId: input.jobId,
        customerId: job.customerId,
        packNumber: await this.nextPackNumber(actor.companyId),
        title: input.title.trim(),
        notes: input.notes?.trim() || null,
        deliveryChannel: input.deliveryChannel ?? 'portal',
        createdByUserId: actor.userId,
        clientActionId: input.clientActionId?.trim() || null,
      })
      .returning();

    if (!created) throw new JobDocumentPackError('CREATE_FAILED', 'Unable to create job document pack');

    await this.replaceItems(created.id, actor.companyId, items);

    const pack = await this.getPack(actor.companyId, created.id);
    if (!pack) throw new JobDocumentPackError('CREATE_FAILED', 'Unable to load created pack');
    return pack;
  }

  async updatePack(
    actor: PackActor,
    packId: string,
    input: UpdateJobDocumentPackRequest,
  ): Promise<JobDocumentPackDetail> {
    const existing = await this.getPack(actor.companyId, packId);
    if (!existing) throw new JobDocumentPackError('NOT_FOUND', 'Job document pack not found');
    if (!canEditJobDocumentPack(existing)) {
      throw new JobDocumentPackError('INVALID_STATE', 'Sent or cancelled packs cannot be edited');
    }

    await this.db
      .update(jobDocumentPacks)
      .set({
        title: input.title?.trim() ?? existing.title,
        notes: input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
        deliveryChannel: input.deliveryChannel ?? existing.deliveryChannel,
        updatedAt: new Date(),
      })
      .where(and(eq(jobDocumentPacks.id, packId), eq(jobDocumentPacks.companyId, actor.companyId)));

    if (input.items) {
      if (!input.items.length) {
        throw new JobDocumentPackError('VALIDATION_ERROR', 'At least one document item is required');
      }
      await this.replaceItems(packId, actor.companyId, input.items);
    }

    const pack = await this.getPack(actor.companyId, packId);
    if (!pack) throw new JobDocumentPackError('NOT_FOUND', 'Job document pack not found');
    return pack;
  }

  async advanceApproval(actor: PackActor, packId: string): Promise<JobDocumentPackDetail> {
    const existing = await this.getPack(actor.companyId, packId);
    if (!existing) throw new JobDocumentPackError('NOT_FOUND', 'Job document pack not found');

    const next = nextJobDocumentPackApprovalAction(existing.status);
    if (!next) {
      throw new JobDocumentPackError('INVALID_STATE', 'No further approval steps for this pack');
    }

    const now = new Date();
    await this.db
      .update(jobDocumentPacks)
      .set({
        status: next.nextStatus,
        approvedByUserId: next.nextStatus === 'approved_for_sending' ? actor.userId : undefined,
        approvedAt: next.nextStatus === 'approved_for_sending' ? now : undefined,
        updatedAt: now,
      })
      .where(and(eq(jobDocumentPacks.id, packId), eq(jobDocumentPacks.companyId, actor.companyId)));

    const pack = await this.getPack(actor.companyId, packId);
    if (!pack) throw new JobDocumentPackError('NOT_FOUND', 'Job document pack not found');
    return pack;
  }

  async sendPack(
    actor: PackActor,
    packId: string,
    input: SendJobDocumentPackRequest,
  ): Promise<JobDocumentPackDetail> {
    const existing = await this.db.query.jobDocumentPacks.findFirst({
      where: and(eq(jobDocumentPacks.id, packId), eq(jobDocumentPacks.companyId, actor.companyId)),
      with: {
        items: { with: { document: true }, orderBy: (items, { asc }) => [asc(items.position)] },
      },
    });
    if (!existing) throw new JobDocumentPackError('NOT_FOUND', 'Job document pack not found');
    if (!canSendJobDocumentPack(existing)) {
      throw new JobDocumentPackError(
        'INVALID_STATE',
        'Pack must be approved for sending before delivery',
      );
    }

    if (existing.deliveryChannel === 'email' || existing.deliveryChannel === 'whatsapp') {
      throw new JobDocumentPackError(
        'SEND_PATH_NOT_IMPLEMENTED',
        `${existing.deliveryChannel} delivery requires a connected provider — use the customer portal channel or approve a communications draft separately`,
      );
    }

    const duplicateSend = await this.db.query.jobDocumentPacks.findFirst({
      where: and(
        eq(jobDocumentPacks.companyId, actor.companyId),
        eq(jobDocumentPacks.clientActionId, input.clientActionId),
        eq(jobDocumentPacks.status, 'sent'),
      ),
      columns: { id: true },
    });
    if (duplicateSend && duplicateSend.id !== packId) {
      const pack = await this.getPack(actor.companyId, duplicateSend.id);
      if (!pack) throw new JobDocumentPackError('NOT_FOUND', 'Job document pack not found');
      return pack;
    }

    const now = new Date();

    await this.db.transaction(async (tx) => {
      for (const item of existing.items) {
        if (!item.documentId || !item.document) continue;

        const accessType = portalAccessTypeForPackItem(item.itemType);
        const existingPortalDoc = await tx.query.cxCustomerDocuments.findFirst({
          where: and(
            eq(cxCustomerDocuments.companyId, actor.companyId),
            eq(cxCustomerDocuments.customerId, existing.customerId),
            eq(cxCustomerDocuments.documentId, item.documentId),
          ),
          columns: { id: true },
        });

        if (!existingPortalDoc) {
          await tx.insert(cxCustomerDocuments).values({
            companyId: actor.companyId,
            customerId: existing.customerId,
            documentId: item.documentId,
            accessType,
            title: item.label,
            fileName: item.document.fileName,
            metadata: {
              jobDocumentPackId: packId,
              packNumber: existing.packNumber,
              itemType: item.itemType,
            },
          });
        }
      }

      await tx
        .update(jobDocumentPacks)
        .set({
          status: 'sent',
          deliveryState: 'portal_shared',
          sentByUserId: actor.userId,
          sentAt: now,
          clientActionId: input.clientActionId,
          updatedAt: now,
        })
        .where(and(eq(jobDocumentPacks.id, packId), eq(jobDocumentPacks.companyId, actor.companyId)));
    });

    const pack = await this.getPack(actor.companyId, packId);
    if (!pack) throw new JobDocumentPackError('NOT_FOUND', 'Job document pack not found');
    return pack;
  }

  private async suggestItemsForJob(
    companyId: string,
    jobId: string,
  ): Promise<JobDocumentPackItemInput[]> {
    const rows = await this.db.query.documents.findMany({
      where: and(eq(documents.companyId, companyId), eq(documents.jobId, jobId)),
      with: { category: true },
      orderBy: [desc(documents.updatedAt)],
      limit: 25,
    });

    return rows.map((row) => ({
      documentId: row.id,
      itemType: inferPackItemTypeFromDocument({
        title: row.title,
        fileName: row.fileName,
        categoryName: row.category?.name ?? null,
      }),
      label: row.title,
    }));
  }

  private async replaceItems(
    packId: string,
    companyId: string,
    items: JobDocumentPackItemInput[],
  ): Promise<void> {
    const resolvedItems: Array<{
      documentId: string;
      itemType: JobDocumentPackItemInput['itemType'];
      label: string;
    }> = [];

    for (const item of items) {
      const doc = await this.db.query.documents.findFirst({
        where: and(eq(documents.companyId, companyId), eq(documents.id, item.documentId)),
        with: { category: true },
      });
      if (!doc) {
        throw new JobDocumentPackError('VALIDATION_ERROR', `Document ${item.documentId} not found`);
      }

      resolvedItems.push({
        documentId: item.documentId,
        itemType:
          item.itemType ??
          inferPackItemTypeFromDocument({
            title: doc.title,
            fileName: doc.fileName,
            categoryName: doc.category?.name ?? null,
          }),
        label: item.label?.trim() || doc.title,
      });
    }

    await this.db
      .delete(jobDocumentPackItems)
      .where(and(eq(jobDocumentPackItems.packId, packId), eq(jobDocumentPackItems.companyId, companyId)));

    await this.db.insert(jobDocumentPackItems).values(
      resolvedItems.map((item, index) => ({
        companyId,
        packId,
        documentId: item.documentId,
        itemType: item.itemType ?? 'job_document',
        label: item.label,
        position: index,
      })),
    );
  }

  private async nextPackNumber(companyId: string): Promise<string> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobDocumentPacks)
      .where(eq(jobDocumentPacks.companyId, companyId));
    const next = (row?.count ?? 0) + 1;
    return `JP-${String(next).padStart(5, '0')}`;
  }
}

function toPackSummary(row: PackSummaryRow): JobDocumentPackSummary {
  return {
    id: row.id,
    packNumber: row.packNumber,
    title: row.title,
    status: row.status,
    deliveryChannel: row.deliveryChannel,
    deliveryState: row.deliveryState,
    jobId: row.jobId,
    jobTitle: row.job?.title ?? null,
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    itemCount: row.items.length,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
  };
}

function toPackDetail(row: PackDetailRow): JobDocumentPackDetail {
  return {
    ...toPackSummary(row),
    notes: row.notes,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    items: row.items.map((item) => ({
      id: item.id,
      documentId: item.documentId,
      itemType: item.itemType,
      label: item.label,
      position: item.position,
      fileName: item.document?.fileName ?? null,
      documentTitle: item.document?.title ?? null,
    })),
  };
}
