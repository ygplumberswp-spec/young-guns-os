import { and, desc, eq } from 'drizzle-orm';
import type {
  CreateRcActionDraftRequest,
  EnterpriseReleaseCenterAuraContext,
  EnterpriseReleaseCenterDashboard,
  RcActionDraftSummary,
  RcAnalyticsSummary,
  RcAuditLogSummary,
  RcPlatformAlertSummary,
  RcPlatformConfigSummary,
  RcReleaseReadinessSummary,
  RcReleaseStatus,
  UpdateRcPlatformConfigRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  rcActionDrafts,
  rcAnalyticsSnapshots,
  rcAuditLogs,
  rcPlatformAlerts,
  rcPlatformConfig,
} from '@titan/db';
import type { EnterpriseMissionControlService } from './enterprise-mission-control.service.js';
import { EnterpriseReleaseCenterIntegrationValidationService } from './enterprise-release-center-integration-validation.service.js';
import { EnterpriseReleaseCenterWorkflowValidationService } from './enterprise-release-center-workflow-validation.service.js';
import { EnterpriseReleaseCenterPerformanceService } from './enterprise-release-center-performance.service.js';
import { EnterpriseReleaseCenterReleaseCandidateService } from './enterprise-release-center-release-candidate.service.js';

export class EnterpriseReleaseCenterError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseReleaseCenterError';
  }
}

type StaffScope = { companyId: string; userId: string };

type ReleaseCenterDeps = {
  db: DatabaseClient;
  databaseUrl?: string;
  jwtSecret?: string;
  encryptionKey?: string;
  enterpriseLaunchCenterService: import('./enterprise-launch-center.service.js').EnterpriseLaunchCenterService;
  enterprisePlatformHealthService: import('./enterprise-platform-health.service.js').EnterprisePlatformHealthService;
  enterpriseSecurityService: import('./enterprise-security.service.js').EnterpriseSecurityService;
  enterpriseMissionControlService: EnterpriseMissionControlService;
  integrationPlatformService: import('./integration-platform.service.js').IntegrationPlatformService;
  aiProviderResilienceService: import('./ai-provider-resilience.service.js').AiProviderResilienceService;
  enterpriseDocumentAiService: import('./enterprise-document-ai.service.js').EnterpriseDocumentAiService;
  enterpriseKnowledgeGraphService: import('./enterprise-knowledge-graph.service.js').EnterpriseKnowledgeGraphService;
  enterpriseSaasPlatformService: import('./enterprise-saas-platform.service.js').EnterpriseSaasPlatformService;
  enterpriseIndustryPackService: import('./enterprise-industry-packs.service.js').EnterpriseIndustryPackService;
  enterpriseBusinessContinuityService: import('./enterprise-business-continuity.service.js').EnterpriseBusinessContinuityService;
  enterpriseVoiceReceptionService: import('./enterprise-voice-reception.service.js').EnterpriseVoiceReceptionService;
  enterpriseProductionReadinessService: import('./enterprise-production-readiness.service.js').EnterpriseProductionReadinessService;
  enterpriseGlobalSearchService: import('./enterprise-global-search.service.js').EnterpriseGlobalSearchService;
};

export class EnterpriseReleaseCenterService {
  private readonly integrationValidationService: EnterpriseReleaseCenterIntegrationValidationService;
  private readonly workflowValidationService: EnterpriseReleaseCenterWorkflowValidationService;
  private readonly performanceService: EnterpriseReleaseCenterPerformanceService;
  private readonly releaseCandidateService: EnterpriseReleaseCenterReleaseCandidateService;

