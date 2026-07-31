import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type {
  CandidateActivitySummary,
  CandidatePipelineStage,
  CertificationSummary,
  CreateCandidateActivityRequest,
  CreateCertificationRequest,
  CreateEmployeeSkillRequest,
  CreateTrainingRecordRequest,
  EmployeeSkillSummary,
  SkillGapInsight,
  StaffingInsight,
  TechnicianPerformanceInsight,
  TrainingRecordSummary,
  UpdateCertificationRequest,
  UpdateEmployeeSkillRequest,
  UpdateTrainingRecordRequest,
  UpdateWorkforceRecommendationRequest,
  WorkforceAuraContext,
  WorkforceRecommendationSummary,
  WorkforceStats,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  candidateActivities,
  certifications,
  employeeSkills,
  jobs,
  trainingRecords,
  users,
  workforceRecommendations,
} from '@titan/db';
import type { AnalyticsService } from './analytics.service.js';
import type { RecruitingService } from './recruiting.service.js';
import type { SchedulingService } from './scheduling.service.js';
import { RecruitingError } from './recruiting.service.js';

export class WorkforceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'WorkforceError';
  }
}

type TenantScope = {
  companyId: string;
  userId: string;
};

type WorkforceServiceDeps = {
  db: DatabaseClient;
  recruitingService: RecruitingService;
  analyticsService: AnalyticsService;
  schedulingService: SchedulingService;
};

export class WorkforceService {
  constructor(private readonly deps: WorkforceServiceDeps) {}

  async getStats(companyId: string): Promise<WorkforceStats> {
    const [candidates, skills, certs, training, recommendations, technicians] = await Promise.all([
      this.deps.recruitingService.listCandidates(companyId),
      this.listSkills(companyId),
      this.listCertifications(companyId),
      this.listTraining(companyId),
      this.listRecommendations(companyId),
      this.deps.db.query.users.findMany({
        where: and(eq(users.companyId, companyId), eq(users.isActive, true)),
      }),
    ]);

    const activePipeline = candidates.filter((row) => !['hired', 'rejected'].includes(row.status));

    return {
      candidateCount: candidates.length,
      activePipelineCount: activePipeline.length,
      employeeSkillCount: skills.length,
      certificationCount: certs.length,
      plannedTrainingCount: training.filter((row) => row.status !== 'completed').length,
      pendingRecommendationCount: recommendations.filter((row) => row.status === 'pending').length,
      technicianCount: technicians.length,
    };
  }

  async getCandidatePipeline(companyId: string): Promise<CandidatePipelineStage[]> {
    const candidates = await this.deps.recruitingService.listCandidates(companyId);
    const stageDefs: Array<{ status: string; label: string }> = [
      { status: 'applied', label: 'Applied' },
      { status: 'screening', label: 'Screening' },
      { status: 'interview', label: 'Interview' },
      { status: 'assessment', label: 'Assessment' },
      { status: 'offer', label: 'Offer' },
      { status: 'hired', label: 'Hired' },
      { status: 'rejected', label: 'Rejected' },
    ];

    return stageDefs.map((stage) => ({
      ...stage,
      count: candidates.filter((row) => normalizePipelineStatus(row.status) === stage.status)
        .length,
    }));
  }

  async listCandidateActivities(
    companyId: string,
    candidateId: string,
  ): Promise<CandidateActivitySummary[]> {
    await this.ensureCandidate(companyId, candidateId);

    const rows = await this.deps.db.query.candidateActivities.findMany({
      where: and(
        eq(candidateActivities.companyId, companyId),
        eq(candidateActivities.candidateId, candidateId),
      ),
      with: { author: true },
      orderBy: [candidateActivities.occurredAt],
    });

    return rows.map(toActivitySummary);
  }

