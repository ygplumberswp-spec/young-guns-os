import { and, desc, eq, inArray } from 'drizzle-orm';
import type {
  CreateItoItActionDraftRequest,
  EnterpriseItOperationsAuraContext,
  EnterpriseItOperationsDashboard,
  ItoAnalyticsSummary,
  ItoItAlertSummary,
  ItoPlatformConfigSummary,
  ItoOperationsMonitoringSummary,
  CreateItoSelfHealingActionRequest,
  UpdateItoPlatformConfigRequest,
  CreateItoIncidentRequest,
  UpdateItoIncidentRequest,
  ItoIncidentSummary,
  CreateItoHealthMonitorRequest,
  UpdateItoHealthMonitorRequest,
  ItoHealthMonitorSummary,
  ItoHealthSnapshotSummary,
  UpdateItoSelfHealingActionRequest,
  ItoSelfHealingActionSummary,
  CreateItoBugDetectionRequest,
  UpdateItoBugDetectionRequest,
  ItoBugDetectionSummary,
  CreateItoRootCauseAnalysisRequest,
  UpdateItoRootCauseAnalysisRequest,
  ItoRootCauseAnalysisSummary,
  CreateItoRepairAttemptRequest,
  UpdateItoRepairAttemptRequest,
  ItoRepairAttemptSummary,
  CreateItoBuildRecordRequest,
  UpdateItoBuildRecordRequest,
  ItoBuildRecordSummary,
  CreateItoTestRunRequest,
  UpdateItoTestRunRequest,
  ItoTestRunSummary,
  CreateItoChangeRequestRequest,
  UpdateItoChangeRequestRequest,
  ItoChangeRequestSummary,
  CreateItoDeploymentRequest,
  UpdateItoDeploymentRequest,
  ItoDeploymentSummary,
  CreateItoDependencyRecordRequest,
  UpdateItoDependencyRecordRequest,
  ItoDependencyRecordSummary,
  CreateItoTechnicalDebtRecordRequest,
  UpdateItoTechnicalDebtRecordRequest,
  ItoTechnicalDebtRecordSummary,
  CreateItoBackupVerificationRequest,
  UpdateItoBackupVerificationRequest,
  ItoBackupVerificationSummary,
  ItoDatabaseHealthSnapshotSummary,
  ItoApiReliabilitySnapshotSummary,
  ItoAiProviderHealthSummary,
  ItoIntegrationHealthSummary,
  ItoPerformanceSnapshotSummary,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  itoAnalyticsSnapshots, itoAuditLogs, itoAiProviderHealth, itoApiReliabilitySnapshots,
  itoBackupVerifications, itoBugDetections, itoBuildRecords, itoChangeRequests,
  itoDatabaseHealthSnapshots, itoDependencyRecords, itoDeployments, itoHealthMonitors,
  itoHealthSnapshots, itoIncidents, itoIntegrationHealth, itoItActionDrafts, itoItAlerts,
  itoPerformanceSnapshots, itoPlatformConfig, itoRepairAttempts, itoRootCauseAnalyses,
  itoSelfHealingActions, itoTechnicalDebtRecords, itoTestRuns, opsOperationalLogEntries, workflowRuns,
} from '@titan/db';
import type { AiOperationsService } from './ai-operations.service.js';
import type { AiProviderResilienceService } from './ai-provider-resilience.service.js';
import type { AnalyticsService } from './analytics.service.js';
import type { EnterpriseMissionControlService } from './enterprise-mission-control.service.js';
import type { EnterpriseProductionReadinessService } from './enterprise-production-readiness.service.js';
import type { EnterpriseSaasPlatformService } from './enterprise-saas-platform.service.js';
import type { EnterpriseSecurityService } from './enterprise-security.service.js';
import type { IntegrationPlatformService } from './integration-platform.service.js';

export class EnterpriseItOperationsError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'EnterpriseItOperationsError'; }
}

type StaffScope = { companyId: string; userId: string };
type ExecuteSafeRepairRequest = { repairKey: string; input?: Record<string, unknown> };
type ExecuteSafeRepairResult = { repairAttemptId: string; selfHealingActionId: string; verified: boolean; workflowStatus: string; output: Record<string, unknown> };
type CreateItoHealthSnapshotRequest = { monitorId?: string; snapshotKey: string; healthStatus?: string; metrics?: Record<string, unknown>; config?: Record<string, unknown> };

type ItOperationsDeps = {
  db: DatabaseClient;
  enterpriseSaasPlatformService: EnterpriseSaasPlatformService;
  enterpriseProductionReadinessService: EnterpriseProductionReadinessService;
  enterpriseMissionControlService: EnterpriseMissionControlService;
  enterpriseSecurityService: EnterpriseSecurityService;
  aiProviderResilienceService: AiProviderResilienceService;
  aiOperationsService: AiOperationsService;
  integrationPlatformService: IntegrationPlatformService;
  analyticsService: AnalyticsService;
};

export class EnterpriseItOperationsService {
  constructor(private readonly deps: ItOperationsDeps) {}

  async getDashboard(companyId: string): Promise<EnterpriseItOperationsDashboard> {
    const isPlatformOwner = await this.deps.enterpriseSaasPlatformService.isPlatformOwnerTenant(companyId);
    const [platformConfig, productionReadiness, monitors, incidents, alerts, bugs, changes, deployments, debt, repairs, analytics, operationsMonitoring] = await Promise.all([
      this.getPlatformConfig(companyId),
      this.deps.enterpriseProductionReadinessService.getDashboard(companyId).catch(() => null),
      this.listHealthMonitors(companyId),
      this.listIncidents(companyId),
      this.listItAlerts(companyId, { status: 'open' }),
      this.listBugDetections(companyId),
      this.listChangeRequests(companyId),
      this.listDeployments(companyId),
      this.listTechnicalDebtRecords(companyId),
      this.listRepairAttempts(companyId),
      this.getLatestAnalytics(companyId),
      this.getOperationsMonitoring(companyId),
    ]);
    const degradedMonitorCount = monitors.filter((m) => m.healthStatus === 'degraded' || m.healthStatus === 'unhealthy').length;
    const openIncidentCount = incidents.filter((i) => !['resolved','closed'].includes(i.status)).length;
    const openBugCount = bugs.filter((b) => !['executed','cancelled'].includes(b.workflowStatus)).length;
    const pendingChangeRequestCount = changes.filter((c) => ['draft','review','pending_approval','approved'].includes(c.workflowStatus)).length;
    const failedDeploymentCount = deployments.filter((d) => d.deploymentStatus === 'failed').length;
    const technicalDebtCount = debt.filter((d) => !['executed','cancelled'].includes(d.workflowStatus)).length;
    return {
      summary: `${openIncidentCount} open incident(s), ${alerts.length} open alert(s), ${degradedMonitorCount} degraded monitor(s), ${failedDeploymentCount} failed deployment(s).`,
      isPlatformOwner,
      platformConfig,
      productionReadiness,
      monitorCount: monitors.length,
      degradedMonitorCount,
      openIncidentCount,
      openAlertCount: alerts.length,
      openBugCount,
      pendingChangeRequestCount,
      failedDeploymentCount,
      technicalDebtCount,
      overallHealthStatus: operationsMonitoring.overallHealthStatus,
      analytics,
      operationsMonitoring,
      recentIncidents: incidents.slice(0, 10),
      recentAlerts: alerts.slice(0, 10),
      recentDeployments: deployments.slice(0, 10),
      recentBugDetections: bugs.slice(0, 10),
      recentChangeRequests: changes.slice(0, 10),
      recentRepairAttempts: repairs.slice(0, 10),
      recentHealthMonitors: monitors.slice(0, 10),
    };
  }

  async getPlatformHealthMonitoring(companyId: string): Promise<ItoOperationsMonitoringSummary> {
    return this.getOperationsMonitoring(companyId);
  }

  async getOperationsMonitoring(companyId: string): Promise<ItoOperationsMonitoringSummary> {
    const [productionDashboard, missionControlDashboard, securityDashboard, aiResilience, integrationMonitoring, integrationDashboard, monitors, incidents, bugs, changes, deployments, alerts] = await Promise.all([
      this.deps.enterpriseProductionReadinessService.getDashboard(companyId),
      this.deps.enterpriseMissionControlService.getMissionControlDashboard(companyId),
      this.deps.enterpriseSecurityService.getExecutiveDashboard(companyId),
      this.deps.aiProviderResilienceService.getResilienceStatus(companyId),
      this.deps.integrationPlatformService.getMonitoringSummary(companyId),
      this.deps.integrationPlatformService.getExecutiveDashboard(companyId),
      this.listHealthMonitors(companyId),
      this.listIncidents(companyId),
      this.listBugDetections(companyId),
      this.listChangeRequests(companyId),
      this.listDeployments(companyId),
      this.listItAlerts(companyId, { status: 'open' }),
    ]);
    const systemHealth = productionDashboard.systemHealth;
    const unhealthyModules = systemHealth.filter((m) => m.status === 'unhealthy').length;
    const degradedModules = systemHealth.filter((m) => m.status === 'degraded').length;
    const degradedMonitorCount = monitors.filter((m) => m.healthStatus !== 'healthy').length + degradedModules + unhealthyModules;
    const openIncidentCount = incidents.filter((i) => !['resolved','closed'].includes(i.status)).length;
    const openBugCount = bugs.filter((b) => !['executed','cancelled'].includes(b.workflowStatus)).length;
    const pendingChangeRequestCount = changes.filter((c) => ['draft','review','pending_approval','approved'].includes(c.workflowStatus)).length;
    const failedDeploymentCount = deployments.filter((d) => d.deploymentStatus === 'failed').length;
    const integrationIssueCount = integrationMonitoring.errorServiceCount + integrationDashboard.recentConflicts.length;
    const criticalSignals = missionControlDashboard.criticalAlertCount + alerts.filter((a) => a.severity === 'critical').length + securityDashboard.riskAlertCount;
    const alertsList: string[] = [];
    if (unhealthyModules > 0) alertsList.push(`${unhealthyModules} unhealthy module(s)`);
    if (degradedModules > 0) alertsList.push(`${degradedModules} degraded module(s)`);
    if (openIncidentCount > 0) alertsList.push(`${openIncidentCount} open incident(s)`);
    if (openBugCount > 0) alertsList.push(`${openBugCount} open bug detection(s)`);
    if (failedDeploymentCount > 0) alertsList.push(`${failedDeploymentCount} failed deployment(s)`);
    if (integrationIssueCount > 0) alertsList.push(`${integrationIssueCount} integration issue(s)`);
    if (aiResilience.recentFailoverCount > 0) alertsList.push(`${aiResilience.recentFailoverCount} recent AI failover(s)`);
    if (criticalSignals > 0) alertsList.push(`${criticalSignals} critical signal(s)`);
    const overallHealthStatus = unhealthyModules > 0 || openIncidentCount > 0 ? 'unhealthy' : degradedModules > 0 || criticalSignals > 0 ? 'degraded' : 'healthy';
    return { openIncidentCount, openAlertCount: alerts.length, degradedMonitorCount, openBugCount, pendingChangeRequestCount, failedDeploymentCount, overallHealthStatus, alerts: alertsList };
  }

