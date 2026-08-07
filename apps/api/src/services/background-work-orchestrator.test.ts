import test from 'node:test';
import assert from 'node:assert/strict';
import { BackgroundWorkOrchestratorService } from './background-work-orchestrator.service.js';

function buildOrchestrator(overrides: Record<string, unknown> = {}) {
  return new BackgroundWorkOrchestratorService({
    integrationSyncOrchestrator: {
      runScheduledSyncs: async () => ({ processed: 1, skipped: 0, errors: 0 }),
      refreshPendingCustomerValueMetrics: async () => 0,
      getAllProviderSyncStatuses: async () => [],
      handleXeroImportJobSettled: async () => undefined,
      hasCustomerValueMetricsRefreshedForJob: async () => false,
      markCustomerValueMetricsRefreshed: async () => undefined,
      hasTwoWayReadVerifyQueuedForJob: async () => false,
      markTwoWayReadVerifyQueued: async () => undefined,
      ...(overrides.integrationSyncOrchestrator as object),
    },
    backgroundWorkQueue: {
      processPendingDomainFollowups: async () => 2,
      listActiveWork: async () => [],
      listRecentWork: async () => [],
      enqueueDomainFollowup: async (input: { workType: string }) => {
        if (overrides.enqueueDomainFollowup) {
          return (overrides.enqueueDomainFollowup as (input: { workType: string }) => Promise<string>)(input);
        }
        return 'work-1';
      },
      ...(overrides.backgroundWorkQueue as object),
    },
    domainEventBus: overrides.domainEventBus ?? {
      subscribe: () => () => undefined,
      publish: () => undefined,
    },
    xeroSyncService: {} as never,
    customerValueClassificationService: {
      refreshValueMetrics: async () => ({
        dataCompleteness: 'complete',
        totals: { customerRecords: 675, qualifyingCustomers: 3 },
        buckets: [{ classification: 'paying_customer', count: 0 }],
      }),
      ...(overrides.customerValueClassificationService as object),
    },
    ...(overrides.deps as object),
  } as never);
}

test('BackgroundWorkOrchestratorService.processTick delegates to integration scheduler', async () => {
  let syncCalls = 0;
  let queueCalls = 0;
  let cvRefreshCalls = 0;

  const orchestrator = buildOrchestrator({
    integrationSyncOrchestrator: {
      runScheduledSyncs: async () => {
        syncCalls += 1;
        return { processed: 1, skipped: 0, errors: 0 };
      },
      refreshPendingCustomerValueMetrics: async () => {
        cvRefreshCalls += 1;
        return 1;
      },
    },
    backgroundWorkQueue: {
      processPendingDomainFollowups: async () => {
        queueCalls += 1;
        return 2;
      },
    },
  });

  const result = await orchestrator.processTick();
  assert.equal(syncCalls, 1);
  assert.equal(queueCalls, 1);
  assert.equal(cvRefreshCalls, 1);
  assert.equal(result.integrationJobsProcessed, 1);
  assert.equal(result.scheduledSyncs.processed, 1);
  assert.equal(result.domainFollowupsPending, 2);
  assert.equal(result.customerValueMetricsRefreshed, 1);
});

test('BackgroundWorkOrchestratorService enqueues job completion follow-up on domain event', async () => {
  const enqueued: string[] = [];
  const bus = {
    handlers: new Map<string, Array<(event: unknown) => Promise<void>>>(),
    subscribe(eventType: string, handler: (event: unknown) => Promise<void>) {
      const list = this.handlers.get(eventType) ?? [];
      list.push(handler);
      this.handlers.set(eventType, list);
      return () => undefined;
    },
    publish() {
      /* unused */
    },
  };

  const orchestrator = buildOrchestrator({
    domainEventBus: bus,
    enqueueDomainFollowup: async (input: { workType: string }) => {
      enqueued.push(input.workType);
      return 'work-1';
    },
  });

  orchestrator.registerDomainEventHandlers();
  const handlers = bus.handlers.get('job.completed') ?? [];
  assert.equal(handlers.length, 1);

  await handlers[0]!({
    companyId: 'company-1',
    eventType: 'job.completed',
    entityType: 'job',
    entityId: 'job-1',
    payload: { customerId: 'cust-1' },
  });

  assert.deepEqual(enqueued, ['job_completion_followup']);
});

test('BackgroundWorkOrchestratorService refreshes customer value metrics on Xero import complete', async () => {
  const published: string[] = [];
  let refreshCalls = 0;
  let markCalls = 0;

  const orchestrator = buildOrchestrator({
    integrationSyncOrchestrator: {
      handleXeroImportJobSettled: async () => undefined,
      hasCustomerValueMetricsRefreshedForJob: async () => false,
      markCustomerValueMetricsRefreshed: async () => {
        markCalls += 1;
      },
      hasTwoWayReadVerifyQueuedForJob: async () => false,
      markTwoWayReadVerifyQueued: async () => undefined,
    },
    domainEventBus: {
      subscribe: () => () => undefined,
      publish: (event: { eventType: string }) => {
        published.push(event.eventType);
      },
    },
    customerValueClassificationService: {
      refreshValueMetrics: async () => {
        refreshCalls += 1;
        return {
          dataCompleteness: 'complete',
          totals: { customerRecords: 675, qualifyingCustomers: 3 },
          buckets: [{ classification: 'paying_customer', count: 0 }],
        };
      },
    },
  });

  await orchestrator.handleXeroImportJobSettled({
    companyId: 'company-1',
    syncJobId: '8e6aec9b-2d99-493c-85b8-75f61d7f414b',
    trigger: 'initial',
    result: {
      success: true,
      message: 'Import complete',
      contacts: { pulledCount: 675, failedCount: 0 },
      invoices: { pulledCount: 120, failedCount: 0 },
      payments: { pulledCount: 80, failedCount: 0 },
      bankTransactions: { pulledCount: 0, failedCount: 0 },
    },
  } as never);

  assert.equal(refreshCalls, 1);
  assert.equal(markCalls, 1);
  assert.deepEqual(published, ['xero.import.completed']);
});
