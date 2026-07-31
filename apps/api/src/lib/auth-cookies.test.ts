import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRefreshCookieOptions } from './auth-cookies.js';

describe('buildRefreshCookieOptions', () => {
  it('uses SameSite=Lax and Secure in production for same-origin proxy deploys', () => {
    const options = buildRefreshCookieOptions(true, '/api/v1/auth');
    assert.equal(options.sameSite, 'lax');
    assert.equal(options.secure, true);
    assert.equal(options.httpOnly, true);
    assert.equal(options.path, '/api/v1/auth');
  });

  it('uses SameSite=Lax without Secure for local development', () => {
    const options = buildRefreshCookieOptions(false, '/api/v1/auth');
    assert.equal(options.sameSite, 'lax');
    assert.equal(options.secure, false);
  });
});
