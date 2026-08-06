import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  requiresOwnerActionToRetry,
  XERO_OWNER_ACTION_ERROR_CODES,
} from './xero-import-job.shared.js';
import {
  createInitialImportJobState,
  importJobStateToSummary,
  parseImportJobState,
} from './xero-import-job.processor.js';

const SYNC_SERVICE_SOURCE = readFileSync(
  new URL('./xero-sync.service.ts', import.meta.url),
  'utf8',
);

// --- Which failures a retry can actually clear ---

test('a rejected grant needs the Owner, a throttle or timeout does not', () => {
  assert.equal(requiresOwnerActionToRetry('AUTH_FAILED'), true);
  assert.equal(requiresOwnerActionToRetry('CONFIG_ERROR'), true);

  for (const recoverable of ['RATE_LIMIT', 'TIMEOUT', 'NETWORK_ERROR', 'API_ERROR']) {
    assert.equal(requiresOwnerActionToRetry(recoverable), false, recoverable);
  }

  assert.equal(requiresOwnerActionToRetry(null), false);
  assert.equal(requiresOwnerActionToRetry(undefined), false);
});

test('the owner-action code set stays narrow', () => {
  assert.deepEqual([...XERO_OWNER_ACTION_ERROR_CODES].sort(), ['AUTH_FAILED', 'CONFIG_ERROR']);
});

// --- The code survives the job row, so a later tick can tell why the stage failed ---

test('stageErrorCode round-trips through the persisted job summary', () => {
  const state = createInitialImportJobState();
  assert.equal(state.stageErrorCode, null);

  state.checkpoint.stage = 'attachments';
  state.failedStage = 'attachments';
  state.stageError = 'Xero rejected the request. Verify the tenant ID and granted scopes.';
  state.stageErrorCode = 'AUTH_FAILED';

  const restored = parseImportJobState(importJobStateToSummary(state));

  assert.equal(restored.stageErrorCode, 'AUTH_FAILED');
  assert.equal(restored.failedStage, 'attachments');
  assert.equal(requiresOwnerActionToRetry(restored.stageErrorCode), true);
});

test('a job summary written before stageErrorCode existed parses as no code, so it still auto-resumes', () => {
  const legacy = importJobStateToSummary(createInitialImportJobState());
  delete legacy.stageErrorCode;

  const restored = parseImportJobState(legacy);

  assert.equal(restored.stageErrorCode, null);
  assert.equal(requiresOwnerActionToRetry(restored.stageErrorCode), false);
});

// --- The two call sites the fix depends on ---

test('an attachment scope rejection fails the stage instead of one failure per parent record', () => {
  const attachmentCatch = SYNC_SERVICE_SOURCE.slice(
    SYNC_SERVICE_SOURCE.indexOf('private async importAttachmentBatch'),
    SYNC_SERVICE_SOURCE.indexOf('private async loadAttachmentParents'),
  );

  assert.ok(attachmentCatch.length > 0, 'importAttachmentBatch not found');

  const rethrowIndex = attachmentCatch.indexOf(
    'if (error instanceof XeroError && requiresOwnerActionToRetry(error.code))',
  );
  const recordFailureIndex = attachmentCatch.indexOf('counts.failedCount += 1');

  assert.ok(rethrowIndex > -1, 'grant rejection is not distinguished from a record failure');
  assert.ok(
    rethrowIndex < recordFailureIndex,
    'the grant rejection must be handled before a record failure is counted',
  );
  assert.match(attachmentCatch.slice(rethrowIndex, recordFailureIndex), /throw error;/);
  assert.match(
    attachmentCatch.slice(rethrowIndex, recordFailureIndex),
    /accounting\.attachments\.read/,
    'the log should name the scope the Owner has to grant',
  );
});

test('auto-resume skips a job whose stage failure only the Owner can clear', () => {
  const resumeBody = SYNC_SERVICE_SOURCE.slice(
    SYNC_SERVICE_SOURCE.indexOf('async resumeAbandonedImportJobs'),
    SYNC_SERVICE_SOURCE.indexOf('private async reconstructImportCheckpointFromMappings'),
  );

  assert.ok(resumeBody.length > 0, 'resumeAbandonedImportJobs not found');
  assert.match(resumeBody, /requiresOwnerActionToRetry\(state\.stageErrorCode\)/);

  const guardIndex = resumeBody.indexOf('requiresOwnerActionToRetry(state.stageErrorCode)');
  const reopenIndex = resumeBody.indexOf("status: 'pending'");
  assert.ok(guardIndex < reopenIndex, 'the guard must run before the job is reopened');
});

test('both retry paths clear the code so a reconnected tenant can resume', () => {
  const clears = SYNC_SERVICE_SOURCE.match(/stageErrorCode = null/g) ?? [];
  assert.equal(clears.length, 2, 'expected the manual retry and auto-resume paths to clear it');
});
