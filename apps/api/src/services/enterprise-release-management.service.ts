import { and, desc, eq } from 'drizzle-orm';
import type {
  CreateRlmActionDraftRequest,
  EnterpriseReleaseManagementAuraContext,
  EnterpriseReleaseManagementDashboard,
  RlmActionDraftSummary,
  RlmAnalyticsSummary,
  RlmAuditLogSummary,
  RlmPlatformAlertSummary,
  RlmPlatformConfigSummary,
  RlmReleaseReadinessSummary,
  RlmReleaseStatus,
  UpdateRlmPlatformConfigRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  rlmActionDrafts,
  rlmAnalyticsSnapshots,
  rlmAuditLogs,
  rlmPlatformAlerts,
  rlmPlatformConfig,
} from '@titan/db';
import type { EnterpriseMissionControlService } from './enterprise-mission-control.service.js';
import { EnterpriseReleaseManagementMobilePackagingService } from './enterprise-release-management-mobile-packaging.service.js';
import { EnterpriseReleaseManagementAppStoreReadinessService } from './enterprise-release-management-app-store.service.js';
import { EnterpriseReleaseManagementBrandingService } from './enterprise-release-management-branding.service.js';
import { EnterpriseReleaseManagementUxReviewService } from './enterprise-release-management-ux-review.service.js';
import { EnterpriseReleaseManagementDocumentationService } from './enterprise-release-management-documentation.service.js';
import { EnterpriseReleaseManagementVersionService } from './enterprise-release-management-version.service.js';

export class EnterpriseReleaseManagementError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseReleaseManagementError';
  }
}

type StaffScope = { companyId: string; userId: string };

type ReleaseManagementDeps = {
  db: DatabaseClient;
  enterpriseMissionControlService: EnterpriseMissionControlService;
  enterpriseMobilePlatformService: import('./enterprise-mobile-platform.service.js').EnterpriseMobilePlatformService;
  enterpriseProductionLaunchService: import('./enterprise-production-launch.service.js').EnterpriseProductionLaunchService;
  enterpriseReleaseCenterService: import('./enterprise-release-center.service.js').EnterpriseReleaseCenterService;
};

export class EnterpriseReleaseManagementService {
  private readonly mobilePackagingService: EnterpriseReleaseManagementMobilePackagingService;
  private readonly appStoreService: EnterpriseReleaseManagementAppStoreReadinessService;
  private readonly brandingService: EnterpriseReleaseManagementBrandingService;
  private readonly uxReviewService: EnterpriseReleaseManagementUxReviewService;
  private readonly documentationService: EnterpriseReleaseManagementDocumentationService;
  private readonly versionService: EnterpriseReleaseManagementVersionService;

  constructor(private readonly deps: ReleaseManagementDeps) {
    this.mobilePackagingService = new EnterpriseReleaseManagementMobilePackagingService(
      deps.db,
      deps.enterpriseMobilePlatformService,
    );
    this.appStoreService = new EnterpriseReleaseManagementAppStoreReadinessService(deps.db);
    this.brandingService = new EnterpriseReleaseManagementBrandingService(deps.db);
    this.uxReviewService = new EnterpriseReleaseManagementUxReviewService(deps.db);
    this.documentationService = new EnterpriseReleaseManagementDocumentationService(deps.db);
    this.versionService = new EnterpriseReleaseManagementVersionService(deps.db);
  }

