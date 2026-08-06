import { createHash } from 'node:crypto';
import { and, desc, eq, inArray, isNotNull, lte } from 'drizzle-orm';
import type {
  AutoSyncProviderKey,
  IntegrationAutoSyncRunResult,
  IntegrationProviderAutoSyncStatus,
  IntegrationSyncTrigger,
} from '@titan/shared';
import {
  AUTO_SYNC_DEFAULT_INTERVAL_MINUTES,
  AUTO_SYNC_PROVIDER_CATALOG,
  AUTO_SYNC_UI_STATE_LABELS,
  deriveIntegrationAutoSyncUiState,
  formatAutoSyncCorrectiveAction,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  aiProviders,
  integrationConnections,
  integrationConnectors,
  integrationSyncJobs,
  integrationSyncSchedules,
  securityAuditLogs,
  whatsappConnections,
} from '@titan/db';
import type { RuntimeControls } from '../config.js';
import type { BusinessIntegrationsService } from './business-integrations.service.js';
import type { ConnectorEngineService } from './connector-engine.service.js';
import type { IntegrationsService } from './integrations.service.js';
import type { XeroOAuthService } from './xero-oauth.service.js';
import type { XeroSyncService } from './xero-sync.service.js';
import type { XeroRateBudgetService } from './xero-rate-budget.service.js';
import { invalidateIntegrationReadCaches } from './api-read-cache.js';

const MAX_BACKOFF_MINUTES = 240;
const MAX_CONSECUTIVE_FAILURES = 8;

type AutoSyncConnectorConfig = {
  autoSync?: {
    consecutiveFailures?: number;
    nextRetryAt?: string | null;
    lastAttemptAt?: string | null;
    lastSuccessAt?: string | null;
    lastRecordsProcessed?: number | null;
    lastError?: string | null;
    initialSyncCompleted?: boolean;
    cvMetricsRefreshAt?: string | null;
    cvMetricsRefreshJobId?: string | null;
    twoWayReadVerifyJobId?: string | null;
    twoWayReadVerifyQueuedAt?: string | null;
  };
};

export class IntegrationSyncOrchestratorError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'IntegrationSyncOrchestratorError';
  }
}

type IntegrationSyncOrchestratorDeps = {
  db: DatabaseClient;
  runtime: RuntimeControls;
  connectorEngine: ConnectorEngineService;
  xeroSyncService: XeroSyncService;
  xeroOAuthService: XeroOAuthService;
  xeroRateBudgetService?: XeroRateBudgetService;
  integrationsService: IntegrationsService;
  businessIntegrationsService: BusinessIntegrationsService;
};

type RunSyncInput = {
  companyId: string;
  provider: AutoSyncProviderKey;
  trigger: IntegrationSyncTrigger;
  userId?: string;
};

export class IntegrationSyncOrchestratorService {
  private readonly inflight = new Map<string, Promise<IntegrationAutoSyncRunResult>>();

  constructor(private readonly deps: IntegrationSyncOrchestratorDeps) {}

  isAutoSyncRuntimeEnabled(): boolean {
    return this.deps.runtime.providersEnabled;
  }

  isProviderSyncEnabled(provider: AutoSyncProviderKey): boolean {
    if (!this.deps.runtime.providersEnabled) {
      return false;
    }

    if (provider === 'xero') {
      return this.deps.runtime.xeroSyncEnabled;
    }

    return true;
  }

  async onProviderConnected(input: {
    companyId: string;
    provider: AutoSyncProviderKey;
    userId?: string;
  }): Promise<IntegrationAutoSyncRunResult | null> {
    await this.deps.connectorEngine.ensureConnectors(input.companyId);
    await this.ensureDefaultSchedule(input.companyId, input.provider);

    if (!this.isProviderSyncEnabled(input.provider)) {
      await this.recordAudit(input.companyId, input.userId, 'integration_auto_sync_queued_off', {
        provider: input.provider,
        reason: 'runtime_gate_disabled',
      });
      return null;
    }

    return this.runProviderSync({
      companyId: input.companyId,
      provider: input.provider,
      trigger: 'initial',
      userId: input.userId,
    });
  }

