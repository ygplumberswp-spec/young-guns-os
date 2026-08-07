import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeReconnectDelayMs,
  liveUpdateInvalidationPrefixes,
  parseLiveUpdateSseChunk,
} from './live-update-map.js';

test('maps finance entities to cache prefixes', () => {
  assert.deepEqual(
    liveUpdateInvalidationPrefixes({ companyId: 'c1', eventType: 'quote.created', entityType: 'quote', timestamp: 1 }),
    ['finance/quotes', 'finance/stats', 'finance/jobs'],
  );
});

test('parses SSE data chunks', () => {
  const chunk =
    'id: 1\nevent: update\ndata: {"companyId":"c1","eventType":"invoice.created","entityType":"invoice","timestamp":1}\n\n';
  const parsed = parseLiveUpdateSseChunk(chunk);
  assert.equal(parsed.events.length, 1);
  assert.equal(parsed.events[0]?.entityType, 'invoice');
});

test('applies exponential reconnect backoff with jitter cap', () => {
  assert.equal(computeReconnectDelayMs(0, () => 0), 1000);
  assert.equal(computeReconnectDelayMs(5, () => 0), 30000);
});
