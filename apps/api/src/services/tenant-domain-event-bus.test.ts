import test from 'node:test';
import assert from 'node:assert/strict';
import { TenantDomainEventBus } from './tenant-domain-event-bus.service.js';

test('TenantDomainEventBus deduplicates identical events within window', async () => {
  let callCount = 0;
  const db = {
    insert: () => ({
      values: async () => undefined,
    }),
  } as never;

  const bus = new TenantDomainEventBus(db);
  bus.subscribe('lead.converted', async () => {
    callCount += 1;
  });

  const event = {
    companyId: 'company-1',
    eventType: 'lead.converted' as const,
    entityType: 'lead',
    entityId: 'lead-1',
    payload: { jobId: 'job-1' },
    idempotencyKey: 'dup-key',
  };

  bus.publish(event);
  bus.publish(event);

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(callCount, 1);
});

test('TenantDomainEventBus isolates subscribers by event type', async () => {
  const seen: string[] = [];
  const db = {
    insert: () => ({
      values: async () => undefined,
    }),
  } as never;

  const bus = new TenantDomainEventBus(db);
  bus.subscribe('lead.converted', async () => {
    seen.push('lead');
  });
  bus.subscribe('job.completed', async () => {
    seen.push('job');
  });

  bus.publish({
    companyId: 'company-1',
    eventType: 'job.completed',
    entityType: 'job',
    entityId: 'job-1',
    payload: {},
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(seen, ['job']);
});
