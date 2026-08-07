import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveCartrackSyncHealthForTest } from './integrations.service.test-helpers.js';

test('deriveCartrackSyncHealth marks connected integrations without errors as healthy', () => {
  assert.equal(
    deriveCartrackSyncHealthForTest({ status: 'connected', lastError: null }),
    'healthy',
  );
});

test('deriveCartrackSyncHealth preserves degraded state for connected integrations with transient errors', () => {
  assert.equal(
    deriveCartrackSyncHealthForTest({
      status: 'connected',
      lastError: 'Temporary provider timeout',
    }),
    'degraded',
  );
});
