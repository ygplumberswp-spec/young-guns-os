import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createMfaLoginChallengeToken,
  verifyMfaLoginChallengeToken,
} from './tokens.js';

describe('MFA login challenge tokens', () => {
  const secret = 'test-secret-at-least-32-characters-long';

  it('round-trips user and company identifiers', () => {
    const issued = createMfaLoginChallengeToken('user-1', 'company-1', secret);
    const verified = verifyMfaLoginChallengeToken(issued.token, secret);
    assert.equal(verified.userId, 'user-1');
    assert.equal(verified.companyId, 'company-1');
    assert.equal(issued.expiresIn, 300);
  });

  it('rejects tokens signed with a different secret', () => {
    const issued = createMfaLoginChallengeToken('user-1', 'company-1', secret);
    assert.throws(() => verifyMfaLoginChallengeToken(issued.token, `${secret}-other`));
  });

  it('rejects malformed tokens', () => {
    assert.throws(() => verifyMfaLoginChallengeToken('not-a-token', secret));
  });
});