  /**
   * Connected tenants that linked before auto-sync existed may lack schedules.
   * Backfill schedules and queue a one-time initial sync without requiring reconnect.
   */
  async reconcileConnectedProvidersWithoutSchedules(): Promise<{
    backfilled: number;
    initialQueued: number;
  }> {
    if (!this.isAutoSyncRuntimeEnabled()) {
      return { backfilled: 0, initialQueued: 0 };
    }

    const connectedConnections = await this.deps.db.query.integrationConnections.findMany({
      where: eq(integrationConnections.status, 'connected'),
    });

    let backfilled = 0;
    let initialQueued = 0;

    for (const connection of connectedConnections) {
      const catalogEntry = AUTO_SYNC_PROVIDER_CATALOG.find(
        (entry) =>
          entry.integrationProvider === connection.provider && entry.implementation !== 'stub',
      );

      if (!catalogEntry) {
        continue;
      }

      const provider = catalogEntry.key;

      if (!this.isProviderSyncEnabled(provider)) {
        continue;
      }

      await this.deps.connectorEngine.ensureConnectors(connection.companyId);
      const connectors = await this.deps.connectorEngine.listConnectors(connection.companyId, {
        refreshStatus: false,
      });
      const connector = connectors.find((row) => row.connectorKey === provider);

      if (!connector) {
        continue;
      }

      const existingSchedule = await this.deps.db.query.integrationSyncSchedules.findFirst({
        where: and(
          eq(integrationSyncSchedules.companyId, connection.companyId),
          eq(integrationSyncSchedules.connectorId, connector.id),
        ),
      });

      if (existingSchedule) {
        continue;
      }

      await this.ensureDefaultSchedule(connection.companyId, provider);
      backfilled += 1;

      const connectorRow = await this.deps.db.query.integrationConnectors.findFirst({
        where: and(
          eq(integrationConnectors.companyId, connection.companyId),
          eq(integrationConnectors.connectorKey, provider),
        ),
      });
      const connectorConfig = (connectorRow?.config ?? {}) as AutoSyncConnectorConfig;
      const initialCompleted = connectorConfig.autoSync?.initialSyncCompleted === true;

      if (!initialCompleted) {
        initialQueued += 1;
        void this.runProviderSync({
          companyId: connection.companyId,
          provider,
          trigger: 'initial',
        }).catch((error: unknown) => {
          console.error('[integration-sync-orchestrator] Backfill initial sync failed', {
            companyId: connection.companyId,
            provider,
            error,
          });
        });
      } else {
        const schedule = await this.deps.db.query.integrationSyncSchedules.findFirst({
          where: and(
            eq(integrationSyncSchedules.companyId, connection.companyId),
            eq(integrationSyncSchedules.connectorId, connector.id),
          ),
        });

        if (schedule) {
          await this.deps.db
            .update(integrationSyncSchedules)
            .set({
              nextRunAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(integrationSyncSchedules.id, schedule.id));
        }
      }

      await this.recordAudit(
        connection.companyId,
        undefined,
        'integration_auto_sync_schedule_backfilled',
        {
          provider,
          reason: 'connected_without_schedule',
          initialSyncQueued: !initialCompleted,
        },
      );
    }

    return { backfilled, initialQueued };
  }

  async runScheduledSyncs(): Promise<{ processed: number; skipped: number; errors: number }> {
    if (!this.isAutoSyncRuntimeEnabled()) {
      return { processed: 0, skipped: 0, errors: 0 };
    }

    await this.deps.xeroSyncService.failStaleImportJobs();
    await this.deps.xeroSyncService.resumeAbandonedImportJobs();
    await this.deps.xeroSyncService.processPendingImportJobs();

    await this.reconcileConnectedProvidersWithoutSchedules();

    const now = new Date();
    const dueSchedules = await this.deps.db.query.integrationSyncSchedules.findMany({
      where: and(
        eq(integrationSyncSchedules.enabled, true),
        isNotNull(integrationSyncSchedules.nextRunAt),
        lte(integrationSyncSchedules.nextRunAt, now),
      ),
      limit: 50,
    });

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const schedule of dueSchedules) {
      const connector = await this.deps.db.query.integrationConnectors.findFirst({
        where: and(
          eq(integrationConnectors.id, schedule.connectorId),
          eq(integrationConnectors.companyId, schedule.companyId),
        ),
      });

      if (!connector) {
        skipped += 1;
        continue;
      }

      const provider = connector.connectorKey as AutoSyncProviderKey;
      const catalog = AUTO_SYNC_PROVIDER_CATALOG.find((entry) => entry.key === provider);

      if (!catalog || catalog.implementation === 'stub') {
        skipped += 1;
        continue;
      }

      if (!this.isProviderSyncEnabled(provider)) {
        skipped += 1;
        continue;
      }

      const connectorConfig = (connector.config ?? {}) as AutoSyncConnectorConfig;
      const nextRetryAt = connectorConfig.autoSync?.nextRetryAt
        ? new Date(connectorConfig.autoSync.nextRetryAt)
        : null;

      if (nextRetryAt && nextRetryAt > now) {
        skipped += 1;
        continue;
      }

      try {
        await this.runProviderSync({
          companyId: schedule.companyId,
          provider,
          trigger: 'incremental',
        });
        processed += 1;

        await this.deps.db
          .update(integrationSyncSchedules)
          .set({
            lastRunAt: now,
            nextRunAt: new Date(now.getTime() + schedule.frequencyMinutes * 60_000),
            updatedAt: now,
          })
          .where(eq(integrationSyncSchedules.id, schedule.id));
      } catch (error) {
        errors += 1;
        console.error('[integration-sync-orchestrator] Scheduled sync failed', {
          companyId: schedule.companyId,
          provider,
          error,
        });
      }
    }

    return { processed, skipped, errors };
  }

