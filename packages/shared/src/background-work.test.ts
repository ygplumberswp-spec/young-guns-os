import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKGROUND_WORK_UI_STATE_LABELS,
  deriveBackgroundWorkUiState,
  mapIntegrationAutoSyncUiStateToBackgroundWork,
} from './background-work.js';

test('deriveBackgroundWorkUiState maps running to updating', () => {
  assert.equal(
    deriveBackgroundWorkUiState({ status: 'running', hasPartialProgress: false }),
    'updating',
  );
});

test('deriveBackgroundWorkUiState maps partial failure with retry', () => {
  assert.equal(
    deriveBackgroundWorkUiState({
      status: 'failed',
      hasPartialProgress: true,
      consecutiveFailures: 2,
      retryAt: new Date().toISOString(),
    }),
    'retry_scheduled',
  );
});

test('deriveBackgroundWorkUiState maps completed to up_to_date', () => {
  assert.equal(
    deriveBackgroundWorkUiState({
      status: 'completed',
      hasPartialProgress: true,
      lastSuccessAt: new Date().toISOString(),
    }),
    'up_to_date',
  );
});

test('mapIntegrationAutoSyncUiStateToBackgroundWork aligns labels', () => {
  assert.equal(mapIntegrationAutoSyncUiStateToBackgroundWork('synced'), 'up_to_date');
  assert.equal(
    mapIntegrationAutoSyncUiStateToBackgroundWork('initial_sync_running'),
    'updating',
  );
  assert.equal(
    mapIntegrationAutoSyncUiStateToBackgroundWork('reconnect_required'),
    'reconnect_required',
  );
});

test('BACKGROUND_WORK_UI_STATE_LABELS covers all states', () => {
  const states = [
    'up_to_date',
    'updating',
    'waiting',
    'partially_completed',
    'retry_scheduled',
    'failed',
    'reconnect_required',
    'provider_unavailable',
  ] as const;
  for (const state of states) {
    assert.ok(BACKGROUND_WORK_UI_STATE_LABELS[state].length > 0);
  }
});
