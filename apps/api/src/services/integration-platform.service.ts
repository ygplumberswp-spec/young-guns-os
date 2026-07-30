import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type {
  CreateIntegrationPlatformActionRequest,
  IntegrationCredentialsVaultSummary,
  IntegrationDeveloperDiagnosticSummary,
  IntegrationGatewayTraceSummary,
  IntegrationMonitoringSummary,
  IntegrationPlatformActionStatus,
  IntegrationPlatformActionSummary,
  IntegrationPlatformAuraContext,
  IntegrationPlatformExecutiveDashboard,
  IntegrationSyncConflictSummary,
  IntegrationSyncScheduleSummary,
  RunIntegrationDiagnosticRequest,
  UpdateIntegrationSyncScheduleRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  integrationApiGatewayTraces,
  integrationApiUsage,
  integrationCredentialMetadata,
  integrationDeveloperDiagnostics,
  integrationPlatformActions,
  integrationRequestLogs,
  integrationSyncConflicts,
  integrationSyncJobs,
  integrationSyncSchedules,
} from '@titan/db';
import type { ConnectorEngineService } from './connector-engine.service.js';
import type { IntegrationApiManagementService } from './integration-api-management.service.js';
import type { IntegrationHubService } from './integration-hub.service.js';

export class IntegrationPlatformError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'IntegrationPlatformError';
  }
}

type StaffScope = { companyId: string; userId: string };

type IntegrationPlatformDeps = {
  db: DatabaseClient;
  connectorEngine: ConnectorEngineService;
  hubService: IntegrationHubService;
  apiManagementService: IntegrationApiManagementService;
};

export class IntegrationPlatformService {
  constructor(private readonly deps: IntegrationPlatformDeps) {}

  async getExecutiveDashboard(companyId: string): Promise<IntegrationPlatformExecutiveDashboard> {
    const startedAt = Date.now();
    const timings: Record<string, number> = {};

    const connectorsStarted = Date.now();
    const connectors = await this.deps.connectorEngine.listConnectors(companyId);
    timings.connectors = Date.now() - connectorsStarted;

    const parallelStarted = Date.now();
    const [monitoring, recentTraces, recentConflicts, pendingActions, vaultEntries] =
      await Promise.all([
        this.getMonitoringSummary(companyId, connectors).then((result) => {
          timings.monitoring = Date.now() - parallelStarted;
          return result;
        }),
        this.listGatewayTraces(companyId, 20).then((result) => {
          timings.traces = Date.now() - parallelStarted;
          return result;
        }),
        this.listSyncConflicts(companyId, 25).then((result) => {
          timings.conflicts = Date.now() - parallelStarted;
          return result;
        }),
        this.listActions(companyId, 'pending_approval', 25).then((result) => {
          timings.actions = Date.now() - parallelStarted;
          return result;
        }),
        this.listCredentialsVault(companyId).then((result) => {
          timings.vault = Date.now() - parallelStarted;
          return result;
        }),
      ]);
    timings.parallelBatch = Date.now() - parallelStarted;

    const durationMs = Date.now() - startedAt;
    if (durationMs > 2000) {
      console.warn('[integration-platform] slow dashboard', { companyId, durationMs, timings });
    }

    return {
      summary: `${monitoring.connectedServiceCount} connected service(s), ${monitoring.errorServiceCount} error(s), ${monitoring.activeSyncJobCount} active sync job(s).`,
      monitoring,
      connectors,
      recentTraces,
      recentConflicts: recentConflicts.slice(0, 10),
      pendingActionCount: pendingActions.length,
      vaultEntries,
    };
  }

  async buildIntegrationAuraContext(companyId: string): Promise<IntegrationPlatformAuraContext> {
    const connectors = await this.deps.connectorEngine.listConnectors(companyId);
    const monitoring = await this.getMonitoringSummary(companyId, connectors);
    const pendingActions = await this.listActions(companyId, 'pending_approval', 10);

    return {
      summary: `${monitoring.connectedServiceCount} connected service(s), ${monitoring.errorServiceCount} error(s), ${monitoring.activeSyncJobCount} active sync job(s).`,
      connectedServiceCount: monitoring.connectedServiceCount,
      errorServiceCount: monitoring.errorServiceCount,
      activeSyncJobCount: monitoring.activeSyncJobCount,
      failedRequestCount24h: monitoring.failedRequestCount24h,
      pendingActionCount: pendingActions.length,
    };
  }