  async getDashboard(companyId: string): Promise<EnterpriseReleaseManagementDashboard> {
    await this.ensurePlatformConfig(companyId);
    await this.documentationService.ensureDocumentationArtifacts(companyId);
    await this.versionService.ensureVersionRecord(companyId);
    await this.versionService.ensureLaunchChecklist(companyId);

    const [
      platformConfig,
      latestMobileReview,
      appStoreReadiness,
      latestBrandingReview,
      latestUxReview,
      documentationArtifacts,
      versionRecord,
      launchChecklist,
      productionLaunchSummary,
      analytics,
      platformAlerts,
    ] = await Promise.all([
      this.getPlatformConfig(companyId),
      this.mobilePackagingService.getLatestReview(companyId),
      this.appStoreService.listReadiness(companyId),
      this.brandingService.getLatestReview(companyId),
      this.uxReviewService.getLatestReview(companyId),
      this.documentationService.listArtifacts(companyId),
      this.versionService.getVersionRecord(companyId),
      this.versionService.listLaunchChecklist(companyId),
      this.deps.enterpriseProductionLaunchService.getDashboard(companyId).catch(() => null),
      this.getLatestAnalytics(companyId),
      this.listPlatformAlerts(companyId, { status: 'open' }),
    ]);

    void this.deps.enterpriseMissionControlService.getMissionControlDashboard(companyId).catch(() => null);

    const documentationCompleteness = this.documentationService.getDocumentationCompleteness(documentationArtifacts);
    const pendingChecklistCount = this.versionService.getPendingChecklistCount(launchChecklist);
    const releaseReadiness = this.buildReleaseReadinessSummary({
      latestMobileReview,
      appStoreReadiness,
      latestBrandingReview,
      documentationCompleteness,
      launchChecklist,
      versionRecord,
      productionLaunchSummary,
    });

    const overallReleaseStatus =
      releaseReadiness.releaseStatus === 'blocked' || releaseReadiness.releaseStatus === 'not_ready'
        ? 'critical'
        : releaseReadiness.releaseStatus === 'warning'
          ? 'warning'
          : releaseReadiness.releaseStatus === 'ready' || releaseReadiness.releaseStatus === 'released'
            ? 'healthy'
            : 'unknown';

    return {
      summary: `Release status ${releaseReadiness.releaseStatus}, documentation ${documentationCompleteness}% complete, ${pendingChecklistCount} pending checklist item(s), ${platformAlerts.length} alert(s).`,
      platformConfig,
      releaseReadiness,
      latestMobileReview,
      appStoreReadiness,
      latestBrandingReview,
      latestUxReview,
      documentationArtifacts,
      versionRecord,
      launchChecklist,
      productionLaunchSummary: productionLaunchSummary
        ? {
            launchStatus: productionLaunchSummary.productionReadiness.launchStatus,
            overallProductionStatus: productionLaunchSummary.overallProductionStatus,
            openAlertCount: productionLaunchSummary.openAlertCount,
          }
        : null,
      analytics,
      recentAlerts: platformAlerts.slice(0, 10),
      openAlertCount: platformAlerts.length,
      overallReleaseStatus,
    };
  }

  async buildAuraContext(companyId: string): Promise<EnterpriseReleaseManagementAuraContext> {
    const dashboard = await this.getDashboard(companyId);
    return {
      summary: dashboard.summary,
      releaseStatus: dashboard.releaseReadiness.releaseStatus,
      documentationCompleteness: dashboard.releaseReadiness.documentationCompleteness,
      pendingChecklistCount: dashboard.releaseReadiness.pendingChecklistCount,
      mobileReady: dashboard.releaseReadiness.mobileReady,
      openAlertCount: dashboard.openAlertCount,
      overallReleaseStatus: dashboard.overallReleaseStatus,
    };
  }

  async getPlatformConfig(companyId: string): Promise<RlmPlatformConfigSummary> {
    return toPlatformConfigSummary(await this.ensurePlatformConfig(companyId));
  }