  async runProviderSync(input: RunSyncInput): Promise<IntegrationAutoSyncRunResult> {
    const lockKey = `${input.companyId}:${input.provider}`;
    const existing = this.inflight.get(lockKey);

    if (existing) {
      return existing;
    }

    const promise = this.executeProviderSync(input).finally(() => {
      this.inflight.delete(lockKey);
    });

    this.inflight.set(lockKey, promise);
    return promise;
  }

  async getProviderSyncStatus(
    companyId: string,
    provider: AutoSyncProviderKey,
  ): Promise<IntegrationProviderAutoSyncStatus> {
    const statuses = await this.getAllProviderSyncStatuses(companyId);
    const match = statuses.find((entry) => entry.provider === provider);

    if (!match) {
      throw new IntegrationSyncOrchestratorError('NOT_FOUND', `Unknown provider ${provider}`);
    }

    return match;
  }

  async getAllProviderSyncStatuses(companyId: string): Promise<IntegrationProviderAutoSyncStatus[]> {
    await this.deps.connectorEngine.ensureConnectors(companyId);

    const [connectors, connections, whatsapp, aiRows, activeJobs] = await Promise.all([
      this.deps.db.query.integrationConnectors.findMany({
        where: eq(integrationConnectors.companyId, companyId),
      }),
      this.deps.db.query.integrationConnections.findMany({
        where: eq(integrationConnections.companyId, companyId),
      }),
      this.deps.db.query.whatsappConnections.findFirst({
        where: eq(whatsappConnections.companyId, companyId),
      }),
      this.deps.db.query.aiProviders.findMany({
        where: eq(aiProviders.companyId, companyId),
      }),
      this.deps.db.query.integrationSyncJobs.findMany({
        where: and(
          eq(integrationSyncJobs.companyId, companyId),
          inArray(integrationSyncJobs.status, ['pending', 'running']),
        ),
      }),
    ]);

    const schedules = await this.deps.db.query.integrationSyncSchedules.findMany({
      where: eq(integrationSyncSchedules.companyId, companyId),
    });

    const connectorByKey = new Map(connectors.map((row) => [row.connectorKey, row]));
    const connectionByProvider = new Map(connections.map((row) => [row.provider, row]));
    const scheduleByConnector = new Map(schedules.map((row) => [row.connectorId, row]));
    const activeJobProviders = new Set(activeJobs.map((job) => job.provider));

    return AUTO_SYNC_PROVIDER_CATALOG.map((catalog) => {
      const connector = connectorByKey.get(catalog.key);
      const connectorConfig = (connector?.config ?? {}) as AutoSyncConnectorConfig;
      const autoSyncMeta = connectorConfig.autoSync ?? {};
      const schedule = connector ? scheduleByConnector.get(connector.id) : undefined;

      let connectionStatus: IntegrationProviderAutoSyncStatus['connectionStatus'] = 'disconnected';
      let lastError = connector?.lastError ?? autoSyncMeta.lastError ?? null;
      let reconnectRequired = false;
      let authExpired = false;

      if (catalog.key === 'whatsapp') {
        connectionStatus = whatsapp?.status ?? 'disconnected';
        lastError = whatsapp?.lastError ?? lastError;
      } else if (catalog.key === 'openai' || catalog.key === 'gemini') {
        const providerKey = catalog.key === 'gemini' ? 'google_gemini' : 'openai';
        const aiRow = aiRows.find((row) => row.providerKey === providerKey);
        connectionStatus =
          aiRow?.status === 'active'
            ? 'connected'
            : aiRow?.status === 'degraded'
              ? 'error'
              : 'disconnected';
        lastError =
          aiRow?.healthStatus === 'unhealthy'
            ? 'AI provider health check reported unhealthy'
            : lastError;
      } else if (catalog.integrationProvider) {
        const connection = connectionByProvider.get(catalog.integrationProvider);
        connectionStatus = connection?.status ?? 'disconnected';
        lastError = connection?.lastError ?? lastError;

        if (catalog.key === 'xero' && connection) {
          reconnectRequired =
            connection.status === 'error' ||
            Boolean(lastError?.toLowerCase().includes('reconnect'));
          authExpired = Boolean(
            lastError?.toLowerCase().includes('expired') ||
              lastError?.toLowerCase().includes('token'),
          );
        }
      }

      const syncInProgress =
        this.inflight.has(`${companyId}:${catalog.key}`) ||
        (catalog.integrationProvider
          ? activeJobProviders.has(catalog.integrationProvider)
          : false);

      const hasSuccessfulSync = Boolean(
        autoSyncMeta.initialSyncCompleted ||
          connector?.lastSyncAt ||
          autoSyncMeta.lastSuccessAt,
      );

      const consecutiveFailures = autoSyncMeta.consecutiveFailures ?? 0;
      const uiState = deriveIntegrationAutoSyncUiState({
        implementation: catalog.implementation,
        connectionStatus,
        syncInProgress,
        hasSuccessfulSync,
        consecutiveFailures,
        lastError,
        reconnectRequired,
        authExpired,
        providerUnavailable: catalog.implementation === 'stub',
        autoSyncEnabled: schedule?.enabled ?? false,
      });

      const retryAt = autoSyncMeta.nextRetryAt ?? null;
      const retryStatus = syncInProgress
        ? 'in_progress'
        : retryAt
          ? consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
            ? 'exhausted'
            : 'scheduled'
          : 'idle';

      const lastSuccessfulSyncAt =
        autoSyncMeta.lastSuccessAt ??
        connector?.lastSyncAt?.toISOString() ??
        null;

      return {
        provider: catalog.key,
        integrationProvider: catalog.integrationProvider,
        displayName: catalog.displayName,
        implementation: catalog.implementation,
        uiState,
        uiStateLabel: AUTO_SYNC_UI_STATE_LABELS[uiState],
        connectionStatus,
        autoSyncEnabled: Boolean(schedule?.enabled),
        lastSuccessfulSyncAt,
        lastAttemptedSyncAt: autoSyncMeta.lastAttemptAt ?? null,
        nextScheduledSyncAt: schedule?.nextRunAt?.toISOString() ?? null,
        recordsProcessed: autoSyncMeta.lastRecordsProcessed ?? null,
        failureCount: consecutiveFailures,
        consecutiveFailures,
        retryStatus,
        retryAt,
        scopeProblems: authExpired ? ['OAuth token expired or invalid'] : [],
        lastError,
        correctiveAction: formatAutoSyncCorrectiveAction(uiState, catalog.displayName),
        syncInProgress,
        connectorId: connector?.id ?? null,
      };
    });
  }

