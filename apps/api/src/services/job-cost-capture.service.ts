import { and, eq, gte, lte } from 'drizzle-orm';
import type {
  DailyCostCaptureSummary,
  JobCostCaptureStatus,
  TechnicianCompletionChecklist,
} from '@titan/shared';
import {
  buildTechnicianCompletionChecklist,
  countMissingReceipts,
  deriveJobCostCaptureStatus,
  isReceiptRequiredForDirectCost,
  materialLinesNeedingCostReview,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  jobDirectCostEntries,
  jobFinancialReviews,
  jobMaterialLines,
  jobs,
  mobileJobDocumentation,
  mobileTimeEntries,
  securityAuditLogs,
} from '@titan/db';
import { emitBusinessEvent } from '../lib/automation-events.js';
import type { JobCostControlService } from './job-cost-control.service.js';
import type { JobProfitabilityService } from './job-profitability.service.js';

export class JobCostCaptureError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'JobCostCaptureError';
  }
}

export type JobCostCaptureActor = {
  companyId: string;
  userId: string;
  roleName?: string | null;
  permissions: string[];
};

export type CreateJobDirectCostRequest = {
  category: string;
  description: string;
  amountCents?: number | null;
  costDate?: string;
  isPaid?: boolean;
  receiptDocumentId?: string | null;
  notes?: string | null;
  clientActionId: string;
};

