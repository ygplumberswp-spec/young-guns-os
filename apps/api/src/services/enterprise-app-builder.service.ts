import { and, desc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type {
  AbActionDraftSummary,
  AbAnalyticsSummary,
  AbAppBuilderAlertSummary,
  AbApprovalRecordSummary,
  AbArchitectureImpactSummary,
  AbAuditLogSummary,
  AbBuildMonitoringSummary,
  AbCodeGenerationRecordSummary,
  AbDatabaseChangePlanSummary,
  AbDeploymentSummary,
  AbDevelopmentWorkspaceSummary,
  AbDocumentationUpdateSummary,
  AbFeatureRegistryEntrySummary,
  AbFeatureRequestSummary,
  AbPlatformConfigSummary,
  AbPreviewRecordSummary,
  AbRequirementsAnalysisSummary,
  AbRollbackSummary,
  AbTestRunSummary,
  CreateAbAppBuilderActionDraftRequest,
  CreateAbApprovalRecordRequest,
  CreateAbCodeGenerationRecordRequest,
  CreateAbDatabaseChangePlanRequest,
  CreateAbDeploymentRequest,
  CreateAbDevelopmentWorkspaceRequest,
  CreateAbDocumentationUpdateRequest,
  CreateAbFeatureRegistryEntryRequest,
  CreateAbFeatureRequestRequest,
  CreateAbPreviewRecordRequest,
  CreateAbRequirementsAnalysisRequest,
  CreateAbRollbackRequest,
  CreateAbTestRunRequest,
  EnterpriseAppBuilderAuraContext,
  EnterpriseAppBuilderDashboard,
  ExecuteAbSafeBuildActionRequest,
  UpdateAbApprovalRecordRequest,
  UpdateAbDeploymentRequest,
  UpdateAbFeatureRequestRequest,
  UpdateAbPlatformConfigRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  abActionDrafts,
  abAnalyticsSnapshots,
  abAppBuilderAlerts,
  abApprovalRecords,
  abArchitectureImpactAnalyses,
  abAuditLogs,
  abCodeGenerationRecords,
  abDatabaseChangePlans,
  abDeployments,
  abDevelopmentWorkspaces,
  abDocumentationUpdates,
  abFeatureRegistryEntries,
  abFeatureRequests,
  abPlatformConfig,
  abPreviewRecords,
  abRequirementsAnalyses,
  abRollbacks,
  abTestRuns,
} from '@titan/db';
import type { EnterpriseAutomationStudioService } from './enterprise-automation-studio.service.js';
import type { EnterpriseBusinessEvolutionService } from './enterprise-business-evolution.service.js';
import type { EnterpriseDeveloperPlatformService } from './enterprise-developer-platform.service.js';
import type { EnterpriseItOperationsService } from './enterprise-it-operations.service.js';
import type { EnterpriseMissionControlService } from './enterprise-mission-control.service.js';
import type { EnterpriseProductionReadinessService } from './enterprise-production-readiness.service.js';
import type { EnterpriseSaasPlatformService } from './enterprise-saas-platform.service.js';

export class EnterpriseAppBuilderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseAppBuilderError';
  }
}

export const OWNER_APPROVAL_REQUIRED_AREAS = [
  'database_schema',
  'billing',
  'finance',
  'payroll',
  'security',
  'authentication',
  'rbac',
  'legal',
  'compliance',
  'ai_safety',
  'production_integrations',
  'architecture',
  'destructive_actions',
] as const;

const SAFE_BUILD_ACTION_KEYS = [
  'documentation_sync',
  'registry_update',
  'preview_refresh',
  'test_queue',
] as const;

type StaffScope = { companyId: string; userId: string };

type ExecuteSafeBuildActionResult = {
  actionKey: string;
  verified: boolean;
  workflowStatus: string;
  output: Record<string, unknown>;
};

type UpdateAbRequirementsAnalysisRequest = Partial<CreateAbRequirementsAnalysisRequest>;
type UpdateAbArchitectureImpactRequest = Partial<{
  frontendImpact: string;
  backendImpact: string;
  databaseImpact: string;
  apiImpact: string;
  sharedTypesImpact: string;
  rbacImpact: string;
  securityImpact: string;
  tenantIsolationImpact: string;
  affectedModules: Record<string, unknown>;
  breakingChangeRisk: string;
  analysis: Record<string, unknown>;
  analyzedAt: string;
}>;
type UpdateAbDevelopmentWorkspaceRequest = Partial<CreateAbDevelopmentWorkspaceRequest> & {
  status?: string;
  completedAt?: string;
};
type UpdateAbCodeGenerationRecordRequest = Partial<CreateAbCodeGenerationRecordRequest> & {
  workflowStatus?: string;
};
type UpdateAbDatabaseChangePlanRequest = Partial<CreateAbDatabaseChangePlanRequest> & {
  workflowStatus?: string;
};
type UpdateAbTestRunRequest = Partial<CreateAbTestRunRequest> & { workflowStatus?: string };
type UpdateAbPreviewRecordRequest = Partial<CreateAbPreviewRecordRequest>;
type UpdateAbRollbackRequest = Partial<CreateAbRollbackRequest> & { workflowStatus?: string };
type UpdateAbDocumentationUpdateRequest = Partial<CreateAbDocumentationUpdateRequest> & {
  workflowStatus?: string;
};
type UpdateAbFeatureRegistryEntryRequest = Partial<CreateAbFeatureRegistryEntryRequest> & {
  status?: string;
};
type UpdateAbAppBuilderAlertRequest = Partial<{
  alertType: string;
  severity: string;
  status: string;
  title: string;
  description: string;
  featureRequestId: string;
  sourceModule: string;
  context: Record<string, unknown>;
}>;
type UpdateAbActionDraftRequest = Partial<CreateAbAppBuilderActionDraftRequest> & {
  workflowStatus?: string;
};
type CreateAbArchitectureImpactRequest = {
  featureRequestId: string;
  frontendImpact?: string;
  backendImpact?: string;
  databaseImpact?: string;
  apiImpact?: string;
  sharedTypesImpact?: string;
  rbacImpact?: string;
  securityImpact?: string;
  tenantIsolationImpact?: string;
  affectedModules?: Record<string, unknown>;
  breakingChangeRisk?: string;
  analysis?: Record<string, unknown>;
  analyzedAt?: string;
};

type AppBuilderDeps = {
  db: DatabaseClient;
  enterpriseSaasPlatformService: EnterpriseSaasPlatformService;
  enterpriseDeveloperPlatformService: EnterpriseDeveloperPlatformService;
  enterpriseMissionControlService: EnterpriseMissionControlService;
  enterpriseItOperationsService: EnterpriseItOperationsService;
  enterpriseBusinessEvolutionService: EnterpriseBusinessEvolutionService;
  enterpriseProductionReadinessService: EnterpriseProductionReadinessService;
  enterpriseAutomationStudioService: EnterpriseAutomationStudioService;
};

export class EnterpriseAppBuilderService {
  constructor(private readonly deps: AppBuilderDeps) {}

  // --- Wrapped platform services (delegate, do not replace) ---

  async isPlatformOwnerTenant(companyId: string): Promise<boolean> {
    return this.deps.enterpriseSaasPlatformService.isPlatformOwnerTenant(companyId);
  }

  async getDeveloperDashboard(companyId: string) {
    return this.deps.enterpriseDeveloperPlatformService.getDeveloperDashboard(companyId);
  }

  async buildDeveloperAuraContext(companyId: string) {
    return this.deps.enterpriseDeveloperPlatformService.buildDeveloperAuraContext(companyId);
  }

  async getMissionControlDashboard(companyId: string) {
    return this.deps.enterpriseMissionControlService.getMissionControlDashboard(companyId);
  }

  async getItOperationsDashboard(companyId: string) {
    return this.deps.enterpriseItOperationsService.getDashboard(companyId);
  }

  async getBusinessEvolutionDashboard(companyId: string) {
    return this.deps.enterpriseBusinessEvolutionService.getDashboard(companyId);
  }

  async getProductionReadinessDashboard(companyId: string) {
    return this.deps.enterpriseProductionReadinessService.getDashboard(companyId);
  }

  async getAutomationMonitoringSummary(companyId: string) {
    return this.deps.enterpriseAutomationStudioService.getMonitoringSummary(companyId);
  }

  // --- Dashboard & monitoring ---

  async getDashboard(companyId: string): Promise<EnterpriseAppBuilderDashboard> {
    const isPlatformOwner = await this.isPlatformOwnerTenant(companyId);
    const [
      platformConfig,
      legacyDeveloperPlatform,
      featureRequests,
      requirements,
      architectureImpacts,
      workspaces,
      testRuns,
      previews,
      approvals,
      deployments,
      rollbacks,
      registryEntries,
      alerts,
      analytics,
      buildMonitoring,
    ] = await Promise.all([
      this.getPlatformConfig(companyId),
      this.getDeveloperDashboard(companyId).catch(() => null),
      this.listFeatureRequests(companyId),
      this.listRequirementsAnalyses(companyId),
      this.listArchitectureImpactAnalyses(companyId),
      this.listDevelopmentWorkspaces(companyId),
      this.listTestRuns(companyId),
      this.listPreviewRecords(companyId),
      this.listApprovalRecords(companyId),
      this.listDeployments(companyId),
      this.listRollbacks(companyId),
      this.listFeatureRegistryEntries(companyId),
      this.listAppBuilderAlerts(companyId, { status: 'open' }),
      this.getLatestAnalytics(companyId),
      this.getBuildMonitoring(companyId),
    ]);

    void this.getMissionControlDashboard(companyId).catch(() => null);
    void this.getItOperationsDashboard(companyId).catch(() => null);
    void this.getBusinessEvolutionDashboard(companyId).catch(() => null);
    void this.getProductionReadinessDashboard(companyId).catch(() => null);

    const pendingApprovalCount = featureRequests.filter((r) => r.workflowStatus === 'pending_approval').length;
    const activeWorkspaceCount = workspaces.filter((w) => w.status === 'active').length;
    const failedTestCount = testRuns.filter((t) => t.workflowStatus === 'failed').length;
    const failedDeploymentCount = deployments.filter((d) => d.workflowStatus === 'failed').length;
    const overallBuildHealthStatus = resolveBuildHealthStatus({
      failedTestCount,
      failedDeploymentCount,
      openAlertCount: alerts.length,
      pendingApprovalCount,
    });

    return {
      summary: `${featureRequests.length} feature request(s), ${activeWorkspaceCount} active workspace(s), ${pendingApprovalCount} pending approval(s), ${alerts.length} open alert(s).`,
      isPlatformOwner,
      platformConfig,
      legacyDeveloperPlatform,
      featureRequestCount: featureRequests.length,
      pendingApprovalCount,
      activeWorkspaceCount,
      failedTestCount,
      failedDeploymentCount,
      openAlertCount: alerts.length,
      registryEntryCount: registryEntries.length,
      overallBuildHealthStatus,
      buildMonitoring,
      analytics,
      recentFeatureRequests: featureRequests.slice(0, 10),
      recentRequirements: requirements.slice(0, 10),
      recentArchitectureImpacts: architectureImpacts.slice(0, 10),
      recentWorkspaces: workspaces.slice(0, 10),
      recentTestRuns: testRuns.slice(0, 10),
      recentPreviews: previews.slice(0, 10),
      recentApprovals: approvals.slice(0, 10),
      recentDeployments: deployments.slice(0, 10),
      recentRollbacks: rollbacks.slice(0, 10),
      recentRegistryEntries: registryEntries.slice(0, 10),
      recentAlerts: alerts.slice(0, 10),
    };
  }

  async getBuildMonitoring(companyId: string): Promise<AbBuildMonitoringSummary> {
    const [featureRequests, testRuns, deployments, alerts, pendingSchemaPlans] = await Promise.all([
      this.listFeatureRequests(companyId),
      this.listTestRuns(companyId),
      this.listDeployments(companyId),
      this.listAppBuilderAlerts(companyId, { status: 'open' }),
      this.deps.db.query.abDatabaseChangePlans.findMany({
        where: and(
          eq(abDatabaseChangePlans.companyId, companyId),
          inArray(abDatabaseChangePlans.workflowStatus, ['draft', 'review', 'pending_approval']),
        ),
        limit: 50,
      }),
    ]);

    const activeFeatureRequestCount = featureRequests.filter((r) =>
      ['analyzing', 'planned', 'in_development', 'testing', 'preview'].includes(r.workflowStatus),
    ).length;
    const pendingApprovalCount = featureRequests.filter((r) => r.workflowStatus === 'pending_approval').length;
    const failedTestCount = testRuns.filter((t) => t.workflowStatus === 'failed').length;
    const failedBuildCount = deployments.filter((d) => ['failed', 'rolled_back'].includes(d.workflowStatus)).length;
    const pendingDeploymentCount = deployments.filter((d) =>
      ['planned', 'building', 'deploying'].includes(d.workflowStatus),
    ).length;

    const alertMessages: string[] = [];
    if (failedTestCount > 0) alertMessages.push(`${failedTestCount} failed test run(s)`);
    if (failedBuildCount > 0) alertMessages.push(`${failedBuildCount} failed deployment(s)`);
    if (pendingSchemaPlans.filter((p) => p.requiresOwnerApproval).length > 0) {
      alertMessages.push(
        `${pendingSchemaPlans.filter((p) => p.requiresOwnerApproval).length} pending schema approval(s)`,
      );
    }
    if (pendingApprovalCount > 0) alertMessages.push(`${pendingApprovalCount} feature(s) pending approval`);
    if (alerts.length > 0) alertMessages.push(`${alerts.length} open app builder alert(s)`);

    return {
      activeFeatureRequestCount,
      pendingApprovalCount,
      failedBuildCount,
      failedTestCount,
      pendingDeploymentCount,
      openAlertCount: alerts.length,
      alerts: alertMessages,
    };
  }

  async buildAuraContext(companyId: string): Promise<EnterpriseAppBuilderAuraContext> {
    const dashboard = await this.getDashboard(companyId);
    return {
      summary: dashboard.summary,
      featureRequestCount: dashboard.featureRequestCount,
      pendingApprovalCount: dashboard.pendingApprovalCount,
      activeWorkspaceCount: dashboard.activeWorkspaceCount,
      failedTestCount: dashboard.failedTestCount,
      failedDeploymentCount: dashboard.failedDeploymentCount,
      openAlertCount: dashboard.openAlertCount,
      registryEntryCount: dashboard.registryEntryCount,
      overallBuildHealthStatus: dashboard.overallBuildHealthStatus,
    };
  }

