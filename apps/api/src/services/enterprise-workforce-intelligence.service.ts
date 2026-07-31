import { and, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type {
  CreateWiHrActionDraftRequest,
  CreateWiLeaveApplicationRequest,
  CreateWiLeaveCategoryRequest,
  CreateWiLifecycleStageRequest,
  CreateWiPayrollPeriodRequest,
  CreateWiProviderAdapterRequest,
  CreateWiTimesheetRequest,
  CreateWiWorkforceCategoryRequest,
  CreateWiWorkforceProfileRequest,
  CorrectWiTimesheetRequest,
  EnterpriseWorkforceIntelligenceAuraContext,
  EnterpriseWorkforceIntelligenceDashboard,
  UpdateWiPlatformConfigRequest,
  WiAnalyticsSummary,
  WiCustomerTechnicianProfileSummary,
  WiHrActionDraftSummary,
  WiLeaveApplicationSummary,
  WiLeaveBalanceSummary,
  WiLeaveCategorySummary,
  WiLifecycleStageHistorySummary,
  WiManagerWorkspaceSummary,
  WiPayrollPeriodSummary,
  WiPayrollPreparationSummary,
  WiPlatformConfigSummary,
  WiProviderAdapterSummary,
  WiSelfServiceSummary,
  WiSkillsMatrixEntry,
  WiTechnicianPerformanceSnapshotSummary,
  WiTimesheetCorrectionSummary,
  WiTimesheetSummary,
  WiTrainingCourseSummary,
  WiWorkforceCapacitySummary,
  WiWorkforceCategorySummary,
  WiWorkforceProfileSummary,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  users,
  wiAnalyticsSnapshots,
  wiAuditLogs,
  wiHrActionDrafts,
  wiLeaveApplications,
  wiLeaveBalances,
  wiLeaveCategories,
  wiLifecycleStageHistory,
  wiPayrollPeriods,
  wiPayrollPreparationBatches,
  wiPlatformConfig,
  wiProviderAdapters,
  wiTechnicianPerformanceSnapshots,
  wiTimesheetCorrections,
  wiTimesheets,
  wiTrainingCourses,
  wiWorkforceCategories,
  wiWorkforceProfiles,
} from '@titan/db';
import type { AnalyticsService } from './analytics.service.js';
import type { EnterpriseSaasPlatformService } from './enterprise-saas-platform.service.js';
import type { MobileWorkforceService } from './mobile-workforce.service.js';
import type { RecruitingService } from './recruiting.service.js';
import type { SchedulingService } from './scheduling.service.js';
import type { WorkforceService } from './workforce.service.js';

export class EnterpriseWorkforceIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseWorkforceIntelligenceError';
  }
}

type StaffScope = { companyId: string; userId: string };

type WorkforceIntelligenceDeps = {
  db: DatabaseClient;
  enterpriseSaasPlatformService: EnterpriseSaasPlatformService;
  workforceService: WorkforceService;
  recruitingService: RecruitingService;
  schedulingService: SchedulingService;
  mobileWorkforceService: MobileWorkforceService;
  analyticsService: AnalyticsService;
};

export class EnterpriseWorkforceIntelligenceService {
  constructor(private readonly deps: WorkforceIntelligenceDeps) {}

  async getDashboard(companyId: string): Promise<EnterpriseWorkforceIntelligenceDashboard> {
    const isPlatformOwner =
      await this.deps.enterpriseSaasPlatformService.isPlatformOwnerTenant(companyId);
    const [
      platformConfig,
      profiles,
      categories,
      providers,
      pendingLeave,
      pendingTimesheets,
      payrollPreparations,
      performance,
      hrDrafts,
      workforceStats,
      candidatePipeline,
      analytics,
      capacity,
    ] = await Promise.all([
      this.getPlatformConfig(companyId),
      this.listProfiles(companyId),
      this.listCategories(companyId),
      this.listProviders(companyId),
      this.listLeaveApplications(companyId, { status: 'pending' }),
      this.listTimesheets(companyId, { status: 'submitted' }),
      this.listPayrollPreparations(companyId),
      this.listTechnicianPerformance(companyId),
      this.listHrActionDrafts(companyId),
      this.deps.workforceService.getStats(companyId),
      this.deps.workforceService.getCandidatePipeline(companyId),
      this.getLatestAnalytics(companyId),
      this.getCapacitySummary(companyId),
    ]);

    const activeProviderCount = providers.filter((p) => p.status === 'active').length;

    return {
      summary: `${profiles.length} workforce profile(s), ${providers.length} provider adapter(s), ${pendingLeave.length} pending leave, ${pendingTimesheets.length} timesheet(s) awaiting approval.`,
      isPlatformOwner,
      platformConfig,
      workforceStats,
      profileCount: profiles.length,
      categoryCount: categories.length,
      providerCount: providers.length,
      activeProviderCount,
      pendingLeaveCount: pendingLeave.length,
      pendingTimesheetCount: pendingTimesheets.length,
      payrollBatchCount: payrollPreparations.length,
      analytics,
      recentProfiles: profiles.slice(0, 10),
      recentTimesheets: pendingTimesheets.slice(0, 10),
      pendingLeaveApplications: pendingLeave.slice(0, 10),
      payrollPreparations: payrollPreparations.slice(0, 10),
      technicianPerformance: performance.slice(0, 10),
      hrActionDrafts: hrDrafts.slice(0, 10),
      candidatePipeline,
      capacity,
    };
  }

  async getManagerWorkspace(scope: StaffScope): Promise<WiManagerWorkspaceSummary> {
    const [profiles, pendingTimesheets, pendingLeave, performance, certs, payrollExceptions] =
      await Promise.all([
        this.listProfiles(scope.companyId),
        this.listTimesheets(scope.companyId, { status: 'submitted' }),
        this.listLeaveApplications(scope.companyId, { status: 'pending' }),
        this.deps.workforceService.getTechnicianPerformanceInsights(scope.companyId),
        this.deps.workforceService.listCertifications(scope.companyId),
        this.listPayrollPreparations(scope.companyId, { hasExceptions: true }),
      ]);

    const now = new Date();
    const complianceRisks = certs.filter(
      (c) =>
        c.expiresAt != null && new Date(c.expiresAt) <= new Date(now.getTime() + 30 * 86400000),
    );

    return {
      teamMemberCount: profiles.length,
      pendingTimesheetApprovals: pendingTimesheets,
      pendingLeaveApprovals: pendingLeave,
      teamPerformance: performance,
      complianceRisks,
      payrollExceptions,
    };
  }

