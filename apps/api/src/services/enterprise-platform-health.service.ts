import { and, desc, eq } from 'drizzle-orm';
import type {
  CreatePhActionDraftRequest,
  CreatePhIncidentRequest,
  EnterprisePlatformHealthAuraContext,
  EnterprisePlatformHealthDashboard,
  PhActionDraftSummary,
  PhAnalyticsSummary,
  PhAuditLogSummary,
  PhDiagnosticRunDetailSummary,
  PhDiagnosticRunSummary,
  PhHealthSnapshotSummary,
  PhHealthStatus,
  PhPerformanceInsightSummary,
  PhPlatformAlertSummary,
  PhPlatformConfigSummary,
  PhPlatformHealthSummary,
  PhServiceHealthSummary,
  UpdatePhIncidentRequest,
  UpdatePhPlatformConfigRequest,
  ItoIncidentSummary,
  PhCapacitySnapshotSummary,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  phActionDrafts,
  phAnalyticsSnapshots,
  phAuditLogs,
  phHealthSnapshots,
  phPlatformAlerts,
  phPlatformConfig,
} from '@titan/db';
import type { EnterpriseItOperationsService } from './enterprise-it-operations.service.js';
import type { EnterpriseProductionReadinessService } from './enterprise-production-readiness.service.js';
import type { EnterpriseMissionControlService } from './enterprise-mission-control.service.js';
import type { IntegrationPlatformService } from './integration-platform.service.js';
import { EnterprisePlatformHealthDiagnosticsService } from './enterprise-platform-health-diagnostics.service.js';
import { EnterprisePlatformHealthPerformanceService } from './enterprise-platform-health-performance.service.js';
import { EnterprisePlatformHealthCapacityService } from './enterprise-platform-health-capacity.service.js';
import { EnterprisePlatformHealthIncidentService } from './enterprise-platform-health-incident.service.js';

export class EnterprisePlatformHealthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterprisePlatformHealthError';
  }
}

type StaffScope = { companyId: string; userId: string };

type PlatformHealthDeps = {
  db: DatabaseClient;
  databaseUrl?: string;
  jwtSecret?: string;
  enterpriseItOperationsService: EnterpriseItOperationsService;
  enterpriseProductionReadinessService: EnterpriseProductionReadinessService;
  enterpriseMissionControlService: EnterpriseMissionControlService;
  integrationPlatformService: IntegrationPlatformService;
  aiProviderResilienceService: import('./ai-provider-resilience.service.js').AiProviderResilienceService;
  enterpriseSaasPlatformService: import('./enterprise-saas-platform.service.js').EnterpriseSaasPlatformService;
};

export class EnterprisePlatformHealthService {
  private readonly diagnosticsService: EnterprisePlatformHealthDiagnosticsService;
  private readonly performanceService: EnterprisePlatformHealthPerformanceService;
  private readonly capacityService: EnterprisePlatformHealthCapacityService;
  private readonly incidentService: EnterprisePlatformHealthIncidentService;

  constructor(private readonly deps: PlatformHealthDeps) {
    this.diagnosticsService = new EnterprisePlatformHealthDiagnosticsService({
      db: deps.db,
      databaseUrl: deps.databaseUrl,
      jwtSecret: deps.jwtSecret,
      aiProviderResilienceService: deps.aiProviderResilienceService,
      integrationPlatformService: deps.integrationPlatformService,
    });
    this.performanceService = new EnterprisePlatformHealthPerformanceService(
      deps.db,
      deps.enterpriseProductionReadinessService,
      deps.enterpriseItOperationsService,
    );
    this.capacityService = new EnterprisePlatformHealthCapacityService(
      deps.db,
      deps.enterpriseProductionReadinessService,
      deps.enterpriseSaasPlatformService,
    );
    this.incidentService = new EnterprisePlatformHealthIncidentService(
      deps.enterpriseItOperationsService,
    );
  }

