import { and, desc, eq, ne, sql } from 'drizzle-orm';
import {
  buildHrIntelEmploymentSummary,
  buildHrIntelPayrollSnapshot,
  buildHrIntelQualificationComplianceRows,
  buildHrIntelQualificationComplianceSnapshot,
  buildHrIntelRecommendationDrafts,
  buildHrIntelSkillGaps,
  buildHrIntelSkillsIntelligenceSnapshot,
  buildHrIntelTimesheetSnapshot,
  buildHrIntelWorkforceAvailabilitySnapshot,
  buildHrIntelWorkforceSnapshot,
  canAccessHrEmployeeIntelligence,
  canAccessHrEmployeeSelfView,
  canManageHrEmployeeIntelligenceSettings,
  canWriteHrEmployeeIntelligence,
  defaultHrIntelSettings,
  deriveHrIntelAvailabilitySignal,
  HR_INTEL_PRODUCT_COPY,
  isTechnicianRoleName,
  listHrIntelConnections,
  type AcknowledgeHrIntelInsightRequest,
  type CreateHrIntelAuraInsightRequest,
  type DecideHrIntelRecommendationRequest,
  type HrIntelAuraInsightSummary,
  type HrIntelDashboard,
  type HrIntelEmployeeRecord,
  type HrIntelQualificationComplianceRow,
  type HrIntelRecommendationSummary,
  type HrIntelSelfProfile,
  type HrIntelSettings,
  type HrIntelSkillOverviewRow,
  type HrIntelTeamNode,
  type HrIntelTechnicianRow,
  type HrIntelTrainingNeedRow,
  type UpdateHrIntelSettingsRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  certifications,
  employeeSkills,
  heiAuraInsights,
  heiRecommendationDrafts,
  heiSettings,
  jobs,
  recruitingCandidates,
  roles,
  securityAuditLogs,
  trainingRecords,
  users,
  wiPayrollPeriods,
  wiProviderAdapters,
  wiTimesheets,
  wiWorkforceProfiles,
} from '@titan/db';

export class HrEmployeeIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HrEmployeeIntelligenceError';
  }
}

export type HrIntelActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

export class HrEmployeeIntelligenceService {
  constructor(private readonly db: DatabaseClient) {}

  private assertOwnerAdmin(actor: HrIntelActor): void {
    if (!canAccessHrEmployeeIntelligence(actor)) {
      throw new HrEmployeeIntelligenceError(
        'FORBIDDEN',
        'Employee Intelligence requires Owner or Admin access. Technicians and clients cannot view sensitive HR, payroll, or HR analytics.',
      );
    }
  }

  private assertWrite(actor: HrIntelActor): void {
    this.assertOwnerAdmin(actor);
    if (!canWriteHrEmployeeIntelligence(actor)) {
      throw new HrEmployeeIntelligenceError('FORBIDDEN', 'Write actions require Owner or Admin access.');
    }
  }

  private assertManageSettings(actor: HrIntelActor): void {
    this.assertWrite(actor);
    if (!canManageHrEmployeeIntelligenceSettings(actor)) {
      throw new HrEmployeeIntelligenceError(
        'FORBIDDEN',
        'Only Owner or Admin may change Employee Intelligence settings.',
      );
    }
  }

