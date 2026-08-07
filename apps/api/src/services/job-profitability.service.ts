import { and, eq, sql } from 'drizzle-orm';
import type {
  CreateJobProfitabilityAdjustmentRequest,
  JobProfitabilityAdjustmentSummary,
  JobProfitabilityResult,
} from '@titan/shared';
import {
  computeJobProfitability,
  JPE_CALCULATION_VERSION,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  companyFinanceSettings,
  invoices,
  jobDirectCostEntries,
  jobMaterialLines,
  jobProfitabilityAdjustments,
  jobProfitabilitySnapshots,
  jobs,
  mobileTimeEntries,
  payments,
  purchaseOrders,
  quotes,
  securityAuditLogs,
} from '@titan/db';
import { JobsError } from './jobs.service.js';

export class JobProfitabilityError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'JobProfitabilityError';
  }
}

export type JobProfitabilityActor = {
  companyId: string;
  userId: string;
  roleName?: string | null;
  permissions: string[];
};

export class JobProfitabilityService {
  constructor(private readonly db: DatabaseClient) {}

  /**
   * Always recomputes from live financial sources. Snapshot persistence is a write-through
   * cache for downstream reporting — never read back for this response.
   */
  async getJobProfitability(
    companyId: string,
    jobId: string,
    options: { includeSensitiveCosts?: boolean } = {},
  ): Promise<JobProfitabilityResult> {
    const result = await this.buildProfitability(companyId, jobId, options);
    await this.persistSnapshot(companyId, jobId, result);
    return result;
  }

  async recalculateJobProfitability(
    companyId: string,
    jobId: string,
    options: { includeSensitiveCosts?: boolean } = {},
  ): Promise<JobProfitabilityResult> {
    const result = await this.buildProfitability(companyId, jobId, options);
    await this.persistSnapshot(companyId, jobId, result);
    return result;
  }

  async createCostAdjustment(
    actor: JobProfitabilityActor,
    jobId: string,
    input: CreateJobProfitabilityAdjustmentRequest,
  ): Promise<JobProfitabilityAdjustmentSummary> {
    await this.requireJob(actor.companyId, jobId);

    const [row] = await this.db
      .insert(jobProfitabilityAdjustments)
      .values({
        companyId: actor.companyId,
        jobId,
        kind: input.kind,
        amountCents: input.amountCents,
        reason: input.reason.trim(),
        createdByUserId: actor.userId,
      })
      .returning();

    await this.recordAudit(actor, 'jpe_adjustment_created', row!.id, {
      jobId,
      kind: input.kind,
      amountCents: input.amountCents,
      reason: input.reason.trim(),
    });

    await this.recalculateJobProfitability(actor.companyId, jobId, {
      includeSensitiveCosts: true,
    });

    return this.toAdjustmentSummary(row!);
  }

