import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseBoolFlag } from './env-flags.js';

describe('parseBoolFlag', () => {
  it('honours explicit true/false', () => {
    assert.equal(parseBoolFlag('true', false), true);
    assert.equal(parseBoolFlag('false', true), false);
    assert.equal(parseBoolFlag('YES', false), true);
    assert.equal(parseBoolFlag('0', true), false);
  });

  it('falls back to default when unset', () => {
    assert.equal(parseBoolFlag(undefined, true), true);
    assert.equal(parseBoolFlag('', false), false);
  });
});
