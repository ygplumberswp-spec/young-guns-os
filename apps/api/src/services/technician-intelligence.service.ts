import {
  and,
  desc,
  eq,
  gte,
  inArray,
  lte,
  or,
} from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import {
  cxReviewsFeedback,
  jobWorkflowEvents,
  jobs,
  qualityComebacks,
  securityAuditLogs,
  tiAuraInsights,
  users,
  wiTimesheets,
} from '@titan/db';
import {
  isCompanyOwnerRole,
  isPlatformOwnerRole,
  isTechnicianRole,
  type StaffIdentity,
} from '@titan/auth';
import type { JobExecutionPhase } from '@titan/shared';
import {
  TECHNICIAN_INTELLIGENCE_GUARANTEES,
  averageOrNull,
  buildTechnicianAuraInsightDrafts,
  computeCompletionHoursFromEvents,
  computeProductivityScore,
  computeTravelMinutesFromEvents,
  emptyPerformanceMetrics,
  mapExecutionPhaseToLifecycle,
  metric,
  resolveTechnicianIntelligenceRange,
  type DecideTechnicianInsightRequest,
  type GenerateTechnicianInsightsRequest,
  type TechnicianAssignedJobSummary,
  type TechnicianAuraInsightSummary,
  type TechnicianCompletionHistoryItem,
  type TechnicianIntelligenceInsightsBundle,
  type TechnicianIntelligenceOwnerOverview,
  type TechnicianIntelligencePeriod,
  type TechnicianIntelligenceSelfView,
  type TechnicianJobLifecycleSummary,
  type TechnicianLifecycleEventSummary,
  type TechnicianMetricAvailability,
  type TechnicianPerformanceMetrics,
} from '@titan/shared';

export type TechnicianIntelligenceActor = StaffIdentity & {
  companyId: string;
  userId: string;
};

export class TechnicianIntelligenceError extends Error {
  constructor(
    public readonly code: 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_ERROR' | 'CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = 'TechnicianIntelligenceError';
  }
}

