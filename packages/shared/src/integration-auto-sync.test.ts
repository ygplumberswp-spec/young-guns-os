import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveIntegrationAutoSyncUiState,
  formatAutoSyncCorrectiveAction,
} from './integration-auto-sync.js';

test('deriveIntegrationAutoSyncUiState returns not_configured for stub providers', () => {
  assert.equal(
    deriveIntegrationAutoSyncUiState({
      implementation: 'stub',
      connectionStatus: 'connected',
      syncInProgress: false,
      hasSuccessfulSync: true,
      consecutiveFailures: 0,
      lastError: null,
    }),
    'not_configured',
  );
});

test('deriveIntegrationAutoSyncUiState returns initial_sync_running when connected without prior sync', () => {
  assert.equal(
    deriveIntegrationAutoSyncUiState({
      implementation: 'full',
      connectionStatus: 'connected',
      syncInProgress: true,
      hasSuccessfulSync: false,
      consecutiveFailures: 0,
      lastError: null,
    }),
    'initial_sync_running',
  );
});

test('deriveIntegrationAutoSyncUiState returns synced after successful sync', () => {
  assert.equal(
    deriveIntegrationAutoSyncUiState({
      implementation: 'full',
      connectionStatus: 'connected',
      syncInProgress: false,
      hasSuccessfulSync: true,
      consecutiveFailures: 0,
      lastError: null,
    }),
    'synced',
  );
});

test('deriveIntegrationAutoSyncUiState returns authentication_expired when flagged', () => {
  assert.equal(
    deriveIntegrationAutoSyncUiState({
      implementation: 'full',
      connectionStatus: 'error',
      syncInProgress: false,
      hasSuccessfulSync: true,
      consecutiveFailures: 1,
      lastError: 'Token expired',
      authExpired: true,
    }),
    'authentication_expired',
  );
});

test('formatAutoSyncCorrectiveAction suggests reconnect for reconnect_required', () => {
  const action = formatAutoSyncCorrectiveAction('reconnect_required', 'Xero');
  assert.match(action ?? '', /Reconnect Xero/);
});