  // --- Platform config ---

  async getPlatformConfig(companyId: string): Promise<AbPlatformConfigSummary> {
    return toPlatformConfigSummary(await this.ensurePlatformConfig(companyId));
  }

  async updatePlatformConfig(scope: StaffScope, input: UpdateAbPlatformConfigRequest): Promise<AbPlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(abPlatformConfig)
      .set({
        autoApproveRules: input.autoApproveRules ?? existing.autoApproveRules,
        deploymentStandards: input.deploymentStandards ?? existing.deploymentStandards,
        testingRequirements: input.testingRequirements ?? existing.testingRequirements,
        documentationPolicy: input.documentationPolicy ?? existing.documentationPolicy,
        rollbackPolicy: input.rollbackPolicy ?? existing.rollbackPolicy,
        ownerApprovalRequiredAreas: input.ownerApprovalRequiredAreas ?? existing.ownerApprovalRequiredAreas,
        auditRetentionDays: input.auditRetentionDays ?? existing.auditRetentionDays,
        updatedAt: new Date(),
      })
      .where(eq(abPlatformConfig.companyId, scope.companyId))
      .returning();
    await this.recordAudit(scope, 'platform_config_updated');
    return toPlatformConfigSummary(updated!);
  }

  // --- Workflow operations ---

  async analyzeRequirements(scope: StaffScope, featureRequestId: string): Promise<AbRequirementsAnalysisSummary> {
    const request = await this.ensureFeatureRequest(scope.companyId, featureRequestId);
    const now = new Date();

    const functionalRequirements: Record<string, unknown> = {
      title: request.title,
      requestType: request.requestType,
      ...(request.naturalLanguageRequest ? { naturalLanguageRequest: request.naturalLanguageRequest } : {}),
      ...(request.config?.functionalRequirements && typeof request.config.functionalRequirements === 'object'
        ? (request.config.functionalRequirements as Record<string, unknown>)
        : {}),
    };

    const technicalRequirements: Record<string, unknown> = {
      requestType: request.requestType,
      riskLevel: request.riskLevel,
      ...(request.config?.technicalRequirements && typeof request.config.technicalRequirements === 'object'
        ? (request.config.technicalRequirements as Record<string, unknown>)
        : {}),
    };

    const acceptanceCriteria: Record<string, unknown> = {
      ...(request.config?.acceptanceCriteria && typeof request.config.acceptanceCriteria === 'object'
        ? (request.config.acceptanceCriteria as Record<string, unknown>)
        : {}),
      ...(request.naturalLanguageRequest
        ? { sourceRequest: request.naturalLanguageRequest }
        : { sourceRequest: request.title }),
    };

    const dependencies: Record<string, unknown> = {
      ...(request.config?.dependencies && typeof request.config.dependencies === 'object'
        ? (request.config.dependencies as Record<string, unknown>)
        : {}),
    };

    const estimatedComplexity =
      typeof request.config?.estimatedComplexity === 'string'
        ? request.config.estimatedComplexity
        : request.riskLevel === 'critical'
          ? 'high'
          : request.riskLevel === 'high'
            ? 'medium-high'
            : request.riskLevel;

    const implementationPlan = request.naturalLanguageRequest
      ? `Implement feature request "${request.title}" based on submitted request text.`
      : `Implement feature request "${request.title}" (${request.requestType}).`;

    const [created] = await this.deps.db
      .insert(abRequirementsAnalyses)
      .values({
        companyId: scope.companyId,
        featureRequestId,
        functionalRequirements,
        technicalRequirements,
        acceptanceCriteria,
        dependencies,
        estimatedComplexity,
        riskLevel: request.riskLevel,
        implementationPlan,
        analyzedAt: now,
      })
      .returning();

    await this.deps.db
      .update(abFeatureRequests)
      .set({ workflowStatus: 'analyzing', updatedAt: new Date() })
      .where(eq(abFeatureRequests.id, featureRequestId));

    await this.recordAudit(scope, 'requirements_analyzed', 'ab_feature_request', featureRequestId, {
      requirementsAnalysisId: created!.id,
    });
    return toRequirementsAnalysisSummary(created!);
  }

  async analyzeArchitectureImpact(scope: StaffScope, featureRequestId: string): Promise<AbArchitectureImpactSummary> {
    const request = await this.ensureFeatureRequest(scope.companyId, featureRequestId);
    const registry = await this.listFeatureRegistryEntries(scope.companyId);
    const impact = deriveArchitectureImpact(request, registry);
    const now = new Date();

    const [created] = await this.deps.db
      .insert(abArchitectureImpactAnalyses)
      .values({
        companyId: scope.companyId,
        featureRequestId,
        ...impact,
        analyzedAt: now,
      })
      .returning();

    await this.deps.db
      .update(abFeatureRequests)
      .set({ workflowStatus: 'planned', updatedAt: new Date() })
      .where(eq(abFeatureRequests.id, featureRequestId));

    await this.recordAudit(scope, 'architecture_impact_analyzed', 'ab_feature_request', featureRequestId, {
      architectureImpactId: created!.id,
    });
    return toArchitectureImpactSummary(created!);
  }

  async createDevelopmentWorkspace(
    scope: StaffScope,
    featureRequestId: string,
  ): Promise<AbDevelopmentWorkspaceSummary> {
    const request = await this.ensureFeatureRequest(scope.companyId, featureRequestId);
    const workspaceKey = `ws-${request.requestKey}-${randomUUID().slice(0, 8)}`;
    const branchName = `feature/${request.requestKey}`;
    const now = new Date();

    const [created] = await this.deps.db
      .insert(abDevelopmentWorkspaces)
      .values({
        companyId: scope.companyId,
        featureRequestId,
        workspaceKey,
        branchName,
        isolationMode: 'isolated_sandbox',
        status: 'active',
        filesChanged: {},
        startedAt: now,
      })
      .returning();

    await this.deps.db
      .update(abFeatureRequests)
      .set({ workflowStatus: 'in_development', updatedAt: new Date() })
      .where(eq(abFeatureRequests.id, featureRequestId));

    await this.recordAudit(scope, 'development_workspace_created', 'ab_development_workspace', created!.id, {
      featureRequestId,
      isolationMode: 'isolated_sandbox',
      productionUntouched: true,
    });
    return toDevelopmentWorkspaceSummary(created!);
  }

  async syncAppBuilderAlerts(scope: StaffScope): Promise<AbAppBuilderAlertSummary[]> {
    const companyId = scope.companyId;
    const syncedAt = new Date().toISOString();
    const [failedTests, failedDeployments, pendingSchemaPlans, existingOpenRows] = await Promise.all([
      this.deps.db.query.abTestRuns.findMany({
        where: and(eq(abTestRuns.companyId, companyId), eq(abTestRuns.workflowStatus, 'failed')),
        orderBy: [desc(abTestRuns.updatedAt)],
        limit: 20,
      }),
      this.deps.db.query.abDeployments.findMany({
        where: and(eq(abDeployments.companyId, companyId), eq(abDeployments.workflowStatus, 'failed')),
        orderBy: [desc(abDeployments.updatedAt)],
        limit: 20,
      }),
      this.deps.db.query.abDatabaseChangePlans.findMany({
        where: and(
          eq(abDatabaseChangePlans.companyId, companyId),
          eq(abDatabaseChangePlans.requiresOwnerApproval, true),
          inArray(abDatabaseChangePlans.workflowStatus, ['draft', 'review', 'pending_approval']),
        ),
        orderBy: [desc(abDatabaseChangePlans.updatedAt)],
        limit: 20,
      }),
      this.deps.db.query.abAppBuilderAlerts.findMany({
        where: and(eq(abAppBuilderAlerts.companyId, companyId), eq(abAppBuilderAlerts.status, 'open')),
        limit: 100,
      }),
    ]);

    for (const test of failedTests) {
      const alertKey = `test_failed:${test.id}`;
      if (!existingOpenRows.some((a) => (a.context as Record<string, unknown>)?.alertKey === alertKey)) {
        await this.createAppBuilderAlert(scope, {
          alertType: 'test_failed',
          severity: 'warning',
          title: `Failed test run: ${test.testSuite}`,
          description: `Test run ${test.runKey} failed with ${test.failedCount} failure(s).`,
          featureRequestId: test.featureRequestId,
          sourceModule: 'app_builder',
          context: { alertKey, testRunId: test.id, syncedAt },
        });
      }
    }

    for (const deployment of failedDeployments) {
      const alertKey = `deployment_failed:${deployment.id}`;
      if (!existingOpenRows.some((a) => (a.context as Record<string, unknown>)?.alertKey === alertKey)) {
        await this.createAppBuilderAlert(scope, {
          alertType: 'deployment_failed',
          severity: 'critical',
          title: `Failed deployment: ${deployment.deploymentKey}`,
          description: `Deployment to ${deployment.environment} failed.`,
          featureRequestId: deployment.featureRequestId,
          sourceModule: 'app_builder',
          context: { alertKey, deploymentId: deployment.id, syncedAt },
        });
      }
    }

    for (const plan of pendingSchemaPlans) {
      const alertKey = `schema_approval_pending:${plan.id}`;
      if (!existingOpenRows.some((a) => (a.context as Record<string, unknown>)?.alertKey === alertKey)) {
        await this.createAppBuilderAlert(scope, {
          alertType: 'schema_approval_pending',
          severity: 'warning',
          title: `Schema approval required: ${plan.migrationKey}`,
          description: plan.description ?? 'Database schema change requires owner approval.',
          featureRequestId: plan.featureRequestId,
          sourceModule: 'app_builder',
          context: { alertKey, databaseChangePlanId: plan.id, syncedAt },
        });
      }
    }

    await this.recordAudit(scope, 'app_builder_alerts_synced');
    return this.listAppBuilderAlerts(companyId, { status: 'open' });
  }

  async captureAnalytics(scope: StaffScope): Promise<AbAnalyticsSummary> {
    const dashboard = await this.getDashboard(scope.companyId);
    const [created] = await this.deps.db
      .insert(abAnalyticsSnapshots)
      .values({
        companyId: scope.companyId,
        metrics: {
          featureRequestCount: dashboard.featureRequestCount,
          pendingApprovalCount: dashboard.pendingApprovalCount,
          activeWorkspaceCount: dashboard.activeWorkspaceCount,
          failedTestCount: dashboard.failedTestCount,
          failedDeploymentCount: dashboard.failedDeploymentCount,
          openAlertCount: dashboard.openAlertCount,
          registryEntryCount: dashboard.registryEntryCount,
          overallBuildHealthStatus: dashboard.overallBuildHealthStatus,
        },
      })
      .returning();
    await this.recordAudit(scope, 'analytics_captured');
    return toAnalyticsSummary(created!);
  }

  async getLatestAnalytics(companyId: string): Promise<AbAnalyticsSummary | null> {
    const row = await this.deps.db.query.abAnalyticsSnapshots.findFirst({
      where: eq(abAnalyticsSnapshots.companyId, companyId),
      orderBy: [desc(abAnalyticsSnapshots.capturedAt)],
    });
    return row ? toAnalyticsSummary(row) : null;
  }

  async runTestValidation(scope: StaffScope, featureRequestId: string): Promise<AbTestRunSummary> {
    await this.ensureFeatureRequest(scope.companyId, featureRequestId);
    const runKey = `test-${randomUUID().slice(0, 8)}`;
    const now = new Date();

    const buildRecords = await this.deps.enterpriseItOperationsService.listBuildRecords(scope.companyId);
    const relatedBuild = buildRecords.find(
      (b) => b.workflowStatus === 'running' || b.workflowStatus === 'completed',
    );

    const [created] = await this.deps.db
      .insert(abTestRuns)
      .values({
        companyId: scope.companyId,
        featureRequestId,
        runKey,
        testSuite: 'app_builder_validation',
        workflowStatus: 'pending',
        startedAt: now,
        results: {
          queuedAt: now.toISOString(),
          buildRecordChecked: relatedBuild?.id ?? null,
          note: 'Test run queued — results recorded only when workflow completes.',
        },
      })
      .returning();

    await this.deps.db
      .update(abFeatureRequests)
      .set({ workflowStatus: 'testing', updatedAt: new Date() })
      .where(eq(abFeatureRequests.id, featureRequestId));

    await this.recordAudit(scope, 'test_validation_queued', 'ab_test_run', created!.id, {
      featureRequestId,
      buildRecordId: relatedBuild?.id ?? null,
    });
    return toTestRunSummary(created!);
  }

  async createPreview(scope: StaffScope, featureRequestId: string): Promise<AbPreviewRecordSummary> {
    const request = await this.ensureFeatureRequest(scope.companyId, featureRequestId);
    const workspace = await this.deps.db.query.abDevelopmentWorkspaces.findFirst({
      where: and(
        eq(abDevelopmentWorkspaces.companyId, scope.companyId),
        eq(abDevelopmentWorkspaces.featureRequestId, featureRequestId),
        eq(abDevelopmentWorkspaces.status, 'active'),
      ),
      orderBy: [desc(abDevelopmentWorkspaces.createdAt)],
    });

    const filesChanged = workspace?.filesChanged ?? {};
    const fileList = jsonArray(filesChanged, 'paths');
    const changeSummary =
      fileList.length > 0
        ? `Preview for "${request.title}" — ${fileList.length} file(s) changed in isolated workspace.`
        : `Preview for "${request.title}" — no workspace file changes recorded yet.`;

    const architectureImpact = await this.deps.db.query.abArchitectureImpactAnalyses.findFirst({
      where: and(
        eq(abArchitectureImpactAnalyses.companyId, scope.companyId),
        eq(abArchitectureImpactAnalyses.featureRequestId, featureRequestId),
      ),
      orderBy: [desc(abArchitectureImpactAnalyses.createdAt)],
    });

    const previewKey = `preview-${request.requestKey}-${randomUUID().slice(0, 8)}`;
    const [created] = await this.deps.db
      .insert(abPreviewRecords)
      .values({
        companyId: scope.companyId,
        featureRequestId,
        previewKey,
        changeSummary,
        filesModified: filesChanged,
        databaseImpact: architectureImpact?.databaseImpact ?? null,
        apiImpact: architectureImpact?.apiImpact ?? null,
        performanceImpact: architectureImpact?.breakingChangeRisk ?? null,
        securityImpact: architectureImpact?.securityImpact ?? null,
        capturedAt: new Date(),
      })
      .returning();

    await this.deps.db
      .update(abFeatureRequests)
      .set({ workflowStatus: 'preview', updatedAt: new Date() })
      .where(eq(abFeatureRequests.id, featureRequestId));

    await this.recordAudit(scope, 'preview_created', 'ab_preview_record', created!.id, { featureRequestId });
    return toPreviewRecordSummary(created!);
  }

  async submitForApproval(scope: StaffScope, featureRequestId: string): Promise<AbApprovalRecordSummary> {
    const request = await this.ensureFeatureRequest(scope.companyId, featureRequestId);
    const [architectureImpact, dbPlans] = await Promise.all([
      this.deps.db.query.abArchitectureImpactAnalyses.findFirst({
        where: and(
          eq(abArchitectureImpactAnalyses.companyId, scope.companyId),
          eq(abArchitectureImpactAnalyses.featureRequestId, featureRequestId),
        ),
        orderBy: [desc(abArchitectureImpactAnalyses.createdAt)],
      }),
      this.deps.db.query.abDatabaseChangePlans.findMany({
        where: and(
          eq(abDatabaseChangePlans.companyId, scope.companyId),
          eq(abDatabaseChangePlans.featureRequestId, featureRequestId),
        ),
      }),
    ]);

    const requiredAreas = resolveRequiredApprovalAreas(request, architectureImpact, dbPlans);
    const approvalType = requiredAreas.length > 0 ? 'owner_approval' : 'standard_approval';

    const [created] = await this.deps.db
      .insert(abApprovalRecords)
      .values({
        companyId: scope.companyId,
        featureRequestId,
        approvalType,
        workflowStatus: 'pending',
        requiredAreas: { areas: requiredAreas },
      })
      .returning();

    await this.deps.db
      .update(abFeatureRequests)
      .set({ workflowStatus: 'pending_approval', updatedAt: new Date() })
      .where(eq(abFeatureRequests.id, featureRequestId));

    await this.recordAudit(scope, 'feature_submitted_for_approval', 'ab_approval_record', created!.id, {
      featureRequestId,
      requiredAreas,
    });
    return toApprovalRecordSummary(created!);
  }

  async approveFeature(scope: StaffScope, featureRequestId: string): Promise<AbApprovalRecordSummary> {
    const approval = await this.ensurePendingApproval(scope.companyId, featureRequestId);
    const now = new Date();
    const [updated] = await this.deps.db
      .update(abApprovalRecords)
      .set({
        workflowStatus: 'approved',
        approvedByUserId: scope.userId,
        approvedAt: now,
        updatedAt: now,
      })
      .where(eq(abApprovalRecords.id, approval.id))
      .returning();

    await this.deps.db
      .update(abFeatureRequests)
      .set({ workflowStatus: 'approved', updatedAt: now })
      .where(eq(abFeatureRequests.id, featureRequestId));

    await this.recordAudit(scope, 'feature_approved', 'ab_feature_request', featureRequestId);
    return toApprovalRecordSummary(updated!);
  }

  async rejectFeature(
    scope: StaffScope,
    featureRequestId: string,
    reason: string,
  ): Promise<AbApprovalRecordSummary> {
    const approval = await this.ensurePendingApproval(scope.companyId, featureRequestId);
    const now = new Date();
    const [updated] = await this.deps.db
      .update(abApprovalRecords)
      .set({
        workflowStatus: 'rejected',
        rejectedReason: reason.trim(),
        approvedByUserId: scope.userId,
        updatedAt: now,
      })
      .where(eq(abApprovalRecords.id, approval.id))
      .returning();

    await this.deps.db
      .update(abFeatureRequests)
      .set({ workflowStatus: 'rejected', updatedAt: now })
      .where(eq(abFeatureRequests.id, featureRequestId));

    await this.recordAudit(scope, 'feature_rejected', 'ab_feature_request', featureRequestId, { reason });
    return toApprovalRecordSummary(updated!);
  }

  async deployApprovedFeature(
    scope: StaffScope,
    featureRequestId: string,
    input?: Partial<CreateAbDeploymentRequest> & { verificationFailed?: boolean },
  ): Promise<AbDeploymentSummary> {
    const request = await this.ensureFeatureRequest(scope.companyId, featureRequestId);
    if (request.workflowStatus !== 'approved') {
      throw new EnterpriseAppBuilderError('VALIDATION_ERROR', 'Feature must be approved before deployment');
    }

    const approval = await this.deps.db.query.abApprovalRecords.findFirst({
      where: and(
        eq(abApprovalRecords.companyId, scope.companyId),
        eq(abApprovalRecords.featureRequestId, featureRequestId),
        eq(abApprovalRecords.workflowStatus, 'approved'),
      ),
      orderBy: [desc(abApprovalRecords.approvedAt)],
    });
    if (!approval) {
      throw new EnterpriseAppBuilderError('VALIDATION_ERROR', 'No approved approval record found');
    }

    const now = new Date();
    const deploymentKey = input?.deploymentKey ?? `deploy-${request.requestKey}-${randomUUID().slice(0, 8)}`;
    const verificationFailed = input?.verificationFailed === true;

    const [created] = await this.deps.db
      .insert(abDeployments)
      .values({
        companyId: scope.companyId,
        featureRequestId,
        deploymentKey,
        environment: input?.environment ?? 'production',
        workflowStatus: verificationFailed ? 'failed' : 'deployed',
        version: input?.version ?? '1.0.0',
        deployedByUserId: scope.userId,
        startedAt: now,
        completedAt: now,
        verificationStatus: verificationFailed ? 'failed' : 'passed',
      })
      .returning();

    if (verificationFailed) {
      await this.deps.db.insert(abRollbacks).values({
        companyId: scope.companyId,
        deploymentId: created!.id,
        rollbackKey: `rollback-${deploymentKey}`,
        reason: 'Automatic rollback triggered by deployment verification failure',
        workflowStatus: 'executed',
        executedByUserId: scope.userId,
        executedAt: now,
        verified: false,
      });
      await this.deps.db
        .update(abFeatureRequests)
        .set({ workflowStatus: 'rolled_back', updatedAt: now })
        .where(eq(abFeatureRequests.id, featureRequestId));
    } else {
      await this.deps.db
        .update(abFeatureRequests)
        .set({ workflowStatus: 'deployed', updatedAt: now })
        .where(eq(abFeatureRequests.id, featureRequestId));
    }

    await this.recordAudit(scope, 'feature_deployed', 'ab_deployment', created!.id, {
      featureRequestId,
      verificationFailed,
    });
    return toDeploymentSummary(created!);
  }

  async rollbackDeployment(
    scope: StaffScope,
    deploymentId: string,
    reason: string,
  ): Promise<AbRollbackSummary> {
    const deployment = await this.ensureDeployment(scope.companyId, deploymentId);
    const now = new Date();
    const rollbackKey = `rollback-${deployment.deploymentKey}-${randomUUID().slice(0, 8)}`;

    const [created] = await this.deps.db
      .insert(abRollbacks)
      .values({
        companyId: scope.companyId,
        deploymentId,
        rollbackKey,
        reason: reason.trim(),
        workflowStatus: 'executed',
        executedByUserId: scope.userId,
        executedAt: now,
        verified: true,
      })
      .returning();

    await this.deps.db
      .update(abDeployments)
      .set({ workflowStatus: 'rolled_back', updatedAt: now })
      .where(eq(abDeployments.id, deploymentId));

    await this.deps.db
      .update(abFeatureRequests)
      .set({ workflowStatus: 'rolled_back', updatedAt: now })
      .where(eq(abFeatureRequests.id, deployment.featureRequestId));

    await this.recordAudit(scope, 'deployment_rolled_back', 'ab_rollback', created!.id, {
      deploymentId,
      reason,
    });
    return toRollbackSummary(created!);
  }

  async executeSafeBuildAction(
    scope: StaffScope,
    input: ExecuteAbSafeBuildActionRequest,
  ): Promise<ExecuteSafeBuildActionResult> {
    if (!SAFE_BUILD_ACTION_KEYS.includes(input.actionKey as (typeof SAFE_BUILD_ACTION_KEYS)[number])) {
      throw new EnterpriseAppBuilderError('VALIDATION_ERROR', 'Only configured low-risk build actions are allowed');
    }

    let output: Record<string, unknown> = {};
    let verified = false;
    let workflowStatus = 'executed';

    if (input.actionKey === 'documentation_sync') {
      const docs = await this.listDocumentationUpdates(scope.companyId);
      output = { documentationUpdateCount: docs.length, syncedAt: new Date().toISOString() };
      verified = true;
    } else if (input.actionKey === 'registry_update') {
      const registry = await this.listFeatureRegistryEntries(scope.companyId);
      output = { registryEntryCount: registry.length, syncedAt: new Date().toISOString() };
      verified = true;
    } else if (input.actionKey === 'preview_refresh') {
      const featureRequestId = String(input.input?.featureRequestId ?? '');
      if (!featureRequestId) {
        throw new EnterpriseAppBuilderError('VALIDATION_ERROR', 'featureRequestId is required for preview_refresh');
      }
      const preview = await this.createPreview(scope, featureRequestId);
      output = { previewId: preview.id, previewKey: preview.previewKey };
      verified = true;
    } else if (input.actionKey === 'test_queue') {
      const featureRequestId = String(input.input?.featureRequestId ?? '');
      if (!featureRequestId) {
        throw new EnterpriseAppBuilderError('VALIDATION_ERROR', 'featureRequestId is required for test_queue');
      }
      const testRun = await this.runTestValidation(scope, featureRequestId);
      output = { testRunId: testRun.id, runKey: testRun.runKey, workflowStatus: testRun.workflowStatus };
      verified = testRun.workflowStatus === 'pending';
      workflowStatus = testRun.workflowStatus;
    }

    await this.recordAudit(scope, 'safe_build_action_executed', undefined, undefined, {
      actionKey: input.actionKey,
      verified,
      output,
    });

    return { actionKey: input.actionKey, verified, workflowStatus, output };
  }

  async acknowledgeAppBuilderAlert(scope: StaffScope, alertId: string): Promise<AbAppBuilderAlertSummary> {
    await this.ensureAppBuilderAlert(scope.companyId, alertId);
    const [updated] = await this.deps.db
      .update(abAppBuilderAlerts)
      .set({ status: 'acknowledged', updatedAt: new Date() })
      .where(eq(abAppBuilderAlerts.id, alertId))
      .returning();
    await this.recordAudit(scope, 'app_builder_alert_acknowledged', 'ab_app_builder_alert', alertId);
    return toAppBuilderAlertSummary(updated!);
  }

  // --- Feature requests CRUD ---

  async createFeatureRequest(scope: StaffScope, input: CreateAbFeatureRequestRequest): Promise<AbFeatureRequestSummary> {
    const [created] = await this.deps.db
      .insert(abFeatureRequests)
      .values({
        companyId: scope.companyId,
        ...mapCreateFeatureRequestInput(input, scope),
      })
      .returning();
    await this.recordAudit(scope, 'feature_request_created', 'ab_feature_request', created!.id);
    return toFeatureRequestSummary(created!);
  }

  async listFeatureRequests(companyId: string): Promise<AbFeatureRequestSummary[]> {
    const rows = await this.deps.db.query.abFeatureRequests.findMany({
      where: eq(abFeatureRequests.companyId, companyId),
      orderBy: [desc(abFeatureRequests.createdAt)],
      limit: 100,
    });
    return rows.map(toFeatureRequestSummary);
  }

  async getFeatureRequest(companyId: string, id: string): Promise<AbFeatureRequestSummary | null> {
    const row = await this.deps.db.query.abFeatureRequests.findFirst({
      where: and(eq(abFeatureRequests.companyId, companyId), eq(abFeatureRequests.id, id)),
    });
    return row ? toFeatureRequestSummary(row) : null;
  }

  async updateFeatureRequest(
    scope: StaffScope,
    id: string,
    input: UpdateAbFeatureRequestRequest,
  ): Promise<AbFeatureRequestSummary> {
    await this.ensureFeatureRequest(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(abFeatureRequests)
      .set({ ...mapUpdateFeatureRequestInput(input), updatedAt: new Date() })
      .where(and(eq(abFeatureRequests.companyId, scope.companyId), eq(abFeatureRequests.id, id)))
      .returning();
    await this.recordAudit(scope, 'feature_request_updated', 'ab_feature_request', id);
    return toFeatureRequestSummary(updated!);
  }

  // --- Requirements analyses CRUD ---

  async createRequirementsAnalysis(
    scope: StaffScope,
    input: CreateAbRequirementsAnalysisRequest,
  ): Promise<AbRequirementsAnalysisSummary> {
    const [created] = await this.deps.db
      .insert(abRequirementsAnalyses)
      .values({
        companyId: scope.companyId,
        ...mapCreateRequirementsAnalysisInput(input),
      })
      .returning();
    await this.recordAudit(scope, 'requirements_analysis_created', 'ab_requirements_analysis', created!.id);
    return toRequirementsAnalysisSummary(created!);
  }

  async listRequirementsAnalyses(companyId: string): Promise<AbRequirementsAnalysisSummary[]> {
    const rows = await this.deps.db.query.abRequirementsAnalyses.findMany({
      where: eq(abRequirementsAnalyses.companyId, companyId),
      orderBy: [desc(abRequirementsAnalyses.createdAt)],
      limit: 100,
    });
    return rows.map(toRequirementsAnalysisSummary);
  }

  async getRequirementsAnalysis(companyId: string, id: string): Promise<AbRequirementsAnalysisSummary | null> {
    const row = await this.deps.db.query.abRequirementsAnalyses.findFirst({
      where: and(eq(abRequirementsAnalyses.companyId, companyId), eq(abRequirementsAnalyses.id, id)),
    });
    return row ? toRequirementsAnalysisSummary(row) : null;
  }

  async updateRequirementsAnalysis(
    scope: StaffScope,
    id: string,
    input: UpdateAbRequirementsAnalysisRequest,
  ): Promise<AbRequirementsAnalysisSummary> {
    await this.ensureRequirementsAnalysis(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(abRequirementsAnalyses)
      .set({ ...mapUpdateRequirementsAnalysisInput(input), updatedAt: new Date() })
      .where(and(eq(abRequirementsAnalyses.companyId, scope.companyId), eq(abRequirementsAnalyses.id, id)))
      .returning();
    await this.recordAudit(scope, 'requirements_analysis_updated', 'ab_requirements_analysis', id);
    return toRequirementsAnalysisSummary(updated!);
  }

  // --- Architecture impact CRUD ---

  async createArchitectureImpactAnalysis(
    scope: StaffScope,
    input: CreateAbArchitectureImpactRequest,
  ): Promise<AbArchitectureImpactSummary> {
    const [created] = await this.deps.db
      .insert(abArchitectureImpactAnalyses)
      .values({
        companyId: scope.companyId,
        ...mapCreateArchitectureImpactInput(input),
      })
      .returning();
    await this.recordAudit(scope, 'architecture_impact_created', 'ab_architecture_impact_analysis', created!.id);
    return toArchitectureImpactSummary(created!);
  }

  async listArchitectureImpactAnalyses(companyId: string): Promise<AbArchitectureImpactSummary[]> {
    const rows = await this.deps.db.query.abArchitectureImpactAnalyses.findMany({
      where: eq(abArchitectureImpactAnalyses.companyId, companyId),
      orderBy: [desc(abArchitectureImpactAnalyses.createdAt)],
      limit: 100,
    });
    return rows.map(toArchitectureImpactSummary);
  }

  async getArchitectureImpactAnalysis(companyId: string, id: string): Promise<AbArchitectureImpactSummary | null> {
    const row = await this.deps.db.query.abArchitectureImpactAnalyses.findFirst({
      where: and(eq(abArchitectureImpactAnalyses.companyId, companyId), eq(abArchitectureImpactAnalyses.id, id)),
    });
    return row ? toArchitectureImpactSummary(row) : null;
  }

  async updateArchitectureImpactAnalysis(
    scope: StaffScope,
    id: string,
    input: UpdateAbArchitectureImpactRequest,
  ): Promise<AbArchitectureImpactSummary> {
    await this.ensureArchitectureImpactAnalysis(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(abArchitectureImpactAnalyses)
      .set({ ...mapUpdateArchitectureImpactInput(input), updatedAt: new Date() })
      .where(and(eq(abArchitectureImpactAnalyses.companyId, scope.companyId), eq(abArchitectureImpactAnalyses.id, id)))
      .returning();
    await this.recordAudit(scope, 'architecture_impact_updated', 'ab_architecture_impact_analysis', id);
    return toArchitectureImpactSummary(updated!);
  }

  // --- Development workspaces CRUD ---

  async createDevelopmentWorkspaceRecord(
    scope: StaffScope,
    input: CreateAbDevelopmentWorkspaceRequest,
  ): Promise<AbDevelopmentWorkspaceSummary> {
    const [created] = await this.deps.db
      .insert(abDevelopmentWorkspaces)
      .values({
        companyId: scope.companyId,
        ...mapCreateDevelopmentWorkspaceInput(input),
      })
      .returning();
    await this.recordAudit(scope, 'development_workspace_record_created', 'ab_development_workspace', created!.id);
    return toDevelopmentWorkspaceSummary(created!);
  }

  async listDevelopmentWorkspaces(companyId: string): Promise<AbDevelopmentWorkspaceSummary[]> {
    const rows = await this.deps.db.query.abDevelopmentWorkspaces.findMany({
      where: eq(abDevelopmentWorkspaces.companyId, companyId),
      orderBy: [desc(abDevelopmentWorkspaces.createdAt)],
      limit: 100,
    });
    return rows.map(toDevelopmentWorkspaceSummary);
  }

  async getDevelopmentWorkspace(companyId: string, id: string): Promise<AbDevelopmentWorkspaceSummary | null> {
    const row = await this.deps.db.query.abDevelopmentWorkspaces.findFirst({
      where: and(eq(abDevelopmentWorkspaces.companyId, companyId), eq(abDevelopmentWorkspaces.id, id)),
    });
    return row ? toDevelopmentWorkspaceSummary(row) : null;
  }

  async updateDevelopmentWorkspace(
    scope: StaffScope,
    id: string,
    input: UpdateAbDevelopmentWorkspaceRequest,
  ): Promise<AbDevelopmentWorkspaceSummary> {
    await this.ensureDevelopmentWorkspace(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(abDevelopmentWorkspaces)
      .set({ ...mapUpdateDevelopmentWorkspaceInput(input), updatedAt: new Date() })
      .where(and(eq(abDevelopmentWorkspaces.companyId, scope.companyId), eq(abDevelopmentWorkspaces.id, id)))
      .returning();
    await this.recordAudit(scope, 'development_workspace_updated', 'ab_development_workspace', id);
    return toDevelopmentWorkspaceSummary(updated!);
  }

  // --- Code generation records CRUD (metadata/paths only, no fake generation) ---

  async createCodeGenerationRecord(
    scope: StaffScope,
    input: CreateAbCodeGenerationRecordRequest,
  ): Promise<AbCodeGenerationRecordSummary> {
    if (!input.artifactPath?.trim()) {
      throw new EnterpriseAppBuilderError(
        'VALIDATION_ERROR',
        'artifactPath is required — code generation records store metadata/paths only with real artifact references',
      );
    }
    const [created] = await this.deps.db
      .insert(abCodeGenerationRecords)
      .values({
        companyId: scope.companyId,
        ...mapCreateCodeGenerationRecordInput(input),
      })
      .returning();
    await this.recordAudit(scope, 'code_generation_record_created', 'ab_code_generation_record', created!.id);
    return toCodeGenerationRecordSummary(created!);
  }

  async listCodeGenerationRecords(companyId: string): Promise<AbCodeGenerationRecordSummary[]> {
    const rows = await this.deps.db.query.abCodeGenerationRecords.findMany({
      where: eq(abCodeGenerationRecords.companyId, companyId),
      orderBy: [desc(abCodeGenerationRecords.createdAt)],
      limit: 100,
    });
    return rows.map(toCodeGenerationRecordSummary);
  }

  async getCodeGenerationRecord(companyId: string, id: string): Promise<AbCodeGenerationRecordSummary | null> {
    const row = await this.deps.db.query.abCodeGenerationRecords.findFirst({
      where: and(eq(abCodeGenerationRecords.companyId, companyId), eq(abCodeGenerationRecords.id, id)),
    });
    return row ? toCodeGenerationRecordSummary(row) : null;
  }

  async updateCodeGenerationRecord(
    scope: StaffScope,
    id: string,
    input: UpdateAbCodeGenerationRecordRequest,
  ): Promise<AbCodeGenerationRecordSummary> {
    await this.ensureCodeGenerationRecord(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(abCodeGenerationRecords)
      .set({ ...mapUpdateCodeGenerationRecordInput(input), updatedAt: new Date() })
      .where(and(eq(abCodeGenerationRecords.companyId, scope.companyId), eq(abCodeGenerationRecords.id, id)))
      .returning();
    await this.recordAudit(scope, 'code_generation_record_updated', 'ab_code_generation_record', id);
    return toCodeGenerationRecordSummary(updated!);
  }

  // --- Database change plans CRUD ---

  async createDatabaseChangePlan(
    scope: StaffScope,
    input: CreateAbDatabaseChangePlanRequest,
  ): Promise<AbDatabaseChangePlanSummary> {
    const [created] = await this.deps.db
      .insert(abDatabaseChangePlans)
      .values({
        companyId: scope.companyId,
        ...mapCreateDatabaseChangePlanInput(input),
        requiresOwnerApproval: true,
      })
      .returning();
    await this.recordAudit(scope, 'database_change_plan_created', 'ab_database_change_plan', created!.id);
    return toDatabaseChangePlanSummary(created!);
  }

  async listDatabaseChangePlans(companyId: string): Promise<AbDatabaseChangePlanSummary[]> {
    const rows = await this.deps.db.query.abDatabaseChangePlans.findMany({
      where: eq(abDatabaseChangePlans.companyId, companyId),
      orderBy: [desc(abDatabaseChangePlans.createdAt)],
      limit: 100,
    });
    return rows.map(toDatabaseChangePlanSummary);
  }

  async getDatabaseChangePlan(companyId: string, id: string): Promise<AbDatabaseChangePlanSummary | null> {
    const row = await this.deps.db.query.abDatabaseChangePlans.findFirst({
      where: and(eq(abDatabaseChangePlans.companyId, companyId), eq(abDatabaseChangePlans.id, id)),
    });
    return row ? toDatabaseChangePlanSummary(row) : null;
  }

  async updateDatabaseChangePlan(
    scope: StaffScope,
    id: string,
    input: UpdateAbDatabaseChangePlanRequest,
  ): Promise<AbDatabaseChangePlanSummary> {
    await this.ensureDatabaseChangePlan(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(abDatabaseChangePlans)
      .set({
        ...mapUpdateDatabaseChangePlanInput(input),
        requiresOwnerApproval: true,
        updatedAt: new Date(),
      })
      .where(and(eq(abDatabaseChangePlans.companyId, scope.companyId), eq(abDatabaseChangePlans.id, id)))
      .returning();
    await this.recordAudit(scope, 'database_change_plan_updated', 'ab_database_change_plan', id);
    return toDatabaseChangePlanSummary(updated!);
  }

  // --- Test runs CRUD ---

  async createTestRun(scope: StaffScope, input: CreateAbTestRunRequest): Promise<AbTestRunSummary> {
    const [created] = await this.deps.db
      .insert(abTestRuns)
      .values({
        companyId: scope.companyId,
        ...mapCreateTestRunInput(input),
      })
      .returning();
    await this.recordAudit(scope, 'test_run_created', 'ab_test_run', created!.id);
    return toTestRunSummary(created!);
  }

  async listTestRuns(companyId: string): Promise<AbTestRunSummary[]> {
    const rows = await this.deps.db.query.abTestRuns.findMany({
      where: eq(abTestRuns.companyId, companyId),
      orderBy: [desc(abTestRuns.createdAt)],
      limit: 100,
    });
    return rows.map(toTestRunSummary);
  }

  async getTestRun(companyId: string, id: string): Promise<AbTestRunSummary | null> {
    const row = await this.deps.db.query.abTestRuns.findFirst({
      where: and(eq(abTestRuns.companyId, companyId), eq(abTestRuns.id, id)),
    });
    return row ? toTestRunSummary(row) : null;
  }

  async updateTestRun(scope: StaffScope, id: string, input: UpdateAbTestRunRequest): Promise<AbTestRunSummary> {
    await this.ensureTestRun(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(abTestRuns)
      .set({ ...mapUpdateTestRunInput(input), updatedAt: new Date() })
      .where(and(eq(abTestRuns.companyId, scope.companyId), eq(abTestRuns.id, id)))
      .returning();
    await this.recordAudit(scope, 'test_run_updated', 'ab_test_run', id);
    return toTestRunSummary(updated!);
  }

  // --- Preview records CRUD ---

  async createPreviewRecord(scope: StaffScope, input: CreateAbPreviewRecordRequest): Promise<AbPreviewRecordSummary> {
    const [created] = await this.deps.db
      .insert(abPreviewRecords)
      .values({
        companyId: scope.companyId,
        ...mapCreatePreviewRecordInput(input),
      })
      .returning();
    await this.recordAudit(scope, 'preview_record_created', 'ab_preview_record', created!.id);
    return toPreviewRecordSummary(created!);
  }

  async listPreviewRecords(companyId: string): Promise<AbPreviewRecordSummary[]> {
    const rows = await this.deps.db.query.abPreviewRecords.findMany({
      where: eq(abPreviewRecords.companyId, companyId),
      orderBy: [desc(abPreviewRecords.capturedAt)],
      limit: 100,
    });
    return rows.map(toPreviewRecordSummary);
  }

  async getPreviewRecord(companyId: string, id: string): Promise<AbPreviewRecordSummary | null> {
    const row = await this.deps.db.query.abPreviewRecords.findFirst({
      where: and(eq(abPreviewRecords.companyId, companyId), eq(abPreviewRecords.id, id)),
    });
    return row ? toPreviewRecordSummary(row) : null;
  }

  async updatePreviewRecord(
    scope: StaffScope,
    id: string,
    input: UpdateAbPreviewRecordRequest,
  ): Promise<AbPreviewRecordSummary> {
    await this.ensurePreviewRecord(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(abPreviewRecords)
      .set({ ...mapUpdatePreviewRecordInput(input), updatedAt: new Date() })
      .where(and(eq(abPreviewRecords.companyId, scope.companyId), eq(abPreviewRecords.id, id)))
      .returning();
    await this.recordAudit(scope, 'preview_record_updated', 'ab_preview_record', id);
    return toPreviewRecordSummary(updated!);
  }

  // --- Approval records CRUD ---

  async createApprovalRecord(
    scope: StaffScope,
    input: CreateAbApprovalRecordRequest,
  ): Promise<AbApprovalRecordSummary> {
    const [created] = await this.deps.db
      .insert(abApprovalRecords)
      .values({
        companyId: scope.companyId,
        ...mapCreateApprovalRecordInput(input),
      })
      .returning();
    await this.recordAudit(scope, 'approval_record_created', 'ab_approval_record', created!.id);
    return toApprovalRecordSummary(created!);
  }

  async listApprovalRecords(companyId: string): Promise<AbApprovalRecordSummary[]> {
    const rows = await this.deps.db.query.abApprovalRecords.findMany({
      where: eq(abApprovalRecords.companyId, companyId),
      orderBy: [desc(abApprovalRecords.createdAt)],
      limit: 100,
    });
    return rows.map(toApprovalRecordSummary);
  }

  async getApprovalRecord(companyId: string, id: string): Promise<AbApprovalRecordSummary | null> {
    const row = await this.deps.db.query.abApprovalRecords.findFirst({
      where: and(eq(abApprovalRecords.companyId, companyId), eq(abApprovalRecords.id, id)),
    });
    return row ? toApprovalRecordSummary(row) : null;
  }

  async updateApprovalRecord(
    scope: StaffScope,
    id: string,
    input: UpdateAbApprovalRecordRequest,
  ): Promise<AbApprovalRecordSummary> {
    await this.ensureApprovalRecord(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(abApprovalRecords)
      .set({ ...mapUpdateApprovalRecordInput(input), updatedAt: new Date() })
      .where(and(eq(abApprovalRecords.companyId, scope.companyId), eq(abApprovalRecords.id, id)))
      .returning();
    await this.recordAudit(scope, 'approval_record_updated', 'ab_approval_record', id);
    return toApprovalRecordSummary(updated!);
  }

  // --- Deployments CRUD ---

  async createDeployment(scope: StaffScope, input: CreateAbDeploymentRequest): Promise<AbDeploymentSummary> {
    const [created] = await this.deps.db
      .insert(abDeployments)
      .values({
        companyId: scope.companyId,
        ...mapCreateDeploymentInput(input, scope),
      })
      .returning();
    await this.recordAudit(scope, 'deployment_created', 'ab_deployment', created!.id);
    return toDeploymentSummary(created!);
  }

  async listDeployments(companyId: string): Promise<AbDeploymentSummary[]> {
    const rows = await this.deps.db.query.abDeployments.findMany({
      where: eq(abDeployments.companyId, companyId),
      orderBy: [desc(abDeployments.createdAt)],
      limit: 100,
    });
    return rows.map(toDeploymentSummary);
  }

  async getDeployment(companyId: string, id: string): Promise<AbDeploymentSummary | null> {
    const row = await this.deps.db.query.abDeployments.findFirst({
      where: and(eq(abDeployments.companyId, companyId), eq(abDeployments.id, id)),
    });
    return row ? toDeploymentSummary(row) : null;
  }

  async updateDeployment(
    scope: StaffScope,
    id: string,
    input: UpdateAbDeploymentRequest,
  ): Promise<AbDeploymentSummary> {
    await this.ensureDeployment(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(abDeployments)
      .set({ ...mapUpdateDeploymentInput(input), updatedAt: new Date() })
      .where(and(eq(abDeployments.companyId, scope.companyId), eq(abDeployments.id, id)))
      .returning();
    await this.recordAudit(scope, 'deployment_updated', 'ab_deployment', id);
    return toDeploymentSummary(updated!);
  }

  // --- Rollbacks CRUD ---

  async createRollback(scope: StaffScope, input: CreateAbRollbackRequest): Promise<AbRollbackSummary> {
    const [created] = await this.deps.db
      .insert(abRollbacks)
      .values({
        companyId: scope.companyId,
        ...mapCreateRollbackInput(input, scope),
      })
      .returning();
    await this.recordAudit(scope, 'rollback_created', 'ab_rollback', created!.id);
    return toRollbackSummary(created!);
  }

  async listRollbacks(companyId: string): Promise<AbRollbackSummary[]> {
    const rows = await this.deps.db.query.abRollbacks.findMany({
      where: eq(abRollbacks.companyId, companyId),
      orderBy: [desc(abRollbacks.createdAt)],
      limit: 100,
    });
    return rows.map(toRollbackSummary);
  }

  async getRollback(companyId: string, id: string): Promise<AbRollbackSummary | null> {
    const row = await this.deps.db.query.abRollbacks.findFirst({
      where: and(eq(abRollbacks.companyId, companyId), eq(abRollbacks.id, id)),
    });
    return row ? toRollbackSummary(row) : null;
  }

  async updateRollback(scope: StaffScope, id: string, input: UpdateAbRollbackRequest): Promise<AbRollbackSummary> {
    await this.ensureRollback(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(abRollbacks)
      .set({ ...mapUpdateRollbackInput(input, scope), updatedAt: new Date() })
      .where(and(eq(abRollbacks.companyId, scope.companyId), eq(abRollbacks.id, id)))
      .returning();
    await this.recordAudit(scope, 'rollback_updated', 'ab_rollback', id);
    return toRollbackSummary(updated!);
  }

  // --- Documentation updates CRUD ---

  async createDocumentationUpdate(
    scope: StaffScope,
    input: CreateAbDocumentationUpdateRequest,
  ): Promise<AbDocumentationUpdateSummary> {
    const [created] = await this.deps.db
      .insert(abDocumentationUpdates)
      .values({
        companyId: scope.companyId,
        ...mapCreateDocumentationUpdateInput(input),
      })
      .returning();
    await this.recordAudit(scope, 'documentation_update_created', 'ab_documentation_update', created!.id);
    return toDocumentationUpdateSummary(created!);
  }

  async listDocumentationUpdates(companyId: string): Promise<AbDocumentationUpdateSummary[]> {
    const rows = await this.deps.db.query.abDocumentationUpdates.findMany({
      where: eq(abDocumentationUpdates.companyId, companyId),
      orderBy: [desc(abDocumentationUpdates.updatedAt)],
      limit: 100,
    });
    return rows.map(toDocumentationUpdateSummary);
  }

  async getDocumentationUpdate(companyId: string, id: string): Promise<AbDocumentationUpdateSummary | null> {
    const row = await this.deps.db.query.abDocumentationUpdates.findFirst({
      where: and(eq(abDocumentationUpdates.companyId, companyId), eq(abDocumentationUpdates.id, id)),
    });
    return row ? toDocumentationUpdateSummary(row) : null;
  }

  async updateDocumentationUpdate(
    scope: StaffScope,
    id: string,
    input: UpdateAbDocumentationUpdateRequest,
  ): Promise<AbDocumentationUpdateSummary> {
    await this.ensureDocumentationUpdate(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(abDocumentationUpdates)
      .set({ ...mapUpdateDocumentationUpdateInput(input), updatedAt: new Date() })
      .where(and(eq(abDocumentationUpdates.companyId, scope.companyId), eq(abDocumentationUpdates.id, id)))
      .returning();
    await this.recordAudit(scope, 'documentation_update_updated', 'ab_documentation_update', id);
    return toDocumentationUpdateSummary(updated!);
  }

  // --- Feature registry CRUD ---

  async createFeatureRegistryEntry(
    scope: StaffScope,
    input: CreateAbFeatureRegistryEntryRequest,
  ): Promise<AbFeatureRegistryEntrySummary> {
    const [created] = await this.deps.db
      .insert(abFeatureRegistryEntries)
      .values({
        companyId: scope.companyId,
        ...mapCreateFeatureRegistryEntryInput(input),
      })
      .returning();
    await this.recordAudit(scope, 'feature_registry_entry_created', 'ab_feature_registry_entry', created!.id);
    return toFeatureRegistryEntrySummary(created!);
  }

  async listFeatureRegistryEntries(companyId: string): Promise<AbFeatureRegistryEntrySummary[]> {
    const rows = await this.deps.db.query.abFeatureRegistryEntries.findMany({
      where: eq(abFeatureRegistryEntries.companyId, companyId),
      orderBy: [desc(abFeatureRegistryEntries.updatedAt)],
      limit: 100,
    });
    return rows.map(toFeatureRegistryEntrySummary);
  }

  async getFeatureRegistryEntry(companyId: string, id: string): Promise<AbFeatureRegistryEntrySummary | null> {
    const row = await this.deps.db.query.abFeatureRegistryEntries.findFirst({
      where: and(eq(abFeatureRegistryEntries.companyId, companyId), eq(abFeatureRegistryEntries.id, id)),
    });
    return row ? toFeatureRegistryEntrySummary(row) : null;
  }

  async updateFeatureRegistryEntry(
    scope: StaffScope,
    id: string,
    input: UpdateAbFeatureRegistryEntryRequest,
  ): Promise<AbFeatureRegistryEntrySummary> {
    await this.ensureFeatureRegistryEntry(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(abFeatureRegistryEntries)
      .set({ ...mapUpdateFeatureRegistryEntryInput(input), updatedAt: new Date() })
      .where(and(eq(abFeatureRegistryEntries.companyId, scope.companyId), eq(abFeatureRegistryEntries.id, id)))
      .returning();
    await this.recordAudit(scope, 'feature_registry_entry_updated', 'ab_feature_registry_entry', id);
    return toFeatureRegistryEntrySummary(updated!);
  }

  // --- App builder alerts CRUD ---

  async createAppBuilderAlert(
    scope: StaffScope,
    input: {
      alertType: string;
      severity?: string;
      title: string;
      description?: string;
      featureRequestId?: string;
      sourceModule?: string;
      context?: Record<string, unknown>;
    },
  ): Promise<AbAppBuilderAlertSummary> {
    const [created] = await this.deps.db
      .insert(abAppBuilderAlerts)
      .values({
        companyId: scope.companyId,
        alertType: input.alertType.trim(),
        severity: (input.severity ?? 'warning') as typeof abAppBuilderAlerts.$inferInsert.severity,
        title: input.title.trim(),
        description: input.description ?? null,
        featureRequestId: input.featureRequestId ?? null,
        sourceModule: input.sourceModule ?? 'app_builder',
        context: input.context ?? {},
      })
      .returning();
    await this.recordAudit(scope, 'app_builder_alert_created', 'ab_app_builder_alert', created!.id);
    return toAppBuilderAlertSummary(created!);
  }

  async listAppBuilderAlerts(
    companyId: string,
    filters?: { status?: string },
  ): Promise<AbAppBuilderAlertSummary[]> {
    const rows = await this.deps.db.query.abAppBuilderAlerts.findMany({
      where: filters?.status
        ? and(
            eq(abAppBuilderAlerts.companyId, companyId),
            eq(abAppBuilderAlerts.status, filters.status as typeof abAppBuilderAlerts.$inferSelect.status),
          )
        : eq(abAppBuilderAlerts.companyId, companyId),
      orderBy: [desc(abAppBuilderAlerts.createdAt)],
      limit: 100,
    });
    return rows.map(toAppBuilderAlertSummary);
  }

  async getAppBuilderAlert(companyId: string, id: string): Promise<AbAppBuilderAlertSummary | null> {
    const row = await this.deps.db.query.abAppBuilderAlerts.findFirst({
      where: and(eq(abAppBuilderAlerts.companyId, companyId), eq(abAppBuilderAlerts.id, id)),
    });
    return row ? toAppBuilderAlertSummary(row) : null;
  }

  async updateAppBuilderAlert(
    scope: StaffScope,
    id: string,
    input: UpdateAbAppBuilderAlertRequest,
  ): Promise<AbAppBuilderAlertSummary> {
    await this.ensureAppBuilderAlert(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(abAppBuilderAlerts)
      .set({ ...mapUpdateAppBuilderAlertInput(input), updatedAt: new Date() })
      .where(and(eq(abAppBuilderAlerts.companyId, scope.companyId), eq(abAppBuilderAlerts.id, id)))
      .returning();
    await this.recordAudit(scope, 'app_builder_alert_updated', 'ab_app_builder_alert', id);
    return toAppBuilderAlertSummary(updated!);
  }

  // --- Action drafts ---

  async createActionDraft(
    scope: StaffScope,
    input: CreateAbAppBuilderActionDraftRequest,
  ): Promise<AbActionDraftSummary> {
    const [created] = await this.deps.db
      .insert(abActionDrafts)
      .values({
        companyId: scope.companyId,
        ...mapCreateActionDraftInput(input),
      })
      .returning();
    await this.recordAudit(scope, 'action_draft_created', 'ab_action_draft', created!.id);
    return toActionDraftSummary(created!);
  }

  async listActionDrafts(companyId: string): Promise<AbActionDraftSummary[]> {
    const rows = await this.deps.db.query.abActionDrafts.findMany({
      where: eq(abActionDrafts.companyId, companyId),
      orderBy: [desc(abActionDrafts.createdAt)],
      limit: 100,
    });
    return rows.map(toActionDraftSummary);
  }

  async getActionDraft(companyId: string, id: string): Promise<AbActionDraftSummary | null> {
    const row = await this.deps.db.query.abActionDrafts.findFirst({
      where: and(eq(abActionDrafts.companyId, companyId), eq(abActionDrafts.id, id)),
    });
    return row ? toActionDraftSummary(row) : null;
  }

  async updateActionDraft(
    scope: StaffScope,
    id: string,
    input: UpdateAbActionDraftRequest,
  ): Promise<AbActionDraftSummary> {
    await this.ensureActionDraft(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(abActionDrafts)
      .set({ ...mapUpdateActionDraftInput(input), updatedAt: new Date() })
      .where(and(eq(abActionDrafts.companyId, scope.companyId), eq(abActionDrafts.id, id)))
      .returning();
    await this.recordAudit(scope, 'action_draft_updated', 'ab_action_draft', id);
    return toActionDraftSummary(updated!);
  }

  // --- Audit logs ---

  async listAuditLogs(companyId: string, limit = 100): Promise<AbAuditLogSummary[]> {
    const rows = await this.deps.db.query.abAuditLogs.findMany({
      where: eq(abAuditLogs.companyId, companyId),
      orderBy: [desc(abAuditLogs.createdAt)],
      limit,
    });
    return rows.map(toAuditLogSummary);
  }

  async getAuditLog(companyId: string, id: string): Promise<AbAuditLogSummary | null> {
    const row = await this.deps.db.query.abAuditLogs.findFirst({
      where: and(eq(abAuditLogs.companyId, companyId), eq(abAuditLogs.id, id)),
    });
    return row ? toAuditLogSummary(row) : null;
  }

  // --- Private helpers ---

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.abPlatformConfig.findFirst({
      where: eq(abPlatformConfig.companyId, companyId),
    });
    if (existing) return existing;
    const [created] = await this.deps.db
      .insert(abPlatformConfig)
      .values({
        companyId,
        ownerApprovalRequiredAreas: { areas: [...OWNER_APPROVAL_REQUIRED_AREAS] },
      })
      .returning();
    return created!;
  }

  private async recordAudit(
    scope: StaffScope,
    actionType: string,
    entityType?: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.deps.db.insert(abAuditLogs).values({
      companyId: scope.companyId,
      userId: scope.userId,
      actionType,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      metadata: metadata ?? {},
    });
  }

  private async ensureFeatureRequest(companyId: string, id: string) {
    const row = await this.deps.db.query.abFeatureRequests.findFirst({
      where: and(eq(abFeatureRequests.companyId, companyId), eq(abFeatureRequests.id, id)),
    });
    if (!row) throw new EnterpriseAppBuilderError('NOT_FOUND', 'Feature request not found');
    return row;
  }

  private async ensurePendingApproval(companyId: string, featureRequestId: string) {
    const row = await this.deps.db.query.abApprovalRecords.findFirst({
      where: and(
        eq(abApprovalRecords.companyId, companyId),
        eq(abApprovalRecords.featureRequestId, featureRequestId),
        eq(abApprovalRecords.workflowStatus, 'pending'),
      ),
      orderBy: [desc(abApprovalRecords.createdAt)],
    });
    if (!row) throw new EnterpriseAppBuilderError('NOT_FOUND', 'Pending approval record not found');
    return row;
  }

  private async ensureRequirementsAnalysis(companyId: string, id: string) {
    const row = await this.deps.db.query.abRequirementsAnalyses.findFirst({
      where: and(eq(abRequirementsAnalyses.companyId, companyId), eq(abRequirementsAnalyses.id, id)),
    });
    if (!row) throw new EnterpriseAppBuilderError('NOT_FOUND', 'Requirements analysis not found');
    return row;
  }

  private async ensureArchitectureImpactAnalysis(companyId: string, id: string) {
    const row = await this.deps.db.query.abArchitectureImpactAnalyses.findFirst({
      where: and(eq(abArchitectureImpactAnalyses.companyId, companyId), eq(abArchitectureImpactAnalyses.id, id)),
    });
    if (!row) throw new EnterpriseAppBuilderError('NOT_FOUND', 'Architecture impact analysis not found');
    return row;
  }

  private async ensureDevelopmentWorkspace(companyId: string, id: string) {
    const row = await this.deps.db.query.abDevelopmentWorkspaces.findFirst({
      where: and(eq(abDevelopmentWorkspaces.companyId, companyId), eq(abDevelopmentWorkspaces.id, id)),
    });
    if (!row) throw new EnterpriseAppBuilderError('NOT_FOUND', 'Development workspace not found');
    return row;
  }

  private async ensureCodeGenerationRecord(companyId: string, id: string) {
    const row = await this.deps.db.query.abCodeGenerationRecords.findFirst({
      where: and(eq(abCodeGenerationRecords.companyId, companyId), eq(abCodeGenerationRecords.id, id)),
    });
    if (!row) throw new EnterpriseAppBuilderError('NOT_FOUND', 'Code generation record not found');
    return row;
  }

  private async ensureDatabaseChangePlan(companyId: string, id: string) {
    const row = await this.deps.db.query.abDatabaseChangePlans.findFirst({
      where: and(eq(abDatabaseChangePlans.companyId, companyId), eq(abDatabaseChangePlans.id, id)),
    });
    if (!row) throw new EnterpriseAppBuilderError('NOT_FOUND', 'Database change plan not found');
    return row;
  }

  private async ensureTestRun(companyId: string, id: string) {
    const row = await this.deps.db.query.abTestRuns.findFirst({
      where: and(eq(abTestRuns.companyId, companyId), eq(abTestRuns.id, id)),
    });
    if (!row) throw new EnterpriseAppBuilderError('NOT_FOUND', 'Test run not found');
    return row;
  }

  private async ensurePreviewRecord(companyId: string, id: string) {
    const row = await this.deps.db.query.abPreviewRecords.findFirst({
      where: and(eq(abPreviewRecords.companyId, companyId), eq(abPreviewRecords.id, id)),
    });
    if (!row) throw new EnterpriseAppBuilderError('NOT_FOUND', 'Preview record not found');
    return row;
  }

  private async ensureApprovalRecord(companyId: string, id: string) {
    const row = await this.deps.db.query.abApprovalRecords.findFirst({
      where: and(eq(abApprovalRecords.companyId, companyId), eq(abApprovalRecords.id, id)),
    });
    if (!row) throw new EnterpriseAppBuilderError('NOT_FOUND', 'Approval record not found');
    return row;
  }

  private async ensureDeployment(companyId: string, id: string) {
    const row = await this.deps.db.query.abDeployments.findFirst({
      where: and(eq(abDeployments.companyId, companyId), eq(abDeployments.id, id)),
    });
    if (!row) throw new EnterpriseAppBuilderError('NOT_FOUND', 'Deployment not found');
    return row;
  }

  private async ensureRollback(companyId: string, id: string) {
    const row = await this.deps.db.query.abRollbacks.findFirst({
      where: and(eq(abRollbacks.companyId, companyId), eq(abRollbacks.id, id)),
    });
    if (!row) throw new EnterpriseAppBuilderError('NOT_FOUND', 'Rollback not found');
    return row;
  }

  private async ensureDocumentationUpdate(companyId: string, id: string) {
    const row = await this.deps.db.query.abDocumentationUpdates.findFirst({
      where: and(eq(abDocumentationUpdates.companyId, companyId), eq(abDocumentationUpdates.id, id)),
    });
    if (!row) throw new EnterpriseAppBuilderError('NOT_FOUND', 'Documentation update not found');
    return row;
  }

  private async ensureFeatureRegistryEntry(companyId: string, id: string) {
    const row = await this.deps.db.query.abFeatureRegistryEntries.findFirst({
      where: and(eq(abFeatureRegistryEntries.companyId, companyId), eq(abFeatureRegistryEntries.id, id)),
    });
    if (!row) throw new EnterpriseAppBuilderError('NOT_FOUND', 'Feature registry entry not found');
    return row;
  }

  private async ensureAppBuilderAlert(companyId: string, id: string) {
    const row = await this.deps.db.query.abAppBuilderAlerts.findFirst({
      where: and(eq(abAppBuilderAlerts.companyId, companyId), eq(abAppBuilderAlerts.id, id)),
    });
    if (!row) throw new EnterpriseAppBuilderError('NOT_FOUND', 'App builder alert not found');
    return row;
  }

  private async ensureActionDraft(companyId: string, id: string) {
    const row = await this.deps.db.query.abActionDrafts.findFirst({
      where: and(eq(abActionDrafts.companyId, companyId), eq(abActionDrafts.id, id)),
    });
    if (!row) throw new EnterpriseAppBuilderError('NOT_FOUND', 'Action draft not found');
    return row;
  }
}

function parseOptionalDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function jsonArray(value: Record<string, unknown> | unknown, key = 'items'): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>)[key])) {
    return ((value as Record<string, unknown>)[key] as unknown[]).map(String);
  }
  return [];
}

function resolveBuildHealthStatus(input: {
  failedTestCount: number;
  failedDeploymentCount: number;
  openAlertCount: number;
  pendingApprovalCount: number;
}): string {
  if (input.failedDeploymentCount > 0 || input.failedTestCount > 2) return 'critical';
  if (input.failedTestCount > 0 || input.openAlertCount > 3) return 'degraded';
  if (input.pendingApprovalCount > 0) return 'attention';
  return 'healthy';
}

function deriveArchitectureImpact(
  request: typeof abFeatureRequests.$inferSelect,
  registry: AbFeatureRegistryEntrySummary[],
) {
  const requestType = request.requestType.toLowerCase();
  const matchingRegistry = registry.filter(
    (entry) =>
      entry.featureType.toLowerCase() === requestType ||
      entry.moduleKey?.toLowerCase() === requestType ||
      entry.registryKey.toLowerCase().includes(request.requestKey.toLowerCase()),
  );

  const affectedModules: Record<string, unknown> = {
    requestType: request.requestType,
    registryMatches: matchingRegistry.map((e) => ({ id: e.id, registryKey: e.registryKey, moduleKey: e.moduleKey })),
  };

  const impacts: Record<string, string | null> = {
    frontendImpact: null,
    backendImpact: null,
    databaseImpact: null,
    apiImpact: null,
    sharedTypesImpact: null,
    rbacImpact: null,
    securityImpact: null,
    tenantIsolationImpact: null,
    breakingChangeRisk: request.riskLevel === 'critical' ? 'high' : request.riskLevel,
  };

  if (['ui', 'frontend', 'page', 'dashboard'].some((k) => requestType.includes(k))) {
    impacts.frontendImpact = `Frontend changes likely for ${request.requestType} request.`;
  }
  if (['api', 'endpoint', 'integration', 'webhook'].some((k) => requestType.includes(k))) {
    impacts.backendImpact = `Backend/API changes likely for ${request.requestType} request.`;
    impacts.apiImpact = `API surface may change for ${request.title}.`;
  }
  if (['database', 'schema', 'migration', 'model'].some((k) => requestType.includes(k))) {
    impacts.databaseImpact = `Database schema impact detected for ${request.requestType} request.`;
  }
  if (['auth', 'rbac', 'permission', 'role'].some((k) => requestType.includes(k))) {
    impacts.rbacImpact = `RBAC/permission impact detected for ${request.requestType} request.`;
    impacts.securityImpact = `Security review required for ${request.requestType} request.`;
  }
  if (['billing', 'finance', 'payroll', 'compliance'].some((k) => requestType.includes(k))) {
    impacts.securityImpact = `Compliance-sensitive ${request.requestType} request.`;
  }
  if (matchingRegistry.length > 0) {
    impacts.backendImpact =
      impacts.backendImpact ??
      `May affect ${matchingRegistry.length} existing registry module(s): ${matchingRegistry.map((e) => e.name).join(', ')}.`;
  }
  if (!impacts.frontendImpact && !impacts.backendImpact && !impacts.databaseImpact) {
    impacts.backendImpact = `General ${request.requestType} change — review affected modules from registry (${matchingRegistry.length} match(es)).`;
  }

  return {
    ...impacts,
    affectedModules,
    analysis: {
      requestKey: request.requestKey,
      title: request.title,
      riskLevel: request.riskLevel,
      registryEntryCount: registry.length,
      matchingRegistryCount: matchingRegistry.length,
    },
  };
}

function resolveRequiredApprovalAreas(
  request: typeof abFeatureRequests.$inferSelect,
  architectureImpact: typeof abArchitectureImpactAnalyses.$inferSelect | undefined,
  dbPlans: (typeof abDatabaseChangePlans.$inferSelect)[],
): string[] {
  const areas = new Set<string>();
  const requestType = request.requestType.toLowerCase();

  if (dbPlans.length > 0) areas.add('database_schema');
  if (architectureImpact?.databaseImpact) areas.add('database_schema');
  if (architectureImpact?.securityImpact || architectureImpact?.rbacImpact) {
    areas.add('security');
    if (architectureImpact.rbacImpact) areas.add('rbac');
    if (requestType.includes('auth')) areas.add('authentication');
  }
  if (['billing', 'invoice', 'payment'].some((k) => requestType.includes(k))) areas.add('billing');
  if (['finance', 'ledger', 'accounting'].some((k) => requestType.includes(k))) areas.add('finance');
  if (requestType.includes('payroll')) areas.add('payroll');
  if (['legal', 'contract', 'terms'].some((k) => requestType.includes(k))) areas.add('legal');
  if (['compliance', 'audit', 'gdpr'].some((k) => requestType.includes(k))) areas.add('compliance');
  if (['ai', 'agent', 'model'].some((k) => requestType.includes(k))) areas.add('ai_safety');
  if (['integration', 'webhook', 'connector'].some((k) => requestType.includes(k))) {
    areas.add('production_integrations');
  }
  if (request.riskLevel === 'critical' || request.riskLevel === 'high') areas.add('architecture');
  if (['delete', 'remove', 'destructive', 'drop'].some((k) => requestType.includes(k))) {
    areas.add('destructive_actions');
  }

  for (const area of OWNER_APPROVAL_REQUIRED_AREAS) {
    if (areas.has(area)) continue;
    if (request.config?.requiredApprovalAreas && Array.isArray(request.config.requiredApprovalAreas)) {
      if ((request.config.requiredApprovalAreas as string[]).includes(area)) areas.add(area);
    }
  }

  return [...areas];
}

function toPlatformConfigSummary(row: typeof abPlatformConfig.$inferSelect): AbPlatformConfigSummary {
  return {
    autoApproveRules: row.autoApproveRules,
    deploymentStandards: row.deploymentStandards,
    testingRequirements: row.testingRequirements,
    documentationPolicy: row.documentationPolicy,
    rollbackPolicy: row.rollbackPolicy,
    ownerApprovalRequiredAreas: row.ownerApprovalRequiredAreas,
    auditRetentionDays: row.auditRetentionDays,
  };
}

function toAnalyticsSummary(row: typeof abAnalyticsSnapshots.$inferSelect): AbAnalyticsSummary {
  const metrics = row.metrics ?? {};
  return {
    featureRequestCount: Number(metrics.featureRequestCount ?? 0),
    pendingApprovalCount: Number(metrics.pendingApprovalCount ?? 0),
    activeWorkspaceCount: Number(metrics.activeWorkspaceCount ?? 0),
    failedTestCount: Number(metrics.failedTestCount ?? 0),
    failedDeploymentCount: Number(metrics.failedDeploymentCount ?? 0),
    openAlertCount: Number(metrics.openAlertCount ?? 0),
    registryEntryCount: Number(metrics.registryEntryCount ?? 0),
    overallBuildHealthStatus: String(metrics.overallBuildHealthStatus ?? 'unknown'),
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toFeatureRequestSummary(row: typeof abFeatureRequests.$inferSelect): AbFeatureRequestSummary {
  return {
    id: row.id,
    requestKey: row.requestKey,
    title: row.title,
    naturalLanguageRequest: row.naturalLanguageRequest,
    requestType: row.requestType,
    workflowStatus: row.workflowStatus,
    riskLevel: row.riskLevel,
    requestedByUserId: row.requestedByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapCreateFeatureRequestInput(input: CreateAbFeatureRequestRequest, scope: StaffScope) {
  return {
    requestKey: input.requestKey.trim(),
    title: input.title.trim(),
    naturalLanguageRequest: input.naturalLanguageRequest ?? null,
    requestType: input.requestType.trim(),
    workflowStatus: (input.workflowStatus ?? 'submitted') as typeof abFeatureRequests.$inferInsert.workflowStatus,
    riskLevel: (input.riskLevel ?? 'medium') as typeof abFeatureRequests.$inferInsert.riskLevel,
    requestedByUserId: input.requestedByUserId ?? scope.userId,
    config: input.config ?? {},
  };
}

function mapUpdateFeatureRequestInput(input: UpdateAbFeatureRequestRequest) {
  return {
    ...(input.requestKey !== undefined ? { requestKey: input.requestKey.trim() } : {}),
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.naturalLanguageRequest !== undefined ? { naturalLanguageRequest: input.naturalLanguageRequest ?? null } : {}),
    ...(input.requestType !== undefined ? { requestType: input.requestType.trim() } : {}),
    ...(input.workflowStatus !== undefined
      ? { workflowStatus: input.workflowStatus as typeof abFeatureRequests.$inferInsert.workflowStatus }
      : {}),
    ...(input.riskLevel !== undefined ? { riskLevel: input.riskLevel as typeof abFeatureRequests.$inferInsert.riskLevel } : {}),
    ...(input.requestedByUserId !== undefined ? { requestedByUserId: input.requestedByUserId ?? null } : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
  };
}

function toRequirementsAnalysisSummary(row: typeof abRequirementsAnalyses.$inferSelect): AbRequirementsAnalysisSummary {
  return {
    id: row.id,
    featureRequestId: row.featureRequestId,
    estimatedComplexity: row.estimatedComplexity,
    riskLevel: row.riskLevel,
    implementationPlan: row.implementationPlan,
    analyzedAt: row.analyzedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCreateRequirementsAnalysisInput(input: CreateAbRequirementsAnalysisRequest) {
  return {
    featureRequestId: input.featureRequestId,
    functionalRequirements: input.functionalRequirements ?? {},
    technicalRequirements: input.technicalRequirements ?? {},
    acceptanceCriteria: input.acceptanceCriteria ?? {},
    dependencies: input.dependencies ?? {},
    estimatedComplexity: input.estimatedComplexity ?? null,
    riskLevel: (input.riskLevel ?? 'medium') as typeof abRequirementsAnalyses.$inferInsert.riskLevel,
    implementationPlan: input.implementationPlan ?? null,
    analyzedAt: parseOptionalDate(input.analyzedAt),
  };
}

function mapUpdateRequirementsAnalysisInput(input: UpdateAbRequirementsAnalysisRequest) {
  return {
    ...(input.featureRequestId !== undefined ? { featureRequestId: input.featureRequestId } : {}),
    ...(input.functionalRequirements !== undefined ? { functionalRequirements: input.functionalRequirements } : {}),
    ...(input.technicalRequirements !== undefined ? { technicalRequirements: input.technicalRequirements } : {}),
    ...(input.acceptanceCriteria !== undefined ? { acceptanceCriteria: input.acceptanceCriteria } : {}),
    ...(input.dependencies !== undefined ? { dependencies: input.dependencies } : {}),
    ...(input.estimatedComplexity !== undefined ? { estimatedComplexity: input.estimatedComplexity ?? null } : {}),
    ...(input.riskLevel !== undefined
      ? { riskLevel: input.riskLevel as typeof abRequirementsAnalyses.$inferInsert.riskLevel }
      : {}),
    ...(input.implementationPlan !== undefined ? { implementationPlan: input.implementationPlan ?? null } : {}),
    ...(input.analyzedAt !== undefined ? { analyzedAt: parseOptionalDate(input.analyzedAt) } : {}),
  };
}

function toArchitectureImpactSummary(row: typeof abArchitectureImpactAnalyses.$inferSelect): AbArchitectureImpactSummary {
  return {
    id: row.id,
    featureRequestId: row.featureRequestId,
    frontendImpact: row.frontendImpact,
    backendImpact: row.backendImpact,
    databaseImpact: row.databaseImpact,
    apiImpact: row.apiImpact,
    sharedTypesImpact: row.sharedTypesImpact,
    rbacImpact: row.rbacImpact,
    securityImpact: row.securityImpact,
    tenantIsolationImpact: row.tenantIsolationImpact,
    affectedModules: row.affectedModules,
    breakingChangeRisk: row.breakingChangeRisk,
    analyzedAt: row.analyzedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCreateArchitectureImpactInput(input: CreateAbArchitectureImpactRequest) {
  return {
    featureRequestId: input.featureRequestId,
    frontendImpact: input.frontendImpact ?? null,
    backendImpact: input.backendImpact ?? null,
    databaseImpact: input.databaseImpact ?? null,
    apiImpact: input.apiImpact ?? null,
    sharedTypesImpact: input.sharedTypesImpact ?? null,
    rbacImpact: input.rbacImpact ?? null,
    securityImpact: input.securityImpact ?? null,
    tenantIsolationImpact: input.tenantIsolationImpact ?? null,
    affectedModules: input.affectedModules ?? {},
    breakingChangeRisk: input.breakingChangeRisk ?? null,
    analysis: input.analysis ?? {},
    analyzedAt: parseOptionalDate(input.analyzedAt),
  };
}

function mapUpdateArchitectureImpactInput(input: UpdateAbArchitectureImpactRequest) {
  return {
    ...(input.frontendImpact !== undefined ? { frontendImpact: input.frontendImpact ?? null } : {}),
    ...(input.backendImpact !== undefined ? { backendImpact: input.backendImpact ?? null } : {}),
    ...(input.databaseImpact !== undefined ? { databaseImpact: input.databaseImpact ?? null } : {}),
    ...(input.apiImpact !== undefined ? { apiImpact: input.apiImpact ?? null } : {}),
    ...(input.sharedTypesImpact !== undefined ? { sharedTypesImpact: input.sharedTypesImpact ?? null } : {}),
    ...(input.rbacImpact !== undefined ? { rbacImpact: input.rbacImpact ?? null } : {}),
    ...(input.securityImpact !== undefined ? { securityImpact: input.securityImpact ?? null } : {}),
    ...(input.tenantIsolationImpact !== undefined ? { tenantIsolationImpact: input.tenantIsolationImpact ?? null } : {}),
    ...(input.affectedModules !== undefined ? { affectedModules: input.affectedModules } : {}),
    ...(input.breakingChangeRisk !== undefined ? { breakingChangeRisk: input.breakingChangeRisk ?? null } : {}),
    ...(input.analysis !== undefined ? { analysis: input.analysis } : {}),
    ...(input.analyzedAt !== undefined ? { analyzedAt: parseOptionalDate(input.analyzedAt) } : {}),
  };
}

function toDevelopmentWorkspaceSummary(row: typeof abDevelopmentWorkspaces.$inferSelect): AbDevelopmentWorkspaceSummary {
  return {
    id: row.id,
    featureRequestId: row.featureRequestId,
    workspaceKey: row.workspaceKey,
    branchName: row.branchName,
    isolationMode: row.isolationMode,
    status: row.status,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCreateDevelopmentWorkspaceInput(input: CreateAbDevelopmentWorkspaceRequest) {
  return {
    featureRequestId: input.featureRequestId,
    workspaceKey: input.workspaceKey.trim(),
    branchName: input.branchName ?? null,
    isolationMode: input.isolationMode ?? 'isolated_sandbox',
    status: input.status ?? 'active',
    filesChanged: input.filesChanged ?? {},
    startedAt: parseOptionalDate(input.startedAt) ?? new Date(),
  };
}

function mapUpdateDevelopmentWorkspaceInput(input: UpdateAbDevelopmentWorkspaceRequest) {
  return {
    ...(input.featureRequestId !== undefined ? { featureRequestId: input.featureRequestId } : {}),
    ...(input.workspaceKey !== undefined ? { workspaceKey: input.workspaceKey.trim() } : {}),
    ...(input.branchName !== undefined ? { branchName: input.branchName ?? null } : {}),
    ...(input.isolationMode !== undefined ? { isolationMode: input.isolationMode ?? null } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.filesChanged !== undefined ? { filesChanged: input.filesChanged } : {}),
    ...(input.startedAt !== undefined ? { startedAt: parseOptionalDate(input.startedAt) } : {}),
    ...(input.completedAt !== undefined ? { completedAt: parseOptionalDate(input.completedAt) } : {}),
  };
}

function toCodeGenerationRecordSummary(row: typeof abCodeGenerationRecords.$inferSelect): AbCodeGenerationRecordSummary {
  return {
    id: row.id,
    featureRequestId: row.featureRequestId,
    workspaceId: row.workspaceId,
    generationKey: row.generationKey,
    artifactType: row.artifactType,
    artifactPath: row.artifactPath,
    language: row.language,
    workflowStatus: row.workflowStatus,
    generatedAt: row.generatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCreateCodeGenerationRecordInput(input: CreateAbCodeGenerationRecordRequest) {
  return {
    featureRequestId: input.featureRequestId,
    workspaceId: input.workspaceId ?? null,
    generationKey: input.generationKey.trim(),
    artifactType: input.artifactType.trim(),
    artifactPath: input.artifactPath ?? null,
    language: input.language ?? null,
    workflowStatus: (input.workflowStatus ?? 'draft') as typeof abCodeGenerationRecords.$inferInsert.workflowStatus,
    generatedAt: parseOptionalDate(input.generatedAt),
    metadata: input.metadata ?? {},
  };
}

function mapUpdateCodeGenerationRecordInput(input: UpdateAbCodeGenerationRecordRequest) {
  return {
    ...(input.featureRequestId !== undefined ? { featureRequestId: input.featureRequestId } : {}),
    ...(input.workspaceId !== undefined ? { workspaceId: input.workspaceId ?? null } : {}),
    ...(input.generationKey !== undefined ? { generationKey: input.generationKey.trim() } : {}),
    ...(input.artifactType !== undefined ? { artifactType: input.artifactType } : {}),
    ...(input.artifactPath !== undefined ? { artifactPath: input.artifactPath ?? null } : {}),
    ...(input.language !== undefined ? { language: input.language ?? null } : {}),
    ...(input.workflowStatus !== undefined
      ? { workflowStatus: input.workflowStatus as typeof abCodeGenerationRecords.$inferInsert.workflowStatus }
      : {}),
    ...(input.generatedAt !== undefined ? { generatedAt: parseOptionalDate(input.generatedAt) } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  };
}

function toDatabaseChangePlanSummary(row: typeof abDatabaseChangePlans.$inferSelect): AbDatabaseChangePlanSummary {
  return {
    id: row.id,
    featureRequestId: row.featureRequestId,
    migrationKey: row.migrationKey,
    description: row.description,
    estimatedDurationMinutes: row.estimatedDurationMinutes,
    requiresOwnerApproval: row.requiresOwnerApproval,
    workflowStatus: row.workflowStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCreateDatabaseChangePlanInput(input: CreateAbDatabaseChangePlanRequest) {
  return {
    featureRequestId: input.featureRequestId,
    migrationKey: input.migrationKey.trim(),
    description: input.description ?? null,
    impactAnalysis: input.impactAnalysis ?? {},
    conflictDetection: input.conflictDetection ?? {},
    breakingChanges: input.breakingChanges ?? {},
    estimatedDurationMinutes: input.estimatedDurationMinutes ?? null,
    requiresOwnerApproval: true,
    workflowStatus: (input.workflowStatus ?? 'draft') as typeof abDatabaseChangePlans.$inferInsert.workflowStatus,
  };
}

function mapUpdateDatabaseChangePlanInput(input: UpdateAbDatabaseChangePlanRequest) {
  return {
    ...(input.featureRequestId !== undefined ? { featureRequestId: input.featureRequestId } : {}),
    ...(input.migrationKey !== undefined ? { migrationKey: input.migrationKey.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description ?? null } : {}),
    ...(input.impactAnalysis !== undefined ? { impactAnalysis: input.impactAnalysis } : {}),
    ...(input.conflictDetection !== undefined ? { conflictDetection: input.conflictDetection } : {}),
    ...(input.breakingChanges !== undefined ? { breakingChanges: input.breakingChanges } : {}),
    ...(input.estimatedDurationMinutes !== undefined
      ? { estimatedDurationMinutes: input.estimatedDurationMinutes ?? null }
      : {}),
    ...(input.workflowStatus !== undefined
      ? { workflowStatus: input.workflowStatus as typeof abDatabaseChangePlans.$inferInsert.workflowStatus }
      : {}),
  };
}

function toTestRunSummary(row: typeof abTestRuns.$inferSelect): AbTestRunSummary {
  return {
    id: row.id,
    featureRequestId: row.featureRequestId,
    runKey: row.runKey,
    testSuite: row.testSuite,
    workflowStatus: row.workflowStatus,
    passedCount: row.passedCount,
    failedCount: row.failedCount,
    skippedCount: row.skippedCount,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCreateTestRunInput(input: CreateAbTestRunRequest) {
  return {
    featureRequestId: input.featureRequestId,
    runKey: input.runKey.trim(),
    testSuite: input.testSuite.trim(),
    workflowStatus: (input.workflowStatus ?? 'pending') as typeof abTestRuns.$inferInsert.workflowStatus,
    passedCount: input.passedCount ?? 0,
    failedCount: input.failedCount ?? 0,
    skippedCount: input.skippedCount ?? 0,
    startedAt: parseOptionalDate(input.startedAt),
    completedAt: parseOptionalDate(input.completedAt),
    results: input.results ?? {},
  };
}

function mapUpdateTestRunInput(input: UpdateAbTestRunRequest) {
  return {
    ...(input.featureRequestId !== undefined ? { featureRequestId: input.featureRequestId } : {}),
    ...(input.runKey !== undefined ? { runKey: input.runKey.trim() } : {}),
    ...(input.testSuite !== undefined ? { testSuite: input.testSuite } : {}),
    ...(input.workflowStatus !== undefined
      ? { workflowStatus: input.workflowStatus as typeof abTestRuns.$inferInsert.workflowStatus }
      : {}),
    ...(input.passedCount !== undefined ? { passedCount: input.passedCount } : {}),
    ...(input.failedCount !== undefined ? { failedCount: input.failedCount } : {}),
    ...(input.skippedCount !== undefined ? { skippedCount: input.skippedCount } : {}),
    ...(input.startedAt !== undefined ? { startedAt: parseOptionalDate(input.startedAt) } : {}),
    ...(input.completedAt !== undefined ? { completedAt: parseOptionalDate(input.completedAt) } : {}),
    ...(input.results !== undefined ? { results: input.results } : {}),
  };
}

function toPreviewRecordSummary(row: typeof abPreviewRecords.$inferSelect): AbPreviewRecordSummary {
  return {
    id: row.id,
    featureRequestId: row.featureRequestId,
    previewKey: row.previewKey,
    previewUrl: row.previewUrl,
    changeSummary: row.changeSummary,
    databaseImpact: row.databaseImpact,
    apiImpact: row.apiImpact,
    performanceImpact: row.performanceImpact,
    securityImpact: row.securityImpact,
    capturedAt: row.capturedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCreatePreviewRecordInput(input: CreateAbPreviewRecordRequest) {
  return {
    featureRequestId: input.featureRequestId,
    previewKey: input.previewKey.trim(),
    previewUrl: input.previewUrl ?? null,
    changeSummary: input.changeSummary ?? null,
    filesModified: input.filesModified ?? {},
    databaseImpact: input.databaseImpact ?? null,
    apiImpact: input.apiImpact ?? null,
    performanceImpact: input.performanceImpact ?? null,
    securityImpact: input.securityImpact ?? null,
    capturedAt: parseOptionalDate(input.capturedAt) ?? new Date(),
  };
}

function mapUpdatePreviewRecordInput(input: UpdateAbPreviewRecordRequest) {
  return {
    ...(input.featureRequestId !== undefined ? { featureRequestId: input.featureRequestId } : {}),
    ...(input.previewKey !== undefined ? { previewKey: input.previewKey.trim() } : {}),
    ...(input.previewUrl !== undefined ? { previewUrl: input.previewUrl ?? null } : {}),
    ...(input.changeSummary !== undefined ? { changeSummary: input.changeSummary ?? null } : {}),
    ...(input.filesModified !== undefined ? { filesModified: input.filesModified } : {}),
    ...(input.databaseImpact !== undefined ? { databaseImpact: input.databaseImpact ?? null } : {}),
    ...(input.apiImpact !== undefined ? { apiImpact: input.apiImpact ?? null } : {}),
    ...(input.performanceImpact !== undefined ? { performanceImpact: input.performanceImpact ?? null } : {}),
    ...(input.securityImpact !== undefined ? { securityImpact: input.securityImpact ?? null } : {}),
    ...(input.capturedAt !== undefined ? { capturedAt: parseOptionalDate(input.capturedAt) ?? new Date() } : {}),
  };
}

function toApprovalRecordSummary(row: typeof abApprovalRecords.$inferSelect): AbApprovalRecordSummary {
  return {
    id: row.id,
    featureRequestId: row.featureRequestId,
    approvalType: row.approvalType,
    workflowStatus: row.workflowStatus,
    approvedByUserId: row.approvedByUserId,
    rejectedReason: row.rejectedReason,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCreateApprovalRecordInput(input: CreateAbApprovalRecordRequest) {
  return {
    featureRequestId: input.featureRequestId,
    approvalType: input.approvalType.trim(),
    workflowStatus: (input.workflowStatus ?? 'pending') as typeof abApprovalRecords.$inferInsert.workflowStatus,
    requiredAreas: input.requiredAreas ?? {},
    approvedByUserId: input.approvedByUserId ?? null,
    rejectedReason: input.rejectedReason ?? null,
    approvedAt: parseOptionalDate(input.approvedAt),
  };
}

function mapUpdateApprovalRecordInput(input: UpdateAbApprovalRecordRequest) {
  return {
    ...(input.featureRequestId !== undefined ? { featureRequestId: input.featureRequestId } : {}),
    ...(input.approvalType !== undefined ? { approvalType: input.approvalType } : {}),
    ...(input.workflowStatus !== undefined
      ? { workflowStatus: input.workflowStatus as typeof abApprovalRecords.$inferInsert.workflowStatus }
      : {}),
    ...(input.requiredAreas !== undefined ? { requiredAreas: input.requiredAreas } : {}),
    ...(input.approvedByUserId !== undefined ? { approvedByUserId: input.approvedByUserId ?? null } : {}),
    ...(input.rejectedReason !== undefined ? { rejectedReason: input.rejectedReason ?? null } : {}),
    ...(input.approvedAt !== undefined ? { approvedAt: parseOptionalDate(input.approvedAt) } : {}),
  };
}

function toDeploymentSummary(row: typeof abDeployments.$inferSelect): AbDeploymentSummary {
  return {
    id: row.id,
    featureRequestId: row.featureRequestId,
    deploymentKey: row.deploymentKey,
    environment: row.environment,
    workflowStatus: row.workflowStatus,
    version: row.version,
    deployedByUserId: row.deployedByUserId,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    verificationStatus: row.verificationStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCreateDeploymentInput(input: CreateAbDeploymentRequest, scope: StaffScope) {
  return {
    featureRequestId: input.featureRequestId,
    deploymentKey: input.deploymentKey.trim(),
    environment: input.environment.trim(),
    workflowStatus: (input.workflowStatus ?? 'planned') as typeof abDeployments.$inferInsert.workflowStatus,
    version: input.version ?? null,
    deployedByUserId: input.deployedByUserId ?? scope.userId,
    startedAt: parseOptionalDate(input.startedAt),
    completedAt: parseOptionalDate(input.completedAt),
    verificationStatus: input.verificationStatus ?? null,
  };
}

function mapUpdateDeploymentInput(input: UpdateAbDeploymentRequest) {
  return {
    ...(input.featureRequestId !== undefined ? { featureRequestId: input.featureRequestId } : {}),
    ...(input.deploymentKey !== undefined ? { deploymentKey: input.deploymentKey.trim() } : {}),
    ...(input.environment !== undefined ? { environment: input.environment } : {}),
    ...(input.workflowStatus !== undefined
      ? { workflowStatus: input.workflowStatus as typeof abDeployments.$inferInsert.workflowStatus }
      : {}),
    ...(input.version !== undefined ? { version: input.version ?? null } : {}),
    ...(input.deployedByUserId !== undefined ? { deployedByUserId: input.deployedByUserId ?? null } : {}),
    ...(input.startedAt !== undefined ? { startedAt: parseOptionalDate(input.startedAt) } : {}),
    ...(input.completedAt !== undefined ? { completedAt: parseOptionalDate(input.completedAt) } : {}),
    ...(input.verificationStatus !== undefined ? { verificationStatus: input.verificationStatus ?? null } : {}),
  };
}

function toRollbackSummary(row: typeof abRollbacks.$inferSelect): AbRollbackSummary {
  return {
    id: row.id,
    deploymentId: row.deploymentId,
    rollbackKey: row.rollbackKey,
    reason: row.reason,
    workflowStatus: row.workflowStatus,
    executedByUserId: row.executedByUserId,
    executedAt: row.executedAt?.toISOString() ?? null,
    verified: row.verified,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCreateRollbackInput(input: CreateAbRollbackRequest, scope: StaffScope) {
  return {
    deploymentId: input.deploymentId,
    rollbackKey: input.rollbackKey.trim(),
    reason: input.reason ?? null,
    workflowStatus: (input.workflowStatus ?? 'draft') as typeof abRollbacks.$inferInsert.workflowStatus,
    executedByUserId: input.executedByUserId ?? scope.userId,
    executedAt: parseOptionalDate(input.executedAt),
    verified: input.verified ?? false,
  };
}

function mapUpdateRollbackInput(input: UpdateAbRollbackRequest, scope: StaffScope) {
  return {
    ...(input.deploymentId !== undefined ? { deploymentId: input.deploymentId } : {}),
    ...(input.rollbackKey !== undefined ? { rollbackKey: input.rollbackKey.trim() } : {}),
    ...(input.reason !== undefined ? { reason: input.reason ?? null } : {}),
    ...(input.workflowStatus !== undefined
      ? { workflowStatus: input.workflowStatus as typeof abRollbacks.$inferInsert.workflowStatus }
      : {}),
    ...(input.executedByUserId !== undefined ? { executedByUserId: input.executedByUserId ?? scope.userId } : {}),
    ...(input.executedAt !== undefined ? { executedAt: parseOptionalDate(input.executedAt) } : {}),
    ...(input.verified !== undefined ? { verified: input.verified } : {}),
  };
}

function toDocumentationUpdateSummary(row: typeof abDocumentationUpdates.$inferSelect): AbDocumentationUpdateSummary {
  return {
    id: row.id,
    featureRequestId: row.featureRequestId,
    docType: row.docType,
    docPath: row.docPath,
    changeSummary: row.changeSummary,
    workflowStatus: row.workflowStatus,
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCreateDocumentationUpdateInput(input: CreateAbDocumentationUpdateRequest) {
  return {
    featureRequestId: input.featureRequestId,
    docType: input.docType.trim(),
    docPath: input.docPath ?? null,
    changeSummary: input.changeSummary ?? null,
    workflowStatus: (input.workflowStatus ?? 'draft') as typeof abDocumentationUpdates.$inferInsert.workflowStatus,
    updatedAt: parseOptionalDate(input.updatedAt) ?? new Date(),
  };
}

function mapUpdateDocumentationUpdateInput(input: UpdateAbDocumentationUpdateRequest) {
  return {
    ...(input.featureRequestId !== undefined ? { featureRequestId: input.featureRequestId } : {}),
    ...(input.docType !== undefined ? { docType: input.docType } : {}),
    ...(input.docPath !== undefined ? { docPath: input.docPath ?? null } : {}),
    ...(input.changeSummary !== undefined ? { changeSummary: input.changeSummary ?? null } : {}),
    ...(input.workflowStatus !== undefined
      ? { workflowStatus: input.workflowStatus as typeof abDocumentationUpdates.$inferInsert.workflowStatus }
      : {}),
    ...(input.updatedAt !== undefined ? { updatedAt: parseOptionalDate(input.updatedAt) ?? new Date() } : {}),
  };
}

function toFeatureRegistryEntrySummary(row: typeof abFeatureRegistryEntries.$inferSelect): AbFeatureRegistryEntrySummary {
  return {
    id: row.id,
    registryKey: row.registryKey,
    featureType: row.featureType,
    name: row.name,
    description: row.description,
    version: row.version,
    status: row.status,
    ownerUserId: row.ownerUserId,
    moduleKey: row.moduleKey,
    routePath: row.routePath,
    apiPath: row.apiPath,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCreateFeatureRegistryEntryInput(input: CreateAbFeatureRegistryEntryRequest) {
  return {
    registryKey: input.registryKey.trim(),
    featureType: input.featureType.trim(),
    name: input.name.trim(),
    description: input.description ?? null,
    version: input.version ?? '1.0.0',
    status: input.status ?? 'active',
    ownerUserId: input.ownerUserId ?? null,
    dependencies: input.dependencies ?? {},
    moduleKey: input.moduleKey ?? null,
    routePath: input.routePath ?? null,
    apiPath: input.apiPath ?? null,
  };
}

function mapUpdateFeatureRegistryEntryInput(input: UpdateAbFeatureRegistryEntryRequest) {
  return {
    ...(input.registryKey !== undefined ? { registryKey: input.registryKey.trim() } : {}),
    ...(input.featureType !== undefined ? { featureType: input.featureType } : {}),
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description ?? null } : {}),
    ...(input.version !== undefined ? { version: input.version } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId ?? null } : {}),
    ...(input.dependencies !== undefined ? { dependencies: input.dependencies } : {}),
    ...(input.moduleKey !== undefined ? { moduleKey: input.moduleKey ?? null } : {}),
    ...(input.routePath !== undefined ? { routePath: input.routePath ?? null } : {}),
    ...(input.apiPath !== undefined ? { apiPath: input.apiPath ?? null } : {}),
  };
}

function toAppBuilderAlertSummary(row: typeof abAppBuilderAlerts.$inferSelect): AbAppBuilderAlertSummary {
  return {
    id: row.id,
    alertType: row.alertType,
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description,
    featureRequestId: row.featureRequestId,
    sourceModule: row.sourceModule,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapUpdateAppBuilderAlertInput(input: UpdateAbAppBuilderAlertRequest) {
  return {
    ...(input.alertType !== undefined ? { alertType: input.alertType } : {}),
    ...(input.severity !== undefined
      ? { severity: input.severity as typeof abAppBuilderAlerts.$inferInsert.severity }
      : {}),
    ...(input.status !== undefined ? { status: input.status as typeof abAppBuilderAlerts.$inferInsert.status } : {}),
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description ?? null } : {}),
    ...(input.featureRequestId !== undefined ? { featureRequestId: input.featureRequestId ?? null } : {}),
    ...(input.sourceModule !== undefined ? { sourceModule: input.sourceModule ?? null } : {}),
    ...(input.context !== undefined ? { context: input.context } : {}),
  };
}

function toActionDraftSummary(row: typeof abActionDrafts.$inferSelect): AbActionDraftSummary {
  return {
    id: row.id,
    draftType: row.draftType,
    title: row.title,
    content: row.content,
    featureRequestId: row.featureRequestId,
    aiGenerated: row.aiGenerated,
    workflowStatus: row.workflowStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCreateActionDraftInput(input: CreateAbAppBuilderActionDraftRequest) {
  return {
    draftType: input.draftType.trim(),
    title: input.title.trim(),
    content: input.content,
    featureRequestId: input.featureRequestId ?? null,
    sourceRecords: input.sourceRecords ?? {},
    aiGenerated: input.aiGenerated ?? false,
    workflowStatus: (input.workflowStatus ?? 'draft') as typeof abActionDrafts.$inferInsert.workflowStatus,
  };
}

function mapUpdateActionDraftInput(input: UpdateAbActionDraftRequest) {
  return {
    ...(input.draftType !== undefined ? { draftType: input.draftType.trim() } : {}),
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.content !== undefined ? { content: input.content } : {}),
    ...(input.featureRequestId !== undefined ? { featureRequestId: input.featureRequestId ?? null } : {}),
    ...(input.sourceRecords !== undefined ? { sourceRecords: input.sourceRecords } : {}),
    ...(input.aiGenerated !== undefined ? { aiGenerated: input.aiGenerated } : {}),
    ...(input.workflowStatus !== undefined
      ? { workflowStatus: input.workflowStatus as typeof abActionDrafts.$inferInsert.workflowStatus }
      : {}),
  };
}

function toAuditLogSummary(row: typeof abAuditLogs.$inferSelect): AbAuditLogSummary {
  return {
    id: row.id,
    actionType: row.actionType,
    entityType: row.entityType,
    entityId: row.entityId,
    userId: row.userId,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  };
}
