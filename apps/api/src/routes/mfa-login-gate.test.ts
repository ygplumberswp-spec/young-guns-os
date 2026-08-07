import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import { createMfaLoginChallengeToken } from '@titan/auth';
import { createAuthRouter } from './auth.js';
import type { AuthService } from '../services/auth.service.js';
import { AuthError } from '../services/auth.service.js';
import type { EnterpriseSecurityService } from '../services/enterprise-security.service.js';
import { EnterpriseSecurityError } from '../services/enterprise-security.service.js';

/**
 * Pilot-critical MFA login gate (execution plan risk #5).
 * Ensures `/auth/login` never issues a session before MFA verification when required.
 */
const JWT_SECRET = 'mfa-login-gate-test-secret';

type MockAuthService = Pick<
  AuthService,
  | 'verifyLoginCredentials'
  | 'issueSessionForUser'
  | 'signup'
  | 'acceptInvite'
  | 'logout'
  | 'refresh'
  | 'getUserById'
  | 'getInvitePreview'
>;

type LoginMfaResolution = Awaited<
  ReturnType<EnterpriseSecurityService['resolveLoginMfaRequirement']>
>;

const invitePreview = {
  email: 'owner@example.com',
  companyName: 'Acme',
  roleName: 'Company Owner',
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
};