  constructor(private readonly deps: ReleaseCenterDeps) {
    this.integrationValidationService = new EnterpriseReleaseCenterIntegrationValidationService({
      db: deps.db,
      databaseUrl: deps.databaseUrl,
      jwtSecret: deps.jwtSecret,
      encryptionKey: deps.encryptionKey,
      enterpriseLaunchCenterService: deps.enterpriseLaunchCenterService,
      enterprisePlatformHealthService: deps.enterprisePlatformHealthService,
      enterpriseSecurityService: deps.enterpriseSecurityService,
      enterpriseMissionControlService: deps.enterpriseMissionControlService,
      integrationPlatformService: deps.integrationPlatformService,
      aiProviderResilienceService: deps.aiProviderResilienceService,
      enterpriseDocumentAiService: deps.enterpriseDocumentAiService,
      enterpriseKnowledgeGraphService: deps.enterpriseKnowledgeGraphService,
      enterpriseSaasPlatformService: deps.enterpriseSaasPlatformService,
      enterpriseIndustryPackService: deps.enterpriseIndustryPackService,
      enterpriseBusinessContinuityService: deps.enterpriseBusinessContinuityService,
      enterpriseVoiceReceptionService: deps.enterpriseVoiceReceptionService,
    });
    this.workflowValidationService = new EnterpriseReleaseCenterWorkflowValidationService(deps.db);
    this.performanceService = new EnterpriseReleaseCenterPerformanceService(
      deps.db,
      deps.enterpriseProductionReadinessService,
      deps.enterprisePlatformHealthService,
      deps.enterpriseGlobalSearchService,
    );
    this.releaseCandidateService = new EnterpriseReleaseCenterReleaseCandidateService({
      db: deps.db,
      databaseUrl: deps.databaseUrl,
      jwtSecret: deps.jwtSecret,
      encryptionKey: deps.encryptionKey,
      enterpriseSecurityService: deps.enterpriseSecurityService,
      enterpriseLaunchCenterService: deps.enterpriseLaunchCenterService,
      integrationValidationService: this.integrationValidationService,
      workflowValidationService: this.workflowValidationService,
      performanceService: this.performanceService,
    });
  }

  async getDashboard(companyId: string): Promise<EnterpriseReleaseCenterDashboard> {
    await this.ensurePlatformConfig(companyId);

    const [
      platformConfig,
      integrationRuns,
      workflowRuns,
      latestPerformanceSnapshot,
      latestSecurityVerification,
      latestConfigurationReview,
      latestReleaseReport,
      releaseChecklist,
      analytics,
      platformAlerts,
    ] = await Promise.all([
      this.getPlatformConfig(companyId),
      this.integrationValidationService.listRuns(companyId),
      this.workflowValidationService.listRuns(companyId),
      this.performanceService.getLatestSnapshot(companyId),
      this.releaseCandidateService.getLatestSecurityVerification(companyId),
      this.releaseCandidateService.getLatestConfigurationReview(companyId),
      this.releaseCandidateService.getLatestReport(companyId),
      this.releaseCandidateService.listChecklist(companyId),
      this.getLatestAnalytics(companyId),
      this.listPlatformAlerts(companyId, { status: 'open' }),
    ]);

    void this.deps.enterpriseMissionControlService
      .getMissionControlDashboard(companyId)
      .catch(() => null);

    const latestIntegrationRun = integrationRuns[0] ?? null;
    const latestWorkflowRun = workflowRuns[0] ?? null;
    const latestIntegrationResults = latestIntegrationRun
      ? ((await this.integrationValidationService.getRunDetail(companyId, latestIntegrationRun.id))
          ?.results ?? [])
      : [];
    const latestWorkflowResults = latestWorkflowRun
      ? ((await this.workflowValidationService.getRunDetail(companyId, latestWorkflowRun.id))
          ?.results ?? [])
      : [];

    const releaseReadiness = this.buildReleaseReadinessSummary({
      latestReport: latestReleaseReport,
      latestIntegrationRun,
      latestWorkflowRun,
      latestSecurityVerification,
      latestConfigurationReview,
      latestPerformanceSnapshot,
      releaseChecklist,
    });

    const overallReleaseStatus =
      releaseReadiness.overallStatus === 'blocked' || releaseReadiness.overallStatus === 'not_ready'
        ? 'critical'
        : releaseReadiness.overallStatus === 'warning'
          ? 'warning'
          : releaseReadiness.overallStatus === 'ready'
            ? 'healthy'
            : 'unknown';

    return {
      summary: `Readiness score ${releaseReadiness.readinessScore ?? '—'}, ${releaseReadiness.failedValidationCount} failed validation(s), ${releaseReadiness.warningCount} warning(s), ${platformAlerts.length} alert(s).`,
      platformConfig,
      releaseReadiness,
      latestIntegrationRun,
      latestIntegrationResults,
      latestWorkflowRun,
      latestWorkflowResults,
      latestPerformanceSnapshot,
      latestSecurityVerification,
      latestConfigurationReview,
      latestReleaseReport,
      releaseChecklist,
      analytics,
      recentAlerts: platformAlerts.slice(0, 10),
      openAlertCount: platformAlerts.length,
      overallReleaseStatus,
    };
  }

