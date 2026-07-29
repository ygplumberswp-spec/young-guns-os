import { and, desc, eq, inArray, isNotNull, lt } from 'drizzle-orm';
import type {
  CreateDispatchActionRequest,
  CreateDispatchCallbackRequest,
  CreateDispatchEmergencyAssessmentRequest,
  CreateDispatchReceptionistSummaryRequest,
  CreateDispatchRoutingRecommendationRequest,
  DispatchActionSummary,
  DispatchAuraContext,
  DispatchCallbackRequestSummary,
  DispatchCallQueueAnalytics,
  DispatchEmergencyAssessmentSummary,
  DispatchOperationsDashboard,
  DispatchRecommendationSummary,
  DispatchReceptionistSummaryRecord,
  DispatchRoutingRecommendationSummary,
  DispatchTechnicianMatchSummary,
  GenerateDispatchRecommendationsRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  dispatchActions,
  dispatchCallbackRequests,
  dispatchEmergencyAssessments,
  dispatchRecommendations,
  dispatchReceptionistSummaries,
  dispatchRoutingRecommendations,
  jobs,
} from '@titan/db';
import type { CommunicationsIntelligenceService } from './communications-intelligence.service.js';
import type { NotificationService } from './notification.service.js';
import type { QualityAssuranceService } from './quality-assurance.service.js';
import type { SchedulingService } from './scheduling.service.js';

export class DispatchIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DispatchIntelligenceError';
  }
}

type StaffScope = {
  companyId: string;
  userId: string;
};

const EMERGENCY_KEYWORDS: Record<string, string[]> = {
  burst_pipe: ['burst pipe', 'burst pipes', 'pipe burst'],
  flooding: ['flooding', 'flood', 'water everywhere'],
  blocked_drain: ['blocked drain', 'drain blocked', 'clogged drain'],
  gas_leak: ['gas leak', 'smell gas', 'gas smell'],
  water_leak: ['water leak', 'leaking water', 'leak'],
  no_water: ['no water', 'water off', 'no supply'],
  sewer_overflow: ['sewer overflow', 'sewage', 'sewer backup'],
};

