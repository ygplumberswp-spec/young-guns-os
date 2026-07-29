import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type {
  CreateOpsBackupPolicyRequest,
  CreateOpsMaintenanceActionRequest,
  CreateOpsMaintenanceWindowRequest,
  EnterpriseProductionReadinessAuraContext,
  EnterpriseProductionReadinessDashboard,
  OpsAiProviderMonitoringSummary,
  OpsHealthStatus,
  OpsLogSearchRequest,
  OpsReadinessStatus,
  OpsServiceHealthSummary,
  OpsServiceModule,
  UpdateOpsPlatformConfigRequest,
  UpdateOpsScalingConfigRequest,
} from '@titan/shared';
import { OPS_SERVICE_MODULES } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { checkDbConnection } from '@titan/db';
import {
  agentRuns,
  aiFailoverEvents,
  aiProviders,
  aiRequestQueue,
  aiUsageRecords,
  automationQueueJobs,
  integrationConnections,
  opsBackupPolicies,
  opsBackupRuns,
  opsMaintenanceActions,
  opsMaintenanceWindows,
  opsOperationalLogEntries,
  opsPerformanceSnapshots,
  opsPlatformConfig,
  opsReadinessCheckResults,
  opsReadinessCheckRuns,
  opsRecoveryTestRecords,
  opsScalingConfig,
  opsServiceHealthSnapshots,
  workflowRuns,
} from '@titan/db';
import type { AiOrchestrationService } from './ai-orchestration.service.js';
import type { AiProviderResilienceService } from './ai-provider-resilience.service.js';
import type { EnterpriseMissionControlService } from './enterprise-mission-control.service.js';
import type { EnterpriseSaasPlatformService } from './enterprise-saas-platform.service.js';

export class EnterpriseProductionReadinessError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseProductionReadinessError';
  }
}

type StaffScope = { companyId: string; userId: string };

type ProductionReadinessDeps = {
  db: DatabaseClient;
  databaseUrl?: string;
  jwtSecret?: string;
  encryptionKey?: string;
  enterpriseSaasPlatformService: EnterpriseSaasPlatformService;
  enterpriseMissionControlService: EnterpriseMissionControlService;
  aiOrchestrationService: AiOrchestrationService;
  aiProviderResilienceService: AiProviderResilienceService;
};

export class EnterpriseProductionReadinessService {
  constructor(private readonly deps: ProductionReadinessDeps) {}

  async getDashboard(companyId: string): Promise<EnterpriseProductionReadinessDashboard> {
    const isPlatformOwner = await this.deps.enterpriseSaasPlatformService.isPlatformOwnerTenant(companyId);
    const [
      systemHealth,
      performance,
      aiProviders,
      backupPolicies,
      recentBackupRuns,
      recovery,
      latestReadinessRun,
      recentLogs,
      maintenanceWindows,
      maintenanceActions,
      scaling,
      platformConfig,
    ] = await Promise.all([
      this.getLatestHealthSnapshots(companyId),
      this.getLatestPerformanceSnapshot(companyId),
      this.getAiProviderMonitoring(companyId),
      this.listBackupPolicies(companyId),
      this.listRecentBackupRuns(companyId),
      this.getRecoveryReadiness(companyId),
      this.getLatestReadinessRun(companyId),
      this.listRecentLogs(companyId, { limit: 30 }),
      this.listMaintenanceWindows(companyId),
      this.listMaintenanceActions(companyId),
      this.getScalingConfig(companyId),
      this.getPlatformConfig(companyId),
    ]);

    const unhealthyCount = systemHealth.filter((m) => m.status === 'unhealthy' || m.status === 'degraded').length;
    const overallHealthStatus = resolveOverallHealth(systemHealth);

    return {
      summary: `${systemHealth.length} module(s) monitored, ${unhealthyCount} degraded/unhealthy, queue depth ${performance?.queueDepth ?? 0}, readiness ${latestReadinessRun?.overallStatus ?? 'unknown'}.`,
      isPlatformOwner,
      overallHealthStatus,
      systemHealth,
      performance,
      aiProviders,
      backupPolicies,
      recentBackupRuns,
      recovery,
      latestReadinessRun,
      recentLogs,
      maintenanceWindows,
      maintenanceActions,
      scaling,
      platformConfig,
    };
  }

  async captureHealthSnapshots(companyId: string): Promise<OpsServiceHealthSummary[]> {
    const snapshots = await this.buildLiveHealthSignals(companyId);
    for (const snapshot of snapshots) {
      await this.deps.db.insert(opsServiceHealthSnapshots).values({
        companyId,
        moduleKey: snapshot.moduleKey,
        status: snapshot.status,
        availabilityPercent: snapshot.availabilityPercent?.toString() ?? null,
        latencyMs: snapshot.latencyMs,
        errorRatePercent: snapshot.errorRatePercent?.toString() ?? null,
        throughputPerMinute: snapshot.throughputPerMinute,
        dependencyHealth: snapshot.dependencyHealth,
        lastSuccessfulOperationAt: snapshot.lastSuccessfulOperationAt
          ? new Date(snapshot.lastSuccessfulOperationAt)
          : null,
        metadata: {},
      });
    }
    return snapshots;
  }

