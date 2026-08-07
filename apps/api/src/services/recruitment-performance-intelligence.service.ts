import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  buildCapacityImprovementDraft,
  buildDevelopmentPlanDraft,
  buildHiringDraftProposal,
  buildInterviewDraftProposal,
  buildPerformanceInsightDraft,
  buildRpiPerformanceSnapshot,
  buildRpiPipelineBuckets,
  buildRpiRecruitmentSnapshot,
  buildRpiWorkforcePlanningSnapshot,
  buildTrainingRecommendationDraft,
  buildWorkforcePlanningDraft,
  buildWorkforceRiskDraft,
  canAccessRecruitmentPerformanceIntelligence,
  canAccessRpiSelfPerformanceView,
  canApproveRpiHiringDrafts,
  canManageRpiSettings,
  canWriteRecruitmentPerformanceIntelligence,
  isRpiTechnicianRoleName,
  listRpiConnections,
  RPI_ACTIVE_PIPELINE_STAGES,
  RPI_PIPELINE_STAGES,
  RPI_PRODUCT_COPY,
  requiresOwnerExecuteForStage,
  type AcknowledgeRpiInsightRequest,
  type CreateRpiAuraInsightRequest,
  type CreateRpiCandidateRequest,
  type CreateRpiHiringDraftRequest,
  type CreateRpiInterviewDraftRequest,
  type DecideRpiHiringDraftRequest,
  type DecideRpiInterviewDraftRequest,
  type DecideRpiRecommendationRequest,
  type RefreshRpiRecommendationsRequest,
  type RpiAuraInsightSummary,
  type RpiCandidateSummary,
  type RpiHiringDraftSummary,
  type RpiInterviewDraftSummary,
  type RpiOwnerDashboard,
  type RpiPerformanceRow,
  type RpiPipelineStage,
  type RpiRecommendationDraftSummary,
  type RpiSelfPerformanceView,
  type RpiSettings,
  type RpiSkillTrackingRow,
  type UpdateRpiSettingsRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  certifications,
  employeeSkills,
  jobs,
  qualityComebacks,
  recruitingApplications,
  recruitingCandidates,
  roles,
  rpiAuraInsights,
  rpiHiringDrafts,
  rpiInterviewDrafts,
  rpiRecommendationDrafts,
  rpiSettings,
  securityAuditLogs,
  trainingRecords,
  users,
  wiTimesheets,
} from '@titan/db';

/**
 * Recruitment & Performance Intelligence (Department 6.3)
 *
 * Interview workflow tracks rpi_interview_drafts only — it never auto-changes
 * recruiting_candidates.status. Hiring advances that mutate candidate status
 * go through Owner-gated hiring drafts (approve + execute).
 *
 * Invariants: autoHiringDecision/autoHiringEnabled/inventScores/inventScoresEnabled
 * are always false in settings writes and audit metadata.
 */

export class RecruitmentPerformanceIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RecruitmentPerformanceIntelligenceError';
  }
}

export type RpiActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

function asPipelineStage(value: string | null | undefined): RpiPipelineStage {
  if (value && (RPI_PIPELINE_STAGES as readonly string[]).includes(value)) {
    return value as RpiPipelineStage;
  }
  return 'new';
}

