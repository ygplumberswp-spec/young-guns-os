import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  TRUSTED_DEVICE_REFRESH_TTL_MS,
  createStepUpToken,
  verifyStepUpToken,
} from './tokens.js';

describe('secure session token defaults', () => {
  it('uses ~15 minute access tokens by default', () => {
    assert.equal(ACCESS_TOKEN_TTL_SECONDS, 15 * 60);
  });

  it('supports trusted-device refresh up to 30 days', () => {
    assert.equal(TRUSTED_DEVICE_REFRESH_TTL_MS, 30 * 24 * 60 * 60 * 1000);
  });
});

describe('step-up tokens for sensitive actions', () => {
  const secret = 'step-up-test-secret';

  it('creates and verifies a scoped step-up token', () => {
    const { token, expiresIn } = createStepUpToken('user-1', 'company-1', 'session-1', secret);
    assert.equal(expiresIn, 5 * 60);
    assert.equal(
      verifyStepUpToken(token, secret, {
        userId: 'user-1',
        companyId: 'company-1',
        sessionId: 'session-1',
      }),
      true,
    );
  });

  it('rejects step-up tokens for a different session', () => {
    const { token } = createStepUpToken('user-1', 'company-1', 'session-1', secret);
    assert.equal(
      verifyStepUpToken(token, secret, {
        userId: 'user-1',
        companyId: 'company-1',
        sessionId: 'session-2',
      }),
      false,
    );
  });
});
