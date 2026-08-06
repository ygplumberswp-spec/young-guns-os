import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JOB_360_TABS } from './job-360-tabs';

describe('Job 360 tabs', () => {
  it('exposes the full office Job File sections', () => {
    const ids = JOB_360_TABS.map((tab) => tab.id);
    for (const required of [
      'overview',
      'schedule',
      'job-card',
      'checklist',
      'photos',
      'notes',
      'materials',
      'time',
      'quote',
      'invoice',
      'payment',
      'signature',
      'coc',
      'documents',
      'communications',
      'activity',
    ] as const) {
      assert.ok(ids.includes(required), `missing tab ${required}`);
    }
  });

  it('keeps overview first for operational source-of-truth reading', () => {
    assert.equal(JOB_360_TABS[0]?.id, 'overview');
    assert.equal(JOB_360_TABS.at(-1)?.id, 'activity');
  });
});
