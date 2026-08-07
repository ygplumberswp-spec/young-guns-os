import { and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import type {
  JobCostChecklist,
  JobCostControlQueue,
  JobCostControlSummary,
  JobFinancialCompleteness,
  JobFinancialReviewStatus,
  UnallocatedCostItem,
} from '@titan/shared';
import {
  assessJobCostControl,
  isFinancialReviewStale,
  resolveFinancialReviewStatusAfterJobComplete,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  companyFinanceSettings,
  jobCrewMembers,
  jobDirectCostEntries,
  jobFinancialReviews,
  jobMaterialLines,
  jobs,
  mobileTimeEntries,
  purchaseOrders,
  securityAuditLogs,
} from '@titan/db';
import { assessLabourRateConfidence } from '@titan/shared';
import type { JobProfitabilityService } from './job-profitability.service.js';
import { JobsError } from './jobs.service.js';

export class JobCostControlError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'JobCostControlError';
  }
}

export type JobCostControlActor = {
  companyId: string;
  userId: string;
  roleName?: string | null;
  permissions: string[];
};

export type JobCostControlFilters = {
  fromDate?: string;
  toDate?: string;
  jobId?: string;
  severity?: 'info' | 'warning' | 'critical';
  issueType?: string;
  reviewStatus?: JobFinancialReviewStatus;
  reviewed?: boolean;
};

export type JobFinancialReviewSummary = {
  jobId: string;
  status: JobFinancialReviewStatus;
  /** Fingerprint stored at last financial sign-off. */
  reviewedSourceFingerprint: string | null;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  reviewNotes: string | null;
  isStale: boolean;
  /** Current deterministic hash of profitability-driving source state. */
  currentSourceFingerprint: string | null;
  completeness: JobFinancialCompleteness;
};