const sessionPayload = {
  user: {
    id: 'user-1',
    companyId: 'company-1',
    companyName: 'Acme',
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
  refreshToken: 'refresh-token',
};

function baseAuthService(overrides: Partial<MockAuthService> = {}): MockAuthService {
  return {
    verifyLoginCredentials: async () => ({ userId: 'user-1', companyId: 'company-1' }),
    issueSessionForUser: async () => sessionPayload,
    signup: async () => sessionPayload,
    acceptInvite: async () => sessionPayload,
    logout: async () => undefined,
    refresh: async () => sessionPayload,
    getUserById: async () => sessionPayload.user,
    getInvitePreview: async () => invitePreview,
    ...overrides,
  };
}

function buildApp(
  authService: MockAuthService,
  enterpriseSecurityService?: Partial<EnterpriseSecurityService>,
) {
  const app = express();
  app.use(express.json());
  app.use(
    '/auth',
    createAuthRouter({
      authService: authService as AuthService,
      jwtSecret: JWT_SECRET,
      isProduction: false,
      enterpriseSecurityService: enterpriseSecurityService as EnterpriseSecurityService,
    }),
  );
  return app;
}

async function postJson(app: express.Express, path: string, body: unknown) {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as {
      data?: Record<string, unknown>;
      error?: { code?: string; message?: string };
    };
    return { status: response.status, payload };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

/** MFA policy × enrollment matrix for `/auth/login`. */
const LOGIN_GATE_FIXTURES: Array<{
  label: string;
  resolution: LoginMfaResolution;
  expectedStatus: number;
  expectedCode?: string;
  expectChallenge: boolean;
  expectSession: boolean;
}> = [
  {
    label: 'policy off — direct session',
    resolution: {
      policyRequired: false,
      enrolled: false,
      challengeRequired: false,
      enrollmentRequired: false,
    },
    expectedStatus: 200,
    expectChallenge: false,
    expectSession: true,
  },
  {
    label: 'policy on, enrolled — MFA challenge',
    resolution: {
      policyRequired: true,
      enrolled: true,
      challengeRequired: true,
      enrollmentRequired: false,
    },
    expectedStatus: 200,
    expectChallenge: true,
    expectSession: false,
  },
  {
    label: 'policy on, not enrolled — enrollment block',
    resolution: {
      policyRequired: true,
      enrolled: false,
      challengeRequired: false,
      enrollmentRequired: true,
    },
    expectedStatus: 403,
    expectedCode: 'MFA_ENROLLMENT_REQUIRED',
    expectChallenge: false,
    expectSession: false,
  },
];

describe('MFA login gate — policy × enrollment matrix (risk #5)', () => {
  for (const fixture of LOGIN_GATE_FIXTURES) {
    it(`${fixture.label}`, async () => {
      let sessionIssued = false;

      const authService = baseAuthService({
        issueSessionForUser: async () => {
          sessionIssued = true;
          return sessionPayload;
        },
      });

      const enterpriseSecurityService = {
        resolveLoginMfaRequirement: async () => fixture.resolution,
        verifyLoginMfaCode: async () => undefined,
        recordLoginEvent: async () => undefined,
      };

      const app = buildApp(authService, enterpriseSecurityService);
      const result = await postJson(app, '/auth/login', {
        email: 'owner@example.com',
        password: 'correct-password',
      });

      assert.equal(result.status, fixture.expectedStatus);
      if (fixture.expectedCode) {
        assert.equal(result.payload.error?.code, fixture.expectedCode);
      }

      if (fixture.expectChallenge) {
        assert.equal(result.payload.data?.mfaRequired, true);
        assert.equal(typeof result.payload.data?.mfaChallengeToken, 'string');
        assert.equal(result.payload.data?.user, undefined);
        assert.equal(result.payload.data?.session, undefined);
      }

      if (fixture.expectSession) {
        const user = result.payload.data?.user as { id?: string } | undefined;
        const session = result.payload.data?.session as { accessToken?: string } | undefined;
        assert.equal(user?.id, 'user-1');
        assert.equal(session?.accessToken, 'access-token');
      }

      assert.equal(sessionIssued, fixture.expectSession);
    });
  }
});

describe('MFA login gate — session issuance guard (risk #5)', () => {
  it('does not call issueSessionForUser until MFA verification succeeds', async () => {
    let sessionIssued = false;

    const authService = baseAuthService({
      issueSessionForUser: async () => {
        sessionIssued = true;
        return sessionPayload;
      },
    });

    const enterpriseSecurityService = {
      resolveLoginMfaRequirement: async () => ({
        policyRequired: true,
        enrolled: true,
        challengeRequired: true,
        enrollmentRequired: false,
      }),
      verifyLoginMfaCode: async () => undefined,
      recordLoginEvent: async () => undefined,
    };

    const app = buildApp(authService, enterpriseSecurityService);
    const loginResult = await postJson(app, '/auth/login', {
      email: 'owner@example.com',
      password: 'correct-password',
    });

    assert.equal(loginResult.status, 200);
    assert.equal(sessionIssued, false);

    const challengeToken = loginResult.payload.data?.mfaChallengeToken as string;
    const mfaResult = await postJson(app, '/auth/login/mfa', {
      mfaChallengeToken: challengeToken,
      code: '123456',
    });

    assert.equal(mfaResult.status, 200);
    assert.equal(sessionIssued, true);
  });

  it('issues session when enterprise security service is absent', async () => {
    let sessionIssued = false;

    const authService = baseAuthService({
      issueSessionForUser: async () => {
        sessionIssued = true;
        return sessionPayload;
      },
    });

    const app = buildApp(authService);
    const result = await postJson(app, '/auth/login', {
      email: 'owner@example.com',
      password: 'correct-password',
    });

    assert.equal(result.status, 200);
    assert.equal(sessionIssued, true);
    assert.equal(result.payload.data?.mfaRequired, undefined);
  });
});

describe('MFA login gate — challenge verification edge cases (risk #5)', () => {
  it('rejects challenge tokens signed with the wrong secret', async () => {
    const challenge = createMfaLoginChallengeToken('user-1', 'company-1', 'other-signing-secret');

    const app = buildApp(baseAuthService(), {
      verifyLoginMfaCode: async () => undefined,
      recordLoginEvent: async () => undefined,
    });

    const result = await postJson(app, '/auth/login/mfa', {
      mfaChallengeToken: challenge.token,
      code: '123456',
    });

    assert.equal(result.status, 401);
    assert.equal(result.payload.error?.code, 'MFA_CHALLENGE_EXPIRED');
  });

  it('returns MFA_CHALLENGE_EXPIRED for tampered challenge tokens', async () => {
    const challenge = createMfaLoginChallengeToken('user-1', 'company-1', JWT_SECRET);
    const tampered = `${challenge.token}x`;

    const app = buildApp(baseAuthService(), {
      verifyLoginMfaCode: async () => undefined,
      recordLoginEvent: async () => undefined,
    });

    const result = await postJson(app, '/auth/login/mfa', {
      mfaChallengeToken: tampered,
      code: '123456',
    });

    assert.equal(result.status, 401);
    assert.equal(result.payload.error?.code, 'MFA_CHALLENGE_EXPIRED');
  });

  it('returns MFA_UNAVAILABLE when security service is not configured', async () => {
    const challenge = createMfaLoginChallengeToken('user-1', 'company-1', JWT_SECRET);
    const app = buildApp(baseAuthService());

    const result = await postJson(app, '/auth/login/mfa', {
      mfaChallengeToken: challenge.token,
      code: '123456',
    });

    assert.equal(result.status, 503);
    assert.equal(result.payload.error?.code, 'MFA_UNAVAILABLE');
  });

  it('returns VALIDATION_ERROR for malformed MFA verification payloads', async () => {
    const app = buildApp(baseAuthService(), {
      verifyLoginMfaCode: async () => undefined,
      recordLoginEvent: async () => undefined,
    });

    const result = await postJson(app, '/auth/login/mfa', {
      mfaChallengeToken: '',
      code: '',
    });

    assert.equal(result.status, 400);
    assert.equal(result.payload.error?.code, 'VALIDATION_ERROR');
  });

  it('records login_success with mfaVerified metadata after MFA completion', async () => {
    const events: Array<{ eventType: string; metadata?: Record<string, unknown> }> = [];
    const challenge = createMfaLoginChallengeToken('user-1', 'company-1', JWT_SECRET);

    const app = buildApp(baseAuthService(), {
      verifyLoginMfaCode: async () => undefined,
      recordLoginEvent: async (input) => {
        events.push({ eventType: input.eventType, metadata: input.metadata });
      },
    });

    const result = await postJson(app, '/auth/login/mfa', {
      mfaChallengeToken: challenge.token,
      code: '123456',
    });

    assert.equal(result.status, 200);
    const successEvent = events.find((event) => event.eventType === 'login_success');
    assert.ok(successEvent);
    assert.equal(successEvent.metadata?.mfaVerified, true);
  });

  it('does not leak MFA state on invalid credentials', async () => {
    const authService = baseAuthService({
      verifyLoginCredentials: async () => {
        throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password');
      },
    });

    const enterpriseSecurityService = {
      resolveLoginMfaRequirement: async () => ({
        policyRequired: true,
        enrolled: true,
        challengeRequired: true,
        enrollmentRequired: false,
      }),
      recordLoginEvent: async () => undefined,
    };

    const app = buildApp(authService, enterpriseSecurityService);
    const result = await postJson(app, '/auth/login', {
      email: 'owner@example.com',
      password: 'wrong-password',
    });

    assert.equal(result.status, 401);
    assert.equal(result.payload.error?.code, 'INVALID_CREDENTIALS');
    assert.equal(result.payload.data?.mfaRequired, undefined);
  });

  it('returns MFA_INVALID_CODE without issuing a session', async () => {
    let sessionIssued = false;
    const challenge = createMfaLoginChallengeToken('user-1', 'company-1', JWT_SECRET);

    const authService = baseAuthService({
      issueSessionForUser: async () => {
        sessionIssued = true;
        return sessionPayload;
      },
    });

    const app = buildApp(authService, {
      verifyLoginMfaCode: async () => {
        throw new EnterpriseSecurityError('MFA_INVALID_CODE', 'Invalid verification code');
      },
      recordLoginEvent: async () => undefined,
    });

    const result = await postJson(app, '/auth/login/mfa', {
      mfaChallengeToken: challenge.token,
      code: '000000',
    });

    assert.equal(result.status, 401);
    assert.equal(result.payload.error?.code, 'MFA_INVALID_CODE');
    assert.equal(sessionIssued, false);
  });
});