  async ensureDefaultSchedule(companyId: string, provider: AutoSyncProviderKey): Promise<void> {
    const intervalMinutes = AUTO_SYNC_DEFAULT_INTERVAL_MINUTES[provider];
    const catalog = AUTO_SYNC_PROVIDER_CATALOG.find((entry) => entry.key === provider);

    if (!intervalMinutes || !catalog || catalog.implementation === 'stub') {
      return;
    }

    await this.deps.connectorEngine.ensureConnectors(companyId);
    const connectors = await this.deps.connectorEngine.listConnectors(companyId, {
      refreshStatus: false,
    });
    const connector = connectors.find((row) => row.connectorKey === provider);

    if (!connector) {
      return;
    }

    const existing = await this.deps.db.query.integrationSyncSchedules.findFirst({
      where: and(
        eq(integrationSyncSchedules.companyId, companyId),
        eq(integrationSyncSchedules.connectorId, connector.id),
      ),
    });

    if (existing) {
      if (!existing.enabled) {
        await this.deps.db
          .update(integrationSyncSchedules)
          .set({
            enabled: true,
            frequencyMinutes: intervalMinutes,
            nextRunAt: new Date(Date.now() + intervalMinutes * 60_000),
            updatedAt: new Date(),
          })
          .where(eq(integrationSyncSchedules.id, existing.id));
      }
      return;
    }

    await this.deps.db.insert(integrationSyncSchedules).values({
      companyId,
      connectorId: connector.id,
      syncScope: 'incremental',
      frequencyMinutes: intervalMinutes,
      enabled: true,
      nextRunAt: new Date(Date.now() + intervalMinutes * 60_000),
    });
  }

