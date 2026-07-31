import { and, desc, eq } from 'drizzle-orm';
import type {
  ApprovePlDeploymentRunRequest,
  ApprovePlGoLiveWizardRequest,
  CreatePlActionDraftRequest,
  CreatePlDeploymentRunRequest,
  CreatePlGoLiveWizardRequest,
  EnterpriseProductionLaunchAuraContext,
  EnterpriseProductionLaunchDashboard,
  PlActionDraftSummary,
  PlAnalyticsSummary,
  PlAuditLogSummary,
  PlLaunchStatus,
  PlPlatformAlertSummary,
  PlPlatformConfigSummary,
  PlProductionReadinessSummary,
  UpdatePlGoLiveWizardStepRequest,
  UpdatePlPlatformConfigRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  plActionDrafts,
  plAnalyticsSnapshots,
  plAuditLogs,
  plPlatformAlerts,
  plPlatformConfig,
} from '@titan/db';
import type { EnterpriseMissionControlService } from './enterprise-mission-control.service.js';
import { EnterpriseProductionLaunchEnvironmentService } from './enterprise-production-launch-environment.service.js';
import { EnterpriseProductionLaunchDomainSecurityService } from './enterprise-production-launch-domain-security.service.js';
import { EnterpriseProductionLaunchLiveIntegrationService } from './enterprise-production-launch-live-integration.service.js';
import { EnterpriseProductionLaunchDeploymentPipelineService } from './enterprise-production-launch-deployment-pipeline.service.js';
import { EnterpriseProductionLaunchCommercialService } from './enterprise-production-launch-commercial.service.js';
import { EnterpriseProductionLaunchMobileService } from './enterprise-production-launch-mobile.service.js';
import { EnterpriseProductionLaunchGoLiveWizardService } from './enterprise-production-launch-golive-wizard.service.js';

export class EnterpriseProductionLaunchError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseProductionLaunchError';
  }
}

type StaffScope = { companyId: string; userId: string };

type ProductionLaunchDeps = {
  db: DatabaseClient;
  databaseUrl?: string;
  jwtSecret?: string;
  jwtRefreshSecret?: string;
  encryptionKey?: string;
  appUrl?: string;
  apiPublicUrl?: string;
  redisUrl?: string;
  nodeEnv?: string;
  enterpriseMissionControlService: EnterpriseMissionControlService;
  enterpriseSecurityService: import('./enterprise-security.service.js').EnterpriseSecurityService;
  integrationPlatformService: import('./integration-platform.service.js').IntegrationPlatformService;
  aiProviderResilienceService: import('./ai-provider-resilience.service.js').AiProviderResilienceService;
  enterpriseProductionReadinessService: import('./enterprise-production-readiness.service.js').EnterpriseProductionReadinessService;
  enterpriseSaasManagementService: import('./enterprise-saas-management.service.js').EnterpriseSaasManagementService;
  enterpriseMobilePlatformService: import('./enterprise-mobile-platform.service.js').EnterpriseMobilePlatformService;
  enterpriseReleaseCenterService: import('./enterprise-release-center.service.js').EnterpriseReleaseCenterService;
};

export class EnterpriseProductionLaunchService {
  private readonly environmentService: EnterpriseProductionLaunchEnvironmentService;
  private readonly domainSecurityService: EnterpriseProductionLaunchDomainSecurityService;
  private readonly liveIntegrationService: EnterpriseProductionLaunchLiveIntegrationService;
  private readonly deploymentPipelineService: EnterpriseProductionLaunchDeploymentPipelineService;
  private readonly commercialService: EnterpriseProductionLaunchCommercialService;
  private readonly mobileService: EnterpriseProductionLaunchMobileService;
  private readonly goLiveWizardService: EnterpriseProductionLaunchGoLiveWizardService;