  async getPlatformConfig(companyId: string): Promise<ItoPlatformConfigSummary> {
    return toPlatformConfigSummary(await this.ensurePlatformConfig(companyId));
  }

  async updatePlatformConfig(scope: StaffScope, input: UpdateItoPlatformConfigRequest): Promise<ItoPlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db.update(itoPlatformConfig).set({
      healthThresholds: input.healthThresholds ?? existing.healthThresholds,
      monitoringConfig: input.monitoringConfig ?? existing.monitoringConfig,
      healingPolicies: input.healingPolicies ?? existing.healingPolicies,
      deploymentStandards: input.deploymentStandards ?? existing.deploymentStandards,
      alertRouting: input.alertRouting ?? existing.alertRouting,
      changeManagementPolicy: input.changeManagementPolicy ?? existing.changeManagementPolicy,
      auditRetentionDays: input.auditRetentionDays ?? existing.auditRetentionDays,
      updatedAt: new Date(),
    }).where(eq(itoPlatformConfig.companyId, scope.companyId)).returning();
    await this.recordAudit(scope, 'platform_config_updated');
    return toPlatformConfigSummary(updated!);
  }

  async recordSelfHealingAction(scope: StaffScope, input: CreateItoSelfHealingActionRequest): Promise<ItoSelfHealingActionSummary> {
    const config = await this.getPlatformConfig(scope.companyId);
    const allowlist = (config.healingPolicies.allowlist as Array<{ actionType: string; riskLevel: string }> | undefined) ?? [];
    const risk = input.riskLevel ?? 'low';
    const allowed = allowlist.some((entry) => entry.actionType === input.actionType);
    if (!allowed && risk !== 'low') throw new EnterpriseItOperationsError('VALIDATION_ERROR', 'Self-healing action is not in configured allowlist');
    return this.createSelfHealingAction(scope, { ...input, riskLevel: risk, triggeredBy: input.triggeredBy ?? scope.userId, config: input.config ?? {} });
  }

  async listSelfHealingActions(companyId: string): Promise<ItoSelfHealingActionSummary[]> {
    const rows = await this.deps.db.query.itoSelfHealingActions.findMany({ where: eq(itoSelfHealingActions.companyId, companyId), orderBy: [desc(itoSelfHealingActions.createdAt)], limit: 100 });
    return rows.map(toSelfHealingActionSummary);
  }

  async syncBugDetections(scope: StaffScope): Promise<ItoBugDetectionSummary[]> {
    const companyId = scope.companyId;
    const [failedTestRuns, failedBuilds, failedDeployments, recentLogs, failedWorkflows, existing] = await Promise.all([
      this.deps.db.query.itoTestRuns.findMany({ where: and(eq(itoTestRuns.companyId, companyId)), orderBy: [desc(itoTestRuns.completedAt)], limit: 50 }),
      this.deps.db.query.itoBuildRecords.findMany({ where: eq(itoBuildRecords.companyId, companyId), orderBy: [desc(itoBuildRecords.completedAt)], limit: 50 }),
      this.deps.db.query.itoDeployments.findMany({ where: and(eq(itoDeployments.companyId, companyId), eq(itoDeployments.deploymentStatus, 'failed')), orderBy: [desc(itoDeployments.completedAt)], limit: 50 }),
      this.deps.db.query.opsOperationalLogEntries.findMany({ where: and(eq(opsOperationalLogEntries.companyId, companyId), inArray(opsOperationalLogEntries.severity, ['error','critical'])), orderBy: [desc(opsOperationalLogEntries.loggedAt)], limit: 30 }),
      this.deps.db.query.workflowRuns.findMany({ where: and(eq(workflowRuns.companyId, companyId), eq(workflowRuns.status, 'failed')), orderBy: [desc(workflowRuns.completedAt)], limit: 20 }),
      this.listBugDetections(companyId),
    ]);
    const syncedAt = new Date().toISOString();
    for (const run of failedTestRuns.filter((r) => r.failedCount > 0 || r.workflowStatus === 'cancelled')) {
      const fingerprint = `test_run:${run.id}`;
      if (!existing.some((row) => row.sourceModule === fingerprint)) {
        await this.createBugDetection(scope, { detectionSource: 'test_run', severity: 'critical', title: `Failed test run ${run.runKey}`, description: `${run.failedCount} failed test(s) in ${run.testSuite}`, sourceModule: fingerprint, sourceEntityId: run.id, fingerprint, config: { syncedAt } });
      }
    }
    for (const build of failedBuilds.filter((b) => b.workflowStatus === 'cancelled')) {
      const fingerprint = `build:${build.id}`;
      if (!existing.some((row) => row.sourceModule === fingerprint)) {
        await this.createBugDetection(scope, { detectionSource: 'build', severity: 'critical', title: `Failed build ${build.buildKey}`, description: build.branch ? `Build failed on ${build.branch}` : 'Build failed', sourceModule: fingerprint, sourceEntityId: build.id, fingerprint, config: { syncedAt } });
      }
    }
    for (const deployment of failedDeployments) {
      const fingerprint = `deployment:${deployment.id}`;
      if (!existing.some((row) => row.sourceModule === fingerprint)) {
        await this.createBugDetection(scope, { detectionSource: 'deployment', severity: 'critical', title: `Failed deployment ${deployment.deploymentKey}`, description: `Deployment to ${deployment.environment} failed`, sourceModule: fingerprint, sourceEntityId: deployment.id, fingerprint, config: { syncedAt } });
      }
    }
    for (const log of recentLogs) {
      const fingerprint = `log:${log.id}`;
      if (!existing.some((row) => row.sourceModule === fingerprint)) {
        await this.createBugDetection(scope, { detectionSource: 'operational_log', severity: log.severity === 'critical' ? 'critical' : 'warning', title: log.message.slice(0, 200), description: log.moduleKey, sourceModule: fingerprint, sourceEntityId: log.id, fingerprint, config: { syncedAt } });
      }
    }
    for (const workflow of failedWorkflows) {
      const fingerprint = `workflow:${workflow.id}`;
      if (!existing.some((row) => row.sourceModule === fingerprint)) {
        await this.createBugDetection(scope, { detectionSource: 'workflow_run', severity: 'warning', title: `Failed workflow ${workflow.triggerEvent}`, sourceModule: fingerprint, sourceEntityId: workflow.id, fingerprint, config: { syncedAt } });
      }
    }
    await this.recordAudit(scope, 'bug_detections_synced');
    return this.listBugDetections(companyId);
  }

  

  async createIncident(scope: StaffScope, input: CreateItoIncidentRequest): Promise<ItoIncidentSummary> {
    const [created] = await this.deps.db.insert(itoIncidents).values({
      companyId: scope.companyId,
      incidentNumber: input.incidentNumber ?? null,
      title: input.title.trim(),
      description: input.description?.trim() ?? null,
      severity: (input.severity ?? 'medium') as typeof itoIncidents.$inferInsert.severity,
      status: 'open',
      sourceModule: input.sourceModule ?? null,
      assignedUserId: input.assignedUserId ?? scope.userId,
      config: input.config ?? {},
      startedAt: new Date(),
    }).returning();
    await this.recordAudit(scope, 'incident_created', 'ito_incident', created!.id);
    return toIncidentSummary(created!);
  }

  async listIncidents(companyId: string): Promise<ItoIncidentSummary[]> {
    const rows = await this.deps.db.query.itoIncidents.findMany({ where: eq(itoIncidents.companyId, companyId), orderBy: [desc(itoIncidents.createdAt)], limit: 100 });
    return rows.map(toIncidentSummary);
  }

  async getIncident(companyId: string, id: string): Promise<ItoIncidentSummary | null> {
    const row = await this.deps.db.query.itoIncidents.findFirst({ where: and(eq(itoIncidents.companyId, companyId), eq(itoIncidents.id, id)) });
    return row ? toIncidentSummary(row) : null;
  }

  async updateIncident(scope: StaffScope, id: string, input: UpdateItoIncidentRequest): Promise<ItoIncidentSummary> {
    await this.ensureIncident(scope.companyId, id);
    const [updated] = await this.deps.db.update(itoIncidents).set({
      ...(input.incidentNumber !== undefined ? { incidentNumber: input.incidentNumber ?? null } : {}),
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() ?? null } : {}),
      ...(input.severity !== undefined ? { severity: input.severity as typeof itoIncidents.$inferInsert.severity } : {}),
      ...(input.status !== undefined ? { status: input.status as typeof itoIncidents.$inferInsert.status } : {}),
      ...(input.sourceModule !== undefined ? { sourceModule: input.sourceModule ?? null } : {}),
      ...(input.assignedUserId !== undefined ? { assignedUserId: input.assignedUserId ?? null } : {}),
      ...(input.mitigatedAt !== undefined ? { mitigatedAt: parseOptionalDate(input.mitigatedAt) } : {}),
      ...(input.resolvedAt !== undefined ? { resolvedAt: parseOptionalDate(input.resolvedAt) } : {}),
      ...(input.config !== undefined ? { config: input.config } : {}),
      updatedAt: new Date(),
    }).where(and(eq(itoIncidents.companyId, scope.companyId), eq(itoIncidents.id, id))).returning();
    await this.recordAudit(scope, 'incident_updated', 'ito_incident', id);
    return toIncidentSummary(updated!);
  }

  private async ensureIncident(companyId: string, id: string) {
    const row = await this.deps.db.query.itoIncidents.findFirst({ where: and(eq(itoIncidents.companyId, companyId), eq(itoIncidents.id, id)) });
    if (!row) throw new EnterpriseItOperationsError('NOT_FOUND', 'Incident not found');
    return row;
  }

  async listItAlerts(companyId: string, filters?: { status?: string }): Promise<ItoItAlertSummary[]> {
    const rows = await this.deps.db.query.itoItAlerts.findMany({ where: eq(itoItAlerts.companyId, companyId), orderBy: [desc(itoItAlerts.createdAt)], limit: 100 });
    return (filters?.status ? rows.filter((r) => r.status === filters.status) : rows).map(toItAlertSummary);
  }

  async syncItAlerts(scope: StaffScope): Promise<ItoItAlertSummary[]> {
    const monitoring = await this.getOperationsMonitoring(scope.companyId);
    const existingOpen = await this.listItAlerts(scope.companyId, { status: 'open' });
    const syncedAt = new Date();
    const defs = [
      ['open_incidents','critical','Open incidents',`${monitoring.openIncidentCount} open incident(s)`, monitoring.openIncidentCount > 0],
      ['degraded_monitors','warning','Degraded monitors',`${monitoring.degradedMonitorCount} degraded monitor(s)`, monitoring.degradedMonitorCount > 0],
      ['open_bugs','warning','Open bug detections',`${monitoring.openBugCount} open bug(s)`, monitoring.openBugCount > 0],
      ['failed_deployments','critical','Failed deployments',`${monitoring.failedDeploymentCount} failed deployment(s)`, monitoring.failedDeploymentCount > 0],
      ['pending_changes','warning','Pending change requests',`${monitoring.pendingChangeRequestCount} pending change(s)`, monitoring.pendingChangeRequestCount > 0],
    ] as const;
    for (const [alertType, severity, title, description, active] of defs) {
      const existing = existingOpen.find((row) => row.alertType === alertType);
      if (active && !existing) {
        await this.deps.db.insert(itoItAlerts).values({ companyId: scope.companyId, alertType, severity, status: 'open', title, description, sourceModule: 'it_operations', context: { syncedAt: syncedAt.toISOString(), monitoring } });
      } else if (!active && existing) {
        await this.deps.db.update(itoItAlerts).set({ status: 'resolved', updatedAt: syncedAt }).where(eq(itoItAlerts.id, existing.id));
      }
    }
    await this.recordAudit(scope, 'it_alerts_synced');
    return this.listItAlerts(scope.companyId, { status: 'open' });
  }

  async createItActionDraft(scope: StaffScope, input: CreateItoItActionDraftRequest) {
    const [created] = await this.deps.db.insert(itoItActionDrafts).values({ companyId: scope.companyId, userId: scope.userId, draftType: input.draftType.trim(), title: input.title.trim(), content: input.content.trim(), workflowStatus: 'draft', sourceRecords: input.sourceRecords ?? {}, aiGenerated: input.aiGenerated ?? false, requiresHumanReview: true }).returning();
    await this.recordAudit(scope, 'it_draft_created', 'ito_it_action_draft', created!.id);
    return { id: created!.id, title: created!.title, draftType: created!.draftType, workflowStatus: created!.workflowStatus };
  }

  async captureAnalytics(scope: StaffScope): Promise<ItoAnalyticsSummary> {
    const [dashboard, monitoring] = await Promise.all([this.getDashboard(scope.companyId), this.getOperationsMonitoring(scope.companyId)]);
    const [created] = await this.deps.db.insert(itoAnalyticsSnapshots).values({
      companyId: scope.companyId,
      openIncidentCount: dashboard.openIncidentCount,
      openAlertCount: dashboard.openAlertCount,
      degradedMonitorCount: dashboard.degradedMonitorCount,
      openBugCount: dashboard.openBugCount,
      pendingChangeRequestCount: dashboard.pendingChangeRequestCount,
      failedDeploymentCount: dashboard.failedDeploymentCount,
      technicalDebtCount: dashboard.technicalDebtCount,
      overallHealthStatus: monitoring.overallHealthStatus as typeof itoAnalyticsSnapshots.$inferInsert.overallHealthStatus,
    }).returning();
    await this.recordAudit(scope, 'analytics_captured', undefined, undefined, { monitoring });
    return toAnalyticsSummary(created!);
  }

  async getLatestAnalytics(companyId: string): Promise<ItoAnalyticsSummary | null> {
    const row = await this.deps.db.query.itoAnalyticsSnapshots.findFirst({ where: eq(itoAnalyticsSnapshots.companyId, companyId), orderBy: [desc(itoAnalyticsSnapshots.capturedAt)] });
    return row ? toAnalyticsSummary(row) : null;
  }

  async buildAuraContext(companyId: string): Promise<EnterpriseItOperationsAuraContext> {
    const dashboard = await this.getDashboard(companyId);
    return { openIncidentCount: dashboard.openIncidentCount, openAlertCount: dashboard.openAlertCount, degradedMonitorCount: dashboard.degradedMonitorCount, overallHealthStatus: dashboard.overallHealthStatus, failedDeploymentCount: dashboard.failedDeploymentCount, summary: dashboard.summary };
  }

  async executeSafeRepair(scope: StaffScope, input: ExecuteSafeRepairRequest): Promise<ExecuteSafeRepairResult> {
    const config = await this.getPlatformConfig(scope.companyId);
    const allowlist = (config.healingPolicies.allowlist as Array<{ repairKey: string; riskLevel: string }> | undefined) ?? [];
    const allowed = allowlist.find((entry) => entry.repairKey === input.repairKey);
    if (!allowed || allowed.riskLevel !== 'low') throw new EnterpriseItOperationsError('VALIDATION_ERROR', 'Only configured low-risk repairs are allowed');
    let output: Record<string, unknown> = {};
    let verified = false;
    if (input.repairKey === 'retry_integration_sync') {
      const connectorId = String(input.input?.connectorId ?? '');
      if (!connectorId) throw new EnterpriseItOperationsError('VALIDATION_ERROR', 'connectorId is required');
      const result = await this.deps.integrationPlatformService.retryConnectorSync(scope, connectorId);
      output = { syncJobId: result.syncJobId }; verified = result.syncJobId != null;
    } else if (input.repairKey === 'sync_mission_control_alerts') {
      await this.deps.enterpriseProductionReadinessService.syncMissionControlAlerts(scope.companyId);
      output = { synced: true }; verified = true;
    } else if (input.repairKey === 'capture_health_snapshots') {
      const snapshots = await this.deps.enterpriseProductionReadinessService.captureHealthSnapshots(scope.companyId);
      output = { snapshotCount: snapshots.length }; verified = snapshots.length > 0;
    } else throw new EnterpriseItOperationsError('VALIDATION_ERROR', 'Unsupported repair key');
    const healing = await this.recordSelfHealingAction(scope, { actionType: input.repairKey, riskLevel: 'low', triggeredBy: scope.userId, config: { input: input.input ?? {}, output } });
    const repairAttempt = await this.createRepairAttempt(scope, { repairType: input.repairKey, riskLevel: 'low', notes: verified ? 'Verified safe repair' : 'Repair executed', config: { input: input.input ?? {}, output } });
    if (verified) {
      await this.updateRepairAttempt(scope, repairAttempt.id, { success: true, workflowStatus: 'executed', attemptedAt: new Date().toISOString() });
    }
    return { repairAttemptId: repairAttempt.id, selfHealingActionId: healing.id, verified, workflowStatus: repairAttempt.workflowStatus, output };
  }

  async captureHealthSignals(scope: StaffScope): Promise<void> {
    const companyId = scope.companyId;
    const [productionDashboard, aiResilience, integrationDashboard] = await Promise.all([
      this.deps.enterpriseProductionReadinessService.getDashboard(companyId),
      this.deps.aiProviderResilienceService.getResilienceStatus(companyId),
      this.deps.integrationPlatformService.getExecutiveDashboard(companyId),
    ]);
    if (productionDashboard.performance) {
      await this.deps.db.insert(itoPerformanceSnapshots).values({
        companyId,
        healthStatus: 'healthy',
        apiP95LatencyMs: productionDashboard.performance.apiP95LatencyMs,
        queueDepth: productionDashboard.performance.queueDepth,
        backgroundJobFailureCount: productionDashboard.performance.backgroundJobFailureCount,
        cpuUsagePercent: productionDashboard.performance.cpuUsagePercent?.toString() ?? null,
        memoryUsageMb: productionDashboard.performance.memoryUsageMb,
        metrics: {},
      });
      await this.deps.db.insert(itoDatabaseHealthSnapshots).values({
        companyId,
        healthStatus: 'healthy',
        connectionPoolUsagePercent: productionDashboard.performance.dbPoolUsagePercent?.toString() ?? null,
        slowQueryCount: 0,
        metrics: {},
      });
      await this.deps.db.insert(itoApiReliabilitySnapshots).values({
        companyId,
        endpointGroup: 'platform_api',
        healthStatus: 'healthy',
        p95LatencyMs: productionDashboard.performance.apiP95LatencyMs,
        errorRatePercent: null,
        requestCount: 0,
        metrics: {},
      });
    }
    for (const provider of productionDashboard.aiProviders) {
      await this.deps.db.insert(itoAiProviderHealth).values({
        companyId,
        providerKey: provider.providerKey,
        healthStatus: provider.healthStatus === 'healthy' ? 'healthy' : provider.healthStatus === 'degraded' ? 'degraded' : 'unhealthy',
        latencyMs: provider.averageLatencyMs,
        errorRatePercent: provider.errorRatePercent?.toString() ?? null,
        rateLimitEvents: provider.rateLimitEvents,
        failoverCount: provider.failoverCount,
        metrics: { resilience: aiResilience },
      });
    }
    for (const connector of integrationDashboard.connectors) {
      await this.deps.db.insert(itoIntegrationHealth).values({
        companyId,
        integrationKey: connector.connectorKey,
        healthStatus: connector.status === 'connected' ? 'healthy' : connector.status === 'error' ? 'unhealthy' : 'degraded',
        failureCount: connector.lastError ? 1 : 0,
        lastSuccessAt: connector.lastSyncAt ? new Date(connector.lastSyncAt) : null,
        latencyMs: null,
        metrics: { provider: connector.provider, lastError: connector.lastError },
      });
    }
    await this.recordAudit(scope, 'health_signals_captured');
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.itoPlatformConfig.findFirst({ where: eq(itoPlatformConfig.companyId, companyId) });
    if (existing) return existing;
    const [created] = await this.deps.db.insert(itoPlatformConfig).values({ companyId }).returning();
    return created!;
  }

  private async recordAudit(scope: StaffScope, actionType: string, entityType?: string, entityId?: string, metadata?: Record<string, unknown>) {
    await this.deps.db.insert(itoAuditLogs).values({ companyId: scope.companyId, userId: scope.userId, actionType, entityType: entityType ?? null, entityId: entityId ?? null, metadata: metadata ?? {} });
  }

  async createHealthMonitor(scope: StaffScope, input: CreateItoHealthMonitorRequest): Promise<ItoHealthMonitorSummary> {
    const [created] = await this.deps.db.insert(itoHealthMonitors).values({ companyId: scope.companyId, ...mapCreateHealthMonitorInput(input) }).returning();
    await this.recordAudit(scope, 'health_monitors_created', 'ito_health_monitors', created!.id);
    return toHealthMonitorSummary(created!);
  }
  async listHealthMonitors(companyId: string): Promise<ItoHealthMonitorSummary[]> {
    const rows = await this.deps.db.query.itoHealthMonitors.findMany({ where: eq(itoHealthMonitors.companyId, companyId), orderBy: [desc(itoHealthMonitors.createdAt)], limit: 100 });
    return rows.map(toHealthMonitorSummary);
  }
  async getHealthMonitor(companyId: string, id: string): Promise<ItoHealthMonitorSummary | null> {
    const row = await this.deps.db.query.itoHealthMonitors.findFirst({ where: and(eq(itoHealthMonitors.companyId, companyId), eq(itoHealthMonitors.id, id)) });
    return row ? toHealthMonitorSummary(row) : null;
  }
  async updateHealthMonitor(scope: StaffScope, id: string, input: UpdateItoHealthMonitorRequest): Promise<ItoHealthMonitorSummary> {
    await this.ensureHealthMonitor(scope.companyId, id);
    const [updated] = await this.deps.db.update(itoHealthMonitors).set({ ...mapUpdateHealthMonitorInput(input), updatedAt: new Date() }).where(and(eq(itoHealthMonitors.companyId, scope.companyId), eq(itoHealthMonitors.id, id))).returning();
    await this.recordAudit(scope, 'health_monitors_updated', 'ito_health_monitors', id);
    return toHealthMonitorSummary(updated!);
  }
  private async ensureHealthMonitor(companyId: string, id: string) {
    const row = await this.deps.db.query.itoHealthMonitors.findFirst({ where: and(eq(itoHealthMonitors.companyId, companyId), eq(itoHealthMonitors.id, id)) });
    if (!row) throw new EnterpriseItOperationsError('NOT_FOUND', 'HealthMonitor not found');
    return row;
  }
  async createHealthSnapshot(scope: StaffScope, input: CreateItoHealthSnapshotRequest): Promise<ItoHealthSnapshotSummary> {
    const [created] = await this.deps.db.insert(itoHealthSnapshots).values({ companyId: scope.companyId, ...mapCreateHealthSnapshotInput(input) }).returning();
    await this.recordAudit(scope, 'health_snapshots_created', 'ito_health_snapshots', created!.id);
    return toHealthSnapshotSummary(created!);
  }
  async listHealthSnapshots(companyId: string): Promise<ItoHealthSnapshotSummary[]> {
    const rows = await this.deps.db.query.itoHealthSnapshots.findMany({ where: eq(itoHealthSnapshots.companyId, companyId), orderBy: [desc(itoHealthSnapshots.capturedAt)], limit: 100 });
    return rows.map(toHealthSnapshotSummary);
  }
  async getHealthSnapshot(companyId: string, id: string): Promise<ItoHealthSnapshotSummary | null> {
    const row = await this.deps.db.query.itoHealthSnapshots.findFirst({ where: and(eq(itoHealthSnapshots.companyId, companyId), eq(itoHealthSnapshots.id, id)) });
    return row ? toHealthSnapshotSummary(row) : null;
  }
  async createSelfHealingAction(scope: StaffScope, input: CreateItoSelfHealingActionRequest): Promise<ItoSelfHealingActionSummary> {
    const [created] = await this.deps.db.insert(itoSelfHealingActions).values({ companyId: scope.companyId, ...mapCreateSelfHealingActionInput(input) }).returning();
    await this.recordAudit(scope, 'self_healing_actions_created', 'ito_self_healing_actions', created!.id);
    return toSelfHealingActionSummary(created!);
  }
  async getSelfHealingAction(companyId: string, id: string): Promise<ItoSelfHealingActionSummary | null> {
    const row = await this.deps.db.query.itoSelfHealingActions.findFirst({ where: and(eq(itoSelfHealingActions.companyId, companyId), eq(itoSelfHealingActions.id, id)) });
    return row ? toSelfHealingActionSummary(row) : null;
  }
  async updateSelfHealingAction(scope: StaffScope, id: string, input: UpdateItoSelfHealingActionRequest): Promise<ItoSelfHealingActionSummary> {
    await this.ensureSelfHealingAction(scope.companyId, id);
    const [updated] = await this.deps.db.update(itoSelfHealingActions).set({ ...mapUpdateSelfHealingActionInput(input), updatedAt: new Date() }).where(and(eq(itoSelfHealingActions.companyId, scope.companyId), eq(itoSelfHealingActions.id, id))).returning();
    await this.recordAudit(scope, 'self_healing_actions_updated', 'ito_self_healing_actions', id);
    return toSelfHealingActionSummary(updated!);
  }
  private async ensureSelfHealingAction(companyId: string, id: string) {
    const row = await this.deps.db.query.itoSelfHealingActions.findFirst({ where: and(eq(itoSelfHealingActions.companyId, companyId), eq(itoSelfHealingActions.id, id)) });
    if (!row) throw new EnterpriseItOperationsError('NOT_FOUND', 'SelfHealingAction not found');
    return row;
  }
  async createBugDetection(scope: StaffScope, input: CreateItoBugDetectionRequest): Promise<ItoBugDetectionSummary> {
    const [created] = await this.deps.db.insert(itoBugDetections).values({ companyId: scope.companyId, ...mapCreateBugDetectionInput(input) }).returning();
    await this.recordAudit(scope, 'bug_detections_created', 'ito_bug_detections', created!.id);
    return toBugDetectionSummary(created!);
  }
  async listBugDetections(companyId: string): Promise<ItoBugDetectionSummary[]> {
    const rows = await this.deps.db.query.itoBugDetections.findMany({ where: eq(itoBugDetections.companyId, companyId), orderBy: [desc(itoBugDetections.createdAt)], limit: 100 });
    return rows.map(toBugDetectionSummary);
  }
  async getBugDetection(companyId: string, id: string): Promise<ItoBugDetectionSummary | null> {
    const row = await this.deps.db.query.itoBugDetections.findFirst({ where: and(eq(itoBugDetections.companyId, companyId), eq(itoBugDetections.id, id)) });
    return row ? toBugDetectionSummary(row) : null;
  }
  async updateBugDetection(scope: StaffScope, id: string, input: UpdateItoBugDetectionRequest): Promise<ItoBugDetectionSummary> {
    await this.ensureBugDetection(scope.companyId, id);
    const [updated] = await this.deps.db.update(itoBugDetections).set({ ...mapUpdateBugDetectionInput(input), updatedAt: new Date() }).where(and(eq(itoBugDetections.companyId, scope.companyId), eq(itoBugDetections.id, id))).returning();
    await this.recordAudit(scope, 'bug_detections_updated', 'ito_bug_detections', id);
    return toBugDetectionSummary(updated!);
  }
  private async ensureBugDetection(companyId: string, id: string) {
    const row = await this.deps.db.query.itoBugDetections.findFirst({ where: and(eq(itoBugDetections.companyId, companyId), eq(itoBugDetections.id, id)) });
    if (!row) throw new EnterpriseItOperationsError('NOT_FOUND', 'BugDetection not found');
    return row;
  }
  async createRootCauseAnalysis(scope: StaffScope, input: CreateItoRootCauseAnalysisRequest): Promise<ItoRootCauseAnalysisSummary> {
    const [created] = await this.deps.db.insert(itoRootCauseAnalyses).values({ companyId: scope.companyId, ...mapCreateRootCauseAnalysisInput(input, scope) }).returning();
    await this.recordAudit(scope, 'root_cause_analyses_created', 'ito_root_cause_analyses', created!.id);
    return toRootCauseAnalysisSummary(created!);
  }
  async listRootCauseAnalyses(companyId: string): Promise<ItoRootCauseAnalysisSummary[]> {
    const rows = await this.deps.db.query.itoRootCauseAnalyses.findMany({ where: eq(itoRootCauseAnalyses.companyId, companyId), orderBy: [desc(itoRootCauseAnalyses.createdAt)], limit: 100 });
    return rows.map(toRootCauseAnalysisSummary);
  }
  async getRootCauseAnalysis(companyId: string, id: string): Promise<ItoRootCauseAnalysisSummary | null> {
    const row = await this.deps.db.query.itoRootCauseAnalyses.findFirst({ where: and(eq(itoRootCauseAnalyses.companyId, companyId), eq(itoRootCauseAnalyses.id, id)) });
    return row ? toRootCauseAnalysisSummary(row) : null;
  }
  async updateRootCauseAnalysis(scope: StaffScope, id: string, input: UpdateItoRootCauseAnalysisRequest): Promise<ItoRootCauseAnalysisSummary> {
    await this.ensureRootCauseAnalysis(scope.companyId, id);
    const [updated] = await this.deps.db.update(itoRootCauseAnalyses).set({ ...mapUpdateRootCauseAnalysisInput(input), updatedAt: new Date() }).where(and(eq(itoRootCauseAnalyses.companyId, scope.companyId), eq(itoRootCauseAnalyses.id, id))).returning();
    await this.recordAudit(scope, 'root_cause_analyses_updated', 'ito_root_cause_analyses', id);
    return toRootCauseAnalysisSummary(updated!);
  }
  private async ensureRootCauseAnalysis(companyId: string, id: string) {
    const row = await this.deps.db.query.itoRootCauseAnalyses.findFirst({ where: and(eq(itoRootCauseAnalyses.companyId, companyId), eq(itoRootCauseAnalyses.id, id)) });
    if (!row) throw new EnterpriseItOperationsError('NOT_FOUND', 'RootCauseAnalysis not found');
    return row;
  }
  async createRepairAttempt(scope: StaffScope, input: CreateItoRepairAttemptRequest): Promise<ItoRepairAttemptSummary> {
    const [created] = await this.deps.db.insert(itoRepairAttempts).values({ companyId: scope.companyId, ...mapCreateRepairAttemptInput(input, scope) }).returning();
    await this.recordAudit(scope, 'repair_attempts_created', 'ito_repair_attempts', created!.id);
    return toRepairAttemptSummary(created!);
  }
  async listRepairAttempts(companyId: string): Promise<ItoRepairAttemptSummary[]> {
    const rows = await this.deps.db.query.itoRepairAttempts.findMany({ where: eq(itoRepairAttempts.companyId, companyId), orderBy: [desc(itoRepairAttempts.createdAt)], limit: 100 });
    return rows.map(toRepairAttemptSummary);
  }
  async getRepairAttempt(companyId: string, id: string): Promise<ItoRepairAttemptSummary | null> {
    const row = await this.deps.db.query.itoRepairAttempts.findFirst({ where: and(eq(itoRepairAttempts.companyId, companyId), eq(itoRepairAttempts.id, id)) });
    return row ? toRepairAttemptSummary(row) : null;
  }
  async updateRepairAttempt(scope: StaffScope, id: string, input: UpdateItoRepairAttemptRequest): Promise<ItoRepairAttemptSummary> {
    await this.ensureRepairAttempt(scope.companyId, id);
    const [updated] = await this.deps.db.update(itoRepairAttempts).set({ ...mapUpdateRepairAttemptInput(input), updatedAt: new Date() }).where(and(eq(itoRepairAttempts.companyId, scope.companyId), eq(itoRepairAttempts.id, id))).returning();
    await this.recordAudit(scope, 'repair_attempts_updated', 'ito_repair_attempts', id);
    return toRepairAttemptSummary(updated!);
  }
  private async ensureRepairAttempt(companyId: string, id: string) {
    const row = await this.deps.db.query.itoRepairAttempts.findFirst({ where: and(eq(itoRepairAttempts.companyId, companyId), eq(itoRepairAttempts.id, id)) });
    if (!row) throw new EnterpriseItOperationsError('NOT_FOUND', 'RepairAttempt not found');
    return row;
  }
  async createBuildRecord(scope: StaffScope, input: CreateItoBuildRecordRequest): Promise<ItoBuildRecordSummary> {
    const [created] = await this.deps.db.insert(itoBuildRecords).values({ companyId: scope.companyId, ...mapCreateBuildRecordInput(input) }).returning();
    await this.recordAudit(scope, 'build_records_created', 'ito_build_records', created!.id);
    return toBuildRecordSummary(created!);
  }
  async listBuildRecords(companyId: string): Promise<ItoBuildRecordSummary[]> {
    const rows = await this.deps.db.query.itoBuildRecords.findMany({ where: eq(itoBuildRecords.companyId, companyId), orderBy: [desc(itoBuildRecords.createdAt)], limit: 100 });
    return rows.map(toBuildRecordSummary);
  }
  async getBuildRecord(companyId: string, id: string): Promise<ItoBuildRecordSummary | null> {
    const row = await this.deps.db.query.itoBuildRecords.findFirst({ where: and(eq(itoBuildRecords.companyId, companyId), eq(itoBuildRecords.id, id)) });
    return row ? toBuildRecordSummary(row) : null;
  }
  async updateBuildRecord(scope: StaffScope, id: string, input: UpdateItoBuildRecordRequest): Promise<ItoBuildRecordSummary> {
    await this.ensureBuildRecord(scope.companyId, id);
    const [updated] = await this.deps.db.update(itoBuildRecords).set({ ...mapUpdateBuildRecordInput(input) }).where(and(eq(itoBuildRecords.companyId, scope.companyId), eq(itoBuildRecords.id, id))).returning();
    await this.recordAudit(scope, 'build_records_updated', 'ito_build_records', id);
    return toBuildRecordSummary(updated!);
  }
  private async ensureBuildRecord(companyId: string, id: string) {
    const row = await this.deps.db.query.itoBuildRecords.findFirst({ where: and(eq(itoBuildRecords.companyId, companyId), eq(itoBuildRecords.id, id)) });
    if (!row) throw new EnterpriseItOperationsError('NOT_FOUND', 'BuildRecord not found');
    return row;
  }
  async createTestRun(scope: StaffScope, input: CreateItoTestRunRequest): Promise<ItoTestRunSummary> {
    const [created] = await this.deps.db.insert(itoTestRuns).values({ companyId: scope.companyId, ...mapCreateTestRunInput(input) }).returning();
    await this.recordAudit(scope, 'test_runs_created', 'ito_test_runs', created!.id);
    return toTestRunSummary(created!);
  }
  async listTestRuns(companyId: string): Promise<ItoTestRunSummary[]> {
    const rows = await this.deps.db.query.itoTestRuns.findMany({ where: eq(itoTestRuns.companyId, companyId), orderBy: [desc(itoTestRuns.createdAt)], limit: 100 });
    return rows.map(toTestRunSummary);
  }
  async getTestRun(companyId: string, id: string): Promise<ItoTestRunSummary | null> {
    const row = await this.deps.db.query.itoTestRuns.findFirst({ where: and(eq(itoTestRuns.companyId, companyId), eq(itoTestRuns.id, id)) });
    return row ? toTestRunSummary(row) : null;
  }
  async updateTestRun(scope: StaffScope, id: string, input: UpdateItoTestRunRequest): Promise<ItoTestRunSummary> {
    await this.ensureTestRun(scope.companyId, id);
    const [updated] = await this.deps.db.update(itoTestRuns).set({ ...mapUpdateTestRunInput(input) }).where(and(eq(itoTestRuns.companyId, scope.companyId), eq(itoTestRuns.id, id))).returning();
    await this.recordAudit(scope, 'test_runs_updated', 'ito_test_runs', id);
    return toTestRunSummary(updated!);
  }
  private async ensureTestRun(companyId: string, id: string) {
    const row = await this.deps.db.query.itoTestRuns.findFirst({ where: and(eq(itoTestRuns.companyId, companyId), eq(itoTestRuns.id, id)) });
    if (!row) throw new EnterpriseItOperationsError('NOT_FOUND', 'TestRun not found');
    return row;
  }
  async createChangeRequest(scope: StaffScope, input: CreateItoChangeRequestRequest): Promise<ItoChangeRequestSummary> {
    const [created] = await this.deps.db.insert(itoChangeRequests).values({ companyId: scope.companyId, ...mapCreateChangeRequestInput(input, scope) }).returning();
    await this.recordAudit(scope, 'change_requests_created', 'ito_change_requests', created!.id);
    return toChangeRequestSummary(created!);
  }
  async listChangeRequests(companyId: string): Promise<ItoChangeRequestSummary[]> {
    const rows = await this.deps.db.query.itoChangeRequests.findMany({ where: eq(itoChangeRequests.companyId, companyId), orderBy: [desc(itoChangeRequests.createdAt)], limit: 100 });
    return rows.map(toChangeRequestSummary);
  }
  async getChangeRequest(companyId: string, id: string): Promise<ItoChangeRequestSummary | null> {
    const row = await this.deps.db.query.itoChangeRequests.findFirst({ where: and(eq(itoChangeRequests.companyId, companyId), eq(itoChangeRequests.id, id)) });
    return row ? toChangeRequestSummary(row) : null;
  }
  async updateChangeRequest(scope: StaffScope, id: string, input: UpdateItoChangeRequestRequest): Promise<ItoChangeRequestSummary> {
    await this.ensureChangeRequest(scope.companyId, id);
    const [updated] = await this.deps.db.update(itoChangeRequests).set({ ...mapUpdateChangeRequestInput(input), updatedAt: new Date() }).where(and(eq(itoChangeRequests.companyId, scope.companyId), eq(itoChangeRequests.id, id))).returning();
    await this.recordAudit(scope, 'change_requests_updated', 'ito_change_requests', id);
    return toChangeRequestSummary(updated!);
  }
  private async ensureChangeRequest(companyId: string, id: string) {
    const row = await this.deps.db.query.itoChangeRequests.findFirst({ where: and(eq(itoChangeRequests.companyId, companyId), eq(itoChangeRequests.id, id)) });
    if (!row) throw new EnterpriseItOperationsError('NOT_FOUND', 'ChangeRequest not found');
    return row;
  }
  async createDeployment(scope: StaffScope, input: CreateItoDeploymentRequest): Promise<ItoDeploymentSummary> {
    const [created] = await this.deps.db.insert(itoDeployments).values({ companyId: scope.companyId, ...mapCreateDeploymentInput(input) }).returning();
    await this.recordAudit(scope, 'deployments_created', 'ito_deployments', created!.id);
    return toDeploymentSummary(created!);
  }
  async listDeployments(companyId: string): Promise<ItoDeploymentSummary[]> {
    const rows = await this.deps.db.query.itoDeployments.findMany({ where: eq(itoDeployments.companyId, companyId), orderBy: [desc(itoDeployments.createdAt)], limit: 100 });
    return rows.map(toDeploymentSummary);
  }
  async getDeployment(companyId: string, id: string): Promise<ItoDeploymentSummary | null> {
    const row = await this.deps.db.query.itoDeployments.findFirst({ where: and(eq(itoDeployments.companyId, companyId), eq(itoDeployments.id, id)) });
    return row ? toDeploymentSummary(row) : null;
  }
  async updateDeployment(scope: StaffScope, id: string, input: UpdateItoDeploymentRequest): Promise<ItoDeploymentSummary> {
    await this.ensureDeployment(scope.companyId, id);
    const [updated] = await this.deps.db.update(itoDeployments).set({ ...mapUpdateDeploymentInput(input), updatedAt: new Date() }).where(and(eq(itoDeployments.companyId, scope.companyId), eq(itoDeployments.id, id))).returning();
    await this.recordAudit(scope, 'deployments_updated', 'ito_deployments', id);
    return toDeploymentSummary(updated!);
  }
  private async ensureDeployment(companyId: string, id: string) {
    const row = await this.deps.db.query.itoDeployments.findFirst({ where: and(eq(itoDeployments.companyId, companyId), eq(itoDeployments.id, id)) });
    if (!row) throw new EnterpriseItOperationsError('NOT_FOUND', 'Deployment not found');
    return row;
  }
  async createDependencyRecord(scope: StaffScope, input: CreateItoDependencyRecordRequest): Promise<ItoDependencyRecordSummary> {
    const [created] = await this.deps.db.insert(itoDependencyRecords).values({ companyId: scope.companyId, ...mapCreateDependencyRecordInput(input) }).returning();
    await this.recordAudit(scope, 'dependency_records_created', 'ito_dependency_records', created!.id);
    return toDependencyRecordSummary(created!);
  }
  async listDependencyRecords(companyId: string): Promise<ItoDependencyRecordSummary[]> {
    const rows = await this.deps.db.query.itoDependencyRecords.findMany({ where: eq(itoDependencyRecords.companyId, companyId), orderBy: [desc(itoDependencyRecords.createdAt)], limit: 100 });
    return rows.map(toDependencyRecordSummary);
  }
  async getDependencyRecord(companyId: string, id: string): Promise<ItoDependencyRecordSummary | null> {
    const row = await this.deps.db.query.itoDependencyRecords.findFirst({ where: and(eq(itoDependencyRecords.companyId, companyId), eq(itoDependencyRecords.id, id)) });
    return row ? toDependencyRecordSummary(row) : null;
  }
  async updateDependencyRecord(scope: StaffScope, id: string, input: UpdateItoDependencyRecordRequest): Promise<ItoDependencyRecordSummary> {
    await this.ensureDependencyRecord(scope.companyId, id);
    const [updated] = await this.deps.db.update(itoDependencyRecords).set({ ...mapUpdateDependencyRecordInput(input), updatedAt: new Date() }).where(and(eq(itoDependencyRecords.companyId, scope.companyId), eq(itoDependencyRecords.id, id))).returning();
    await this.recordAudit(scope, 'dependency_records_updated', 'ito_dependency_records', id);
    return toDependencyRecordSummary(updated!);
  }
  private async ensureDependencyRecord(companyId: string, id: string) {
    const row = await this.deps.db.query.itoDependencyRecords.findFirst({ where: and(eq(itoDependencyRecords.companyId, companyId), eq(itoDependencyRecords.id, id)) });
    if (!row) throw new EnterpriseItOperationsError('NOT_FOUND', 'DependencyRecord not found');
    return row;
  }
  async createTechnicalDebtRecord(scope: StaffScope, input: CreateItoTechnicalDebtRecordRequest): Promise<ItoTechnicalDebtRecordSummary> {
    const [created] = await this.deps.db.insert(itoTechnicalDebtRecords).values({ companyId: scope.companyId, ...mapCreateTechnicalDebtRecordInput(input, scope) }).returning();
    await this.recordAudit(scope, 'technical_debt_records_created', 'ito_technical_debt_records', created!.id);
    return toTechnicalDebtRecordSummary(created!);
  }
  async listTechnicalDebtRecords(companyId: string): Promise<ItoTechnicalDebtRecordSummary[]> {
    const rows = await this.deps.db.query.itoTechnicalDebtRecords.findMany({ where: eq(itoTechnicalDebtRecords.companyId, companyId), orderBy: [desc(itoTechnicalDebtRecords.createdAt)], limit: 100 });
    return rows.map(toTechnicalDebtRecordSummary);
  }
  async getTechnicalDebtRecord(companyId: string, id: string): Promise<ItoTechnicalDebtRecordSummary | null> {
    const row = await this.deps.db.query.itoTechnicalDebtRecords.findFirst({ where: and(eq(itoTechnicalDebtRecords.companyId, companyId), eq(itoTechnicalDebtRecords.id, id)) });
    return row ? toTechnicalDebtRecordSummary(row) : null;
  }
  async updateTechnicalDebtRecord(scope: StaffScope, id: string, input: UpdateItoTechnicalDebtRecordRequest): Promise<ItoTechnicalDebtRecordSummary> {
    await this.ensureTechnicalDebtRecord(scope.companyId, id);
    const [updated] = await this.deps.db.update(itoTechnicalDebtRecords).set({ ...mapUpdateTechnicalDebtRecordInput(input), updatedAt: new Date() }).where(and(eq(itoTechnicalDebtRecords.companyId, scope.companyId), eq(itoTechnicalDebtRecords.id, id))).returning();
    await this.recordAudit(scope, 'technical_debt_records_updated', 'ito_technical_debt_records', id);
    return toTechnicalDebtRecordSummary(updated!);
  }
  private async ensureTechnicalDebtRecord(companyId: string, id: string) {
    const row = await this.deps.db.query.itoTechnicalDebtRecords.findFirst({ where: and(eq(itoTechnicalDebtRecords.companyId, companyId), eq(itoTechnicalDebtRecords.id, id)) });
    if (!row) throw new EnterpriseItOperationsError('NOT_FOUND', 'TechnicalDebtRecord not found');
    return row;
  }
  async createBackupVerification(scope: StaffScope, input: CreateItoBackupVerificationRequest): Promise<ItoBackupVerificationSummary> {
    const [created] = await this.deps.db.insert(itoBackupVerifications).values({ companyId: scope.companyId, ...mapCreateBackupVerificationInput(input, scope) }).returning();
    await this.recordAudit(scope, 'backup_verifications_created', 'ito_backup_verifications', created!.id);
    return toBackupVerificationSummary(created!);
  }
  async listBackupVerifications(companyId: string): Promise<ItoBackupVerificationSummary[]> {
    const rows = await this.deps.db.query.itoBackupVerifications.findMany({ where: eq(itoBackupVerifications.companyId, companyId), orderBy: [desc(itoBackupVerifications.createdAt)], limit: 100 });
    return rows.map(toBackupVerificationSummary);
  }
  async getBackupVerification(companyId: string, id: string): Promise<ItoBackupVerificationSummary | null> {
    const row = await this.deps.db.query.itoBackupVerifications.findFirst({ where: and(eq(itoBackupVerifications.companyId, companyId), eq(itoBackupVerifications.id, id)) });
    return row ? toBackupVerificationSummary(row) : null;
  }
  async updateBackupVerification(scope: StaffScope, id: string, input: UpdateItoBackupVerificationRequest): Promise<ItoBackupVerificationSummary> {
    await this.ensureBackupVerification(scope.companyId, id);
    const [updated] = await this.deps.db.update(itoBackupVerifications).set({ ...mapUpdateBackupVerificationInput(input) }).where(and(eq(itoBackupVerifications.companyId, scope.companyId), eq(itoBackupVerifications.id, id))).returning();
    await this.recordAudit(scope, 'backup_verifications_updated', 'ito_backup_verifications', id);
    return toBackupVerificationSummary(updated!);
  }
  private async ensureBackupVerification(companyId: string, id: string) {
    const row = await this.deps.db.query.itoBackupVerifications.findFirst({ where: and(eq(itoBackupVerifications.companyId, companyId), eq(itoBackupVerifications.id, id)) });
    if (!row) throw new EnterpriseItOperationsError('NOT_FOUND', 'BackupVerification not found');
    return row;
  }

  async listDatabaseHealthSnapshots(companyId: string): Promise<ItoDatabaseHealthSnapshotSummary[]> {
    const rows = await this.deps.db.query.itoDatabaseHealthSnapshots.findMany({ where: eq(itoDatabaseHealthSnapshots.companyId, companyId), orderBy: [desc(itoDatabaseHealthSnapshots.capturedAt)], limit: 100 });
    return rows.map(toDatabaseHealthSnapshotSummary);
  }

  async listApiReliabilitySnapshots(companyId: string): Promise<ItoApiReliabilitySnapshotSummary[]> {
    const rows = await this.deps.db.query.itoApiReliabilitySnapshots.findMany({ where: eq(itoApiReliabilitySnapshots.companyId, companyId), orderBy: [desc(itoApiReliabilitySnapshots.capturedAt)], limit: 100 });
    return rows.map(toApiReliabilitySnapshotSummary);
  }

  async listAiProviderHealthSnapshots(companyId: string): Promise<ItoAiProviderHealthSummary[]> {
    const rows = await this.deps.db.query.itoAiProviderHealth.findMany({ where: eq(itoAiProviderHealth.companyId, companyId), orderBy: [desc(itoAiProviderHealth.capturedAt)], limit: 100 });
    return rows.map(toAiProviderHealthSummary);
  }

  async listIntegrationHealthSnapshots(companyId: string): Promise<ItoIntegrationHealthSummary[]> {
    const rows = await this.deps.db.query.itoIntegrationHealth.findMany({ where: eq(itoIntegrationHealth.companyId, companyId), orderBy: [desc(itoIntegrationHealth.capturedAt)], limit: 100 });
    return rows.map(toIntegrationHealthSummary);
  }

  async listPerformanceSnapshots(companyId: string): Promise<ItoPerformanceSnapshotSummary[]> {
    const rows = await this.deps.db.query.itoPerformanceSnapshots.findMany({ where: eq(itoPerformanceSnapshots.companyId, companyId), orderBy: [desc(itoPerformanceSnapshots.capturedAt)], limit: 100 });
    return rows.map(toPerformanceSnapshotSummary);
  }

  async getProductionReadinessDashboard(companyId: string) {
    return this.deps.enterpriseProductionReadinessService.getDashboard(companyId);
  }

  async getMissionControlDashboard(companyId: string) {
    return this.deps.enterpriseMissionControlService.getMissionControlDashboard(companyId);
  }

  async getSecurityDashboard(companyId: string) {
    return this.deps.enterpriseSecurityService.getExecutiveDashboard(companyId);
  }

  async getAiResilienceStatus(companyId: string) {
    return this.deps.aiProviderResilienceService.getResilienceStatus(companyId);
  }

  async getIntegrationMonitoringSummary(companyId: string) {
    return this.deps.integrationPlatformService.getMonitoringSummary(companyId);
  }

  async getIntegrationExecutiveDashboard(companyId: string) {
    return this.deps.integrationPlatformService.getExecutiveDashboard(companyId);
  }

  async getAiOperationsAllowance(companyId: string) {
    return this.deps.aiOperationsService.getAllowanceSummary(companyId);
  }

  async acknowledgeItAlert(scope: StaffScope, alertId: string): Promise<ItoItAlertSummary> {
    const row = await this.deps.db.query.itoItAlerts.findFirst({ where: and(eq(itoItAlerts.companyId, scope.companyId), eq(itoItAlerts.id, alertId)) });
    if (!row) throw new EnterpriseItOperationsError('NOT_FOUND', 'IT alert not found');
    const [updated] = await this.deps.db.update(itoItAlerts).set({ status: 'acknowledged', acknowledgedByUserId: scope.userId, acknowledgedAt: new Date(), updatedAt: new Date() }).where(eq(itoItAlerts.id, alertId)).returning();
    await this.recordAudit(scope, 'it_alert_acknowledged', 'ito_it_alert', alertId);
    return toItAlertSummary(updated!);
  }

  async listAuditLogs(companyId: string, limit = 100) {
    const rows = await this.deps.db.query.itoAuditLogs.findMany({ where: eq(itoAuditLogs.companyId, companyId), orderBy: [desc(itoAuditLogs.createdAt)], limit });
    return rows.map((row) => ({ id: row.id, actionType: row.actionType, entityType: row.entityType, entityId: row.entityId, userId: row.userId, metadata: row.metadata, createdAt: row.createdAt.toISOString() }));
  }
}