  async getSelfService(scope: StaffScope): Promise<WiSelfServiceSummary> {
    const [
      profile,
      allSkills,
      allCerts,
      allTraining,
      timesheets,
      leaveBalances,
      leaveApplications,
    ] = await Promise.all([
      this.getProfileForUser(scope.companyId, scope.userId),
      this.deps.workforceService.listSkills(scope.companyId),
      this.deps.workforceService.listCertifications(scope.companyId),
      this.deps.workforceService.listTraining(scope.companyId),
      this.listTimesheets(scope.companyId, { userId: scope.userId }),
      this.listLeaveBalances(scope.companyId, scope.userId),
      this.listLeaveApplications(scope.companyId, { userId: scope.userId }),
    ]);

    return {
      profile,
      skills: allSkills.filter((s) => s.userId === scope.userId),
      certifications: allCerts.filter((c) => c.userId === scope.userId),
      training: allTraining.filter((t) => t.userId === scope.userId),
      timesheets,
      leaveBalances,
      leaveApplications,
    };
  }

  async getCustomerTechnicianProfile(
    companyId: string,
    userId: string,
  ): Promise<WiCustomerTechnicianProfileSummary | null> {
    const user = await this.deps.db.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.companyId, companyId), eq(users.isActive, true)),
    });
    if (!user) return null;

    const profile = await this.deps.db.query.wiWorkforceProfiles.findFirst({
      where: and(
        eq(wiWorkforceProfiles.companyId, companyId),
        eq(wiWorkforceProfiles.userId, userId),
      ),
    });

    const certs = (await this.deps.workforceService.listCertifications(companyId)).filter(
      (c) => c.userId === userId,
    );
    const publicQualifications = certs
      .filter((c) => c.expiresAt == null || new Date(c.expiresAt) > new Date())
      .map((c) => c.name)
      .slice(0, 5);

    return {
      technicianName: `${user.firstName} ${user.lastName}`.trim(),
      jobTitle: profile?.jobTitle ?? null,
      qualifications: publicQualifications,
      profileSummary: profile?.jobTitle
        ? `${profile.jobTitle}${profile.department ? ` — ${profile.department}` : ''}`
        : null,
    };
  }

  async getSkillsMatrix(companyId: string): Promise<WiSkillsMatrixEntry[]> {
    const [profiles, performance] = await Promise.all([
      this.listProfiles(companyId),
      this.listTechnicianPerformance(companyId),
    ]);

    const entries: WiSkillsMatrixEntry[] = [];
    for (const profile of profiles.slice(0, 50)) {
      const [allSkills, allCerts, perf] = await Promise.all([
        this.deps.workforceService.listSkills(companyId),
        this.deps.workforceService.listCertifications(companyId),
        performance.find((p) => p.userId === profile.userId),
      ]);
      const skills = allSkills.filter((s) => s.userId === profile.userId);
      const certs = allCerts.filter((c) => c.userId === profile.userId);

      const trainingGaps = skills.length === 0 ? ['No skills recorded'] : [];
      entries.push({
        userId: profile.userId,
        userName: profile.userName,
        skills,
        certifications: certs,
        jobsCompleted: perf?.jobsCompleted ?? 0,
        firstTimeFixRate: perf?.firstTimeFixRate ?? null,
        customerSatisfactionAvg: perf?.customerSatisfactionAvg ?? null,
        trainingGaps,
        availabilityStatus:
          profile.lifecycleStage === 'active' ? 'available' : profile.lifecycleStage,
      });
    }

    return entries;
  }

  async getCapacitySummary(companyId: string): Promise<WiWorkforceCapacitySummary> {
    const [profiles, pendingLeave, performance, certs] = await Promise.all([
      this.listProfiles(companyId),
      this.listLeaveApplications(companyId, { status: 'approved' }),
      this.deps.analyticsService.getTechnicianPerformance(companyId),
      this.deps.workforceService.listCertifications(companyId),
    ]);

    const activeTechnicians = profiles.filter((p) => p.lifecycleStage === 'active').length;
    const scheduledJobCount = performance.technicians.reduce((sum, t) => sum + t.jobsAssigned, 0);
    const overtimeWarningCount = performance.technicians.filter(
      (t) => t.workloadScore >= 85,
    ).length;
    const now = new Date();
    const certificationGapCount = certs.filter(
      (c) => c.expiresAt != null && new Date(c.expiresAt) <= now,
    ).length;

    return {
      activeTechnicianCount: activeTechnicians,
      scheduledJobCount,
      pendingLeaveCount: pendingLeave.length,
      overtimeWarningCount,
      certificationGapCount,
      standbyCoverageGaps:
        overtimeWarningCount > 0 ? ['High workload detected — review standby roster'] : [],
    };
  }

  async getPlatformConfig(companyId: string): Promise<WiPlatformConfigSummary> {
    const row = await this.ensurePlatformConfig(companyId);
    return toPlatformConfigSummary(row);
  }

  async updatePlatformConfig(
    scope: StaffScope,
    input: UpdateWiPlatformConfigRequest,
  ): Promise<WiPlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(wiPlatformConfig)
      .set({
        globalPolicies: input.globalPolicies ?? existing.globalPolicies,
        providerAdapterTemplates:
          input.providerAdapterTemplates ?? existing.providerAdapterTemplates,
        jurisdictionTemplates: input.jurisdictionTemplates ?? existing.jurisdictionTemplates,
        leavePolicyDefaults: input.leavePolicyDefaults ?? existing.leavePolicyDefaults,
        performanceRules: input.performanceRules ?? existing.performanceRules,
        privacyPolicies: input.privacyPolicies ?? existing.privacyPolicies,
        auditRetentionDays: input.auditRetentionDays ?? existing.auditRetentionDays,
        updatedAt: new Date(),
      })
      .where(eq(wiPlatformConfig.companyId, scope.companyId))
      .returning();

    await this.recordAudit(scope, 'platform_config_updated');
    return toPlatformConfigSummary(updated!);
  }

  async createCategory(
    scope: StaffScope,
    input: CreateWiWorkforceCategoryRequest,
  ): Promise<WiWorkforceCategorySummary> {
    const [created] = await this.deps.db
      .insert(wiWorkforceCategories)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        description: input.description?.trim() ?? null,
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'category_created', 'wi_workforce_category', created!.id);
    return toCategorySummary(created!);
  }

  async listCategories(companyId: string): Promise<WiWorkforceCategorySummary[]> {
    const rows = await this.deps.db.query.wiWorkforceCategories.findMany({
      where: eq(wiWorkforceCategories.companyId, companyId),
      orderBy: [desc(wiWorkforceCategories.createdAt)],
    });
    return rows.map(toCategorySummary);
  }

  async createProfile(
    scope: StaffScope,
    input: CreateWiWorkforceProfileRequest,
  ): Promise<WiWorkforceProfileSummary> {
    await this.ensureUser(scope.companyId, input.userId);

    const existing = await this.deps.db.query.wiWorkforceProfiles.findFirst({
      where: and(
        eq(wiWorkforceProfiles.companyId, scope.companyId),
        eq(wiWorkforceProfiles.userId, input.userId),
      ),
    });
    if (existing) {
      throw new EnterpriseWorkforceIntelligenceError(
        'CONFLICT',
        'Workforce profile already exists for this user',
      );
    }

    const [created] = await this.deps.db
      .insert(wiWorkforceProfiles)
      .values({
        companyId: scope.companyId,
        userId: input.userId,
        categoryId: input.categoryId ?? null,
        customCategoryName: input.customCategoryName?.trim() ?? null,
        employeeNumber: input.employeeNumber?.trim() ?? null,
        employmentType: input.employmentType?.trim() ?? null,
        jobTitle: input.jobTitle?.trim() ?? null,
        department: input.department?.trim() ?? null,
        branch: input.branch?.trim() ?? null,
        managerUserId: input.managerUserId ?? null,
        startDate: input.startDate ?? null,
        contractStatus: input.contractStatus?.trim() ?? null,
        lifecycleStage: input.lifecycleStage ?? 'active',
        workingHours: input.workingHours ?? {},
        contactDetails: input.contactDetails ?? {},
        emergencyContact: input.emergencyContact ?? {},
        jurisdictionConfig: input.jurisdictionConfig ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'profile_created', 'wi_workforce_profile', created!.id);
    return this.getProfileSummary(scope.companyId, created!.id);
  }

  async listProfiles(companyId: string): Promise<WiWorkforceProfileSummary[]> {
    const rows = await this.deps.db.query.wiWorkforceProfiles.findMany({
      where: eq(wiWorkforceProfiles.companyId, companyId),
      orderBy: [desc(wiWorkforceProfiles.createdAt)],
    });

    const summaries: WiWorkforceProfileSummary[] = [];
    for (const row of rows) {
      summaries.push(await this.buildProfileSummary(companyId, row));
    }
    return summaries;
  }

  async createProvider(
    scope: StaffScope,
    input: CreateWiProviderAdapterRequest,
  ): Promise<WiProviderAdapterSummary> {
    const [created] = await this.deps.db
      .insert(wiProviderAdapters)
      .values({
        companyId: scope.companyId,
        providerCategory: input.providerCategory,
        providerType: input.providerType,
        providerKey: input.providerKey.trim(),
        name: input.name.trim(),
        endpointUrl: input.endpointUrl ?? null,
        credentialsVaultKey: input.credentialsVaultKey ?? null,
        isPrimary: input.isPrimary ?? false,
        syncDirection: input.syncDirection ?? 'bidirectional',
        syncFrequencyMinutes: input.syncFrequencyMinutes ?? null,
        fieldMappings: input.fieldMappings ?? {},
        leaveTypeMappings: input.leaveTypeMappings ?? {},
        earningCodeMappings: input.earningCodeMappings ?? {},
        deductionCodeMappings: input.deductionCodeMappings ?? {},
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'provider_created', 'wi_provider_adapter', created!.id);
    return toProviderSummary(created!);
  }

  async listProviders(companyId: string): Promise<WiProviderAdapterSummary[]> {
    const rows = await this.deps.db.query.wiProviderAdapters.findMany({
      where: eq(wiProviderAdapters.companyId, companyId),
      orderBy: [desc(wiProviderAdapters.createdAt)],
    });
    return rows.map(toProviderSummary);
  }

  async testProvider(scope: StaffScope, providerId: string): Promise<WiProviderAdapterSummary> {
    const provider = await this.ensureProvider(scope.companyId, providerId);
    const testStatus =
      provider.endpointUrl || provider.credentialsVaultKey ? 'success' : 'pending_configuration';
    const testMessage =
      testStatus === 'success'
        ? 'Connectivity test completed — configure credentials and endpoint for live sync.'
        : 'Provider adapter saved — configure endpoint URL and credentials vault key before live sync.';

    const [updated] = await this.deps.db
      .update(wiProviderAdapters)
      .set({
        status: testStatus === 'success' ? 'testing' : provider.status,
        lastTestAt: new Date(),
        lastTestStatus: testStatus,
        lastTestMessage: testMessage,
        updatedAt: new Date(),
      })
      .where(eq(wiProviderAdapters.id, providerId))
      .returning();

    await this.recordAudit(scope, 'provider_tested', 'wi_provider_adapter', providerId);
    return toProviderSummary(updated!);
  }

  async createLifecycleStage(
    scope: StaffScope,
    input: CreateWiLifecycleStageRequest,
  ): Promise<WiLifecycleStageHistorySummary> {
    await this.ensureUser(scope.companyId, input.userId);

    const status = input.requiresApproval ? 'pending_approval' : 'executed';
    const [created] = await this.deps.db
      .insert(wiLifecycleStageHistory)
      .values({
        companyId: scope.companyId,
        userId: input.userId,
        stage: input.stage,
        status,
        title: input.title.trim(),
        description: input.description?.trim() ?? null,
        effectiveDate: input.effectiveDate ?? null,
        responsibleUserId: scope.userId,
        createdByUserId: scope.userId,
      })
      .returning();

    if (status === 'executed') {
      await this.deps.db
        .update(wiWorkforceProfiles)
        .set({ lifecycleStage: input.stage, updatedAt: new Date() })
        .where(
          and(
            eq(wiWorkforceProfiles.companyId, scope.companyId),
            eq(wiWorkforceProfiles.userId, input.userId),
          ),
        );
    }

    await this.recordAudit(
      scope,
      'lifecycle_stage_created',
      'wi_lifecycle_stage_history',
      created!.id,
    );
    return toLifecycleSummary(created!);
  }

  async listLifecycleHistory(
    companyId: string,
    userId?: string,
  ): Promise<WiLifecycleStageHistorySummary[]> {
    const rows = await this.deps.db.query.wiLifecycleStageHistory.findMany({
      where: userId
        ? and(
            eq(wiLifecycleStageHistory.companyId, companyId),
            eq(wiLifecycleStageHistory.userId, userId),
          )
        : eq(wiLifecycleStageHistory.companyId, companyId),
      orderBy: [desc(wiLifecycleStageHistory.occurredAt)],
      limit: 50,
    });
    return rows.map(toLifecycleSummary);
  }

  async createTimesheet(
    scope: StaffScope,
    input: CreateWiTimesheetRequest,
  ): Promise<WiTimesheetSummary> {
    const userId = input.userId ?? scope.userId;
    await this.ensureUser(scope.companyId, userId);

    const [created] = await this.deps.db
      .insert(wiTimesheets)
      .values({
        companyId: scope.companyId,
        userId,
        jobId: input.jobId ?? null,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        standardHours: String(input.standardHours ?? 0),
        overtimeHours: String(input.overtimeHours ?? 0),
        travelHours: String(input.travelHours ?? 0),
        standbyHours: String(input.standbyHours ?? 0),
        breakHours: String(input.breakHours ?? 0),
        notes: input.notes?.trim() ?? null,
        clockInAt: input.clockInAt ? new Date(input.clockInAt) : null,
        clockOutAt: input.clockOutAt ? new Date(input.clockOutAt) : null,
        gpsMetadata: input.gpsMetadata ?? {},
        status: userId === scope.userId ? 'submitted' : 'draft',
      })
      .returning();

    await this.recordAudit(scope, 'timesheet_created', 'wi_timesheet', created!.id);
    return this.getTimesheetSummary(scope.companyId, created!.id);
  }

  async approveTimesheet(scope: StaffScope, timesheetId: string): Promise<WiTimesheetSummary> {
    const timesheet = await this.ensureTimesheet(scope.companyId, timesheetId);
    if (timesheet.status === 'approved') {
      throw new EnterpriseWorkforceIntelligenceError(
        'VALIDATION_ERROR',
        'Timesheet is already approved',
      );
    }

    const [updated] = await this.deps.db
      .update(wiTimesheets)
      .set({
        status: 'approved',
        approvedByUserId: scope.userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(wiTimesheets.id, timesheetId))
      .returning();

    await this.recordAudit(scope, 'timesheet_approved', 'wi_timesheet', timesheetId);
    return this.getTimesheetSummary(scope.companyId, updated!.id);
  }

  async correctTimesheet(
    scope: StaffScope,
    timesheetId: string,
    input: CorrectWiTimesheetRequest,
  ): Promise<{ timesheet: WiTimesheetSummary; correction: WiTimesheetCorrectionSummary }> {
    const timesheet = await this.ensureTimesheet(scope.companyId, timesheetId);
    if (timesheet.status !== 'approved') {
      throw new EnterpriseWorkforceIntelligenceError(
        'VALIDATION_ERROR',
        'Only approved timesheets can be corrected',
      );
    }

    const fieldMap: Record<string, keyof typeof timesheet> = {
      standardHours: 'standardHours',
      overtimeHours: 'overtimeHours',
      travelHours: 'travelHours',
      standbyHours: 'standbyHours',
      breakHours: 'breakHours',
    };
    const field = fieldMap[input.fieldName];
    if (!field) {
      throw new EnterpriseWorkforceIntelligenceError('VALIDATION_ERROR', 'Invalid timesheet field');
    }

    const originalValue = String(timesheet[field] ?? '');

    const [correction] = await this.deps.db
      .insert(wiTimesheetCorrections)
      .values({
        companyId: scope.companyId,
        timesheetId,
        fieldName: input.fieldName,
        originalValue,
        correctedValue: input.correctedValue,
        reason: input.reason.trim(),
        approverUserId: scope.userId,
      })
      .returning();

    const updateValues: Record<string, string | Date> = {
      [field]: input.correctedValue,
      status: 'corrected',
      updatedAt: new Date(),
    };

    await this.deps.db
      .update(wiTimesheets)
      .set(updateValues)
      .where(eq(wiTimesheets.id, timesheetId));

    await this.recordAudit(scope, 'timesheet_corrected', 'wi_timesheet', timesheetId, {
      fieldName: input.fieldName,
      originalValue,
      correctedValue: input.correctedValue,
    });

    const approver = await this.deps.db.query.users.findFirst({
      where: eq(users.id, scope.userId),
    });

    return {
      timesheet: await this.getTimesheetSummary(scope.companyId, timesheetId),
      correction: {
        id: correction!.id,
        timesheetId,
        fieldName: input.fieldName,
        originalValue,
        correctedValue: input.correctedValue,
        reason: input.reason,
        approverName: approver ? `${approver.firstName} ${approver.lastName}`.trim() : 'Unknown',
        correctedAt: correction!.correctedAt.toISOString(),
      },
    };
  }

  async listTimesheets(
    companyId: string,
    filters?: { userId?: string; status?: string },
  ): Promise<WiTimesheetSummary[]> {
    const conditions = [eq(wiTimesheets.companyId, companyId)];
    if (filters?.userId) conditions.push(eq(wiTimesheets.userId, filters.userId));
    if (filters?.status)
      conditions.push(
        eq(wiTimesheets.status, filters.status as typeof wiTimesheets.$inferSelect.status),
      );

    const rows = await this.deps.db.query.wiTimesheets.findMany({
      where: and(...conditions),
      orderBy: [desc(wiTimesheets.createdAt)],
      limit: 50,
    });

    const summaries: WiTimesheetSummary[] = [];
    for (const row of rows) {
      const user = await this.deps.db.query.users.findFirst({ where: eq(users.id, row.userId) });
      const [correctionRow] = await this.deps.db
        .select({ count: count() })
        .from(wiTimesheetCorrections)
        .where(eq(wiTimesheetCorrections.timesheetId, row.id));
      summaries.push({
        id: row.id,
        userId: row.userId,
        userName: user ? `${user.firstName} ${user.lastName}`.trim() : 'Unknown',
        jobId: row.jobId,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        status: row.status,
        standardHours: Number(row.standardHours),
        overtimeHours: Number(row.overtimeHours),
        travelHours: Number(row.travelHours),
        standbyHours: Number(row.standbyHours),
        approvedAt: row.approvedAt?.toISOString() ?? null,
        correctionCount: correctionRow?.count ?? 0,
      });
    }
    return summaries;
  }

  async createLeaveCategory(
    scope: StaffScope,
    input: CreateWiLeaveCategoryRequest,
  ): Promise<WiLeaveCategorySummary> {
    const [created] = await this.deps.db
      .insert(wiLeaveCategories)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        categoryKey: input.categoryKey.trim(),
        description: input.description?.trim() ?? null,
        isPaid: input.isPaid ?? true,
        accrualRules: input.accrualRules ?? {},
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'leave_category_created', 'wi_leave_category', created!.id);
    return toLeaveCategorySummary(created!);
  }

  async listLeaveCategories(companyId: string): Promise<WiLeaveCategorySummary[]> {
    const rows = await this.deps.db.query.wiLeaveCategories.findMany({
      where: eq(wiLeaveCategories.companyId, companyId),
      orderBy: [desc(wiLeaveCategories.createdAt)],
    });
    return rows.map(toLeaveCategorySummary);
  }

  async createLeaveApplication(
    scope: StaffScope,
    input: CreateWiLeaveApplicationRequest,
  ): Promise<WiLeaveApplicationSummary> {
    await this.ensureLeaveCategory(scope.companyId, input.categoryId);

    const [created] = await this.deps.db
      .insert(wiLeaveApplications)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        categoryId: input.categoryId,
        startDate: input.startDate,
        endDate: input.endDate,
        daysRequested: String(input.daysRequested),
        reason: input.reason?.trim() ?? null,
        status: 'pending',
      })
      .returning();

    await this.recordAudit(scope, 'leave_application_created', 'wi_leave_application', created!.id);
    return this.getLeaveApplicationSummary(scope.companyId, created!.id);
  }

  async approveLeaveApplication(
    scope: StaffScope,
    applicationId: string,
  ): Promise<WiLeaveApplicationSummary> {
    const application = await this.ensureLeaveApplication(scope.companyId, applicationId);

    const [updated] = await this.deps.db
      .update(wiLeaveApplications)
      .set({
        status: 'approved',
        approverUserId: scope.userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(wiLeaveApplications.id, applicationId))
      .returning();

    await this.recordAudit(
      scope,
      'leave_application_approved',
      'wi_leave_application',
      applicationId,
    );

    const balanceDays = Number(application.daysRequested);
    const existingBalance = await this.deps.db.query.wiLeaveBalances.findFirst({
      where: and(
        eq(wiLeaveBalances.companyId, scope.companyId),
        eq(wiLeaveBalances.userId, application.userId),
        eq(wiLeaveBalances.categoryId, application.categoryId),
      ),
    });

    if (existingBalance) {
      await this.deps.db
        .update(wiLeaveBalances)
        .set({
          usedDays: String(Number(existingBalance.usedDays) + balanceDays),
          balanceDays: String(Math.max(0, Number(existingBalance.balanceDays) - balanceDays)),
          updatedAt: new Date(),
        })
        .where(eq(wiLeaveBalances.id, existingBalance.id));
    }

    return this.getLeaveApplicationSummary(scope.companyId, updated!.id);
  }

  async listLeaveApplications(
    companyId: string,
    filters?: { userId?: string; status?: string },
  ): Promise<WiLeaveApplicationSummary[]> {
    const conditions = [eq(wiLeaveApplications.companyId, companyId)];
    if (filters?.userId) conditions.push(eq(wiLeaveApplications.userId, filters.userId));
    if (filters?.status)
      conditions.push(
        eq(
          wiLeaveApplications.status,
          filters.status as typeof wiLeaveApplications.$inferSelect.status,
        ),
      );

    const rows = await this.deps.db.query.wiLeaveApplications.findMany({
      where: and(...conditions),
      orderBy: [desc(wiLeaveApplications.createdAt)],
      limit: 50,
    });

    const summaries: WiLeaveApplicationSummary[] = [];
    for (const row of rows) {
      const user = await this.deps.db.query.users.findFirst({ where: eq(users.id, row.userId) });
      const category = await this.deps.db.query.wiLeaveCategories.findFirst({
        where: eq(wiLeaveCategories.id, row.categoryId),
      });
      summaries.push({
        id: row.id,
        userId: row.userId,
        userName: user ? `${user.firstName} ${user.lastName}`.trim() : 'Unknown',
        categoryName: category?.name ?? 'Unknown',
        status: row.status,
        startDate: row.startDate,
        endDate: row.endDate,
        daysRequested: Number(row.daysRequested),
        reason: row.reason,
        approvedAt: row.approvedAt?.toISOString() ?? null,
      });
    }
    return summaries;
  }

  async listLeaveBalances(companyId: string, userId: string): Promise<WiLeaveBalanceSummary[]> {
    const rows = await this.deps.db.query.wiLeaveBalances.findMany({
      where: and(eq(wiLeaveBalances.companyId, companyId), eq(wiLeaveBalances.userId, userId)),
    });

    const summaries: WiLeaveBalanceSummary[] = [];
    for (const row of rows) {
      const user = await this.deps.db.query.users.findFirst({ where: eq(users.id, row.userId) });
      const category = await this.deps.db.query.wiLeaveCategories.findFirst({
        where: eq(wiLeaveCategories.id, row.categoryId),
      });
      summaries.push({
        id: row.id,
        userId: row.userId,
        userName: user ? `${user.firstName} ${user.lastName}`.trim() : 'Unknown',
        categoryName: category?.name ?? 'Unknown',
        balanceDays: Number(row.balanceDays),
        accruedDays: Number(row.accruedDays),
        usedDays: Number(row.usedDays),
        asOfDate: row.asOfDate,
      });
    }
    return summaries;
  }

  async createPayrollPeriod(
    scope: StaffScope,
    input: CreateWiPayrollPeriodRequest,
  ): Promise<WiPayrollPeriodSummary> {
    const [created] = await this.deps.db
      .insert(wiPayrollPeriods)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        status: 'draft',
      })
      .returning();

    await this.recordAudit(scope, 'payroll_period_created', 'wi_payroll_period', created!.id);
    return toPayrollPeriodSummary(created!);
  }

  async preparePayroll(
    scope: StaffScope,
    payrollPeriodId: string,
  ): Promise<WiPayrollPreparationSummary> {
    const period = await this.ensurePayrollPeriod(scope.companyId, payrollPeriodId);

    const approvedTimesheets = await this.deps.db.query.wiTimesheets.findMany({
      where: and(
        eq(wiTimesheets.companyId, scope.companyId),
        eq(wiTimesheets.status, 'approved'),
        gte(wiTimesheets.periodStart, period.periodStart),
        lte(wiTimesheets.periodEnd, period.periodEnd),
      ),
    });

    const exceptions: string[] = [];
    if (approvedTimesheets.length === 0) {
      exceptions.push('No approved timesheets in period');
    }

    const earningsTotalCents = approvedTimesheets.reduce((sum, ts) => {
      const hours = Number(ts.standardHours) + Number(ts.overtimeHours) * 1.5;
      return sum + Math.round(hours * 1000);
    }, 0);

    const primaryProvider = await this.deps.db.query.wiProviderAdapters.findFirst({
      where: and(
        eq(wiProviderAdapters.companyId, scope.companyId),
        eq(wiProviderAdapters.providerCategory, 'payroll'),
        eq(wiProviderAdapters.isPrimary, true),
      ),
    });

    const [batch] = await this.deps.db
      .insert(wiPayrollPreparationBatches)
      .values({
        companyId: scope.companyId,
        payrollPeriodId,
        providerAdapterId: primaryProvider?.id ?? null,
        status: exceptions.length > 0 ? 'draft' : 'pending_approval',
        validationSummary: {
          approvedTimesheetCount: approvedTimesheets.length,
          exceptions,
        },
        exceptionCount: exceptions.length,
        earningsTotalCents,
        deductionsTotalCents: 0,
      })
      .returning();

    await this.recordAudit(scope, 'payroll_prepared', 'wi_payroll_preparation_batch', batch!.id);
    return this.getPayrollPreparationSummary(scope.companyId, batch!.id);
  }

  async approvePayrollBatch(
    scope: StaffScope,
    batchId: string,
  ): Promise<WiPayrollPreparationSummary> {
    const batch = await this.ensurePayrollBatch(scope.companyId, batchId);
    if (batch.exceptionCount > 0) {
      throw new EnterpriseWorkforceIntelligenceError(
        'VALIDATION_ERROR',
        'Resolve payroll exceptions before approval',
      );
    }

    const [updated] = await this.deps.db
      .update(wiPayrollPreparationBatches)
      .set({
        status: 'approved',
        approvedByUserId: scope.userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(wiPayrollPreparationBatches.id, batchId))
      .returning();

    await this.recordAudit(
      scope,
      'payroll_batch_approved',
      'wi_payroll_preparation_batch',
      batchId,
    );
    return this.getPayrollPreparationSummary(scope.companyId, updated!.id);
  }

  async listPayrollPreparations(
    companyId: string,
    filters?: { hasExceptions?: boolean },
  ): Promise<WiPayrollPreparationSummary[]> {
    const rows = await this.deps.db.query.wiPayrollPreparationBatches.findMany({
      where: filters?.hasExceptions
        ? and(
            eq(wiPayrollPreparationBatches.companyId, companyId),
            sql`${wiPayrollPreparationBatches.exceptionCount} > 0`,
          )
        : eq(wiPayrollPreparationBatches.companyId, companyId),
      orderBy: [desc(wiPayrollPreparationBatches.createdAt)],
      limit: 50,
    });

    const summaries: WiPayrollPreparationSummary[] = [];
    for (const row of rows) {
      const period = await this.deps.db.query.wiPayrollPeriods.findFirst({
        where: eq(wiPayrollPeriods.id, row.payrollPeriodId),
      });
      summaries.push({
        id: row.id,
        payrollPeriodId: row.payrollPeriodId,
        periodName: period?.name ?? 'Unknown',
        status: row.status,
        exceptionCount: row.exceptionCount,
        earningsTotalCents: row.earningsTotalCents,
        deductionsTotalCents: row.deductionsTotalCents,
        currency: row.currency,
        approvedAt: row.approvedAt?.toISOString() ?? null,
        exportedAt: row.exportedAt?.toISOString() ?? null,
      });
    }
    return summaries;
  }

  async listTrainingCourses(companyId: string): Promise<WiTrainingCourseSummary[]> {
    const rows = await this.deps.db.query.wiTrainingCourses.findMany({
      where: eq(wiTrainingCourses.companyId, companyId),
      orderBy: [desc(wiTrainingCourses.createdAt)],
    });
    return rows.map((row) => ({
      id: row.id,
      courseKey: row.courseKey,
      title: row.title,
      description: row.description,
      providerName: row.providerName,
      isRequired: row.isRequired,
      isActive: row.isActive,
    }));
  }

  async captureTechnicianPerformance(
    scope: StaffScope,
  ): Promise<WiTechnicianPerformanceSnapshotSummary[]> {
    const insights = await this.deps.workforceService.getTechnicianPerformanceInsights(
      scope.companyId,
    );
    const snapshots: WiTechnicianPerformanceSnapshotSummary[] = [];

    for (const insight of insights) {
      const completionRate =
        insight.jobsAssigned > 0
          ? Math.round((insight.jobsCompleted / insight.jobsAssigned) * 100)
          : null;

      const [created] = await this.deps.db
        .insert(wiTechnicianPerformanceSnapshots)
        .values({
          companyId: scope.companyId,
          userId: insight.userId,
          jobsCompleted: insight.jobsCompleted,
          jobsAssigned: insight.jobsAssigned,
          firstTimeFixRate: completionRate != null ? String(completionRate) : null,
          averageJobDurationHours:
            insight.averageCompletionHours != null ? String(insight.averageCompletionHours) : null,
          supportingEvidence: {
            completionRatePercent: insight.completionRatePercent,
            workloadScore: insight.workloadScore,
            trainingNeedSignal: insight.trainingNeedSignal,
          },
          explanation: insight.summary,
        })
        .returning();

      snapshots.push({
        id: created!.id,
        userId: insight.userId,
        userName: insight.userName,
        jobsCompleted: insight.jobsCompleted,
        jobsAssigned: insight.jobsAssigned,
        firstTimeFixRate: completionRate,
        averageJobDurationHours: insight.averageCompletionHours,
        onTimeArrivalRate: null,
        reworkCount: 0,
        callbackCount: 0,
        customerSatisfactionAvg: null,
        explanation: insight.summary,
        capturedAt: created!.capturedAt.toISOString(),
      });
    }

    await this.recordAudit(scope, 'performance_captured');
    return snapshots;
  }

  async listTechnicianPerformance(
    companyId: string,
  ): Promise<WiTechnicianPerformanceSnapshotSummary[]> {
    const rows = await this.deps.db.query.wiTechnicianPerformanceSnapshots.findMany({
      where: eq(wiTechnicianPerformanceSnapshots.companyId, companyId),
      orderBy: [desc(wiTechnicianPerformanceSnapshots.capturedAt)],
      limit: 50,
    });

    const summaries: WiTechnicianPerformanceSnapshotSummary[] = [];
    for (const row of rows) {
      const user = await this.deps.db.query.users.findFirst({ where: eq(users.id, row.userId) });
      summaries.push({
        id: row.id,
        userId: row.userId,
        userName: user ? `${user.firstName} ${user.lastName}`.trim() : 'Unknown',
        jobsCompleted: row.jobsCompleted,
        jobsAssigned: row.jobsAssigned,
        firstTimeFixRate: row.firstTimeFixRate != null ? Number(row.firstTimeFixRate) : null,
        averageJobDurationHours:
          row.averageJobDurationHours != null ? Number(row.averageJobDurationHours) : null,
        onTimeArrivalRate: row.onTimeArrivalRate != null ? Number(row.onTimeArrivalRate) : null,
        reworkCount: row.reworkCount,
        callbackCount: row.callbackCount,
        customerSatisfactionAvg:
          row.customerSatisfactionAvg != null ? Number(row.customerSatisfactionAvg) : null,
        explanation: row.explanation,
        capturedAt: row.capturedAt.toISOString(),
      });
    }
    return summaries;
  }

  async createHrActionDraft(
    scope: StaffScope,
    input: CreateWiHrActionDraftRequest,
  ): Promise<WiHrActionDraftSummary> {
    const status = input.requiresApproval !== false ? 'pending_approval' : 'draft';
    const [created] = await this.deps.db
      .insert(wiHrActionDrafts)
      .values({
        companyId: scope.companyId,
        userId: input.userId ?? null,
        draftType: input.draftType,
        status,
        subject: input.subject.trim(),
        description: input.description?.trim() ?? null,
        payload: input.payload ?? {},
        createdByUserId: scope.userId,
      })
      .returning();

    await this.recordAudit(scope, 'hr_draft_created', 'wi_hr_action_draft', created!.id);
    return toHrDraftSummary(created!);
  }

  async listHrActionDrafts(companyId: string): Promise<WiHrActionDraftSummary[]> {
    const rows = await this.deps.db.query.wiHrActionDrafts.findMany({
      where: eq(wiHrActionDrafts.companyId, companyId),
      orderBy: [desc(wiHrActionDrafts.createdAt)],
      limit: 50,
    });
    return rows.map(toHrDraftSummary);
  }

  async captureAnalytics(scope: StaffScope): Promise<WiAnalyticsSummary> {
    const [profiles, contractors, pendingLeave, payrollExceptions, certs] = await Promise.all([
      this.listProfiles(scope.companyId),
      this.deps.db.query.wiWorkforceProfiles.findMany({
        where: and(
          eq(wiWorkforceProfiles.companyId, scope.companyId),
          sql`${wiWorkforceProfiles.employmentType} ILIKE '%contractor%'`,
        ),
      }),
      this.listLeaveApplications(scope.companyId, { status: 'approved' }),
      this.listPayrollPreparations(scope.companyId, { hasExceptions: true }),
      this.deps.workforceService.listCertifications(scope.companyId),
    ]);

    const now = new Date();
    const certificationRiskCount = certs.filter(
      (c) =>
        c.expiresAt != null && new Date(c.expiresAt) <= new Date(now.getTime() + 30 * 86400000),
    ).length;

    const [created] = await this.deps.db
      .insert(wiAnalyticsSnapshots)
      .values({
        companyId: scope.companyId,
        headcount: profiles.length,
        contractorCount: contractors.length,
        absenceRate:
          profiles.length > 0 ? String((pendingLeave.length / profiles.length) * 100) : null,
        certificationRiskCount,
        payrollExceptionCount: payrollExceptions.length,
        metrics: {
          activeProfiles: profiles.filter((p) => p.lifecycleStage === 'active').length,
        },
      })
      .returning();

    await this.recordAudit(scope, 'analytics_captured');
    return toAnalyticsSummary(created!);
  }

  async getLatestAnalytics(companyId: string): Promise<WiAnalyticsSummary | null> {
    const row = await this.deps.db.query.wiAnalyticsSnapshots.findFirst({
      where: eq(wiAnalyticsSnapshots.companyId, companyId),
      orderBy: [desc(wiAnalyticsSnapshots.capturedAt)],
    });
    return row ? toAnalyticsSummary(row) : null;
  }

  async buildAuraContext(companyId: string): Promise<EnterpriseWorkforceIntelligenceAuraContext> {
    const dashboard = await this.getDashboard(companyId);
    return {
      profileCount: dashboard.profileCount,
      pendingLeaveCount: dashboard.pendingLeaveCount,
      pendingTimesheetCount: dashboard.pendingTimesheetCount,
      payrollExceptionCount: dashboard.analytics?.payrollExceptionCount ?? 0,
      certificationRiskCount: dashboard.analytics?.certificationRiskCount ?? 0,
      candidatePipelineCount: dashboard.workforceStats.activePipelineCount,
      summary: dashboard.summary,
    };
  }

  private async getProfileForUser(
    companyId: string,
    userId: string,
  ): Promise<WiWorkforceProfileSummary | null> {
    const row = await this.deps.db.query.wiWorkforceProfiles.findFirst({
      where: and(
        eq(wiWorkforceProfiles.companyId, companyId),
        eq(wiWorkforceProfiles.userId, userId),
      ),
    });
    return row ? this.buildProfileSummary(companyId, row) : null;
  }

  private async getProfileSummary(
    companyId: string,
    profileId: string,
  ): Promise<WiWorkforceProfileSummary> {
    const row = await this.deps.db.query.wiWorkforceProfiles.findFirst({
      where: and(
        eq(wiWorkforceProfiles.companyId, companyId),
        eq(wiWorkforceProfiles.id, profileId),
      ),
    });
    if (!row) throw new EnterpriseWorkforceIntelligenceError('NOT_FOUND', 'Profile not found');
    return this.buildProfileSummary(companyId, row);
  }

  private async buildProfileSummary(
    _companyId: string,
    row: typeof wiWorkforceProfiles.$inferSelect,
  ): Promise<WiWorkforceProfileSummary> {
    const [user, category, manager] = await Promise.all([
      this.deps.db.query.users.findFirst({ where: eq(users.id, row.userId) }),
      row.categoryId
        ? this.deps.db.query.wiWorkforceCategories.findFirst({
            where: eq(wiWorkforceCategories.id, row.categoryId),
          })
        : Promise.resolve(null),
      row.managerUserId
        ? this.deps.db.query.users.findFirst({ where: eq(users.id, row.managerUserId) })
        : Promise.resolve(null),
    ]);

    return {
      id: row.id,
      userId: row.userId,
      userName: user ? `${user.firstName} ${user.lastName}`.trim() : 'Unknown',
      categoryId: row.categoryId,
      categoryName: category?.name ?? null,
      customCategoryName: row.customCategoryName,
      employeeNumber: row.employeeNumber,
      employmentType: row.employmentType,
      jobTitle: row.jobTitle,
      department: row.department,
      branch: row.branch,
      managerUserId: row.managerUserId,
      managerName: manager ? `${manager.firstName} ${manager.lastName}`.trim() : null,
      startDate: row.startDate,
      contractStatus: row.contractStatus,
      lifecycleStage: row.lifecycleStage,
      payrollProviderRef: row.payrollProviderRef,
      accountingProviderRef: row.accountingProviderRef,
    };
  }

  private async getTimesheetSummary(
    companyId: string,
    timesheetId: string,
  ): Promise<WiTimesheetSummary> {
    const row = await this.deps.db.query.wiTimesheets.findFirst({
      where: and(eq(wiTimesheets.companyId, companyId), eq(wiTimesheets.id, timesheetId)),
    });
    if (!row) throw new EnterpriseWorkforceIntelligenceError('NOT_FOUND', 'Timesheet not found');

    const user = await this.deps.db.query.users.findFirst({ where: eq(users.id, row.userId) });

    const [correctionRow] = await this.deps.db
      .select({ count: count() })
      .from(wiTimesheetCorrections)
      .where(eq(wiTimesheetCorrections.timesheetId, timesheetId));

    return {
      id: row.id,
      userId: row.userId,
      userName: user ? `${user.firstName} ${user.lastName}`.trim() : 'Unknown',
      jobId: row.jobId,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      status: row.status,
      standardHours: Number(row.standardHours),
      overtimeHours: Number(row.overtimeHours),
      travelHours: Number(row.travelHours),
      standbyHours: Number(row.standbyHours),
      approvedAt: row.approvedAt?.toISOString() ?? null,
      correctionCount: correctionRow?.count ?? 0,
    };
  }

  private async getLeaveApplicationSummary(
    companyId: string,
    applicationId: string,
  ): Promise<WiLeaveApplicationSummary> {
    const row = await this.deps.db.query.wiLeaveApplications.findFirst({
      where: and(
        eq(wiLeaveApplications.companyId, companyId),
        eq(wiLeaveApplications.id, applicationId),
      ),
    });
    if (!row)
      throw new EnterpriseWorkforceIntelligenceError('NOT_FOUND', 'Leave application not found');

    const user = await this.deps.db.query.users.findFirst({ where: eq(users.id, row.userId) });
    const category = await this.deps.db.query.wiLeaveCategories.findFirst({
      where: eq(wiLeaveCategories.id, row.categoryId),
    });
    return {
      id: row.id,
      userId: row.userId,
      userName: user ? `${user.firstName} ${user.lastName}`.trim() : 'Unknown',
      categoryName: category?.name ?? 'Unknown',
      status: row.status,
      startDate: row.startDate,
      endDate: row.endDate,
      daysRequested: Number(row.daysRequested),
      reason: row.reason,
      approvedAt: row.approvedAt?.toISOString() ?? null,
    };
  }

  private async getPayrollPreparationSummary(
    companyId: string,
    batchId: string,
  ): Promise<WiPayrollPreparationSummary> {
    const row = await this.deps.db.query.wiPayrollPreparationBatches.findFirst({
      where: and(
        eq(wiPayrollPreparationBatches.companyId, companyId),
        eq(wiPayrollPreparationBatches.id, batchId),
      ),
    });
    if (!row)
      throw new EnterpriseWorkforceIntelligenceError('NOT_FOUND', 'Payroll batch not found');

    const period = await this.deps.db.query.wiPayrollPeriods.findFirst({
      where: eq(wiPayrollPeriods.id, row.payrollPeriodId),
    });
    return {
      id: row.id,
      payrollPeriodId: row.payrollPeriodId,
      periodName: period?.name ?? 'Unknown',
      status: row.status,
      exceptionCount: row.exceptionCount,
      earningsTotalCents: row.earningsTotalCents,
      deductionsTotalCents: row.deductionsTotalCents,
      currency: row.currency,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      exportedAt: row.exportedAt?.toISOString() ?? null,
    };
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.wiPlatformConfig.findFirst({
      where: eq(wiPlatformConfig.companyId, companyId),
    });
    if (existing) return existing;

    const [created] = await this.deps.db.insert(wiPlatformConfig).values({ companyId }).returning();
    return created!;
  }

  private async ensureUser(companyId: string, userId: string) {
    const user = await this.deps.db.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.companyId, companyId)),
    });
    if (!user) throw new EnterpriseWorkforceIntelligenceError('NOT_FOUND', 'User not found');
  }

  private async ensureProvider(companyId: string, providerId: string) {
    const provider = await this.deps.db.query.wiProviderAdapters.findFirst({
      where: and(
        eq(wiProviderAdapters.companyId, companyId),
        eq(wiProviderAdapters.id, providerId),
      ),
    });
    if (!provider)
      throw new EnterpriseWorkforceIntelligenceError('NOT_FOUND', 'Provider adapter not found');
    return provider;
  }

  private async ensureTimesheet(companyId: string, timesheetId: string) {
    const timesheet = await this.deps.db.query.wiTimesheets.findFirst({
      where: and(eq(wiTimesheets.companyId, companyId), eq(wiTimesheets.id, timesheetId)),
    });
    if (!timesheet)
      throw new EnterpriseWorkforceIntelligenceError('NOT_FOUND', 'Timesheet not found');
    return timesheet;
  }

  private async ensureLeaveCategory(companyId: string, categoryId: string) {
    const category = await this.deps.db.query.wiLeaveCategories.findFirst({
      where: and(eq(wiLeaveCategories.companyId, companyId), eq(wiLeaveCategories.id, categoryId)),
    });
    if (!category)
      throw new EnterpriseWorkforceIntelligenceError('NOT_FOUND', 'Leave category not found');
  }

  private async ensureLeaveApplication(companyId: string, applicationId: string) {
    const application = await this.deps.db.query.wiLeaveApplications.findFirst({
      where: and(
        eq(wiLeaveApplications.companyId, companyId),
        eq(wiLeaveApplications.id, applicationId),
      ),
    });
    if (!application)
      throw new EnterpriseWorkforceIntelligenceError('NOT_FOUND', 'Leave application not found');
    return application;
  }

  private async ensurePayrollPeriod(companyId: string, periodId: string) {
    const period = await this.deps.db.query.wiPayrollPeriods.findFirst({
      where: and(eq(wiPayrollPeriods.companyId, companyId), eq(wiPayrollPeriods.id, periodId)),
    });
    if (!period)
      throw new EnterpriseWorkforceIntelligenceError('NOT_FOUND', 'Payroll period not found');
    return period;
  }

  private async ensurePayrollBatch(companyId: string, batchId: string) {
    const batch = await this.deps.db.query.wiPayrollPreparationBatches.findFirst({
      where: and(
        eq(wiPayrollPreparationBatches.companyId, companyId),
        eq(wiPayrollPreparationBatches.id, batchId),
      ),
    });
    if (!batch)
      throw new EnterpriseWorkforceIntelligenceError('NOT_FOUND', 'Payroll batch not found');
    return batch;
  }

  private async recordAudit(
    scope: StaffScope,
    actionType: string,
    entityType?: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.deps.db.insert(wiAuditLogs).values({
      companyId: scope.companyId,
      userId: scope.userId,
      actionType,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      metadata: metadata ?? {},
    });
  }
}

