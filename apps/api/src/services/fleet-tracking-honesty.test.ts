import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deriveFleetConnectionDisplayState,
  deriveFleetPositionHealth,
  formatFleetConnectionDisplayLabel,
  formatFleetPositionHealthLabel,
} from '@titan/shared';

describe('M3 fleet tracking honesty (API contract)', () => {
  it('disconnected without credentials is not_configured / unavailable', () => {
    assert.equal(
      deriveFleetConnectionDisplayState({
        connectionStatus: 'disconnected',
        hasCredentials: false,
        lastSyncAt: null,
      }),
      'not_configured',
    );
    assert.equal(
      deriveFleetPositionHealth({
        cartrackConnected: false,
        recordedAt: new Date().toISOString(),
      }),
      'unavailable',
    );
  });

  it('stale GPS is never labelled live', () => {
    const health = deriveFleetPositionHealth({
      cartrackConnected: true,
      recordedAt: new Date(Date.now() - 180_000).toISOString(),
    });
    assert.equal(health, 'stale');
    assert.equal(formatFleetPositionHealthLabel(health), 'Stale position');
  });

  it('formats operator-facing connection labels', () => {
    assert.equal(formatFleetConnectionDisplayLabel('connected'), 'Connected');
    assert.equal(formatFleetConnectionDisplayLabel('error'), 'Error');
    assert.equal(formatFleetConnectionDisplayLabel('stale'), 'Stale sync');
  });

  it('stale sync display blocks live-polling eligibility', () => {
    const now = Date.parse('2026-08-02T12:00:00.000Z');
    const display = deriveFleetConnectionDisplayState({
      connectionStatus: 'connected',
      hasCredentials: true,
      lastSyncAt: '2026-08-02T11:00:00.000Z',
      nowMs: now,
    });
    const livePollingAllowed = display === 'connected';
    assert.equal(display, 'stale');
    assert.equal(livePollingAllowed, false);
  });
});