  constructor(private readonly deps: ProductionLaunchDeps) {
    this.environmentService = new EnterpriseProductionLaunchEnvironmentService({
      db: deps.db,
      databaseUrl: deps.databaseUrl,
      jwtSecret: deps.jwtSecret,
      jwtRefreshSecret: deps.jwtRefreshSecret,
      encryptionKey: deps.encryptionKey,
      appUrl: deps.appUrl,
      apiPublicUrl: deps.apiPublicUrl,
      redisUrl: deps.redisUrl,
      nodeEnv: deps.nodeEnv,
    });
    this.domainSecurityService = new EnterpriseProductionLaunchDomainSecurityService({
      db: deps.db,
      appUrl: deps.appUrl,
      apiPublicUrl: deps.apiPublicUrl,
      nodeEnv: deps.nodeEnv,
      jwtSecret: deps.jwtSecret,
      jwtRefreshSecret: deps.jwtRefreshSecret,
      encryptionKey: deps.encryptionKey,
      enterpriseSecurityService: deps.enterpriseSecurityService,
    });
    this.liveIntegrationService = new EnterpriseProductionLaunchLiveIntegrationService({
      db: deps.db,
      integrationPlatformService: deps.integrationPlatformService,
      aiProviderResilienceService: deps.aiProviderResilienceService,
    });
    this.deploymentPipelineService = new EnterpriseProductionLaunchDeploymentPipelineService({
      db: deps.db,
      databaseUrl: deps.databaseUrl,
      enterpriseProductionReadinessService: deps.enterpriseProductionReadinessService,
    });
    this.commercialService = new EnterpriseProductionLaunchCommercialService(
      deps.db,
      deps.enterpriseSaasManagementService,
    );
    this.mobileService = new EnterpriseProductionLaunchMobileService(
      deps.db,
      deps.enterpriseMobilePlatformService,
    );
    this.goLiveWizardService = new EnterpriseProductionLaunchGoLiveWizardService(deps.db);
  }

  async getDashboard(companyId: string): Promise<EnterpriseProductionLaunchDashboard> {
    await this.ensurePlatformConfig(companyId);

    const [
      platformConfig,
      latestEnvironmentReview,
      latestDomainSecurityReview,
      integrationRuns,
      deploymentHistory,
      latestCommercialReview,
      latestMobileReview,
      goLiveWizards,
      releaseDashboard,
      analytics,
      platformAlerts,
    ] = await Promise.all([
      this.getPlatformConfig(companyId),
      this.environmentService.getLatestReview(companyId),
      this.domainSecurityService.getLatestReview(companyId),
      this.liveIntegrationService.listRuns(companyId),
      this.deploymentPipelineService.listRuns(companyId),
      this.commercialService.getLatestReview(companyId),
      this.mobileService.getLatestReview(companyId),
      this.goLiveWizardService.listWizards(companyId),
      this.deps.enterpriseReleaseCenterService.getDashboard(companyId).catch(() => null),
      this.getLatestAnalytics(companyId),
      this.listPlatformAlerts(companyId, { status: 'open' }),
    ]);

    void this.deps.enterpriseMissionControlService
      .getMissionControlDashboard(companyId)
      .catch(() => null);

    const latestLiveIntegrationRun = integrationRuns[0] ?? null;
    const latestLiveIntegrationResults = latestLiveIntegrationRun
      ? ((await this.liveIntegrationService.getRunDetail(companyId, latestLiveIntegrationRun.id))
          ?.results ?? [])
      : [];

    const productionReadiness = this.buildProductionReadinessSummary({
      latestEnvironmentReview,
      latestDomainSecurityReview,
      latestLiveIntegrationRun,
      latestCommercialReview,
      latestMobileReview,
      deploymentHistory,
      goLiveWizards,
    });

    const overallProductionStatus =
      productionReadiness.launchStatus === 'blocked' ||
      productionReadiness.launchStatus === 'not_ready'
        ? 'critical'
        : productionReadiness.launchStatus === 'warning'
          ? 'warning'
          : productionReadiness.launchStatus === 'launched'
            ? 'healthy'
            : productionReadiness.launchStatus === 'ready'
              ? 'healthy'
              : 'unknown';

    return {
      summary: `Production status ${productionReadiness.launchStatus}, ${productionReadiness.failedProviderCount} provider failure(s), ${productionReadiness.pendingApprovalCount} pending approval(s), ${platformAlerts.length} alert(s).`,
      platformConfig,
      productionReadiness,
      latestEnvironmentReview,
      latestDomainSecurityReview,
      latestLiveIntegrationRun,
      latestLiveIntegrationResults,
      latestDeploymentRun: deploymentHistory[0] ?? null,
      deploymentHistory,
      latestCommercialReview,
      latestMobileReview,
      goLiveWizards,
      releaseCenterSummary: releaseDashboard
        ? {
            readinessScore: releaseDashboard.releaseReadiness.readinessScore,
            overallStatus: releaseDashboard.releaseReadiness.overallStatus,
            failedValidationCount: releaseDashboard.releaseReadiness.failedValidationCount,
          }
        : null,
      analytics,
      recentAlerts: platformAlerts.slice(0, 10),
      openAlertCount: platformAlerts.length,
      overallProductionStatus,
    };
  }

