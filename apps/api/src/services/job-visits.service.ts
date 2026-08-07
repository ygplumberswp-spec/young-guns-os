/**
 * Multi-day visits + Still Busy + Reschedule request/approve.
 * Never duplicates the canonical job; Still Busy blocks invoicing.
 */
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type {
  ApproveJobRescheduleInput,
  JobRescheduleReason,
  JobVisitRollup,
  JobVisitSummary,
  RequestJobRescheduleInput,
  StillBusyInput,
} from '@titan/shared';
import {
  JOB_RESCHEDULE_REASON_LABELS,
  buildLongOpenJobAttention,
  buildRepeatedRescheduleAttention,
  isInvoiceBlockedByVisitState,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  jobMaterialLines,
  jobs,
  jobVisits,
  jobWorkflowEvents,
  mobileJobDocumentation,
  mobileJobInventoryUsage,
  mobileTimeEntries,
  mobileWorkforceRequests,
  quotes,
  users,
} from '@titan/db';
import type { NotificationService } from './notification.service.js';
import type { MobileWorkforceService } from './mobile-workforce.service.js';
import { JobExecutionError, type ExecutionScope } from './job-execution.service.js';

export class JobVisitsService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly notificationService: NotificationService,
    private readonly mobileWorkforceService: MobileWorkforceService,
  ) {}

  async listVisits(companyId: string, jobId: string): Promise<JobVisitSummary[]> {
    const rows = await this.db.query.jobVisits.findMany({
      where: and(eq(jobVisits.companyId, companyId), eq(jobVisits.jobId, jobId)),
      orderBy: [asc(jobVisits.visitNumber)],
      with: { technician: true },
    });
    return rows.map((row) => toVisitSummary(row));
  }

  async getRollup(companyId: string, jobId: string): Promise<JobVisitRollup> {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)),
    });
    if (!job) throw new JobExecutionError('NOT_FOUND', 'Job not found');

    const visits = await this.listVisits(companyId, jobId);
    const open = visits.find((v) => v.status === 'open') ?? null;

    const labourByTechnician = new Map<string, { userId: string; userName: string | null; minutes: number }>();
    for (const visit of visits) {
      const prev = labourByTechnician.get(visit.technicianUserId) ?? {
        userId: visit.technicianUserId,
        userName: visit.technicianName,
        minutes: 0,
      };
      labourByTechnician.set(visit.technicianUserId, {
        ...prev,
        minutes: prev.minutes + visit.labourMinutes,
      });
    }

    const [materials, inventory, docs, rescheduleRequests] = await Promise.all([
      this.db.query.jobMaterialLines.findMany({
        where: and(eq(jobMaterialLines.companyId, companyId), eq(jobMaterialLines.jobId, jobId)),
        columns: { id: true },
      }),
      this.db.query.mobileJobInventoryUsage.findMany({
        where: and(
          eq(mobileJobInventoryUsage.companyId, companyId),
          eq(mobileJobInventoryUsage.jobId, jobId),
        ),
        columns: { id: true },
      }),
      this.db.query.mobileJobDocumentation.findMany({
        where: and(
          eq(mobileJobDocumentation.companyId, companyId),
          eq(mobileJobDocumentation.jobId, jobId),
        ),
        columns: { id: true, evidencePhase: true, documentationType: true, title: true },
      }),
      this.db.query.mobileWorkforceRequests.findMany({
        where: and(
          eq(mobileWorkforceRequests.companyId, companyId),
          eq(mobileWorkforceRequests.entityType, 'job'),
          eq(mobileWorkforceRequests.entityId, jobId),
          eq(mobileWorkforceRequests.requestType, 'job_reschedule'),
        ),
      }),
    ]);

    const photoCount = docs.filter((d) => d.documentationType === 'photo').length;
    const slipCount = docs.filter(
      (d) => d.evidencePhase === 'document' || /slip|receipt/i.test(d.title ?? ''),
    ).length;
    const lastClosed = [...visits].reverse().find((v) => v.status === 'closed');
    const invoiceGate = isInvoiceBlockedByVisitState({
      executionPhase: job.executionPhase,
      hasOpenVisit: Boolean(open),
      jobCompleted: job.status === 'completed' || job.executionPhase === 'completed',
    });

    const materialCostRows = await this.db
      .select({
        quantity: jobMaterialLines.quantity,
        unitCostCents: jobMaterialLines.unitCostCents,
      })
      .from(jobMaterialLines)
      .where(and(eq(jobMaterialLines.companyId, companyId), eq(jobMaterialLines.jobId, jobId)));
    const materialsTotalCents = materialCostRows.reduce(
      (sum, line) => sum + Math.round(Number(line.quantity) * (line.unitCostCents ?? 0)),
      0,
    );
    const totalLabourMinutes = visits.reduce((s, v) => s + v.labourMinutes, 0);
    const labourRateCents = 45_000;
    const labourCostCents = Math.round((totalLabourMinutes / 60) * labourRateCents);
    const cumulativeJobCostCents = labourCostCents + materialsTotalCents;
    const [accepted] = await this.db
      .select({ totalCents: quotes.totalCents })
      .from(quotes)
      .where(
        and(eq(quotes.companyId, companyId), eq(quotes.jobId, jobId), eq(quotes.status, 'accepted')),
      )
      .orderBy(desc(quotes.updatedAt))
      .limit(1);
    const quoteValueCents = accepted?.totalCents ?? 0;
    const cumulativeJpePercent =
      quoteValueCents > 0
        ? Math.round(((quoteValueCents - cumulativeJobCostCents) / quoteValueCents) * 1000) / 10
        : null;

    return {
      jobId,
      visitCount: visits.length,
      openVisitNumber: open?.visitNumber ?? null,
      totalLabourMinutes,
      totalTravelMinutes: visits.reduce((s, v) => s + v.travelMinutes, 0),
      labourByTechnician: [...labourByTechnician.values()],
      materialCount: materials.length + inventory.length,
      slipCount,
      photoCount,
      materialsTotalCents,
      cumulativeJobCostCents,
      cumulativeJpePercent,
      workCompletedSoFar: lastClosed?.workCompletedSummary ?? null,
      remainingWork: lastClosed?.remainingWorkSummary ?? null,
      nextScheduledAt: job.scheduledAt?.toISOString() ?? null,
      invoiceBlocked: invoiceGate.blocked,
      invoiceBlockReason: invoiceGate.reason,
      rescheduleRequestCount: rescheduleRequests.length,
      pendingRescheduleCount: rescheduleRequests.filter((r) => r.status === 'pending_approval').length,
      visits,
    };
  }

  /** Ensure an open visit exists when work starts / arrives. */
  async ensureOpenVisit(scope: ExecutionScope, jobId: string, mark: 'arrive' | 'start'): Promise<void> {
    const existing = await this.db.query.jobVisits.findFirst({
      where: and(
        eq(jobVisits.companyId, scope.companyId),
        eq(jobVisits.jobId, jobId),
        eq(jobVisits.status, 'open'),
      ),
    });
    const now = new Date();
    if (existing) {
      const patch: Record<string, unknown> = { updatedAt: now };
      if (mark === 'arrive' && !existing.arrivedAt) patch.arrivedAt = now;
      if (mark === 'start') {
        if (!existing.arrivedAt) patch.arrivedAt = now;
        if (!existing.startedAt) patch.startedAt = now;
      }
      await this.db.update(jobVisits).set(patch).where(eq(jobVisits.id, existing.id));
      return;
    }

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobVisits)
      .where(and(eq(jobVisits.companyId, scope.companyId), eq(jobVisits.jobId, jobId)));

    await this.db.insert(jobVisits).values({
      companyId: scope.companyId,
      jobId,
      visitNumber: Number(count) + 1,
      status: 'open',
      technicianUserId: scope.userId,
      arrivedAt: now,
      startedAt: mark === 'start' ? now : null,
    });
  }

  /**
   * STILL BUSY — CONTINUE LATER:
   * close current visit, stop open labour timers, set work_continues, block invoicing.
   */
  async stillBusy(scope: ExecutionScope, jobId: string, input: StillBusyInput) {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, scope.companyId)),
    });
    if (!job) throw new JobExecutionError('NOT_FOUND', 'Job not found');
    if (job.executionPhase === 'completed' || job.status === 'completed') {
      throw new JobExecutionError('INVALID_TRANSITION', 'Completed jobs cannot be marked Still Busy');
    }

    if (input.clientActionId) {
      const existing = await this.db.query.jobWorkflowEvents.findFirst({
        where: and(
          eq(jobWorkflowEvents.companyId, scope.companyId),
          eq(jobWorkflowEvents.clientActionId, input.clientActionId),
        ),
      });
      if (existing) {
        return { job, visit: await this.getOpenOrLatest(scope.companyId, jobId) };
      }
    }

    // Stop open labour for this technician on this job
    const openEntries = await this.db.query.mobileTimeEntries.findMany({
      where: and(
        eq(mobileTimeEntries.companyId, scope.companyId),
        eq(mobileTimeEntries.userId, scope.userId),
        eq(mobileTimeEntries.jobId, jobId),
        isNull(mobileTimeEntries.endedAt),
      ),
    });
    for (const entry of openEntries) {
      await this.mobileWorkforceService.stopTimeEntry(scope, entry.id, {
        clientActionId: input.clientActionId
          ? `${input.clientActionId}-stop-${entry.id}`
          : undefined,
      });
    }

    const counts = await this.countEvidence(scope.companyId, jobId);
    const labourMinutes = await this.sumLabourMinutes(scope.companyId, jobId, scope.userId);
    const travelMinutes = await this.sumTravelMinutes(scope.companyId, jobId, scope.userId);
    const now = new Date();

    let visit = await this.db.query.jobVisits.findFirst({
      where: and(
        eq(jobVisits.companyId, scope.companyId),
        eq(jobVisits.jobId, jobId),
        eq(jobVisits.status, 'open'),
      ),
    });

    if (!visit) {
      const [{ count }] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(jobVisits)
        .where(and(eq(jobVisits.companyId, scope.companyId), eq(jobVisits.jobId, jobId)));
      const [created] = await this.db
        .insert(jobVisits)
        .values({
          companyId: scope.companyId,
          jobId,
          visitNumber: Number(count) + 1,
          status: 'closed',
          technicianUserId: scope.userId,
          arrivedAt: now,
          startedAt: now,
          endedAt: now,
          labourMinutes,
          travelMinutes,
          notes: input.notes?.trim() || null,
          workCompletedSummary: input.workCompletedSummary?.trim() || null,
          remainingWorkSummary: input.remainingWorkSummary?.trim() || null,
          closeReason: 'still_busy',
          materialCount: counts.materialCount,
          photoCount: counts.photoCount,
          slipCount: counts.slipCount,
          clientActionId: input.clientActionId ?? null,
        })
        .returning();
      visit = created!;
    } else {
      const [updated] = await this.db
        .update(jobVisits)
        .set({
          status: 'closed',
          endedAt: now,
          labourMinutes,
          travelMinutes,
          notes: input.notes?.trim() || visit.notes,
          workCompletedSummary: input.workCompletedSummary?.trim() || visit.workCompletedSummary,
          remainingWorkSummary: input.remainingWorkSummary?.trim() || visit.remainingWorkSummary,
          closeReason: 'still_busy',
          materialCount: counts.materialCount,
          photoCount: counts.photoCount,
          slipCount: counts.slipCount,
          updatedAt: now,
        })
        .where(eq(jobVisits.id, visit.id))
        .returning();
      visit = updated!;
    }

    // Do not silently move scheduledAt — proposed next visit is recorded for office confirmation.
    const [updatedJob] = await this.db
      .update(jobs)
      .set({
        executionPhase: 'work_continues',
        executionPhaseUpdatedAt: now,
        status: 'in_progress',
        updatedAt: now,
      })
      .where(and(eq(jobs.id, jobId), eq(jobs.companyId, scope.companyId)))
      .returning();

    await this.db.insert(jobWorkflowEvents).values({
      companyId: scope.companyId,
      jobId,
      userId: scope.userId,
      action: 'still_busy',
      fromPhase: job.executionPhase,
      toPhase: 'work_continues',
      fromStatus: job.status,
      toStatus: 'in_progress',
      reason: input.remainingWorkSummary?.trim() || input.notes?.trim() || 'Still busy — continue later',
      clientActionId: input.clientActionId ?? null,
      metadata: {
        visitId: visit.id,
        visitNumber: visit.visitNumber,
        invoiceBlocked: true,
        proposedNextVisitAt: input.proposedNextVisitAt ?? null,
      },
    });

    return { job: updatedJob!, visit };
  }

  async requestReschedule(scope: ExecutionScope, jobId: string, input: RequestJobRescheduleInput) {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, scope.companyId)),
    });
    if (!job) throw new JobExecutionError('NOT_FOUND', 'Job not found');

    const reasonLabel = JOB_RESCHEDULE_REASON_LABELS[input.reason];
    const evidence = await this.countEvidence(scope.companyId, jobId);
    const payload = {
      reason: input.reason,
      proposedScheduledAt: input.proposedScheduledAt ?? null,
      currentPhase: job.executionPhase,
      currentStatus: job.status,
      evidence,
      requestedAt: new Date().toISOString(),
    };

    const request = await this.mobileWorkforceService.createRequest(scope, {
      requestType: 'job_reschedule',
      subject: `Reschedule request — ${job.jobNumber ?? job.title}`,
      message: `${reasonLabel}. ${input.notes}`.trim(),
      entityType: 'job',
      entityId: jobId,
      payload,
    });

    await this.db.insert(jobWorkflowEvents).values({
      companyId: scope.companyId,
      jobId,
      userId: scope.userId,
      action: 'request_reschedule',
      fromPhase: job.executionPhase,
      toPhase: job.executionPhase,
      fromStatus: job.status,
      toStatus: job.status,
      reason: `${reasonLabel}: ${input.notes}`.trim(),
      clientActionId: input.clientActionId ?? null,
      metadata: { requestId: request.id, ...payload },
    });

    // Notify owners/managers — never silently move the schedule.
    const staff = await this.db.query.users.findMany({
      where: and(eq(users.companyId, scope.companyId)),
      with: { role: true },
      limit: 50,
    });
    for (const user of staff) {
      const role = (user.role?.name ?? '').toLowerCase();
      if (!role.includes('owner') && !role.includes('admin') && !role.includes('manager')) continue;
      await this.notificationService.createNotification({
        companyId: scope.companyId,
        recipientType: 'staff',
        recipientUserId: user.id,
        notificationType: 'approval_request',
        title: 'Reschedule request',
        body: `Job #${job.jobNumber ?? jobId.slice(0, 8)} — ${reasonLabel}. Confirm a new booking.`,
        entityType: 'job',
        entityId: jobId,
      });
    }

    return { request, job };
  }

  async approveReschedule(
    scope: ExecutionScope,
    requestId: string,
    input: ApproveJobRescheduleInput,
  ) {
    const request = await this.db.query.mobileWorkforceRequests.findFirst({
      where: and(
        eq(mobileWorkforceRequests.id, requestId),
        eq(mobileWorkforceRequests.companyId, scope.companyId),
        eq(mobileWorkforceRequests.requestType, 'job_reschedule'),
      ),
    });
    if (!request) throw new JobExecutionError('NOT_FOUND', 'Reschedule request not found');
    if (request.status !== 'pending_approval') {
      throw new JobExecutionError('VALIDATION_ERROR', 'Reschedule request is not pending');
    }
    if (request.entityType !== 'job' || !request.entityId) {
      throw new JobExecutionError('VALIDATION_ERROR', 'Reschedule request is not linked to a job');
    }

    const jobId = request.entityId;
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, scope.companyId)),
    });
    if (!job) throw new JobExecutionError('NOT_FOUND', 'Job not found');

    const scheduledAt = new Date(input.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new JobExecutionError('VALIDATION_ERROR', 'Invalid scheduledAt');
    }
    const scheduledEndAt = input.scheduledEndAt ? new Date(input.scheduledEndAt) : null;
    const now = new Date();

    const [updatedJob] = await this.db
      .update(jobs)
      .set({
        scheduledAt,
        scheduledEndAt,
        updatedAt: now,
        // Keep open; do not complete or invoice.
        status: job.status === 'completed' ? job.status : job.status,
      })
      .where(eq(jobs.id, jobId))
      .returning();

    await this.db
      .update(mobileWorkforceRequests)
      .set({
        status: 'executed',
        updatedAt: now,
        payload: {
          ...(request.payload ?? {}),
          approvedScheduledAt: scheduledAt.toISOString(),
          approvedScheduledEndAt: scheduledEndAt?.toISOString() ?? null,
          approvedByUserId: scope.userId,
          approvalNotes: input.notes ?? null,
        },
      })
      .where(eq(mobileWorkforceRequests.id, requestId));

    await this.db.insert(jobWorkflowEvents).values({
      companyId: scope.companyId,
      jobId,
      userId: scope.userId,
      action: 'approve_reschedule',
      fromPhase: job.executionPhase,
      toPhase: job.executionPhase,
      fromStatus: job.status,
      toStatus: updatedJob!.status,
      reason: input.notes?.trim() || 'Reschedule approved',
      clientActionId: input.clientActionId ?? null,
      metadata: {
        requestId,
        previousScheduledAt: job.scheduledAt?.toISOString() ?? null,
        scheduledAt: scheduledAt.toISOString(),
        scheduledEndAt: scheduledEndAt?.toISOString() ?? null,
      },
    });

    // Notify requesting technician
    await this.notificationService.createNotification({
      companyId: scope.companyId,
      recipientType: 'staff',
      recipientUserId: request.userId,
      notificationType: 'schedule_changed',
      title: 'Reschedule approved',
      body: `Job #${job.jobNumber ?? jobId.slice(0, 8)} rebooked for ${scheduledAt.toLocaleString()}`,
      entityType: 'job',
      entityId: jobId,
    });

    return { job: updatedJob!, requestId };
  }

  async buildAttentionExtras(companyId: string): Promise<
    Array<{
      id: string;
      priority: 'attention' | 'critical';
      category: string;
      title: string;
      customerName: string | null;
      reason: string;
      recommendedAction: string;
      href: string;
    }>
  > {
    const openJobs = await this.db.query.jobs.findMany({
      where: and(eq(jobs.companyId, companyId), sql`${jobs.status} <> 'completed'`),
      with: { customer: true },
      limit: 100,
    });
    const extras: Array<{
      id: string;
      priority: 'attention' | 'critical';
      category: string;
      title: string;
      customerName: string | null;
      reason: string;
      recommendedAction: string;
      href: string;
    }> = [];

    for (const job of openJobs) {
      const reschedules = await this.db.query.mobileWorkforceRequests.findMany({
        where: and(
          eq(mobileWorkforceRequests.companyId, companyId),
          eq(mobileWorkforceRequests.entityId, job.id),
          eq(mobileWorkforceRequests.requestType, 'job_reschedule'),
        ),
        columns: { id: true },
      });
      const repeated = buildRepeatedRescheduleAttention({
        jobId: job.id,
        jobTitle: job.jobNumber ?? job.title,
        customerName: job.customer?.name ?? null,
        rescheduleCount: reschedules.length,
      });
      if (repeated) extras.push(repeated);

      const visitCountRow = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(jobVisits)
        .where(and(eq(jobVisits.companyId, companyId), eq(jobVisits.jobId, job.id)));
      const visitCount = Number(visitCountRow[0]?.count ?? 0);
      const openDays = Math.floor(
        (Date.now() - new Date(job.createdAt).getTime()) / (24 * 60 * 60 * 1000),
      );
      const longOpen = buildLongOpenJobAttention({
        jobId: job.id,
        jobTitle: job.jobNumber ?? job.title,
        customerName: job.customer?.name ?? null,
        openDays,
        visitCount: Math.max(visitCount, job.executionPhase === 'work_continues' ? 1 : visitCount),
      });
      if (longOpen) extras.push(longOpen);
    }

    return extras.slice(0, 10);
  }

  /** Close any open visit when final COMPLETE JOB succeeds — never invents a duplicate job. */
  async closeOpenVisitOnCompletion(scope: ExecutionScope, jobId: string) {
    const now = new Date();
    const open = await this.db.query.jobVisits.findFirst({
      where: and(
        eq(jobVisits.companyId, scope.companyId),
        eq(jobVisits.jobId, jobId),
        eq(jobVisits.status, 'open'),
      ),
    });
    if (!open) return null;

    const counts = await this.countEvidence(scope.companyId, jobId);
    const labourMinutes = await this.sumLabourMinutes(scope.companyId, jobId, open.technicianUserId);
    const travelMinutes = await this.sumTravelMinutes(scope.companyId, jobId, open.technicianUserId);

    const [updated] = await this.db
      .update(jobVisits)
      .set({
        status: 'closed',
        endedAt: now,
        labourMinutes,
        travelMinutes,
        closeReason: 'completed',
        materialCount: counts.materialCount,
        photoCount: counts.photoCount,
        slipCount: counts.slipCount,
        updatedAt: now,
      })
      .where(eq(jobVisits.id, open.id))
      .returning();
    return updated ?? null;
  }

  private async getOpenOrLatest(companyId: string, jobId: string) {
    const open = await this.db.query.jobVisits.findFirst({
      where: and(
        eq(jobVisits.companyId, companyId),
        eq(jobVisits.jobId, jobId),
        eq(jobVisits.status, 'open'),
      ),
    });
    if (open) return open;
    return this.db.query.jobVisits.findFirst({
      where: and(eq(jobVisits.companyId, companyId), eq(jobVisits.jobId, jobId)),
      orderBy: [desc(jobVisits.visitNumber)],
    });
  }

  private async countEvidence(companyId: string, jobId: string) {
    const [materials, inventory, docs] = await Promise.all([
      this.db.query.jobMaterialLines.findMany({
        where: and(eq(jobMaterialLines.companyId, companyId), eq(jobMaterialLines.jobId, jobId)),
        columns: { id: true },
      }),
      this.db.query.mobileJobInventoryUsage.findMany({
        where: and(
          eq(mobileJobInventoryUsage.companyId, companyId),
          eq(mobileJobInventoryUsage.jobId, jobId),
        ),
        columns: { id: true },
      }),
      this.db.query.mobileJobDocumentation.findMany({
        where: and(
          eq(mobileJobDocumentation.companyId, companyId),
          eq(mobileJobDocumentation.jobId, jobId),
        ),
        columns: { documentationType: true, evidencePhase: true, title: true },
      }),
    ]);
    return {
      materialCount: materials.length + inventory.length,
      photoCount: docs.filter((d) => d.documentationType === 'photo').length,
      slipCount: docs.filter(
        (d) => d.evidencePhase === 'document' || /slip|receipt/i.test(d.title ?? ''),
      ).length,
      documentationCount: docs.length,
    };
  }

  private async sumLabourMinutes(companyId: string, jobId: string, userId: string) {
    const rows = await this.db.query.mobileTimeEntries.findMany({
      where: and(
        eq(mobileTimeEntries.companyId, companyId),
        eq(mobileTimeEntries.jobId, jobId),
        eq(mobileTimeEntries.userId, userId),
        eq(mobileTimeEntries.entryType, 'job_time'),
      ),
      columns: { durationMinutes: true },
    });
    return rows.reduce((s, r) => s + (r.durationMinutes ?? 0), 0);
  }

  private async sumTravelMinutes(companyId: string, jobId: string, userId: string) {
    const rows = await this.db.query.mobileTimeEntries.findMany({
      where: and(
        eq(mobileTimeEntries.companyId, companyId),
        eq(mobileTimeEntries.jobId, jobId),
        eq(mobileTimeEntries.userId, userId),
        eq(mobileTimeEntries.entryType, 'travel'),
      ),
      columns: { durationMinutes: true },
    });
    return rows.reduce((s, r) => s + (r.durationMinutes ?? 0), 0);
  }
}

