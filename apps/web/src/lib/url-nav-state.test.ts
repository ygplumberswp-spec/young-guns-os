import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchString } from './url-nav-state.js';

describe('url-nav-state', () => {
  it('buildSearchString omits empty values', () => {
    assert.equal(buildSearchString({ status: 'active', q: '', other: null }), '?status=active');
  });

  it('buildSearchString returns empty string when nothing set', () => {
    assert.equal(buildSearchString({ a: null, b: undefined, c: '' }), '');
  });
});