function toPlatformConfigSummary(row: typeof itoPlatformConfig.$inferSelect): ItoPlatformConfigSummary {
  return { healthThresholds: row.healthThresholds, monitoringConfig: row.monitoringConfig, healingPolicies: row.healingPolicies, deploymentStandards: row.deploymentStandards, alertRouting: row.alertRouting, changeManagementPolicy: row.changeManagementPolicy, auditRetentionDays: row.auditRetentionDays };
}
function toItAlertSummary(row: typeof itoItAlerts.$inferSelect): ItoItAlertSummary {
  return { id: row.id, alertType: row.alertType, severity: row.severity, status: row.status, title: row.title, description: row.description, sourceModule: row.sourceModule, incidentId: row.incidentId, createdAt: row.createdAt.toISOString() };
}
function toAnalyticsSummary(row: typeof itoAnalyticsSnapshots.$inferSelect): ItoAnalyticsSummary {
  return { openIncidentCount: row.openIncidentCount, openAlertCount: row.openAlertCount, degradedMonitorCount: row.degradedMonitorCount, openBugCount: row.openBugCount, pendingChangeRequestCount: row.pendingChangeRequestCount, failedDeploymentCount: row.failedDeploymentCount, technicalDebtCount: row.technicalDebtCount, overallHealthStatus: row.overallHealthStatus, capturedAt: row.capturedAt.toISOString() };
}
function toIncidentSummary(row: typeof itoIncidents.$inferSelect): ItoIncidentSummary {
  return { id: row.id, incidentNumber: row.incidentNumber, title: row.title, description: row.description, severity: row.severity, status: row.status, sourceModule: row.sourceModule, assignedUserId: row.assignedUserId, startedAt: row.startedAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null };
}
function parseOptionalDate(value?: string | null): Date | null { if (!value) return null; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? null : parsed; }


