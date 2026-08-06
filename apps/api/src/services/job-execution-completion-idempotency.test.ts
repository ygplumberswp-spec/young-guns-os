import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyOfflineFlushByExistingLog,
  shouldRejectDuplicateCompletionSnapshot,
  shouldReplayGatedCompletionByClientActionId,
} from './job-execution-completion-idempotency.js';

describe('shouldReplayGatedCompletionByClientActionId', () => {
  it('replays when a workflow event already exists for the clientActionId', () => {
    assert.equal(shouldReplayGatedCompletionByClientActionId({ id: 'evt-1' }), true);
  });

  it('does not replay when no prior workflow event exists', () => {
    assert.equal(shouldReplayGatedCompletionByClientActionId(null), false);
    assert.equal(shouldReplayGatedCompletionByClientActionId(undefined), false);
  });
});

describe('shouldRejectDuplicateCompletionSnapshot', () => {
  it('does not reject when no completion snapshot exists', () => {
    assert.equal(
      shouldRejectDuplicateCompletionSnapshot({
        existingSnapshot: null,
        reopenAt: null,
      }),
      false,
    );
  });

  it('rejects a second completion when a snapshot exists and the job was not reopened', () => {
    assert.equal(
      shouldRejectDuplicateCompletionSnapshot({
        existingSnapshot: { createdAt: new Date('2026-08-01T10:00:00Z') },
        reopenAt: null,
      }),
      true,
    );
  });

  it('allows a new completion after reopen post-dates the existing snapshot', () => {
    assert.equal(
      shouldRejectDuplicateCompletionSnapshot({
        existingSnapshot: { createdAt: new Date('2026-08-01T10:00:00Z') },
        reopenAt: new Date('2026-08-01T11:00:00Z'),
      }),
      false,
    );
  });
});

describe('classifyOfflineFlushByExistingLog', () => {
  it('returns duplicate when mobile action log already recorded the clientActionId', () => {
    assert.equal(classifyOfflineFlushByExistingLog({ id: 'log-1' }), 'duplicate');
  });

  it('returns apply when no prior flush log exists', () => {
    assert.equal(classifyOfflineFlushByExistingLog(null), 'apply');
  });
});
