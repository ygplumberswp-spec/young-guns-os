import { and, desc, eq } from 'drizzle-orm';
import type {
  CreateLncActionDraftRequest,
  EnterpriseLaunchCenterAuraContext,
  EnterpriseLaunchCenterDashboard,
  LncActionDraftSummary,
  LncAnalyticsSummary,
  LncAuditLogSummary,
  LncLaunchReadinessSummary,
  LncPlatformAlertSummary,
  LncPlatformConfigSummary,
  LncReadinessScanDetailSummary,
  LncReadinessScanSummary,
  UpdateLncPlatformConfigRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  lncActionDrafts,
  lncAnalyticsSnapshots,
  lncAuditLogs,
  lncPlatformAlerts,
  lncPlatformConfig,
} from '@titan/db';
import type { EnterpriseMissionControlService } from './enterprise-mission-control.service.js';
import type { EnterpriseSecurityService } from './enterprise-security.service.js';
import type { IntegrationPlatformService } from './integration-platform.service.js';
import { EnterpriseLaunchCenterReadinessService } from './enterprise-launch-center-readiness.service.js';
import { EnterpriseLaunchCenterAcceptanceService } from './enterprise-launch-center-acceptance.service.js';
import { EnterpriseLaunchCenterScoringService } from './enterprise-launch-center-scoring.service.js';
import { EnterpriseLaunchCenterGoLiveService } from './enterprise-launch-center-golive.service.js';
import { EnterpriseLaunchCenterDeploymentValidationService } from './enterprise-launch-center-deployment-validation.service.js';

export class EnterpriseLaunchCenterError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseLaunchCenterError';
  }
}

type StaffScope = { companyId: string; userId: string };

type LaunchCenterDeps = {
  db: DatabaseClient;
  databaseUrl?: string;
  jwtSecret?: string;
  enterpriseProductionReadinessService: import('./enterprise-production-readiness.service.js').EnterpriseProductionReadinessService;
  enterprisePlatformHealthService: import('./enterprise-platform-health.service.js').EnterprisePlatformHealthService;
  enterpriseSecurityService: EnterpriseSecurityService;
  enterpriseBusinessContinuityService: import('./enterprise-business-continuity.service.js').EnterpriseBusinessContinuityService;
  integrationPlatformService: IntegrationPlatformService;
  aiProviderResilienceService: import('./ai-provider-resilience.service.js').AiProviderResilienceService;
  enterpriseNotificationsService: import('./enterprise-notifications.service.js').EnterpriseNotificationsService;
  enterpriseDocumentAiService: import('./enterprise-document-ai.service.js').EnterpriseDocumentAiService;
  enterpriseSaasPlatformService: import('./enterprise-saas-platform.service.js').EnterpriseSaasPlatformService;
  enterpriseMissionControlService: EnterpriseMissionControlService;
};

export class EnterpriseLaunchCenterService {
  private readonly readinessService: EnterpriseLaunchCenterReadinessService;
  private readonly acceptanceService: EnterpriseLaunchCenterAcceptanceService;
  private readonly scoringService: EnterpriseLaunchCenterScoringService;
  private readonly goLiveService: EnterpriseLaunchCenterGoLiveService;
  private readonly deploymentValidationService: EnterpriseLaunchCenterDeploymentValidationService;

  constructor(private readonly deps: LaunchCenterDeps) {
    this.readinessService = new EnterpriseLaunchCenterReadinessService({
      db: deps.db,
      databaseUrl: deps.databaseUrl,
      jwtSecret: deps.jwtSecret,
      enterpriseProductionReadinessService: deps.enterpriseProductionReadinessService,
      enterprisePlatformHealthService: deps.enterprisePlatformHealthService,
      enterpriseSecurityService: deps.enterpriseSecurityService,
      enterpriseBusinessContinuityService: deps.enterpriseBusinessContinuityService,
      integrationPlatformService: deps.integrationPlatformService,
      aiProviderResilienceService: deps.aiProviderResilienceService,
      enterpriseNotificationsService: deps.enterpriseNotificationsService,
      enterpriseDocumentAiService: deps.enterpriseDocumentAiService,
      enterpriseSaasPlatformService: deps.enterpriseSaasPlatformService,
    });
    this.acceptanceService = new EnterpriseLaunchCenterAcceptanceService(deps.db);
    this.scoringService = new EnterpriseLaunchCenterScoringService(deps.db);
    this.goLiveService = new EnterpriseLaunchCenterGoLiveService(deps.db, deps.enterpriseBusinessContinuityService);
    this.deploymentValidationService = new EnterpriseLaunchCenterDeploymentValidationService(
      deps.db,
      deps.enterpriseProductionReadinessService,
      this.readinessService,
    );
  }

