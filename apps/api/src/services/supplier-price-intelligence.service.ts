import { and, desc, eq, sql } from 'drizzle-orm';
import type {
  SupplierPriceDashboardCounts,
  SupplierPriceImportJobSummary,
  SupplierPriceImportLineInput,
  SupplierPriceReviewQueueItemSummary,
} from '@titan/shared';
import {
  classifySupplierPriceDedup,
  normalizeSupplierPriceDescription,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  supplierPriceCatalogueItems,
  supplierPriceImportJobs,
  supplierPriceImportLines,
  supplierPriceReviewQueue,
} from '@titan/db';

export class SupplierPriceIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SupplierPriceIntelligenceError';
  }
}

export class SupplierPriceIntelligenceService {
  constructor(private readonly db: DatabaseClient) {}

  async getDashboardCounts(companyId: string): Promise<SupplierPriceDashboardCounts> {
    const [catalogueRows, reviewRows, jobRows, uncertainRows] = await Promise.all([
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${supplierPriceCatalogueItems.isActive})::int`,
        })
        .from(supplierPriceCatalogueItems)
        .where(eq(supplierPriceCatalogueItems.companyId, companyId)),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(supplierPriceReviewQueue)
        .where(
          and(
            eq(supplierPriceReviewQueue.companyId, companyId),
            eq(supplierPriceReviewQueue.status, 'pending'),
          ),
        ),
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          reviewRequired: sql<number>`count(*) filter (where ${supplierPriceImportJobs.status} = 'review_required')::int`,
        })
        .from(supplierPriceImportJobs)
        .where(eq(supplierPriceImportJobs.companyId, companyId)),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(supplierPriceImportLines)
        .where(
          and(
            eq(supplierPriceImportLines.companyId, companyId),
            eq(supplierPriceImportLines.dedupVerdict, 'uncertain'),
          ),
        ),
    ]);

    return {
      catalogueItems: catalogueRows[0]?.total ?? 0,
      activeCatalogueItems: catalogueRows[0]?.active ?? 0,
      pendingReview: reviewRows[0]?.count ?? 0,
      importJobsTotal: jobRows[0]?.total ?? 0,
      importJobsReviewRequired: jobRows[0]?.reviewRequired ?? 0,
      uncertainLines: uncertainRows[0]?.count ?? 0,
    };
  }

  async listImportJobs(companyId: string, limit = 20): Promise<SupplierPriceImportJobSummary[]> {
    const rows = await this.db.query.supplierPriceImportJobs.findMany({
      where: eq(supplierPriceImportJobs.companyId, companyId),
      orderBy: [desc(supplierPriceImportJobs.createdAt)],
      limit,
    });

    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      sourceFilename: row.sourceFilename,
      lineCount: row.lineCount,
      reviewCount: row.reviewCount,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    }));
  }

  async listReviewQueue(
    companyId: string,
    limit = 50,
  ): Promise<SupplierPriceReviewQueueItemSummary[]> {
    const rows = await this.db
      .select({
        id: supplierPriceReviewQueue.id,
        importLineId: supplierPriceReviewQueue.importLineId,
        reason: supplierPriceReviewQueue.reason,
        status: supplierPriceReviewQueue.status,
        marginImpactCents: supplierPriceReviewQueue.marginImpactCents,
        description: supplierPriceImportLines.description,
        supplierCode: supplierPriceImportLines.supplierCode,
        unitCostCents: supplierPriceImportLines.unitCostCents,
        createdAt: supplierPriceReviewQueue.createdAt,
      })
      .from(supplierPriceReviewQueue)
      .innerJoin(
        supplierPriceImportLines,
        eq(supplierPriceReviewQueue.importLineId, supplierPriceImportLines.id),
      )
      .where(
        and(
          eq(supplierPriceReviewQueue.companyId, companyId),
          eq(supplierPriceReviewQueue.status, 'pending'),
        ),
      )
      .orderBy(desc(supplierPriceReviewQueue.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      importLineId: row.importLineId,
      reason: row.reason,
      status: row.status,
      marginImpactCents: row.marginImpactCents,
      description: row.description,
      supplierCode: row.supplierCode,
      unitCostCents: row.unitCostCents,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async importSupplierPriceLines(input: {
    companyId: string;
    supplierId?: string | null;
    sourceFilename?: string | null;
    lines: SupplierPriceImportLineInput[];
  }): Promise<{ jobId: string; reviewCount: number; newCatalogueItems: number }> {
    if (input.lines.length === 0) {
      throw new SupplierPriceIntelligenceError('VALIDATION_ERROR', 'At least one line is required');
    }

    const [job] = await this.db
      .insert(supplierPriceImportJobs)
      .values({
        companyId: input.companyId,
        supplierId: input.supplierId ?? null,
        sourceFilename: input.sourceFilename ?? null,
        status: 'processing',
      })
      .returning();

    const catalogueRows = await this.db.query.supplierPriceCatalogueItems.findMany({
      where: and(
        eq(supplierPriceCatalogueItems.companyId, input.companyId),
        eq(supplierPriceCatalogueItems.isActive, true),
      ),
    });

    const candidates = catalogueRows.map((row) => ({
      id: row.id,
      canonicalCode: row.canonicalCode,
      description: row.description,
      normalizedDescription: row.normalizedDescription,
      unit: row.unit,
      packSize: row.packSize,
      unitCostCents: row.unitCostCents,
      version: row.version,
    }));

    let reviewCount = 0;
    let newCatalogueItems = 0;

    for (const [index, line] of input.lines.entries()) {
      const dedup = classifySupplierPriceDedup({ line, candidates });
      const lineStatus =
        dedup.requiresReview ? 'review' : dedup.verdict === 'new' ? 'approved' : 'matched';

      const [insertedLine] = await this.db
        .insert(supplierPriceImportLines)
        .values({
          companyId: input.companyId,
          importJobId: job.id,
          supplierId: input.supplierId ?? null,
          lineNumber: line.lineNumber ?? index + 1,
          supplierCode: line.supplierCode ?? null,
          description: line.description,
          unit: line.unit ?? null,
          packSize: line.packSize ?? null,
          unitCostCents: line.unitCostCents,
          vatIncluded: line.vatIncluded ?? false,
          effectiveDate: line.effectiveDate ? new Date(line.effectiveDate) : null,
          status: lineStatus,
          dedupVerdict: dedup.verdict,
          catalogueItemId: dedup.matchedCatalogueItemId,
          rawPayload: line.rawPayload ?? {},
        })
        .returning();

      if (dedup.requiresReview) {
        reviewCount += 1;
        const marginImpactCents = dedup.matchedCatalogueItemId
          ? line.unitCostCents -
            (candidates.find((c) => c.id === dedup.matchedCatalogueItemId)?.unitCostCents ?? 0)
          : null;

        await this.db.insert(supplierPriceReviewQueue).values({
          companyId: input.companyId,
          importLineId: insertedLine.id,
          candidateCatalogueItemId: dedup.matchedCatalogueItemId,
          reason: dedup.reasons.join(', '),
          marginImpactCents,
        });
      } else if (dedup.verdict === 'new') {
        const [catalogueItem] = await this.db
          .insert(supplierPriceCatalogueItems)
          .values({
            companyId: input.companyId,
            supplierId: input.supplierId ?? null,
            canonicalCode: line.supplierCode ?? null,
            description: line.description,
            normalizedDescription: normalizeSupplierPriceDescription(line.description),
            unit: line.unit ?? null,
            packSize: line.packSize ?? null,
            unitCostCents: line.unitCostCents,
            vatIncluded: line.vatIncluded ?? false,
            effectiveFrom: line.effectiveDate ? new Date(line.effectiveDate) : new Date(),
          })
          .returning();

        newCatalogueItems += 1;
        candidates.push({
          id: catalogueItem.id,
          canonicalCode: catalogueItem.canonicalCode,
          description: catalogueItem.description,
          normalizedDescription: catalogueItem.normalizedDescription,
          unit: catalogueItem.unit,
          packSize: catalogueItem.packSize,
          unitCostCents: catalogueItem.unitCostCents,
          version: catalogueItem.version,
        });

        await this.db
          .update(supplierPriceImportLines)
          .set({ catalogueItemId: catalogueItem.id })
          .where(eq(supplierPriceImportLines.id, insertedLine.id));
      }
    }

    const finalStatus = reviewCount > 0 ? 'review_required' : 'completed';

    await this.db
      .update(supplierPriceImportJobs)
      .set({
        status: finalStatus,
        lineCount: input.lines.length,
        reviewCount,
        completedAt: new Date(),
        resultSummary: {
          newCatalogueItems,
          reviewCount,
          processedLines: input.lines.length,
        },
      })
      .where(eq(supplierPriceImportJobs.id, job.id));

    return { jobId: job.id, reviewCount, newCatalogueItems };
  }
}