export class JobCostCaptureService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly profitabilityService: JobProfitabilityService,
    private readonly costControlService: JobCostControlService,
  ) {}

  async createDirectCost(
    actor: JobCostCaptureActor,
    jobId: string,
    input: CreateJobDirectCostRequest,
  ) {
    await this.requireJob(actor.companyId, jobId);

    const existing = await this.db.query.jobDirectCostEntries.findFirst({
      where: and(
        eq(jobDirectCostEntries.companyId, actor.companyId),
        eq(jobDirectCostEntries.sourceType, 'manual'),
        eq(jobDirectCostEntries.sourceId, input.clientActionId),
      ),
    });
    if (existing) return existing;

    const amountCents = input.amountCents ?? 0;
    const description = input.description.trim();
    if (!description) {
      throw new JobCostCaptureError('VALIDATION_ERROR', 'Description is required');
    }

    const [row] = await this.db
      .insert(jobDirectCostEntries)
      .values({
        companyId: actor.companyId,
        jobId,
        category: input.category as typeof jobDirectCostEntries.$inferInsert.category,
        description,
        amountCents,
        sourceType: 'manual',
        sourceId: input.clientActionId,
        costDate: input.costDate ? new Date(input.costDate) : new Date(),
        enteredByUserId: actor.userId,
        isPaid: input.isPaid ?? false,
        receiptDocumentId: input.receiptDocumentId ?? null,
        notes: input.notes?.trim() || null,
      })
      .returning();

    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'financial',
      action: 'jcc_direct_cost_captured',
      entityType: 'job_direct_cost_entry',
      entityId: row!.id,
      userId: actor.userId,
      metadata: {
        jobId,
        amountCents,
        category: input.category,
        clientActionId: input.clientActionId,
        fakeDataInvented: false,
      },
    });

    emitBusinessEvent({
      companyId: actor.companyId,
      eventType: 'job.direct_cost_captured',
      entityType: 'job_direct_cost_entry',
      entityId: row!.id,
      actorUserId: actor.userId,
      payload: { jobId, directCostId: row!.id, amountCents },
    });

    await this.profitabilityService.recalculateJobProfitability(actor.companyId, jobId, {
      includeSensitiveCosts: true,
    });
    await this.costControlService.invalidateFinancialReviewIfStale(actor.companyId, jobId);

    return row!;
  }

  async getTechnicianCompletionChecklist(
    companyId: string,
    jobId: string,
  ): Promise<TechnicianCompletionChecklist> {
    await this.requireJob(companyId, jobId);
    const [timeRows, materialRows, directCostRows, photoRows] = await Promise.all([
      this.db.query.mobileTimeEntries.findMany({
        where: and(eq(mobileTimeEntries.companyId, companyId), eq(mobileTimeEntries.jobId, jobId)),
      }),
      this.db.query.jobMaterialLines.findMany({
        where: and(eq(jobMaterialLines.companyId, companyId), eq(jobMaterialLines.jobId, jobId)),
      }),
      this.db.query.jobDirectCostEntries.findMany({
        where: and(eq(jobDirectCostEntries.companyId, companyId), eq(jobDirectCostEntries.jobId, jobId)),
      }),
      this.db.query.mobileJobDocumentation.findMany({
        where: and(
          eq(mobileJobDocumentation.companyId, companyId),
          eq(mobileJobDocumentation.jobId, jobId),
          eq(mobileJobDocumentation.documentationType, 'photo'),
        ),
      }),
    ]);

    const hasAuthoritativeLabour = timeRows.some(
      (row) =>
        row.entryType === 'job_time' &&
        row.endedAt != null &&
        (row.durationMinutes ?? 0) > 0,
    );

    return buildTechnicianCompletionChecklist({
      jobId,
      hasAuthoritativeLabour,
      materialLineCount: materialRows.length,
      materialsNeedingConfirmation: materialRows.filter((row) => row.status === 'requested').length,
      missingReceiptCount: countMissingReceipts(
        directCostRows.map((row) => ({
          category: row.category,
          sourceType: row.sourceType,
          amountCents: row.amountCents,
          receiptDocumentId: row.receiptDocumentId,
        })),
      ),
      photoEvidenceCount: photoRows.length,
      hasSignature: false,
    });
  }

  async getJobCaptureStatus(companyId: string, jobId: string): Promise<{
    jobId: string;
    captureStatus: JobCostCaptureStatus;
    checklist: TechnicianCompletionChecklist;
  }> {
    const job = await this.requireJob(companyId, jobId);
    const checklist = await this.getTechnicianCompletionChecklist(companyId, jobId);
    const [timeCount, materialCount, directCostCount, review] = await Promise.all([
      this.db.query.mobileTimeEntries.findMany({
        where: and(eq(mobileTimeEntries.companyId, companyId), eq(mobileTimeEntries.jobId, jobId)),
        columns: { id: true },
      }),
      this.db.query.jobMaterialLines.findMany({
        where: and(eq(jobMaterialLines.companyId, companyId), eq(jobMaterialLines.jobId, jobId)),
        columns: { id: true },
      }),
      this.db.query.jobDirectCostEntries.findMany({
        where: and(eq(jobDirectCostEntries.companyId, companyId), eq(jobDirectCostEntries.jobId, jobId)),
        columns: { id: true },
      }),
      this.db.query.jobFinancialReviews.findFirst({
        where: and(eq(jobFinancialReviews.companyId, companyId), eq(jobFinancialReviews.jobId, jobId)),
      }),
    ]);

    const captureStatus = deriveJobCostCaptureStatus({
      jobStatus: job.status,
      hasAnyCapture: timeCount.length + materialCount.length + directCostCount.length > 0,
      warningCount: checklist.warningCount,
      financiallyComplete: review?.status === 'financially_complete',
    });

    return { jobId, captureStatus, checklist };
  }

  async getDailyCaptureSummary(companyId: string, date: string): Promise<DailyCostCaptureSummary> {
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);

    const completedJobs = await this.db.query.jobs.findMany({
      where: and(
        eq(jobs.companyId, companyId),
        eq(jobs.status, 'completed'),
        gte(jobs.updatedAt, dayStart),
        lte(jobs.updatedAt, dayEnd),
      ),
      columns: { id: true },
    });

    let financiallyReady = 0;
    let needReview = 0;
    let missingTime = 0;
    let missingMaterials = 0;
    let missingReceipts = 0;

    for (const job of completedJobs) {
      const completeness = await this.costControlService.buildJobCompleteness(companyId, job.id, {
        includeSensitiveCosts: true,
      });
      if (completeness.status === 'verified') financiallyReady += 1;
      else needReview += 1;
      if (completeness.flags.some((f) => f.type === 'NO_LABOUR_CAPTURED')) missingTime += 1;
      if (completeness.flags.some((f) => f.type === 'MATERIAL_COST_MISSING')) missingMaterials += 1;
      if (completeness.flags.some((f) => f.type === 'DIRECT_COST_RECEIPT_MISSING')) missingReceipts += 1;
    }

    const unallocated = await this.costControlService.listUnallocatedCosts(companyId);

    return {
      date,
      jobsCompleted: completedJobs.length,
      financiallyReady,
      needReview,
      missingTime,
      missingMaterials,
      missingReceipts,
      unallocatedCostsCents: unallocated.reduce((sum, row) => sum + row.amountCents, 0),
    };
  }

  private async requireJob(companyId: string, jobId: string) {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.companyId, companyId), eq(jobs.id, jobId)),
    });
    if (!job) throw new JobCostCaptureError('NOT_FOUND', 'Job not found');
    return job;
  }
}

export { isReceiptRequiredForDirectCost, materialLinesNeedingCostReview };