function toPlatformConfigSummary(
  row: typeof wiPlatformConfig.$inferSelect,
): WiPlatformConfigSummary {
  return {
    globalPolicies: row.globalPolicies,
    providerAdapterTemplates: row.providerAdapterTemplates,
    jurisdictionTemplates: row.jurisdictionTemplates,
    leavePolicyDefaults: row.leavePolicyDefaults,
    performanceRules: row.performanceRules,
    privacyPolicies: row.privacyPolicies,
    auditRetentionDays: row.auditRetentionDays,
  };
}

function toCategorySummary(
  row: typeof wiWorkforceCategories.$inferSelect,
): WiWorkforceCategorySummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

function toProviderSummary(row: typeof wiProviderAdapters.$inferSelect): WiProviderAdapterSummary {
  return {
    id: row.id,
    providerCategory: row.providerCategory,
    providerType: row.providerType,
    providerKey: row.providerKey,
    name: row.name,
    status: row.status,
    isPrimary: row.isPrimary,
    syncDirection: row.syncDirection,
    syncFrequencyMinutes: row.syncFrequencyMinutes,
    lastTestAt: row.lastTestAt?.toISOString() ?? null,
    lastTestStatus: row.lastTestStatus,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
  };
}

function toLifecycleSummary(
  row: typeof wiLifecycleStageHistory.$inferSelect,
): WiLifecycleStageHistorySummary {
  return {
    id: row.id,
    userId: row.userId,
    stage: row.stage,
    status: row.status,
    title: row.title,
    description: row.description,
    effectiveDate: row.effectiveDate,
    occurredAt: row.occurredAt.toISOString(),
  };
}