  private async executeProviderSync(input: RunSyncInput): Promise<IntegrationAutoSyncRunResult> {
    const catalog = AUTO_SYNC_PROVIDER_CATALOG.find((entry) => entry.key === input.provider);

    if (!catalog) {
      throw new IntegrationSyncOrchestratorError('UNKNOWN_PROVIDER', `Unknown provider ${input.provider}`);
    }

    if (catalog.implementation === 'stub') {
      return {
        provider: input.provider,
        trigger: input.trigger,
        success: false,
        syncJobId: null,
        recordsProcessed: 0,
        message: `${catalog.displayName} auto-sync is not implemented.`,
        errorCode: 'NOT_IMPLEMENTED',
      };
    }

    const idempotencyKey = this.buildIdempotencyKey(input);
    const duplicate = await this.findRecentDuplicateJob(input.companyId, input.provider, idempotencyKey);

    if (duplicate) {
      return {
        provider: input.provider,
        trigger: input.trigger,
        success: duplicate.status === 'completed',
        syncJobId: duplicate.id,
        recordsProcessed: 0,
        message: 'Duplicate sync suppressed by idempotency guard.',
        errorCode: null,
      };
    }

    await this.updateConnectorAttemptMeta(input.companyId, input.provider, {
      lastAttemptAt: new Date().toISOString(),
    });

    if (input.provider === 'xero' && this.deps.xeroRateBudgetService) {
      const priority =
        input.trigger === 'initial'
          ? 'historical_import'
          : input.trigger === 'manual'
            ? 'incremental_refresh'
            : 'background_sync';
      if (!(await this.deps.xeroRateBudgetService.canStartWork(input.companyId, priority))) {
        return {
          provider: 'xero',
          trigger: input.trigger,
          success: false,
          syncJobId: null,
          recordsProcessed: 0,
          message: 'Xero sync deferred — tenant rate budget or proof pause active.',
          errorCode: 'RATE_BUDGET_DEFERRED',
          queued: false,
        };
      }
    }

    try {
      const result = await this.dispatchProviderSync(input, idempotencyKey);

      if (!result.queued) {
        await this.updateConnectorOutcomeMeta(input.companyId, input.provider, {
          success: result.success,
          recordsProcessed: result.recordsProcessed,
          message: result.message,
          initialSyncCompleted: input.trigger === 'initial' ? result.success : undefined,
        });
      }

      await this.recordAudit(
        input.companyId,
        input.userId,
        result.queued
          ? 'integration_auto_sync_queued'
          : result.success
            ? 'integration_auto_sync_completed'
            : 'integration_auto_sync_failed',
        {
          provider: input.provider,
          trigger: input.trigger,
          syncJobId: result.syncJobId,
          recordsProcessed: result.recordsProcessed,
          message: result.message,
          idempotencyKey,
          queued: result.queued ?? false,
        },
      );

      invalidateIntegrationReadCaches(input.companyId);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Auto-sync failed';
      await this.updateConnectorOutcomeMeta(input.companyId, input.provider, {
        success: false,
        recordsProcessed: 0,
        message,
      });

      await this.recordAudit(input.companyId, input.userId, 'integration_auto_sync_failed', {
        provider: input.provider,
        trigger: input.trigger,
        message,
        idempotencyKey,
      });

      invalidateIntegrationReadCaches(input.companyId);

      return {
        provider: input.provider,
        trigger: input.trigger,
        success: false,
        syncJobId: null,
        recordsProcessed: 0,
        message,
        errorCode: error instanceof IntegrationSyncOrchestratorError ? error.code : 'SYNC_FAILED',
      };
    }
  }