  async addCandidateActivity(
    scope: TenantScope,
    candidateId: string,
    input: CreateCandidateActivityRequest,
  ): Promise<CandidateActivitySummary> {
    await this.ensureCandidate(scope.companyId, candidateId);

    const body = input.body.trim();
    if (!body) {
      throw new WorkforceError('VALIDATION_ERROR', 'Activity body is required');
    }

    const [created] = await this.deps.db
      .insert(candidateActivities)
      .values({
        companyId: scope.companyId,
        candidateId,
        activityType: input.activityType ?? 'note',
        subject: input.subject?.trim() || null,
        body,
        authorUserId: scope.userId,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      })
      .returning();

    const row = await this.deps.db.query.candidateActivities.findFirst({
      where: eq(candidateActivities.id, created!.id),
      with: { author: true },
    });

    return toActivitySummary(row!);
  }

  async listSkills(companyId: string): Promise<EmployeeSkillSummary[]> {
    const rows = await this.deps.db.query.employeeSkills.findMany({
      where: eq(employeeSkills.companyId, companyId),
      with: { user: true },
      orderBy: [desc(employeeSkills.updatedAt)],
    });

    return rows.map(toSkillSummary);
  }

  async createSkill(
    scope: TenantScope,
    input: CreateEmployeeSkillRequest,
  ): Promise<EmployeeSkillSummary> {
    await this.ensureUser(scope.companyId, input.userId);

    const [created] = await this.deps.db
      .insert(employeeSkills)
      .values({
        companyId: scope.companyId,
        userId: input.userId,
        skillKey: input.skillKey.trim(),
        skillName: input.skillName.trim(),
        proficiency: input.proficiency ?? 'intermediate',
        experienceYears: input.experienceYears ?? null,
        notes: input.notes?.trim() || null,
      })
      .returning();

    const row = await this.deps.db.query.employeeSkills.findFirst({
      where: eq(employeeSkills.id, created!.id),
      with: { user: true },
    });

    return toSkillSummary(row!);
  }

  async updateSkill(
    companyId: string,
    skillId: string,
    input: UpdateEmployeeSkillRequest,
  ): Promise<EmployeeSkillSummary> {
    const existing = await this.deps.db.query.employeeSkills.findFirst({
      where: and(eq(employeeSkills.id, skillId), eq(employeeSkills.companyId, companyId)),
    });

    if (!existing) {
      throw new WorkforceError('NOT_FOUND', 'Employee skill not found');
    }

    await this.deps.db
      .update(employeeSkills)
      .set({
        skillKey: input.skillKey?.trim(),
        skillName: input.skillName?.trim(),
        proficiency: input.proficiency,
        experienceYears: input.experienceYears,
        notes: input.notes !== undefined ? input.notes?.trim() || null : undefined,
        updatedAt: new Date(),
      })
      .where(eq(employeeSkills.id, skillId));

    const row = await this.deps.db.query.employeeSkills.findFirst({
      where: eq(employeeSkills.id, skillId),
      with: { user: true },
    });

    return toSkillSummary(row!);
  }

  async listCertifications(companyId: string): Promise<CertificationSummary[]> {
    const rows = await this.deps.db.query.certifications.findMany({
      where: eq(certifications.companyId, companyId),
      with: { user: true },
      orderBy: [desc(certifications.updatedAt)],
    });

    return rows.map(toCertificationSummary);
  }

  async createCertification(
    scope: TenantScope,
    input: CreateCertificationRequest,
  ): Promise<CertificationSummary> {
    await this.ensureUser(scope.companyId, input.userId);

    const [created] = await this.deps.db
      .insert(certifications)
      .values({
        companyId: scope.companyId,
        userId: input.userId,
        certificationKey: input.certificationKey.trim(),
        name: input.name.trim(),
        issuer: input.issuer?.trim() || null,
        issuedAt: input.issuedAt ? new Date(input.issuedAt) : null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        notes: input.notes?.trim() || null,
      })
      .returning();

    const row = await this.deps.db.query.certifications.findFirst({
      where: eq(certifications.id, created!.id),
      with: { user: true },
    });

    return toCertificationSummary(row!);
  }

