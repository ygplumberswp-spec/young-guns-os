import { and, desc, eq, sql } from 'drizzle-orm';
import type {
  CreateDocumentCategoryRequest,
  CreateDocumentRequest,
  DocumentCategorySummary,
  DocumentDetail,
  DocumentSummary,
  DocumentsStats,
  UpdateDocumentRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { customers, documentCategories, documents, jobs, securityAuditLogs, users } from '@titan/db';

export class DocumentsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DocumentsError';
  }
}

export type AuraDocumentsContext = {
  documentCount: number;
  categoryCount: number;
  categories: Array<{
    name: string;
    documentCount: number;
  }>;
  recentDocuments: Array<{
    title: string;
    fileName: string;
    fileType: string | null;
    categoryName: string | null;
    customerName: string | null;
    jobTitle: string | null;
    uploadedByName: string;
    createdAt: string;
  }>;
  focusedCustomerDocuments: Array<{
    title: string;
    fileName: string;
    categoryName: string | null;
    uploadedByName: string;
    createdAt: string;
  }> | null;
  focusedJobDocuments: Array<{
    title: string;
    fileName: string;
    categoryName: string | null;
    uploadedByName: string;
    createdAt: string;
  }> | null;
};

type TenantScope = {
  companyId: string;
  userId: string;
};

export class DocumentsService {
  constructor(private readonly db: DatabaseClient) {}

