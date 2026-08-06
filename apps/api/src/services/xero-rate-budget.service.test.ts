import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseXeroRateBudgetHeaders,
  XeroRateBudgetService,
} from './xero-rate-budget.service.js';

test('parseXeroRateBudgetHeaders extracts limit and retry headers', () => {
  const headers = new Headers({
    'X-MinLimit-Remaining': '42',
    'X-DayLimit-Remaining': '4500',
    'X-AppMinLimit-Remaining': '9500',
    'Retry-After': '30',
    'Xero-Correlation-Id': 'corr-123',
    Date: 'Thu, 06 Aug 2026 19:00:00 GMT',
  });

  const parsed = parseXeroRateBudgetHeaders(headers);
  assert.equal(parsed.minLimitRemaining, 42);
  assert.equal(parsed.dayLimitRemaining, 4500);
  assert.equal(parsed.retryAfterSeconds, 30);
  assert.equal(parsed.correlationId, 'corr-123');
  assert.equal(parsed.responseDate, 'Thu, 06 Aug 2026 19:00:00 GMT');
});

test('XeroRateBudgetService priority ranks owner proof above background sync', () => {
  const service = XeroRateBudgetService.create({} as never);
  assert.ok(service.priorityRank('owner_proof_read') < service.priorityRank('background_sync'));
  assert.ok(service.priorityRank('webhook_targeted_refresh') < service.priorityRank('owner_proof_read'));
});
