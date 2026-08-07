import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import { createMfaLoginChallengeToken } from '@titan/auth';
import { createAuthRouter } from './auth.js';
import type { AuthService } from '../services/auth.service.js';
import { AuthError } from '../services/auth.service.js';
import type { EnterpriseSecurityService } from '../services/enterprise-security.service.js';
import { EnterpriseSecurityError } from '../services/enterprise-security.service.js';

const JWT_SECRET = 'auth-mfa-test-secret';

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
      data?: {
        user?: { id?: string };
        session?: { accessToken?: string };
        mfaRequired?: boolean;
        mfaChallengeToken?: string;
        expiresIn?: number;
      };
      error?: { code?: string; message?: string };
    };
    return { status: response.status, payload };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

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

describe('auth login MFA gate', () => {
  it('returns MFA challenge envelope when enrolled user signs in', async () => {
    const authService: MockAuthService = {
      verifyLoginCredentials: async () => ({ userId: 'user-1', companyId: 'company-1' }),
      issueSessionForUser: async () => sessionPayload,
      signup: async () => sessionPayload,
      acceptInvite: async () => sessionPayload,
      logout: async () => undefined,
      refresh: async () => sessionPayload,
      getUserById: async () => sessionPayload.user,
      getInvitePreview: async () => invitePreview,
    };

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
    const result = await postJson(app, '/auth/login', {
      email: 'owner@example.com',
      password: 'correct-password',
    });

    assert.equal(result.status, 200);
    assert.equal(result.payload.data?.mfaRequired, true);
    assert.equal(typeof result.payload.data?.mfaChallengeToken, 'string');
    assert.equal(result.payload.data?.expiresIn, 5 * 60);
  });

  it('blocks login when MFA enrollment is required but missing', async () => {
    const authService: MockAuthService = {
      verifyLoginCredentials: async () => ({ userId: 'user-1', companyId: 'company-1' }),
      issueSessionForUser: async () => sessionPayload,
      signup: async () => sessionPayload,
      acceptInvite: async () => sessionPayload,
      logout: async () => undefined,
      refresh: async () => sessionPayload,
      getUserById: async () => sessionPayload.user,
      getInvitePreview: async () => invitePreview,
    };

    const enterpriseSecurityService = {
      resolveLoginMfaRequirement: async () => ({
        policyRequired: true,
        enrolled: false,
        challengeRequired: false,
        enrollmentRequired: true,
      }),
      recordLoginEvent: async () => undefined,
    };

    const app = buildApp(authService, enterpriseSecurityService);
    const result = await postJson(app, '/auth/login', {
      email: 'owner@example.com',
      password: 'correct-password',
    });

    assert.equal(result.status, 403);
    assert.equal(result.payload.error?.code, 'MFA_ENROLLMENT_REQUIRED');
  });

  it('completes login after valid MFA verification', async () => {
    const authService: MockAuthService = {
      verifyLoginCredentials: async () => ({ userId: 'user-1', companyId: 'company-1' }),
      issueSessionForUser: async () => sessionPayload,
      signup: async () => sessionPayload,
      acceptInvite: async () => sessionPayload,
      logout: async () => undefined,
      refresh: async () => sessionPayload,
      getUserById: async () => sessionPayload.user,
      getInvitePreview: async () => invitePreview,
    };

    const challenge = createMfaLoginChallengeToken('user-1', 'company-1', JWT_SECRET);

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
    const result = await postJson(app, '/auth/login/mfa', {
      mfaChallengeToken: challenge.token,
      code: '123456',
    });

    assert.equal(result.status, 200);
    const user = result.payload.data?.user as { id?: string } | undefined;
    const session = result.payload.data?.session as { accessToken?: string } | undefined;
    assert.equal(user?.id, 'user-1');
    assert.equal(session?.accessToken, 'access-token');
  });

  it('returns MFA_INVALID_CODE when verification fails', async () => {
    const authService: MockAuthService = {
      verifyLoginCredentials: async () => ({ userId: 'user-1', companyId: 'company-1' }),
      issueSessionForUser: async () => sessionPayload,
      signup: async () => sessionPayload,
      acceptInvite: async () => sessionPayload,
      logout: async () => undefined,
      refresh: async () => sessionPayload,
      getUserById: async () => sessionPayload.user,
      getInvitePreview: async () => invitePreview,
    };

    const challenge = createMfaLoginChallengeToken('user-1', 'company-1', JWT_SECRET);

    const enterpriseSecurityService = {
      verifyLoginMfaCode: async () => {
        throw new EnterpriseSecurityError('MFA_INVALID_CODE', 'Invalid verification code');
      },
      recordLoginEvent: async () => undefined,
    };

    const app = buildApp(authService, enterpriseSecurityService);
    const result = await postJson(app, '/auth/login/mfa', {
      mfaChallengeToken: challenge.token,
      code: '000000',
    });

    assert.equal(result.status, 401);
    assert.equal(result.payload.error?.code, 'MFA_INVALID_CODE');
  });

  it('returns INVALID_CREDENTIALS for bad password without leaking MFA state', async () => {
    const authService: MockAuthService = {
      verifyLoginCredentials: async () => {
        throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password');
      },
      issueSessionForUser: async () => sessionPayload,
      signup: async () => sessionPayload,
      acceptInvite: async () => sessionPayload,
      logout: async () => undefined,
      refresh: async () => sessionPayload,
      getUserById: async () => sessionPayload.user,
      getInvitePreview: async () => invitePreview,
    };

    const enterpriseSecurityService = {
      recordLoginEvent: async () => undefined,
    };

    const app = buildApp(authService, enterpriseSecurityService);
    const result = await postJson(app, '/auth/login', {
      email: 'owner@example.com',
      password: 'wrong-password',
    });

    assert.equal(result.status, 401);
    assert.equal(result.payload.error?.code, 'INVALID_CREDENTIALS');
  });
});
