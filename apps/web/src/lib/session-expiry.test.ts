import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyRestoreSessionRefresh } from './api-client.js';
import { toAppAbsoluteHref } from './nested-routing.js';
import {
  isSessionExpiredLoginReason,
  PLAIN_LOGIN_PATH,
  SESSION_EXPIRED_LOGIN_PATH,
  SESSION_EXPIRED_LOGIN_REASON,
  SESSION_EXPIRED_PAGE_PATH,
  staffLoginRedirectHref,
  staffLoginRedirectPath,
} from './session-expiry-routing.js';

describe('classifyRestoreSessionRefresh (session expiry bootstrap)', () => {
  it('returns missing for first-visit refresh without cookie', () => {
    assert.equal(classifyRestoreSessionRefresh(401, 'SESSION_MISSING'), 'missing');
  });

  it('returns expired when refresh cookie is rejected as SESSION_EXPIRED', () => {
    assert.equal(classifyRestoreSessionRefresh(401, 'SESSION_EXPIRED'), 'expired');
  });

  it('returns expired for other 401 refresh rejections (revoked/invalid token)', () => {
    assert.equal(classifyRestoreSessionRefresh(401, 'SESSION_INVALID'), 'expired');
    assert.equal(classifyRestoreSessionRefresh(401, undefined), 'expired');
  });

  it('returns expired when refresh returns a non-401 error', () => {
    assert.equal(classifyRestoreSessionRefresh(503), 'expired');
    assert.equal(classifyRestoreSessionRefresh(500, 'INTERNAL_ERROR'), 'expired');
  });
});

describe('staff session expiry redirect contract', () => {
  it('maps expired bootstrap to login with session_expired reason', () => {
    assert.equal(staffLoginRedirectPath('expired'), SESSION_EXPIRED_LOGIN_PATH);
    assert.equal(staffLoginRedirectHref('expired'), toAppAbsoluteHref(SESSION_EXPIRED_LOGIN_PATH));
  });

  it('maps missing and unreachable bootstrap to plain login (no false expiry banner)', () => {
    for (const state of ['missing', 'unreachable'] as const) {
      assert.equal(staffLoginRedirectPath(state), PLAIN_LOGIN_PATH);
      assert.equal(staffLoginRedirectHref(state), toAppAbsoluteHref(PLAIN_LOGIN_PATH));
    }
  });

  it('preserves returnTo for protected-route deep links', () => {
    const path = staffLoginRedirectPath('missing', '/integrations/xero');
    assert.match(path, /returnTo=/);
    assert.match(path, /integrations%2Fxero|integrations\/xero/);
  });

  it('does not label loading or authenticated states as session expired', () => {
    assert.equal(staffLoginRedirectPath('loading'), PLAIN_LOGIN_PATH);
    assert.equal(staffLoginRedirectPath('authenticated'), PLAIN_LOGIN_PATH);
  });

  it('detects the session_expired login banner query param', () => {
    assert.equal(isSessionExpiredLoginReason(SESSION_EXPIRED_LOGIN_REASON), true);
    assert.equal(isSessionExpiredLoginReason(null), false);
    assert.equal(isSessionExpiredLoginReason(''), false);
    assert.equal(isSessionExpiredLoginReason('logout'), false);
  });

  it('exposes stable session-expired page and re-login paths', () => {
    assert.equal(SESSION_EXPIRED_PAGE_PATH, '/auth/session-expired');
    assert.equal(SESSION_EXPIRED_LOGIN_PATH, '/auth/login?reason=session_expired');
  });
});