  async buildAuraContext(companyId: string): Promise<EnterpriseProductionLaunchAuraContext> {
    const dashboard = await this.getDashboard(companyId);
    return {
      summary: dashboard.summary,
      launchStatus: dashboard.productionReadiness.launchStatus,
      failedProviderCount: dashboard.productionReadiness.failedProviderCount,
      missingConfigCount: dashboard.productionReadiness.missingConfigCount,
      pendingApprovalCount: dashboard.productionReadiness.pendingApprovalCount,
      openAlertCount: dashboard.openAlertCount,
      overallProductionStatus: dashboard.overallProductionStatus,
    };
  }

  async getPlatformConfig(companyId: string): Promise<PlPlatformConfigSummary> {
    return toPlatformConfigSummary(await this.ensurePlatformConfig(companyId));
  }

  async updatePlatformConfig(
    scope: StaffScope,
    input: UpdatePlPlatformConfigRequest,
  ): Promise<PlPlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(plPlatformConfig)
      .set({
        deploymentPolicy: input.deploymentPolicy ?? existing.deploymentPolicy,
        providerPolicy: input.providerPolicy ?? existing.providerPolicy,
        launchPolicy: input.launchPolicy ?? existing.launchPolicy,
        alertLevelConfig: input.alertLevelConfig ?? existing.alertLevelConfig,
        auditRetentionDays: input.auditRetentionDays ?? existing.auditRetentionDays,
        updatedAt: new Date(),
      })
      .where(eq(plPlatformConfig.companyId, scope.companyId))
      .returning();
    await this.logAudit(scope, 'update_platform_config', 'pl_platform_config', updated?.id);
    return toPlatformConfigSummary(updated ?? existing);
  }

  runEnvironmentReview = (scope: StaffScope) => this.environmentService.runEnvironmentReview(scope);
  runDomainSecurityReview = (scope: StaffScope) =>
    this.domainSecurityService.runDomainSecurityReview(scope);
  runLiveIntegrationVerification = (scope: StaffScope) =>
    this.liveIntegrationService.runLiveIntegrationVerification(scope);
  listLiveIntegrationRuns = (companyId: string) => this.liveIntegrationService.listRuns(companyId);
  getLiveIntegrationRunDetail = (companyId: string, runId: string) =>
    this.liveIntegrationService.getRunDetail(companyId, runId);
  runCommercialReadinessReview = (scope: StaffScope) =>
    this.commercialService.runCommercialReadinessReview(scope);
  runMobileProductionReview = (scope: StaffScope) =>
    this.mobileService.runMobileProductionReview(scope);

  listDeploymentRuns = (companyId: string) => this.deploymentPipelineService.listRuns(companyId);
  createDeploymentRun = (scope: StaffScope, input: CreatePlDeploymentRunRequest) =>
    this.deploymentPipelineService.createDeploymentRun(scope, input);
  runDeploymentHealthVerification = (scope: StaffScope, runId: string) =>
    this.deploymentPipelineService.runHealthVerification(scope, runId);
  runDeploymentSmokeTests = (scope: StaffScope, runId: string) =>
    this.deploymentPipelineService.runSmokeTests(scope, runId);
  submitDeploymentForApproval = (scope: StaffScope, runId: string) =>
    this.deploymentPipelineService.submitForApproval(scope, runId);
  approveDeployment = (scope: StaffScope, runId: string, input: ApprovePlDeploymentRunRequest) =>
    this.deploymentPipelineService.approveDeployment(scope, runId, input);
  confirmDeployment = (scope: StaffScope, runId: string) =>
    this.deploymentPipelineService.confirmDeployment(scope, runId);
  recordDeploymentRollback = (scope: StaffScope, runId: string) =>
    this.deploymentPipelineService.recordRollback(scope, runId);

  listGoLiveWizards = (companyId: string) => this.goLiveWizardService.listWizards(companyId);
  createGoLiveWizard = (scope: StaffScope, input: CreatePlGoLiveWizardRequest) =>
    this.goLiveWizardService.createWizard(scope, input);
  updateGoLiveWizardStep = (
    scope: StaffScope,
    wizardId: string,
    stepKey: string,
    input: UpdatePlGoLiveWizardStepRequest,
  ) => this.goLiveWizardService.updateWizardStep(scope, wizardId, stepKey, input);
  approveGoLiveWizard = (
    scope: StaffScope,
    wizardId: string,
    input: ApprovePlGoLiveWizardRequest,
  ) => this.goLiveWizardService.approveWizard(scope, wizardId, input);
  confirmGoLiveLaunch = (scope: StaffScope, wizardId: string) =>
    this.goLiveWizardService.confirmLaunch(scope, wizardId);

  async syncPlatformAlerts(scope: StaffScope): Promise<PlPlatformAlertSummary[]> {
    const dashboard = await this.getDashboard(scope.companyId);
    const existingOpen = await this.listPlatformAlerts(scope.companyId, { status: 'open' });
    const syncedAt = new Date();
    const readiness = dashboard.productionReadiness;

    const defs = [
      [
        'missing_config',
        'critical',
        'Missing production configuration',
        `${readiness.missingConfigCount} missing config item(s)`,
        readiness.missingConfigCount > 0,
      ],
      [
        'provider_failures',
        'critical',
        'Live provider failures',
        `${readiness.failedProviderCount} provider failure(s)`,
        readiness.failedProviderCount > 0,
      ],
      [
        'pending_approvals',
        'warning',
        'Pending go-live approvals',
        `${readiness.pendingApprovalCount} pending approval(s)`,
        readiness.pendingApprovalCount > 0,
      ],
      [
        'not_ready',
        'critical',
        'Not ready for production launch',
        `Status: ${readiness.launchStatus}`,
        readiness.launchStatus === 'blocked' || readiness.launchStatus === 'not_ready',
      ],
    ] as const;

    for (const [alertType, severity, title, description, active] of defs) {
      const existing = existingOpen.find((row) => row.alertType === alertType);
      if (active && !existing) {
        await this.deps.db.insert(plPlatformAlerts).values({
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
          .update(plPlatformAlerts)
          .set({ status: 'resolved', updatedAt: syncedAt })
          .where(eq(plPlatformAlerts.id, existing.id));
      }
    }

    await this.logAudit(scope, 'platform_alerts_synced');
    return this.listPlatformAlerts(scope.companyId, { status: 'open' });
  }

  async captureAnalytics(scope: StaffScope): Promise<PlAnalyticsSummary> {
    const dashboard = await this.getDashboard(scope.companyId);
    const [created] = await this.deps.db
      .insert(plAnalyticsSnapshots)
      .values({
        companyId: scope.companyId,
        metrics: {
          launchStatus: dashboard.productionReadiness.launchStatus,
          failedProviderCount: dashboard.productionReadiness.failedProviderCount,
          missingConfigCount: dashboard.productionReadiness.missingConfigCount,
          pendingApprovalCount: dashboard.productionReadiness.pendingApprovalCount,
          openAlertCount: dashboard.openAlertCount,
        },
      })
      .returning();
    await this.logAudit(scope, 'analytics_captured');
    return toAnalyticsSummary(created!);
  }

  async createActionDraft(
    scope: StaffScope,
    input: CreatePlActionDraftRequest,
  ): Promise<PlActionDraftSummary> {
    const [created] = await this.deps.db
      .insert(plActionDrafts)
      .values({
        companyId: scope.companyId,
        draftType: input.draftType.trim(),
        title: input.title.trim(),
        content: input.content.trim(),
        sourceRecords: input.sourceRecords ?? {},
        aiGenerated: input.aiGenerated ?? false,
      })
      .returning();
    await this.logAudit(scope, 'action_draft_created', 'pl_action_drafts', created?.id);
    return toActionDraftSummary(created!);
  }

  async listAuditLogs(companyId: string): Promise<PlAuditLogSummary[]> {
    const rows = await this.deps.db.query.plAuditLogs.findMany({
      where: eq(plAuditLogs.companyId, companyId),
      orderBy: [desc(plAuditLogs.createdAt)],
      limit: 100,
    });
    return rows.map(toAuditLogSummary);
  }

  private buildProductionReadinessSummary(input: {
    latestEnvironmentReview: import('@titan/shared').PlEnvironmentReviewSummary | null;
    latestDomainSecurityReview: import('@titan/shared').PlDomainSecurityReviewSummary | null;
    latestLiveIntegrationRun:
      import('@titan/shared').PlLiveIntegrationVerificationRunSummary | null;
    latestCommercialReview: import('@titan/shared').PlCommercialReadinessReviewSummary | null;
    latestMobileReview: import('@titan/shared').PlMobileProductionReviewSummary | null;
    deploymentHistory: import('@titan/shared').PlDeploymentPipelineRunSummary[];
    goLiveWizards: import('@titan/shared').PlGoLiveWizardSummary[];
  }): PlProductionReadinessSummary {
    const missingConfigCount = input.latestEnvironmentReview?.missingConfigCount ?? 0;
    const failedProviderCount = input.latestLiveIntegrationRun?.failedCount ?? 0;
    const pendingDeploymentApprovals = input.deploymentHistory.filter(
      (d) => d.status === 'pending_approval',
    ).length;
    const pendingWizardApprovals = input.goLiveWizards.filter(
      (w) => w.status === 'pending_approval',
    ).length;
    const pendingApprovalCount = pendingDeploymentApprovals + pendingWizardApprovals;
    const wizardLaunched = input.goLiveWizards.some((w) => w.status === 'launched');
    const deploymentApproved = input.deploymentHistory.some((d) => d.ownerApproved);
    const wizardApproved = input.goLiveWizards.some(
      (w) => w.status === 'approved' || w.status === 'launched',
    );

    const environmentReady = input.latestEnvironmentReview?.status === 'passed';
    const domainSecurityReady = input.latestDomainSecurityReview?.status === 'passed';
    const providersConnected =
      (input.latestLiveIntegrationRun?.failedCount ?? 0) === 0 &&
      (input.latestLiveIntegrationRun?.connectedCount ?? 0) > 0;
    const commercialReady = input.latestCommercialReview?.status === 'passed';
    const mobileReady = input.latestMobileReview?.status === 'passed';

    let launchStatus: PlLaunchStatus = 'unknown';
    if (wizardLaunched) launchStatus = 'launched';
    else if (missingConfigCount > 0 || failedProviderCount > 0) launchStatus = 'blocked';
    else if (!environmentReady || !domainSecurityReady) launchStatus = 'not_ready';
    else if (pendingApprovalCount > 0) launchStatus = 'warning';
    else if (environmentReady && providersConnected) launchStatus = 'ready';

    return {
      launchStatus,
      environmentReady: !!environmentReady,
      providersConnected: !!providersConnected,
      domainSecurityReady: !!domainSecurityReady,
      commercialReady: !!commercialReady,
      mobileReady: !!mobileReady,
      deploymentApproved,
      wizardApproved,
      failedProviderCount,
      missingConfigCount,
      pendingApprovalCount,
    };
  }

  private async listPlatformAlerts(companyId: string, filters?: { status?: string }) {
    const rows = await this.deps.db.query.plPlatformAlerts.findMany({
      where: filters?.status
        ? and(
            eq(plPlatformAlerts.companyId, companyId),
            eq(plPlatformAlerts.status, filters.status as 'open'),
          )
        : eq(plPlatformAlerts.companyId, companyId),
      orderBy: [desc(plPlatformAlerts.createdAt)],
      limit: 50,
    });
    return rows.map(toPlatformAlertSummary);
  }

  private async getLatestAnalytics(companyId: string): Promise<PlAnalyticsSummary | null> {
    const row = await this.deps.db.query.plAnalyticsSnapshots.findFirst({
      where: eq(plAnalyticsSnapshots.companyId, companyId),
      orderBy: [desc(plAnalyticsSnapshots.capturedAt)],
    });
    return row ? toAnalyticsSummary(row) : null;
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.plPlatformConfig.findFirst({
      where: eq(plPlatformConfig.companyId, companyId),
    });
    if (existing) return existing;
    const [created] = await this.deps.db.insert(plPlatformConfig).values({ companyId }).returning();
    return created!;
  }

  private async logAudit(
    scope: StaffScope,
    actionType: string,
    entityType?: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.deps.db.insert(plAuditLogs).values({
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
  row: typeof plPlatformConfig.$inferSelect,
): PlPlatformConfigSummary {
  return {
    deploymentPolicy: (row.deploymentPolicy ?? {}) as Record<string, unknown>,
    providerPolicy: (row.providerPolicy ?? {}) as Record<string, unknown>,
    launchPolicy: (row.launchPolicy ?? {}) as Record<string, unknown>,
    alertLevelConfig: (row.alertLevelConfig ?? {}) as Record<string, unknown>,
    auditRetentionDays: row.auditRetentionDays,
  };
}

function toPlatformAlertSummary(row: typeof plPlatformAlerts.$inferSelect): PlPlatformAlertSummary {
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

function toAnalyticsSummary(row: typeof plAnalyticsSnapshots.$inferSelect): PlAnalyticsSummary {
  return {
    id: row.id,
    metrics: (row.metrics ?? {}) as Record<string, unknown>,
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toActionDraftSummary(row: typeof plActionDrafts.$inferSelect): PlActionDraftSummary {
  return {
    id: row.id,
    draftType: row.draftType,
    title: row.title,
    content: row.content,
    aiGenerated: row.aiGenerated,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAuditLogSummary(row: typeof plAuditLogs.$inferSelect): PlAuditLogSummary {
  return {
    id: row.id,
    actionType: row.actionType,
    entityType: row.entityType,
    entityId: row.entityId,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
  };
}