function toHealthMonitorSummary(row: typeof itoHealthMonitors.$inferSelect): ItoHealthMonitorSummary {
  return { id: row.id, monitorKey: row.monitorKey, name: row.name, monitorType: row.monitorType, targetModule: row.targetModule, healthStatus: row.healthStatus, isActive: row.isActive, lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null };
}
function mapCreateHealthMonitorInput(input: CreateItoHealthMonitorRequest) {
  return { monitorKey: input.monitorKey.trim(), name: input.name.trim(), monitorType: input.monitorType.trim(), targetModule: input.targetModule ?? null, config: input.config ?? {} };
}
function mapUpdateHealthMonitorInput(input: UpdateItoHealthMonitorRequest) {
  return {
    ...(input.monitorKey !== undefined ? { monitorKey: input.monitorKey.trim() } : {}),
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.monitorType !== undefined ? { monitorType: input.monitorType } : {}),
    ...(input.targetModule !== undefined ? { targetModule: input.targetModule ?? null } : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
    ...(input.healthStatus !== undefined ? { healthStatus: input.healthStatus as typeof itoHealthMonitors.$inferInsert.healthStatus } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  };
}

function toHealthSnapshotSummary(row: typeof itoHealthSnapshots.$inferSelect): ItoHealthSnapshotSummary {
  return { id: row.id, monitorId: row.monitorId, snapshotKey: row.snapshotKey, healthStatus: row.healthStatus, capturedAt: row.capturedAt.toISOString() };
}
function mapCreateHealthSnapshotInput(input: CreateItoHealthSnapshotRequest) {
  return { monitorId: input.monitorId ?? null, snapshotKey: input.snapshotKey.trim(), healthStatus: (input.healthStatus ?? 'unknown') as typeof itoHealthSnapshots.$inferInsert.healthStatus, metrics: input.metrics ?? {}, config: input.config ?? {} };
}

function toSelfHealingActionSummary(row: typeof itoSelfHealingActions.$inferSelect): ItoSelfHealingActionSummary {
  return { id: row.id, monitorId: row.monitorId, actionType: row.actionType, workflowStatus: row.workflowStatus, riskLevel: row.riskLevel, outcome: row.outcome, executedAt: row.executedAt?.toISOString() ?? null };
}
function mapCreateSelfHealingActionInput(input: CreateItoSelfHealingActionRequest) {
  return { monitorId: input.monitorId ?? null, actionType: input.actionType.trim(), riskLevel: (input.riskLevel ?? 'medium') as typeof itoSelfHealingActions.$inferInsert.riskLevel, triggeredBy: input.triggeredBy ?? null, config: input.config ?? {}, workflowStatus: 'draft' as const };
}
function mapUpdateSelfHealingActionInput(input: UpdateItoSelfHealingActionRequest) {
  return {
    ...(input.monitorId !== undefined ? { monitorId: input.monitorId ?? null } : {}),
    ...(input.actionType !== undefined ? { actionType: input.actionType } : {}),
    ...(input.riskLevel !== undefined ? { riskLevel: input.riskLevel as typeof itoSelfHealingActions.$inferInsert.riskLevel } : {}),
    ...(input.triggeredBy !== undefined ? { triggeredBy: input.triggeredBy ?? null } : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
    ...(input.workflowStatus !== undefined ? { workflowStatus: input.workflowStatus as typeof itoSelfHealingActions.$inferInsert.workflowStatus } : {}),
    ...(input.outcome !== undefined ? { outcome: input.outcome ?? null } : {}),
    ...(input.executedAt !== undefined ? { executedAt: parseOptionalDate(input.executedAt) } : {}),
  };
}

function toBugDetectionSummary(row: typeof itoBugDetections.$inferSelect): ItoBugDetectionSummary {
  return { id: row.id, detectionSource: row.detectionSource, severity: row.severity, title: row.title, description: row.description, workflowStatus: row.workflowStatus, sourceModule: row.sourceModule, detectedAt: row.detectedAt.toISOString() };
}
function mapCreateBugDetectionInput(input: CreateItoBugDetectionRequest) {
  return { detectionSource: input.detectionSource.trim(), severity: (input.severity ?? 'warning') as typeof itoBugDetections.$inferInsert.severity, title: input.title.trim(), description: input.description ?? null, sourceModule: input.sourceModule ?? null, sourceEntityId: input.sourceEntityId ?? null, fingerprint: input.fingerprint ?? null, config: input.config ?? {}, workflowStatus: 'draft' as const };
}
function mapUpdateBugDetectionInput(input: UpdateItoBugDetectionRequest) {
  return {
    ...(input.detectionSource !== undefined ? { detectionSource: input.detectionSource } : {}),
    ...(input.severity !== undefined ? { severity: input.severity as typeof itoBugDetections.$inferInsert.severity } : {}),
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description ?? null } : {}),
    ...(input.sourceModule !== undefined ? { sourceModule: input.sourceModule ?? null } : {}),
    ...(input.sourceEntityId !== undefined ? { sourceEntityId: input.sourceEntityId ?? null } : {}),
    ...(input.fingerprint !== undefined ? { fingerprint: input.fingerprint ?? null } : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
    ...(input.workflowStatus !== undefined ? { workflowStatus: input.workflowStatus as typeof itoBugDetections.$inferInsert.workflowStatus } : {}),
  };
}

function toRootCauseAnalysisSummary(row: typeof itoRootCauseAnalyses.$inferSelect): ItoRootCauseAnalysisSummary {
  return { id: row.id, bugDetectionId: row.bugDetectionId, incidentId: row.incidentId, title: row.title, rootCause: row.rootCause, workflowStatus: row.workflowStatus, analyzedByUserId: row.analyzedByUserId, completedAt: row.completedAt?.toISOString() ?? null };
}
function mapCreateRootCauseAnalysisInput(input: CreateItoRootCauseAnalysisRequest, scope: StaffScope) {
  return { bugDetectionId: input.bugDetectionId ?? null, incidentId: input.incidentId ?? null, title: input.title.trim(), rootCause: input.rootCause ?? null, analysis: input.analysis ?? {}, config: input.config ?? {}, analyzedByUserId: scope.userId, workflowStatus: 'draft' as const };
}
function mapUpdateRootCauseAnalysisInput(input: UpdateItoRootCauseAnalysisRequest) {
  return {
    ...(input.bugDetectionId !== undefined ? { bugDetectionId: input.bugDetectionId ?? null } : {}),
    ...(input.incidentId !== undefined ? { incidentId: input.incidentId ?? null } : {}),
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.rootCause !== undefined ? { rootCause: input.rootCause ?? null } : {}),
    ...(input.analysis !== undefined ? { analysis: input.analysis } : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
    ...(input.workflowStatus !== undefined ? { workflowStatus: input.workflowStatus as typeof itoRootCauseAnalyses.$inferInsert.workflowStatus } : {}),
    ...(input.completedAt !== undefined ? { completedAt: parseOptionalDate(input.completedAt) } : {}),
  };
}

function toRepairAttemptSummary(row: typeof itoRepairAttempts.$inferSelect): ItoRepairAttemptSummary {
  return { id: row.id, bugDetectionId: row.bugDetectionId, rootCauseAnalysisId: row.rootCauseAnalysisId, repairType: row.repairType, workflowStatus: row.workflowStatus, riskLevel: row.riskLevel, success: row.success, attemptedAt: row.attemptedAt?.toISOString() ?? null };
}
function mapCreateRepairAttemptInput(input: CreateItoRepairAttemptRequest, scope: StaffScope) {
  return { bugDetectionId: input.bugDetectionId ?? null, rootCauseAnalysisId: input.rootCauseAnalysisId ?? null, repairType: input.repairType.trim(), riskLevel: (input.riskLevel ?? 'medium') as typeof itoRepairAttempts.$inferInsert.riskLevel, notes: input.notes ?? null, config: input.config ?? {}, attemptedByUserId: scope.userId, workflowStatus: 'draft' as const };
}
function mapUpdateRepairAttemptInput(input: UpdateItoRepairAttemptRequest) {
  return {
    ...(input.bugDetectionId !== undefined ? { bugDetectionId: input.bugDetectionId ?? null } : {}),
    ...(input.rootCauseAnalysisId !== undefined ? { rootCauseAnalysisId: input.rootCauseAnalysisId ?? null } : {}),
    ...(input.repairType !== undefined ? { repairType: input.repairType } : {}),
    ...(input.riskLevel !== undefined ? { riskLevel: input.riskLevel as typeof itoRepairAttempts.$inferInsert.riskLevel } : {}),
    ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
    ...(input.workflowStatus !== undefined ? { workflowStatus: input.workflowStatus as typeof itoRepairAttempts.$inferInsert.workflowStatus } : {}),
    ...(input.success !== undefined ? { success: input.success } : {}),
    ...(input.attemptedAt !== undefined ? { attemptedAt: parseOptionalDate(input.attemptedAt) } : {}),
  };
}

function toBuildRecordSummary(row: typeof itoBuildRecords.$inferSelect): ItoBuildRecordSummary {
  return { id: row.id, buildKey: row.buildKey, version: row.version, branch: row.branch, commitSha: row.commitSha, workflowStatus: row.workflowStatus, startedAt: row.startedAt?.toISOString() ?? null, completedAt: row.completedAt?.toISOString() ?? null };
}
function mapCreateBuildRecordInput(input: CreateItoBuildRecordRequest) {
  return { buildKey: input.buildKey.trim(), version: input.version ?? null, branch: input.branch ?? null, commitSha: input.commitSha ?? null, config: input.config ?? {}, workflowStatus: 'draft' as const };
}
function mapUpdateBuildRecordInput(input: UpdateItoBuildRecordRequest) {
  return {
    ...(input.buildKey !== undefined ? { buildKey: input.buildKey.trim() } : {}),
    ...(input.version !== undefined ? { version: input.version ?? null } : {}),
    ...(input.branch !== undefined ? { branch: input.branch ?? null } : {}),
    ...(input.commitSha !== undefined ? { commitSha: input.commitSha ?? null } : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
    ...(input.workflowStatus !== undefined ? { workflowStatus: input.workflowStatus as typeof itoBuildRecords.$inferInsert.workflowStatus } : {}),
    ...(input.startedAt !== undefined ? { startedAt: parseOptionalDate(input.startedAt) } : {}),
    ...(input.completedAt !== undefined ? { completedAt: parseOptionalDate(input.completedAt) } : {}),
  };
}

function toTestRunSummary(row: typeof itoTestRuns.$inferSelect): ItoTestRunSummary {
  return { id: row.id, runKey: row.runKey, testSuite: row.testSuite, workflowStatus: row.workflowStatus, passedCount: row.passedCount, failedCount: row.failedCount, skippedCount: row.skippedCount, startedAt: row.startedAt?.toISOString() ?? null, completedAt: row.completedAt?.toISOString() ?? null };
}
function mapCreateTestRunInput(input: CreateItoTestRunRequest) {
  return { runKey: input.runKey.trim(), testSuite: input.testSuite.trim(), buildRecordId: input.buildRecordId ?? null, config: input.config ?? {}, workflowStatus: 'draft' as const };
}
function mapUpdateTestRunInput(input: UpdateItoTestRunRequest) {
  return {
    ...(input.runKey !== undefined ? { runKey: input.runKey.trim() } : {}),
    ...(input.testSuite !== undefined ? { testSuite: input.testSuite } : {}),
    ...(input.buildRecordId !== undefined ? { buildRecordId: input.buildRecordId ?? null } : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
    ...(input.workflowStatus !== undefined ? { workflowStatus: input.workflowStatus as typeof itoTestRuns.$inferInsert.workflowStatus } : {}),
    ...(input.passedCount !== undefined ? { passedCount: input.passedCount } : {}),
    ...(input.failedCount !== undefined ? { failedCount: input.failedCount } : {}),
    ...(input.skippedCount !== undefined ? { skippedCount: input.skippedCount } : {}),
    ...(input.startedAt !== undefined ? { startedAt: parseOptionalDate(input.startedAt) } : {}),
    ...(input.completedAt !== undefined ? { completedAt: parseOptionalDate(input.completedAt) } : {}),
  };
}

function toChangeRequestSummary(row: typeof itoChangeRequests.$inferSelect): ItoChangeRequestSummary {
  return { id: row.id, changeNumber: row.changeNumber, title: row.title, description: row.description, workflowStatus: row.workflowStatus, riskLevel: row.riskLevel, scheduledAt: row.scheduledAt?.toISOString() ?? null, approvedAt: row.approvedAt?.toISOString() ?? null };
}
function mapCreateChangeRequestInput(input: CreateItoChangeRequestRequest, scope: StaffScope) {
  return { changeNumber: input.changeNumber ?? null, title: input.title.trim(), description: input.description ?? null, riskLevel: (input.riskLevel ?? 'medium') as typeof itoChangeRequests.$inferInsert.riskLevel, scheduledAt: parseOptionalDate(input.scheduledAt), config: input.config ?? {}, requestedByUserId: scope.userId, workflowStatus: 'draft' as const };
}
function mapUpdateChangeRequestInput(input: UpdateItoChangeRequestRequest) {
  return {
    ...(input.changeNumber !== undefined ? { changeNumber: input.changeNumber ?? null } : {}),
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description ?? null } : {}),
    ...(input.riskLevel !== undefined ? { riskLevel: input.riskLevel as typeof itoChangeRequests.$inferInsert.riskLevel } : {}),
    ...(input.scheduledAt !== undefined ? { scheduledAt: parseOptionalDate(input.scheduledAt) } : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
    ...(input.workflowStatus !== undefined ? { workflowStatus: input.workflowStatus as typeof itoChangeRequests.$inferInsert.workflowStatus } : {}),
    ...(input.approvedAt !== undefined ? { approvedAt: parseOptionalDate(input.approvedAt) } : {}),
  };
}

function toDeploymentSummary(row: typeof itoDeployments.$inferSelect): ItoDeploymentSummary {
  return { id: row.id, deploymentKey: row.deploymentKey, environment: row.environment, deploymentStatus: row.deploymentStatus, version: row.version, deployedByUserId: row.deployedByUserId, startedAt: row.startedAt?.toISOString() ?? null, completedAt: row.completedAt?.toISOString() ?? null };
}
function mapCreateDeploymentInput(input: CreateItoDeploymentRequest) {
  return { deploymentKey: input.deploymentKey.trim(), environment: input.environment.trim(), version: input.version ?? null, buildRecordId: input.buildRecordId ?? null, changeRequestId: input.changeRequestId ?? null, config: input.config ?? {} };
}
function mapUpdateDeploymentInput(input: UpdateItoDeploymentRequest) {
  return {
    ...(input.deploymentKey !== undefined ? { deploymentKey: input.deploymentKey.trim() } : {}),
    ...(input.environment !== undefined ? { environment: input.environment } : {}),
    ...(input.version !== undefined ? { version: input.version ?? null } : {}),
    ...(input.buildRecordId !== undefined ? { buildRecordId: input.buildRecordId ?? null } : {}),
    ...(input.changeRequestId !== undefined ? { changeRequestId: input.changeRequestId ?? null } : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
    ...(input.deploymentStatus !== undefined ? { deploymentStatus: input.deploymentStatus as typeof itoDeployments.$inferInsert.deploymentStatus } : {}),
    ...(input.startedAt !== undefined ? { startedAt: parseOptionalDate(input.startedAt) } : {}),
    ...(input.completedAt !== undefined ? { completedAt: parseOptionalDate(input.completedAt) } : {}),
  };
}

function toDependencyRecordSummary(row: typeof itoDependencyRecords.$inferSelect): ItoDependencyRecordSummary {
  return { id: row.id, dependencyName: row.dependencyName, dependencyType: row.dependencyType, version: row.version, healthStatus: row.healthStatus, isCritical: row.isCritical, lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null };
}
function mapCreateDependencyRecordInput(input: CreateItoDependencyRecordRequest) {
  return { dependencyName: input.dependencyName.trim(), dependencyType: input.dependencyType.trim(), version: input.version ?? null, isCritical: input.isCritical ?? false, config: input.config ?? {} };
}
function mapUpdateDependencyRecordInput(input: UpdateItoDependencyRecordRequest) {
  return {
    ...(input.dependencyName !== undefined ? { dependencyName: input.dependencyName } : {}),
    ...(input.dependencyType !== undefined ? { dependencyType: input.dependencyType } : {}),
    ...(input.version !== undefined ? { version: input.version ?? null } : {}),
    ...(input.isCritical !== undefined ? { isCritical: input.isCritical } : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
    ...(input.healthStatus !== undefined ? { healthStatus: input.healthStatus as typeof itoDependencyRecords.$inferInsert.healthStatus } : {}),
  };
}

function toTechnicalDebtRecordSummary(row: typeof itoTechnicalDebtRecords.$inferSelect): ItoTechnicalDebtRecordSummary {
  return { id: row.id, debtKey: row.debtKey, title: row.title, category: row.category, severity: row.severity, workflowStatus: row.workflowStatus, estimatedEffortHours: row.estimatedEffortHours != null ? String(row.estimatedEffortHours) : null, ownerUserId: row.ownerUserId };
}
function mapCreateTechnicalDebtRecordInput(input: CreateItoTechnicalDebtRecordRequest, scope: StaffScope) {
  return { debtKey: input.debtKey.trim(), title: input.title.trim(), category: input.category.trim(), severity: (input.severity ?? 'medium') as typeof itoTechnicalDebtRecords.$inferInsert.severity, estimatedEffortHours: input.estimatedEffortHours != null ? String(input.estimatedEffortHours) : null, description: input.description ?? null, config: input.config ?? {}, ownerUserId: scope.userId, workflowStatus: 'draft' as const };
}
function mapUpdateTechnicalDebtRecordInput(input: UpdateItoTechnicalDebtRecordRequest) {
  return {
    ...(input.debtKey !== undefined ? { debtKey: input.debtKey.trim() } : {}),
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.severity !== undefined ? { severity: input.severity as typeof itoTechnicalDebtRecords.$inferInsert.severity } : {}),
    ...(input.estimatedEffortHours !== undefined ? { estimatedEffortHours: input.estimatedEffortHours != null ? String(input.estimatedEffortHours) : null } : {}),
    ...(input.description !== undefined ? { description: input.description ?? null } : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
    ...(input.workflowStatus !== undefined ? { workflowStatus: input.workflowStatus as typeof itoTechnicalDebtRecords.$inferInsert.workflowStatus } : {}),
  };
}

function toBackupVerificationSummary(row: typeof itoBackupVerifications.$inferSelect): ItoBackupVerificationSummary {
  return { id: row.id, backupRef: row.backupRef, verificationStatus: row.verificationStatus, verificationPassed: row.verificationPassed, verifiedByUserId: row.verifiedByUserId, verifiedAt: row.verifiedAt?.toISOString() ?? null };
}
function mapCreateBackupVerificationInput(input: CreateItoBackupVerificationRequest, scope: StaffScope) {
  return { backupRef: input.backupRef.trim(), notes: input.notes ?? null, config: input.config ?? {}, verifiedByUserId: scope.userId, verificationStatus: 'draft' as const };
}
function mapUpdateBackupVerificationInput(input: UpdateItoBackupVerificationRequest) {
  return {
    ...(input.backupRef !== undefined ? { backupRef: input.backupRef } : {}),
    ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
    ...(input.verificationStatus !== undefined ? { verificationStatus: input.verificationStatus as typeof itoBackupVerifications.$inferInsert.verificationStatus } : {}),
    ...(input.verificationPassed !== undefined ? { verificationPassed: input.verificationPassed } : {}),
    ...(input.verifiedAt !== undefined ? { verifiedAt: parseOptionalDate(input.verifiedAt) } : {}),
  };
}

function toDatabaseHealthSnapshotSummary(row: typeof itoDatabaseHealthSnapshots.$inferSelect): ItoDatabaseHealthSnapshotSummary {
  return { id: row.id, healthStatus: row.healthStatus, connectionPoolUsagePercent: row.connectionPoolUsagePercent != null ? String(row.connectionPoolUsagePercent) : null, queryLatencyMs: row.queryLatencyMs, slowQueryCount: row.slowQueryCount, replicationLagMs: row.replicationLagMs, capturedAt: row.capturedAt.toISOString() };
}
function toApiReliabilitySnapshotSummary(row: typeof itoApiReliabilitySnapshots.$inferSelect): ItoApiReliabilitySnapshotSummary {
  return { id: row.id, endpointGroup: row.endpointGroup, healthStatus: row.healthStatus, availabilityPercent: row.availabilityPercent != null ? String(row.availabilityPercent) : null, errorRatePercent: row.errorRatePercent != null ? String(row.errorRatePercent) : null, p95LatencyMs: row.p95LatencyMs, capturedAt: row.capturedAt.toISOString() };
}
function toAiProviderHealthSummary(row: typeof itoAiProviderHealth.$inferSelect): ItoAiProviderHealthSummary {
  return { id: row.id, providerKey: row.providerKey, healthStatus: row.healthStatus, latencyMs: row.latencyMs, errorRatePercent: row.errorRatePercent != null ? String(row.errorRatePercent) : null, rateLimitEvents: row.rateLimitEvents, failoverCount: row.failoverCount, capturedAt: row.capturedAt.toISOString() };
}
function toIntegrationHealthSummary(row: typeof itoIntegrationHealth.$inferSelect): ItoIntegrationHealthSummary {
  return { id: row.id, integrationKey: row.integrationKey, healthStatus: row.healthStatus, lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null, failureCount: row.failureCount, latencyMs: row.latencyMs, capturedAt: row.capturedAt.toISOString() };
}
function toPerformanceSnapshotSummary(row: typeof itoPerformanceSnapshots.$inferSelect): ItoPerformanceSnapshotSummary {
  return { id: row.id, healthStatus: row.healthStatus, cpuUsagePercent: row.cpuUsagePercent != null ? String(row.cpuUsagePercent) : null, memoryUsageMb: row.memoryUsageMb, apiP95LatencyMs: row.apiP95LatencyMs, queueDepth: row.queueDepth, backgroundJobFailureCount: row.backgroundJobFailureCount, capturedAt: row.capturedAt.toISOString() };
}
