import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRefreshCookieOptions } from './auth-cookies.js';

describe('buildRefreshCookieOptions', () => {
  it('uses SameSite=None and Secure in production for cross-origin Railway deploys', () => {
    const options = buildRefreshCookieOptions(true, '/api/v1/auth');
    assert.equal(options.sameSite, 'none');
    assert.equal(options.secure, true);
    assert.equal(options.httpOnly, true);
    assert.equal(options.path, '/api/v1/auth');
  });

  it('uses SameSite=Lax for local development', () => {
    const options = buildRefreshCookieOptions(false, '/api/v1/auth');
    assert.equal(options.sameSite, 'lax');
    assert.equal(options.secure, false);
  });
});