function toVisitSummary(row: {
  id: string;
  visitNumber: number;
  status: 'open' | 'closed';
  technicianUserId: string;
  arrivedAt: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
  labourMinutes: number;
  travelMinutes: number;
  notes: string | null;
  workCompletedSummary: string | null;
  remainingWorkSummary: string | null;
  closeReason: 'still_busy' | 'completed' | 'rescheduled' | 'cancelled' | null;
  materialCount: number;
  photoCount: number;
  slipCount: number;
  createdAt: Date;
  technician?: { firstName?: string; lastName?: string } | null;
}): JobVisitSummary {
  return {
    id: row.id,
    visitNumber: row.visitNumber,
    status: row.status,
    technicianUserId: row.technicianUserId,
    technicianName: row.technician
      ? `${row.technician.firstName ?? ''} ${row.technician.lastName ?? ''}`.trim() || null
      : null,
    arrivedAt: row.arrivedAt?.toISOString() ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    labourMinutes: row.labourMinutes,
    travelMinutes: row.travelMinutes,
    notes: row.notes,
    workCompletedSummary: row.workCompletedSummary,
    remainingWorkSummary: row.remainingWorkSummary,
    closeReason: row.closeReason,
    materialCount: row.materialCount,
    photoCount: row.photoCount,
    slipCount: row.slipCount,
    createdAt: row.createdAt.toISOString(),
  };
}

export type { JobRescheduleReason };