  async updateCertification(
    companyId: string,
    certificationId: string,
    input: UpdateCertificationRequest,
  ): Promise<CertificationSummary> {
    const existing = await this.deps.db.query.certifications.findFirst({
      where: and(eq(certifications.id, certificationId), eq(certifications.companyId, companyId)),
    });

    if (!existing) {
      throw new WorkforceError('NOT_FOUND', 'Certification not found');
    }

    await this.deps.db
      .update(certifications)
      .set({
        certificationKey: input.certificationKey?.trim(),
        name: input.name?.trim(),
        issuer: input.issuer !== undefined ? input.issuer?.trim() || null : undefined,
        issuedAt:
          input.issuedAt !== undefined
            ? input.issuedAt
              ? new Date(input.issuedAt)
              : null
            : undefined,
        expiresAt:
          input.expiresAt !== undefined
            ? input.expiresAt
              ? new Date(input.expiresAt)
              : null
            : undefined,
        notes: input.notes !== undefined ? input.notes?.trim() || null : undefined,
        updatedAt: new Date(),
      })
      .where(eq(certifications.id, certificationId));

    const row = await this.deps.db.query.certifications.findFirst({
      where: eq(certifications.id, certificationId),
      with: { user: true },
    });

    return toCertificationSummary(row!);
  }

  async listTraining(companyId: string): Promise<TrainingRecordSummary[]> {
    const rows = await this.deps.db.query.trainingRecords.findMany({
      where: eq(trainingRecords.companyId, companyId),
      with: { user: true },
      orderBy: [desc(trainingRecords.updatedAt)],
    });

    return rows.map(toTrainingSummary);
  }

  async createTraining(
    scope: TenantScope,
    input: CreateTrainingRecordRequest,
  ): Promise<TrainingRecordSummary> {
    await this.ensureUser(scope.companyId, input.userId);

    const [created] = await this.deps.db
      .insert(trainingRecords)
      .values({
        companyId: scope.companyId,
        userId: input.userId,
        trainingKey: input.trainingKey.trim(),
        title: input.title.trim(),
        description: input.description?.trim() || null,
        status: input.status ?? 'planned',
        completedAt: input.completedAt ? new Date(input.completedAt) : null,
        notes: input.notes?.trim() || null,
      })
      .returning();

    const row = await this.deps.db.query.trainingRecords.findFirst({
      where: eq(trainingRecords.id, created!.id),
      with: { user: true },
    });

    return toTrainingSummary(row!);
  }

  async updateTraining(
    companyId: string,
    trainingId: string,
    input: UpdateTrainingRecordRequest,
  ): Promise<TrainingRecordSummary> {
    const existing = await this.deps.db.query.trainingRecords.findFirst({
      where: and(eq(trainingRecords.id, trainingId), eq(trainingRecords.companyId, companyId)),
    });

    if (!existing) {
      throw new WorkforceError('NOT_FOUND', 'Training record not found');
    }

    await this.deps.db
      .update(trainingRecords)
      .set({
        trainingKey: input.trainingKey?.trim(),
        title: input.title?.trim(),
        description:
          input.description !== undefined ? input.description?.trim() || null : undefined,
        status: input.status,
        completedAt:
          input.completedAt !== undefined
            ? input.completedAt
              ? new Date(input.completedAt)
              : null
            : undefined,
        notes: input.notes !== undefined ? input.notes?.trim() || null : undefined,
        updatedAt: new Date(),
      })
      .where(eq(trainingRecords.id, trainingId));

    const row = await this.deps.db.query.trainingRecords.findFirst({
      where: eq(trainingRecords.id, trainingId),
      with: { user: true },
    });

    return toTrainingSummary(row!);
  }

  async listRecommendations(companyId: string): Promise<WorkforceRecommendationSummary[]> {
    const rows = await this.deps.db.query.workforceRecommendations.findMany({
      where: and(
        eq(workforceRecommendations.companyId, companyId),
        inArray(workforceRecommendations.status, ['pending', 'accepted']),
      ),
      orderBy: [desc(workforceRecommendations.updatedAt)],
      limit: 50,
    });

    return rows.map(toRecommendationSummary);
  }

