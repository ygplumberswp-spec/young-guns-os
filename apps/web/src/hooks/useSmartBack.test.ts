import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSmartBackFallback } from './useSmartBack.js';

describe('resolveSmartBackFallback', () => {
  it('maps quote create to list', () => {
    assert.equal(resolveSmartBackFallback('/finance/quotes/new'), '/finance/quotes');
  });

  it('maps quote edit to detail', () => {
    assert.equal(
      resolveSmartBackFallback('/finance/quotes/abc-123/edit'),
      '/finance/quotes/abc-123',
    );
  });

  it('maps job create to jobs list', () => {
    assert.equal(resolveSmartBackFallback('/jobs/new'), '/jobs');
  });

  it('defaults unknown paths to dashboard', () => {
    assert.equal(resolveSmartBackFallback('/unknown'), '/');
  });
});