export class JobCostControlService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly profitabilityService: JobProfitabilityService,
  ) {}

  async getJobFinancialReview(
    companyId: string,
    jobId: string,
    options: { includeSensitiveCosts?: boolean } = {},
  ): Promise<JobFinancialReviewSummary> {
    await this.requireJob(companyId, jobId);
    const completeness = await this.buildJobCompleteness(companyId, jobId, options);
    const review = await this.getOrCreateReviewRow(companyId, jobId);
    const profitability = await this.profitabilityService.getJobProfitability(companyId, jobId, options);

    return {
      jobId,
      status: review.status as JobFinancialReviewStatus,
      reviewedSourceFingerprint: review.reviewFingerprint,
      reviewedAt: review.reviewedAt?.toISOString() ?? null,
      reviewedByUserId: review.reviewedByUserId,
      reviewNotes: review.reviewNotes,
      isStale: isFinancialReviewStale(
        review.reviewFingerprint,
        profitability.snapshot.sourceFingerprint,
        review.status as JobFinancialReviewStatus,
      ),
      currentSourceFingerprint: profitability.snapshot.sourceFingerprint,
      completeness,
    };
  }

  async getJobCostChecklist(
    companyId: string,
    jobId: string,
  ): Promise<JobCostChecklist> {
    const completeness = await this.buildJobCompleteness(companyId, jobId, { includeSensitiveCosts: true });
    return completeness.checklist;
  }

  async completeFinancialReview(
    actor: JobCostControlActor,
    jobId: string,
    input: { notes?: string },
  ): Promise<JobFinancialReviewSummary> {
    await this.requireJob(actor.companyId, jobId);
    const profitability = await this.profitabilityService.getJobProfitability(actor.companyId, jobId, {
      includeSensitiveCosts: true,
    });
    const fingerprint = profitability.snapshot.sourceFingerprint;

    await this.db
      .insert(jobFinancialReviews)
      .values({
        companyId: actor.companyId,
        jobId,
        status: 'financially_complete',
        reviewFingerprint: fingerprint,
        reviewedAt: new Date(),
        reviewedByUserId: actor.userId,
        reviewNotes: input.notes?.trim() || null,
      })
      .onConflictDoUpdate({
        target: [jobFinancialReviews.companyId, jobFinancialReviews.jobId],
        set: {
          status: 'financially_complete',
          reviewFingerprint: fingerprint,
          reviewedAt: new Date(),
          reviewedByUserId: actor.userId,
          reviewNotes: input.notes?.trim() || null,
          updatedAt: new Date(),
        },
      })
      .returning();

    await this.recordAudit(actor, 'jcc_financial_review_completed', jobId, {
      jobId,
      reviewFingerprint: fingerprint,
      notes: input.notes?.trim() || null,
    });

    return this.getJobFinancialReview(actor.companyId, jobId, { includeSensitiveCosts: true });
  }

  async reopenFinancialReview(
    actor: JobCostControlActor,
    jobId: string,
    input: { reason: string },
  ): Promise<JobFinancialReviewSummary> {
    await this.requireJob(actor.companyId, jobId);

    await this.db
      .insert(jobFinancialReviews)
      .values({
        companyId: actor.companyId,
        jobId,
        status: 'needs_review',
        reviewNotes: input.reason.trim(),
      })
      .onConflictDoUpdate({
        target: [jobFinancialReviews.companyId, jobFinancialReviews.jobId],
        set: {
          status: 'needs_review',
          reviewNotes: input.reason.trim(),
          updatedAt: new Date(),
        },
      });

    await this.recordAudit(actor, 'jcc_financial_review_reopened', jobId, {
      jobId,
      reason: input.reason.trim(),
    });

    return this.getJobFinancialReview(actor.companyId, jobId, { includeSensitiveCosts: true });
  }

  async refreshFinancialReviewOnJobComplete(companyId: string, jobId: string): Promise<void> {
    const status = resolveFinancialReviewStatusAfterJobComplete(undefined);
    await this.db
      .insert(jobFinancialReviews)
      .values({
        companyId,
        jobId,
        status,
      })
      .onConflictDoUpdate({
        target: [jobFinancialReviews.companyId, jobFinancialReviews.jobId],
        set: {
          status: sql`CASE
            WHEN ${jobFinancialReviews.status} = 'financially_complete' THEN 'needs_review'::job_financial_review_status
            WHEN ${jobFinancialReviews.status} = 'in_review' THEN 'needs_review'::job_financial_review_status
            ELSE 'needs_review'::job_financial_review_status
          END`,
          updatedAt: new Date(),
        },
      });
  }

  async invalidateFinancialReviewIfStale(companyId: string, jobId: string): Promise<void> {
    const review = await this.db.query.jobFinancialReviews.findFirst({
      where: and(eq(jobFinancialReviews.companyId, companyId), eq(jobFinancialReviews.jobId, jobId)),
    });
    if (!review || review.status !== 'financially_complete') return;

    const profitability = await this.profitabilityService.recalculateJobProfitability(companyId, jobId, {
      includeSensitiveCosts: true,
    });
    if (
      isFinancialReviewStale(
        review.reviewFingerprint,
        profitability.snapshot.sourceFingerprint,
        review.status as JobFinancialReviewStatus,
      )
    ) {
      await this.db
        .update(jobFinancialReviews)
        .set({ status: 'needs_review', updatedAt: new Date() })
        .where(and(eq(jobFinancialReviews.companyId, companyId), eq(jobFinancialReviews.jobId, jobId)));
    }
  }

  async listUnallocatedCosts(companyId: string): Promise<UnallocatedCostItem[]> {
    const [directRows, poRows] = await Promise.all([
      this.db.query.jobDirectCostEntries.findMany({
        where: and(eq(jobDirectCostEntries.companyId, companyId), isNull(jobDirectCostEntries.jobId)),
        orderBy: [desc(jobDirectCostEntries.costDate)],
        limit: 200,
      }),
      this.db.query.purchaseOrders.findMany({
        where: and(eq(purchaseOrders.companyId, companyId), isNull(purchaseOrders.jobId)),
        orderBy: [desc(purchaseOrders.updatedAt)],
        limit: 200,
        with: { supplier: true },
      }),
    ]);

    const directItems: UnallocatedCostItem[] = directRows.map((row) => ({
      id: row.id,
      kind: 'direct_cost',
      description: row.description,
      amountCents: row.amountCents,
      supplierName: null,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      costDate: row.costDate?.toISOString() ?? null,
      receiptDocumentId: row.receiptDocumentId,
    }));

    const poItems: UnallocatedCostItem[] = poRows.map((row) => ({
      id: row.id,
      kind: 'purchase_order',
      description: row.referenceNumber,
      amountCents: row.totalCostCents,
      supplierName: row.supplier?.name ?? null,
      sourceType: 'purchase_order',
      sourceId: row.id,
      costDate: row.updatedAt.toISOString(),
      receiptDocumentId: null,
    }));

    return [...directItems, ...poItems];
  }

  async allocateCostToJob(
    actor: JobCostControlActor,
    input: {
      kind: 'direct_cost' | 'purchase_order';
      costId: string;
      jobId: string;
      reason: string;
    },
  ): Promise<void> {
    await this.requireJob(actor.companyId, input.jobId);

    if (input.kind === 'direct_cost') {
      const cost = await this.db.query.jobDirectCostEntries.findFirst({
        where: and(
          eq(jobDirectCostEntries.companyId, actor.companyId),
          eq(jobDirectCostEntries.id, input.costId),
        ),
      });
      if (!cost) {
        throw new JobCostControlError('NOT_FOUND', 'Direct cost not found');
      }
      if (cost.jobId === input.jobId) {
        return;
      }
      if (cost.jobId && cost.jobId !== input.jobId) {
        throw new JobCostControlError(
          'CONFLICT',
          'Cost is already allocated to another job — use reassignment with audit',
        );
      }

      await this.db
        .update(jobDirectCostEntries)
        .set({ jobId: input.jobId, updatedAt: new Date() })
        .where(eq(jobDirectCostEntries.id, input.costId));

      await this.recordAudit(actor, 'jcc_cost_allocated', input.costId, {
        kind: 'direct_cost',
        costId: input.costId,
        fromJobId: cost.jobId,
        toJobId: input.jobId,
        reason: input.reason.trim(),
      });
    } else {
      const po = await this.db.query.purchaseOrders.findFirst({
        where: and(eq(purchaseOrders.companyId, actor.companyId), eq(purchaseOrders.id, input.costId)),
      });
      if (!po) {
        throw new JobCostControlError('NOT_FOUND', 'Purchase order not found');
      }
      if (po.jobId === input.jobId) return;
      if (po.jobId && po.jobId !== input.jobId) {
        throw new JobCostControlError('CONFLICT', 'Purchase order already assigned to another job');
      }

      await this.db
        .update(purchaseOrders)
        .set({ jobId: input.jobId, updatedAt: new Date() })
        .where(eq(purchaseOrders.id, input.costId));

      await this.recordAudit(actor, 'jcc_cost_allocated', input.costId, {
        kind: 'purchase_order',
        costId: input.costId,
        fromJobId: po.jobId,
        toJobId: input.jobId,
        reason: input.reason.trim(),
      });
    }

    await this.invalidateFinancialReviewIfStale(actor.companyId, input.jobId);
    await this.profitabilityService.recalculateJobProfitability(actor.companyId, input.jobId, {
      includeSensitiveCosts: true,
    });
  }

  async reassignCostToJob(
    actor: JobCostControlActor,
    input: {
      kind: 'direct_cost' | 'purchase_order';
      costId: string;
      jobId: string;
      reason: string;
    },
  ): Promise<void> {
    await this.allocateCostToJob(actor, {
      ...input,
      reason: `REASSIGN: ${input.reason}`,
    });
  }

  async getOwnerQueue(
    companyId: string,
    filters: JobCostControlFilters = {},
  ): Promise<JobCostControlQueue> {
    const conditions = [eq(jobs.companyId, companyId)];
    if (filters.jobId) {
      conditions.push(eq(jobs.id, filters.jobId));
    }
    if (filters.fromDate) {
      conditions.push(gte(jobs.updatedAt, new Date(filters.fromDate)));
    }
    if (filters.toDate) {
      conditions.push(lte(jobs.updatedAt, new Date(filters.toDate)));
    }

    const jobRows = await this.db.query.jobs.findMany({
      where: and(...conditions),
      columns: { id: true, title: true, jobNumber: true, status: true, updatedAt: true },
      orderBy: [desc(jobs.updatedAt)],
      limit: 500,
    });

    const completedJobsNeedingReview: JobCostControlQueue['completedJobsNeedingReview'] = [];
    const missingLabour: JobCostControlQueue['missingLabour'] = [];
    const missingMaterialCost: JobCostControlQueue['missingMaterialCost'] = [];
    const missingReceipts: JobCostControlQueue['missingReceipts'] = [];
    const paymentOutstanding: JobCostControlQueue['paymentOutstanding'] = [];
    const marginProblems: JobCostControlQueue['marginProblems'] = [];
    const provisionalProfitability: JobCostControlQueue['provisionalProfitability'] = [];

    let missingLabourCount = 0;
    let missingEvidenceCount = 0;
    let lowMarginCount = 0;
    let lossCount = 0;
    let provisionalCount = 0;
    let outstandingCash = 0;

    for (const job of jobRows) {
      if (job.status === 'cancelled') continue;

      let completeness: JobFinancialCompleteness;
      try {
        completeness = await this.buildJobCompleteness(companyId, job.id, {
          includeSensitiveCosts: true,
        });
      } catch {
        continue;
      }

      const review = await this.db.query.jobFinancialReviews.findFirst({
        where: and(eq(jobFinancialReviews.companyId, companyId), eq(jobFinancialReviews.jobId, job.id)),
      });
      const reviewStatus = (review?.status ?? 'not_required') as JobFinancialReviewStatus;

      if (filters.reviewStatus && reviewStatus !== filters.reviewStatus) continue;
      if (filters.reviewed === true && reviewStatus !== 'financially_complete') continue;
      if (filters.reviewed === false && reviewStatus === 'financially_complete') continue;

      const relevantFlags = filters.severity
        ? completeness.flags.filter((f) => f.severity === filters.severity)
        : completeness.flags;
      if (filters.issueType && !completeness.flags.some((f) => f.type === filters.issueType)) continue;

      const jobRef = job.jobNumber;
      const base = { jobId: job.id, jobReference: jobRef, title: job.title, flags: relevantFlags };

      if (
        job.status === 'completed' &&
        (reviewStatus === 'needs_review' || completeness.status !== 'verified')
      ) {
        completedJobsNeedingReview.push({
          ...base,
          status: reviewStatus,
          isStale: completeness.flags.some((f) => f.type === 'FINANCIAL_REVIEW_STALE'),
          completenessStatus: completeness.status,
          flags: relevantFlags,
        });
      }

      if (completeness.flags.some((f) => f.type === 'NO_LABOUR_CAPTURED')) {
        missingLabour.push(base);
        missingLabourCount += 1;
      }
      if (completeness.flags.some((f) => f.type === 'MATERIAL_COST_MISSING')) {
        missingMaterialCost.push(base);
      }
      if (completeness.flags.some((f) => f.type === 'DIRECT_COST_RECEIPT_MISSING')) {
        missingReceipts.push(base);
        missingEvidenceCount += 1;
      }
      const outstanding = completeness.flags.find((f) => f.type === 'CUSTOMER_PAYMENT_OUTSTANDING');
      if (outstanding?.amountCents) {
        paymentOutstanding.push({ ...base, amountCents: outstanding.amountCents });
        outstandingCash += outstanding.amountCents;
      }
      if (
        completeness.flags.some((f) =>
          ['LOSS_JOB', 'LOW_MARGIN_JOB', 'NEGATIVE_MARGIN', 'EXPECTED_MARGIN_MISSED'].includes(f.type),
        )
      ) {
        marginProblems.push(base);
        if (completeness.flags.some((f) => f.type === 'LOSS_JOB')) lossCount += 1;
        else lowMarginCount += 1;
      }
      if (completeness.profitabilityConfidence.status === 'provisional') {
        provisionalProfitability.push(base);
        provisionalCount += 1;
      }
    }

    const unallocatedCosts = await this.listUnallocatedCosts(companyId);
    const unallocatedTotal = unallocatedCosts.reduce((sum, row) => sum + row.amountCents, 0);

    for (const item of unallocatedCosts) {
      if (item.kind === 'direct_cost' && !item.receiptDocumentId) {
        missingEvidenceCount += 1;
      }
    }

    const summary: JobCostControlSummary = {
      completedJobsNeedingReview: completedJobsNeedingReview.length,
      missingLabourJobs: missingLabourCount,
      missingCostEvidence: missingEvidenceCount,
      unallocatedCostsCents: unallocatedTotal,
      unallocatedCostsCount: unallocatedCosts.length,
      outstandingCustomerCashCents: outstandingCash,
      lowMarginJobs: lowMarginCount,
      lossJobs: lossCount,
      provisionalProfitabilityJobs: provisionalCount,
    };

    return {
      summary,
      completedJobsNeedingReview,
      missingLabour,
      missingMaterialCost,
      missingReceipts,
      unallocatedCosts,
      paymentOutstanding,
      marginProblems,
      provisionalProfitability,
    };
  }

  async buildJobCompleteness(
    companyId: string,
    jobId: string,
    options: { includeSensitiveCosts?: boolean },
  ): Promise<JobFinancialCompleteness> {
    const [job, settings, labourRows, materialRows, directCostRows, crewRows, review] = await Promise.all([
      this.requireJob(companyId, jobId),
      this.db.query.companyFinanceSettings.findFirst({
        where: eq(companyFinanceSettings.companyId, companyId),
      }),
      this.db.query.mobileTimeEntries.findMany({
        where: and(eq(mobileTimeEntries.companyId, companyId), eq(mobileTimeEntries.jobId, jobId)),
      }),
      this.db.query.jobMaterialLines.findMany({
        where: and(eq(jobMaterialLines.companyId, companyId), eq(jobMaterialLines.jobId, jobId)),
      }),
      this.db.query.jobDirectCostEntries.findMany({
        where: and(eq(jobDirectCostEntries.companyId, companyId), eq(jobDirectCostEntries.jobId, jobId)),
      }),
      this.db.query.jobCrewMembers.findMany({
        where: and(eq(jobCrewMembers.companyId, companyId), eq(jobCrewMembers.jobId, jobId)),
      }),
      this.db.query.jobFinancialReviews.findFirst({
        where: and(eq(jobFinancialReviews.companyId, companyId), eq(jobFinancialReviews.jobId, jobId)),
      }),
    ]);

    const profitability = await this.profitabilityService.getJobProfitability(companyId, jobId, options);
    const reviewStatus = (review?.status ?? 'not_required') as JobFinancialReviewStatus;

    return assessJobCostControl({
      jobId,
      jobStatus: job.status,
      jobReference: job.jobNumber,
      currency: profitability.summary.currency,
      profitability,
      financialReview: {
        status: reviewStatus,
        reviewFingerprint: review?.reviewFingerprint ?? null,
        isStale: isFinancialReviewStale(
          review?.reviewFingerprint ?? null,
          profitability.snapshot.sourceFingerprint,
          reviewStatus,
        ),
      },
      labourEntries: labourRows.map((row) => ({
        id: row.id,
        entryType: row.entryType,
        durationMinutes: row.durationMinutes ?? 0,
        labourRateConfidence: assessLabourRateConfidence(
          row.metadata,
          row.entryType,
          row.durationMinutes ?? 0,
          row.endedAt?.toISOString() ?? null,
        ),
        userId: row.userId,
      })),
      materialLines: materialRows.map((row) => ({
        id: row.id,
        status: row.status ?? 'used',
        quantity: String(row.quantity),
        unitCostCents: row.unitCostCents ?? 0,
        description: row.description,
      })),
      directCosts: directCostRows.map((row) => ({
        id: row.id,
        category: row.category,
        description: row.description,
        amountCents: row.amountCents,
        sourceType: row.sourceType,
        receiptDocumentId: row.receiptDocumentId,
        isPaid: row.isPaid,
      })),
      hasCrewAssigned: crewRows.length > 0,
      marginVarianceThresholdBps: settings?.costControlMarginVarianceBps ?? 1000,
      warningMarginBps: settings?.profitabilityWarningMarginBps ?? 1500,
    });
  }

  private async getOrCreateReviewRow(companyId: string, jobId: string) {
    const existing = await this.db.query.jobFinancialReviews.findFirst({
      where: and(eq(jobFinancialReviews.companyId, companyId), eq(jobFinancialReviews.jobId, jobId)),
    });
    if (existing) return existing;

    const [created] = await this.db
      .insert(jobFinancialReviews)
      .values({ companyId, jobId, status: 'not_required' })
      .returning();
    return created!;
  }

  private async requireJob(companyId: string, jobId: string) {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.companyId, companyId), eq(jobs.id, jobId)),
    });
    if (!job) {
      throw new JobsError('NOT_FOUND', 'Job not found');
    }
    return job;
  }

  private async recordAudit(
    actor: JobCostControlActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'financial',
      action,
      entityType: 'job_cost_control',
      entityId,
      userId: actor.userId,
      metadata: { ...metadata, fakeDataInvented: false },
    });
  }
}