  private async dispatchProviderSync(
    input: RunSyncInput,
    idempotencyKey: string,
  ): Promise<IntegrationAutoSyncRunResult> {
    const jobType = input.trigger === 'manual' ? 'manual' : 'scheduled';

    switch (input.provider) {
      case 'xero': {
        if (input.trigger !== 'manual') {
          await this.deps.xeroOAuthService.ensureFreshAccessToken(input.companyId);
        }

        const queued = await this.deps.xeroSyncService.enqueueImportSync(
          input.companyId,
          input.userId,
          {
            jobType,
            trigger: input.trigger,
            idempotencyKey,
          },
        );

        return {
          provider: 'xero',
          trigger: input.trigger,
          success: true,
          syncJobId: queued.jobId,
          recordsProcessed: 0,
          message: queued.message,
          errorCode: null,
          queued: true,
          details: { jobId: queued.jobId, status: queued.status },
        };
      }
      case 'cartrack': {
        const syncResult = await this.deps.integrationsService.syncCartrack(input.companyId);
        const recordsProcessed =
          syncResult.externalVehicleCount + syncResult.positionsStored + syncResult.mappingsCreated;

        return {
          provider: 'cartrack',
          trigger: input.trigger,
          success: true,
          syncJobId: syncResult.syncJobId ?? null,
          recordsProcessed,
          message: `Cartrack sync completed — ${syncResult.externalVehicleCount} vehicles, ${syncResult.positionsStored} positions.`,
          errorCode: null,
        };
      }
      case 'email': {
        const syncResult = await this.deps.businessIntegrationsService.syncEmail(input.companyId);
        return {
          provider: 'email',
          trigger: input.trigger,
          success: true,
          syncJobId: syncResult.syncJobId ?? null,
          recordsProcessed: 1,
          message: `Email verified for ${syncResult.fromEmail}.`,
          errorCode: null,
        };
      }
      case 'yoco': {
        const syncResult = await this.deps.businessIntegrationsService.syncYoco(input.companyId);
        return {
          provider: 'yoco',
          trigger: input.trigger,
          success: true,
          syncJobId: syncResult.syncJobId ?? null,
          recordsProcessed: 1,
          message: `Yoco profile synced for ${syncResult.businessName}.`,
          errorCode: null,
        };
      }
      default:
        return {
          provider: input.provider,
          trigger: input.trigger,
          success: false,
          syncJobId: null,
          recordsProcessed: 0,
          message: `${input.provider} auto-sync adapter is partial/stub — no live sync executed.`,
          errorCode: 'NOT_IMPLEMENTED',
        };
    }
  }

  private buildIdempotencyKey(input: RunSyncInput): string {
    const bucket = Math.floor(Date.now() / (5 * 60_000));
    return createHash('sha256')
      .update(`${input.companyId}:${input.provider}:${input.trigger}:${bucket}`)
      .digest('hex')
      .slice(0, 24);
  }

  private async findRecentDuplicateJob(
    companyId: string,
    provider: AutoSyncProviderKey,
    idempotencyKey: string,
  ) {
    const catalog = AUTO_SYNC_PROVIDER_CATALOG.find((entry) => entry.key === provider);
    if (!catalog?.integrationProvider) {
      return null;
    }

    const rows = await this.deps.db.query.integrationSyncJobs.findMany({
      where: and(
        eq(integrationSyncJobs.companyId, companyId),
        eq(integrationSyncJobs.provider, catalog.integrationProvider),
        inArray(integrationSyncJobs.status, ['pending', 'running', 'completed']),
      ),
      orderBy: [desc(integrationSyncJobs.startedAt)],
      limit: 3,
    });

    return (
      rows.find((row) => {
        const summary = row.resultSummary as Record<string, unknown> | null;
        return summary?.idempotencyKey === idempotencyKey;
      }) ?? null
    );
  }