  async generateRecommendations(companyId: string): Promise<WorkforceRecommendationSummary[]> {
    const [skillGaps, staffingInsights, performance] = await Promise.all([
      this.getSkillGaps(companyId),
      this.getStaffingInsights(companyId),
      this.getTechnicianPerformanceInsights(companyId),
    ]);

    const signals: Array<{
      recommendationType: WorkforceRecommendationSummary['recommendationType'];
      title: string;
      description: string;
      priority: string;
      context: Record<string, unknown>;
    }> = [];

    for (const gap of skillGaps.slice(0, 5)) {
      signals.push({
        recommendationType: 'skill_gap',
        title: `Skill gap — ${gap.skillName}`,
        description: gap.description,
        priority: gap.priority,
        context: gap.context,
      });
    }

    for (const insight of staffingInsights.slice(0, 5)) {
      signals.push({
        recommendationType: insight.insightType === 'capacity_pressure' ? 'capacity' : 'staffing',
        title: insight.title,
        description: insight.description,
        priority: insight.priority,
        context: insight.context,
      });
    }

    for (const tech of performance.filter((row) => row.trainingNeedSignal).slice(0, 5)) {
      signals.push({
        recommendationType: 'training',
        title: `Training recommendation — ${tech.userName}`,
        description: tech.summary,
        priority: 'medium',
        context: { userId: tech.userId, workloadScore: tech.workloadScore },
      });
    }

    const candidates = await this.deps.recruitingService.listCandidates(companyId);
    const interviewStage = candidates.filter((row) =>
      ['interview', 'assessment', 'offer', 'offered'].includes(row.status),
    );
    if (interviewStage.length >= 2) {
      signals.push({
        recommendationType: 'recruitment',
        title: 'Active interview pipeline',
        description: `${interviewStage.length} candidate(s) in interview/offer stages — review hiring decisions for approval.`,
        priority: 'medium',
        context: { candidateIds: interviewStage.map((row) => row.id) },
      });
    }

    const created: WorkforceRecommendationSummary[] = [];
    for (const signal of signals.slice(0, 15)) {
      const [row] = await this.deps.db
        .insert(workforceRecommendations)
        .values({
          companyId,
          recommendationType: signal.recommendationType,
          title: signal.title,
          description: signal.description,
          priority: signal.priority,
          context: signal.context,
        })
        .returning();

      if (row) {
        created.push(toRecommendationSummary(row));
      }
    }

    return created;
  }

  async updateRecommendation(
    companyId: string,
    recommendationId: string,
    input: UpdateWorkforceRecommendationRequest,
  ): Promise<WorkforceRecommendationSummary> {
    const existing = await this.deps.db.query.workforceRecommendations.findFirst({
      where: and(
        eq(workforceRecommendations.id, recommendationId),
        eq(workforceRecommendations.companyId, companyId),
      ),
    });

    if (!existing) {
      throw new WorkforceError('NOT_FOUND', 'Workforce recommendation not found');
    }

    await this.deps.db
      .update(workforceRecommendations)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(workforceRecommendations.id, recommendationId));

    const row = await this.deps.db.query.workforceRecommendations.findFirst({
      where: eq(workforceRecommendations.id, recommendationId),
    });