  async updatePlatformConfig(scope: StaffScope, input: UpdateRlmPlatformConfigRequest): Promise<RlmPlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(rlmPlatformConfig)
      .set({
        releasePolicy: input.releasePolicy ?? existing.releasePolicy,
        documentationPolicy: input.documentationPolicy ?? existing.documentationPolicy,
        mobilePolicy: input.mobilePolicy ?? existing.mobilePolicy,
        alertLevelConfig: input.alertLevelConfig ?? existing.alertLevelConfig,
        auditRetentionDays: input.auditRetentionDays ?? existing.auditRetentionDays,
        updatedAt: new Date(),
      })
      .where(eq(rlmPlatformConfig.companyId, scope.companyId))
      .returning();
    await this.logAudit(scope, 'update_platform_config', 'rlm_platform_config', updated?.id);
    return toPlatformConfigSummary(updated ?? existing);
  }

  runMobilePackagingReview = (scope: StaffScope) => this.mobilePackagingService.runMobilePackagingReview(scope);
  runAppStoreReadinessReviews = (scope: StaffScope) => this.appStoreService.runAllStoreReadinessReviews(scope);
  runBrandingReview = (scope: StaffScope) => this.brandingService.runBrandingReview(scope);
  runUxReview = (scope: StaffScope) => this.uxReviewService.runUxReview(scope);
  refreshDocumentationStatus = (scope: StaffScope) => this.documentationService.refreshDocumentationStatus(scope);
  finalizeVersion = (scope: StaffScope) => this.versionService.finalizeVersion(scope);

  async syncPlatformAlerts(scope: StaffScope): Promise<RlmPlatformAlertSummary[]> {
    const dashboard = await this.getDashboard(scope.companyId);
    const existingOpen = await this.listPlatformAlerts(scope.companyId, { status: 'open' });
    const syncedAt = new Date();
    const readiness = dashboard.releaseReadiness;

    const defs = [
      ['mobile_not_ready', 'warning', 'Mobile packaging not ready', 'Run mobile packaging review and verify iOS/Android builds.', !readiness.mobileReady],
      ['app_store_not_ready', 'warning', 'App store readiness incomplete', 'Complete Apple App Store and Google Play Store checklists.', !readiness.appStoreReady],
      ['branding_not_ready', 'warning', 'Branding verification incomplete', 'Run branding review and configure white-label assets.', !readiness.brandingReady],
      ['documentation_incomplete', 'warning', 'Documentation incomplete', `${readiness.documentationCompleteness}% documentation completeness.`, !readiness.documentationComplete],
      ['launch_checklist_pending', 'warning', 'Launch checklist pending', `${readiness.pendingChecklistCount} required checklist item(s) pending.`, !readiness.launchChecklistComplete],
      ['version_not_finalized', 'info', 'Version not finalized', 'Finalize TITAN Business OS v1.0.0 release record.', !readiness.versionFinalized],
      ['release_blocked', 'critical', 'Release blocked', `Release status: ${readiness.releaseStatus}`, readiness.releaseStatus === 'blocked' || readiness.releaseStatus === 'not_ready'],
    ] as const;

    for (const [alertType, severity, title, description, active] of defs) {
      const existing = existingOpen.find((row) => row.alertType === alertType);
      if (active && !existing) {
        await this.deps.db.insert(rlmPlatformAlerts).values({
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
          .update(rlmPlatformAlerts)
          .set({ status: 'resolved', updatedAt: syncedAt })
          .where(eq(rlmPlatformAlerts.id, existing.id));
      }
    }

    await this.logAudit(scope, 'platform_alerts_synced');
    return this.listPlatformAlerts(scope.companyId, { status: 'open' });
  }

  async captureAnalytics(scope: StaffScope): Promise<RlmAnalyticsSummary> {
    const dashboard = await this.getDashboard(scope.companyId);
    const [created] = await this.deps.db
      .insert(rlmAnalyticsSnapshots)
      .values({
        companyId: scope.companyId,
        metrics: {
          releaseStatus: dashboard.releaseReadiness.releaseStatus,
          documentationCompleteness: dashboard.releaseReadiness.documentationCompleteness,
          pendingChecklistCount: dashboard.releaseReadiness.pendingChecklistCount,
          mobileReady: dashboard.releaseReadiness.mobileReady,
          openAlertCount: dashboard.openAlertCount,
        },
      })
      .returning();
    await this.logAudit(scope, 'analytics_captured');
    return toAnalyticsSummary(created!);
  }

  async createActionDraft(scope: StaffScope, input: CreateRlmActionDraftRequest): Promise<RlmActionDraftSummary> {
    const [created] = await this.deps.db
      .insert(rlmActionDrafts)
      .values({
        companyId: scope.companyId,
        draftType: input.draftType.trim(),
        title: input.title.trim(),
        content: input.content.trim(),
        sourceRecords: input.sourceRecords ?? {},
        aiGenerated: input.aiGenerated ?? false,
      })
      .returning();
    await this.logAudit(scope, 'action_draft_created', 'rlm_action_drafts', created?.id);
    return toActionDraftSummary(created!);
  }

  async listAuditLogs(companyId: string): Promise<RlmAuditLogSummary[]> {
    const rows = await this.deps.db.query.rlmAuditLogs.findMany({
      where: eq(rlmAuditLogs.companyId, companyId),
      orderBy: [desc(rlmAuditLogs.createdAt)],
      limit: 100,
    });
    return rows.map(toAuditLogSummary);
  }

  private buildReleaseReadinessSummary(input: {
    latestMobileReview: import('@titan/shared').RlmMobilePackagingReviewSummary | null;
    appStoreReadiness: import('@titan/shared').RlmAppStoreReadinessSummary[];
    latestBrandingReview: import('@titan/shared').RlmBrandingReviewSummary | null;
    documentationCompleteness: number;
    launchChecklist: import('@titan/shared').RlmLaunchChecklistItemSummary[];
    versionRecord: import('@titan/shared').RlmVersionRecordSummary | null;
    productionLaunchSummary: EnterpriseReleaseManagementDashboard['productionLaunchSummary'];
  }): RlmReleaseReadinessSummary {
    const mobileReady = input.latestMobileReview?.status === 'passed' || (input.latestMobileReview?.iosReady && input.latestMobileReview?.androidReady) || false;
    const appStoreReady =
      input.appStoreReadiness.length >= 2 &&
      input.appStoreReadiness.every((s) => s.checklistTotalCount > 0);
    const brandingReady = input.latestBrandingReview?.status === 'passed' || (input.latestBrandingReview?.warningCount ?? 99) <= 2;
    const documentationComplete = input.documentationCompleteness >= 80;
    const launchChecklistComplete = this.versionService.isLaunchChecklistComplete(input.launchChecklist);
    const pendingChecklistCount = this.versionService.getPendingChecklistCount(input.launchChecklist);
    const versionFinalized = input.versionRecord?.status === 'ready' || input.versionRecord?.status === 'released';
    const warningCount =
      (input.latestMobileReview?.warningCount ?? 0) +
      (input.latestBrandingReview?.warningCount ?? 0);

    let releaseStatus: RlmReleaseStatus = 'unknown';
    if (input.productionLaunchSummary?.launchStatus === 'blocked') releaseStatus = 'blocked';
    else if (!mobileReady || !appStoreReady) releaseStatus = 'not_ready';
    else if (!documentationComplete || !launchChecklistComplete || pendingChecklistCount > 0) releaseStatus = 'warning';
    else if (versionFinalized && mobileReady && brandingReady) releaseStatus = 'ready';
    else if (input.versionRecord?.status === 'released') releaseStatus = 'released';

    return {
      releaseStatus,
      mobileReady,
      appStoreReady,
      brandingReady,
      documentationComplete,
      launchChecklistComplete,
      versionFinalized,
      pendingChecklistCount,
      documentationCompleteness: input.documentationCompleteness,
      warningCount,
    };
  }

  private async listPlatformAlerts(companyId: string, filters?: { status?: string }) {
    const rows = await this.deps.db.query.rlmPlatformAlerts.findMany({
      where: filters?.status
        ? and(eq(rlmPlatformAlerts.companyId, companyId), eq(rlmPlatformAlerts.status, filters.status as 'open'))
        : eq(rlmPlatformAlerts.companyId, companyId),
      orderBy: [desc(rlmPlatformAlerts.createdAt)],
      limit: 50,
    });
    return rows.map(toPlatformAlertSummary);
  }

  private async getLatestAnalytics(companyId: string): Promise<RlmAnalyticsSummary | null> {
    const row = await this.deps.db.query.rlmAnalyticsSnapshots.findFirst({
      where: eq(rlmAnalyticsSnapshots.companyId, companyId),
      orderBy: [desc(rlmAnalyticsSnapshots.capturedAt)],
    });
    return row ? toAnalyticsSummary(row) : null;
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.rlmPlatformConfig.findFirst({
      where: eq(rlmPlatformConfig.companyId, companyId),
    });
    if (existing) return existing;
    const [created] = await this.deps.db.insert(rlmPlatformConfig).values({ companyId }).returning();
    return created!;
  }

  private async logAudit(scope: StaffScope, actionType: string, entityType?: string, entityId?: string, metadata?: Record<string, unknown>) {
    await this.deps.db.insert(rlmAuditLogs).values({
      companyId: scope.companyId,
      userId: scope.userId,
      actionType,
      entityType,
      entityId,
      metadata: metadata ?? {},
    });
  }
}

function toPlatformConfigSummary(row: typeof rlmPlatformConfig.$inferSelect): RlmPlatformConfigSummary {
  return {
    releasePolicy: (row.releasePolicy ?? {}) as Record<string, unknown>,
    documentationPolicy: (row.documentationPolicy ?? {}) as Record<string, unknown>,
    mobilePolicy: (row.mobilePolicy ?? {}) as Record<string, unknown>,
    alertLevelConfig: (row.alertLevelConfig ?? {}) as Record<string, unknown>,
    auditRetentionDays: row.auditRetentionDays,
  };
}

function toPlatformAlertSummary(row: typeof rlmPlatformAlerts.$inferSelect): RlmPlatformAlertSummary {
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

function toAnalyticsSummary(row: typeof rlmAnalyticsSnapshots.$inferSelect): RlmAnalyticsSummary {
  return { id: row.id, metrics: (row.metrics ?? {}) as Record<string, unknown>, capturedAt: row.capturedAt.toISOString() };
}

function toActionDraftSummary(row: typeof rlmActionDrafts.$inferSelect): RlmActionDraftSummary {
  return {
    id: row.id,
    draftType: row.draftType,
    title: row.title,
    content: row.content,
    aiGenerated: row.aiGenerated,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAuditLogSummary(row: typeof rlmAuditLogs.$inferSelect): RlmAuditLogSummary {
  return {
    id: row.id,
    actionType: row.actionType,
    entityType: row.entityType,
    entityId: row.entityId,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
  };
}
