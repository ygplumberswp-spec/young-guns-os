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
});
