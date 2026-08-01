import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createAuthRouter } from './auth.js';
import type { AuthService } from '../services/auth.service.js';
import { AuthError } from '../services/auth.service.js';
import type { EnterpriseSecurityService } from '../services/enterprise-security.service.js';

/**
 * Session refresh contract for staff auth bootstrap and ProtectedRoute expiry UX.
 * Distinguishes missing cookie (first visit) from rejected/expired refresh tokens.
 */
const JWT_SECRET = 'session-refresh-test-secret';
const REFRESH_COOKIE = 'titan_refresh_token';

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

function buildApp(authService: MockAuthService) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(
    '/auth',
    createAuthRouter({
      authService: authService as AuthService,
      jwtSecret: JWT_SECRET,
      isProduction: false,
      enterpriseSecurityService: {} as EnterpriseSecurityService,
    }),
  );
  return app;
}

async function postRefresh(app: express.Express, refreshToken?: string) {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  try {
    const headers: Record<string, string> = {};
    if (refreshToken) {
      headers.Cookie = `${REFRESH_COOKIE}=${refreshToken}`;
    }

    const response = await fetch(`http://127.0.0.1:${port}/auth/refresh`, {
      method: 'POST',
      headers,
    });
    const payload = (await response.json()) as {
      data?: { user?: { id?: string }; session?: { accessToken?: string } };
      error?: { code?: string; message?: string };
    };
    return { status: response.status, payload };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe('POST /auth/refresh — session expiry bootstrap contract', () => {
  it('returns SESSION_MISSING when no refresh cookie is present', async () => {
    const app = buildApp(baseAuthService());
    const result = await postRefresh(app);

    assert.equal(result.status, 401);
    assert.equal(result.payload.error?.code, 'SESSION_MISSING');
    assert.match(String(result.payload.error?.message ?? ''), /missing/i);
  });

  it('returns SESSION_EXPIRED when refresh token is expired or revoked', async () => {
    const app = buildApp(
      baseAuthService({
        refresh: async () => {
          throw new AuthError('SESSION_EXPIRED', 'Session expired. Please sign in again.');
        },
      }),
    );

    const result = await postRefresh(app, 'expired-token');

    assert.equal(result.status, 401);
    assert.equal(result.payload.error?.code, 'SESSION_EXPIRED');
    assert.match(String(result.payload.error?.message ?? ''), /sign in again/i);
  });

  it('returns SESSION_INVALID as 401 when refresh token is malformed', async () => {
    const app = buildApp(
      baseAuthService({
        refresh: async () => {
          throw new AuthError('SESSION_INVALID', 'Session invalid');
        },
      }),
    );

    const result = await postRefresh(app, 'invalid-token');

    assert.equal(result.status, 401);
    assert.equal(result.payload.error?.code, 'SESSION_INVALID');
  });

  it('issues a new access token when refresh cookie is valid', async () => {
    const app = buildApp(baseAuthService());
    const result = await postRefresh(app, 'valid-refresh-token');

    assert.equal(result.status, 200);
    assert.equal(result.payload.data?.user?.id, 'user-1');
    assert.equal(result.payload.data?.session?.accessToken, 'access-token');
  });
});