  async buildAuraContext(companyId: string): Promise<EnterpriseReleaseCenterAuraContext> {
    const dashboard = await this.getDashboard(companyId);
    return {
      summary: dashboard.summary,
      readinessScore: dashboard.releaseReadiness.readinessScore,
      failedValidationCount: dashboard.releaseReadiness.failedValidationCount,
      warningCount: dashboard.releaseReadiness.warningCount,
      optimizationCount: dashboard.releaseReadiness.optimizationCount,
      openAlertCount: dashboard.openAlertCount,
      overallReleaseStatus: dashboard.overallReleaseStatus,
    };
  }

  async getPlatformConfig(companyId: string): Promise<RcPlatformConfigSummary> {
    return toPlatformConfigSummary(await this.ensurePlatformConfig(companyId));
  }

  async updatePlatformConfig(
    scope: StaffScope,
    input: UpdateRcPlatformConfigRequest,
  ): Promise<RcPlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(rcPlatformConfig)
      .set({
        validationPolicy: input.validationPolicy ?? existing.validationPolicy,
        performancePolicy: input.performancePolicy ?? existing.performancePolicy,
        releasePolicy: input.releasePolicy ?? existing.releasePolicy,
        alertLevelConfig: input.alertLevelConfig ?? existing.alertLevelConfig,
        auditRetentionDays: input.auditRetentionDays ?? existing.auditRetentionDays,
        updatedAt: new Date(),
      })
      .where(eq(rcPlatformConfig.companyId, scope.companyId))
      .returning();
    await this.logAudit(scope, 'update_platform_config', 'rc_platform_config', updated?.id);
    return toPlatformConfigSummary(updated ?? existing);
  }

  runIntegrationValidation = (scope: StaffScope) =>
    this.integrationValidationService.runIntegrationValidation(scope);
  listIntegrationRuns = (companyId: string) =>
    this.integrationValidationService.listRuns(companyId);
  getIntegrationRunDetail = (companyId: string, runId: string) =>
    this.integrationValidationService.getRunDetail(companyId, runId);

  runWorkflowValidation = (scope: StaffScope) =>
    this.workflowValidationService.runWorkflowValidation(scope);
  listWorkflowRuns = (companyId: string) => this.workflowValidationService.listRuns(companyId);
  getWorkflowRunDetail = (companyId: string, runId: string) =>
    this.workflowValidationService.getRunDetail(companyId, runId);

  capturePerformanceSnapshot = (scope: StaffScope) =>
    this.performanceService.capturePerformanceSnapshot(scope);
  getLatestPerformanceSnapshot = (companyId: string) =>
    this.performanceService.getLatestSnapshot(companyId);

  runSecurityVerification = (scope: StaffScope) =>
    this.releaseCandidateService.runSecurityVerification(scope);
  runConfigurationReview = (scope: StaffScope) =>
    this.releaseCandidateService.runConfigurationReview(scope);
  generateReleaseReport = (scope: StaffScope) =>
    this.releaseCandidateService.generateReleaseReport(scope);
  listReleaseChecklist = (companyId: string) =>
    this.releaseCandidateService.listChecklist(companyId);
  getLatestReleaseReport = (companyId: string) =>
    this.releaseCandidateService.getLatestReport(companyId);

  async syncPlatformAlerts(scope: StaffScope): Promise<RcPlatformAlertSummary[]> {
    const dashboard = await this.getDashboard(scope.companyId);
    const existingOpen = await this.listPlatformAlerts(scope.companyId, { status: 'open' });
    const syncedAt = new Date();
    const readiness = dashboard.releaseReadiness;

    const defs = [
      [
        'failed_validations',
        'critical',
        'Failed release validations',
        `${readiness.failedValidationCount} failed validation(s)`,
        readiness.failedValidationCount > 0,
      ],
      [
        'configuration_warnings',
        'warning',
        'Configuration warnings',
        `${readiness.configurationWarningCount} configuration warning(s)`,
        readiness.configurationWarningCount > 0,
      ],
      [
        'security_alerts',
        'critical',
        'Security verification alerts',
        `${readiness.securityAlertCount} security alert(s)`,
        readiness.securityAlertCount > 0,
      ],
      [
        'performance_opportunities',
        'warning',
        'Performance optimization opportunities',
        `${readiness.optimizationCount} optimization opportunity(ies)`,
        readiness.optimizationCount > 0,
      ],
      [
        'pending_checklist',
        'warning',
        'Pending release checklist items',
        `${readiness.pendingChecklistCount} pending checklist item(s)`,
        readiness.pendingChecklistCount > 0,
      ],
      [
        'not_ready',
        'critical',
        'Not ready for release',
        `Status: ${readiness.overallStatus}`,
        readiness.overallStatus === 'blocked' || readiness.overallStatus === 'not_ready',
      ],
    ] as const;

    for (const [alertType, severity, title, description, active] of defs) {
      const existing = existingOpen.find((row) => row.alertType === alertType);
      if (active && !existing) {
        await this.deps.db.insert(rcPlatformAlerts).values({
          companyId: scope.companyId,
          alertType,
          severity,
          status: 'open',
          title,
          description,
          metadata: { syncedAt: syncedAt.toISOString() },
        });
      } else if (!active && existing) {
        await this.deps.db
          .update(rcPlatformAlerts)
          .set({ status: 'resolved', updatedAt: syncedAt })
          .where(eq(rcPlatformAlerts.id, existing.id));
      }
    }

    await this.logAudit(scope, 'platform_alerts_synced');
    return this.listPlatformAlerts(scope.companyId, { status: 'open' });
  }

  async captureAnalytics(scope: StaffScope): Promise<RcAnalyticsSummary> {
    const dashboard = await this.getDashboard(scope.companyId);
    const [created] = await this.deps.db
      .insert(rcAnalyticsSnapshots)
      .values({
        companyId: scope.companyId,
        metrics: {
          readinessScore: dashboard.releaseReadiness.readinessScore,
          overallStatus: dashboard.releaseReadiness.overallStatus,
          failedValidationCount: dashboard.releaseReadiness.failedValidationCount,
          warningCount: dashboard.releaseReadiness.warningCount,
          optimizationCount: dashboard.releaseReadiness.optimizationCount,
          openAlertCount: dashboard.openAlertCount,
        },
      })
      .returning();
    await this.logAudit(scope, 'analytics_captured');
    return toAnalyticsSummary(created!);
  }

  async createActionDraft(
    scope: StaffScope,
    input: CreateRcActionDraftRequest,
  ): Promise<RcActionDraftSummary> {
    const [created] = await this.deps.db
      .insert(rcActionDrafts)
      .values({
        companyId: scope.companyId,
        draftType: input.draftType.trim(),
        title: input.title.trim(),
        content: input.content.trim(),
        sourceRecords: input.sourceRecords ?? {},
        aiGenerated: input.aiGenerated ?? false,
      })
      .returning();
    await this.logAudit(scope, 'action_draft_created', 'rc_action_drafts', created?.id);
    return toActionDraftSummary(created!);
  }

  async listAuditLogs(companyId: string): Promise<RcAuditLogSummary[]> {
    const rows = await this.deps.db.query.rcAuditLogs.findMany({
      where: eq(rcAuditLogs.companyId, companyId),
      orderBy: [desc(rcAuditLogs.createdAt)],
      limit: 100,
    });
    return rows.map(toAuditLogSummary);
  }

  private buildReleaseReadinessSummary(input: {
    latestReport: import('@titan/shared').RcReleaseCandidateReportSummary | null;
    latestIntegrationRun: import('@titan/shared').RcIntegrationValidationRunSummary | null;
    latestWorkflowRun: import('@titan/shared').RcWorkflowValidationRunSummary | null;
    latestSecurityVerification: import('@titan/shared').RcSecurityVerificationRunSummary | null;
    latestConfigurationReview: import('@titan/shared').RcConfigurationReviewSummary | null;
    latestPerformanceSnapshot: import('@titan/shared').RcPerformanceSnapshotSummary | null;
    releaseChecklist: import('@titan/shared').RcReleaseChecklistItemSummary[];
  }): RcReleaseReadinessSummary {
    const failedValidationCount =
      input.latestReport?.failedValidationCount ??
      (input.latestIntegrationRun?.failedCount ?? 0) + (input.latestWorkflowRun?.failedCount ?? 0);
    const warningCount =
      input.latestReport?.warningCount ??
      (input.latestIntegrationRun?.warningCount ?? 0) +
        (input.latestWorkflowRun?.warningCount ?? 0);
    const optimizationCount =
      input.latestReport?.optimizationCount ??
      input.latestPerformanceSnapshot?.optimizationOpportunities.length ??
      0;
    const configurationWarningCount = input.latestConfigurationReview?.warningCount ?? 0;
    const securityAlertCount = input.latestSecurityVerification?.criticalCount ?? 0;
    const passedChecklistCount = input.releaseChecklist.filter((i) => i.status === 'passed').length;
    const pendingChecklistCount = input.releaseChecklist.filter(
      (i) => i.status === 'pending' && i.isRequired,
    ).length;

    let overallStatus: RcReleaseStatus = input.latestReport?.overallStatus ?? 'unknown';
    const hasAssessmentEvidence =
      Boolean(input.latestReport) ||
      Boolean(input.latestIntegrationRun) ||
      Boolean(input.latestWorkflowRun) ||
      Boolean(input.latestSecurityVerification) ||
      Boolean(input.latestConfigurationReview);

    if (!hasAssessmentEvidence) {
      overallStatus = 'unknown';
    } else if (!input.latestReport) {
      const criticalBlockers =
        failedValidationCount +
        securityAlertCount +
        (input.latestConfigurationReview?.missingConfigCount ?? 0);
      if (criticalBlockers > 0) overallStatus = 'blocked';
      else if (failedValidationCount > 0) overallStatus = 'not_ready';
      else if (warningCount > 0 || pendingChecklistCount > 0) overallStatus = 'warning';
      else if (
        input.latestIntegrationRun?.status === 'passed' &&
        input.latestWorkflowRun?.status === 'passed'
      ) {
        overallStatus = 'ready';
      } else {
        overallStatus = 'unknown';
      }
    }

    return {
      readinessScore: input.latestReport?.readinessScore ?? null,
      overallStatus,
      failedValidationCount,
      warningCount,
      optimizationCount,
      configurationWarningCount,
      securityAlertCount,
      passedChecklistCount,
      pendingChecklistCount,
    };
  }

  private async listPlatformAlerts(companyId: string, filters?: { status?: string }) {
    const rows = await this.deps.db.query.rcPlatformAlerts.findMany({
      where: filters?.status
        ? and(
            eq(rcPlatformAlerts.companyId, companyId),
            eq(rcPlatformAlerts.status, filters.status as 'open'),
          )
        : eq(rcPlatformAlerts.companyId, companyId),
      orderBy: [desc(rcPlatformAlerts.createdAt)],
      limit: 50,
    });
    return rows.map(toPlatformAlertSummary);
  }

  private async getLatestAnalytics(companyId: string): Promise<RcAnalyticsSummary | null> {
    const row = await this.deps.db.query.rcAnalyticsSnapshots.findFirst({
      where: eq(rcAnalyticsSnapshots.companyId, companyId),
      orderBy: [desc(rcAnalyticsSnapshots.capturedAt)],
    });
    return row ? toAnalyticsSummary(row) : null;
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.rcPlatformConfig.findFirst({
      where: eq(rcPlatformConfig.companyId, companyId),
    });
    if (existing) return existing;
    const [created] = await this.deps.db.insert(rcPlatformConfig).values({ companyId }).returning();
    return created!;
  }

  private async logAudit(
    scope: StaffScope,
    actionType: string,
    entityType?: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.deps.db.insert(rcAuditLogs).values({
      companyId: scope.companyId,
      userId: scope.userId,
      actionType,
      entityType,
      entityId,
      metadata: metadata ?? {},
    });
  }
}

