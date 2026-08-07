import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildImportJobProgress,
  createInitialImportJobState,
  importJobStateToSummary,
  parseImportJobState,
  XERO_IMPORT_BATCH_BUDGET_MS,
  XERO_IMPORT_LEASE_MS,
  XERO_IMPORT_PENDING_STALE_MS,
  XERO_IMPORT_STALL_THRESHOLD_MS,
} from './xero-import-job.processor.js';
import { deriveXeroImportJobUiStatus } from '@titan/shared';

test('stall threshold replaces monolithic total-duration timeout', () => {
  assert.equal(XERO_IMPORT_STALL_THRESHOLD_MS, 15 * 60_000);
  assert.equal(XERO_IMPORT_PENDING_STALE_MS, 30 * 60_000);
  assert.ok(XERO_IMPORT_BATCH_BUDGET_MS < XERO_IMPORT_STALL_THRESHOLD_MS);
  assert.ok(XERO_IMPORT_LEASE_MS < XERO_IMPORT_STALL_THRESHOLD_MS);
});

test('importJobStateToSummary preserves checkpoint on abandon metadata', () => {
  const state = createInitialImportJobState({
    checkpoint: {
      stage: 'invoices',
      contactsPage: 7,
      invoicesPage: 1,
      paymentsPage: 1,
      bankTransactionsPage: 1,
    },
  });
  state.completedStages = ['contacts'];
  state.contacts.pulledCount = 682;
  state.abandoned = true;
  state.abandonReason = 'stale_running_job';
  state.heartbeatAt = new Date().toISOString();

  const summary = importJobStateToSummary(state);
  assert.equal(summary.checkpoint && (summary.checkpoint as { stage: string }).stage, 'invoices');
  assert.equal(summary.abandoned, true);
  assert.equal((summary.contacts as { pulledCount: number }).pulledCount, 682);
});

test('parseImportJobState restores heartbeat and lease fields', () => {
  const restored = parseImportJobState({
    heartbeatAt: '2026-08-01T12:00:00.000Z',
    nextRetryAt: '2026-08-01T12:05:00.000Z',
    activity: 'rate_limited',
    processingLeaseOwner: 'worker-1',
    processingLeaseExpiresAt: '2026-08-01T12:02:00.000Z',
    resumedFromAbandoned: true,
  });

  assert.equal(restored.heartbeatAt, '2026-08-01T12:00:00.000Z');
  assert.equal(restored.activity, 'rate_limited');
  assert.equal(restored.resumedFromAbandoned, true);
});

test('deriveXeroImportJobUiStatus distinguishes resuming retrying partial waiting', () => {
  assert.deepEqual(
    deriveXeroImportJobUiStatus({
      jobStatus: 'running',
      resumedFromAbandoned: true,
    }),
    { uiStatus: 'resuming', uiStatusLabel: 'Resuming' },
  );

  assert.deepEqual(
    deriveXeroImportJobUiStatus({
      jobStatus: 'running',
      activity: 'rate_limited',
      nextRetryAt: new Date(Date.now() + 60_000).toISOString(),
    }),
    { uiStatus: 'retrying', uiStatusLabel: 'Retrying' },
  );

  assert.deepEqual(
    deriveXeroImportJobUiStatus({
      jobStatus: 'failed',
      hasPartialProgress: true,
    }),
    { uiStatus: 'partial', uiStatusLabel: 'Partial' },
  );

  assert.deepEqual(
    deriveXeroImportJobUiStatus({
      jobStatus: 'pending',
      activity: 'waiting_next_batch',
    }),
    { uiStatus: 'waiting', uiStatusLabel: 'Waiting for next batch' },
  );
});

test('buildImportJobProgress exposes checkpoint counts and ui status', () => {
  const state = createInitialImportJobState({
    checkpoint: {
      stage: 'invoices',
      contactsPage: 7,
      invoicesPage: 2,
      paymentsPage: 1,
      bankTransactionsPage: 1,
    },
  });
  state.completedStages = ['contacts'];
  state.contacts.pulledCount = 682;
  state.invoices.pulledCount = 3;
  state.resumedFromAbandoned = true;
  state.heartbeatAt = '2026-08-01T12:00:00.000Z';

  const progress = buildImportJobProgress(
    '8e6aec9b-2d99-493c-85b8-75f61d7f414b',
    'running',
    state,
    null,
    null,
    'running',
  );

  assert.equal(progress.uiStatus, 'resuming');
  assert.equal(progress.checkpoint.invoicesPage, 2);
  assert.equal(progress.processedCount, 685);
  assert.equal(progress.heartbeatAt, '2026-08-01T12:00:00.000Z');
});