  async getDashboard(companyId: string): Promise<EnterprisePlatformHealthDashboard> {
    await this.ensurePlatformConfig(companyId);

    const [
      platformConfig,
      productionDashboard,
      integrationDashboard,
      diagnosticRuns,
      performanceInsights,
      latestCapacitySnapshot,
      incidents,
      latestHealthSnapshot,
      analytics,
      platformAlerts,
    ] = await Promise.all([
      this.getPlatformConfig(companyId),
      this.deps.enterpriseProductionReadinessService.getDashboard(companyId),
      this.deps.integrationPlatformService.getExecutiveDashboard(companyId),
      this.diagnosticsService.listDiagnosticRuns(companyId),
      this.performanceService.listInsights(companyId),
      this.capacityService.getLatestSnapshot(companyId),
      this.incidentService.listIncidents(companyId),
      this.getLatestHealthSnapshot(companyId),
      this.getLatestAnalytics(companyId),
      this.listPlatformAlerts(companyId, { status: 'open' }),
    ]);

    void this.deps.enterpriseMissionControlService
      .getMissionControlDashboard(companyId)
      .catch(() => null);

    const latestDiagnosticResults = diagnosticRuns[0]
      ? ((await this.diagnosticsService.getDiagnosticRunDetail(companyId, diagnosticRuns[0].id))
          ?.results ?? [])
      : [];

    const serviceHealth: PhServiceHealthSummary[] = productionDashboard.systemHealth.map((m) => ({
      moduleKey: m.moduleKey,
      moduleName: m.moduleKey.replace(/_/g, ' '),
      status: mapOpsStatus(m.status),
      latencyMs: m.latencyMs,
      errorRatePercent: m.errorRatePercent,
      queueDepth: null,
      lastCheckedAt: m.capturedAt,
    }));

    const openIncidents = incidents.filter((i) => !['resolved', 'closed'].includes(i.status));
    const criticalIncidents = openIncidents.filter((i) => i.severity === 'critical');
    const failedDiagnostics = diagnosticRuns[0]?.failedCount ?? 0;
    const degradedServiceCount = serviceHealth.filter((s) => s.status !== 'healthy').length;

    const platformHealth = this.buildPlatformHealthSummary({
      overallHealthScore:
        latestHealthSnapshot?.overallHealthScore ??
        resolveHealthScore(productionDashboard.overallHealthStatus),
      overallHealthStatus: mapOpsStatus(productionDashboard.overallHealthStatus),
      criticalIncidentCount: criticalIncidents.length,
      failedDiagnosticCount: failedDiagnostics,
      openAlertCount: platformAlerts.length,
      capacityWarningCount: this.countCapacityWarnings(latestCapacitySnapshot),
      degradedServiceCount,
    });

    const overallPlatformHealthStatus =
      platformHealth.overallHealthStatus === 'unhealthy' || criticalIncidents.length > 0
        ? 'critical'
        : platformHealth.overallHealthStatus === 'degraded' || platformAlerts.length > 0
          ? 'degraded'
          : 'healthy';

    return {
      summary: `Health score ${platformHealth.overallHealthScore ?? '—'}, ${serviceHealth.length} service(s) monitored, ${openIncidents.length} open incident(s), ${platformAlerts.length} platform alert(s).`,
      platformConfig,
      platformHealth,
      latestHealthSnapshot,
      serviceHealth,
      diagnosticRuns,
      latestDiagnosticResults,
      performanceInsights,
      latestCapacitySnapshot,
      incidents: openIncidents.slice(0, 20),
      integrations: integrationDashboard.connectors.map((c) => ({
        key: c.connectorKey,
        status: c.status,
        provider: c.provider,
      })),
      backgroundJobs: {
        queueDepth: productionDashboard.performance?.queueDepth ?? 0,
        failedCount: productionDashboard.performance?.backgroundJobFailureCount ?? 0,
        pendingCount: productionDashboard.performance?.queueDepth ?? 0,
      },
      analytics,
      recentAlerts: platformAlerts.slice(0, 10),
      openAlertCount: platformAlerts.length,
      overallPlatformHealthStatus,
    };
  }