function toPlatformConfigSummary(
  row: typeof rcPlatformConfig.$inferSelect,
): RcPlatformConfigSummary {
  return {
    validationPolicy: (row.validationPolicy ?? {}) as Record<string, unknown>,
    performancePolicy: (row.performancePolicy ?? {}) as Record<string, unknown>,
    releasePolicy: (row.releasePolicy ?? {}) as Record<string, unknown>,
    alertLevelConfig: (row.alertLevelConfig ?? {}) as Record<string, unknown>,
    auditRetentionDays: row.auditRetentionDays,
  };
}

function toPlatformAlertSummary(row: typeof rcPlatformAlerts.$inferSelect): RcPlatformAlertSummary {
  return {
    id: row.id,
    alertType: row.alertType,
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAnalyticsSummary(row: typeof rcAnalyticsSnapshots.$inferSelect): RcAnalyticsSummary {
  return {
    id: row.id,
    metrics: (row.metrics ?? {}) as Record<string, unknown>,
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toActionDraftSummary(row: typeof rcActionDrafts.$inferSelect): RcActionDraftSummary {
  return {
    id: row.id,
    draftType: row.draftType,
    title: row.title,
    content: row.content,
    aiGenerated: row.aiGenerated,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAuditLogSummary(row: typeof rcAuditLogs.$inferSelect): RcAuditLogSummary {
  return {
    id: row.id,
    actionType: row.actionType,
    entityType: row.entityType,
    entityId: row.entityId,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
  };
}
