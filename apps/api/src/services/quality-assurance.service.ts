import { and, desc, eq } from 'drizzle-orm';
import type {
  CreateQualityActionRequest,
  CreateQualityComebackRequest,
  CreateQualityCostEntryRequest,
  CreateQualityRootCauseRequest,
  CreateQualitySupplierDefectRequest,
  CreateQualityWarrantyClaimRequest,
  QualityActionSummary,
  QualityAuraContext,
  QualityComebackSummary,
  QualityCostEntrySummary,
  QualityExecutiveDashboard,
  QualityRootCause,
  QualityRootCauseAnalysisSummary,
  QualitySupplierDefectSummary,
  QualitySupplierIntelligence,
  QualityTechnicianIntelligence,
  QualityTrendPoint,
  QualityWarrantyClaimSummary,
  UpdateQualityComebackRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  jobs,
  qualityActions,
  qualityComebacks,
  qualityCostEntries,
  qualityRootCauseAnalyses,
  qualitySupplierDefects,
  qualityWarrantyClaims,
} from '@titan/db';
import type { FinanceService } from './finance.service.js';
import type { JobsService } from './jobs.service.js';
import type { NotificationService } from './notification.service.js';

export class QualityAssuranceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'QualityAssuranceError';
  }
}

type StaffScope = {
  companyId: string;
  userId: string;
};