    return toRecommendationSummary(row!);
  }

  async getSkillGaps(companyId: string): Promise<SkillGapInsight[]> {
    const [skills, jobRows, training] = await Promise.all([
      this.listSkills(companyId),
      this.deps.db.query.jobs.findMany({ where: eq(jobs.companyId, companyId), limit: 200 }),
      this.listTraining(companyId),
    ]);

    const insights: SkillGapInsight[] = [];
    const skillKeys = new Set(skills.map((row) => row.skillKey.toLowerCase()));
    const jobTitles = new Map<string, number>();

    for (const job of jobRows) {
      const key = job.title.trim().toLowerCase().slice(0, 40);
      jobTitles.set(key, (jobTitles.get(key) ?? 0) + 1);
    }

    for (const [title, count] of [...jobTitles.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      const normalized = title.replace(/\s+/g, '_');
      if (!skillKeys.has(normalized) && count >= 2) {
        insights.push({
          skillKey: normalized,
          skillName: title,
          gapType: 'missing',
          description: `"${title}" appears in ${count} job(s) but no matching employee skill is recorded.`,
          priority: 'medium',
          context: { jobCount: count },
        });
      }
    }

    const plannedTraining = training.filter((row) => row.status === 'planned');
    if (plannedTraining.length > 0) {
      insights.push({
        skillKey: 'training_backlog',
        skillName: 'Planned training',
        gapType: 'training_needed',
        description: `${plannedTraining.length} planned training record(s) indicate outstanding development needs.`,
        priority: 'medium',
        context: { trainingIds: plannedTraining.slice(0, 10).map((row) => row.id) },
      });
    }

    if (skills.length === 0 && jobRows.length > 0) {
      insights.push({
        skillKey: 'skills_untracked',
        skillName: 'Workforce skills',
        gapType: 'low_coverage',
        description: 'No employee skills recorded — workforce capability tracking is incomplete.',
        priority: 'high',
        context: { jobCount: jobRows.length },
      });
    }

    return insights.slice(0, 12);
  }

  async getStaffingInsights(companyId: string): Promise<StaffingInsight[]> {
    const [scheduling, performance, candidates] = await Promise.all([
      this.deps.schedulingService.getStats(companyId),
      this.getTechnicianPerformanceInsights(companyId),
      this.deps.recruitingService.listCandidates(companyId),
    ]);

    const insights: StaffingInsight[] = [];
    const highWorkload = performance.filter((row) => row.workloadScore >= 80);

    if (highWorkload.length > 0) {
      insights.push({
        insightType: 'capacity_pressure',
        title: 'Technician capacity pressure detected',
        description: `${highWorkload.length} technician(s) show high workload scores — consider staffing review.`,
        priority: 'high',
        context: { userIds: highWorkload.map((row) => row.userId) },
      });
    }

    if (scheduling.scheduledCount > 0 && performance.length > 0) {
      const avgCompletion =
        performance.reduce((sum, row) => sum + (row.completionRatePercent ?? 0), 0) /
        performance.length;

      if (avgCompletion < 60) {
        insights.push({
          insightType: 'completion_rate',
          title: 'Low job completion rate across technicians',
          description: `Average completion rate is ${Math.round(avgCompletion)}% — review dispatch capacity and training.`,
          priority: 'medium',
          context: { scheduledJobCount: scheduling.scheduledCount },
        });
      }
    }

    const openRoles = candidates.filter((row) =>
      ['applied', 'new', 'screening', 'interview', 'assessment'].includes(row.status),
    );
    if (openRoles.length >= 3) {
      insights.push({
        insightType: 'recruitment_pipeline',
        title: 'Open recruitment pipeline',
        description: `${openRoles.length} candidate(s) in active pipeline stages.`,
        priority: 'medium',
        context: { candidateCount: openRoles.length },
      });
    }

    const [scheduledJobsRow] = await this.deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.companyId, companyId), isNotNull(jobs.scheduledAt)));

    const activeTechnicians = performance.length;
    const scheduledJobs = scheduledJobsRow?.count ?? 0;
    if (activeTechnicians > 0 && scheduledJobs / activeTechnicians > 15) {
      insights.push({
        insightType: 'staffing_need',
        title: 'Potential need for additional technicians',
        description: `${scheduledJobs} scheduled jobs across ${activeTechnicians} active technician(s) — capacity may be stretched.`,
        priority: 'high',
        context: { scheduledJobs, activeTechnicians },
      });
    }

    return insights.slice(0, 12);
  }

  async getTechnicianPerformanceInsights(
    companyId: string,
  ): Promise<TechnicianPerformanceInsight[]> {
    const performance = await this.deps.analyticsService.getTechnicianPerformance(companyId);

    return performance.technicians.map((tech) => {
      const completionRatePercent =
        tech.jobsAssigned > 0 ? Math.round((tech.jobsCompleted / tech.jobsAssigned) * 100) : null;

      return {
        userId: tech.userId,
        userName: tech.name,
        jobsCompleted: tech.jobsCompleted,
        jobsAssigned: tech.jobsAssigned,
        completionRatePercent,
        averageCompletionHours: tech.averageCompletionHours,
        workloadScore: tech.workloadScore,
        trainingNeedSignal:
          (completionRatePercent !== null && completionRatePercent < 60) ||
          tech.workloadScore >= 85,
        summary: `${tech.name}: ${tech.jobsCompleted}/${tech.jobsAssigned} jobs completed${completionRatePercent !== null ? ` (${completionRatePercent}%)` : ''}, workload ${tech.workloadScore}.`,
      };
    });
  }

  async buildAuraContext(companyId: string): Promise<WorkforceAuraContext> {
    const [stats, pipeline, skillGaps, staffingInsights, recommendations] = await Promise.all([
      this.getStats(companyId),
      this.getCandidatePipeline(companyId),
      this.getSkillGaps(companyId),
      this.getStaffingInsights(companyId),
      this.listRecommendations(companyId),
    ]);

    return {
      candidateCount: stats.candidateCount,
      activePipelineCount: stats.activePipelineCount,
      pendingRecommendationCount: stats.pendingRecommendationCount,
      skillGapCount: skillGaps.length,
      pipelineStages: pipeline,
      topRecommendations: recommendations.slice(0, 8).map((row) => ({
        title: row.title,
        recommendationType: row.recommendationType,
        priority: row.priority,
      })),
      staffingInsights,
      summary: `${stats.candidateCount} candidate(s), ${stats.activePipelineCount} in pipeline, ${skillGaps.length} skill gap signal(s), ${stats.pendingRecommendationCount} pending recommendation(s).`,
    };
  }

  private async ensureCandidate(companyId: string, candidateId: string): Promise<void> {
    const candidate = await this.deps.recruitingService.getCandidate(companyId, candidateId);
    if (!candidate) {
      throw new RecruitingError('NOT_FOUND', 'Candidate not found');
    }
  }

  private async ensureUser(companyId: string, userId: string): Promise<void> {
    const user = await this.deps.db.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.companyId, companyId)),
    });

    if (!user) {
      throw new WorkforceError('NOT_FOUND', 'User not found');
    }
  }
}

