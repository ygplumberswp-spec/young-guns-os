import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isLoginMfaChallenge, type LoginResponse } from './api-client';

describe('login MFA client contract', () => {
  it('detects MFA challenge responses', () => {
    const challenge: LoginResponse = {
      mfaRequired: true,
      mfaChallengeToken: 'token',
      expiresIn: 300,
    };

    assert.equal(isLoginMfaChallenge(challenge), true);
  });

  it('does not treat full session payloads as MFA challenges', () => {
    const session: LoginResponse = {
      user: {
        id: 'user-1',
        companyId: 'company-1',
        companyName: 'Acme Plumbing',
        email: 'owner@example.com',
        firstName: 'Owner',
        lastName: 'User',
        roleId: 'role-1',
        roleName: 'Company Owner',
        permissions: ['*'],
      },
      session: {
        accessToken: 'access-token',
        expiresIn: 900,
      },
    };

    assert.equal(isLoginMfaChallenge(session), false);
  });
});
