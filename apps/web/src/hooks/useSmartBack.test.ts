import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSmartBackFallback } from '../lib/back-navigation.js';

describe('useSmartBack re-exports', () => {
  it('resolveSmartBackFallback matches back-navigation module', async () => {
    const { resolveSmartBackFallback: fromHook } = await import('./useSmartBack.js');
    assert.equal(fromHook('/jobs/new'), resolveSmartBackFallback('/jobs/new'));
  });
});
