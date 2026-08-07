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

test('parseXeroRateBudgetHeaders persists full long Retry-After without inline cap', () => {
  const headers = new Headers({
    'Retry-After': '4289',
    Date: 'Fri, 07 Aug 2026 06:07:50 GMT',
  });

  const parsed = parseXeroRateBudgetHeaders(headers);
  assert.equal(parsed.retryAfterSeconds, 4289);
});

test('parseXeroRateBudgetHeaders persists short Retry-After accurately', () => {
  const headers = new Headers({
    'Retry-After': '120',
    Date: 'Fri, 07 Aug 2026 06:07:50 GMT',
  });

  const parsed = parseXeroRateBudgetHeaders(headers);
  assert.equal(parsed.retryAfterSeconds, 120);
});

test('parseXeroRateBudgetHeaders leaves retryAfterSeconds null when Retry-After missing', () => {
  const parsed = parseXeroRateBudgetHeaders(new Headers({ Date: 'Fri, 07 Aug 2026 06:07:50 GMT' }));
  assert.equal(parsed.retryAfterSeconds, null);
});

test('429 recordResponse path uses response Date as retry_after_until reference', async () => {
  const inserts: Array<Record<string, unknown>> = [];
  const db = {
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        inserts.push(row);
        return {
          onConflictDoUpdate: () => Promise.resolve(),
        };
      },
    }),
    query: {
      xeroRateBudgetState: {
        findFirst: async () => null,
      },
    },
  };

  const service = XeroRateBudgetService.create(db as never);
  const responseDate = 'Fri, 07 Aug 2026 06:07:50 GMT';
  const response = new Response(null, {
    status: 429,
    headers: {
      'Retry-After': '4289',
      Date: responseDate,
      'X-DayLimit-Remaining': '0',
      'X-Rate-Limit-Problem': 'day',
    },
  });

  await service.recordResponse('095aef76-fef5-4139-af37-a42f2d7e2faf', response);

  const budgetRow = inserts.find((row) => row.retryAfterUntil instanceof Date);
  assert.ok(budgetRow?.retryAfterUntil instanceof Date);

  const expectedUntilMs = Date.parse(responseDate) + 4289 * 1000;
  const persistedUntilMs = (budgetRow!.retryAfterUntil as Date).getTime();
  assert.ok(Math.abs(persistedUntilMs - expectedUntilMs) < 1000);
});

test('XeroRateBudgetService priority ranks owner proof above background sync', () => {
  const service = XeroRateBudgetService.create({} as never);
  assert.ok(service.priorityRank('owner_proof_read') < service.priorityRank('background_sync'));
  assert.ok(service.priorityRank('webhook_targeted_refresh') < service.priorityRank('owner_proof_read'));
});
