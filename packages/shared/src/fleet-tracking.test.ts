import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deriveFleetConnectionDisplayState,
  deriveFleetPositionHealth,
  isFleetPositionStale,
} from './fleet-tracking.js';

describe('fleet tracking honesty', () => {
  it('marks positions older than 120s as stale', () => {
    const now = Date.parse('2026-08-02T12:00:00.000Z');
    assert.equal(isFleetPositionStale('2026-08-02T11:57:30.000Z', now), true);
    assert.equal(isFleetPositionStale('2026-08-02T11:59:00.000Z', now), false);
  });

  it('never reports live health when Cartrack is disconnected', () => {
    assert.equal(
      deriveFleetPositionHealth({
        cartrackConnected: false,
        recordedAt: new Date().toISOString(),
      }),
      'unavailable',
    );
  });

  it('reports connected/disconnected/error/stale display states honestly', () => {
    const now = Date.parse('2026-08-02T12:00:00.000Z');
    assert.equal(
      deriveFleetConnectionDisplayState({
        connectionStatus: 'connected',
        hasCredentials: true,
        lastSyncAt: '2026-08-02T11:55:00.000Z',
        nowMs: now,
      }),
      'connected',
    );
    assert.equal(
      deriveFleetConnectionDisplayState({
        connectionStatus: 'disconnected',
        hasCredentials: false,
        lastSyncAt: null,
        nowMs: now,
      }),
      'not_configured',
    );
    assert.equal(
      deriveFleetConnectionDisplayState({
        connectionStatus: 'error',
        hasCredentials: true,
        lastSyncAt: '2026-08-02T11:55:00.000Z',
        lastError: 'auth failed',
        nowMs: now,
      }),
      'error',
    );
    assert.equal(
      deriveFleetConnectionDisplayState({
        connectionStatus: 'connected',
        hasCredentials: true,
        lastSyncAt: '2026-08-02T11:00:00.000Z',
        nowMs: now,
      }),
      'stale',
    );
  });
});