  async buildAuraContext(companyId: string): Promise<EnterprisePlatformHealthAuraContext> {
    const dashboard = await this.getDashboard(companyId);
    return {
      summary: dashboard.summary,
      overallHealthScore: dashboard.platformHealth.overallHealthScore,
      criticalIncidentCount: dashboard.platformHealth.criticalIncidentCount,
      failedDiagnosticCount: dashboard.platformHealth.failedDiagnosticCount,
      openAlertCount: dashboard.openAlertCount,
      overallPlatformHealthStatus: dashboard.overallPlatformHealthStatus,
    };
  }

  async getPlatformConfig(companyId: string): Promise<PhPlatformConfigSummary> {
    return toPlatformConfigSummary(await this.ensurePlatformConfig(companyId));
  }

  async updatePlatformConfig(
    scope: StaffScope,
    input: UpdatePhPlatformConfigRequest,
  ): Promise<PhPlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(phPlatformConfig)
      .set({
        monitoringPolicy: input.monitoringPolicy ?? existing.monitoringPolicy,
        diagnosticsPolicy: input.diagnosticsPolicy ?? existing.diagnosticsPolicy,
        capacityPolicy: input.capacityPolicy ?? existing.capacityPolicy,
        incidentPolicy: input.incidentPolicy ?? existing.incidentPolicy,
        alertLevelConfig: input.alertLevelConfig ?? existing.alertLevelConfig,
        auditRetentionDays: input.auditRetentionDays ?? existing.auditRetentionDays,
        updatedAt: new Date(),
      })
      .where(eq(phPlatformConfig.companyId, scope.companyId))
      .returning();
    await this.logAudit(scope, 'update_platform_config', 'ph_platform_config', updated?.id);
    return toPlatformConfigSummary(updated ?? existing);
  }

  async captureHealthSnapshot(scope: StaffScope): Promise<PhHealthSnapshotSummary> {
    const [productionDashboard, monitoring] = await Promise.all([
      this.deps.enterpriseProductionReadinessService.getDashboard(scope.companyId),
      this.deps.enterpriseItOperationsService.getOperationsMonitoring(scope.companyId),
    ]);

    await this.deps.enterpriseProductionReadinessService.captureHealthSnapshots(scope.companyId);
    await this.deps.enterpriseProductionReadinessService.capturePerformanceSnapshot(
      scope.companyId,
    );
    await this.deps.enterpriseItOperationsService.captureHealthSignals(scope);

    const performance = productionDashboard.performance;
    const overallStatus = mapOpsStatus(productionDashboard.overallHealthStatus);
    const healthScore = resolveHealthScore(productionDashboard.overallHealthStatus);

    const [created] = await this.deps.db
      .insert(phHealthSnapshots)
      .values({
        companyId: scope.companyId,
        overallHealthScore: healthScore,
        overallHealthStatus: overallStatus,
        serviceMetrics: {
          modules: productionDashboard.systemHealth,
          monitoring,
        },
        uptimePercent: productionDashboard.systemHealth[0]?.availabilityPercent ?? null,
        availabilityPercent: productionDashboard.systemHealth[0]?.availabilityPercent ?? null,
        errorRatePercent: performance?.slowEndpointCount ? performance.slowEndpointCount : null,
        apiP95LatencyMs: performance?.apiP95LatencyMs ?? null,
        queueDepth: performance?.queueDepth ?? 0,
        failedJobCount: performance?.backgroundJobFailureCount ?? 0,
        activeSessionCount: 0,
        metrics: { capturedFrom: ['production_readiness', 'it_operations'] },
      })
      .returning();

    await this.logAudit(scope, 'capture_health_snapshot', 'ph_health_snapshots', created?.id);
    return toHealthSnapshotSummary(created!);
  }

  runDiagnostics(scope: StaffScope): Promise<PhDiagnosticRunDetailSummary> {
    return this.diagnosticsService.runDiagnostics(scope);
  }

  listDiagnosticRuns(companyId: string): Promise<PhDiagnosticRunSummary[]> {
    return this.diagnosticsService.listDiagnosticRuns(companyId);
  }

  getDiagnosticRunDetail(companyId: string, runId: string) {
    return this.diagnosticsService.getDiagnosticRunDetail(companyId, runId);
  }

  generatePerformanceInsights(companyId: string): Promise<PhPerformanceInsightSummary[]> {
    return this.performanceService.generateInsights(companyId);
  }

  listPerformanceInsights(companyId: string): Promise<PhPerformanceInsightSummary[]> {
    return this.performanceService.listInsights(companyId);
  }

  captureCapacitySnapshot(companyId: string): Promise<PhCapacitySnapshotSummary> {
    return this.capacityService.captureCapacitySnapshot(companyId);
  }

  listIncidents(companyId: string): Promise<ItoIncidentSummary[]> {
    return this.incidentService.listIncidents(companyId);
  }

  createIncident(scope: StaffScope, input: CreatePhIncidentRequest): Promise<ItoIncidentSummary> {
    return this.incidentService.createIncident(scope, input);
  }

  updateIncident(
    scope: StaffScope,
    incidentId: string,
    input: UpdatePhIncidentRequest,
  ): Promise<ItoIncidentSummary> {
    return this.incidentService.updateIncident(scope, incidentId, input);
  }

  async syncPlatformAlerts(scope: StaffScope): Promise<PhPlatformAlertSummary[]> {
    const dashboard = await this.getDashboard(scope.companyId);
    const synced: PhPlatformAlertSummary[] = [];

    if (dashboard.platformHealth.criticalIncidentCount > 0) {
      synced.push(
        await this.upsertPlatformAlert(scope.companyId, {
          alertType: 'critical_incidents',
          severity: 'critical',
          title: 'Critical incidents open',
          description: `${dashboard.platformHealth.criticalIncidentCount} critical incident(s) require attention.`,
        }),
      );
    }

    if (dashboard.platformHealth.failedDiagnosticCount > 0) {
      synced.push(
        await this.upsertPlatformAlert(scope.companyId, {
          alertType: 'failed_diagnostics',
          severity: 'warning',
          title: 'Failed diagnostic tests',
          description: `${dashboard.platformHealth.failedDiagnosticCount} diagnostic test(s) failed in latest run.`,
        }),
      );
    }

    if (dashboard.platformHealth.capacityWarningCount > 0) {
      synced.push(
        await this.upsertPlatformAlert(scope.companyId, {
          alertType: 'capacity_warning',
          severity: 'warning',
          title: 'Capacity warnings',
          description: 'Capacity thresholds approaching limits based on recent usage trends.',
        }),
      );
    }

    if (dashboard.platformHealth.degradedServiceCount > 0) {
      synced.push(
        await this.upsertPlatformAlert(scope.companyId, {
          alertType: 'performance_degradation',
          severity: dashboard.platformHealth.degradedServiceCount > 5 ? 'critical' : 'warning',
          title: 'Service degradation detected',
          description: `${dashboard.platformHealth.degradedServiceCount} service(s) degraded or unhealthy.`,
        }),
      );
    }

    const errorIntegrations = dashboard.integrations.filter((i) => i.status === 'error');
    if (errorIntegrations.length > 0) {
      synced.push(
        await this.upsertPlatformAlert(scope.companyId, {
          alertType: 'provider_outage',
          severity: 'critical',
          title: 'Provider integration outages',
          description: `${errorIntegrations.length} integration(s) in error state.`,
        }),
      );
    }

    await this.logAudit(scope, 'sync_platform_alerts', 'ph_platform_alerts');
    return synced;
  }

  async captureAnalytics(scope: StaffScope): Promise<PhAnalyticsSummary> {
    const dashboard = await this.getDashboard(scope.companyId);
    const [created] = await this.deps.db
      .insert(phAnalyticsSnapshots)
      .values({
        companyId: scope.companyId,
        metrics: {
          platformHealth: dashboard.platformHealth,
          serviceCount: dashboard.serviceHealth.length,
          incidentCount: dashboard.incidents.length,
          overallPlatformHealthStatus: dashboard.overallPlatformHealthStatus,
        },
      })
      .returning();
    if (!created)
      throw new EnterprisePlatformHealthError('CREATE_FAILED', 'Unable to capture analytics');
    await this.logAudit(scope, 'capture_analytics', 'ph_analytics_snapshots', created.id);
    return toAnalyticsSummary(created);
  }

  async createActionDraft(
    scope: StaffScope,
    input: CreatePhActionDraftRequest,
  ): Promise<PhActionDraftSummary> {
    const [created] = await this.deps.db
      .insert(phActionDrafts)
      .values({
        companyId: scope.companyId,
        draftType: input.draftType.trim(),
        title: input.title.trim(),
        content: input.content.trim(),
        sourceRecords: input.sourceRecords ?? {},
        aiGenerated: input.aiGenerated ?? false,
      })
      .returning();
    if (!created)
      throw new EnterprisePlatformHealthError('CREATE_FAILED', 'Unable to create action draft');
    await this.logAudit(scope, 'create_action_draft', 'ph_action_drafts', created.id);
    return toActionDraftSummary(created);
  }

  async listActionDrafts(companyId: string): Promise<PhActionDraftSummary[]> {
    const rows = await this.deps.db.query.phActionDrafts.findMany({
      where: eq(phActionDrafts.companyId, companyId),
      orderBy: [desc(phActionDrafts.createdAt)],
      limit: 100,
    });
    return rows.map(toActionDraftSummary);
  }

  async listAuditLogs(companyId: string): Promise<PhAuditLogSummary[]> {
    const rows = await this.deps.db.query.phAuditLogs.findMany({
      where: eq(phAuditLogs.companyId, companyId),
      orderBy: [desc(phAuditLogs.createdAt)],
      limit: 200,
    });
    return rows.map(toAuditLogSummary);
  }

  async listPlatformAlerts(
    companyId: string,
    options?: { status?: string },
  ): Promise<PhPlatformAlertSummary[]> {
    const rows = await this.deps.db.query.phPlatformAlerts.findMany({
      where: options?.status
        ? and(
            eq(phPlatformAlerts.companyId, companyId),
            eq(
              phPlatformAlerts.status,
              options.status as (typeof phPlatformAlerts.status.enumValues)[number],
            ),
          )
        : eq(phPlatformAlerts.companyId, companyId),
      orderBy: [desc(phPlatformAlerts.createdAt)],
      limit: 100,
    });
    return rows.map(toPlatformAlertSummary);
  }

  private async getLatestHealthSnapshot(
    companyId: string,
  ): Promise<PhHealthSnapshotSummary | null> {
    const row = await this.deps.db.query.phHealthSnapshots.findFirst({
      where: eq(phHealthSnapshots.companyId, companyId),
      orderBy: [desc(phHealthSnapshots.capturedAt)],
    });
    return row ? toHealthSnapshotSummary(row) : null;
  }

  private async getLatestAnalytics(companyId: string): Promise<PhAnalyticsSummary | null> {
    const row = await this.deps.db.query.phAnalyticsSnapshots.findFirst({
      where: eq(phAnalyticsSnapshots.companyId, companyId),
      orderBy: [desc(phAnalyticsSnapshots.capturedAt)],
    });
    return row ? toAnalyticsSummary(row) : null;
  }

  private buildPlatformHealthSummary(input: PhPlatformHealthSummary): PhPlatformHealthSummary {
    return input;
  }

  private countCapacityWarnings(snapshot: PhCapacitySnapshotSummary | null): number {
    if (!snapshot) return 0;
    let warnings = 0;
    if (snapshot.backgroundJobLoad > 100) warnings += 1;
    if (snapshot.aiUsageCount > 1000) warnings += 1;
    if (snapshot.forecast.trend === 'growing') warnings += 1;
    return warnings;
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.phPlatformConfig.findFirst({
      where: eq(phPlatformConfig.companyId, companyId),
    });
    if (existing) return existing;

    const [created] = await this.deps.db
      .insert(phPlatformConfig)
      .values({
        companyId,
        monitoringPolicy: { wrapExisting: ['ops', 'ito', 'mission_control'] },
        diagnosticsPolicy: { readOnly: true },
        capacityPolicy: { forecastDays: 7 },
        incidentPolicy: { autoClose: false },
      })
      .returning();
    return created!;
  }

  private async upsertPlatformAlert(
    companyId: string,
    input: {
      alertType: string;
      severity: 'info' | 'warning' | 'critical';
      title: string;
      description?: string;
    },
  ): Promise<PhPlatformAlertSummary> {
    const existing = await this.deps.db.query.phPlatformAlerts.findFirst({
      where: and(
        eq(phPlatformAlerts.companyId, companyId),
        eq(phPlatformAlerts.alertType, input.alertType),
        eq(phPlatformAlerts.status, 'open'),
      ),
    });

    if (existing) {
      const [updated] = await this.deps.db
        .update(phPlatformAlerts)
        .set({
          severity: input.severity,
          title: input.title,
          description: input.description ?? null,
          updatedAt: new Date(),
        })
        .where(eq(phPlatformAlerts.id, existing.id))
        .returning();
      return toPlatformAlertSummary(updated ?? existing);
    }

    const [created] = await this.deps.db
      .insert(phPlatformAlerts)
      .values({
        companyId,
        alertType: input.alertType,
        severity: input.severity,
        title: input.title,
        description: input.description ?? null,
      })
      .returning();
    return toPlatformAlertSummary(created!);
  }

  private async logAudit(
    scope: StaffScope,
    actionType: string,
    entityType?: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.deps.db.insert(phAuditLogs).values({
      companyId: scope.companyId,
      userId: scope.userId,
      actionType,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      metadata: metadata ?? {},
    });
  }
}