export class DispatchIntelligenceService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly notificationService: NotificationService,
    private readonly communicationsIntelligenceService: CommunicationsIntelligenceService,
    private readonly schedulingService: SchedulingService,
    private readonly qualityAssuranceService: QualityAssuranceService,
  ) {}

  async listReceptionistSummaries(companyId: string): Promise<DispatchReceptionistSummaryRecord[]> {
    const rows = await this.db.query.dispatchReceptionistSummaries.findMany({
      where: eq(dispatchReceptionistSummaries.companyId, companyId),
      with: { customer: true },
      orderBy: [desc(dispatchReceptionistSummaries.createdAt)],
      limit: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      voiceSessionId: row.voiceSessionId,
      customerId: row.customerId,
      customerName: row.customer?.name ?? null,
      serviceIntent: row.serviceIntent,
      emergencyDetected: row.emergencyDetected,
      afterHours: row.afterHours,
      branchKey: row.branchKey,
      languagePreference: row.languagePreference,
      priorityScore: row.priorityScore,
      summary: row.summary,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createReceptionistSummary(
    scope: StaffScope,
    input: CreateDispatchReceptionistSummaryRequest,
  ): Promise<DispatchReceptionistSummaryRecord> {
    const summary = input.summary.trim();
    if (!summary) {
      throw new DispatchIntelligenceError('VALIDATION_ERROR', 'Receptionist summary is required');
    }

    const emergencyDetected =
      input.emergencyDetected ?? detectEmergencyFromText(`${input.serviceIntent ?? ''} ${summary}`) !== null;

    const [created] = await this.db
      .insert(dispatchReceptionistSummaries)
      .values({
        companyId: scope.companyId,
        voiceSessionId: input.voiceSessionId ?? null,
        customerId: input.customerId ?? null,
        serviceIntent: input.serviceIntent?.trim() || null,
        emergencyDetected,
        afterHours: input.afterHours ?? false,
        branchKey: input.branchKey?.trim() || null,
        languagePreference: input.languagePreference?.trim() || null,
        priorityScore: input.priorityScore ?? (emergencyDetected ? 90 : 50),
        summary,
        createdByUserId: scope.userId,
      })
      .returning();

    const summaries = await this.listReceptionistSummaries(scope.companyId);
    return summaries.find((item) => item.id === created!.id)!;
  }

  async listRoutingRecommendations(companyId: string): Promise<DispatchRoutingRecommendationSummary[]> {
    const rows = await this.db.query.dispatchRoutingRecommendations.findMany({
      where: eq(dispatchRoutingRecommendations.companyId, companyId),
      orderBy: [desc(dispatchRoutingRecommendations.priority), desc(dispatchRoutingRecommendations.createdAt)],
      limit: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      voiceSessionId: row.voiceSessionId,
      callIntelligenceId: row.callIntelligenceId,
      routingType: row.routingType,
      targetBranch: row.targetBranch,
      targetDepartment: row.targetDepartment,
      priority: row.priority,
      recommendation: row.recommendation,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createRoutingRecommendation(
    scope: StaffScope,
    input: CreateDispatchRoutingRecommendationRequest,
  ): Promise<DispatchRoutingRecommendationSummary> {
    const recommendation = input.recommendation.trim();
    if (!recommendation) {
      throw new DispatchIntelligenceError('VALIDATION_ERROR', 'Routing recommendation is required');
    }

    const [created] = await this.db
      .insert(dispatchRoutingRecommendations)
      .values({
        companyId: scope.companyId,
        voiceSessionId: input.voiceSessionId ?? null,
        callIntelligenceId: input.callIntelligenceId ?? null,
        routingType: input.routingType,
        targetBranch: input.targetBranch?.trim() || null,
        targetDepartment: input.targetDepartment?.trim() || null,
        priority: input.priority ?? 100,
        recommendation,
        createdByUserId: scope.userId,
      })
      .returning();

    const rows = await this.listRoutingRecommendations(scope.companyId);
    return rows.find((item) => item.id === created!.id)!;
  }

  async listCallbackRequests(companyId: string, status?: string): Promise<DispatchCallbackRequestSummary[]> {
    const rows = await this.db.query.dispatchCallbackRequests.findMany({
      where: status
        ? and(
            eq(dispatchCallbackRequests.companyId, companyId),
            eq(dispatchCallbackRequests.status, status as never),
          )
        : eq(dispatchCallbackRequests.companyId, companyId),
      with: { customer: true },
      orderBy: [desc(dispatchCallbackRequests.createdAt)],
      limit: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      customerId: row.customerId,
      customerName: row.customer?.name ?? null,
      voiceSessionId: row.voiceSessionId,
      phoneNumber: row.phoneNumber,
      status: row.status,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      outcome: row.outcome,
      missedCallTracked: row.missedCallTracked,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createCallbackRequest(
    scope: StaffScope,
    input: CreateDispatchCallbackRequest,
  ): Promise<DispatchCallbackRequestSummary> {
    const [created] = await this.db
      .insert(dispatchCallbackRequests)
      .values({
        companyId: scope.companyId,
        customerId: input.customerId ?? null,
        voiceSessionId: input.voiceSessionId ?? null,
        phoneNumber: input.phoneNumber?.trim() || null,
        status: 'pending_approval',
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        missedCallTracked: input.missedCallTracked ?? false,
        notes: input.notes?.trim() || null,
        createdByUserId: scope.userId,
      })
      .returning();

    await this.notificationService.createNotification({
      companyId: scope.companyId,
      recipientType: 'staff',
      recipientUserId: scope.userId,
      notificationType: 'dispatch_alert',
      title: 'Callback request pending approval',
      body: input.phoneNumber ?? 'Customer callback requires approval before execution.',
      entityType: 'dispatch_callback_request',
      entityId: created!.id,
    });

    const callbacks = await this.listCallbackRequests(scope.companyId);
    return callbacks.find((item) => item.id === created!.id)!;
  }

  async listEmergencyAssessments(companyId: string): Promise<DispatchEmergencyAssessmentSummary[]> {
    const rows = await this.db.query.dispatchEmergencyAssessments.findMany({
      where: eq(dispatchEmergencyAssessments.companyId, companyId),
      orderBy: [desc(dispatchEmergencyAssessments.priority), desc(dispatchEmergencyAssessments.createdAt)],
      limit: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      jobId: row.jobId,
      voiceSessionId: row.voiceSessionId,
      emergencyType: row.emergencyType,
      priority: row.priority,
      recommendedResponseMinutes: row.recommendedResponseMinutes,
      escalationRecommendation: row.escalationRecommendation,
      branchRecommendation: row.branchRecommendation,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createEmergencyAssessment(
    scope: StaffScope,
    input: CreateDispatchEmergencyAssessmentRequest,
  ): Promise<DispatchEmergencyAssessmentSummary> {
    const [created] = await this.db
      .insert(dispatchEmergencyAssessments)
      .values({
        companyId: scope.companyId,
        jobId: input.jobId ?? null,
        voiceSessionId: input.voiceSessionId ?? null,
        emergencyType: input.emergencyType,
        priority: input.priority ?? 100,
        recommendedResponseMinutes: input.recommendedResponseMinutes ?? null,
        escalationRecommendation: input.escalationRecommendation?.trim() || null,
        branchRecommendation: input.branchRecommendation?.trim() || null,
        createdByUserId: scope.userId,
      })
      .returning();

    const assessments = await this.listEmergencyAssessments(scope.companyId);
    return assessments.find((item) => item.id === created!.id)!;
  }

  async listRecommendations(companyId: string): Promise<DispatchRecommendationSummary[]> {
    const rows = await this.db.query.dispatchRecommendations.findMany({
      where: eq(dispatchRecommendations.companyId, companyId),
      with: { technician: true },
      orderBy: [desc(dispatchRecommendations.createdAt)],
      limit: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      recommendationType: row.recommendationType,
      subject: row.subject,
      recommendation: row.recommendation,
      technicianId: row.technicianId,
      technicianName: row.technician ? `${row.technician.firstName} ${row.technician.lastName}` : null,
      jobId: row.jobId,
      branchKey: row.branchKey,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async generateRecommendations(
    companyId: string,
    input: GenerateDispatchRecommendationsRequest = {},
  ): Promise<DispatchRecommendationSummary[]> {
    const schedulingContext = await this.schedulingService.buildAuraContext(companyId);
    const technicianIntel = await this.qualityAssuranceService.getTechnicianIntelligence(companyId);
    const generated: DispatchRecommendationSummary[] = [];

    const overloaded = schedulingContext.assigneeWorkload
      .filter((item) => item.scheduledJobCount >= 5)
      .sort((a, b) => b.scheduledJobCount - a.scheduledJobCount);

    for (const assignee of overloaded.slice(0, 3)) {
      const [created] = await this.db
        .insert(dispatchRecommendations)
        .values({
          companyId,
          recommendationType: 'workload_balancing',
          subject: `Workload balancing for ${assignee.userName}`,
          recommendation: `${assignee.userName} has ${assignee.scheduledJobCount} scheduled job(s). Consider reassignment to balance workload.`,
          technicianId: assignee.userId,
          branchKey: input.branchKey ?? null,
        })
        .returning();
      generated.push({
        id: created!.id,
        recommendationType: 'workload_balancing',
        subject: created!.subject,
        recommendation: created!.recommendation,
        technicianId: created!.technicianId,
        technicianName: assignee.userName,
        jobId: null,
        branchKey: created!.branchKey,
        createdAt: created!.createdAt.toISOString(),
      });
    }

    const highComeback = technicianIntel.technicians
      .filter((tech) => (tech.comebackRatePercent ?? 0) >= 15)
      .slice(0, 3);

    for (const tech of highComeback) {
      const [created] = await this.db
        .insert(dispatchRecommendations)
        .values({
          companyId,
          recommendationType: 'technician_reassignment',
          subject: `Review assignments for ${tech.technicianName}`,
          recommendation: `${tech.technicianName} has a ${tech.comebackRatePercent}% comeback rate. Review dispatch assignments for complex jobs.`,
          technicianId: tech.technicianId,
        })
        .returning();
      generated.push({
        id: created!.id,
        recommendationType: 'technician_reassignment',
        subject: created!.subject,
        recommendation: created!.recommendation,
        technicianId: created!.technicianId,
        technicianName: tech.technicianName,
        jobId: null,
        branchKey: null,
        createdAt: created!.createdAt.toISOString(),
      });
    }

    if (generated.length === 0) {
      const [created] = await this.db
        .insert(dispatchRecommendations)
        .values({
          companyId,
          recommendationType: 'staffing_shortage',
          subject: 'No dispatch imbalances detected',
          recommendation:
            'Current scheduling and technician quality data show no urgent reassignment recommendations. Re-run after more jobs or calls are recorded.',
        })
        .returning();
      generated.push({
        id: created!.id,
        recommendationType: 'staffing_shortage',
        subject: created!.subject,
        recommendation: created!.recommendation,
        technicianId: null,
        technicianName: null,
        jobId: null,
        branchKey: null,
        createdAt: created!.createdAt.toISOString(),
      });
    }

    return generated;
  }

  async listActions(companyId: string, status?: string): Promise<DispatchActionSummary[]> {
    const rows = await this.db.query.dispatchActions.findMany({
      where: status
        ? and(eq(dispatchActions.companyId, companyId), eq(dispatchActions.status, status as never))
        : eq(dispatchActions.companyId, companyId),
      orderBy: [desc(dispatchActions.createdAt)],
      limit: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      actionType: row.actionType,
      status: row.status,
      subject: row.subject,
      recommendation: row.recommendation,
      jobId: row.jobId,
      technicianId: row.technicianId,
      callbackRequestId: row.callbackRequestId,
      payload: row.payload,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createAction(scope: StaffScope, input: CreateDispatchActionRequest): Promise<DispatchActionSummary> {
    const [created] = await this.db
      .insert(dispatchActions)
      .values({
        companyId: scope.companyId,
        actionType: input.actionType,
        status: 'pending_approval',
        subject: input.subject.trim(),
        recommendation: input.recommendation.trim(),
        jobId: input.jobId ?? null,
        technicianId: input.technicianId ?? null,
        callbackRequestId: input.callbackRequestId ?? null,
        payload: input.payload ?? {},
        createdByUserId: scope.userId,
      })
      .returning();

    await this.notificationService.createNotification({
      companyId: scope.companyId,
      recipientType: 'staff',
      recipientUserId: scope.userId,
      notificationType: 'dispatch_alert',
      title: 'Dispatch action pending approval',
      body: input.subject,
      entityType: 'dispatch_action',
      entityId: created!.id,
    });

    const actions = await this.listActions(scope.companyId);
    return actions.find((item) => item.id === created!.id)!;
  }

  async getCallQueueAnalytics(companyId: string): Promise<DispatchCallQueueAnalytics> {
    const callHistory = await this.communicationsIntelligenceService.getCallHistory(companyId);
    const callbacks = await this.listCallbackRequests(companyId);

    const liveQueue = callHistory.filter(
      (call) => call.callType === 'inbound' && call.sessionStatus === 'active',
    );
    const abandonedCallCount = callHistory.filter(
      (call) => call.outcome === 'missed' || call.callType === 'missed',
    ).length;
    const callbackQueueCount = callbacks.filter((item) =>
      ['pending_approval', 'approved', 'scheduled'].includes(item.status),
    ).length;

    const hourMap = new Map<number, number>();
    for (const call of callHistory) {
      const timestamp = call.startedAt ?? call.createdAt;
      const hour = new Date(timestamp).getHours();
      hourMap.set(hour, (hourMap.get(hour) ?? 0) + 1);
    }

    const busiestHours = [...hourMap.entries()]
      .map(([hour, callCount]) => ({ hour, callCount }))
      .sort((a, b) => b.callCount - a.callCount)
      .slice(0, 5);

    const staffingRecommendations: string[] = [];
    if (callHistory.length === 0) {
      staffingRecommendations.push('No call records yet — staffing recommendations appear once communication data exists.');
    } else if (abandonedCallCount > 0) {
      staffingRecommendations.push(
        `${abandonedCallCount} missed/abandoned call(s) recorded — review receptionist coverage during busiest hours.`,
      );
    }

    return {
      liveQueueCount: liveQueue.length,
      callbackQueueCount,
      abandonedCallCount,
      averageWaitMinutes: null,
      receptionistWorkloadCount: liveQueue.length,
      busiestHours,
      staffingRecommendations,
    };
  }

  async getTechnicianMatching(companyId: string, jobId?: string): Promise<DispatchTechnicianMatchSummary[]> {
    const [assignees, schedulingContext, technicianIntel] = await Promise.all([
      this.schedulingService.listAssignees(companyId),
      this.schedulingService.buildAuraContext(companyId),
      this.qualityAssuranceService.getTechnicianIntelligence(companyId),
    ]);

    return assignees.map((assignee) => {
      const workload = schedulingContext.assigneeWorkload.find((item) => item.userId === assignee.id);
      const quality = technicianIntel.technicians.find((item) => item.technicianId === assignee.id);
      const workloadCount = workload?.scheduledJobCount ?? 0;
      const overtimeRisk: DispatchTechnicianMatchSummary['overtimeRisk'] =
        workloadCount >= 8 ? 'high' : workloadCount >= 5 ? 'medium' : 'low';

      return {
        technicianId: assignee.id,
        technicianName: `${assignee.firstName} ${assignee.lastName}`,
        distanceKm: null,
        availabilityScore: workloadCount <= 3 ? 90 : workloadCount <= 6 ? 60 : 30,
        qualityScore: quality?.averageQualityScore ?? null,
        comebackRatePercent: quality?.comebackRatePercent ?? null,
        workloadCount,
        overtimeRisk,
        recommendation: buildTechnicianRecommendation(
          `${assignee.firstName} ${assignee.lastName}`,
          workloadCount,
          quality?.comebackRatePercent ?? null,
          jobId,
        ),
      };
    });
  }

  async getOperationsDashboard(companyId: string): Promise<DispatchOperationsDashboard> {
    const now = new Date();
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);

    const [
      callQueue,
      callbacks,
      emergencies,
      pendingActions,
      recommendations,
      schedulingStats,
      calendar,
      delayedJobs,
      assignees,
    ] = await Promise.all([
      this.getCallQueueAnalytics(companyId),
      this.listCallbackRequests(companyId, 'pending_approval'),
      this.listEmergencyAssessments(companyId),
      this.listActions(companyId, 'pending_approval'),
      this.listRecommendations(companyId),
      this.schedulingService.getStats(companyId),
      this.schedulingService.getCalendar(companyId, from, to),
      this.db.query.jobs.findMany({
        where: and(
          eq(jobs.companyId, companyId),
          isNotNull(jobs.scheduledAt),
          lt(jobs.scheduledAt, now),
          inArray(jobs.status, ['scheduled', 'in_progress']),
        ),
        limit: 100,
      }),
      this.schedulingService.listAssignees(companyId),
    ]);

    const branchMap = new Map<string, number>();
    for (const event of calendar.events) {
      const branchKey = (event as { branchKey?: string }).branchKey ?? 'default';
      branchMap.set(branchKey, (branchMap.get(branchKey) ?? 0) + 1);
    }

    return {
      summary: `${assignees.length} technician(s), ${schedulingStats.scheduledCount} scheduled job(s), ${callQueue.liveQueueCount} live queue item(s), ${pendingActions.length} pending action(s).`,
      liveTechnicianCount: assignees.length,
      scheduledJobCount: schedulingStats.scheduledCount,
      delayedJobCount: delayedJobs.length,
      emergencyAssessmentCount: emergencies.length,
      pendingCallbackCount: callbacks.length,
      pendingActionCount: pendingActions.length,
      branchWorkload: [...branchMap.entries()].map(([branchKey, jobCount]) => ({ branchKey, jobCount })),
      callQueue,
      recentRecommendations: recommendations.slice(0, 10),
    };
  }

  async buildDispatchAuraContext(companyId: string): Promise<DispatchAuraContext> {
    const dashboard = await this.getOperationsDashboard(companyId);

    return {
      summary: dashboard.summary,
      liveQueueCount: dashboard.callQueue.liveQueueCount,
      pendingCallbackCount: dashboard.pendingCallbackCount,
      pendingActionCount: dashboard.pendingActionCount,
      emergencyAssessmentCount: dashboard.emergencyAssessmentCount,
      scheduledJobCount: dashboard.scheduledJobCount,
    };
  }
}

function detectEmergencyFromText(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [type, keywords] of Object.entries(EMERGENCY_KEYWORDS)) {
    if (keywords.some((keyword) => lower.includes(keyword))) {
      return type;
    }
  }
  return null;
}

function buildTechnicianRecommendation(
  name: string,
  workloadCount: number,
  comebackRate: number | null,
  jobId?: string,
): string {
  const parts = [`${name}: ${workloadCount} scheduled job(s).`];
  if (comebackRate !== null) parts.push(`Comeback rate ${comebackRate}%.`);
  if (jobId) parts.push(`Review suitability for job ${jobId}.`);
  parts.push('Recommendation only — no automatic assignment.');
  return parts.join(' ');
}