  async listCategories(companyId: string): Promise<DocumentCategorySummary[]> {
    const rows = await this.db.query.documentCategories.findMany({
      where: eq(documentCategories.companyId, companyId),
      orderBy: [desc(documentCategories.updatedAt)],
    });

    const counts = await this.getCategoryDocumentCounts(companyId);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      documentCount: counts.get(row.id) ?? 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async createCategory(
    companyId: string,
    input: CreateDocumentCategoryRequest,
  ): Promise<DocumentCategorySummary> {
    const name = input.name.trim();

    if (!name) {
      throw new DocumentsError('VALIDATION_ERROR', 'Category name is required');
    }

    const [created] = await this.db
      .insert(documentCategories)
      .values({
        companyId,
        name,
        description: normalizeOptionalText(input.description),
      })
      .returning();

    if (!created) {
      throw new DocumentsError('CREATE_FAILED', 'Unable to create document category');
    }

    return {
      id: created.id,
      name: created.name,
      description: created.description,
      documentCount: 0,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  async listDocuments(companyId: string): Promise<DocumentSummary[]> {
    const rows = await this.db.query.documents.findMany({
      where: eq(documents.companyId, companyId),
      with: { category: true, customer: true, job: true, uploadedBy: true },
      orderBy: [desc(documents.updatedAt)],
    });

    return rows.map(toDocumentSummary);
  }

  async getDocument(companyId: string, documentId: string): Promise<DocumentDetail | null> {
    const row = await this.db.query.documents.findFirst({
      where: and(eq(documents.id, documentId), eq(documents.companyId, companyId)),
      with: { category: true, customer: true, job: true, uploadedBy: true },
    });

    return row ? toDocumentSummary(row) : null;
  }

  async createDocument(scope: TenantScope, input: CreateDocumentRequest): Promise<DocumentDetail> {
    const title = input.title.trim();
    const fileName = input.fileName.trim();

    if (!title) {
      throw new DocumentsError('VALIDATION_ERROR', 'Document title is required');
    }

    if (!fileName) {
      throw new DocumentsError('VALIDATION_ERROR', 'File name is required');
    }

    await this.validateDocumentLinks(scope.companyId, input.customerId, input.jobId);

    if (input.categoryId) {
      await this.ensureCategoryBelongsToCompany(scope.companyId, input.categoryId);
    }

    const [created] = await this.db
      .insert(documents)
      .values({
        companyId: scope.companyId,
        categoryId: input.categoryId ?? null,
        customerId: input.customerId ?? null,
        jobId: input.jobId ?? null,
        uploadedByUserId: scope.userId,
        title,
        description: normalizeOptionalText(input.description),
        fileName,
        fileType: normalizeOptionalText(input.fileType),
        fileSizeBytes: input.fileSizeBytes ?? null,
      })
      .returning();

    if (!created) {
      throw new DocumentsError('CREATE_FAILED', 'Unable to create document record');
    }

    const row = await this.db.query.documents.findFirst({
      where: eq(documents.id, created.id),
      with: { category: true, customer: true, job: true, uploadedBy: true },
    });

    if (!row) {
      throw new DocumentsError('CREATE_FAILED', 'Unable to load document record');
    }

    await this.db.insert(securityAuditLogs).values({
      companyId: scope.companyId,
      category: 'quality',
      action: 'document_uploaded',
      entityType: 'document',
      entityId: created.id,
      userId: scope.userId,
      metadata: {
        title: created.title,
        fileName: created.fileName,
        jobId: created.jobId,
        customerId: created.customerId,
      },
    });

    return toDocumentSummary(row);
  }

  async updateDocument(
    companyId: string,
    documentId: string,
    input: UpdateDocumentRequest,
    userId?: string,
  ): Promise<DocumentDetail> {
    const existing = await this.db.query.documents.findFirst({
      where: and(eq(documents.id, documentId), eq(documents.companyId, companyId)),
    });

    if (!existing) {
      throw new DocumentsError('DOCUMENT_NOT_FOUND', 'Document not found');
    }

    const nextCustomerId = input.customerId !== undefined ? input.customerId : existing.customerId;
    const nextJobId = input.jobId !== undefined ? input.jobId : existing.jobId;

    await this.validateDocumentLinks(companyId, nextCustomerId, nextJobId);

    if (input.categoryId) {
      await this.ensureCategoryBelongsToCompany(companyId, input.categoryId);
    }

    const title = input.title?.trim();
    const fileName = input.fileName?.trim();

    if (input.title !== undefined && !title) {
      throw new DocumentsError('VALIDATION_ERROR', 'Document title is required');
    }

    if (input.fileName !== undefined && !fileName) {
      throw new DocumentsError('VALIDATION_ERROR', 'File name is required');
    }

    const [updated] = await this.db
      .update(documents)
      .set({
        title: title ?? existing.title,
        description:
          input.description !== undefined
            ? normalizeOptionalText(input.description)
            : existing.description,
        fileName: fileName ?? existing.fileName,
        fileType:
          input.fileType !== undefined ? normalizeOptionalText(input.fileType) : existing.fileType,
        fileSizeBytes:
          input.fileSizeBytes !== undefined ? input.fileSizeBytes : existing.fileSizeBytes,
        categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
        customerId: nextCustomerId,
        jobId: nextJobId,
        updatedAt: new Date(),
      })
      .where(and(eq(documents.id, documentId), eq(documents.companyId, companyId)))
      .returning();

    if (!updated) {
      throw new DocumentsError('UPDATE_FAILED', 'Unable to update document record');
    }

    const row = await this.db.query.documents.findFirst({
      where: eq(documents.id, updated.id),
      with: { category: true, customer: true, job: true, uploadedBy: true },
    });

    if (!row) {
      throw new DocumentsError('UPDATE_FAILED', 'Unable to load document record');
    }

    await this.db.insert(securityAuditLogs).values({
      companyId,
      category: 'quality',
      action: 'document_updated',
      entityType: 'document',
      entityId: documentId,
      userId: userId ?? null,
      metadata: {
        title: row.title,
        fileName: row.fileName,
        jobId: row.jobId,
        customerId: row.customerId,
      },
    });

    return toDocumentSummary(row);
  }

  async getStats(companyId: string): Promise<DocumentsStats> {
    const [documentCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(documents)
      .where(eq(documents.companyId, companyId));

    const [categoryCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(documentCategories)
      .where(eq(documentCategories.companyId, companyId));

    return {
      documentCount: documentCountRow?.count ?? 0,
      categoryCount: categoryCountRow?.count ?? 0,
    };
  }

  async buildAuraContext(
    companyId: string,
    customerId?: string,
    jobId?: string,
  ): Promise<AuraDocumentsContext> {
    const stats = await this.getStats(companyId);
    const categoryRows = await this.listCategories(companyId);

    const documentRows = await this.db.query.documents.findMany({
      where: eq(documents.companyId, companyId),
      with: { category: true, customer: true, job: true, uploadedBy: true },
      orderBy: [desc(documents.updatedAt)],
      limit: 15,
    });

    let focusedCustomerDocuments: AuraDocumentsContext['focusedCustomerDocuments'] = null;
    let focusedJobDocuments: AuraDocumentsContext['focusedJobDocuments'] = null;

    if (customerId) {
      const focusedRows = await this.db.query.documents.findMany({
        where: and(eq(documents.companyId, companyId), eq(documents.customerId, customerId)),
        with: { category: true, uploadedBy: true },
        orderBy: [desc(documents.updatedAt)],
        limit: 10,
      });

      if (focusedRows.length > 0) {
        focusedCustomerDocuments = focusedRows.map((row) => ({
          title: row.title,
          fileName: row.fileName,
          categoryName: row.category?.name ?? null,
          uploadedByName: formatUserName(row.uploadedBy),
          createdAt: row.createdAt.toISOString(),
        }));
      }
    }

    if (jobId) {
      const focusedRows = await this.db.query.documents.findMany({
        where: and(eq(documents.companyId, companyId), eq(documents.jobId, jobId)),
        with: { category: true, uploadedBy: true },
        orderBy: [desc(documents.updatedAt)],
        limit: 10,
      });

      if (focusedRows.length > 0) {
        focusedJobDocuments = focusedRows.map((row) => ({
          title: row.title,
          fileName: row.fileName,
          categoryName: row.category?.name ?? null,
          uploadedByName: formatUserName(row.uploadedBy),
          createdAt: row.createdAt.toISOString(),
        }));
      }
    }

    return {
      documentCount: stats.documentCount,
      categoryCount: stats.categoryCount,
      categories: categoryRows.map((row) => ({
        name: row.name,
        documentCount: row.documentCount,
      })),
      recentDocuments: documentRows.map((row) => ({
        title: row.title,
        fileName: row.fileName,
        fileType: row.fileType,
        categoryName: row.category?.name ?? null,
        customerName: row.customer?.name ?? null,
        jobTitle: row.job?.title ?? null,
        uploadedByName: formatUserName(row.uploadedBy),
        createdAt: row.createdAt.toISOString(),
      })),
      focusedCustomerDocuments,
      focusedJobDocuments,
    };
  }

  private async getCategoryDocumentCounts(companyId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        categoryId: documents.categoryId,
        count: sql<number>`count(*)::int`,
      })
      .from(documents)
      .where(eq(documents.companyId, companyId))
      .groupBy(documents.categoryId);

    const counts = new Map<string, number>();

    for (const row of rows) {
      if (row.categoryId) {
        counts.set(row.categoryId, row.count);
      }
    }

    return counts;
  }

  private async validateDocumentLinks(
    companyId: string,
    customerId?: string | null,
    jobId?: string | null,
  ) {
    if (customerId) {
      await this.ensureCustomerBelongsToCompany(companyId, customerId);
    }

    if (jobId) {
      const job = await this.ensureJobBelongsToCompany(companyId, jobId);

      if (customerId && job.customerId !== customerId) {
        throw new DocumentsError(
          'VALIDATION_ERROR',
          'Selected job does not belong to the selected customer',
        );
      }
    }
  }

  private async ensureCustomerBelongsToCompany(companyId: string, customerId: string) {
    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, companyId)),
    });