function parseHours(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export class TechnicianIntelligenceService {
  constructor(private readonly db: DatabaseClient) {}

  private assertOwnerAnalyticsAccess(actor: TechnicianIntelligenceActor): void {
    if (isTechnicianRole(actor)) {
      throw new TechnicianIntelligenceError(
        'FORBIDDEN',
        'Technicians cannot access company-wide Technician Intelligence owner analytics.',
      );
    }
    const allowed =
      isPlatformOwnerRole(actor) ||
      isCompanyOwnerRole(actor) ||
      actor.permissions.includes('*') ||
      actor.permissions.includes('ops:read') ||
      actor.permissions.includes('ops:manage') ||
      actor.permissions.includes('workforce_intelligence:read') ||
      actor.permissions.includes('workforce_intelligence:manage') ||
      actor.permissions.includes('dispatch_intelligence:read') ||
      actor.permissions.includes('dispatch:read') ||
      actor.permissions.includes('intelligence:read');
    if (!allowed) {
      throw new TechnicianIntelligenceError(
        'FORBIDDEN',
        'Missing permission for Technician Intelligence owner analytics.',
      );
    }
  }

  private async recordAudit(
    actor: TechnicianIntelligenceActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'dispatch',
      action,
      entityType: 'technician_intelligence',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        autoExecuted: false,
        noDemoData: true,
      },
    });
  }

  private async loadJobsInRange(
    companyId: string,
    from: Date,
    to: Date,
    technicianId?: string,
  ) {
    const conditions = [
      eq(jobs.companyId, companyId),
      or(
        and(gte(jobs.createdAt, from), lte(jobs.createdAt, to)),
        and(gte(jobs.scheduledAt, from), lte(jobs.scheduledAt, to)),
        and(gte(jobs.updatedAt, from), lte(jobs.updatedAt, to)),
      ),
    ];
    if (technicianId) {
      conditions.push(eq(jobs.assignedUserId, technicianId));
    }

    return this.db.query.jobs.findMany({
      where: and(...conditions),
      with: {
        assignedUser: true,
        customer: true,
      },
    });
  }

  private async loadWorkflowEventsForJobs(companyId: string, jobIds: string[]) {
    if (jobIds.length === 0) return [];
    return this.db
      .select()
      .from(jobWorkflowEvents)
      .where(
        and(eq(jobWorkflowEvents.companyId, companyId), inArray(jobWorkflowEvents.jobId, jobIds)),
      )
      .orderBy(jobWorkflowEvents.createdAt);
  }

  private async loadOvertimeByUser(
    companyId: string,
    from: Date,
    to: Date,
    technicianId?: string,
  ): Promise<Map<string, { hours: number; samples: number }>> {
    const fromDate = from.toISOString().slice(0, 10);
    const toDate = to.toISOString().slice(0, 10);
    const conditions = [
      eq(wiTimesheets.companyId, companyId),
      inArray(wiTimesheets.status, ['submitted', 'approved', 'corrected']),
      lte(wiTimesheets.periodStart, toDate),
      gte(wiTimesheets.periodEnd, fromDate),
    ];
    if (technicianId) {
      conditions.push(eq(wiTimesheets.userId, technicianId));
    }

    const rows = await this.db
      .select({
        userId: wiTimesheets.userId,
        overtimeHours: wiTimesheets.overtimeHours,
        travelHours: wiTimesheets.travelHours,
      })
      .from(wiTimesheets)
      .where(and(...conditions));

    const map = new Map<string, { hours: number; samples: number }>();
    for (const row of rows) {
      const entry = map.get(row.userId) ?? { hours: 0, samples: 0 };
      entry.hours += parseHours(row.overtimeHours);
      entry.samples += 1;
      map.set(row.userId, entry);
    }
    return map;
  }

  private async loadCallbacksByTechnician(
    companyId: string,
    from: Date,
    to: Date,
    technicianId?: string,
  ): Promise<Map<string, number>> {
    const conditions = [
      eq(qualityComebacks.companyId, companyId),
      eq(qualityComebacks.comebackType, 'callback'),
      gte(qualityComebacks.occurredAt, from),
      lte(qualityComebacks.occurredAt, to),
    ];
    if (technicianId) {
      conditions.push(eq(qualityComebacks.originalTechnicianId, technicianId));
    }

    const rows = await this.db
      .select({
        technicianId: qualityComebacks.originalTechnicianId,
      })
      .from(qualityComebacks)
      .where(and(...conditions));

    const map = new Map<string, number>();
    for (const row of rows) {
      if (!row.technicianId) continue;
      map.set(row.technicianId, (map.get(row.technicianId) ?? 0) + 1);
    }
    return map;
  }

  private async loadRatingsByTechnician(
    companyId: string,
    from: Date,
    to: Date,
    jobAssigneeByJobId: Map<string, string>,
    technicianId?: string,
  ): Promise<Map<string, { sum: number; count: number }>> {
    const rows = await this.db
      .select({
        jobId: cxReviewsFeedback.jobId,
        rating: cxReviewsFeedback.rating,
        reviewType: cxReviewsFeedback.reviewType,
      })
      .from(cxReviewsFeedback)
      .where(
        and(
          eq(cxReviewsFeedback.companyId, companyId),
          inArray(cxReviewsFeedback.reviewType, ['job_rating', 'technician_rating']),
          gte(cxReviewsFeedback.createdAt, from),
          lte(cxReviewsFeedback.createdAt, to),
        ),
      );

    const map = new Map<string, { sum: number; count: number }>();
    for (const row of rows) {
      if (row.rating === null || row.rating === undefined || !row.jobId) continue;
      const assignee = jobAssigneeByJobId.get(row.jobId);
      if (!assignee) continue;
      if (technicianId && assignee !== technicianId) continue;
      const entry = map.get(assignee) ?? { sum: 0, count: 0 };
      entry.sum += row.rating;
      entry.count += 1;
      map.set(assignee, entry);
    }
    return map;
  }

  private buildMetricsForTechnicians(input: {
    jobRows: Array<{
      id: string;
      status: string;
      assignedUserId: string | null;
      assignedUser?: { firstName: string | null; lastName: string | null } | null;
    }>;
    eventsByJob: Map<string, Array<{ toPhase: string | null; createdAt: Date }>>;
    overtimeByUser: Map<string, { hours: number; samples: number }>;
    callbacksByUser: Map<string, number>;
    ratingsByUser: Map<string, { sum: number; count: number }>;
  }): TechnicianPerformanceMetrics[] {
    const byUser = new Map<
      string,
      {
        name: string;
        assigned: number;
        completed: number;
        completionHours: number[];
        travelMinutes: number[];
      }
    >();

    for (const job of input.jobRows) {
      if (!job.assignedUserId) continue;
      const name = job.assignedUser
        ? `${job.assignedUser.firstName ?? ''} ${job.assignedUser.lastName ?? ''}`.trim() ||
          'Technician'
        : 'Technician';
      const entry = byUser.get(job.assignedUserId) ?? {
        name,
        assigned: 0,
        completed: 0,
        completionHours: [],
        travelMinutes: [],
      };
      entry.assigned += 1;
      if (job.status === 'completed') entry.completed += 1;

      const events = input.eventsByJob.get(job.id) ?? [];
      const completionHours = computeCompletionHoursFromEvents(events);
      if (completionHours !== null) entry.completionHours.push(completionHours);
      const travel = computeTravelMinutesFromEvents(events);
      if (travel !== null) entry.travelMinutes.push(travel);

      byUser.set(job.assignedUserId, entry);
    }

    return Array.from(byUser.entries()).map(([userId, entry]) => {
      const overtime = input.overtimeByUser.get(userId);
      const callbacks = input.callbacksByUser.get(userId) ?? 0;
      const ratings = input.ratingsByUser.get(userId);
      const avgCompletion = averageOrNull(entry.completionHours);
      const avgTravel = averageOrNull(entry.travelMinutes);
      const productivity = computeProductivityScore({
        jobsAssigned: entry.assigned,
        jobsCompleted: entry.completed,
        callbacks,
      });

      const overtimeAvailability: TechnicianMetricAvailability = overtime
        ? 'available'
        : 'unavailable';
      const travelAvailability: TechnicianMetricAvailability =
        entry.travelMinutes.length > 0 ? 'available' : 'unavailable';
      const completionAvailability: TechnicianMetricAvailability =
        entry.completionHours.length > 0 ? 'available' : 'unavailable';
      const ratingsAvailability: TechnicianMetricAvailability =
        ratings && ratings.count > 0 ? 'available' : 'unavailable';

      return {
        technicianId: userId,
        technicianName: entry.name,
        jobsCompleted: metric(entry.completed, 'count', 'available', null, entry.completed),
        jobsAssigned: metric(entry.assigned, 'count', 'available', null, entry.assigned),
        averageCompletionHours: metric(
          avgCompletion,
          'hours',
          completionAvailability,
          completionAvailability === 'unavailable'
            ? 'No workflow events with start→completed timestamps in range.'
            : null,
          entry.completionHours.length,
        ),
        averageTravelMinutes: metric(
          avgTravel,
          'minutes',
          travelAvailability,
          travelAvailability === 'unavailable'
            ? 'No en_route→on_site workflow events in range.'
            : null,
          entry.travelMinutes.length,
        ),
        overtimeHours: metric(
          overtime ? Math.round(overtime.hours * 10) / 10 : null,
          'hours',
          overtimeAvailability,
          overtimeAvailability === 'unavailable'
            ? 'No submitted/approved timesheet overtime in range.'
            : null,
          overtime?.samples ?? 0,
        ),
        callbacks: metric(callbacks, 'count', 'available', null, callbacks),
        customerRatingAvg: metric(
          ratings && ratings.count > 0
            ? Math.round((ratings.sum / ratings.count) * 10) / 10
            : null,
          'rating',
          ratingsAvailability,
          ratingsAvailability === 'unavailable'
            ? 'No CX job_rating / technician_rating reviews linked to this technician’s jobs in range.'
            : null,
          ratings?.count ?? 0,
        ),
        productivityScore: metric(
          productivity,
          'score',
          productivity === null ? 'unavailable' : 'available',
          productivity === null ? 'No assigned jobs in range to score.' : null,
          entry.assigned,
        ),
      };
    });
  }

  private async aggregateTechnicians(
    companyId: string,
    period: TechnicianIntelligencePeriod,
    technicianId?: string,
  ): Promise<{
    range: { from: Date; to: Date };
    technicians: TechnicianPerformanceMetrics[];
    honestyNotes: string[];
    jobRows: Awaited<ReturnType<TechnicianIntelligenceService['loadJobsInRange']>>;
    eventsByJob: Map<string, Array<{ toPhase: string | null; createdAt: Date }>>;
  }> {
    const range = resolveTechnicianIntelligenceRange(period);
    const jobRows = await this.loadJobsInRange(companyId, range.from, range.to, technicianId);
    const jobIds = jobRows.map((j) => j.id);
    const events = await this.loadWorkflowEventsForJobs(companyId, jobIds);
    const eventsByJob = new Map<string, Array<{ toPhase: string | null; createdAt: Date }>>();
    for (const event of events) {
      const list = eventsByJob.get(event.jobId) ?? [];
      list.push({ toPhase: event.toPhase, createdAt: event.createdAt });
      eventsByJob.set(event.jobId, list);
    }

    const jobAssigneeByJobId = new Map<string, string>();
    for (const job of jobRows) {
      if (job.assignedUserId) jobAssigneeByJobId.set(job.id, job.assignedUserId);
    }

    const [overtimeByUser, callbacksByUser, ratingsByUser] = await Promise.all([
      this.loadOvertimeByUser(companyId, range.from, range.to, technicianId),
      this.loadCallbacksByTechnician(companyId, range.from, range.to, technicianId),
      this.loadRatingsByTechnician(
        companyId,
        range.from,
        range.to,
        jobAssigneeByJobId,
        technicianId,
      ),
    ]);

    const technicians = this.buildMetricsForTechnicians({
      jobRows,
      eventsByJob,
      overtimeByUser,
      callbacksByUser,
      ratingsByUser,
    });

    const honestyNotes: string[] = [
      'Lifecycle steps map onto existing job_execution_phase (travelling=en_route, arrived=on_site, started=in_progress).',
      'Travel time uses job_workflow_events en_route→on_site only — never schedule defaults as measured travel.',
      'Callbacks count quality_comebacks with comebackType=callback (not dispatch missed-call callbacks).',
      'Customer ratings use CX job_rating / technician_rating rows linked to jobs; shown unavailable when none exist.',
    ];

    if (technicians.every((t) => t.customerRatingAvg.availability === 'unavailable')) {
      honestyNotes.push('No customer ratings available for technicians in this range.');
    }
    if (technicians.every((t) => t.overtimeHours.availability === 'unavailable')) {
      honestyNotes.push('No timesheet overtime rows available in this range.');
    }

    return { range, technicians, honestyNotes, jobRows, eventsByJob };
  }

  async getOwnerOverview(
    actor: TechnicianIntelligenceActor,
    period: TechnicianIntelligencePeriod = 'weekly',
  ): Promise<TechnicianIntelligenceOwnerOverview> {
    this.assertOwnerAnalyticsAccess(actor);

    const { range, technicians, honestyNotes } = await this.aggregateTechnicians(
      actor.companyId,
      period,
    );

    const overtimeValues = technicians
      .filter((t) => t.overtimeHours.value !== null)
      .map((t) => t.overtimeHours.value as number);
    const travelValues = technicians
      .filter((t) => t.averageTravelMinutes.value !== null)
      .map((t) => t.averageTravelMinutes.value as number);
    const ratingValues = technicians
      .filter((t) => t.customerRatingAvg.value !== null)
      .map((t) => t.customerRatingAvg.value as number);

    await this.recordAudit(actor, 'technician_intelligence.owner_overview.read', actor.companyId, {
      period,
      technicianCount: technicians.length,
    });

    return {
      generatedAt: new Date().toISOString(),
      period,
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      technicianCount: technicians.length,
      technicians: technicians.sort(
        (a, b) => (b.jobsCompleted.value ?? 0) - (a.jobsCompleted.value ?? 0),
      ),
      companyTotals: {
        jobsCompleted: technicians.reduce((acc, t) => acc + (t.jobsCompleted.value ?? 0), 0),
        jobsAssigned: technicians.reduce((acc, t) => acc + (t.jobsAssigned.value ?? 0), 0),
        overtimeHours:
          overtimeValues.length > 0
            ? Math.round(overtimeValues.reduce((a, b) => a + b, 0) * 10) / 10
            : null,
        overtimeAvailability: overtimeValues.length > 0 ? 'available' : 'unavailable',
        callbacks: technicians.reduce((acc, t) => acc + (t.callbacks.value ?? 0), 0),
        averageTravelMinutes: averageOrNull(travelValues),
        travelAvailability: travelValues.length > 0 ? 'available' : 'unavailable',
        customerRatingAvg: averageOrNull(ratingValues),
        ratingsAvailability: ratingValues.length > 0 ? 'available' : 'unavailable',
      },
      honestyNotes,
      guarantees: TECHNICIAN_INTELLIGENCE_GUARANTEES,
    };
  }

  async getOwnerTechnicianDetail(
    actor: TechnicianIntelligenceActor,
    technicianId: string,
    period: TechnicianIntelligencePeriod = 'weekly',
  ): Promise<{
    performance: TechnicianPerformanceMetrics;
    assignedJobs: TechnicianAssignedJobSummary[];
    completionHistory: TechnicianCompletionHistoryItem[];
    honestyNotes: string[];
    guarantees: typeof TECHNICIAN_INTELLIGENCE_GUARANTEES;
    range: { from: string; to: string };
    period: TechnicianIntelligencePeriod;
  }> {
    this.assertOwnerAnalyticsAccess(actor);
    const self = await this.buildSelfView(actor.companyId, technicianId, period);
    await this.recordAudit(actor, 'technician_intelligence.owner_technician.read', technicianId, {
      period,
    });
    return {
      performance: self.performance,
      assignedJobs: self.assignedJobs,
      completionHistory: self.completionHistory,
      honestyNotes: self.honestyNotes,
      guarantees: TECHNICIAN_INTELLIGENCE_GUARANTEES,
      range: self.range,
      period: self.period,
    };
  }

  private async buildSelfView(
    companyId: string,
    technicianId: string,
    period: TechnicianIntelligencePeriod,
  ): Promise<TechnicianIntelligenceSelfView> {
    const user = await this.db.query.users.findFirst({
      where: and(eq(users.id, technicianId), eq(users.companyId, companyId)),
    });
    if (!user) {
      throw new TechnicianIntelligenceError('NOT_FOUND', 'Technician not found in this company.');
    }

    const technicianName =
      `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email || 'Technician';

    const { range, technicians, honestyNotes, jobRows, eventsByJob } =
      await this.aggregateTechnicians(companyId, period, technicianId);

    const performance =
      technicians[0] ?? emptyPerformanceMetrics(technicianId, technicianName);

    const activeStatuses = new Set(['new', 'scheduled', 'in_progress']);
    const assignedJobs: TechnicianAssignedJobSummary[] = jobRows
      .filter((job) => activeStatuses.has(job.status) || job.executionPhase !== 'completed')
      .filter((job) => job.status !== 'cancelled' && job.status !== 'completed')
      .map((job) => ({
        jobId: job.id,
        jobNumber: job.jobNumber,
        title: job.title,
        status: job.status,
        executionPhase: job.executionPhase as JobExecutionPhase | null,
        lifecycleStep: mapExecutionPhaseToLifecycle(job.executionPhase, job.status),
        scheduledAt: job.scheduledAt?.toISOString() ?? null,
        customerName: job.snapshotCustomerName ?? job.customer?.name ?? null,
        phaseUpdatedAt: job.executionPhaseUpdatedAt?.toISOString() ?? null,
      }))
      .sort((a, b) => {
        const aTime = a.scheduledAt ? Date.parse(a.scheduledAt) : 0;
        const bTime = b.scheduledAt ? Date.parse(b.scheduledAt) : 0;
        return aTime - bTime;
      });

    const callbackJobIds = new Set<string>();
    const callbackRows = await this.db
      .select({
        originalJobId: qualityComebacks.originalJobId,
      })
      .from(qualityComebacks)
      .where(
        and(
          eq(qualityComebacks.companyId, companyId),
          eq(qualityComebacks.comebackType, 'callback'),
          eq(qualityComebacks.originalTechnicianId, technicianId),
        ),
      );
    for (const row of callbackRows) callbackJobIds.add(row.originalJobId);

    const completionHistory: TechnicianCompletionHistoryItem[] = jobRows
      .filter((job) => job.status === 'completed')
      .map((job) => {
        const events = eventsByJob.get(job.id) ?? [];
        const completedEvent = [...events]
          .reverse()
          .find((e) => e.toPhase === 'completed');
        return {
          jobId: job.id,
          jobNumber: job.jobNumber,
          title: job.title,
          completedAt:
            completedEvent?.createdAt.toISOString() ??
            job.executionPhaseUpdatedAt?.toISOString() ??
            job.updatedAt.toISOString(),
          completionHours: computeCompletionHoursFromEvents(events),
          travelMinutes: computeTravelMinutesFromEvents(events),
          hadCallback: callbackJobIds.has(job.id),
        };
      })
      .sort((a, b) => {
        const aTime = a.completedAt ? Date.parse(a.completedAt) : 0;
        const bTime = b.completedAt ? Date.parse(b.completedAt) : 0;
        return bTime - aTime;
      });

    return {
      generatedAt: new Date().toISOString(),
      period,
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      technicianId,
      technicianName,
      performance,
      assignedJobs,
      completionHistory,
      honestyNotes,
      exclusions: {
        companyFinances: true,
        otherTechnicians: true,
        ownerAnalytics: true,
      },
      guarantees: TECHNICIAN_INTELLIGENCE_GUARANTEES,
    };
  }

  async getSelfView(
    actor: TechnicianIntelligenceActor,
    period: TechnicianIntelligencePeriod = 'weekly',
  ): Promise<TechnicianIntelligenceSelfView> {
    // Technicians always see self; owners/managers may preview self for their own user id only via /me.
    const view = await this.buildSelfView(actor.companyId, actor.userId, period);
    await this.recordAudit(actor, 'technician_intelligence.self.read', actor.userId, { period });
    return view;
  }

  async getJobLifecycle(
    actor: TechnicianIntelligenceActor,
    jobId: string,
  ): Promise<TechnicianJobLifecycleSummary> {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, actor.companyId)),
    });
    if (!job) {
      throw new TechnicianIntelligenceError('NOT_FOUND', 'Job not found.');
    }

    if (isTechnicianRole(actor) && job.assignedUserId !== actor.userId) {
      throw new TechnicianIntelligenceError(
        'FORBIDDEN',
        'Technicians may only view lifecycle for their assigned jobs.',
      );
    }

    if (!isTechnicianRole(actor)) {
      this.assertOwnerAnalyticsAccess(actor);
    }

    const events = await this.db
      .select()
      .from(jobWorkflowEvents)
      .where(
        and(eq(jobWorkflowEvents.companyId, actor.companyId), eq(jobWorkflowEvents.jobId, jobId)),
      )
      .orderBy(jobWorkflowEvents.createdAt);

    const eventSummaries: TechnicianLifecycleEventSummary[] = events.map((event) => ({
      id: event.id,
      jobId: event.jobId,
      action: event.action,
      fromPhase: (event.fromPhase as JobExecutionPhase | null) ?? null,
      toPhase: (event.toPhase as JobExecutionPhase | null) ?? null,
      lifecycleStep: mapExecutionPhaseToLifecycle(event.toPhase as JobExecutionPhase | null),
      createdAt: event.createdAt.toISOString(),
      userId: event.userId,
    }));

    await this.recordAudit(actor, 'technician_intelligence.lifecycle.read', jobId, {
      eventCount: eventSummaries.length,
    });

    return {
      jobId: job.id,
      jobNumber: job.jobNumber,
      title: job.title,
      status: job.status,
      executionPhase: job.executionPhase as JobExecutionPhase | null,
      lifecycleStep: mapExecutionPhaseToLifecycle(job.executionPhase, job.status),
      scheduledAt: job.scheduledAt?.toISOString() ?? null,
      scheduledEndAt: job.scheduledEndAt?.toISOString() ?? null,
      assignedUserId: job.assignedUserId,
      phaseUpdatedAt: job.executionPhaseUpdatedAt?.toISOString() ?? null,
      events: eventSummaries,
    };
  }

  private toInsightSummary(
    row: typeof tiAuraInsights.$inferSelect,
    technicianName: string | null,
  ): TechnicianAuraInsightSummary {
    return {
      id: row.id,
      insightType: row.insightType,
      status: row.status,
      subject: row.subject,
      body: row.body,
      technicianId: row.technicianId,
      technicianName,
      supportingSignals: row.supportingSignals ?? [],
      autoExecuted: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  async listInsights(
    actor: TechnicianIntelligenceActor,
  ): Promise<TechnicianIntelligenceInsightsBundle> {
    this.assertOwnerAnalyticsAccess(actor);

    const rows = await this.db
      .select()
      .from(tiAuraInsights)
      .where(eq(tiAuraInsights.companyId, actor.companyId))
      .orderBy(desc(tiAuraInsights.createdAt))
      .limit(100);

    const techIds = [
      ...new Set(rows.map((r) => r.technicianId).filter((id): id is string => Boolean(id))),
    ];
    const techNameById = new Map<string, string>();
    if (techIds.length > 0) {
      const techRows = await this.db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(users)
        .where(and(eq(users.companyId, actor.companyId), inArray(users.id, techIds)));
      for (const tech of techRows) {
        techNameById.set(
          tech.id,
          `${tech.firstName ?? ''} ${tech.lastName ?? ''}`.trim() || 'Technician',
        );
      }
    }

    const insights = rows.map((row) =>
      this.toInsightSummary(
        row,
        row.technicianId ? (techNameById.get(row.technicianId) ?? null) : null,
      ),
    );

    return {
      generatedAt: new Date().toISOString(),
      insights,
      pendingCount: insights.filter((i) => i.status === 'pending_approval').length,
      guarantees: TECHNICIAN_INTELLIGENCE_GUARANTEES,
    };
  }

  async generateInsights(
    actor: TechnicianIntelligenceActor,
    input: GenerateTechnicianInsightsRequest = {},
  ): Promise<TechnicianIntelligenceInsightsBundle> {
    this.assertOwnerAnalyticsAccess(actor);
    const period = input.period ?? 'weekly';
    const { technicians } = await this.aggregateTechnicians(actor.companyId, period);
    const drafts = buildTechnicianAuraInsightDrafts({ technicians });

    if (drafts.length === 0) {
      await this.recordAudit(actor, 'technician_intelligence.insights.generate', actor.companyId, {
        period,
        created: 0,
        reason: 'no_signals',
      });
      return this.listInsights(actor);
    }

    // Deduplicate against pending insights with same subject for this company.
    const pending = await this.db
      .select({ subject: tiAuraInsights.subject })
      .from(tiAuraInsights)
      .where(
        and(
          eq(tiAuraInsights.companyId, actor.companyId),
          eq(tiAuraInsights.status, 'pending_approval'),
        ),
      );
    const pendingSubjects = new Set(pending.map((p) => p.subject));

    const toInsert = drafts.filter((d) => !pendingSubjects.has(d.subject));
    if (toInsert.length > 0) {
      await this.db.insert(tiAuraInsights).values(
        toInsert.map((draft) => ({
          companyId: actor.companyId,
          insightType: draft.insightType,
          status: 'pending_approval' as const,
          subject: draft.subject,
          body: draft.body,
          technicianId: draft.technicianId,
          supportingSignals: draft.supportingSignals,
          autoExecuted: false,
          createdByUserId: actor.userId,
          metadata: { period, source: 'live_aggregation' },
        })),
      );
    }

    await this.recordAudit(actor, 'technician_intelligence.insights.generate', actor.companyId, {
      period,
      created: toInsert.length,
      skippedDuplicates: drafts.length - toInsert.length,
      autoExecuted: false,
    });

    return this.listInsights(actor);
  }

  async decideInsight(
    actor: TechnicianIntelligenceActor,
    insightId: string,
    input: DecideTechnicianInsightRequest,
  ): Promise<TechnicianAuraInsightSummary> {
    this.assertOwnerAnalyticsAccess(actor);

    const [row] = await this.db
      .select()
      .from(tiAuraInsights)
      .where(
        and(eq(tiAuraInsights.id, insightId), eq(tiAuraInsights.companyId, actor.companyId)),
      )
      .limit(1);

    if (!row) {
      throw new TechnicianIntelligenceError('NOT_FOUND', 'Insight not found.');
    }
    if (row.status !== 'pending_approval') {
      throw new TechnicianIntelligenceError(
        'CONFLICT',
        'Only pending_approval insights can be decided.',
      );
    }

    const status = input.decision === 'approve' ? 'approved' : 'rejected';
    const [updated] = await this.db
      .update(tiAuraInsights)
      .set({
        status,
        decidedAt: new Date(),
        decidedByUserId: actor.userId,
        decisionNotes: input.notes ?? null,
        updatedAt: new Date(),
        // Approval records acknowledgment only — never executes operational changes.
        autoExecuted: false,
      })
      .where(eq(tiAuraInsights.id, insightId))
      .returning();

    await this.recordAudit(actor, 'technician_intelligence.insights.decide', insightId, {
      decision: input.decision,
      autoExecuted: false,
      note: 'Approval does not execute schedule, dispatch, or messaging changes.',
    });

    let technicianName: string | null = null;
    if (updated.technicianId) {
      const tech = await this.db.query.users.findFirst({
        where: and(eq(users.id, updated.technicianId), eq(users.companyId, actor.companyId)),
      });
      if (tech) {
        technicianName =
          `${tech.firstName ?? ''} ${tech.lastName ?? ''}`.trim() || 'Technician';
      }
    }

    return this.toInsightSummary(updated, technicianName);
  }
}