  async capturePerformanceSnapshot(companyId: string) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [failedWorkflows] = await this.deps.db
      .select({ value: count() })
      .from(workflowRuns)
      .where(and(eq(workflowRuns.companyId, companyId), eq(workflowRuns.status, 'failed'), gte(workflowRuns.startedAt, monthStart)));

    const [pendingQueue] = await this.deps.db
      .select({ value: count() })
      .from(aiRequestQueue)
      .where(and(eq(aiRequestQueue.companyId, companyId), eq(aiRequestQueue.status, 'pending')));

    const [pendingAutomation] = await this.deps.db
      .select({ value: count() })
      .from(automationQueueJobs)
      .where(and(eq(automationQueueJobs.companyId, companyId), eq(automationQueueJobs.status, 'pending')));

    const [latencyRow] = await this.deps.db
      .select({
        avgLatency: sql<number>`coalesce(avg((metadata->>'latencyMs')::int), 0)`,
      })
      .from(aiUsageRecords)
      .where(and(eq(aiUsageRecords.companyId, companyId), gte(aiUsageRecords.recordedAt, monthStart)));

    const queueDepth = Number(pendingQueue?.value ?? 0) + Number(pendingAutomation?.value ?? 0);
    const mem = process.memoryUsage();

    const [row] = await this.deps.db
      .insert(opsPerformanceSnapshots)
      .values({
        companyId,
        apiP95LatencyMs: null,
        slowEndpointCount: 0,
        queueDepth,
        backgroundJobFailureCount: Number(failedWorkflows?.value ?? 0),
        memoryUsageMb: Math.round(mem.heapUsed / 1024 / 1024),
        aiProviderLatencyMs: Number(latencyRow?.avgLatency ?? 0) || null,
        metadata: { capturedBy: 'performance_snapshot' },
      })
      .returning();

