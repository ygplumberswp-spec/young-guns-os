import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { liveUpdatesManager } from './live-updates.js';

function mockResponse(): Response & { chunks: string[]; emitter: EventEmitter } {
  const emitter = new EventEmitter();
  const chunks: string[] = [];
  const mock = {
    chunks,
    emitter,
    setHeader() {},
    flushHeaders() {},
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
    end() {
      emitter.emit('close');
    },
    on(event: string, handler: (...args: unknown[]) => void) {
      emitter.on(event, handler);
      return mock;
    },
  };
  return mock as unknown as Response & { chunks: string[]; emitter: EventEmitter };
}

test('broadcasts only to listeners in the same company', () => {
  liveUpdatesManager.resetForTests();
  const tenantA = mockResponse();
  const tenantB = mockResponse();
  liveUpdatesManager.subscribe('company-a', tenantA);
  liveUpdatesManager.subscribe('company-b', tenantB);

  liveUpdatesManager.broadcast({
    companyId: 'company-a',
    eventType: 'quote.created',
    entityType: 'quote',
    entityId: 'q-1',
    timestamp: Date.now(),
  });

  assert.ok(tenantA.chunks.some((chunk) => chunk.includes('company-a')));
  assert.equal(tenantB.chunks.some((chunk) => chunk.includes('company-a')), false);
});

test('tracks one connection per subscribed response', () => {
  liveUpdatesManager.resetForTests();
  const first = mockResponse();
  const second = mockResponse();
  liveUpdatesManager.subscribe('company-a', first);
  liveUpdatesManager.subscribe('company-a', second);
  assert.equal(liveUpdatesManager.getConnectionCount('company-a'), 2);
});
