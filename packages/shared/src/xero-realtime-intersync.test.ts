import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatFinanceFreshnessLabel } from './xero-realtime-intersync.js';

describe('xero realtime intersync freshness labels', () => {
  it('shows updated just now for recent refresh', () => {
    const now = new Date('2026-08-06T12:00:00.000Z');
    const label = formatFinanceFreshnessLabel({
      state: 'current',
      lastRefreshedAt: '2026-08-06T11:59:30.000Z',
      now,
    });
    assert.equal(label, 'Updated just now');
  });

  it('shows delayed state without technical detail', () => {
    assert.equal(
      formatFinanceFreshnessLabel({ state: 'delayed', lastRefreshedAt: null }),
      'Update delayed',
    );
  });

  it('shows refreshing quietly while active', () => {
    assert.equal(
      formatFinanceFreshnessLabel({ state: 'refreshing', lastRefreshedAt: null }),
      'Refreshing quietly',
    );
  });
});