export class QualityAssuranceService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly jobsService: JobsService,
    private readonly financeService: FinanceService,
    private readonly notificationService: NotificationService,
  ) {}

  async listComebacks(companyId: string): Promise<QualityComebackSummary[]> {
    const rows = await this.db.query.qualityComebacks.findMany({
      where: eq(qualityComebacks.companyId, companyId),
      with: {
        originalJob: true,
        comebackJob: true,
        customer: true,
        originalTechnician: true,
        currentTechnician: true,
      },
      orderBy: [desc(qualityComebacks.occurredAt)],
      limit: 100,
    });

    return rows.map(toComebackSummary);
  }

  async getComeback(companyId: string, comebackId: string): Promise<QualityComebackSummary | null> {
    const row = await this.db.query.qualityComebacks.findFirst({
      where: and(eq(qualityComebacks.id, comebackId), eq(qualityComebacks.companyId, companyId)),
      with: {
        originalJob: true,
        comebackJob: true,
        customer: true,
        originalTechnician: true,
        currentTechnician: true,
      },
    });

    return row ? toComebackSummary(row) : null;
  }

  async createComeback(scope: StaffScope, input: CreateQualityComebackRequest): Promise<QualityComebackSummary> {
    const originalJob = await this.jobsService.getJob(scope.companyId, input.originalJobId);

    if (!originalJob) {
      throw new QualityAssuranceError('NOT_FOUND', 'Original job not found');
    }

    if (input.comebackJobId) {
      const comebackJob = await this.jobsService.getJob(scope.companyId, input.comebackJobId);
      if (!comebackJob) {
        throw new QualityAssuranceError('NOT_FOUND', 'Comeback job not found');
      }
    }

    const reason = input.reason.trim();
    if (!reason) {
      throw new QualityAssuranceError('VALIDATION_ERROR', 'Reason is required');
    }

    const [created] = await this.db
      .insert(qualityComebacks)
      .values({
        companyId: scope.companyId,
        comebackType: input.comebackType,
        status: 'open',
        originalJobId: input.originalJobId,
        comebackJobId: input.comebackJobId ?? null,
        originalTechnicianId: input.originalTechnicianId ?? originalJob.assignedUserId ?? null,
        currentTechnicianId: input.currentTechnicianId ?? null,
        customerId: originalJob.customerId,
        branchKey: input.branchKey?.trim() || null,
        reason,
        resolution: input.resolution?.trim() || null,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        labourHours: input.labourHours != null ? String(input.labourHours) : null,
        photoDocumentIds: input.photoDocumentIds ?? [],
        documentIds: input.documentIds ?? [],
        createdByUserId: scope.userId,
      })
      .returning();

    if (input.comebackJobId) {
      await this.db
        .update(jobs)
        .set({ parentJobId: input.originalJobId, updatedAt: new Date() })
        .where(and(eq(jobs.id, input.comebackJobId), eq(jobs.companyId, scope.companyId)));
    }

    await this.notificationService.createNotification({
      companyId: scope.companyId,
      recipientType: 'staff',
      recipientUserId: scope.userId,
      notificationType: 'comeback_update',
      title: 'Comeback recorded',
      body: reason,
      entityType: 'quality_comeback',
      entityId: created!.id,
    });

    return (await this.getComeback(scope.companyId, created!.id))!;
  }

  async updateComeback(
    companyId: string,
    comebackId: string,
    input: UpdateQualityComebackRequest,
  ): Promise<QualityComebackSummary> {
    const existing = await this.getComeback(companyId, comebackId);
    if (!existing) {
      throw new QualityAssuranceError('NOT_FOUND', 'Comeback not found');
    }

    const [updated] = await this.db
      .update(qualityComebacks)
      .set({
        status: input.status ?? undefined,
        resolution: input.resolution?.trim() ?? undefined,
        currentTechnicianId: input.currentTechnicianId ?? undefined,
        labourHours: input.labourHours != null ? String(input.labourHours) : undefined,
        photoDocumentIds: input.photoDocumentIds ?? undefined,
        documentIds: input.documentIds ?? undefined,
        resolvedAt:
          input.status === 'resolved' || input.status === 'closed' ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(qualityComebacks.id, comebackId), eq(qualityComebacks.companyId, companyId)))
      .returning();

    return (await this.getComeback(companyId, updated!.id))!;
  }

  async getRootCauseAnalysis(
    companyId: string,
    comebackId: string,
  ): Promise<QualityRootCauseAnalysisSummary | null> {
    const row = await this.db.query.qualityRootCauseAnalyses.findFirst({
      where: and(
        eq(qualityRootCauseAnalyses.comebackId, comebackId),
        eq(qualityRootCauseAnalyses.companyId, companyId),
      ),
      orderBy: [desc(qualityRootCauseAnalyses.createdAt)],
    });

    return row ? toRootCauseSummary(row) : null;
  }

  async setRootCauseAnalysis(
    scope: StaffScope,
    comebackId: string,
    input: CreateQualityRootCauseRequest,
  ): Promise<QualityRootCauseAnalysisSummary> {
    const comeback = await this.getComeback(scope.companyId, comebackId);
    if (!comeback) {
      throw new QualityAssuranceError('NOT_FOUND', 'Comeback not found');
    }

    const existing = await this.getRootCauseAnalysis(scope.companyId, comebackId);

    if (existing) {
      const [updated] = await this.db
        .update(qualityRootCauseAnalyses)
        .set({
          classification: input.classification,
          notes: input.notes?.trim() || null,
          auraRecommendedCause: input.auraRecommendedCause ?? null,
          auraConfidence: input.auraConfidence != null ? String(input.auraConfidence) : null,
          updatedAt: new Date(),
        })
        .where(eq(qualityRootCauseAnalyses.id, existing.id))
        .returning();

      return toRootCauseSummary(updated!);
    }

    const [created] = await this.db
      .insert(qualityRootCauseAnalyses)
      .values({
        companyId: scope.companyId,
        comebackId,
        classification: input.classification,
        notes: input.notes?.trim() || null,
        auraRecommendedCause: input.auraRecommendedCause ?? null,
        auraConfidence: input.auraConfidence != null ? String(input.auraConfidence) : null,
        createdByUserId: scope.userId,
      })
      .returning();

    return toRootCauseSummary(created!);
  }

  async listWarrantyClaims(companyId: string): Promise<QualityWarrantyClaimSummary[]> {
    const rows = await this.db.query.qualityWarrantyClaims.findMany({
      where: eq(qualityWarrantyClaims.companyId, companyId),
      with: { job: true, customer: true },
      orderBy: [desc(qualityWarrantyClaims.createdAt)],
      limit: 100,
    });

    return rows.map(toWarrantySummary);
  }

  async createWarrantyClaim(
    scope: StaffScope,
    input: CreateQualityWarrantyClaimRequest,
  ): Promise<QualityWarrantyClaimSummary> {
    const job = await this.jobsService.getJob(scope.companyId, input.jobId);
    if (!job) {
      throw new QualityAssuranceError('NOT_FOUND', 'Job not found');
    }

    const description = input.description.trim();
    if (!description) {
      throw new QualityAssuranceError('VALIDATION_ERROR', 'Description is required');
    }

    const [created] = await this.db
      .insert(qualityWarrantyClaims)
      .values({
        companyId: scope.companyId,
        comebackId: input.comebackId ?? null,
        jobId: input.jobId,
        customerId: job.customerId,
        status: 'open',
        claimNumber: input.claimNumber?.trim() || null,
        description,
      })
      .returning();

    await this.notificationService.createNotification({
      companyId: scope.companyId,
      recipientType: 'staff',
      recipientUserId: scope.userId,
      notificationType: 'warranty_update',
      title: 'Warranty claim recorded',
      body: description,
      entityType: 'quality_warranty_claim',
      entityId: created!.id,
    });

    const row = await this.db.query.qualityWarrantyClaims.findFirst({
      where: eq(qualityWarrantyClaims.id, created!.id),
      with: { job: true, customer: true },
    });

    return toWarrantySummary(row!);
  }

  async createCostEntry(
    scope: StaffScope,
    comebackId: string,
    input: CreateQualityCostEntryRequest,
  ): Promise<QualityCostEntrySummary> {
    const comeback = await this.getComeback(scope.companyId, comebackId);
    if (!comeback) {
      throw new QualityAssuranceError('NOT_FOUND', 'Comeback not found');
    }

    const labour = input.labourCostCents ?? 0;
    const material = input.materialCostCents ?? 0;
    const travel = input.travelCostCents ?? 0;
    const warranty = input.warrantyCostCents ?? 0;
    const recovery = input.supplierRecoveryCents ?? 0;
    const total = labour + material + travel;
    const companyLoss = Math.max(0, total + warranty - recovery);
    const currency = input.currency ?? (await this.financeService.getStats(scope.companyId)).currency;

    const [created] = await this.db
      .insert(qualityCostEntries)
      .values({
        companyId: scope.companyId,
        comebackId,
        labourCostCents: labour,
        materialCostCents: material,
        travelCostCents: travel,
        totalComebackCostCents: total,
        warrantyCostCents: warranty,
        supplierRecoveryCents: recovery,
        companyLossCents: companyLoss,
        currency,
        notes: input.notes?.trim() || null,
      })
      .returning();

    return toCostSummary(created!);
  }

  async listCostEntries(companyId: string, comebackId?: string): Promise<QualityCostEntrySummary[]> {
    const rows = await this.db.query.qualityCostEntries.findMany({
      where: comebackId
        ? and(eq(qualityCostEntries.companyId, companyId), eq(qualityCostEntries.comebackId, comebackId))
        : eq(qualityCostEntries.companyId, companyId),
      orderBy: [desc(qualityCostEntries.createdAt)],
      limit: 100,
    });

    return rows.map(toCostSummary);
  }

  async getTechnicianIntelligence(companyId: string): Promise<QualityTechnicianIntelligence> {
    const [completedJobs, comebackRows, warrantyRows, costRows] = await Promise.all([
      this.db.query.jobs.findMany({
        where: and(eq(jobs.companyId, companyId), eq(jobs.status, 'completed')),
        with: { assignedUser: true },
      }),
      this.db.query.qualityComebacks.findMany({
        where: eq(qualityComebacks.companyId, companyId),
      }),
      this.db.query.qualityWarrantyClaims.findMany({
        where: eq(qualityWarrantyClaims.companyId, companyId),
      }),
      this.db.query.qualityCostEntries.findMany({
        where: eq(qualityCostEntries.companyId, companyId),
      }),
    ]);

    const technicianMap = new Map<
      string,
      {
        name: string;
        completed: number;
        comebacks: number;
        warranties: number;
        repeatFailures: number;
      }
    >();

    for (const job of completedJobs) {
      if (!job.assignedUserId) continue;
      const entry = technicianMap.get(job.assignedUserId) ?? {
        name: formatUserName(job.assignedUser),
        completed: 0,
        comebacks: 0,
        warranties: 0,
        repeatFailures: 0,
      };
      entry.completed += 1;
      technicianMap.set(job.assignedUserId, entry);
    }

    for (const comeback of comebackRows) {
      const techId = comeback.originalTechnicianId;
      if (!techId) continue;
      const entry = technicianMap.get(techId) ?? {
        name: 'Unknown',
        completed: 0,
        comebacks: 0,
        warranties: 0,
        repeatFailures: 0,
      };
      entry.comebacks += 1;
      entry.repeatFailures += 1;
      technicianMap.set(techId, entry);
    }

    for (const claim of warrantyRows) {
      const relatedComeback = comebackRows.find((item) => item.id === claim.comebackId);
      const techId = relatedComeback?.originalTechnicianId;
      if (!techId) continue;
      const entry = technicianMap.get(techId)!;
      if (entry) entry.warranties += 1;
    }

    const technicians = [...technicianMap.entries()].map(([technicianId, stats]) => {
      const comebackRate =
        stats.completed > 0 ? Math.round((stats.comebacks / stats.completed) * 1000) / 10 : null;
      const ftfr =
        stats.completed > 0
          ? Math.round(((stats.completed - stats.comebacks) / stats.completed) * 1000) / 10
          : null;
      const warrantyRate =
        stats.completed > 0 ? Math.round((stats.warranties / stats.completed) * 1000) / 10 : null;
      const qualityScore =
        ftfr != null ? Math.max(0, Math.min(100, Math.round(ftfr - (comebackRate ?? 0) * 0.5))) : null;

      return {
        technicianId,
        technicianName: stats.name,
        completedJobCount: stats.completed,
        comebackCount: stats.comebacks,
        warrantyCount: stats.warranties,
        firstTimeFixRatePercent: ftfr,
        comebackRatePercent: comebackRate,
        warrantyRatePercent: warrantyRate,
        averageQualityScore: qualityScore,
        repeatFailureCount: stats.repeatFailures,
      };
    });

    const monthlyTrends = buildTrends(comebackRows, warrantyRows, costRows, 'month');
    const yearlyTrends = buildTrends(comebackRows, warrantyRows, costRows, 'year');

    return {
      technicians: technicians.sort((a, b) => (b.averageQualityScore ?? 0) - (a.averageQualityScore ?? 0)),
      monthlyTrends,
      yearlyTrends,
      customerSatisfactionAvailable: false,
    };
  }

  async getSupplierIntelligence(companyId: string): Promise<QualitySupplierIntelligence> {
    const rows = await this.db.query.qualitySupplierDefects.findMany({
      where: eq(qualitySupplierDefects.companyId, companyId),
      with: { supplier: true, inventoryItem: true },
      orderBy: [desc(qualitySupplierDefects.createdAt)],
      limit: 100,
    });

    const warrantyCount = await this.db.query.qualityWarrantyClaims.findMany({
      where: eq(qualityWarrantyClaims.companyId, companyId),
    });

    const supplierCounts = new Map<string, { name: string; defects: number; replacements: number }>();
    for (const row of rows) {
      if (!row.supplierId) continue;
      const entry = supplierCounts.get(row.supplierId) ?? {
        name: row.supplier?.name ?? 'Unknown',
        defects: 0,
        replacements: 0,
      };
      entry.defects += 1;
      entry.replacements += row.replacementCount;
      supplierCounts.set(row.supplierId, entry);
    }

    return {
      defects: rows.map(toSupplierDefectSummary),
      totalDefectCount: rows.length,
      recurringDefectCount: rows.filter((row) => row.isRecurring).length,
      warrantyClaimCount: warrantyCount.length,
      topSuppliers: [...supplierCounts.entries()]
        .map(([supplierId, stats]) => ({
          supplierId,
          name: stats.name,
          defectCount: stats.defects,
          replacementCount: stats.replacements,
        }))
        .sort((a, b) => b.defectCount - a.defectCount)
        .slice(0, 10),
    };
  }

  async createSupplierDefect(
    scope: StaffScope,
    input: CreateQualitySupplierDefectRequest,
  ): Promise<QualitySupplierDefectSummary> {
    const description = input.defectDescription.trim();
    if (!description) {
      throw new QualityAssuranceError('VALIDATION_ERROR', 'Defect description is required');
    }

    const [created] = await this.db
      .insert(qualitySupplierDefects)
      .values({
        companyId: scope.companyId,
        supplierId: input.supplierId ?? null,
        inventoryItemId: input.inventoryItemId ?? null,
        comebackId: input.comebackId ?? null,
        defectDescription: description,
        isRecurring: input.isRecurring ?? false,
        replacementCount: input.replacementCount ?? 0,
      })
      .returning();

    const row = await this.db.query.qualitySupplierDefects.findFirst({
      where: eq(qualitySupplierDefects.id, created!.id),
      with: { supplier: true, inventoryItem: true },
    });

    return toSupplierDefectSummary(row!);
  }

  async listActions(companyId: string): Promise<QualityActionSummary[]> {
    const rows = await this.db.query.qualityActions.findMany({
      where: eq(qualityActions.companyId, companyId),
      with: { technician: true },
      orderBy: [desc(qualityActions.createdAt)],
      limit: 100,
    });

    return rows.map(toActionSummary);
  }

  async createAction(scope: StaffScope, input: CreateQualityActionRequest): Promise<QualityActionSummary> {
    const subject = input.subject.trim();
    const recommendation = input.recommendation.trim();

    if (!subject || !recommendation) {
      throw new QualityAssuranceError('VALIDATION_ERROR', 'Subject and recommendation are required');
    }

    const [created] = await this.db
      .insert(qualityActions)
      .values({
        companyId: scope.companyId,
        actionType: input.actionType,
        status: 'pending_approval',
        technicianId: input.technicianId ?? null,
        comebackId: input.comebackId ?? null,
        subject,
        recommendation,
        payload: input.payload ?? {},
        createdByUserId: scope.userId,
      })
      .returning();

    await this.notificationService.createNotification({
      companyId: scope.companyId,
      recipientType: 'staff',
      recipientUserId: scope.userId,
      notificationType: 'quality_alert',
      title: 'Quality action pending approval',
      body: subject,
      entityType: 'quality_action',
      entityId: created!.id,
    });

    const row = await this.db.query.qualityActions.findFirst({
      where: eq(qualityActions.id, created!.id),
      with: { technician: true },
    });

    return toActionSummary(row!);
  }

  async getExecutiveDashboard(companyId: string): Promise<QualityExecutiveDashboard> {
    const [comebackRows, warrantyRows, costRows, rcaRows, techIntel] = await Promise.all([
      this.db.query.qualityComebacks.findMany({ where: eq(qualityComebacks.companyId, companyId) }),
      this.db.query.qualityWarrantyClaims.findMany({
        where: eq(qualityWarrantyClaims.companyId, companyId),
      }),
      this.db.query.qualityCostEntries.findMany({
        where: eq(qualityCostEntries.companyId, companyId),
      }),
      this.db.query.qualityRootCauseAnalyses.findMany({
        where: eq(qualityRootCauseAnalyses.companyId, companyId),
      }),
      this.getTechnicianIntelligence(companyId),
    ]);

    const currency = costRows[0]?.currency ?? (await this.financeService.getStats(companyId)).currency;
    const comebackCostCents = costRows.reduce((sum, row) => sum + row.totalComebackCostCents, 0);
    const warrantyCostCents = costRows.reduce((sum, row) => sum + row.warrantyCostCents, 0);
    const companyLossCents = costRows.reduce((sum, row) => sum + row.companyLossCents, 0);
    const supplierRecoveryCents = costRows.reduce((sum, row) => sum + row.supplierRecoveryCents, 0);

    const causeCounts = new Map<QualityRootCause, number>();
    for (const row of rcaRows) {
      causeCounts.set(row.classification, (causeCounts.get(row.classification) ?? 0) + 1);
    }

    const branchCounts = new Map<string, { comebacks: number; costCents: number }>();
    for (const comeback of comebackRows) {
      const key = comeback.branchKey ?? 'default';
      const costs = costRows.filter((row) => row.comebackId === comeback.id);
      const costTotal = costs.reduce((sum, row) => sum + row.totalComebackCostCents, 0);
      const entry = branchCounts.get(key) ?? { comebacks: 0, costCents: 0 };
      entry.comebacks += 1;
      entry.costCents += costTotal;
      branchCounts.set(key, entry);
    }

    const supplierIntel = await this.getSupplierIntelligence(companyId);
    const completedCount = techIntel.technicians.reduce((sum, row) => sum + row.completedJobCount, 0);
    const comebackCount = comebackRows.length;
    const ftfr =
      completedCount > 0
        ? Math.round(((completedCount - comebackCount) / completedCount) * 1000) / 10
        : null;

    const avgScore =
      techIntel.technicians.length > 0
        ? Math.round(
            techIntel.technicians.reduce((sum, row) => sum + (row.averageQualityScore ?? 0), 0) /
              techIntel.technicians.length,
          )
        : null;

    return {
      comebackCostCents,
      warrantyCostCents,
      totalQualityCostCents: comebackCostCents + warrantyCostCents,
      companyLossCents,
      supplierRecoveryCents,
      currency,
      firstTimeFixRatePercent: ftfr,
      openComebackCount: comebackRows.filter((row) => !['closed', 'cancelled'].includes(row.status)).length,
      openWarrantyCount: warrantyRows.filter((row) => !['closed', 'cancelled'].includes(row.status)).length,
      monthlyQualityScore: avgScore,
      technicianRankings: techIntel.technicians.slice(0, 10).map((row) => ({
        technicianId: row.technicianId,
        name: row.technicianName,
        qualityScore: row.averageQualityScore,
      })),
      branchRankings: [...branchCounts.entries()]
        .map(([branchKey, stats]) => ({
          branchKey,
          comebackCount: stats.comebacks,
          costCents: stats.costCents,
        }))
        .sort((a, b) => b.comebackCount - a.comebackCount),
      supplierRankings: supplierIntel.topSuppliers.map((row) => ({
        supplierId: row.supplierId,
        name: row.name,
        defectCount: row.defectCount,
      })),
      commonFailureReasons: [...causeCounts.entries()]
        .map(([cause, count]) => ({ cause, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      qualityTrends: techIntel.monthlyTrends,
    };
  }

  async buildQualityAuraContext(companyId: string): Promise<QualityAuraContext> {
    const [dashboard, pendingActions] = await Promise.all([
      this.getExecutiveDashboard(companyId),
      this.db.query.qualityActions.findMany({
        where: and(
          eq(qualityActions.companyId, companyId),
          eq(qualityActions.status, 'pending_approval'),
        ),
      }),
    ]);

    const topCause = dashboard.commonFailureReasons[0]?.cause ?? null;

    return {
      summary: `${dashboard.openComebackCount} open comeback(s), ${dashboard.openWarrantyCount} open warranty claim(s), FTFR ${dashboard.firstTimeFixRatePercent ?? 'N/A'}%.`,
      openComebackCount: dashboard.openComebackCount,
      openWarrantyCount: dashboard.openWarrantyCount,
      firstTimeFixRatePercent: dashboard.firstTimeFixRatePercent,
      totalQualityCostCents: dashboard.totalQualityCostCents,
      currency: dashboard.currency,
      pendingActionCount: pendingActions.length,
      topRootCause: topCause,
    };
  }
}

function buildTrends(
  comebacks: Array<{ occurredAt: Date }>,
  warranties: Array<{ createdAt: Date }>,
  costs: Array<{ createdAt: Date; totalComebackCostCents: number }>,
  granularity: 'month' | 'year',
): QualityTrendPoint[] {
  const buckets = new Map<
    string,
    { comebacks: number; warranties: number; costCents: number; completed: number }
  >();

  const keyFor = (date: Date) => {
    if (granularity === 'year') return String(date.getFullYear());
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };

  for (const row of comebacks) {
    const key = keyFor(row.occurredAt);
    const entry = buckets.get(key) ?? { comebacks: 0, warranties: 0, costCents: 0, completed: 0 };
    entry.comebacks += 1;
    buckets.set(key, entry);
  }

  for (const row of warranties) {
    const key = keyFor(row.createdAt);
    const entry = buckets.get(key) ?? { comebacks: 0, warranties: 0, costCents: 0, completed: 0 };
    entry.warranties += 1;
    buckets.set(key, entry);
  }

  for (const row of costs) {
    const key = keyFor(row.createdAt);
    const entry = buckets.get(key) ?? { comebacks: 0, warranties: 0, costCents: 0, completed: 0 };
    entry.costCents += row.totalComebackCostCents;
    buckets.set(key, entry);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([period, stats]) => ({
      period,
      comebackCount: stats.comebacks,
      warrantyCount: stats.warranties,
      totalCostCents: stats.costCents,
      firstTimeFixRatePercent: null,
      qualityScore: null,
    }));
}

function formatUserName(user: { firstName: string; lastName: string } | null | undefined) {
  if (!user) return 'Unknown';
  return `${user.firstName} ${user.lastName}`.trim();
}

function toComebackSummary(
  row: typeof qualityComebacks.$inferSelect & {
    originalJob?: { title: string } | null;
    comebackJob?: { title: string } | null;
    customer?: { name: string } | null;
    originalTechnician?: { firstName: string; lastName: string } | null;
    currentTechnician?: { firstName: string; lastName: string } | null;
  },
): QualityComebackSummary {
  return {
    id: row.id,
    comebackType: row.comebackType,
    status: row.status,
    originalJobId: row.originalJobId,
    originalJobTitle: row.originalJob?.title ?? null,
    comebackJobId: row.comebackJobId,
    originalTechnicianId: row.originalTechnicianId,
    originalTechnicianName: formatUserName(row.originalTechnician),
    currentTechnicianId: row.currentTechnicianId,
    currentTechnicianName: formatUserName(row.currentTechnician),
    customerId: row.customerId,
    customerName: row.customer?.name ?? 'Unknown',
    branchKey: row.branchKey,
    reason: row.reason,
    resolution: row.resolution,
    occurredAt: row.occurredAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    labourHours: row.labourHours != null ? Number(row.labourHours) : null,
    photoDocumentIds: row.photoDocumentIds ?? [],
    documentIds: row.documentIds ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toRootCauseSummary(
  row: typeof qualityRootCauseAnalyses.$inferSelect,
): QualityRootCauseAnalysisSummary {
  return {
    id: row.id,
    comebackId: row.comebackId,
    classification: row.classification,
    notes: row.notes,
    auraRecommendedCause: row.auraRecommendedCause,
    auraConfidence: row.auraConfidence != null ? Number(row.auraConfidence) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toCostSummary(row: typeof qualityCostEntries.$inferSelect): QualityCostEntrySummary {
  return {
    id: row.id,
    comebackId: row.comebackId,
    labourCostCents: row.labourCostCents,
    materialCostCents: row.materialCostCents,
    travelCostCents: row.travelCostCents,
    totalComebackCostCents: row.totalComebackCostCents,
    warrantyCostCents: row.warrantyCostCents,
    supplierRecoveryCents: row.supplierRecoveryCents,
    companyLossCents: row.companyLossCents,
    currency: row.currency,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

function toWarrantySummary(
  row: typeof qualityWarrantyClaims.$inferSelect & {
    job?: { title: string } | null;
    customer?: { name: string } | null;
  },
): QualityWarrantyClaimSummary {
  return {
    id: row.id,
    comebackId: row.comebackId,
    jobId: row.jobId,
    jobTitle: row.job?.title ?? null,
    customerId: row.customerId,
    customerName: row.customer?.name ?? 'Unknown',
    status: row.status,
    claimNumber: row.claimNumber,
    description: row.description,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toSupplierDefectSummary(
  row: typeof qualitySupplierDefects.$inferSelect & {
    supplier?: { name: string } | null;
    inventoryItem?: { name: string } | null;
  },
): QualitySupplierDefectSummary {
  return {
    id: row.id,
    supplierId: row.supplierId,
    supplierName: row.supplier?.name ?? null,
    inventoryItemId: row.inventoryItemId,
    itemName: row.inventoryItem?.name ?? null,
    comebackId: row.comebackId,
    defectDescription: row.defectDescription,
    isRecurring: row.isRecurring,
    replacementCount: row.replacementCount,
    createdAt: row.createdAt.toISOString(),
  };
}

function toActionSummary(
  row: typeof qualityActions.$inferSelect & {
    technician?: { firstName: string; lastName: string } | null;
  },
): QualityActionSummary {
  return {
    id: row.id,
    actionType: row.actionType,
    status: row.status,
    technicianId: row.technicianId,
    technicianName: formatUserName(row.technician),
    comebackId: row.comebackId,
    subject: row.subject,
    recommendation: row.recommendation,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
