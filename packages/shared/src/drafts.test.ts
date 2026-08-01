import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDraftKey } from './drafts.js';

describe('buildDraftKey', () => {
  it('dedupes by user, type, and record id', () => {
    const key = buildDraftKey({
      userId: 'user-1',
      recordType: 'quote',
      recordId: 'rec-1',
    });
    assert.equal(key, 'user-1:quote:rec-1');
    assert.equal(
      buildDraftKey({ userId: 'user-1', recordType: 'quote', recordId: 'rec-1' }),
      key,
    );
  });

  it('uses new for records without id', () => {
    assert.equal(
      buildDraftKey({ userId: 'u', recordType: 'job', recordId: null }),
      'u:job:new',
    );
    assert.equal(buildDraftKey({ userId: 'u', recordType: 'job' }), 'u:job:new');
  });

  it('isolates types and users', () => {
    const a = buildDraftKey({ userId: 'a', recordType: 'invoice' });
    const b = buildDraftKey({ userId: 'b', recordType: 'invoice' });
    const c = buildDraftKey({ userId: 'a', recordType: 'quote' });
    assert.notEqual(a, b);
    assert.notEqual(a, c);
  });
});
