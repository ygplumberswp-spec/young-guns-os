import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getCompletedJobPostCompletionAttempts,
  getCompletedJobStructuralAttempts,
} from './job-completion-guards.js';

describe('completed job immutability guards', () => {
  it('flags structural edits on completed jobs', () => {
    const attempts = getCompletedJobStructuralAttempts({
      title: 'Changed',
      status: 'in_progress',
      notes: 'ok',
    });
    assert.deepEqual(attempts, ['title', 'status']);
  });

  it('allows audited post-completion note fields', () => {
    const attempts = getCompletedJobPostCompletionAttempts({
      notes: 'Follow-up',
      accessInstructions: 'Gate code updated',
      title: 'Blocked',
    });
    assert.deepEqual(attempts, ['notes', 'accessInstructions']);
  });

  it('returns empty when no completed-job fields are present', () => {
    assert.deepEqual(getCompletedJobStructuralAttempts({}), []);
    assert.deepEqual(getCompletedJobPostCompletionAttempts({}), []);
  });
});