  private async buildProfitability(
    companyId: string,
    jobId: string,
    options: { includeSensitiveCosts?: boolean },
  ): Promise<JobProfitabilityResult> {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.companyId, companyId), eq(jobs.id, jobId)),
      columns: { id: true, status: true, updatedAt: true },
    });

    if (!job) {
      throw new JobsError('NOT_FOUND', 'Job not found');
    }

    const [
      settingsRow,
      quoteRows,
      materialRows,
      poRows,
      invoiceRows,
      paymentRows,
      labourRows,
      directCostRows,
      adjustmentRows,
    ] = await Promise.all([
      this.db.query.companyFinanceSettings.findFirst({
        where: eq(companyFinanceSettings.companyId, companyId),
      }),
      this.db.query.quotes.findMany({
        where: and(eq(quotes.companyId, companyId), eq(quotes.jobId, jobId)),
        with: { lineItems: true },
        orderBy: (table, { desc }) => [desc(table.updatedAt)],
      }),
      this.db.query.jobMaterialLines.findMany({
        where: and(eq(jobMaterialLines.companyId, companyId), eq(jobMaterialLines.jobId, jobId)),
      }),
      this.db.query.purchaseOrders.findMany({
        where: and(eq(purchaseOrders.companyId, companyId), eq(purchaseOrders.jobId, jobId)),
        with: { items: true },
      }),
      this.db.query.invoices.findMany({
        where: and(eq(invoices.companyId, companyId), eq(invoices.jobId, jobId)),
      }),
      this.db.query.payments.findMany({
        where: and(
          eq(payments.companyId, companyId),
          sql`exists (select 1 from invoices where invoices.id = ${payments.invoiceId} and invoices.job_id = ${jobId})`,
        ),
      }),
      this.db.query.mobileTimeEntries.findMany({
        where: and(eq(mobileTimeEntries.companyId, companyId), eq(mobileTimeEntries.jobId, jobId)),
      }),
      this.db.query.jobDirectCostEntries.findMany({
        where: and(eq(jobDirectCostEntries.companyId, companyId), eq(jobDirectCostEntries.jobId, jobId)),
      }),
      this.db.query.jobProfitabilityAdjustments.findMany({
        where: and(
          eq(jobProfitabilityAdjustments.companyId, companyId),
          eq(jobProfitabilityAdjustments.jobId, jobId),
        ),
      }),
    ]);

    const currency = settingsRow?.currency ?? quoteRows[0]?.currency ?? 'ZAR';
    const labourRateCentsPerHour = settingsRow?.defaultInternalLabourRateCentsPerHour ?? 8000;

    const sourceTimestamps = [
      job.updatedAt,
      ...quoteRows.map((row) => row.updatedAt),
      ...materialRows.map((row) => row.updatedAt),
      ...poRows.map((row) => row.updatedAt),
      ...invoiceRows.map((row) => row.updatedAt),
      ...paymentRows.map((row) => row.createdAt),
      ...labourRows.map((row) => row.createdAt),
      ...directCostRows.map((row) => row.updatedAt),
      ...adjustmentRows.map((row) => row.updatedAt),
    ].map((value) => value.getTime());
    const sourceFingerprint =
      sourceTimestamps.length > 0
        ? String(Math.max(...sourceTimestamps))
        : null;

    return computeJobProfitability({
      jobId,
      currency,
      jobStatus: job.status,
      labourRateCentsPerHour,
      thresholds: {
        excellentMarginBps: settingsRow?.profitabilityExcellentMarginBps ?? 3500,
        healthyMarginBps: settingsRow?.profitabilityHealthyMarginBps ?? 2500,
        warningMarginBps: settingsRow?.profitabilityWarningMarginBps ?? 1500,
      },
      materialLines: materialRows.map((row) => ({
        id: row.id,
        status: row.status ?? 'used',
        quantity: String(row.quantity),
        fulfilledQuantity: row.fulfilledQuantity ? String(row.fulfilledQuantity) : null,
        unitCostCents: row.unitCostCents ?? 0,
        materialSource: row.materialSource,
        description: row.description,
        recordedByUserId: row.recordedByUserId,
        createdAt: row.createdAt.toISOString(),
        supplierReference: row.supplierReference,
      })),
      purchaseOrders: poRows.map((row) => ({
        id: row.id,
        referenceNumber: row.referenceNumber,
        status: row.status,
        totalCostCents: row.totalCostCents,
        items: row.items.map((item) => ({
          id: item.id,
          lineTotalCents: item.lineTotalCents,
          description: item.description,
        })),
      })),
      invoices: invoiceRows.map((row) => ({
        id: row.id,
        status: row.status,
        totalCents: row.totalCents,
        subtotalCents: row.subtotalCents,
        vatCents: row.vatCents,
        amountPaidCents: row.amountPaidCents,
      })),
      payments: paymentRows.map((row) => ({
        id: row.id,
        amountCents: row.amountCents,
        paidAt: row.paidAt.toISOString(),
        reference: row.reference,
      })),
      quotes: quoteRows.map((row) => ({
        id: row.id,
        status: row.status,
        totalCents: row.totalCents,
        subtotalCents: row.subtotalCents,
        lineItems: row.lineItems.map((line) => ({
          category: line.category,
          lineCostCents: line.lineCostCents,
          lineSubtotalCents: line.lineSubtotalCents,
          isOptional: line.isOptional,
        })),
      })),
      labourEntries: labourRows.map((row) => ({
        id: row.id,
        userId: row.userId,
        durationMinutes: row.durationMinutes ?? 0,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt?.toISOString() ?? null,
        approved: true,
        hourlyCostCents: labourRateCentsPerHour,
        overtimeMultiplier:
          typeof row.metadata?.overtimeMultiplier === 'number'
            ? row.metadata.overtimeMultiplier
            : 1,
      })),
      directCosts: directCostRows.map((row) => ({
        id: row.id,
        category: row.category,
        description: row.description,
        amountCents: row.amountCents,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        costDate: row.costDate?.toISOString() ?? null,
        enteredByUserId: row.enteredByUserId,
        isPaid: row.isPaid,
        notes: row.notes,
      })),
      adjustments: adjustmentRows.map((row) => ({
        id: row.id,
        kind: row.kind,
        amountCents: row.amountCents,
        reason: row.reason,
        createdAt: row.createdAt.toISOString(),
        createdByUserId: row.createdByUserId,
      })),
      includeSensitiveCosts: options.includeSensitiveCosts ?? false,
      sourceFingerprint,
    });
  }

  private async persistSnapshot(
    companyId: string,
    jobId: string,
    result: JobProfitabilityResult,
  ): Promise<void> {
    await this.db
      .insert(jobProfitabilitySnapshots)
      .values({
        companyId,
        jobId,
        calculationVersion: JPE_CALCULATION_VERSION,
        payload: {
          ...result,
          snapshotMeta: result.snapshot,
        } as unknown as Record<string, unknown>,
        completenessStatus: result.completeness,
        calculatedAt: new Date(result.summary.calculatedAt),
      })
      .onConflictDoUpdate({
        target: [jobProfitabilitySnapshots.companyId, jobProfitabilitySnapshots.jobId],
        set: {
          calculationVersion: JPE_CALCULATION_VERSION,
          payload: {
            ...result,
            snapshotMeta: result.snapshot,
          } as unknown as Record<string, unknown>,
          completenessStatus: result.completeness,
          calculatedAt: new Date(result.summary.calculatedAt),
        },
      });
  }

  private async requireJob(companyId: string, jobId: string): Promise<void> {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.companyId, companyId), eq(jobs.id, jobId)),
      columns: { id: true },
    });
    if (!job) {
      throw new JobsError('NOT_FOUND', 'Job not found');
    }
  }

  private toAdjustmentSummary(
    row: typeof jobProfitabilityAdjustments.$inferSelect,
  ): JobProfitabilityAdjustmentSummary {
    return {
      id: row.id,
      jobId: row.jobId,
      kind: row.kind,
      amountCents: row.amountCents,
      reason: row.reason,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async recordAudit(
    actor: JobProfitabilityActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'financial',
      action,
      entityType: 'job_profitability',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        fakeDataInvented: false,
      },
    });
  }
}
