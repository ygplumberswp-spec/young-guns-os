import test from 'node:test';
import assert from 'node:assert/strict';
import { IntegrationSyncOrchestratorService } from './integration-sync-orchestrator.service.js';

test('IntegrationSyncOrchestratorService deduplicates concurrent runs per tenant+provider', async () => {
  let runCount = 0;
  const orchestrator = new IntegrationSyncOrchestratorService({
    db: {
      query: {
        integrationSyncJobs: { findMany: async () => [] },
        integrationConnectors: { findFirst: async () => null },
        integrationConnections: { findMany: async () => [] },
        whatsappConnections: { findFirst: async () => null },
        aiProviders: { findMany: async () => [] },
        integrationSyncSchedules: { findMany: async () => [] },
      },
      insert: async () => undefined,
      update: async () => undefined,
    } as never,
    runtime: {
      providersEnabled: true,
      xeroSyncEnabled: true,
    } as never,
    connectorEngine: {
      ensureConnectors: async () => undefined,
      listConnectors: async () => [],
    } as never,
    xeroSyncService: {
      enqueueImportSync: async () => ({
        jobId: 'job-1',
        status: 'queued' as const,
        message: 'queued',
      }),
      failStaleImportJobs: async () => 0,
      resumeAbandonedImportJobs: async () => 0,
      processPendingImportJobs: async () => 0,
    } as never,
    xeroOAuthService: {
      ensureFreshAccessToken: async () => 'token',
    } as never,
    integrationsService: {} as never,
    businessIntegrationsService: {} as never,
  });

  const [first, second] = await Promise.all([
    orchestrator.runProviderSync({
      companyId: 'company-1',
      provider: 'xero',
      trigger: 'manual',
    }),
    orchestrator.runProviderSync({
      companyId: 'company-1',
      provider: 'xero',
      trigger: 'manual',
    }),
  ]);

  assert.equal(runCount, 0);
  assert.equal(first.success, true);
  assert.equal(first.queued, true);
  assert.equal(second.success, true);
  assert.equal(second.queued, true);
});

test('IntegrationSyncOrchestratorService returns honest stub result for meta provider', async () => {
  const orchestrator = new IntegrationSyncOrchestratorService({
    db: {
      query: {
        integrationSyncJobs: { findMany: async () => [] },
        integrationConnectors: { findFirst: async () => null },
      },
    } as never,
    runtime: { providersEnabled: true, xeroSyncEnabled: true } as never,
    connectorEngine: { ensureConnectors: async () => undefined, listConnectors: async () => [] } as never,
    xeroSyncService: {} as never,
    xeroOAuthService: {} as never,
    integrationsService: {} as never,
    businessIntegrationsService: {} as never,
  });

  const result = await orchestrator.runProviderSync({
    companyId: 'company-1',
    provider: 'meta',
    trigger: 'incremental',
  });

  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'NOT_IMPLEMENTED');
});

test('IntegrationSyncOrchestratorService backfills schedule for connected tenant missing schedule', async () => {
  let scheduleInserted = false;
  let initialSyncTriggered = false;

  const orchestrator = new IntegrationSyncOrchestratorService({
    db: {
      query: {
        integrationConnections: {
          findMany: async () => [
            {
              companyId: 'company-xero',
              provider: 'xero',
              status: 'connected',
            },
          ],
        },
        integrationSyncSchedules: {
          findFirst: async () => null,
          findMany: async () => [],
        },
        integrationSyncJobs: { findMany: async () => [] },
        integrationConnectors: { findFirst: async () => null },
        whatsappConnections: { findFirst: async () => null },
        aiProviders: { findMany: async () => [] },
      },
      insert: () => ({
        values: async () => {
          scheduleInserted = true;
        },
      }),
      update: async () => undefined,
    } as never,
    runtime: {
      providersEnabled: true,
      xeroSyncEnabled: true,
    } as never,
    connectorEngine: {
      ensureConnectors: async () => undefined,
      listConnectors: async () => [
        {
          id: 'connector-xero',
          connectorKey: 'xero',
          companyId: 'company-xero',
          config: {},
        },
      ],
    } as never,
    xeroSyncService: {
      enqueueImportSync: async () => {
        initialSyncTriggered = true;
        return {
          jobId: 'job-xero',
          status: 'queued' as const,
          message: 'queued',
        };
      },
      processPendingImportJobs: async () => 0,
    } as never,
    xeroOAuthService: {
      ensureFreshAccessToken: async () => 'token',
    } as never,
    integrationsService: {} as never,
    businessIntegrationsService: {} as never,
  });

  const result = await orchestrator.reconcileConnectedProvidersWithoutSchedules();

  assert.equal(result.backfilled, 1);
  assert.equal(result.initialQueued, 1);
  assert.equal(scheduleInserted, true);

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(initialSyncTriggered, true);
});

test('IntegrationSyncOrchestratorService preserves cvMetricsRefreshJobId when updating outcome meta', async () => {
  let connectorConfig: Record<string, unknown> = {
    autoSync: {
      cvMetricsRefreshJobId: '8e6aec9b-2d99-493c-85b8-75f61d7f414b',
      cvMetricsRefreshAt: '2026-08-01T17:37:22.876Z',
    },
  };

  const orchestrator = new IntegrationSyncOrchestratorService({
    db: {
      query: {
        integrationConnectors: {
          findFirst: async () => ({
            id: 'connector-xero',
            companyId: 'company-xero',
            connectorKey: 'xero',
            config: connectorConfig,
            lastSyncAt: null,
          }),
        },
      },
      update: (_table: unknown) => ({
        set: (patch: { config: Record<string, unknown> }) => ({
          where: async () => {
            connectorConfig = patch.config;
          },
        }),
      }),
    } as never,
    runtime: { providersEnabled: true, xeroSyncEnabled: true } as never,
    connectorEngine: { ensureConnectors: async () => undefined, listConnectors: async () => [] } as never,
    xeroSyncService: {} as never,
    xeroOAuthService: {} as never,
    integrationsService: {} as never,
    businessIntegrationsService: {} as never,
  });

  await orchestrator.handleXeroImportJobSettled({
    companyId: 'company-xero',
    trigger: 'initial',
    result: {
      success: true,
      message: 'Import complete',
      contacts: { pulledCount: 675, failedCount: 0, skippedCount: 0 },
      invoices: { pulledCount: 5, failedCount: 0, skippedCount: 0 },
      payments: { pulledCount: 0, failedCount: 0, skippedCount: 0 },
      bankTransactions: { pulledCount: 3078, failedCount: 0, skippedCount: 0 },
    },
  } as never);

  const autoSync = (connectorConfig.autoSync ?? {}) as Record<string, unknown>;
  assert.equal(autoSync.cvMetricsRefreshJobId, '8e6aec9b-2d99-493c-85b8-75f61d7f414b');
  assert.equal(autoSync.cvMetricsRefreshAt, '2026-08-01T17:37:22.876Z');
  assert.equal(autoSync.lastRecordsProcessed, 3758);
});
