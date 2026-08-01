import test from 'node:test';
import assert from 'node:assert/strict';
import { BackgroundWorkOrchestratorService } from './background-work-orchestrator.service.js';

test('BackgroundWorkOrchestratorService.processTick delegates to integration scheduler', async () => {
  let syncCalls = 0;
  let queueCalls = 0;

  const orchestrator = new BackgroundWorkOrchestratorService({
    integrationSyncOrchestrator: {
      runScheduledSyncs: async () => {
        syncCalls += 1;
        return { processed: 1, skipped: 0, errors: 0 };
      },
    } as never,
    backgroundWorkQueue: {
      processPendingDomainFollowups: async () => {
        queueCalls += 1;
        return 2;
      },
    } as never,
    domainEventBus: {
      subscribe: () => () => undefined,
      publish: () => undefined,
    } as never,
    xeroSyncService: {} as never,
  });

  const result = await orchestrator.processTick();
  assert.equal(syncCalls, 1);
  assert.equal(queueCalls, 1);
  assert.equal(result.integrationJobsProcessed, 1);
  assert.equal(result.scheduledSyncs.processed, 1);
  assert.equal(result.domainFollowupsPending, 2);
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

  const orchestrator = new BackgroundWorkOrchestratorService({
    integrationSyncOrchestrator: {
      getAllProviderSyncStatuses: async () => [],
    } as never,
    backgroundWorkQueue: {
      enqueueDomainFollowup: async (input: { workType: string }) => {
        enqueued.push(input.workType);
        return 'work-1';
      },
    } as never,
    domainEventBus: bus as never,
    xeroSyncService: {} as never,
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