  async getDashboard(companyId: string): Promise<EnterpriseLaunchCenterDashboard> {
    await this.ensurePlatformConfig(companyId);

    const [
      platformConfig,
      readinessScans,
      latestScore,
      acceptanceTestSuites,
      acceptanceTestRuns,
      goLiveWizards,
      rollbackPlanLinks,
      deploymentValidations,
      integrationDashboard,
      securityDashboard,
      analytics,
      platformAlerts,
    ] = await Promise.all([
      this.getPlatformConfig(companyId),
      this.readinessService.listReadinessScans(companyId),
      this.scoringService.getLatestScore(companyId),
      this.acceptanceService.listSuites(companyId),
      this.acceptanceService.listTestRuns(companyId),
      this.goLiveService.listWizards(companyId),
      this.goLiveService.listRollbackPlans(companyId),
      this.deploymentValidationService.listValidations(companyId),
      this.deps.integrationPlatformService.getExecutiveDashboard(companyId),
      this.deps.enterpriseSecurityService.getExecutiveDashboard(companyId),
      this.getLatestAnalytics(companyId),
      this.listPlatformAlerts(companyId, { status: 'open' }),
    ]);

    void this.deps.enterpriseMissionControlService.getMissionControlDashboard(companyId).catch(() => null);

    const latestReadinessScan = readinessScans[0] ?? null;
    const latestCheckResults =
      latestReadinessScan ? (await this.readinessService.getReadinessScanDetail(companyId, latestReadinessScan.id))?.results ?? [] : [];

    const pendingApprovalCount = goLiveWizards.filter((w) => w.status === 'pending_approval').length;
    const launchReadiness = this.buildLaunchReadinessSummary({
      latestScore,
      latestScan: latestReadinessScan,
      pendingApprovalCount,
      deploymentValidations,
    });

    const overallLaunchReadinessStatus =
      launchReadiness.overallStatus === 'blocked' || launchReadiness.criticalBlockerCount > 0
        ? 'critical'
        : launchReadiness.overallStatus === 'not_ready'
          ? 'degraded'
          : launchReadiness.overallStatus === 'warning'
            ? 'warning'
            : 'healthy';

    return {
      summary: `Readiness score ${launchReadiness.overallScore ?? '—'}, ${latestCheckResults.length} check(s), ${pendingApprovalCount} pending approval(s), ${platformAlerts.length} alert(s).`,
      platformConfig,
      launchReadiness,
      latestReadinessScan,
      latestReadinessScore: latestScore,
      latestCheckResults,
      acceptanceTestSuites,
      acceptanceTestRuns,
      goLiveWizards,
      rollbackPlanLinks,
      deploymentValidations,
      integrations: integrationDashboard.connectors.map((c) => ({
        key: c.connectorKey,
        status: c.status,
        provider: c.provider,
      })),
      securitySummary: {
        securityScore: securityDashboard.securityScore,
        riskAlertCount: securityDashboard.riskAlertCount,
        summary: securityDashboard.summary,
      },
      analytics,
      recentAlerts: platformAlerts.slice(0, 10),
      openAlertCount: platformAlerts.length,
      overallLaunchReadinessStatus,
    };
  }

  async buildAuraContext(companyId: string): Promise<EnterpriseLaunchCenterAuraContext> {
    const dashboard = await this.getDashboard(companyId);
    return {
      summary: dashboard.summary,
      overallScore: dashboard.launchReadiness.overallScore,
      criticalBlockerCount: dashboard.launchReadiness.criticalBlockerCount,
      failedCheckCount: dashboard.latestReadinessScan?.failedCount ?? 0,
      pendingApprovalCount: dashboard.launchReadiness.pendingApprovalCount,
      openAlertCount: dashboard.openAlertCount,
      overallLaunchReadinessStatus: dashboard.overallLaunchReadinessStatus,
    };
  }