    return {
      id: row!.id,
      apiP95LatencyMs: row!.apiP95LatencyMs,
      slowEndpointCount: row!.slowEndpointCount,
      dbPoolUsagePercent: row!.dbPoolUsagePercent != null ? Number(row!.dbPoolUsagePercent) : null,
      cacheHitRatePercent: row!.cacheHitRatePercent != null ? Number(row!.cacheHitRatePercent) : null,
      queueDepth: row!.queueDepth,
      workerThroughputPerMinute: row!.workerThroughputPerMinute,
      backgroundJobFailureCount: row!.backgroundJobFailureCount,
      memoryUsageMb: row!.memoryUsageMb,
      cpuUsagePercent: row!.cpuUsagePercent != null ? Number(row!.cpuUsagePercent) : null,
      storageUsageMb: row!.storageUsageMb,
      webhookLatencyMs: row!.webhookLatencyMs,
      integrationLatencyMs: row!.integrationLatencyMs,
      aiProviderLatencyMs: row!.aiProviderLatencyMs,
      knowledgeGraphSearchMs: row!.knowledgeGraphSearchMs,
      digitalTwinSimulationMs: row!.digitalTwinSimulationMs,
      capturedAt: row!.capturedAt.toISOString(),
    };
  }

  async runReadinessChecks(companyId: string) {
    const checks = await this.buildReadinessChecks(companyId);
    const readyCount = checks.filter((c) => c.status === 'ready').length;
    const warningCount = checks.filter((c) => c.status === 'warning').length;
    const criticalCount = checks.filter((c) => c.status === 'critical').length;
    const unknownCount = checks.filter((c) => c.status === 'unknown').length;
    const overallStatus = criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : readyCount > 0 ? 'ready' : 'unknown';

    const [run] = await this.deps.db
      .insert(opsReadinessCheckRuns)
      .values({ companyId, overallStatus, readyCount, warningCount, criticalCount, unknownCount })
      .returning();

    for (const check of checks) {
      await this.deps.db.insert(opsReadinessCheckResults).values({
        runId: run!.id,
        companyId,
        checkKey: check.checkKey,
        title: check.title,
        description: check.description,
        status: check.status,
        category: check.category,
        metadata: check.metadata ?? {},
      });
    }

    return this.getReadinessRun(run!.id, companyId);
  }

  async syncOperationalLogs(companyId: string) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);

    const [failovers, failedRuns] = await Promise.all([
      this.deps.db.query.aiFailoverEvents.findMany({
        where: eq(aiFailoverEvents.companyId, companyId),
        orderBy: [desc(aiFailoverEvents.loggedAt)],
        limit: 20,
      }),
      this.deps.db.query.workflowRuns.findMany({
        where: and(eq(workflowRuns.companyId, companyId), eq(workflowRuns.status, 'failed')),
        orderBy: [desc(workflowRuns.startedAt)],
        limit: 20,
      }),
    ]);

    for (const event of failovers) {
      await this.indexLogEntry(companyId, {
        moduleKey: 'ai_provider_gateway',
        severity: 'warn',
        message: `AI provider failover: ${event.reason}`,
        sourceTable: 'ai_failover_events',
        sourceEntityId: event.id,
        metadata: { reason: event.reason },
        loggedAt: event.loggedAt,
      });
    }

    for (const run of failedRuns) {
      await this.indexLogEntry(companyId, {
        moduleKey: 'automation_studio',
        severity: 'error',
        message: run.errorMessage ?? `Workflow run ${run.id} failed`,
        sourceTable: 'workflow_runs',
        sourceEntityId: run.id,
        metadata: { workflowId: run.workflowId },
        loggedAt: run.startedAt ?? new Date(),
      });
    }

    return this.listRecentLogs(companyId, { limit: 50 });
  }

  async syncMissionControlAlerts(companyId: string) {
    const dashboard = await this.getDashboard(companyId);
    const candidates: Array<{
      title: string;
      description: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      sourceEntityId: string;
      category: 'operational';
    }> = [];

    for (const module of dashboard.systemHealth.filter((m) => m.status === 'unhealthy')) {
      candidates.push({
        title: `Service unhealthy: ${module.moduleKey}`,
        description: `${module.moduleKey} reported unhealthy status.`,
        severity: 'high',
        sourceEntityId: `ops-health-${module.moduleKey}-${companyId}`,
        category: 'operational',
      });
    }

    if ((dashboard.performance?.queueDepth ?? 0) > 50) {
      candidates.push({
        title: 'Queue congestion detected',
        description: `${dashboard.performance?.queueDepth ?? 0} pending queue item(s).`,
        severity: 'medium',
        sourceEntityId: `ops-queue-${companyId}`,
        category: 'operational',
      });
    }

    for (const check of dashboard.latestReadinessRun?.checks.filter((c) => c.status === 'critical') ?? []) {
      candidates.push({
        title: check.title,
        description: check.description,
        severity: 'critical',
        sourceEntityId: `ops-readiness-${check.checkKey}-${companyId}`,
        category: 'operational',
      });
    }

    for (const backup of dashboard.recentBackupRuns.filter((b) => b.status === 'failed')) {
      candidates.push({
        title: 'Backup failure',
        description: backup.errorMessage ?? 'A backup run failed.',
        severity: 'high',
        sourceEntityId: `ops-backup-${backup.id}`,
        category: 'operational',
      });
    }

    await this.deps.enterpriseMissionControlService.syncAlertsFromModules(companyId);
    await this.deps.enterpriseMissionControlService.upsertOperationalAlerts(companyId, candidates);
    return candidates;
  }

  async createBackupPolicy(scope: StaffScope, input: CreateOpsBackupPolicyRequest) {
    const [row] = await this.deps.db
      .insert(opsBackupPolicies)
      .values({
        companyId: scope.companyId,
        policyKey: input.policyKey,
        name: input.name,
        description: input.description ?? null,
        scheduleCron: input.scheduleCron ?? null,
        retentionDays: input.retentionDays ?? 30,
        isEnabled: input.isEnabled ?? false,
      })
      .returning();
    return this.toBackupPolicySummary(row!);
  }

  async triggerBackupRun(scope: StaffScope, policyId: string) {
    const policy = await this.deps.db.query.opsBackupPolicies.findFirst({
      where: and(eq(opsBackupPolicies.id, policyId), eq(opsBackupPolicies.companyId, scope.companyId)),
    });
    if (!policy) {
      throw new EnterpriseProductionReadinessError('NOT_FOUND', 'Backup policy not found');
    }

    const [row] = await this.deps.db
      .insert(opsBackupRuns)
      .values({
        companyId: scope.companyId,
        policyId: policy.id,
        status: 'pending',
        backupType: policy.policyKey,
        metadata: {
          triggeredBy: scope.userId,
          note: 'Backup run registered — execute via external backup infrastructure.',
        },
      })
      .returning();

    return {
      id: row!.id,
      policyId: row!.policyId,
      status: row!.status,
      backupType: row!.backupType,
      sizeBytes: null,
      verificationPassed: null,
      errorMessage: null,
      startedAt: row!.startedAt.toISOString(),
      completedAt: null,
    };
  }

  async createMaintenanceWindow(scope: StaffScope, input: CreateOpsMaintenanceWindowRequest) {
    const [row] = await this.deps.db
      .insert(opsMaintenanceWindows)
      .values({
        companyId: scope.companyId,
        title: input.title,
        description: input.description ?? null,
        affectedModules: input.affectedModules ?? [],
        scheduledStartAt: new Date(input.scheduledStartAt),
        scheduledEndAt: new Date(input.scheduledEndAt),
        serviceNotice: input.serviceNotice ?? null,
        createdByUserId: scope.userId,
      })
      .returning();
    return this.toMaintenanceWindowSummary(row!);
  }

  async createMaintenanceAction(scope: StaffScope, input: CreateOpsMaintenanceActionRequest) {
    const [row] = await this.deps.db
      .insert(opsMaintenanceActions)
      .values({
        companyId: scope.companyId,
        maintenanceWindowId: input.maintenanceWindowId ?? null,
        actionType: input.actionType,
        subject: input.subject,
        recommendation: input.recommendation,
        checklist: input.checklist ?? [],
        rollbackNotes: input.rollbackNotes ?? null,
        payload: input.payload ?? {},
        createdByUserId: scope.userId,
        status: 'pending_approval',
      })
      .returning();
    return this.toMaintenanceActionSummary(row!);
  }

  async updatePlatformConfig(scope: StaffScope, input: UpdateOpsPlatformConfigRequest) {
    await this.ensurePlatformConfig(scope.companyId);
    const [row] = await this.deps.db
      .update(opsPlatformConfig)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(opsPlatformConfig.companyId, scope.companyId))
      .returning();
    return this.toPlatformConfigSummary(row!);
  }

  async updateScalingConfig(scope: StaffScope, input: UpdateOpsScalingConfigRequest) {
    await this.ensureScalingConfig(scope.companyId);
    const [row] = await this.deps.db
      .update(opsScalingConfig)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(opsScalingConfig.companyId, scope.companyId))
      .returning();
    return this.getScalingConfigFromRow(row!);
  }

  async searchLogs(companyId: string, input: OpsLogSearchRequest) {
    const rows = await this.deps.db.query.opsOperationalLogEntries.findMany({
      where: eq(opsOperationalLogEntries.companyId, companyId),
      orderBy: [desc(opsOperationalLogEntries.loggedAt)],
      limit: input.limit ?? 100,
    });

    return rows
      .filter((row) => (input.moduleKey ? row.moduleKey === input.moduleKey : true))
      .filter((row) => (input.severity ? row.severity === input.severity : true))
      .filter((row) => (input.correlationId ? row.correlationId === input.correlationId : true))
      .map((row) => ({
        id: row.id,
        moduleKey: row.moduleKey,
        severity: row.severity,
        message: redactSecrets(row.message),
        correlationId: row.correlationId,
        loggedAt: row.loggedAt.toISOString(),
      }));
  }

  async buildAuraContext(companyId: string): Promise<EnterpriseProductionReadinessAuraContext> {
    const dashboard = await this.getDashboard(companyId);
    return {
      summary: dashboard.summary,
      overallHealthStatus: dashboard.overallHealthStatus,
      moduleCount: dashboard.systemHealth.length,
      unhealthyModuleCount: dashboard.systemHealth.filter((m) => m.status !== 'healthy').length,
      queueDepth: dashboard.performance?.queueDepth ?? 0,
      backupPolicyCount: dashboard.backupPolicies.length,
      pendingMaintenanceActionCount: dashboard.maintenanceActions.filter((a) => a.status === 'pending_approval').length,
      readinessStatus: dashboard.latestReadinessRun?.overallStatus ?? null,
    };
  }

  private async buildLiveHealthSignals(companyId: string): Promise<OpsServiceHealthSummary[]> {
    const dbHealthy = this.deps.databaseUrl ? await checkDbConnection(this.deps.databaseUrl) : false;
    const now = new Date().toISOString();

    const [
      errorIntegrations,
      unhealthyProviders,
      pendingAiQueue,
      failedWorkflows,
      failedAgentRuns,
      pendingAutomation,
    ] = await Promise.all([
      this.deps.db
        .select({ value: count() })
        .from(integrationConnections)
        .where(and(eq(integrationConnections.companyId, companyId), eq(integrationConnections.status, 'error'))),
      this.deps.db
        .select({ value: count() })
        .from(aiProviders)
        .where(
          and(
            eq(aiProviders.companyId, companyId),
            inArray(aiProviders.healthStatus, ['unhealthy', 'degraded']),
          ),
        ),
      this.deps.db
        .select({ value: count() })
        .from(aiRequestQueue)
        .where(and(eq(aiRequestQueue.companyId, companyId), eq(aiRequestQueue.status, 'pending'))),
      this.deps.db
        .select({ value: count() })
        .from(workflowRuns)
        .where(and(eq(workflowRuns.companyId, companyId), eq(workflowRuns.status, 'failed'))),
      this.deps.db
        .select({ value: count() })
        .from(agentRuns)
        .where(and(eq(agentRuns.companyId, companyId), eq(agentRuns.status, 'failed'))),
      this.deps.db
        .select({ value: count() })
        .from(automationQueueJobs)
        .where(and(eq(automationQueueJobs.companyId, companyId), eq(automationQueueJobs.status, 'failed'))),
    ]);

    const integrationErrors = Number(errorIntegrations[0]?.value ?? 0);
    const aiUnhealthy = Number(unhealthyProviders[0]?.value ?? 0);
    const aiQueueDepth = Number(pendingAiQueue[0]?.value ?? 0);
    const workflowFailures = Number(failedWorkflows[0]?.value ?? 0);
    const agentFailures = Number(failedAgentRuns[0]?.value ?? 0);
    const automationFailures = Number(pendingAutomation[0]?.value ?? 0);

    const moduleStatus = (key: OpsServiceModule): OpsHealthStatus => {
      switch (key) {
        case 'database':
          return dbHealthy ? 'healthy' : 'unhealthy';
        case 'api_gateway':
        case 'authentication':
          return dbHealthy ? 'healthy' : 'degraded';
        case 'integrations':
          return integrationErrors > 0 ? 'degraded' : 'healthy';
        case 'ai_orchestration':
        case 'ai_provider_gateway':
          return aiUnhealthy > 0 ? 'degraded' : 'healthy';
        case 'queue_services':
          return aiQueueDepth > 20 ? 'degraded' : aiQueueDepth > 100 ? 'unhealthy' : 'healthy';
        case 'background_workers':
        case 'automation_studio':
          return workflowFailures + automationFailures > 5 ? 'degraded' : 'healthy';
        case 'aura_agent_runtime':
          return agentFailures > 3 ? 'degraded' : 'healthy';
        default:
          return dbHealthy ? 'healthy' : 'unknown';
      }
    };

    return OPS_SERVICE_MODULES.map((moduleKey) => ({
      moduleKey,
      status: moduleStatus(moduleKey),
      availabilityPercent: moduleStatus(moduleKey) === 'healthy' ? 100 : moduleStatus(moduleKey) === 'degraded' ? 95 : 0,
      latencyMs: null,
      errorRatePercent: null,
      throughputPerMinute: null,
      dependencyHealth: {
        database: dbHealthy ? 'connected' : 'unavailable',
      },
      lastSuccessfulOperationAt: dbHealthy ? now : null,
      capturedAt: now,
    }));
  }

  private async buildReadinessChecks(companyId: string) {
    const config = await this.getPlatformConfig(companyId);
    const checks: Array<{
      checkKey: string;
      title: string;
      description: string;
      status: OpsReadinessStatus;
      category: string;
      metadata?: Record<string, unknown>;
    }> = [];

    checks.push({
      checkKey: 'database_configured',
      title: 'Database configuration',
      description: this.deps.databaseUrl ? 'DATABASE_URL is configured.' : 'DATABASE_URL is not configured.',
      status: this.deps.databaseUrl ? 'ready' : 'critical',
      category: 'infrastructure',
    });

    checks.push({
      checkKey: 'jwt_configured',
      title: 'Authentication configuration',
      description: this.deps.jwtSecret ? 'JWT secret is configured.' : 'JWT secret is missing.',
      status: this.deps.jwtSecret ? 'ready' : 'critical',
      category: 'security',
    });

    checks.push({
      checkKey: 'encryption_configured',
      title: 'Encryption configuration',
      description: this.deps.encryptionKey
        ? 'Integration encryption key is configured.'
        : 'INTEGRATIONS_ENCRYPTION_KEY is not configured — credentials cannot be encrypted.',
      status: this.deps.encryptionKey ? 'ready' : 'warning',
      category: 'security',
    });

    const [errorIntegrations] = await this.deps.db
      .select({ value: count() })
      .from(integrationConnections)
      .where(and(eq(integrationConnections.companyId, companyId), eq(integrationConnections.status, 'error')));

    checks.push({
      checkKey: 'integration_health',
      title: 'Integration health',
      description:
        Number(errorIntegrations?.value ?? 0) > 0
          ? `${errorIntegrations?.value} integration(s) in error state.`
          : 'No integrations in error state.',
      status: Number(errorIntegrations?.value ?? 0) > 0 ? 'warning' : 'ready',
      category: 'integrations',
    });

    const hasProviders = await this.deps.aiProviderResilienceService.hasConfiguredProviders(companyId);
    checks.push({
      checkKey: 'ai_provider_availability',
      title: 'AI provider availability',
      description: hasProviders
        ? 'At least one AI provider is configured.'
        : 'No AI providers configured — configure tenant providers or AURA_OPENAI_API_KEY.',
      status: hasProviders ? 'ready' : 'warning',
      category: 'ai',
    });

    const policies = await this.listBackupPolicies(companyId);
    const runs = await this.listRecentBackupRuns(companyId);
    checks.push({
      checkKey: 'backup_policy',
      title: 'Backup policy configured',
      description:
        policies.length > 0
          ? `${policies.length} backup policy/policies defined.`
          : 'No backup policies configured.',
      status: policies.some((p) => p.isEnabled) ? 'ready' : policies.length > 0 ? 'warning' : 'warning',
      category: 'disaster_recovery',
    });

    checks.push({
      checkKey: 'backup_freshness',
      title: 'Backup freshness',
      description:
        runs.length > 0
          ? `Latest backup run: ${runs[0]!.status} at ${runs[0]!.startedAt}.`
          : 'No backup runs recorded yet.',
      status: runs.some((r) => r.status === 'completed' || r.status === 'verified') ? 'ready' : runs.length > 0 ? 'warning' : 'unknown',
      category: 'disaster_recovery',
    });

    const [recoveryTest] = await this.deps.db.query.opsRecoveryTestRecords.findMany({
      where: eq(opsRecoveryTestRecords.companyId, companyId),
      orderBy: [desc(opsRecoveryTestRecords.createdAt)],
      limit: 1,
    });

    checks.push({
      checkKey: 'restore_test',
      title: 'Restore test status',
      description: recoveryTest
        ? `Latest restore test: ${recoveryTest.status}.`
        : 'No restore tests performed yet.',
      status: recoveryTest?.status === 'passed' ? 'ready' : recoveryTest ? 'warning' : 'unknown',
      category: 'disaster_recovery',
    });

    if (config.recoveryPointObjectiveMinutes != null) {
      checks.push({
        checkKey: 'rpo_configured',
        title: 'Recovery Point Objective',
        description: `RPO configured at ${config.recoveryPointObjectiveMinutes} minutes.`,
        status: 'ready',
        category: 'disaster_recovery',
        metadata: { rpoMinutes: config.recoveryPointObjectiveMinutes },
      });
    }

    return checks;
  }

  private async getAiProviderMonitoring(companyId: string): Promise<OpsAiProviderMonitoringSummary[]> {
    const [resilience, costAnalytics, providers] = await Promise.all([
      this.deps.aiProviderResilienceService.getResilienceStatus(companyId),
      this.deps.aiOrchestrationService.getCostAnalytics(companyId),
      this.deps.aiOrchestrationService.listProviders(companyId),
    ]);

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    const failovers = await this.deps.db.query.aiFailoverEvents.findMany({
      where: and(eq(aiFailoverEvents.companyId, companyId), gte(aiFailoverEvents.loggedAt, monthStart)),
    });

    return resilience.providers.map((provider) => {
      const failoverCount = failovers.filter(
        (f) => f.fromProviderId === provider.providerId || f.toProviderId === provider.providerId,
      ).length;
      const registry = providers.find((p) => p.providerKey === provider.providerKey);
      return {
        providerKey: provider.providerKey,
        providerId: provider.providerId,
        displayName: provider.displayName,
        healthStatus: provider.healthStatus,
        isEnabled: provider.isEnabled,
        averageLatencyMs: provider.averageLatencyMs,
        errorRatePercent: provider.healthStatus === 'unhealthy' ? 100 : provider.healthStatus === 'degraded' ? 25 : 0,
        rateLimitEvents: failovers.filter((f) => f.reason === 'rate_limit').length,
        failoverCount,
        queueDepth: resilience.pendingQueueCount,
        estimatedCostCents: costAnalytics.totalCostCents ?? 0,
        modelCount: registry?.supportedModels.length ?? 0,
      };
    });
  }

  private async getLatestHealthSnapshots(companyId: string) {
    const live = await this.buildLiveHealthSignals(companyId);
    if (live.length > 0) {
      return live;
    }

    const rows = await this.deps.db.query.opsServiceHealthSnapshots.findMany({
      where: eq(opsServiceHealthSnapshots.companyId, companyId),
      orderBy: [desc(opsServiceHealthSnapshots.capturedAt)],
      limit: OPS_SERVICE_MODULES.length,
    });

    if (rows.length === 0) {
      return live;
    }

    return rows.map((row) => ({
      moduleKey: row.moduleKey,
      status: row.status,
      availabilityPercent: row.availabilityPercent != null ? Number(row.availabilityPercent) : null,
      latencyMs: row.latencyMs,
      errorRatePercent: row.errorRatePercent != null ? Number(row.errorRatePercent) : null,
      throughputPerMinute: row.throughputPerMinute,
      dependencyHealth: row.dependencyHealth,
      lastSuccessfulOperationAt: row.lastSuccessfulOperationAt?.toISOString() ?? null,
      capturedAt: row.capturedAt.toISOString(),
    }));
  }

  private async getLatestPerformanceSnapshot(companyId: string) {
    const row = await this.deps.db.query.opsPerformanceSnapshots.findFirst({
      where: eq(opsPerformanceSnapshots.companyId, companyId),
      orderBy: [desc(opsPerformanceSnapshots.capturedAt)],
    });
    if (!row) return null;
    return {
      id: row.id,
      apiP95LatencyMs: row.apiP95LatencyMs,
      slowEndpointCount: row.slowEndpointCount,
      dbPoolUsagePercent: row.dbPoolUsagePercent != null ? Number(row.dbPoolUsagePercent) : null,
      cacheHitRatePercent: row.cacheHitRatePercent != null ? Number(row.cacheHitRatePercent) : null,
      queueDepth: row.queueDepth,
      workerThroughputPerMinute: row.workerThroughputPerMinute,
      backgroundJobFailureCount: row.backgroundJobFailureCount,
      memoryUsageMb: row.memoryUsageMb,
      cpuUsagePercent: row.cpuUsagePercent != null ? Number(row.cpuUsagePercent) : null,
      storageUsageMb: row.storageUsageMb,
      webhookLatencyMs: row.webhookLatencyMs,
      integrationLatencyMs: row.integrationLatencyMs,
      aiProviderLatencyMs: row.aiProviderLatencyMs,
      knowledgeGraphSearchMs: row.knowledgeGraphSearchMs,
      digitalTwinSimulationMs: row.digitalTwinSimulationMs,
      capturedAt: row.capturedAt.toISOString(),
    };
  }

  private async listBackupPolicies(companyId: string) {
    const rows = await this.deps.db.query.opsBackupPolicies.findMany({
      where: eq(opsBackupPolicies.companyId, companyId),
      orderBy: [desc(opsBackupPolicies.createdAt)],
    });
    return rows.map((row) => this.toBackupPolicySummary(row));
  }

  private async listRecentBackupRuns(companyId: string) {
    const rows = await this.deps.db.query.opsBackupRuns.findMany({
      where: eq(opsBackupRuns.companyId, companyId),
      orderBy: [desc(opsBackupRuns.startedAt)],
      limit: 10,
    });
    return rows.map((row) => ({
      id: row.id,
      policyId: row.policyId,
      status: row.status,
      backupType: row.backupType,
      sizeBytes: row.sizeBytes,
      verificationPassed: row.verificationPassed,
      errorMessage: row.errorMessage,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    }));
  }

  private async getRecoveryReadiness(companyId: string) {
    const config = await this.getPlatformConfig(companyId);
    const runs = await this.listRecentBackupRuns(companyId);
    const latest = runs[0] ?? null;
    const [test] = await this.deps.db.query.opsRecoveryTestRecords.findMany({
      where: eq(opsRecoveryTestRecords.companyId, companyId),
      orderBy: [desc(opsRecoveryTestRecords.createdAt)],
      limit: 1,
    });

    let backupFreshnessHours: number | null = null;
    if (latest?.startedAt) {
      backupFreshnessHours = Math.round((Date.now() - new Date(latest.startedAt).getTime()) / 3600000);
    }

    return {
      recoveryPointObjectiveMinutes: config.recoveryPointObjectiveMinutes,
      recoveryTimeObjectiveMinutes: config.recoveryTimeObjectiveMinutes,
      backupRetentionDays: config.backupRetentionDays,
      latestBackupAt: latest?.startedAt ?? null,
      latestBackupStatus: latest?.status ?? null,
      restoreTestStatus: test?.status ?? 'not_performed',
      restoreTestPerformedAt: test?.performedAt?.toISOString() ?? null,
      backupFreshnessHours,
      multiRegionEnabled: config.multiRegionEnabled,
      readReplicaEnabled: config.readReplicaEnabled,
    };
  }

  private async getLatestReadinessRun(companyId: string) {
    const run = await this.deps.db.query.opsReadinessCheckRuns.findFirst({
      where: eq(opsReadinessCheckRuns.companyId, companyId),
      orderBy: [desc(opsReadinessCheckRuns.executedAt)],
    });
    if (!run) return null;
    return this.getReadinessRun(run.id, companyId);
  }

  private async getReadinessRun(runId: string, companyId: string) {
    const run = await this.deps.db.query.opsReadinessCheckRuns.findFirst({
      where: and(eq(opsReadinessCheckRuns.id, runId), eq(opsReadinessCheckRuns.companyId, companyId)),
    });
    if (!run) {
      throw new EnterpriseProductionReadinessError('NOT_FOUND', 'Readiness run not found');
    }
    const checks = await this.deps.db.query.opsReadinessCheckResults.findMany({
      where: eq(opsReadinessCheckResults.runId, runId),
    });
    return {
      id: run.id,
      overallStatus: run.overallStatus,
      readyCount: run.readyCount,
      warningCount: run.warningCount,
      criticalCount: run.criticalCount,
      unknownCount: run.unknownCount,
      checks: checks.map((c) => ({
        id: c.id,
        checkKey: c.checkKey,
        title: c.title,
        description: c.description,
        status: c.status,
        category: c.category,
      })),
      executedAt: run.executedAt.toISOString(),
    };
  }

  private async listRecentLogs(companyId: string, input: { limit?: number }) {
    const rows = await this.deps.db.query.opsOperationalLogEntries.findMany({
      where: eq(opsOperationalLogEntries.companyId, companyId),
      orderBy: [desc(opsOperationalLogEntries.loggedAt)],
      limit: input.limit ?? 30,
    });
    return rows.map((row) => ({
      id: row.id,
      moduleKey: row.moduleKey,
      severity: row.severity,
      message: redactSecrets(row.message),
      correlationId: row.correlationId,
      loggedAt: row.loggedAt.toISOString(),
    }));
  }

  private async listMaintenanceWindows(companyId: string) {
    const rows = await this.deps.db.query.opsMaintenanceWindows.findMany({
      where: eq(opsMaintenanceWindows.companyId, companyId),
      orderBy: [desc(opsMaintenanceWindows.scheduledStartAt)],
      limit: 20,
    });
    return rows.map((row) => this.toMaintenanceWindowSummary(row));
  }

  private async listMaintenanceActions(companyId: string) {
    const rows = await this.deps.db.query.opsMaintenanceActions.findMany({
      where: eq(opsMaintenanceActions.companyId, companyId),
      orderBy: [desc(opsMaintenanceActions.createdAt)],
      limit: 20,
    });
    return rows.map((row) => this.toMaintenanceActionSummary(row));
  }

  private async getScalingConfig(companyId: string) {
    const row = await this.ensureScalingConfig(companyId);
    return this.getScalingConfigFromRow(row);
  }

  private async getPlatformConfig(companyId: string) {
    const row = await this.ensurePlatformConfig(companyId);
    return this.toPlatformConfigSummary(row);
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.opsPlatformConfig.findFirst({
      where: eq(opsPlatformConfig.companyId, companyId),
    });
    if (existing) return existing;
    const [row] = await this.deps.db.insert(opsPlatformConfig).values({ companyId }).returning();
    return row!;
  }

  private async ensureScalingConfig(companyId: string) {
    const existing = await this.deps.db.query.opsScalingConfig.findFirst({
      where: eq(opsScalingConfig.companyId, companyId),
    });
    if (existing) return existing;
    const [row] = await this.deps.db.insert(opsScalingConfig).values({ companyId }).returning();
    return row!;
  }

  private async indexLogEntry(
    companyId: string,
    input: {
      moduleKey: string;
      severity: 'debug' | 'info' | 'warn' | 'error' | 'critical';
      message: string;
      sourceTable?: string;
      sourceEntityId?: string;
      metadata?: Record<string, unknown>;
      loggedAt: Date;
    },
  ) {
    const syncKey = `${input.sourceTable}:${input.sourceEntityId}`;
    const existing = await this.deps.db.query.opsOperationalLogEntries.findFirst({
      where: and(
        eq(opsOperationalLogEntries.companyId, companyId),
        eq(opsOperationalLogEntries.sourceEntityId, input.sourceEntityId ?? syncKey),
      ),
    });
    if (existing) return;

    await this.deps.db.insert(opsOperationalLogEntries).values({
      companyId,
      moduleKey: input.moduleKey,
      severity: input.severity,
      message: redactSecrets(input.message),
      sourceTable: input.sourceTable ?? null,
      sourceEntityId: input.sourceEntityId ?? syncKey,
      metadata: input.metadata ?? {},
      loggedAt: input.loggedAt,
    });
  }

  private toBackupPolicySummary(row: typeof opsBackupPolicies.$inferSelect) {
    return {
      id: row.id,
      policyKey: row.policyKey,
      name: row.name,
      description: row.description,
      scheduleCron: row.scheduleCron,
      retentionDays: row.retentionDays,
      isEnabled: row.isEnabled,
      includesDatabase: row.includesDatabase,
      includesConfiguration: row.includesConfiguration,
      includesCredentials: row.includesCredentials,
      includesKnowledgeGraph: row.includesKnowledgeGraph,
      includesOrganizationalMemory: row.includesOrganizationalMemory,
      includesFileStorage: row.includesFileStorage,
    };
  }

  private toMaintenanceWindowSummary(row: typeof opsMaintenanceWindows.$inferSelect) {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      affectedModules: row.affectedModules,
      status: row.status,
      scheduledStartAt: row.scheduledStartAt.toISOString(),
      scheduledEndAt: row.scheduledEndAt.toISOString(),
      serviceNotice: row.serviceNotice,
    };
  }

  private toMaintenanceActionSummary(row: typeof opsMaintenanceActions.$inferSelect) {
    return {
      id: row.id,
      actionType: row.actionType,
      subject: row.subject,
      recommendation: row.recommendation,
      status: row.status,
      maintenanceWindowId: row.maintenanceWindowId,
      checklist: row.checklist,
      rollbackNotes: row.rollbackNotes,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toPlatformConfigSummary(row: typeof opsPlatformConfig.$inferSelect) {
    return {
      warningThresholds: row.warningThresholds,
      hardInfrastructureLimits: row.hardInfrastructureLimits,
      backupRetentionDays: row.backupRetentionDays,
      logRetentionDays: row.logRetentionDays,
      recoveryPointObjectiveMinutes: row.recoveryPointObjectiveMinutes,
      recoveryTimeObjectiveMinutes: row.recoveryTimeObjectiveMinutes,
      multiRegionEnabled: row.multiRegionEnabled,
      readReplicaEnabled: row.readReplicaEnabled,
    };
  }

  private getScalingConfigFromRow(row: typeof opsScalingConfig.$inferSelect) {
    return {
      horizontalApiScalingEnabled: row.horizontalApiScalingEnabled,
      horizontalWorkerScalingEnabled: row.horizontalWorkerScalingEnabled,
      queueConcurrencyLimit: row.queueConcurrencyLimit,
      queuePartitionCount: row.queuePartitionCount,
      dbPoolMaxConnections: row.dbPoolMaxConnections,
      aiRequestQueueConcurrency: row.aiRequestQueueConcurrency,
      searchIndexShards: row.searchIndexShards,
      webhookConcurrency: row.webhookConcurrency,
      multiRegionReady: row.multiRegionReady,
      multiRegionActive: false,
    };
  }
}

function resolveOverallHealth(modules: OpsServiceHealthSummary[]): OpsHealthStatus {
  if (modules.some((m) => m.status === 'unhealthy')) return 'unhealthy';
  if (modules.some((m) => m.status === 'degraded')) return 'degraded';
  if (modules.every((m) => m.status === 'healthy')) return 'healthy';
  return 'unknown';
}

function redactSecrets(message: string) {
  return message
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/api[_-]?key[=:\s]+[A-Za-z0-9\-._~+/]+/gi, 'api_key=[REDACTED]')
    .replace(/password[=:\s]+\S+/gi, 'password=[REDACTED]');
}
