import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { OfflineQueuedAction } from './mobile-offline-queue.js';
import {
  evaluateMobileCompletionSubmit,
  formatManualSyncMessage,
  newStableCompletionClientActionId,
  offlineFlushQueueStatusForResult,
  tallyOfflineFlushResults,
} from './mobile-offline-completion.js';

const JOB_ID = '11111111-1111-1111-1111-111111111111';

function queuedEvidence(status: OfflineQueuedAction['status']): OfflineQueuedAction {
  return {
    id: 'row-1',
    clientActionId: 'evidence-1',
    actionType: 'evidence_upload',
    jobId: JOB_ID,
    payload: {},
    status,
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-01T08:00:00.000Z',
  };
}

describe('evaluateMobileCompletionSubmit (offline duplicate-completion UX)', () => {
  it('allows submit when evidence is synced, signature captured, and online', () => {
    const result = evaluateMobileCompletionSubmit({
      jobId: JOB_ID,
      offlineActions: [],
      signatureDocId: 'sig-doc-1',
      signatureUnavailableReason: '',
      isOnline: true,
    });

    assert.equal(result.allowed, true);
    assert.equal(result.reason, undefined);
  });

  it('blocks completion while required evidence is offline/pending/failed', () => {
    for (const status of ['offline', 'pending', 'failed'] as const) {
      const result = evaluateMobileCompletionSubmit({
        jobId: JOB_ID,
        offlineActions: [queuedEvidence(status)],
        signatureDocId: 'sig-doc-1',
        signatureUnavailableReason: '',
        isOnline: true,
      });
      assert.equal(result.allowed, false);
      assert.equal(result.reason, 'unsynced_evidence');
    }
  });

  it('blocks completion without signature or mandatory unavailable reason', () => {
    const result = evaluateMobileCompletionSubmit({
      jobId: JOB_ID,
      offlineActions: [],
      signatureDocId: null,
      signatureUnavailableReason: '   ',
      isOnline: true,
    });

    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'missing_signature');
  });

  it('blocks final completion while the device is offline', () => {
    const result = evaluateMobileCompletionSubmit({
      jobId: JOB_ID,
      offlineActions: [],
      signatureDocId: 'sig-doc-1',
      signatureUnavailableReason: '',
      isOnline: false,
    });

    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'offline');
  });
});

describe('tallyOfflineFlushResults (offline flush idempotency)', () => {
  it('counts synced, duplicate, and failed results separately', () => {
    const tally = tallyOfflineFlushResults(
      ['a-1', 'a-2', 'a-3'],
      [
        { clientActionId: 'a-1', status: 'synced' },
        { clientActionId: 'a-2', status: 'duplicate' },
        { clientActionId: 'a-3', status: 'failed' },
      ],
    );

    assert.deepEqual(tally, { synced: 1, duplicate: 1, failed: 1, unmatched: 0 });
  });

  it('treats missing server results as failed/unmatched', () => {
    const tally = tallyOfflineFlushResults(['a-1', 'a-2'], [{ clientActionId: 'a-1', status: 'synced' }]);

    assert.equal(tally.synced, 1);
    assert.equal(tally.failed, 1);
    assert.equal(tally.unmatched, 1);
    assert.equal(tally.duplicate, 0);
  });
});

describe('offlineFlushQueueStatusForResult', () => {
  it('marks duplicate server results as locally synced', () => {
    assert.equal(offlineFlushQueueStatusForResult('duplicate'), 'synced');
    assert.equal(offlineFlushQueueStatusForResult('synced'), 'synced');
  });

  it('marks failed server results as locally failed', () => {
    assert.equal(offlineFlushQueueStatusForResult('failed'), 'failed');
  });
});

describe('formatManualSyncMessage', () => {
  it('matches the mobile job detail manual sync banner contract', () => {
    assert.equal(
      formatManualSyncMessage({ synced: 2, duplicate: 1, failed: 0 }),
      'Manual sync: 2 synced, 1 duplicate, 0 failed',
    );
  });
});

describe('newStableCompletionClientActionId', () => {
  it('embeds the job id so retries reuse a stable completion key', () => {
    const id = newStableCompletionClientActionId(JOB_ID);
    assert.match(id, new RegExp(`^complete-${JOB_ID}-`));
  });
});
