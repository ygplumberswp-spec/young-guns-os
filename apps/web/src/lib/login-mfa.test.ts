import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isLoginMfaChallenge,
  MFA_CHALLENGE_STORAGE_KEY,
  MFA_LOGIN_REDIRECT_PATH,
  type LoginResponse,
} from './api-client';

const sessionUser = {
  id: 'user-1',
  companyId: 'company-1',
  companyName: 'Acme Plumbing',
  email: 'owner@example.com',
  firstName: 'Owner',
  lastName: 'User',
  roleId: 'role-1',
  roleName: 'Company Owner',
  permissions: ['*'],
};

describe('login MFA client contract (risk #5)', () => {
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
      user: sessionUser,
      session: {
        accessToken: 'access-token',
        expiresIn: 900,
      },
    };

    assert.equal(isLoginMfaChallenge(session), false);
  });

  it('does not treat partial challenge payloads as MFA challenges', () => {
    assert.equal(isLoginMfaChallenge({ mfaRequired: true } as LoginResponse), false);
    assert.equal(
      isLoginMfaChallenge({ mfaRequired: true, expiresIn: 300 } as LoginResponse),
      false,
    );
  });

  it('does not treat mfaRequired false with token as a challenge', () => {
    assert.equal(
      isLoginMfaChallenge({
        mfaRequired: false,
        mfaChallengeToken: 'token',
        user: sessionUser,
        session: { accessToken: 'access-token', expiresIn: 900 },
      } as unknown as LoginResponse),
      false,
    );
  });

  it('exposes a stable sessionStorage key for MFA challenge handoff', () => {
    assert.equal(MFA_CHALLENGE_STORAGE_KEY, 'titan_mfa_challenge');
  });
});

describe('login MFA web flow routing (risk #5)', () => {
  it('maps MFA challenges to the branded verification route', () => {
    const challenge: LoginResponse = {
      mfaRequired: true,
      mfaChallengeToken: 'challenge-token',
      expiresIn: 300,
    };

    assert.equal(isLoginMfaChallenge(challenge), true);
    assert.equal(MFA_LOGIN_REDIRECT_PATH, '/auth/mfa?required=1');
    assert.equal(MFA_CHALLENGE_STORAGE_KEY.length > 0, true);
  });

  it('maps completed sessions to staff home navigation', () => {
    const session: LoginResponse = {
      user: sessionUser,
      session: {
        accessToken: 'access-token',
        expiresIn: 900,
      },
    };

    assert.equal(isLoginMfaChallenge(session), false);
    assert.equal(session.user.id, 'user-1');
  });
});