function parseHours(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

function displayName(firstName: string | null | undefined, lastName: string | null | undefined): string {
  return `${firstName ?? ''} ${lastName ?? ''}`.trim() || 'Unknown';
}

export class RecruitmentPerformanceIntelligenceService {
  constructor(private readonly db: DatabaseClient) {}

  private assertOwnerAdmin(actor: RpiActor): void {
    if (!canAccessRecruitmentPerformanceIntelligence(actor)) {
      throw new RecruitmentPerformanceIntelligenceError(
        'FORBIDDEN',
        'Recruitment & Performance Intelligence requires Owner or Admin access. Technicians and clients cannot view recruitment or others’ performance.',
      );
    }
  }

  private assertWrite(actor: RpiActor): void {
    this.assertOwnerAdmin(actor);
    if (!canWriteRecruitmentPerformanceIntelligence(actor)) {
      throw new RecruitmentPerformanceIntelligenceError(
        'FORBIDDEN',
        'Write actions require Owner or Admin access.',
      );
    }
  }

  private assertApproveHiring(actor: RpiActor): void {
    this.assertWrite(actor);
    if (!canApproveRpiHiringDrafts(actor)) {
      throw new RecruitmentPerformanceIntelligenceError(
        'FORBIDDEN',
        'Only Owner or Admin may approve hiring workflow advances that execute.',
      );
    }
  }

  private assertManageSettings(actor: RpiActor): void {
    this.assertWrite(actor);
    if (!canManageRpiSettings(actor)) {
      throw new RecruitmentPerformanceIntelligenceError(
        'FORBIDDEN',
        'Only Owner or Admin may change Recruitment & Performance Intelligence settings.',
      );
    }
  }

  private async recordAudit(
    actor: RpiActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'recruitment_performance_intelligence',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        autoHiringDecision: false,
        inventScores: false,
        inventCandidates: false,
        autoHiringEnabled: false,
        inventScoresEnabled: false,
      },
    });
  }

  private toHiringDraft(
    row: typeof rpiHiringDrafts.$inferSelect,
    candidateName: string | null,
  ): RpiHiringDraftSummary {
    return {
      id: row.id,
      candidateId: row.candidateId,
      candidateName,
      fromStage: row.fromStage ? asPipelineStage(row.fromStage) : null,
      toStage: asPipelineStage(row.toStage),
      status: row.status,
      title: row.title,
      body: row.body,
      autoHiringDecision: false,
      executedAt: row.executedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private toInterviewDraft(
    row: typeof rpiInterviewDrafts.$inferSelect,
    candidateName: string | null,
    interviewerName: string | null,
  ): RpiInterviewDraftSummary {
    return {
      id: row.id,
      candidateId: row.candidateId,
      candidateName,
      status: row.status,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      interviewerUserId: row.interviewerUserId,
      interviewerName,
      title: row.title,
      body: row.body,
      outcomeNotes: row.outcomeNotes,
      autoHiringDecision: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private toRecommendation(
    row: typeof rpiRecommendationDrafts.$inferSelect,
    subjectUserName: string | null,
  ): RpiRecommendationDraftSummary {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      body: row.body,
      subjectUserId: row.subjectUserId,
      subjectUserName,
      autoExecuted: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private toInsight(row: typeof rpiAuraInsights.$inferSelect): RpiAuraInsightSummary {
    return {
      id: row.id,
      target: row.target,
      status: row.status,
      title: row.title,
      insight: row.insight,
      href: row.href,
      sourceHiringDraftId: row.sourceHiringDraftId,
      sourceRecommendationId: row.sourceRecommendationId,
      sourceInterviewDraftId: row.sourceInterviewDraftId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toSettings(row: typeof rpiSettings.$inferSelect): RpiSettings {
    return {
      id: row.id,
      recruitmentEnabled: row.recruitmentEnabled,
      performanceInsightsEnabled: row.performanceInsightsEnabled,
      selfPerformanceViewEnabled: row.selfPerformanceViewEnabled,
      interviewWorkflowEnabled: row.interviewWorkflowEnabled,
      auraSuggestionsEnabled: row.auraSuggestionsEnabled,
      autoHiringEnabled: false,
      inventScoresEnabled: false,
      notes: row.notes,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async ensureSettings(companyId: string): Promise<typeof rpiSettings.$inferSelect> {
    const existing = await this.db.query.rpiSettings.findFirst({
      where: eq(rpiSettings.companyId, companyId),
    });
    if (existing) return existing;
    const [created] = await this.db
      .insert(rpiSettings)
      .values({
        companyId,
        interviewWorkflowEnabled: true,
        auraSuggestionsEnabled: true,
        autoHiringEnabled: false,
        inventScoresEnabled: false,
      })
      .returning();
    return created;
  }

  private toCandidateSummary(
    row: typeof recruitingCandidates.$inferSelect,
    applicationCount: number,
    interviewCount: number,
  ): RpiCandidateSummary {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      roleTitle: row.roleTitle,
      status: asPipelineStage(row.status),
      source: row.source,
      skills: Array.isArray(row.skills) ? row.skills : [],
      applicationCount,
      interviewCount,
      notes: row.notes ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** Sum standard + overtime + travel hours from wi_timesheets per user (company-scoped). */
  private async loadTimesheetHoursByUser(
    companyId: string,
  ): Promise<{ hoursByUser: Map<string, number>; overtimeTotal: number; timesheetRowCount: number }> {
    const rows = await this.db.query.wiTimesheets.findMany({
      where: eq(wiTimesheets.companyId, companyId),
    });
    const hoursByUser = new Map<string, number>();
    let overtimeTotal = 0;
    for (const row of rows) {
      const standard = parseHours(row.standardHours);
      const overtime = parseHours(row.overtimeHours);
      const travel = parseHours(row.travelHours);
      const total = standard + overtime + travel;
      hoursByUser.set(row.userId, (hoursByUser.get(row.userId) ?? 0) + total);
      overtimeTotal += overtime;
    }
    return {
      hoursByUser,
      overtimeTotal: Math.round(overtimeTotal * 100) / 100,
      timesheetRowCount: rows.length,
    };
  }

  async getDashboard(actor: RpiActor): Promise<RpiOwnerDashboard> {
    this.assertOwnerAdmin(actor);
    const settingsRow = await this.ensureSettings(actor.companyId);

    const candidates = await this.db.query.recruitingCandidates.findMany({
      where: eq(recruitingCandidates.companyId, actor.companyId),
      orderBy: [desc(recruitingCandidates.updatedAt)],
    });

    const applications = await this.db
      .select({
        candidateId: recruitingApplications.candidateId,
        count: sql<number>`count(*)::int`,
      })
      .from(recruitingApplications)
      .where(eq(recruitingApplications.companyId, actor.companyId))
      .groupBy(recruitingApplications.candidateId);

    const appCountByCandidate = new Map(applications.map((a) => [a.candidateId, a.count]));
    const applicationCount = applications.reduce((sum, a) => sum + a.count, 0);

    const interviewRows = await this.db.query.rpiInterviewDrafts.findMany({
      where: eq(rpiInterviewDrafts.companyId, actor.companyId),
      orderBy: [desc(rpiInterviewDrafts.createdAt)],
      limit: 100,
    });
    const interviewCountByCandidate = new Map<string, number>();
    for (const row of interviewRows) {
      interviewCountByCandidate.set(
        row.candidateId,
        (interviewCountByCandidate.get(row.candidateId) ?? 0) + 1,
      );
    }

    const candidateSummaries = candidates.map((c) =>
      this.toCandidateSummary(
        c,
        appCountByCandidate.get(c.id) ?? 0,
        interviewCountByCandidate.get(c.id) ?? 0,
      ),
    );
    const pipeline = buildRpiPipelineBuckets(
      candidates.map((c) => ({ id: c.id, status: c.status })),
    );
    const activePipelineCount = candidates.filter((c) =>
      (RPI_ACTIVE_PIPELINE_STAGES as readonly string[]).includes(c.status),
    ).length;
    const interviewStageCount = candidates.filter((c) => c.status === 'interview').length;
    const hiredCount = candidates.filter((c) => c.status === 'hired').length;
    const rejectedCount = candidates.filter((c) => c.status === 'rejected').length;

    const hiringRows = await this.db.query.rpiHiringDrafts.findMany({
      where: eq(rpiHiringDrafts.companyId, actor.companyId),
      orderBy: [desc(rpiHiringDrafts.createdAt)],
      limit: 100,
    });
    const candidateNameById = new Map(candidates.map((c) => [c.id, c.name]));
    const hiringDrafts = hiringRows.map((row) =>
      this.toHiringDraft(row, candidateNameById.get(row.candidateId) ?? null),
    );
    const pendingHiringApprovals = hiringRows.filter(
      (r) => r.status === 'pending_approval',
    ).length;
    const pendingInterviewApprovals = interviewRows.filter(
      (r) => r.status === 'pending_approval',
    ).length;

    const userRows = await this.db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        isActive: users.isActive,
        roleName: roles.name,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(users.companyId, actor.companyId), eq(users.isActive, true)));

    const nameByUserId = new Map(
      userRows.map((u) => [u.id, displayName(u.firstName, u.lastName)]),
    );

    const interviewDrafts = interviewRows.map((row) =>
      this.toInterviewDraft(
        row,
        candidateNameById.get(row.candidateId) ?? null,
        row.interviewerUserId ? (nameByUserId.get(row.interviewerUserId) ?? null) : null,
      ),
    );

    const skillRows = await this.db.query.employeeSkills.findMany({
      where: eq(employeeSkills.companyId, actor.companyId),
    });
    const trainingRows = await this.db.query.trainingRecords.findMany({
      where: eq(trainingRecords.companyId, actor.companyId),
    });
    const certRows = await this.db.query.certifications.findMany({
      where: eq(certifications.companyId, actor.companyId),
    });

    const jobCounts = await this.db
      .select({
        assignedUserId: jobs.assignedUserId,
        completed: sql<number>`count(*) filter (where ${jobs.status} = 'completed')::int`,
        assigned: sql<number>`count(*)::int`,
      })
      .from(jobs)
      .where(
        and(eq(jobs.companyId, actor.companyId), sql`${jobs.assignedUserId} is not null`),
      )
      .groupBy(jobs.assignedUserId);

    const jobCountByUser = new Map(
      jobCounts.map((j) => [
        j.assignedUserId as string,
        { completed: j.completed, assigned: j.assigned },
      ]),
    );

    const [openJobAgg] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.companyId, actor.companyId),
          sql`${jobs.status} != 'completed'`,
          sql`${jobs.assignedUserId} is not null`,
        ),
      );
    const openJobAssignmentCount = openJobAgg?.count ?? 0;

    const callbackRows = await this.db
      .select({
        technicianId: qualityComebacks.originalTechnicianId,
        count: sql<number>`count(*)::int`,
      })
      .from(qualityComebacks)
      .where(
        and(
          eq(qualityComebacks.companyId, actor.companyId),
          eq(qualityComebacks.comebackType, 'callback'),
        ),
      )
      .groupBy(qualityComebacks.originalTechnicianId);
    const callbacksByUser = new Map(
      callbackRows
        .filter((r) => r.technicianId)
        .map((r) => [r.technicianId as string, r.count]),
    );

    const { hoursByUser, timesheetRowCount } = await this.loadTimesheetHoursByUser(
      actor.companyId,
    );

    const skillCountByUser = new Map<string, number>();
    for (const s of skillRows) {
      skillCountByUser.set(s.userId, (skillCountByUser.get(s.userId) ?? 0) + 1);
    }
    const trainingCountByUser = new Map<string, number>();
    for (const t of trainingRows) {
      trainingCountByUser.set(t.userId, (trainingCountByUser.get(t.userId) ?? 0) + 1);
    }
    const certCountByUser = new Map<string, number>();
    for (const c of certRows) {
      certCountByUser.set(c.userId, (certCountByUser.get(c.userId) ?? 0) + 1);
    }

    const technicians = userRows.filter((u) => isRpiTechnicianRoleName(u.roleName));
    const performanceRows: RpiPerformanceRow[] = technicians.map((u) => {
      const jobsForUser = jobCountByUser.get(u.id);
      const skills = skillCountByUser.get(u.id) ?? 0;
      const training = trainingCountByUser.get(u.id) ?? 0;
      const quals = certCountByUser.get(u.id) ?? 0;
      const completed = jobsForUser?.completed ?? null;
      const assigned = jobsForUser?.assigned ?? null;
      const callbacks = callbacksByUser.get(u.id) ?? null;
      const timesheetHours = hoursByUser.has(u.id)
        ? Math.round((hoursByUser.get(u.id) ?? 0) * 100) / 100
        : null;
      const hasSignal =
        (completed !== null && completed > 0) ||
        (assigned !== null && assigned > 0) ||
        skills > 0 ||
        training > 0 ||
        (timesheetHours !== null && timesheetHours > 0);
      return {
        userId: u.id,
        displayName: displayName(u.firstName, u.lastName),
        roleName: u.roleName,
        isTechnicianRole: true,
        jobsCompleted: completed,
        jobsAssigned: assigned,
        callbacks,
        timesheetHours,
        skillCount: skills,
        trainingCount: training,
        qualificationCount: quals,
        availability: hasSignal ? 'available' : 'unavailable',
        rationale: hasSignal
          ? 'Derived from real jobs / quality_comebacks / skill-training / wi_timesheets. No invented performance score.'
          : 'No completed jobs, callbacks, timesheet hours, or skill/training records yet for this technician — performance unavailable (not invented).',
        technicianIntelligenceHref: '/technician-intelligence',
      };
    });

    const skillTracking: RpiSkillTrackingRow[] = skillRows.map((s) => {
      const user = userRows.find((u) => u.id === s.userId);
      return {
        userId: s.userId,
        displayName: user ? displayName(user.firstName, user.lastName) : 'Unknown',
        skillKey: s.skillKey,
        skillName: s.skillName,
        proficiency: s.proficiency,
      };
    });

    const recommendationRows = await this.db.query.rpiRecommendationDrafts.findMany({
      where: eq(rpiRecommendationDrafts.companyId, actor.companyId),
      orderBy: [desc(rpiRecommendationDrafts.createdAt)],
      limit: 100,
    });
    const recommendationDrafts = recommendationRows.map((row) =>
      this.toRecommendation(
        row,
        row.subjectUserId ? (nameByUserId.get(row.subjectUserId) ?? null) : null,
      ),
    );

    const insightRows = await this.db.query.rpiAuraInsights.findMany({
      where: eq(rpiAuraInsights.companyId, actor.companyId),
      orderBy: [desc(rpiAuraInsights.createdAt)],
      limit: 50,
    });

    const jobsCompletedSample = performanceRows.reduce(
      (sum, r) => sum + (r.jobsCompleted ?? 0),
      0,
    );
    const timesheetHoursSample = Math.round(
      [...hoursByUser.values()].reduce((sum, h) => sum + h, 0) * 100,
    ) / 100;

    const recruitment = buildRpiRecruitmentSnapshot({
      candidateCount: candidates.length,
      applicationCount,
      activePipelineCount,
      interviewStageCount,
      hiredCount,
      rejectedCount,
      pendingHiringApprovals,
      pendingInterviewApprovals,
    });
    const performance = buildRpiPerformanceSnapshot({
      technicianCount: technicians.length,
      skillRecordCount: skillRows.length,
      trainingRecordCount: trainingRows.length,
      jobsCompletedSample,
      timesheetHoursSample,
    });
    const workforcePlanning = buildRpiWorkforcePlanningSnapshot({
      activeTechnicianCount: technicians.length,
      openJobAssignmentCount,
      interviewPipelineCount: interviewStageCount,
      timesheetHoursSample,
    });

    return {
      summary:
        recruitment.availability === 'unavailable' && performance.availability === 'unavailable'
          ? 'Recruitment & Performance Intelligence is ready. No real candidates or performance signals yet — surfaces stay honest unavailable (nothing invented). Hiring advances that execute require Owner approval. Interview workflow never auto-changes hiring status.'
          : `Tracking ${recruitment.candidateCount} real candidate(s) and ${performance.technicianCount} technician-role user(s). ${pendingHiringApprovals} hiring draft(s) and ${pendingInterviewApprovals} interview draft(s) pending Owner approval. Recommendations remain drafts.`,
      productClarification: { ...RPI_PRODUCT_COPY },
      policy: {
        noAutomaticHiring: true,
        ownerApprovalRequiredForHiringExecute: true,
        inventScores: false,
        inventCandidates: false,
        recommendationsAreDrafts: true,
        auraSuggestionsOnly: true,
        noAutomaticHrDecisions: true,
        sensitiveHrOwnerAdminOnly: true,
      },
      recruitment,
      performance,
      workforcePlanning,
      pipeline,
      candidates: candidateSummaries,
      interviewDrafts,
      hiringDrafts,
      performanceRows,
      skillTracking,
      recommendationDrafts,
      auraInsights: insightRows.map((r) => this.toInsight(r)),
      connections: listRpiConnections({
        candidatesAvailable: candidates.length > 0,
        performanceAvailable: performance.availability === 'available',
        timesheetsAvailable: timesheetRowCount > 0,
      }),
      settings: this.toSettings(settingsRow),
    };
  }

  async getSelfPerformanceView(actor: RpiActor): Promise<RpiSelfPerformanceView> {
    if (!canAccessRpiSelfPerformanceView(actor)) {
      throw new RecruitmentPerformanceIntelligenceError(
        'FORBIDDEN',
        'Self performance view is not available for this role.',
      );
    }
    const settings = await this.ensureSettings(actor.companyId);
    if (!settings.selfPerformanceViewEnabled) {
      throw new RecruitmentPerformanceIntelligenceError(
        'FORBIDDEN',
        'Self performance view is disabled for this tenant.',
      );
    }

    const user = await this.db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        roleName: roles.name,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(users.id, actor.userId), eq(users.companyId, actor.companyId)))
      .limit(1);
    const me = user[0];
    if (!me) {
      throw new RecruitmentPerformanceIntelligenceError('NOT_FOUND', 'User not found.');
    }

    const meName = displayName(me.firstName, me.lastName);

    // Technicians / non-Owner: own signals only — never recruitment or peers.
    if (!canAccessRecruitmentPerformanceIntelligence(actor)) {
      const [jobAgg] = await this.db
        .select({
          completed: sql<number>`count(*) filter (where ${jobs.status} = 'completed')::int`,
          assigned: sql<number>`count(*)::int`,
        })
        .from(jobs)
        .where(
          and(eq(jobs.companyId, actor.companyId), eq(jobs.assignedUserId, actor.userId)),
        );
      const skillList = await this.db.query.employeeSkills.findMany({
        where: and(
          eq(employeeSkills.companyId, actor.companyId),
          eq(employeeSkills.userId, actor.userId),
        ),
      });
      const trainingList = await this.db.query.trainingRecords.findMany({
        where: and(
          eq(trainingRecords.companyId, actor.companyId),
          eq(trainingRecords.userId, actor.userId),
        ),
      });
      const certList = await this.db.query.certifications.findMany({
        where: and(
          eq(certifications.companyId, actor.companyId),
          eq(certifications.userId, actor.userId),
        ),
      });
      const [callbackAgg] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(qualityComebacks)
        .where(
          and(
            eq(qualityComebacks.companyId, actor.companyId),
            eq(qualityComebacks.comebackType, 'callback'),
            eq(qualityComebacks.originalTechnicianId, actor.userId),
          ),
        );
      const ownTimesheets = await this.db.query.wiTimesheets.findMany({
        where: and(
          eq(wiTimesheets.companyId, actor.companyId),
          eq(wiTimesheets.userId, actor.userId),
        ),
      });
      const timesheetHours =
        Math.round(
          ownTimesheets.reduce(
            (sum, row) =>
              sum +
              parseHours(row.standardHours) +
              parseHours(row.overtimeHours) +
              parseHours(row.travelHours),
            0,
          ) * 100,
        ) / 100;
      const hasSignal =
        (jobAgg?.completed ?? 0) > 0 ||
        (jobAgg?.assigned ?? 0) > 0 ||
        skillList.length > 0 ||
        trainingList.length > 0 ||
        timesheetHours > 0;
      const performance: RpiPerformanceRow = {
        userId: me.id,
        displayName: meName,
        roleName: me.roleName,
        isTechnicianRole: isRpiTechnicianRoleName(me.roleName),
        jobsCompleted: jobAgg?.completed ?? 0,
        jobsAssigned: jobAgg?.assigned ?? 0,
        callbacks: callbackAgg?.count ?? 0,
        timesheetHours,
        skillCount: skillList.length,
        trainingCount: trainingList.length,
        qualificationCount: certList.length,
        availability: hasSignal ? 'available' : 'unavailable',
        rationale: hasSignal
          ? 'Own performance from real jobs / quality / skills / wi_timesheets only.'
          : 'No real own performance signals yet — unavailable (not invented).',
        technicianIntelligenceHref: '/technician-intelligence',
      };
      const ownRecs = await this.db.query.rpiRecommendationDrafts.findMany({
        where: and(
          eq(rpiRecommendationDrafts.companyId, actor.companyId),
          eq(rpiRecommendationDrafts.subjectUserId, actor.userId),
        ),
        orderBy: [desc(rpiRecommendationDrafts.createdAt)],
        limit: 20,
      });
      return {
        generatedAt: new Date().toISOString(),
        userId: me.id,
        displayName: meName,
        performance,
        skills: skillList.map((s) => ({
          userId: s.userId,
          displayName: meName,
          skillKey: s.skillKey,
          skillName: s.skillName,
          proficiency: s.proficiency,
        })),
        ownRecommendations: ownRecs.map((r) => this.toRecommendation(r, meName)),
        exclusions: {
          otherTechnicians: true,
          recruitmentPipeline: true,
          peerPerformance: true,
        },
        guarantees: {
          autoHiringDecision: false,
          inventScores: false,
        },
      };
    }

    const dash = await this.getDashboard(actor);
    return {
      generatedAt: new Date().toISOString(),
      userId: me.id,
      displayName: meName,
      performance: dash.performanceRows.find((r) => r.userId === actor.userId) ?? null,
      skills: dash.skillTracking.filter((s) => s.userId === actor.userId),
      ownRecommendations: dash.recommendationDrafts.filter(
        (r) => r.subjectUserId === actor.userId,
      ),
      exclusions: {
        otherTechnicians: true,
        recruitmentPipeline: true,
        peerPerformance: true,
      },
      guarantees: {
        autoHiringDecision: false,
        inventScores: false,
      },
    };
  }

  async createCandidate(
    actor: RpiActor,
    input: CreateRpiCandidateRequest,
  ): Promise<RpiCandidateSummary> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor.companyId);
    if (!settings.recruitmentEnabled) {
      throw new RecruitmentPerformanceIntelligenceError(
        'INVALID_STATE',
        'Recruitment intelligence is disabled in settings.',
      );
    }
    const name = input.name.trim();
    if (!name) {
      throw new RecruitmentPerformanceIntelligenceError(
        'VALIDATION_ERROR',
        'Candidate name is required.',
      );
    }
    const status = input.status ? asPipelineStage(input.status) : 'new';
    const [row] = await this.db
      .insert(recruitingCandidates)
      .values({
        companyId: actor.companyId,
        name,
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        roleTitle: input.roleTitle?.trim() || null,
        source: input.source?.trim() || null,
        skills: input.skills ?? [],
        notes: input.notes?.trim() || null,
        status,
      })
      .returning();
    await this.recordAudit(actor, 'rpi_candidate_created', row.id, {
      status: row.status,
      source: 'recruitment_performance_intelligence',
    });
    return this.toCandidateSummary(row, 0, 0);
  }

  async createHiringDraft(
    actor: RpiActor,
    input: CreateRpiHiringDraftRequest,
  ): Promise<RpiHiringDraftSummary> {
    this.assertWrite(actor);
    const candidate = await this.db.query.recruitingCandidates.findFirst({
      where: and(
        eq(recruitingCandidates.id, input.candidateId),
        eq(recruitingCandidates.companyId, actor.companyId),
      ),
    });
    if (!candidate) {
      throw new RecruitmentPerformanceIntelligenceError(
        'NOT_FOUND',
        'Candidate not found in this tenant.',
      );
    }
    const fromStage = asPipelineStage(candidate.status);
    const toStage = asPipelineStage(input.toStage);
    const proposal =
      input.title && input.body
        ? { title: input.title, body: input.body }
        : buildHiringDraftProposal({
            candidateName: candidate.name,
            fromStage,
            toStage,
          });
    const status = input.submitForApproval ? 'pending_approval' : 'draft';
    const [row] = await this.db
      .insert(rpiHiringDrafts)
      .values({
        companyId: actor.companyId,
        candidateId: candidate.id,
        fromStage,
        toStage,
        status,
        title: proposal.title,
        body: proposal.body,
        autoHiringDecision: false,
        createdByUserId: actor.userId,
      })
      .returning();
    await this.recordAudit(actor, 'rpi_hiring_draft_created', row.id, {
      candidateId: candidate.id,
      fromStage,
      toStage,
      status,
      requiresOwnerExecute: requiresOwnerExecuteForStage(toStage),
      autoHiringDecision: false,
    });
    return this.toHiringDraft(row, candidate.name);
  }

  async decideHiringDraft(
    actor: RpiActor,
    draftId: string,
    input: DecideRpiHiringDraftRequest,
  ): Promise<RpiHiringDraftSummary> {
    this.assertApproveHiring(actor);
    const draft = await this.db.query.rpiHiringDrafts.findFirst({
      where: and(
        eq(rpiHiringDrafts.id, draftId),
        eq(rpiHiringDrafts.companyId, actor.companyId),
      ),
    });
    if (!draft) {
      throw new RecruitmentPerformanceIntelligenceError(
        'NOT_FOUND',
        'Hiring draft not found.',
      );
    }
    if (!['draft', 'pending_approval'].includes(draft.status)) {
      throw new RecruitmentPerformanceIntelligenceError(
        'INVALID_STATE',
        `Hiring draft is already ${draft.status}.`,
      );
    }

    const now = new Date();
    if (input.decision === 'cancel') {
      const [updated] = await this.db
        .update(rpiHiringDrafts)
        .set({
          status: 'cancelled',
          decidedByUserId: actor.userId,
          decidedAt: now,
          decisionNotes: input.notes ?? null,
          updatedAt: now,
          autoHiringDecision: false,
        })
        .where(
          and(
            eq(rpiHiringDrafts.id, draftId),
            eq(rpiHiringDrafts.companyId, actor.companyId),
          ),
        )
        .returning();
      await this.recordAudit(actor, 'rpi_hiring_draft_cancelled', draftId, {
        candidateId: draft.candidateId,
      });
      const candidate = await this.db.query.recruitingCandidates.findFirst({
        where: and(
          eq(recruitingCandidates.id, draft.candidateId),
          eq(recruitingCandidates.companyId, actor.companyId),
        ),
      });
      return this.toHiringDraft(updated, candidate?.name ?? null);
    }

    if (input.decision === 'reject') {
      const [updated] = await this.db
        .update(rpiHiringDrafts)
        .set({
          status: 'rejected',
          decidedByUserId: actor.userId,
          decidedAt: now,
          decisionNotes: input.notes ?? null,
          updatedAt: now,
          autoHiringDecision: false,
        })
        .where(
          and(
            eq(rpiHiringDrafts.id, draftId),
            eq(rpiHiringDrafts.companyId, actor.companyId),
          ),
        )
        .returning();
      await this.recordAudit(actor, 'rpi_hiring_draft_rejected', draftId, {
        candidateId: draft.candidateId,
      });
      const candidate = await this.db.query.recruitingCandidates.findFirst({
        where: and(
          eq(recruitingCandidates.id, draft.candidateId),
          eq(recruitingCandidates.companyId, actor.companyId),
        ),
      });
      return this.toHiringDraft(updated, candidate?.name ?? null);
    }

    // approve — Owner may execute status change on recruiting_candidates
    const shouldExecute = input.executeOnCandidate !== false;
    let nextStatus: 'approved' | 'executed' = 'approved';
    let executedAt: Date | null = null;

    if (shouldExecute) {
      const candidate = await this.db.query.recruitingCandidates.findFirst({
        where: and(
          eq(recruitingCandidates.id, draft.candidateId),
          eq(recruitingCandidates.companyId, actor.companyId),
        ),
      });
      if (!candidate) {
        throw new RecruitmentPerformanceIntelligenceError(
          'NOT_FOUND',
          'Candidate missing; cannot execute hiring advance.',
        );
      }
      await this.db
        .update(recruitingCandidates)
        .set({
          status: asPipelineStage(draft.toStage),
          updatedAt: now,
        })
        .where(
          and(
            eq(recruitingCandidates.id, candidate.id),
            eq(recruitingCandidates.companyId, actor.companyId),
          ),
        );
      nextStatus = 'executed';
      executedAt = now;
    }

    const [updated] = await this.db
      .update(rpiHiringDrafts)
      .set({
        status: nextStatus,
        decidedByUserId: actor.userId,
        decidedAt: now,
        decisionNotes: input.notes ?? null,
        executedAt,
        updatedAt: now,
        autoHiringDecision: false,
      })
      .where(
        and(eq(rpiHiringDrafts.id, draftId), eq(rpiHiringDrafts.companyId, actor.companyId)),
      )
      .returning();

    await this.recordAudit(
      actor,
      nextStatus === 'executed' ? 'rpi_hiring_draft_executed' : 'rpi_hiring_draft_approved',
      draftId,
      {
        candidateId: draft.candidateId,
        toStage: draft.toStage,
        executed: nextStatus === 'executed',
        autoHiringDecision: false,
      },
    );

    const candidate = await this.db.query.recruitingCandidates.findFirst({
      where: and(
        eq(recruitingCandidates.id, draft.candidateId),
        eq(recruitingCandidates.companyId, actor.companyId),
      ),
    });
    return this.toHiringDraft(updated, candidate?.name ?? null);
  }

  /**
   * Interview workflow drafts only. Never mutates recruiting_candidates.status —
   * hiring advances must use createHiringDraft / decideHiringDraft (Owner execute).
   */
  async createInterviewDraft(
    actor: RpiActor,
    input: CreateRpiInterviewDraftRequest,
  ): Promise<RpiInterviewDraftSummary> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor.companyId);
    if (!settings.interviewWorkflowEnabled) {
      throw new RecruitmentPerformanceIntelligenceError(
        'INVALID_STATE',
        'Interview workflow is disabled in settings.',
      );
    }
    const candidate = await this.db.query.recruitingCandidates.findFirst({
      where: and(
        eq(recruitingCandidates.id, input.candidateId),
        eq(recruitingCandidates.companyId, actor.companyId),
      ),
    });
    if (!candidate) {
      throw new RecruitmentPerformanceIntelligenceError(
        'NOT_FOUND',
        'Candidate not found in this tenant.',
      );
    }
    if (input.interviewerUserId) {
      const interviewer = await this.db.query.users.findFirst({
        where: and(
          eq(users.id, input.interviewerUserId),
          eq(users.companyId, actor.companyId),
        ),
      });
      if (!interviewer) {
        throw new RecruitmentPerformanceIntelligenceError(
          'NOT_FOUND',
          'Interviewer not found in this tenant.',
        );
      }
    }
    const proposal =
      input.title && input.body
        ? { title: input.title, body: input.body }
        : buildInterviewDraftProposal({
            candidateName: candidate.name,
            scheduledAt: input.scheduledAt ?? null,
          });
    const status = input.submitForApproval ? 'pending_approval' : 'draft';
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    const [row] = await this.db
      .insert(rpiInterviewDrafts)
      .values({
        companyId: actor.companyId,
        candidateId: candidate.id,
        status,
        title: proposal.title,
        body: proposal.body,
        scheduledAt: scheduledAt && !Number.isNaN(scheduledAt.getTime()) ? scheduledAt : null,
        interviewerUserId: input.interviewerUserId ?? null,
        autoHiringDecision: false,
        createdByUserId: actor.userId,
        metadata: {
          hiringStatusUnchanged: true,
          note: 'Interview drafts never auto-change candidate hiring status; use hiring drafts to advance.',
        },
      })
      .returning();
    await this.recordAudit(actor, 'rpi_interview_draft_created', row.id, {
      candidateId: candidate.id,
      status,
      autoHiringDecision: false,
      candidateStatusUnchanged: true,
    });
    let interviewerName: string | null = null;
    if (row.interviewerUserId) {
      const u = await this.db.query.users.findFirst({
        where: and(
          eq(users.id, row.interviewerUserId),
          eq(users.companyId, actor.companyId),
        ),
      });
      interviewerName = u ? displayName(u.firstName, u.lastName) : null;
    }
    return this.toInterviewDraft(row, candidate.name, interviewerName);
  }

  /**
   * schedule / complete / approve / reject / cancel interview drafts.
   * Never auto-changes recruiting_candidates.status — hiring advances use hiring drafts only.
   */
  async decideInterviewDraft(
    actor: RpiActor,
    draftId: string,
    input: DecideRpiInterviewDraftRequest,
  ): Promise<RpiInterviewDraftSummary> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor.companyId);
    if (!settings.interviewWorkflowEnabled) {
      throw new RecruitmentPerformanceIntelligenceError(
        'INVALID_STATE',
        'Interview workflow is disabled in settings.',
      );
    }
    const draft = await this.db.query.rpiInterviewDrafts.findFirst({
      where: and(
        eq(rpiInterviewDrafts.id, draftId),
        eq(rpiInterviewDrafts.companyId, actor.companyId),
      ),
    });
    if (!draft) {
      throw new RecruitmentPerformanceIntelligenceError(
        'NOT_FOUND',
        'Interview draft not found.',
      );
    }
    if (['cancelled', 'rejected', 'completed'].includes(draft.status)) {
      throw new RecruitmentPerformanceIntelligenceError(
        'INVALID_STATE',
        `Interview draft is already ${draft.status}.`,
      );
    }

    const now = new Date();
    const nextStatus =
      input.decision === 'schedule'
        ? 'scheduled'
        : input.decision === 'complete'
          ? 'completed'
          : input.decision === 'approve'
            ? 'approved'
            : input.decision === 'reject'
              ? 'rejected'
              : 'cancelled';

    let scheduledAt = draft.scheduledAt;
    if (input.scheduledAt !== undefined) {
      if (input.scheduledAt === null) {
        scheduledAt = null;
      } else {
        const parsed = new Date(input.scheduledAt);
        scheduledAt = Number.isNaN(parsed.getTime()) ? draft.scheduledAt : parsed;
      }
    }

    const [updated] = await this.db
      .update(rpiInterviewDrafts)
      .set({
        status: nextStatus,
        scheduledAt,
        outcomeNotes:
          input.decision === 'complete'
            ? (input.notes ?? draft.outcomeNotes)
            : draft.outcomeNotes,
        decidedByUserId: actor.userId,
        decidedAt: now,
        decisionNotes: input.notes ?? null,
        updatedAt: now,
        autoHiringDecision: false,
        metadata: {
          ...(typeof draft.metadata === 'object' && draft.metadata ? draft.metadata : {}),
          hiringStatusUnchanged: true,
          note: 'Interview workflow never mutates recruiting_candidates.status; hiring advances use hiring drafts.',
        },
      })
      .where(
        and(
          eq(rpiInterviewDrafts.id, draftId),
          eq(rpiInterviewDrafts.companyId, actor.companyId),
        ),
      )
      .returning();

    await this.recordAudit(actor, `rpi_interview_draft_${nextStatus}`, draftId, {
      candidateId: draft.candidateId,
      decision: input.decision,
      autoHiringDecision: false,
      candidateStatusUnchanged: true,
    });

    const candidate = await this.db.query.recruitingCandidates.findFirst({
      where: and(
        eq(recruitingCandidates.id, draft.candidateId),
        eq(recruitingCandidates.companyId, actor.companyId),
      ),
    });
    let interviewerName: string | null = null;
    if (updated.interviewerUserId) {
      const u = await this.db.query.users.findFirst({
        where: and(
          eq(users.id, updated.interviewerUserId),
          eq(users.companyId, actor.companyId),
        ),
      });
      interviewerName = u ? displayName(u.firstName, u.lastName) : null;
    }
    return this.toInterviewDraft(updated, candidate?.name ?? null, interviewerName);
  }

  async refreshRecommendations(
    actor: RpiActor,
    input: RefreshRpiRecommendationsRequest = {},
  ): Promise<{ created: number; recommendations: RpiRecommendationDraftSummary[] }> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor.companyId);
    if (!settings.performanceInsightsEnabled) {
      throw new RecruitmentPerformanceIntelligenceError(
        'INVALID_STATE',
        'Performance insights are disabled in settings.',
      );
    }

    const dash = await this.getDashboard(actor);
    const status = input.submitForApproval ? 'pending_approval' : 'draft';
    const created: RpiRecommendationDraftSummary[] = [];

    for (const row of dash.performanceRows.slice(0, 10)) {
      if (row.availability === 'unavailable') continue;

      const insight = buildPerformanceInsightDraft({
        displayName: row.displayName,
        jobsCompleted: row.jobsCompleted ?? 0,
        callbacks: row.callbacks ?? 0,
        skillCount: row.skillCount,
        timesheetHours: row.timesheetHours ?? undefined,
      });
      const [insightRow] = await this.db
        .insert(rpiRecommendationDrafts)
        .values({
          companyId: actor.companyId,
          kind: 'performance_insight',
          status,
          title: insight.title,
          body: insight.body,
          subjectUserId: row.userId,
          autoExecuted: false,
          createdByUserId: actor.userId,
          metadata: {
            jobsCompleted: row.jobsCompleted,
            callbacks: row.callbacks,
            timesheetHours: row.timesheetHours,
            inventScores: false,
            autoExecuted: false,
          },
        })
        .returning();
      created.push(this.toRecommendation(insightRow, row.displayName));

      if (row.skillCount === 0 || row.qualificationCount === 0) {
        const training = buildTrainingRecommendationDraft({
          displayName: row.displayName,
          gapNote:
            row.skillCount === 0
              ? 'no employee_skills records yet'
              : 'qualification/certification coverage is thin relative to active job assignment',
        });
        const [trainingRow] = await this.db
          .insert(rpiRecommendationDrafts)
          .values({
            companyId: actor.companyId,
            kind: row.skillCount === 0 ? 'skill_gap' : 'training',
            status,
            title: training.title,
            body: training.body,
            subjectUserId: row.userId,
            autoExecuted: false,
            createdByUserId: actor.userId,
          })
          .returning();
        created.push(this.toRecommendation(trainingRow, row.displayName));
      }

      if ((row.callbacks ?? 0) > 0 || (row.jobsCompleted ?? 0) >= 3) {
        const plan = buildDevelopmentPlanDraft({
          displayName: row.displayName,
          focus:
            (row.callbacks ?? 0) > 0
              ? 'callback reduction and quality follow-through (from real quality_comebacks)'
              : 'continued skill depth based on completed job volume',
        });
        const [planRow] = await this.db
          .insert(rpiRecommendationDrafts)
          .values({
            companyId: actor.companyId,
            kind: 'development_plan',
            status,
            title: plan.title,
            body: plan.body,
            subjectUserId: row.userId,
            autoExecuted: false,
            createdByUserId: actor.userId,
          })
          .returning();
        created.push(this.toRecommendation(planRow, row.displayName));
      }
    }

    // AURA suggestions (capacity / risk / planning) — drafts only when enabled + real signals.
    if (settings.auraSuggestionsEnabled) {
      const activeTechnicianCount = dash.workforcePlanning.activeTechnicianCount;
      const openJobAssignmentCount = dash.workforcePlanning.openJobAssignmentCount;
      const interviewPipelineCount = dash.workforcePlanning.interviewPipelineCount;
      const callbackTotal = dash.performanceRows.reduce(
        (sum, r) => sum + (r.callbacks ?? 0),
        0,
      );
      const { overtimeTotal } = await this.loadTimesheetHoursByUser(actor.companyId);

      if (openJobAssignmentCount > 0 || activeTechnicianCount > 0) {
        const capacity = buildCapacityImprovementDraft({
          openJobAssignmentCount,
          activeTechnicianCount,
        });
        const [capacityRow] = await this.db
          .insert(rpiRecommendationDrafts)
          .values({
            companyId: actor.companyId,
            kind: 'capacity_improvement',
            status,
            title: capacity.title,
            body: capacity.body,
            subjectUserId: null,
            autoExecuted: false,
            createdByUserId: actor.userId,
            metadata: {
              openJobAssignmentCount,
              activeTechnicianCount,
              autoExecuted: false,
              inventScores: false,
            },
          })
          .returning();
        created.push(this.toRecommendation(capacityRow, null));
      }

      if (callbackTotal > 0 || interviewPipelineCount > 0 || overtimeTotal > 0) {
        const risk = buildWorkforceRiskDraft({
          callbackCount: callbackTotal,
          interviewBacklog: interviewPipelineCount,
          overtimeHours: overtimeTotal,
        });
        const [riskRow] = await this.db
          .insert(rpiRecommendationDrafts)
          .values({
            companyId: actor.companyId,
            kind: 'workforce_risk',
            status,
            title: risk.title,
            body: risk.body,
            subjectUserId: null,
            autoExecuted: false,
            createdByUserId: actor.userId,
            metadata: {
              callbackCount: callbackTotal,
              interviewBacklog: interviewPipelineCount,
              overtimeHours: overtimeTotal,
              autoExecuted: false,
              inventScores: false,
            },
          })
          .returning();
        created.push(this.toRecommendation(riskRow, null));
      }

      if (interviewPipelineCount > 0 || activeTechnicianCount > 0) {
        const planning = buildWorkforcePlanningDraft({
          interviewPipelineCount,
          activeTechnicianCount,
        });
        const [planningRow] = await this.db
          .insert(rpiRecommendationDrafts)
          .values({
            companyId: actor.companyId,
            kind: 'workforce_planning',
            status,
            title: planning.title,
            body: planning.body,
            subjectUserId: null,
            autoExecuted: false,
            createdByUserId: actor.userId,
            metadata: {
              interviewPipelineCount,
              activeTechnicianCount,
              autoExecuted: false,
              inventScores: false,
            },
          })
          .returning();
        created.push(this.toRecommendation(planningRow, null));
      }
    }

    await this.recordAudit(actor, 'rpi_recommendations_refreshed', actor.companyId, {
      created: created.length,
      submitForApproval: Boolean(input.submitForApproval),
      auraSuggestionsEnabled: settings.auraSuggestionsEnabled,
      autoExecuted: false,
    });

    return { created: created.length, recommendations: created };
  }

  async decideRecommendation(
    actor: RpiActor,
    recommendationId: string,
    input: DecideRpiRecommendationRequest,
  ): Promise<RpiRecommendationDraftSummary> {
    this.assertWrite(actor);
    const row = await this.db.query.rpiRecommendationDrafts.findFirst({
      where: and(
        eq(rpiRecommendationDrafts.id, recommendationId),
        eq(rpiRecommendationDrafts.companyId, actor.companyId),
      ),
    });
    if (!row) {
      throw new RecruitmentPerformanceIntelligenceError(
        'NOT_FOUND',
        'Recommendation draft not found.',
      );
    }
    if (!['draft', 'pending_approval'].includes(row.status)) {
      throw new RecruitmentPerformanceIntelligenceError(
        'INVALID_STATE',
        `Recommendation is already ${row.status}.`,
      );
    }
    const nextStatus =
      input.decision === 'approve'
        ? 'approved'
        : input.decision === 'reject'
          ? 'rejected'
          : 'acknowledged';
    const now = new Date();
    const [updated] = await this.db
      .update(rpiRecommendationDrafts)
      .set({
        status: nextStatus,
        decidedByUserId: actor.userId,
        decidedAt: now,
        decisionNotes: input.notes ?? null,
        updatedAt: now,
        autoExecuted: false,
      })
      .where(
        and(
          eq(rpiRecommendationDrafts.id, recommendationId),
          eq(rpiRecommendationDrafts.companyId, actor.companyId),
        ),
      )
      .returning();
    await this.recordAudit(actor, `rpi_recommendation_${nextStatus}`, recommendationId, {
      kind: row.kind,
      autoExecuted: false,
    });
    let subjectName: string | null = null;
    if (updated.subjectUserId) {
      const u = await this.db.query.users.findFirst({
        where: and(
          eq(users.id, updated.subjectUserId),
          eq(users.companyId, actor.companyId),
        ),
      });
      subjectName = u ? displayName(u.firstName, u.lastName) : null;
    }
    return this.toRecommendation(updated, subjectName);
  }

  async updateSettings(
    actor: RpiActor,
    input: UpdateRpiSettingsRequest,
  ): Promise<RpiSettings> {
    this.assertManageSettings(actor);
    const existing = await this.ensureSettings(actor.companyId);
    const [updated] = await this.db
      .update(rpiSettings)
      .set({
        recruitmentEnabled: input.recruitmentEnabled ?? existing.recruitmentEnabled,
        performanceInsightsEnabled:
          input.performanceInsightsEnabled ?? existing.performanceInsightsEnabled,
        selfPerformanceViewEnabled:
          input.selfPerformanceViewEnabled ?? existing.selfPerformanceViewEnabled,
        interviewWorkflowEnabled:
          input.interviewWorkflowEnabled ?? existing.interviewWorkflowEnabled,
        auraSuggestionsEnabled:
          input.auraSuggestionsEnabled ?? existing.auraSuggestionsEnabled,
        notes: input.notes === undefined ? existing.notes : input.notes,
        autoHiringEnabled: false,
        inventScoresEnabled: false,
        updatedByUserId: actor.userId,
        updatedAt: new Date(),
      })
      .where(
        and(eq(rpiSettings.id, existing.id), eq(rpiSettings.companyId, actor.companyId)),
      )
      .returning();
    await this.recordAudit(actor, 'rpi_settings_updated', updated.id, {
      autoHiringEnabled: false,
      inventScoresEnabled: false,
      interviewWorkflowEnabled: updated.interviewWorkflowEnabled,
      auraSuggestionsEnabled: updated.auraSuggestionsEnabled,
    });
    return this.toSettings(updated);
  }

  async createAuraInsight(
    actor: RpiActor,
    input: CreateRpiAuraInsightRequest,
  ): Promise<RpiAuraInsightSummary> {
    this.assertWrite(actor);
    if (input.sourceHiringDraftId) {
      const draft = await this.db.query.rpiHiringDrafts.findFirst({
        where: and(
          eq(rpiHiringDrafts.id, input.sourceHiringDraftId),
          eq(rpiHiringDrafts.companyId, actor.companyId),
        ),
      });
      if (!draft) {
        throw new RecruitmentPerformanceIntelligenceError(
          'NOT_FOUND',
          'Source hiring draft not found.',
        );
      }
    }
    if (input.sourceRecommendationId) {
      const rec = await this.db.query.rpiRecommendationDrafts.findFirst({
        where: and(
          eq(rpiRecommendationDrafts.id, input.sourceRecommendationId),
          eq(rpiRecommendationDrafts.companyId, actor.companyId),
        ),
      });
      if (!rec) {
        throw new RecruitmentPerformanceIntelligenceError(
          'NOT_FOUND',
          'Source recommendation not found.',
        );
      }
    }
    if (input.sourceInterviewDraftId) {
      const interview = await this.db.query.rpiInterviewDrafts.findFirst({
        where: and(
          eq(rpiInterviewDrafts.id, input.sourceInterviewDraftId),
          eq(rpiInterviewDrafts.companyId, actor.companyId),
        ),
      });
      if (!interview) {
        throw new RecruitmentPerformanceIntelligenceError(
          'NOT_FOUND',
          'Source interview draft not found.',
        );
      }
    }
    const [row] = await this.db
      .insert(rpiAuraInsights)
      .values({
        companyId: actor.companyId,
        target: input.target,
        title: input.title.trim(),
        insight: input.insight.trim(),
        href: input.href?.trim() || null,
        sourceHiringDraftId: input.sourceHiringDraftId ?? null,
        sourceRecommendationId: input.sourceRecommendationId ?? null,
        sourceInterviewDraftId: input.sourceInterviewDraftId ?? null,
        createdByUserId: actor.userId,
        metadata: {
          inventScores: false,
          autoHiringDecision: false,
        },
      })
      .returning();
    await this.recordAudit(actor, 'rpi_aura_insight_created', row.id, {
      target: row.target,
      sourceInterviewDraftId: row.sourceInterviewDraftId,
    });
    return this.toInsight(row);
  }

  async acknowledgeInsight(
    actor: RpiActor,
    insightId: string,
    input: AcknowledgeRpiInsightRequest,
  ): Promise<RpiAuraInsightSummary> {
    this.assertWrite(actor);
    const existing = await this.db.query.rpiAuraInsights.findFirst({
      where: and(
        eq(rpiAuraInsights.id, insightId),
        eq(rpiAuraInsights.companyId, actor.companyId),
      ),
    });
    if (!existing) {
      throw new RecruitmentPerformanceIntelligenceError(
        'NOT_FOUND',
        'AURA insight not found.',
      );
    }
    const [updated] = await this.db
      .update(rpiAuraInsights)
      .set({
        status: input.status,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(rpiAuraInsights.id, insightId),
          eq(rpiAuraInsights.companyId, actor.companyId),
        ),
      )
      .returning();
    await this.recordAudit(actor, `rpi_aura_insight_${input.status}`, insightId, {});
    return this.toInsight(updated);
  }

  async listCandidates(actor: RpiActor): Promise<RpiCandidateSummary[]> {
    this.assertOwnerAdmin(actor);
    const dash = await this.getDashboard(actor);
    return dash.candidates;
  }

  async listHiringDrafts(actor: RpiActor, ids?: string[]): Promise<RpiHiringDraftSummary[]> {
    this.assertOwnerAdmin(actor);
    const rows = await this.db.query.rpiHiringDrafts.findMany({
      where: ids?.length
        ? and(
            eq(rpiHiringDrafts.companyId, actor.companyId),
            inArray(rpiHiringDrafts.id, ids),
          )
        : eq(rpiHiringDrafts.companyId, actor.companyId),
      orderBy: [desc(rpiHiringDrafts.createdAt)],
      limit: 100,
    });
    const candidateIds = [...new Set(rows.map((r) => r.candidateId))];
    const candidates =
      candidateIds.length === 0
        ? []
        : await this.db.query.recruitingCandidates.findMany({
            where: and(
              eq(recruitingCandidates.companyId, actor.companyId),
              inArray(recruitingCandidates.id, candidateIds),
            ),
          });
    const names = new Map(candidates.map((c) => [c.id, c.name]));
    return rows.map((r) => this.toHiringDraft(r, names.get(r.candidateId) ?? null));
  }

  async listInterviewDrafts(
    actor: RpiActor,
    ids?: string[],
  ): Promise<RpiInterviewDraftSummary[]> {
    this.assertOwnerAdmin(actor);
    const rows = await this.db.query.rpiInterviewDrafts.findMany({
      where: ids?.length
        ? and(
            eq(rpiInterviewDrafts.companyId, actor.companyId),
            inArray(rpiInterviewDrafts.id, ids),
          )
        : eq(rpiInterviewDrafts.companyId, actor.companyId),
      orderBy: [desc(rpiInterviewDrafts.createdAt)],
      limit: 100,
    });
    const candidateIds = [...new Set(rows.map((r) => r.candidateId))];
    const interviewerIds = [
      ...new Set(rows.map((r) => r.interviewerUserId).filter((id): id is string => Boolean(id))),
    ];
    const candidates =
      candidateIds.length === 0
        ? []
        : await this.db.query.recruitingCandidates.findMany({
            where: and(
              eq(recruitingCandidates.companyId, actor.companyId),
              inArray(recruitingCandidates.id, candidateIds),
            ),
          });
    const interviewers =
      interviewerIds.length === 0
        ? []
        : await this.db.query.users.findMany({
            where: and(
              eq(users.companyId, actor.companyId),
              inArray(users.id, interviewerIds),
            ),
          });
    const names = new Map(candidates.map((c) => [c.id, c.name]));
    const interviewerNames = new Map(
      interviewers.map((u) => [u.id, displayName(u.firstName, u.lastName)]),
    );
    return rows.map((r) =>
      this.toInterviewDraft(
        r,
        names.get(r.candidateId) ?? null,
        r.interviewerUserId ? (interviewerNames.get(r.interviewerUserId) ?? null) : null,
      ),
    );
  }
}