  private async recordAudit(
    actor: HrIntelActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'hr_employee_intelligence',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        inventEmployees: false,
        autoPayrollMutation: false,
        autoHrActions: false,
        sensitiveHrOwnerAdminOnly: true,
      },
    });
  }

  private toInsight(row: typeof heiAuraInsights.$inferSelect): HrIntelAuraInsightSummary {
    return {
      id: row.id,
      target: row.target,
      status: row.status,
      title: row.title,
      insight: row.insight,
      href: row.href,
      subjectUserId: row.subjectUserId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toRecommendation(
    row: typeof heiRecommendationDrafts.$inferSelect,
  ): HrIntelRecommendationSummary {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      body: row.body,
      skillKey: row.skillKey,
      subjectUserId: row.subjectUserId,
      autoExecuted: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private toSettings(row: typeof heiSettings.$inferSelect): HrIntelSettings {
    return defaultHrIntelSettings({
      id: row.id,
      insightsEnabled: row.insightsEnabled,
      selfViewEnabled: row.selfViewEnabled,
      recommendationDraftsEnabled: row.recommendationDraftsEnabled,
      notes: row.notes,
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  private async ensureSettings(actor: HrIntelActor): Promise<HrIntelSettings> {
    const existing = await this.db.query.heiSettings.findFirst({
      where: eq(heiSettings.companyId, actor.companyId),
    });
    if (existing) return this.toSettings(existing);

    const [created] = await this.db
      .insert(heiSettings)
      .values({
        companyId: actor.companyId,
        insightsEnabled: true,
        selfViewEnabled: true,
        recommendationDraftsEnabled: true,
        autoPayrollMutationEnabled: false,
        inventEmployeesEnabled: false,
        autoHrActionsEnabled: false,
        updatedByUserId: actor.userId,
      })
      .returning();

    return this.toSettings(created);
  }

  private displayName(firstName: string, lastName: string): string {
    return `${firstName} ${lastName}`.trim();
  }

  async getDashboard(actor: HrIntelActor): Promise<HrIntelDashboard> {
    this.assertOwnerAdmin(actor);
    const settings = await this.ensureSettings(actor);

    const [
      userRows,
      roleRows,
      skillRows,
      certRows,
      trainingRows,
      profileRows,
      timesheetCountRow,
      payrollPeriodCountRow,
      payrollProviderCountRow,
      jobAssignmentRows,
      insights,
      recommendations,
      recruitingCountRow,
    ] = await Promise.all([
      this.db.query.users.findMany({
        where: eq(users.companyId, actor.companyId),
        orderBy: [desc(users.updatedAt)],
        limit: 500,
      }),
      this.db.query.roles.findMany({ where: eq(roles.companyId, actor.companyId) }),
      this.db.query.employeeSkills.findMany({
        where: eq(employeeSkills.companyId, actor.companyId),
        orderBy: [desc(employeeSkills.updatedAt)],
        limit: 2000,
      }),
      this.db.query.certifications.findMany({
        where: eq(certifications.companyId, actor.companyId),
        orderBy: [desc(certifications.updatedAt)],
        limit: 2000,
      }),
      this.db.query.trainingRecords.findMany({
        where: eq(trainingRecords.companyId, actor.companyId),
        orderBy: [desc(trainingRecords.updatedAt)],
        limit: 2000,
      }),
      this.db.query.wiWorkforceProfiles.findMany({
        where: eq(wiWorkforceProfiles.companyId, actor.companyId),
        limit: 500,
      }),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(wiTimesheets)
        .where(eq(wiTimesheets.companyId, actor.companyId)),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(wiPayrollPeriods)
        .where(eq(wiPayrollPeriods.companyId, actor.companyId)),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(wiProviderAdapters)
        .where(
          and(
            eq(wiProviderAdapters.companyId, actor.companyId),
            eq(wiProviderAdapters.providerCategory, 'payroll'),
          ),
        ),
      this.db
        .select({
          assignedUserId: jobs.assignedUserId,
          count: sql<number>`count(*)::int`,
        })
        .from(jobs)
        .where(
          and(
            eq(jobs.companyId, actor.companyId),
            ne(jobs.status, 'cancelled'),
            ne(jobs.status, 'completed'),
          ),
        )
        .groupBy(jobs.assignedUserId),
      this.db.query.heiAuraInsights.findMany({
        where: eq(heiAuraInsights.companyId, actor.companyId),
        orderBy: [desc(heiAuraInsights.createdAt)],
        limit: 50,
      }),
      this.db.query.heiRecommendationDrafts.findMany({
        where: eq(heiRecommendationDrafts.companyId, actor.companyId),
        orderBy: [desc(heiRecommendationDrafts.createdAt)],
        limit: 50,
      }),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(recruitingCandidates)
        .where(eq(recruitingCandidates.companyId, actor.companyId)),
    ]);

    const roleById = new Map(roleRows.map((r) => [r.id, r.name]));
    const profileByUserId = new Map(profileRows.map((p) => [p.userId, p]));
    const userById = new Map(userRows.map((u) => [u.id, u]));
    const openJobsByUser = new Map<string, number>();
    for (const row of jobAssignmentRows) {
      if (!row.assignedUserId) continue;
      openJobsByUser.set(row.assignedUserId, row.count ?? 0);
    }

    const timesheetCountByUser = new Map<string, number>();
    const timesheetRows = await this.db
      .select({
        userId: wiTimesheets.userId,
        count: sql<number>`count(*)::int`,
      })
      .from(wiTimesheets)
      .where(eq(wiTimesheets.companyId, actor.companyId))
      .groupBy(wiTimesheets.userId);
    for (const row of timesheetRows) {
      timesheetCountByUser.set(row.userId, row.count ?? 0);
    }

    const skillsByUser = new Map<string, typeof skillRows>();
    for (const skill of skillRows) {
      const list = skillsByUser.get(skill.userId) ?? [];
      list.push(skill);
      skillsByUser.set(skill.userId, list);
    }
    const certsByUser = new Map<string, typeof certRows>();
    for (const cert of certRows) {
      const list = certsByUser.get(cert.userId) ?? [];
      list.push(cert);
      certsByUser.set(cert.userId, list);
    }
    const trainingByUser = new Map<string, typeof trainingRows>();
    for (const training of trainingRows) {
      const list = trainingByUser.get(training.userId) ?? [];
      list.push(training);
      trainingByUser.set(training.userId, list);
    }

    const employees: HrIntelEmployeeRecord[] = userRows.map((user) => {
      const roleName = roleById.get(user.roleId) ?? 'Unknown';
      const profile = profileByUserId.get(user.id);
      const manager = profile?.managerUserId ? userById.get(profile.managerUserId) : undefined;
      const assignedOpenJobCount = openJobsByUser.get(user.id) ?? 0;
      return {
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isActive: user.isActive,
        roleId: user.roleId,
        roleName,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        skills: (skillsByUser.get(user.id) ?? []).map((s) => ({
          id: s.id,
          skillKey: s.skillKey,
          skillName: s.skillName,
          proficiency: s.proficiency,
          experienceYears: s.experienceYears,
        })),
        qualifications: (certsByUser.get(user.id) ?? []).map((c) => ({
          id: c.id,
          certificationKey: c.certificationKey,
          name: c.name,
          issuer: c.issuer,
          issuedAt: c.issuedAt?.toISOString() ?? null,
          expiresAt: c.expiresAt?.toISOString() ?? null,
        })),
        training: (trainingByUser.get(user.id) ?? []).map((t) => ({
          id: t.id,
          trainingKey: t.trainingKey,
          title: t.title,
          status: t.status,
          completedAt: t.completedAt?.toISOString() ?? null,
        })),
        employment: buildHrIntelEmploymentSummary({
          hasProfile: Boolean(profile),
          employeeNumber: profile?.employeeNumber,
          employmentType: profile?.employmentType,
          jobTitle: profile?.jobTitle,
          department: profile?.department,
          branch: profile?.branch,
          managerUserId: profile?.managerUserId,
          managerName: manager ? this.displayName(manager.firstName, manager.lastName) : null,
          startDate: profile?.startDate ?? null,
          contractStatus: profile?.contractStatus,
          lifecycleStage: profile?.lifecycleStage ?? null,
        }),
        assignedOpenJobCount,
        timesheetCount: timesheetCountByUser.get(user.id) ?? 0,
        isTechnicianRole: isTechnicianRoleName(roleName),
        availabilitySignal: deriveHrIntelAvailabilitySignal({
          isActive: user.isActive,
          assignedOpenJobCount,
        }),
      };
    });

    const team: HrIntelTeamNode[] = employees.map((e) => ({
      userId: e.userId,
      displayName: this.displayName(e.firstName, e.lastName),
      roleName: e.roleName,
      department: e.employment.department,
      jobTitle: e.employment.jobTitle,
      managerUserId: e.employment.managerUserId,
      managerName: e.employment.managerName,
      isActive: e.isActive,
      isTechnicianRole: e.isTechnicianRole,
      skillCount: e.skills.length,
      availabilitySignal: e.availabilitySignal,
    }));

    const skillMap = new Map<string, HrIntelSkillOverviewRow>();
    for (const skill of skillRows) {
      const user = userById.get(skill.userId);
      if (!user) continue;
      const existing = skillMap.get(skill.skillKey) ?? {
        skillKey: skill.skillKey,
        skillName: skill.skillName,
        holderCount: 0,
        holders: [],
      };
      existing.holderCount += 1;
      if (existing.holders.length < 20) {
        existing.holders.push({
          userId: user.id,
          displayName: this.displayName(user.firstName, user.lastName),
          proficiency: skill.proficiency,
        });
      }
      skillMap.set(skill.skillKey, existing);
    }
    const skillsOverview = [...skillMap.values()].sort((a, b) => b.holderCount - a.holderCount);

    const trainingNeeds: HrIntelTrainingNeedRow[] = [];
    for (const e of employees) {
      if (!e.isActive) continue;
      for (const t of e.training) {
        if (t.status === 'planned' || t.status === 'in_progress' || t.status === 'incomplete') {
          trainingNeeds.push({
            userId: e.userId,
            displayName: this.displayName(e.firstName, e.lastName),
            trainingId: t.id,
            trainingKey: t.trainingKey,
            title: t.title,
            status: t.status,
            rationale: `Real training_records row status=${t.status} — training need signal.`,
          });
        }
      }
    }

    const skillGaps = buildHrIntelSkillGaps({
      employees: employees.map((e) => ({
        userId: e.userId,
        displayName: this.displayName(e.firstName, e.lastName),
        roleName: e.roleName,
        isActive: e.isActive,
        isTechnicianRole: e.isTechnicianRole,
        skillCount: e.skills.length,
        qualificationCount: e.qualifications.length,
        plannedTrainingCount: e.training.filter(
          (t) => t.status === 'planned' || t.status === 'in_progress' || t.status === 'incomplete',
        ).length,
      })),
    });

    const technicians: HrIntelTechnicianRow[] = employees
      .filter((e) => e.isTechnicianRole && e.isActive)
      .map((e) => ({
        userId: e.userId,
        displayName: this.displayName(e.firstName, e.lastName),
        roleName: e.roleName,
        jobTitle: e.employment.jobTitle,
        department: e.employment.department,
        skillCount: e.skills.length,
        qualificationCount: e.qualifications.length,
        assignedOpenJobCount: e.assignedOpenJobCount,
        availabilitySignal: e.availabilitySignal,
        technicianIntelligenceHref: '/technician-intelligence',
      }));

    const activeUserCount = employees.filter((e) => e.isActive).length;
    const inactiveUserCount = employees.length - activeUserCount;
    const timesheetCount = timesheetCountRow[0]?.count ?? 0;
    const periodCount = payrollPeriodCountRow[0]?.count ?? 0;
    const providerAdapterCount = payrollProviderCountRow[0]?.count ?? 0;
    const openJobAssignments = [...openJobsByUser.values()].reduce((a, b) => a + b, 0);
    const techniciansAvailable = technicians.filter((t) => t.availabilitySignal === 'available').length;
    const techniciansAssigned = technicians.filter((t) => t.availabilitySignal === 'assigned').length;

    const workforce = buildHrIntelWorkforceSnapshot({
      activeUserCount,
      inactiveUserCount,
      technicianCount: technicians.length,
      profileCount: profileRows.length,
      skillRecordCount: skillRows.length,
      qualificationCount: certRows.length,
      trainingRecordCount: trainingRows.length,
    });
    const workforceAvailability = buildHrIntelWorkforceAvailabilitySnapshot({
      activeEmployeeCount: activeUserCount,
      techniciansAvailable,
      techniciansAssigned,
      openJobAssignments,
    });
    const skillsIntelligence = buildHrIntelSkillsIntelligenceSnapshot({
      distinctSkillCount: skillsOverview.length,
      skillGapCount: skillGaps.length,
      trainingNeedCount: trainingNeeds.length,
      skillRecordCount: skillRows.length,
    });
    const timesheets = buildHrIntelTimesheetSnapshot({ timesheetCount });
    const payroll = buildHrIntelPayrollSnapshot({ periodCount, providerAdapterCount });
    const recruitingCount = recruitingCountRow[0]?.count ?? 0;

    const qualificationComplianceRows: HrIntelQualificationComplianceRow[] =
      buildHrIntelQualificationComplianceRows({
        qualifications: employees.flatMap((e) =>
          e.qualifications.map((q) => ({
            userId: e.userId,
            displayName: this.displayName(e.firstName, e.lastName),
            certificationId: q.id,
            certificationKey: q.certificationKey,
            name: q.name,
            expiresAt: q.expiresAt,
          })),
        ),
      });
    const qualificationCompliance = buildHrIntelQualificationComplianceSnapshot({
      trackedQualificationCount: certRows.length,
      withExpiryCount: certRows.filter((c) => c.expiresAt !== null).length,
      rows: qualificationComplianceRows,
    });

    let summary: string;
    if (workforce.availability === 'unavailable') {
      summary =
        'Employee Intelligence is ready. No real users yet — workforce visibility stays unavailable (not invented).';
    } else {
      summary = `Real workforce: ${workforce.activeUserCount} active, ${workforce.technicianCount} technician(s), ${skillsIntelligence.skillGapCount} skill gap signal(s), ${recommendations.filter((r) => r.status === 'draft').length} recommendation draft(s). Owner/Admin only. No automatic HR actions.`;
    }

    return {
      summary,
      productClarification: { ...HR_INTEL_PRODUCT_COPY },
      policy: {
        sensitiveHrOwnerAdminOnly: true,
        inventEmployees: false,
        autoPayrollMutation: false,
        autoHrActions: false,
        fakePayroll: false,
      },
      workforce,
      workforceAvailability,
      skillsIntelligence,
      timesheets,
      payroll,
      qualificationCompliance,
      qualificationComplianceRows: qualificationComplianceRows.slice(0, 100),
      employees,
      team,
      skillsOverview,
      skillGaps,
      trainingNeeds: trainingNeeds.slice(0, 100),
      technicians,
      recommendations: recommendations.map((r) => this.toRecommendation(r)),
      connections: listHrIntelConnections({
        timesheetsAvailable: timesheets.availability === 'available',
        payrollAvailable: payroll.availability === 'available',
        recruitmentAvailable: recruitingCount > 0,
        qualificationComplianceAvailable: qualificationCompliance.availability === 'available',
      }),
      auraInsights: insights.map((i) => this.toInsight(i)),
      settings,
    };
  }

  async getEmployee(actor: HrIntelActor, userId: string): Promise<HrIntelEmployeeRecord> {
    this.assertOwnerAdmin(actor);
    const dashboard = await this.getDashboard(actor);
    const employee = dashboard.employees.find((e) => e.userId === userId);
    if (!employee) {
      throw new HrEmployeeIntelligenceError(
        'NOT_FOUND',
        'Employee not found in this tenant (real users only — not invented).',
      );
    }
    return employee;
  }

  async getSelfProfile(actor: HrIntelActor): Promise<HrIntelSelfProfile> {
    if (!canAccessHrEmployeeSelfView(actor)) {
      throw new HrEmployeeIntelligenceError('FORBIDDEN', 'Self view is not available for this role.');
    }
    const settings = await this.ensureSettings(actor);
    if (!settings.selfViewEnabled) {
      throw new HrEmployeeIntelligenceError(
        'INVALID_STATE',
        'Employee self view is disabled by Owner/Admin settings.',
      );
    }

    const user = await this.db.query.users.findFirst({
      where: and(eq(users.companyId, actor.companyId), eq(users.id, actor.userId)),
    });
    if (!user) {
      throw new HrEmployeeIntelligenceError('NOT_FOUND', 'User not found in this tenant.');
    }
    const role = await this.db.query.roles.findFirst({
      where: and(eq(roles.companyId, actor.companyId), eq(roles.id, user.roleId)),
    });
    const [skills, certs, training, profile] = await Promise.all([
      this.db.query.employeeSkills.findMany({
        where: and(
          eq(employeeSkills.companyId, actor.companyId),
          eq(employeeSkills.userId, actor.userId),
        ),
      }),
      this.db.query.certifications.findMany({
        where: and(
          eq(certifications.companyId, actor.companyId),
          eq(certifications.userId, actor.userId),
        ),
      }),
      this.db.query.trainingRecords.findMany({
        where: and(
          eq(trainingRecords.companyId, actor.companyId),
          eq(trainingRecords.userId, actor.userId),
        ),
      }),
      this.db.query.wiWorkforceProfiles.findFirst({
        where: and(
          eq(wiWorkforceProfiles.companyId, actor.companyId),
          eq(wiWorkforceProfiles.userId, actor.userId),
        ),
      }),
    ]);

    await this.recordAudit(actor, 'hei_self_view_read', actor.userId, {
      scope: 'self_only',
      sensitiveFieldsHidden: true,
      hrAnalyticsHidden: true,
    });

    return {
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      roleName: role?.name ?? 'Unknown',
      isActive: user.isActive,
      skills: skills.map((s) => ({
        id: s.id,
        skillKey: s.skillKey,
        skillName: s.skillName,
        proficiency: s.proficiency,
        experienceYears: s.experienceYears,
      })),
      qualifications: certs.map((c) => ({
        id: c.id,
        certificationKey: c.certificationKey,
        name: c.name,
        issuer: c.issuer,
        issuedAt: c.issuedAt?.toISOString() ?? null,
        expiresAt: c.expiresAt?.toISOString() ?? null,
      })),
      training: training.map((t) => ({
        id: t.id,
        trainingKey: t.trainingKey,
        title: t.title,
        status: t.status,
        completedAt: t.completedAt?.toISOString() ?? null,
      })),
      jobTitle: profile?.jobTitle ?? null,
      department: profile?.department ?? null,
      sensitiveHrHidden: true,
      payrollHidden: true,
      emergencyContactHidden: true,
      hrAnalyticsHidden: true,
    };
  }

  async refreshRecommendationDrafts(
    actor: HrIntelActor,
  ): Promise<{ created: number; recommendations: HrIntelRecommendationSummary[] }> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor);
    if (!settings.recommendationDraftsEnabled) {
      throw new HrEmployeeIntelligenceError(
        'INVALID_STATE',
        'Recommendation drafts are disabled in Employee Intelligence settings.',
      );
    }

    const dashboard = await this.getDashboard(actor);
    const draftInputs = buildHrIntelRecommendationDrafts({
      skillGaps: dashboard.skillGaps,
      trainingNeeds: dashboard.trainingNeeds,
      techniciansAvailable: dashboard.workforceAvailability.techniciansAvailable,
      techniciansAssigned: dashboard.workforceAvailability.techniciansAssigned,
      openJobAssignments: dashboard.workforceAvailability.openJobAssignments,
      distinctSkillCount: dashboard.skillsOverview.length,
      activeTechnicianCount: dashboard.technicians.length,
      qualificationComplianceRows: dashboard.qualificationComplianceRows,
    });

    const created: HrIntelRecommendationSummary[] = [];
    for (const draft of draftInputs) {
      const [row] = await this.db
        .insert(heiRecommendationDrafts)
        .values({
          companyId: actor.companyId,
          kind: draft.kind,
          status: 'draft',
          title: draft.title.slice(0, 200),
          body: draft.body,
          skillKey: draft.skillKey,
          subjectUserId: draft.subjectUserId,
          autoExecuted: false,
          createdByUserId: actor.userId,
        })
        .returning();
      created.push(this.toRecommendation(row));
      await this.recordAudit(actor, 'hei_recommendation_draft_created', row.id, {
        kind: row.kind,
        autoExecuted: false,
      });
    }

    return { created: created.length, recommendations: created };
  }

  async decideRecommendation(
    actor: HrIntelActor,
    recommendationId: string,
    input: DecideHrIntelRecommendationRequest,
  ): Promise<HrIntelRecommendationSummary> {
    this.assertWrite(actor);
    const existing = await this.db.query.heiRecommendationDrafts.findFirst({
      where: and(
        eq(heiRecommendationDrafts.id, recommendationId),
        eq(heiRecommendationDrafts.companyId, actor.companyId),
      ),
    });
    if (!existing) {
      throw new HrEmployeeIntelligenceError('NOT_FOUND', 'Recommendation draft not found.');
    }
    if (existing.status !== 'draft') {
      throw new HrEmployeeIntelligenceError(
        'INVALID_STATE',
        `Recommendation is already ${existing.status}.`,
      );
    }
    const nextStatus = input.decision === 'acknowledge' ? 'acknowledged' : 'dismissed';
    const [updated] = await this.db
      .update(heiRecommendationDrafts)
      .set({
        status: nextStatus,
        autoExecuted: false,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(heiRecommendationDrafts.id, recommendationId),
          eq(heiRecommendationDrafts.companyId, actor.companyId),
        ),
      )
      .returning();

    await this.recordAudit(actor, `hei_recommendation_${nextStatus}`, updated.id, {
      decision: input.decision,
      autoExecuted: false,
      hrActionExecuted: false,
    });
    return this.toRecommendation(updated);
  }

  async updateSettings(
    actor: HrIntelActor,
    input: UpdateHrIntelSettingsRequest,
  ): Promise<HrIntelSettings> {
    this.assertManageSettings(actor);
    await this.ensureSettings(actor);
    const patch: Partial<typeof heiSettings.$inferInsert> = {
      autoPayrollMutationEnabled: false,
      inventEmployeesEnabled: false,
      autoHrActionsEnabled: false,
      updatedByUserId: actor.userId,
      updatedAt: new Date(),
    };
    if (input.insightsEnabled !== undefined) patch.insightsEnabled = input.insightsEnabled;
    if (input.selfViewEnabled !== undefined) patch.selfViewEnabled = input.selfViewEnabled;
    if (input.recommendationDraftsEnabled !== undefined) {
      patch.recommendationDraftsEnabled = input.recommendationDraftsEnabled;
    }
    if (input.notes !== undefined) patch.notes = input.notes;

    const [updated] = await this.db
      .update(heiSettings)
      .set(patch)
      .where(eq(heiSettings.companyId, actor.companyId))
      .returning();
    if (!updated) {
      throw new HrEmployeeIntelligenceError('NOT_FOUND', 'Settings not found for this tenant.');
    }
    await this.recordAudit(actor, 'hei_settings_updated', updated.id, {
      insightsEnabled: updated.insightsEnabled,
      selfViewEnabled: updated.selfViewEnabled,
      recommendationDraftsEnabled: updated.recommendationDraftsEnabled,
    });
    return this.toSettings(updated);
  }

  async createAuraInsight(
    actor: HrIntelActor,
    input: CreateHrIntelAuraInsightRequest,
  ): Promise<HrIntelAuraInsightSummary> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor);
    if (!settings.insightsEnabled) {
      throw new HrEmployeeIntelligenceError(
        'INVALID_STATE',
        'AURA insights are disabled in Employee Intelligence settings.',
      );
    }
    if (input.subjectUserId) {
      const subject = await this.db.query.users.findFirst({
        where: and(eq(users.companyId, actor.companyId), eq(users.id, input.subjectUserId)),
      });
      if (!subject) {
        throw new HrEmployeeIntelligenceError('NOT_FOUND', 'Subject user not found in this tenant.');
      }
    }
    const [created] = await this.db
      .insert(heiAuraInsights)
      .values({
        companyId: actor.companyId,
        target: input.target,
        status: 'open',
        title: input.title,
        insight: input.insight,
        href: input.href ?? null,
        subjectUserId: input.subjectUserId ?? null,
        createdByUserId: actor.userId,
      })
      .returning();
    await this.recordAudit(actor, 'hei_aura_insight_created', created.id, {
      target: created.target,
      subjectUserId: created.subjectUserId,
    });
    return this.toInsight(created);
  }

  async acknowledgeInsight(
    actor: HrIntelActor,
    insightId: string,
    input: AcknowledgeHrIntelInsightRequest,
  ): Promise<HrIntelAuraInsightSummary> {
    this.assertWrite(actor);
    const existing = await this.db.query.heiAuraInsights.findFirst({
      where: and(eq(heiAuraInsights.id, insightId), eq(heiAuraInsights.companyId, actor.companyId)),
    });
    if (!existing) {
      throw new HrEmployeeIntelligenceError('NOT_FOUND', 'Insight not found.');
    }
    if (existing.status !== 'open') {
      throw new HrEmployeeIntelligenceError('INVALID_STATE', `Insight is already ${existing.status}.`);
    }
    const [updated] = await this.db
      .update(heiAuraInsights)
      .set({
        status: input.status,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(heiAuraInsights.id, insightId), eq(heiAuraInsights.companyId, actor.companyId)))
      .returning();
    await this.recordAudit(actor, `hei_aura_insight_${input.status}`, updated.id, {
      previousStatus: existing.status,
      status: updated.status,
    });
    return this.toInsight(updated);
  }
}