function normalizePipelineStatus(status: string): string {
  if (status === 'new') return 'applied';
  if (status === 'offered') return 'offer';
  return status;
}

function toActivitySummary(
  row: typeof candidateActivities.$inferSelect & {
    author?: { firstName: string; lastName: string } | null;
  },
): CandidateActivitySummary {
  return {
    id: row.id,
    candidateId: row.candidateId,
    activityType: row.activityType,
    subject: row.subject,
    body: row.body,
    authorUserId: row.authorUserId,
    authorName: row.author ? `${row.author.firstName} ${row.author.lastName}`.trim() : null,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toSkillSummary(
  row: typeof employeeSkills.$inferSelect & {
    user?: { firstName: string; lastName: string } | null;
  },
): EmployeeSkillSummary {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.user ? `${row.user.firstName} ${row.user.lastName}`.trim() : null,
    skillKey: row.skillKey,
    skillName: row.skillName,
    proficiency: row.proficiency,
    experienceYears: row.experienceYears,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toCertificationSummary(
  row: typeof certifications.$inferSelect & {
    user?: { firstName: string; lastName: string } | null;
  },
): CertificationSummary {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.user ? `${row.user.firstName} ${row.user.lastName}`.trim() : null,
    certificationKey: row.certificationKey,
    name: row.name,
    issuer: row.issuer,
    issuedAt: row.issuedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toTrainingSummary(
  row: typeof trainingRecords.$inferSelect & {
    user?: { firstName: string; lastName: string } | null;
  },
): TrainingRecordSummary {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.user ? `${row.user.firstName} ${row.user.lastName}`.trim() : null,
    trainingKey: row.trainingKey,
    title: row.title,
    description: row.description,
    status: row.status,
    completedAt: row.completedAt?.toISOString() ?? null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toRecommendationSummary(
  row: typeof workforceRecommendations.$inferSelect,
): WorkforceRecommendationSummary {
  return {
    id: row.id,
    recommendationType: row.recommendationType,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    context: row.context,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