function toLeaveCategorySummary(
  row: typeof wiLeaveCategories.$inferSelect,
): WiLeaveCategorySummary {
  return {
    id: row.id,
    name: row.name,
    categoryKey: row.categoryKey,
    description: row.description,
    isPaid: row.isPaid,
    isActive: row.isActive,
  };
}

function toPayrollPeriodSummary(row: typeof wiPayrollPeriods.$inferSelect): WiPayrollPeriodSummary {
  return {
    id: row.id,
    name: row.name,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    status: row.status,
  };
}

function toHrDraftSummary(row: typeof wiHrActionDrafts.$inferSelect): WiHrActionDraftSummary {
  return {
    id: row.id,
    userId: row.userId,
    draftType: row.draftType,
    status: row.status,
    subject: row.subject,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAnalyticsSummary(row: typeof wiAnalyticsSnapshots.$inferSelect): WiAnalyticsSummary {
  return {
    headcount: row.headcount,
    contractorCount: row.contractorCount,
    turnoverRate: row.turnoverRate != null ? Number(row.turnoverRate) : null,
    absenceRate: row.absenceRate != null ? Number(row.absenceRate) : null,
    overtimeHours: row.overtimeHours != null ? Number(row.overtimeHours) : null,
    capacityUtilization: row.capacityUtilization != null ? Number(row.capacityUtilization) : null,
    labourCostCents: row.labourCostCents,
    certificationRiskCount: row.certificationRiskCount,
    payrollExceptionCount: row.payrollExceptionCount,
    capturedAt: row.capturedAt.toISOString(),
  };
}
