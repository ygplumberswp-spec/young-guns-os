import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldDedupeNotify } from './TitanNotifications.js';

describe('shouldDedupeNotify', () => {
  it('dedupes same action within window', () => {
    const recent = new Map<string, number>([['save-quote', 1000]]);
    const result = shouldDedupeNotify([], 'save-quote', 3000, 2500, recent);
    assert.equal(result, true);
  });

  it('allows after dedupe window', () => {
    const recent = new Map<string, number>([['save-quote', 1000]]);
    const result = shouldDedupeNotify([], 'save-quote', 3000, 5000, recent);
    assert.equal(result, false);
  });

  it('allows when no dedupe key', () => {
    const result = shouldDedupeNotify([], undefined, 3000, Date.now(), new Map());
    assert.equal(result, false);
  });
});