    if (!customer) {
      throw new DocumentsError('CUSTOMER_NOT_FOUND', 'Customer not found');
    }
  }

  private async ensureJobBelongsToCompany(companyId: string, jobId: string) {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)),
    });

    if (!job) {
      throw new DocumentsError('JOB_NOT_FOUND', 'Job not found');
    }

    return job;
  }

  private async ensureCategoryBelongsToCompany(companyId: string, categoryId: string) {
    const category = await this.db.query.documentCategories.findFirst({
      where: and(
        eq(documentCategories.id, categoryId),
        eq(documentCategories.companyId, companyId),
      ),
    });

    if (!category) {
      throw new DocumentsError('CATEGORY_NOT_FOUND', 'Document category not found');
    }
  }
}

function toDocumentSummary(
  row: typeof documents.$inferSelect & {
    category: typeof documentCategories.$inferSelect | null;
    customer: typeof customers.$inferSelect | null;
    job: typeof jobs.$inferSelect | null;
    uploadedBy: typeof users.$inferSelect | null;
  },
): DocumentSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    fileName: row.fileName,
    fileType: row.fileType,
    fileSizeBytes: row.fileSizeBytes,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    jobId: row.jobId,
    jobTitle: row.job?.title ?? null,
    uploadedByUserId: row.uploadedByUserId,
    uploadedByName: formatUserName(row.uploadedBy),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function formatUserName(user: typeof users.$inferSelect | null | undefined): string {
  if (!user) {
    return 'Unknown';
  }

  return `${user.firstName} ${user.lastName}`.trim();
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