  async recordGatewayTrace(input: {
    companyId: string;
    traceId: string;
    routeKey: string;
    method: string;
    path: string;
    statusCode?: number;
    durationMs?: number;
    apiVersion?: string;
    userId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.deps.db.insert(integrationApiGatewayTraces).values({
      companyId: input.companyId,
      traceId: input.traceId,
      routeKey: input.routeKey,
      method: input.method,
      path: input.path,
      statusCode: input.statusCode,
      durationMs: input.durationMs,
      apiVersion: input.apiVersion,
      userId: input.userId,
      metadata: input.metadata ?? {},
    });
  }

  async listGatewayTraces(
    companyId: string,
    limit = 100,
  ): Promise<IntegrationGatewayTraceSummary[]> {
    const rows = await this.deps.db.query.integrationApiGatewayTraces.findMany({
      where: eq(integrationApiGatewayTraces.companyId, companyId),
      orderBy: [desc(integrationApiGatewayTraces.occurredAt)],
      limit,
    });

    return rows.map((row) => ({
      id: row.id,
      traceId: row.traceId,
      routeKey: row.routeKey,
      method: row.method,
      path: row.path,
      statusCode: row.statusCode,
      durationMs: row.durationMs,
      apiVersion: row.apiVersion,
      occurredAt: row.occurredAt.toISOString(),
    }));
  }

  async getMonitoringSummary(
    companyId: string,
    connectorsInput?: Awaited<ReturnType<ConnectorEngineService['listConnectors']>>,
  ): Promise<IntegrationMonitoringSummary> {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const connectors =
      connectorsInput ?? (await this.deps.connectorEngine.listConnectors(companyId));

    const [activeSyncJobs, failedRequests, usageRows] = await Promise.all([
      this.deps.db.query.integrationSyncJobs.findMany({
        where: and(
          eq(integrationSyncJobs.companyId, companyId),
          inArray(integrationSyncJobs.status, ['pending', 'running']),
        ),
        limit: 50,
      }),
      this.deps.db.query.integrationRequestLogs.findMany({
        where: and(
          eq(integrationRequestLogs.companyId, companyId),
          gte(integrationRequestLogs.createdAt, since24h),
          sql`${integrationRequestLogs.statusCode} >= 400`,
        ),
        limit: 100,
      }),
      this.deps.db.query.integrationApiUsage.findMany({
        where: and(
          eq(integrationApiUsage.companyId, companyId),
          gte(integrationApiUsage.periodStart, since24h),
        ),
        limit: 200,
      }),
    ]);

    const connectedServiceCount = connectors.filter((row) => row.status === 'connected').length;
    const errorServiceCount = connectors.filter((row) => row.status === 'error').length;

    let totalRequests = 0;
    let totalFailures = 0;
    let latencySum = 0;
    let latencyCount = 0;

    for (const row of usageRows) {
      totalRequests += row.requestCount;
      totalFailures += row.failureCount;
      if (row.avgResponseMs) {
        latencySum += row.avgResponseMs * row.requestCount;
        latencyCount += row.requestCount;
      }
    }

    const successRatePercent =
      totalRequests > 0
        ? Math.round(((totalRequests - totalFailures) / totalRequests) * 100)
        : null;

    return {
      connectedServiceCount,
      errorServiceCount,
      activeSyncJobCount: activeSyncJobs.length,
      failedRequestCount24h: failedRequests.length,
      avgLatencyMs: latencyCount > 0 ? Math.round(latencySum / latencyCount) : null,
      successRatePercent,
      rateLimitStatus: 'normal',
    };
  }

  async listSyncSchedules(companyId: string): Promise<IntegrationSyncScheduleSummary[]> {
    await this.deps.connectorEngine.ensureConnectors(companyId);
    const rows = await this.deps.db.query.integrationSyncSchedules.findMany({
      where: eq(integrationSyncSchedules.companyId, companyId),
      orderBy: [desc(integrationSyncSchedules.updatedAt)],
    });

    return rows.map((row) => ({
      id: row.id,
      connectorId: row.connectorId,
      syncScope: row.syncScope,
      frequencyMinutes: row.frequencyMinutes,
      enabled: row.enabled,
      nextRunAt: row.nextRunAt?.toISOString() ?? null,
      lastRunAt: row.lastRunAt?.toISOString() ?? null,
    }));
  }

  async upsertSyncSchedule(
    scope: StaffScope,
    connectorId: string,
    input: UpdateIntegrationSyncScheduleRequest,
  ): Promise<IntegrationSyncScheduleSummary> {
    await this.deps.connectorEngine.getConnector(scope.companyId, connectorId);

    const existing = await this.deps.db.query.integrationSyncSchedules.findFirst({
      where: and(
        eq(integrationSyncSchedules.companyId, scope.companyId),
        eq(integrationSyncSchedules.connectorId, connectorId),
      ),
    });

    const payload = {
      syncScope: input.syncScope,
      frequencyMinutes: input.frequencyMinutes,
      enabled: input.enabled,
      updatedAt: new Date(),
      nextRunAt:
        input.enabled && input.frequencyMinutes
          ? new Date(Date.now() + input.frequencyMinutes * 60_000)
          : undefined,
    };

    const [row] = existing
      ? await this.deps.db
          .update(integrationSyncSchedules)
          .set(payload)
          .where(eq(integrationSyncSchedules.id, existing.id))
          .returning()
      : await this.deps.db
          .insert(integrationSyncSchedules)
          .values({
            companyId: scope.companyId,
            connectorId,
            syncScope: input.syncScope ?? 'incremental',
            frequencyMinutes: input.frequencyMinutes ?? 60,
            enabled: input.enabled ?? false,
            nextRunAt: input.enabled
              ? new Date(Date.now() + (input.frequencyMinutes ?? 60) * 60_000)
              : null,
          })
          .returning();

    if (!row) {
      throw new IntegrationPlatformError('SCHEDULE_FAILED', 'Unable to save sync schedule');
    }

    return {
      id: row.id,
      connectorId: row.connectorId,
      syncScope: row.syncScope,
      frequencyMinutes: row.frequencyMinutes,
      enabled: row.enabled,
      nextRunAt: row.nextRunAt?.toISOString() ?? null,
      lastRunAt: row.lastRunAt?.toISOString() ?? null,
    };
  }

  async listSyncConflicts(
    companyId: string,
    limit = 25,
  ): Promise<IntegrationSyncConflictSummary[]> {
    const rows = await this.deps.db.query.integrationSyncConflicts.findMany({
      where: eq(integrationSyncConflicts.companyId, companyId),
      orderBy: [desc(integrationSyncConflicts.detectedAt)],
      limit,
    });

    return rows.map((row) => ({
      id: row.id,
      connectorId: row.connectorId,
      entityType: row.entityType,
      entityId: row.entityId,
      conflictType: row.conflictType,
      status: row.status,
      detectedAt: row.detectedAt.toISOString(),
    }));
  }

  async resolveSyncConflict(
    scope: StaffScope,
    conflictId: string,
  ): Promise<IntegrationSyncConflictSummary> {
    const [updated] = await this.deps.db
      .update(integrationSyncConflicts)
      .set({ status: 'resolved', resolvedAt: new Date() })
      .where(
        and(
          eq(integrationSyncConflicts.id, conflictId),
          eq(integrationSyncConflicts.companyId, scope.companyId),
        ),
      )
      .returning();

    if (!updated) {
      throw new IntegrationPlatformError('CONFLICT_NOT_FOUND', 'Sync conflict not found');
    }

    return {
      id: updated.id,
      connectorId: updated.connectorId,
      entityType: updated.entityType,
      entityId: updated.entityId,
      conflictType: updated.conflictType,
      status: updated.status,
      detectedAt: updated.detectedAt.toISOString(),
    };
  }

  async listActions(
    companyId: string,
    status?: IntegrationPlatformActionStatus,
    limit = 50,
  ): Promise<IntegrationPlatformActionSummary[]> {
    const rows = await this.deps.db.query.integrationPlatformActions.findMany({
      where: status
        ? and(
            eq(integrationPlatformActions.companyId, companyId),
            eq(integrationPlatformActions.status, status),
          )
        : eq(integrationPlatformActions.companyId, companyId),
      orderBy: [desc(integrationPlatformActions.createdAt)],
      limit,
    });

    return rows.map((row) => ({
      id: row.id,
      actionType: row.actionType,
      status: row.status,
      subject: row.subject,
      recommendation: row.recommendation,
      payload: row.payload,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createAction(
    scope: StaffScope,
    input: CreateIntegrationPlatformActionRequest,
  ): Promise<IntegrationPlatformActionSummary> {
    const [action] = await this.deps.db
      .insert(integrationPlatformActions)
      .values({
        companyId: scope.companyId,
        actionType: input.actionType,
        subject: input.subject.trim(),
        recommendation: input.recommendation.trim(),
        payload: input.payload ?? {},
        createdByUserId: scope.userId,
        status: 'pending_approval',
      })
      .returning();

    if (!action) {
      throw new IntegrationPlatformError('ACTION_FAILED', 'Unable to create integration action');
    }

    return {
      id: action.id,
      actionType: action.actionType,
      status: action.status,
      subject: action.subject,
      recommendation: action.recommendation,
      payload: action.payload,
      createdAt: action.createdAt.toISOString(),
    };
  }

  async updateActionStatus(
    scope: StaffScope,
    actionId: string,
    status: IntegrationPlatformActionStatus,
  ): Promise<IntegrationPlatformActionSummary> {
    const [updated] = await this.deps.db
      .update(integrationPlatformActions)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(integrationPlatformActions.id, actionId),
          eq(integrationPlatformActions.companyId, scope.companyId),
        ),
      )
      .returning();

    if (!updated) {
      throw new IntegrationPlatformError('ACTION_NOT_FOUND', 'Integration action not found');
    }

    return {
      id: updated.id,
      actionType: updated.actionType,
      status: updated.status,
      subject: updated.subject,
      recommendation: updated.recommendation,
      payload: updated.payload,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async listCredentialsVault(companyId: string): Promise<IntegrationCredentialsVaultSummary[]> {
    await this.deps.apiManagementService.syncCredentialMetadata(companyId);
    const rows = await this.deps.db.query.integrationCredentialMetadata.findMany({
      where: eq(integrationCredentialMetadata.companyId, companyId),
    });

    return rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      authType: row.authType,
      credentialHint: row.credentialHint,
      encrypted: true,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      lastRotatedAt: row.lastRotatedAt?.toISOString() ?? null,
      rotationRequired: row.rotationRequired,
    }));
  }

  async runDiagnostic(
    scope: StaffScope,
    input: RunIntegrationDiagnosticRequest,
  ): Promise<IntegrationDeveloperDiagnosticSummary> {
    if (input.connectorId) {
      await this.deps.connectorEngine.getConnector(scope.companyId, input.connectorId);
    }

    const connector = input.connectorId
      ? await this.deps.connectorEngine.getConnector(scope.companyId, input.connectorId)
      : null;

    let validationSummary = 'Integration platform diagnostic completed.';
    const results: Record<string, unknown> = {};

    if (connector) {
      const validation = await this.deps.apiManagementService.validateIntegration(
        scope.companyId,
        connector.provider as string,
      );
      validationSummary = validation.valid
        ? `${connector.name} validation passed (${validation.checks.filter((c) => c.passed).length}/${validation.checks.length} checks).`
        : `${connector.name} validation failed (${validation.checks.filter((c) => !c.passed).length} issue(s)).`;
      results.validation = validation;
    } else {
      const connectors = await this.deps.connectorEngine.listConnectors(scope.companyId);
      results.connectorCount = connectors.length;
      results.connectedCount = connectors.filter((row) => row.status === 'connected').length;
      results.errorCount = connectors.filter((row) => row.status === 'error').length;
    }

    const [diagnostic] = await this.deps.db
      .insert(integrationDeveloperDiagnostics)
      .values({
        companyId: scope.companyId,
        connectorId: input.connectorId,
        diagnosticType: input.diagnosticType,
        status: 'completed',
        summary: validationSummary,
        results,
        createdByUserId: scope.userId,
        completedAt: new Date(),
      })
      .returning();

    if (!diagnostic) {
      throw new IntegrationPlatformError('DIAGNOSTIC_FAILED', 'Unable to run diagnostic');
    }

    return {
      id: diagnostic.id,
      diagnosticType: diagnostic.diagnosticType,
      status: diagnostic.status,
      summary: diagnostic.summary,
      createdAt: diagnostic.createdAt.toISOString(),
    };
  }

  async listDiagnostics(companyId: string): Promise<IntegrationDeveloperDiagnosticSummary[]> {
    const rows = await this.deps.db.query.integrationDeveloperDiagnostics.findMany({
      where: eq(integrationDeveloperDiagnostics.companyId, companyId),
      orderBy: [desc(integrationDeveloperDiagnostics.createdAt)],
      limit: 50,
    });

    return rows.map((row) => ({
      id: row.id,
      diagnosticType: row.diagnosticType,
      status: row.status,
      summary: row.summary,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async retryConnectorSync(
    scope: StaffScope,
    connectorId: string,
  ): Promise<{ syncJobId: string | null }> {
    const connector = await this.deps.connectorEngine.getConnector(scope.companyId, connectorId);
    const manager = await this.deps.apiManagementService.getSyncManagerStatus(scope.companyId);
    const failedJob = manager.syncJobs.find(
      (job) => job.provider === connector.provider && job.status === 'failed',
    );

    if (failedJob) {
      await this.deps.apiManagementService.retrySyncJob(scope.companyId, failedJob.id);
      return { syncJobId: failedJob.id };
    }

    return { syncJobId: null };
  }
}
