import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getCompletedJobPostCompletionAttempts,
  getCompletedJobStructuralAttempts,
} from '@titan/shared';

/**
 * M2 Job 360 — completed-job immutability contract (no live DB).
 * Structural edits are blocked; note/access updates are explicitly post-completion.
 */
describe('M2 completed job immutability', () => {
  it('blocks Owner/Office structural edits without reopen', () => {
    const attempts = getCompletedJobStructuralAttempts({
      title: 'Silent rewrite',
      priority: 'urgent',
      assignedUserId: '00000000-0000-4000-8000-000000000001',
      status: 'in_progress',
    });
    assert.ok(attempts.includes('title'));
    assert.ok(attempts.includes('priority'));
    assert.ok(attempts.includes('assignedUserId'));
    assert.ok(attempts.includes('status'));
  });

  it('marks note/access updates as post-completion candidates', () => {
    const posts = getCompletedJobPostCompletionAttempts({
      notes: 'Office follow-up after completion',
      customerVisibleNotes: 'Thank you',
      accessInstructions: 'Updated gate code',
    });
    assert.deepEqual(posts, ['notes', 'customerVisibleNotes', 'accessInstructions']);
  });

  it('does not treat empty patches as structural or post-completion', () => {
    assert.equal(getCompletedJobStructuralAttempts({}).length, 0);
    assert.equal(getCompletedJobPostCompletionAttempts({}).length, 0);
  });
});
