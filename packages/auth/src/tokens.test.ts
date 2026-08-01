import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import {
  createMfaLoginChallengeToken,
  verifyMfaLoginChallengeToken,
} from './tokens.js';

const SECRET = 'test-mfa-secret';

describe('MFA login challenge tokens', () => {
  it('creates and verifies a challenge token with user and company scope', () => {
    const { token, expiresIn } = createMfaLoginChallengeToken(
      'user-123',
      'company-456',
      SECRET,
    );

    assert.equal(expiresIn, 5 * 60);

    const verified = verifyMfaLoginChallengeToken(token, SECRET);
    assert.deepEqual(verified, { userId: 'user-123', companyId: 'company-456' });
  });

  it('rejects tokens with the wrong purpose', () => {
    const token = jwt.sign(
      { purpose: 'refresh', sub: 'user-123', companyId: 'company-456' },
      SECRET,
      { expiresIn: 300 },
    );

    assert.throws(
      () => verifyMfaLoginChallengeToken(token, SECRET),
      /Invalid MFA challenge token payload/,
    );
  });

  it('rejects tokens signed with a different secret', () => {
    const { token } = createMfaLoginChallengeToken('user-123', 'company-456', SECRET);

    assert.throws(
      () => verifyMfaLoginChallengeToken(token, 'other-secret'),
      /invalid signature/i,
    );
  });
});