  async getPlatformConfig(companyId: string): Promise<LncPlatformConfigSummary> {
    return toPlatformConfigSummary(await this.ensurePlatformConfig(companyId));
  }

  async updatePlatformConfig(scope: StaffScope, input: UpdateLncPlatformConfigRequest): Promise<LncPlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(lncPlatformConfig)
      .set({
        readinessPolicy: input.readinessPolicy ?? existing.readinessPolicy,
        scoringWeights: input.scoringWeights ?? existing.scoringWeights,
        acceptancePolicy: input.acceptancePolicy ?? existing.acceptancePolicy,
        goLivePolicy: input.goLivePolicy ?? existing.goLivePolicy,
        rollbackPolicy: input.rollbackPolicy ?? existing.rollbackPolicy,
        alertLevelConfig: input.alertLevelConfig ?? existing.alertLevelConfig,
        auditRetentionDays: input.auditRetentionDays ?? existing.auditRetentionDays,
        updatedAt: new Date(),
      })
      .where(eq(lncPlatformConfig.companyId, scope.companyId))
      .returning();
    await this.logAudit(scope, 'update_platform_config', 'lnc_platform_config', updated?.id);
    return toPlatformConfigSummary(updated ?? existing);
  }

  async runReadinessScan(scope: StaffScope): Promise<LncReadinessScanDetailSummary> {
    const scan = await this.readinessService.runReadinessScan(scope);
    await this.scoringService.computeReadinessScore({
      companyId: scope.companyId,
      readinessScanId: scan.id,
      results: scan.results,
    });
    await this.syncPlatformAlerts(scope);
    await this.logAudit(scope, 'readiness_scan_completed', 'lnc_readiness_scans', scan.id);
    return scan;
  }

  listReadinessScans = (companyId: string) => this.readinessService.listReadinessScans(companyId);
  getReadinessScanDetail = (companyId: string, scanId: string) => this.readinessService.getReadinessScanDetail(companyId, scanId);
  getLatestReadinessScore = (companyId: string) => this.scoringService.getLatestScore(companyId);
  listAcceptanceSuites = (companyId: string) => this.acceptanceService.listSuites(companyId);
  listAcceptanceTestRuns = (companyId: string) => this.acceptanceService.listTestRuns(companyId);
  getAcceptanceTestRunDetail = (companyId: string, runId: string) => this.acceptanceService.getTestRunDetail(companyId, runId);
  runAcceptanceTests = (scope: StaffScope, suiteId?: string) => this.acceptanceService.runAcceptanceTests(scope, suiteId);
  listGoLiveWizards = (companyId: string) => this.goLiveService.listWizards(companyId);
  createGoLiveWizard = (scope: StaffScope, input: import('@titan/shared').CreateLncGoLiveWizardRequest) =>
    this.goLiveService.createWizard(scope, input);
  updateGoLiveWizardStep = (
    scope: StaffScope,
    wizardId: string,
    stepKey: string,
    input: import('@titan/shared').UpdateLncGoLiveWizardStepRequest,
  ) => this.goLiveService.updateWizardStep(scope, wizardId, stepKey, input);
  approveGoLiveWizard = (scope: StaffScope, wizardId: string, input: import('@titan/shared').ApproveLncGoLiveWizardRequest) =>
    this.goLiveService.approveWizard(scope, wizardId, input);
  confirmDeployment = (scope: StaffScope, wizardId: string) => this.goLiveService.confirmDeployment(scope, wizardId);
  listRollbackPlans = (companyId: string, wizardId?: string) => this.goLiveService.listRollbackPlans(companyId, wizardId);
  selectRollbackPlan = (scope: StaffScope, wizardId: string, rollbackPlanLinkId: string) =>
    this.goLiveService.selectRollbackPlan(scope, wizardId, rollbackPlanLinkId);
  validateRollbackPlan = (scope: StaffScope, rollbackPlanLinkId: string) =>
    this.goLiveService.validateRollbackPlan(scope, rollbackPlanLinkId);
  listDeploymentValidations = (companyId: string) => this.deploymentValidationService.listValidations(companyId);
  runPostDeploymentValidation = (scope: StaffScope, goLiveWizardId?: string) =>
    this.deploymentValidationService.runPostDeploymentValidation(scope, goLiveWizardId);

  async syncPlatformAlerts(scope: StaffScope): Promise<LncPlatformAlertSummary[]> {
    const [latestScore, latestScan, wizards] = await Promise.all([
      this.scoringService.getLatestScore(scope.companyId),
      this.readinessService.listReadinessScans(scope.companyId).then((s) => s[0] ?? null),
      this.goLiveService.listWizards(scope.companyId),
    ]);

    const existingOpen = await this.listPlatformAlerts(scope.companyId, { status: 'open' });
    const syncedAt = new Date();
    const defs = [
      ['critical_blockers', 'critical', 'Critical launch blockers', `${latestScore?.criticalBlockerCount ?? 0} critical blocker(s)`, (latestScore?.criticalBlockerCount ?? 0) > 0],
      ['failed_checks', 'warning', 'Failed readiness checks', `${latestScan?.failedCount ?? 0} failed check(s)`, (latestScan?.failedCount ?? 0) > 0],
      ['pending_approvals', 'warning', 'Pending go-live approvals', `${wizards.filter((w) => w.status === 'pending_approval').length} pending approval(s)`, wizards.some((w) => w.status === 'pending_approval')],
      ['not_ready', 'critical', 'Not ready for production', `Status: ${latestScore?.overallStatus ?? 'unknown'}`, latestScore?.overallStatus === 'blocked' || latestScore?.overallStatus === 'not_ready'],
    ] as const;

    for (const [alertType, severity, title, description, active] of defs) {
      const existing = existingOpen.find((row) => row.alertType === alertType);
      if (active && !existing) {
        await this.deps.db.insert(lncPlatformAlerts).values({
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
          .update(lncPlatformAlerts)
          .set({ status: 'resolved', updatedAt: syncedAt })
          .where(eq(lncPlatformAlerts.id, existing.id));
      }
    }

    await this.logAudit(scope, 'platform_alerts_synced');
    return this.listPlatformAlerts(scope.companyId, { status: 'open' });
  }

  async captureAnalytics(scope: StaffScope): Promise<LncAnalyticsSummary> {
    const dashboard = await this.getDashboard(scope.companyId);
    const [created] = await this.deps.db
      .insert(lncAnalyticsSnapshots)
      .values({
        companyId: scope.companyId,
        metrics: {
          overallScore: dashboard.launchReadiness.overallScore,
          overallStatus: dashboard.launchReadiness.overallStatus,
          criticalBlockerCount: dashboard.launchReadiness.criticalBlockerCount,
          pendingApprovalCount: dashboard.launchReadiness.pendingApprovalCount,
          openAlertCount: dashboard.openAlertCount,
        },
      })
      .returning();
    await this.logAudit(scope, 'analytics_captured');
    return toAnalyticsSummary(created!);
  }

  async createActionDraft(scope: StaffScope, input: CreateLncActionDraftRequest): Promise<LncActionDraftSummary> {
    const [created] = await this.deps.db
      .insert(lncActionDrafts)
      .values({
        companyId: scope.companyId,
        draftType: input.draftType.trim(),
        title: input.title.trim(),
        content: input.content.trim(),
        sourceRecords: input.sourceRecords ?? {},
        aiGenerated: input.aiGenerated ?? false,
      })
      .returning();
    await this.logAudit(scope, 'action_draft_created', 'lnc_action_drafts', created?.id);
    return toActionDraftSummary(created!);
  }

  async listAuditLogs(companyId: string): Promise<LncAuditLogSummary[]> {
    const rows = await this.deps.db.query.lncAuditLogs.findMany({
      where: eq(lncAuditLogs.companyId, companyId),
      orderBy: [desc(lncAuditLogs.createdAt)],
      limit: 100,
    });
    return rows.map(toAuditLogSummary);
  }

  private buildLaunchReadinessSummary(input: {
    latestScore: import('@titan/shared').LncReadinessScoreSummary | null;
    latestScan: LncReadinessScanSummary | null;
    pendingApprovalCount: number;
    deploymentValidations: import('@titan/shared').LncDeploymentValidationSummary[];
  }): LncLaunchReadinessSummary {
    return {
      overallScore: input.latestScore?.overallScore ?? null,
      overallStatus: input.latestScore?.overallStatus ?? input.latestScan?.overallStatus ?? 'unknown',
      criticalBlockerCount: input.latestScore?.criticalBlockerCount ?? input.latestScan?.criticalBlockerCount ?? 0,
      highPriorityCount: input.latestScore?.highPriorityCount ?? 0,
      warningCount: input.latestScore?.warningCount ?? input.latestScan?.warningCount ?? 0,
      passedCheckCount: input.latestScore?.passedCount ?? input.latestScan?.passedCount ?? 0,
      pendingApprovalCount: input.pendingApprovalCount,
      deploymentStatus: input.deploymentValidations[0]?.status ?? null,
    };
  }

  private async listPlatformAlerts(companyId: string, filters?: { status?: string }) {
    const rows = await this.deps.db.query.lncPlatformAlerts.findMany({
      where: filters?.status
        ? and(eq(lncPlatformAlerts.companyId, companyId), eq(lncPlatformAlerts.status, filters.status as 'open'))
        : eq(lncPlatformAlerts.companyId, companyId),
      orderBy: [desc(lncPlatformAlerts.createdAt)],
      limit: 50,
    });
    return rows.map(toPlatformAlertSummary);
  }

  private async getLatestAnalytics(companyId: string): Promise<LncAnalyticsSummary | null> {
    const row = await this.deps.db.query.lncAnalyticsSnapshots.findFirst({
      where: eq(lncAnalyticsSnapshots.companyId, companyId),
      orderBy: [desc(lncAnalyticsSnapshots.capturedAt)],
    });
    return row ? toAnalyticsSummary(row) : null;
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.lncPlatformConfig.findFirst({
      where: eq(lncPlatformConfig.companyId, companyId),
    });
    if (existing) return existing;
    const [created] = await this.deps.db.insert(lncPlatformConfig).values({ companyId }).returning();
    return created!;
  }

  private async logAudit(scope: StaffScope, actionType: string, entityType?: string, entityId?: string, metadata?: Record<string, unknown>) {
    await this.deps.db.insert(lncAuditLogs).values({
      companyId: scope.companyId,
      userId: scope.userId,
      actionType,
      entityType,
      entityId,
      metadata: metadata ?? {},
    });
  }
}

function toPlatformConfigSummary(row: typeof lncPlatformConfig.$inferSelect): LncPlatformConfigSummary {
  return {
    readinessPolicy: (row.readinessPolicy ?? {}) as Record<string, unknown>,
    scoringWeights: (row.scoringWeights ?? {}) as Record<string, unknown>,
    acceptancePolicy: (row.acceptancePolicy ?? {}) as Record<string, unknown>,
    goLivePolicy: (row.goLivePolicy ?? {}) as Record<string, unknown>,
    rollbackPolicy: (row.rollbackPolicy ?? {}) as Record<string, unknown>,
    alertLevelConfig: (row.alertLevelConfig ?? {}) as Record<string, unknown>,
    auditRetentionDays: row.auditRetentionDays,
  };
}

function toPlatformAlertSummary(row: typeof lncPlatformAlerts.$inferSelect): LncPlatformAlertSummary {
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

function toAnalyticsSummary(row: typeof lncAnalyticsSnapshots.$inferSelect): LncAnalyticsSummary {
  return { id: row.id, metrics: (row.metrics ?? {}) as Record<string, unknown>, capturedAt: row.capturedAt.toISOString() };
}

function toActionDraftSummary(row: typeof lncActionDrafts.$inferSelect): LncActionDraftSummary {
  return {
    id: row.id,
    draftType: row.draftType,
    title: row.title,
    content: row.content,
    aiGenerated: row.aiGenerated,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAuditLogSummary(row: typeof lncAuditLogs.$inferSelect): LncAuditLogSummary {
  return {
    id: row.id,
    actionType: row.actionType,
    entityType: row.entityType,
    entityId: row.entityId,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
  };
}