function mapOpsStatus(status: string): PhHealthStatus {
  if (status === 'healthy') return 'healthy';
  if (status === 'degraded' || status === 'warning') return 'degraded';
  if (status === 'unhealthy' || status === 'critical') return 'unhealthy';
  return 'unknown';
}

function resolveHealthScore(status: string): number | null {
  if (status === 'healthy') return 95;
  if (status === 'degraded') return 70;
  if (status === 'unhealthy') return 40;
  return null;
}

function toPlatformConfigSummary(
  row: typeof phPlatformConfig.$inferSelect,
): PhPlatformConfigSummary {
  return {
    monitoringPolicy: row.monitoringPolicy ?? {},
    diagnosticsPolicy: row.diagnosticsPolicy ?? {},
    capacityPolicy: row.capacityPolicy ?? {},
    incidentPolicy: row.incidentPolicy ?? {},
    alertLevelConfig: row.alertLevelConfig ?? {},
    auditRetentionDays: row.auditRetentionDays,
  };
}

function toHealthSnapshotSummary(
  row: typeof phHealthSnapshots.$inferSelect,
): PhHealthSnapshotSummary {
  return {
    id: row.id,
    overallHealthScore: row.overallHealthScore,
    overallHealthStatus: row.overallHealthStatus,
    uptimePercent: row.uptimePercent,
    availabilityPercent: row.availabilityPercent,
    errorRatePercent: row.errorRatePercent,
    apiP95LatencyMs: row.apiP95LatencyMs,
    queueDepth: row.queueDepth,
    failedJobCount: row.failedJobCount,
    activeSessionCount: row.activeSessionCount,
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toPlatformAlertSummary(row: typeof phPlatformAlerts.$inferSelect): PhPlatformAlertSummary {
  return {
    id: row.id,
    alertType: row.alertType,
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description,
    sourceIncidentId: row.sourceIncidentId,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAnalyticsSummary(row: typeof phAnalyticsSnapshots.$inferSelect): PhAnalyticsSummary {
  return {
    id: row.id,
    metrics: row.metrics ?? {},
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toActionDraftSummary(row: typeof phActionDrafts.$inferSelect): PhActionDraftSummary {
  return {
    id: row.id,
    draftType: row.draftType,
    title: row.title,
    content: row.content,
    aiGenerated: row.aiGenerated,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAuditLogSummary(row: typeof phAuditLogs.$inferSelect): PhAuditLogSummary {
  return {
    id: row.id,
    actionType: row.actionType,
    entityType: row.entityType,
    entityId: row.entityId,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
  };
}