  private async updateConnectorAttemptMeta(
    companyId: string,
    provider: AutoSyncProviderKey,
    patch: { lastAttemptAt: string },
  ): Promise<void> {
    const connector = await this.deps.db.query.integrationConnectors.findFirst({
      where: and(
        eq(integrationConnectors.companyId, companyId),
        eq(integrationConnectors.connectorKey, provider),
      ),
    });

    if (!connector) {
      return;
    }

    const config = (connector.config ?? {}) as AutoSyncConnectorConfig;
    await this.deps.db
      .update(integrationConnectors)
      .set({
        config: {
          ...config,
          autoSync: {
            ...config.autoSync,
            lastAttemptAt: patch.lastAttemptAt,
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(integrationConnectors.id, connector.id));
  }

  private async updateConnectorOutcomeMeta(
    companyId: string,
    provider: AutoSyncProviderKey,
    input: {
      success: boolean;
      recordsProcessed: number;
      message: string;
      initialSyncCompleted?: boolean;
    },
  ): Promise<void> {
    const connector = await this.deps.db.query.integrationConnectors.findFirst({
      where: and(
        eq(integrationConnectors.companyId, companyId),
        eq(integrationConnectors.connectorKey, provider),
      ),
    });

    if (!connector) {
      return;
    }

    const config = (connector.config ?? {}) as AutoSyncConnectorConfig;
    const previousFailures = config.autoSync?.consecutiveFailures ?? 0;
    const consecutiveFailures = input.success ? 0 : previousFailures + 1;
    const backoffMinutes = Math.min(
      MAX_BACKOFF_MINUTES,
      Math.max(5, 5 * 2 ** Math.min(consecutiveFailures, 6)),
    );

    await this.deps.db
      .update(integrationConnectors)
      .set({
        lastSyncAt: input.success ? new Date() : connector.lastSyncAt,
        lastError: input.success ? null : input.message,
        config: {
          ...config,
          autoSync: {
            ...config.autoSync,
            consecutiveFailures,
            lastRecordsProcessed: input.recordsProcessed,
            lastError: input.success ? null : input.message,
            lastSuccessAt: input.success ? new Date().toISOString() : config.autoSync?.lastSuccessAt,
            initialSyncCompleted:
              input.initialSyncCompleted ?? config.autoSync?.initialSyncCompleted ?? input.success,
            nextRetryAt: input.success
              ? null
              : new Date(Date.now() + backoffMinutes * 60_000).toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(integrationConnectors.id, connector.id));
  }

  async handleXeroImportJobSettled(input: {
    companyId: string;
    trigger?: IntegrationSyncTrigger;
    result: import('./xero-sync.service.js').XeroImportJobSettledInput['result'];
  }): Promise<void> {
    const recordsProcessed =
      input.result.contacts.pulledCount +
      input.result.invoices.pulledCount +
      input.result.payments.pulledCount +
      input.result.bankTransactions.pulledCount;

    await this.updateConnectorOutcomeMeta(input.companyId, 'xero', {
      success: input.result.success,
      recordsProcessed,
      message: input.result.message,
      initialSyncCompleted:
        input.trigger === 'initial' && input.result.success ? true : undefined,
    });
  }

  async hasCustomerValueMetricsRefreshedForJob(
    companyId: string,
    syncJobId: string,
  ): Promise<boolean> {
    const connector = await this.deps.db.query.integrationConnectors.findFirst({
      where: and(
        eq(integrationConnectors.companyId, companyId),
        eq(integrationConnectors.connectorKey, 'xero'),
      ),
    });
    if (!connector) return false;
    const config = (connector.config ?? {}) as AutoSyncConnectorConfig;
    return config.autoSync?.cvMetricsRefreshJobId === syncJobId;
  }

  async markCustomerValueMetricsRefreshed(
    companyId: string,
    syncJobId: string,
  ): Promise<void> {
    const connector = await this.deps.db.query.integrationConnectors.findFirst({
      where: and(
        eq(integrationConnectors.companyId, companyId),
        eq(integrationConnectors.connectorKey, 'xero'),
      ),
    });
    if (!connector) return;

    const config = (connector.config ?? {}) as AutoSyncConnectorConfig;
    await this.deps.db
      .update(integrationConnectors)
      .set({
        config: {
          ...config,
          autoSync: {
            ...config.autoSync,
            cvMetricsRefreshAt: new Date().toISOString(),
            cvMetricsRefreshJobId: syncJobId,
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(integrationConnectors.id, connector.id));
  }

  async hasTwoWayReadVerifyQueuedForJob(
    companyId: string,
    syncJobId: string,
  ): Promise<boolean> {
    const connector = await this.deps.db.query.integrationConnectors.findFirst({
      where: and(
        eq(integrationConnectors.companyId, companyId),
        eq(integrationConnectors.connectorKey, 'xero'),
      ),
    });
    if (!connector) return false;
    const config = (connector.config ?? {}) as AutoSyncConnectorConfig;
    return config.autoSync?.twoWayReadVerifyJobId === syncJobId;
  }

  async markTwoWayReadVerifyQueued(companyId: string, syncJobId: string): Promise<void> {
    const connector = await this.deps.db.query.integrationConnectors.findFirst({
      where: and(
        eq(integrationConnectors.companyId, companyId),
        eq(integrationConnectors.connectorKey, 'xero'),
      ),
    });
    if (!connector) return;

    const config = (connector.config ?? {}) as AutoSyncConnectorConfig;
    await this.deps.db
      .update(integrationConnectors)
      .set({
        config: {
          ...config,
          autoSync: {
            ...config.autoSync,
            twoWayReadVerifyJobId: syncJobId,
            twoWayReadVerifyQueuedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(integrationConnectors.id, connector.id));
  }

  /**
   * Scheduler-tick fallback: refresh CV metrics once after Xero import completes
   * when the settled hook did not run (e.g. API restart during import).
   */
  async refreshPendingCustomerValueMetrics(
    customerValueService: import('./customer-value-classification.service.js').CustomerValueClassificationService,
  ): Promise<number> {
    const connections = await this.deps.db
      .select({
        companyId: integrationConnections.companyId,
        lastSyncAt: integrationConnections.lastSyncAt,
      })
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.provider, 'xero'),
          isNotNull(integrationConnections.lastSyncAt),
        ),
      );

    let refreshed = 0;

    for (const connection of connections) {
      const activeImport = await this.deps.db
        .select({ id: integrationSyncJobs.id })
        .from(integrationSyncJobs)
        .where(
          and(
            eq(integrationSyncJobs.companyId, connection.companyId),
            eq(integrationSyncJobs.provider, 'xero'),
            eq(integrationSyncJobs.syncScope, 'import'),
            inArray(integrationSyncJobs.status, ['pending', 'running']),
          ),
        )
        .limit(1);

      if (activeImport.length > 0) continue;

      const latestCompleted = await this.deps.db
        .select({ id: integrationSyncJobs.id })
        .from(integrationSyncJobs)
        .where(
          and(
            eq(integrationSyncJobs.companyId, connection.companyId),
            eq(integrationSyncJobs.provider, 'xero'),
            eq(integrationSyncJobs.syncScope, 'import'),
            eq(integrationSyncJobs.status, 'completed'),
          ),
        )
        .orderBy(desc(integrationSyncJobs.completedAt))
        .limit(1);

      const latestJobId = latestCompleted[0]?.id;
      if (!latestJobId) continue;

      const alreadyRefreshed = await this.hasCustomerValueMetricsRefreshedForJob(
        connection.companyId,
        latestJobId,
      );
      if (alreadyRefreshed) continue;

      await customerValueService.refreshValueMetrics(connection.companyId);
      await this.markCustomerValueMetricsRefreshed(connection.companyId, latestJobId);
      refreshed += 1;
    }

    return refreshed;
  }

  private async recordAudit(
    companyId: string,
    userId: string | undefined,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (!userId) {
      return;
    }
    await this.deps.db.insert(securityAuditLogs).values({
      companyId,
      userId,
      category: 'integrations',
      action,
      entityType: 'integration_connector',
      metadata,
    });
  }
}
