import { Router, type Response } from 'express';
import type { Logger } from 'pino';
import { z } from 'zod';
import { validatePasswordStrength } from '@titan/auth';
import type { AuthService } from '../services/auth.service.js';
import { AuthError } from '../services/auth.service.js';
import type { EnterpriseSecurityService } from '../services/enterprise-security.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { aiRoutingCache } from '../services/ai-routing-cache.js';

const signupSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128),
});

const acceptInviteSchema = z.object({
  token: z.string().trim().min(1),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(128),
});

const REFRESH_COOKIE_NAME = 'titan_refresh_token';

type AuthRouterDeps = {
  authService: AuthService;
  jwtSecret: string;
  isProduction: boolean;
  logger?: Logger;
  enterpriseSecurityService?: EnterpriseSecurityService;
};

export function createAuthRouter({
  authService,
  jwtSecret,
  isProduction,
  logger,
  enterpriseSecurityService,
}: AuthRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const authLog = logger?.child({ module: 'auth' });

  router.post('/signup', async (req, res) => {
    const parsed = signupSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid signup data',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    const passwordError = validatePasswordStrength(parsed.data.password);

    if (passwordError) {
      res.status(400).json({
        error: {
          code: 'WEAK_PASSWORD',
          message: passwordError,
        },
      });
      return;
    }

    authLog?.info({ email: parsed.data.email, companyName: parsed.data.companyName }, 'Signup request received');

    try {
      authLog?.debug({ email: parsed.data.email }, 'Creating company, roles, and user');
      const result = await authService.signup({
        ...parsed.data,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });

      authLog?.info(
        { userId: result.user.id, companyId: result.user.companyId, sessionExpiresIn: result.session.expiresIn },
        'Signup succeeded — session created',
      );

      setRefreshCookie(res, result.refreshToken, isProduction);
      authLog?.debug({ userId: result.user.id }, 'Refresh cookie set');

      res.status(201).json({
        data: {
          user: result.user,
          session: result.session,
        },
      });
    } catch (error) {
      handleAuthError(res, error, authLog);
    }
  });

  router.post('/login', async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid login data',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    authLog?.info({ email: parsed.data.email, ip: req.ip }, 'Login request received');

    try {
      authLog?.debug({ email: parsed.data.email }, 'Looking up user and verifying password');
      const result = await authService.login({
        ...parsed.data,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });

      authLog?.info(
        { userId: result.user.id, companyId: result.user.companyId, sessionExpiresIn: result.session.expiresIn },
        'Login succeeded — JWT issued',
      );

      await recordSecurityLoginEvent(enterpriseSecurityService, authLog, {
        companyId: result.user.companyId,
        userId: result.user.id,
        eventType: 'login_success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      setRefreshCookie(res, result.refreshToken, isProduction);
      authLog?.debug({ userId: result.user.id }, 'Refresh cookie set');

      res.json({
        data: {
          user: result.user,
          session: result.session,
        },
      });
    } catch (error) {
      if (error instanceof AuthError && error.code === 'INVALID_CREDENTIALS') {
        await recordSecurityLoginEvent(enterpriseSecurityService, authLog, {
          eventType: 'login_failed',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { email: parsed.data.email },
        });
      }
      handleAuthError(res, error, authLog);
    }
  });

  router.get('/invites/preview', async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';

    if (!token) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invite token is required',
        },
      });
      return;
    }

    try {
      const preview = await authService.getInvitePreview(token);
      res.json({ data: { preview } });
    } catch (error) {
      handleAuthError(res, error, authLog);
    }
  });

  router.post('/accept-invite', async (req, res) => {
    const parsed = acceptInviteSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid invite acceptance payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    const passwordError = validatePasswordStrength(parsed.data.password);

    if (passwordError) {
      res.status(400).json({
        error: {
          code: 'WEAK_PASSWORD',
          message: passwordError,
        },
      });
      return;
    }

    try {
      const result = await authService.acceptInvite({
        ...parsed.data,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });

      setRefreshCookie(res, result.refreshToken, isProduction);

      res.status(201).json({
        data: {
          user: result.user,
          session: result.session,
        },
      });
    } catch (error) {
      handleAuthError(res, error, authLog);
    }
  });

  router.post('/logout', async (req, res) => {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    const authHeader = req.headers.authorization;
    let authContext: AuthenticatedRequest['auth'] | undefined;

    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice('Bearer '.length);
        const payload = (await import('@titan/auth')).verifyAccessToken(token, jwtSecret);
        authContext = {
          userId: payload.sub,
          companyId: payload.companyId,
          roleId: payload.roleId,
          roleName: payload.roleName,
          sessionId: payload.sessionId,
          permissions: payload.permissions,
        };
      } catch {
        authContext = undefined;
      }
    }

    if (refreshToken) {
      await authService.logout(refreshToken);
    }

    if (authContext) {
      aiRoutingCache.invalidateTenant(authContext.companyId);
      await recordSecurityLoginEvent(enterpriseSecurityService, authLog, {
        companyId: authContext.companyId,
        userId: authContext.userId,
        eventType: 'logout',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }

    clearRefreshCookie(res, isProduction);

    res.json({
      data: { success: true },
    });
  });

  router.post('/refresh', async (req, res) => {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;

    if (!refreshToken) {
      authLog?.debug('Refresh request without cookie — expected before login');
      res.status(401).json({
        error: {
          code: 'SESSION_MISSING',
          message: 'Refresh token missing',
        },
      });
      return;
    }

    authLog?.debug('Refresh request received — validating refresh token');

    try {
      const result = await authService.refresh(refreshToken);
      authLog?.info(
        { userId: result.user.id, sessionExpiresIn: result.session.expiresIn },
        'Refresh succeeded — new access token issued',
      );
      setRefreshCookie(res, result.refreshToken, isProduction);

      res.json({
        data: {
          user: result.user,
          session: result.session,
        },
      });
    } catch (error) {
      clearRefreshCookie(res, isProduction);
      handleAuthError(res, error, authLog);
    }
  });

  router.get('/me', requireAuth, async (req, res) => {
    const { userId } = (req as AuthenticatedRequest).auth;
    const user = await authService.getUserById(userId);

    if (!user) {
      res.status(404).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
      return;
    }

    res.json({ data: { user } });
  });

  return router;
}

export { REFRESH_COOKIE_NAME };

function setRefreshCookie(
  res: import('express').Response,
  refreshToken: string,
  isProduction: boolean,
) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res: import('express').Response, isProduction: boolean) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api/v1/auth',
  });
}

type SecurityLoginEventInput = Parameters<EnterpriseSecurityService['recordLoginEvent']>[0];

async function recordSecurityLoginEvent(
  enterpriseSecurityService: EnterpriseSecurityService | undefined,
  authLog: Logger | undefined,
  input: SecurityLoginEventInput,
): Promise<void> {
  if (!enterpriseSecurityService) {
    return;
  }

  try {
    await enterpriseSecurityService.recordLoginEvent(input);
  } catch (error) {
    authLog?.warn({ err: error, eventType: input.eventType }, 'Security login event logging failed — auth continues');
  }
}

function isDatabaseUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const causeMessage =
    error.cause instanceof Error ? error.cause.message.toLowerCase() : String(error.cause ?? '').toLowerCase();

  return (
    message.includes('connect') ||
    message.includes('econnrefused') ||
    message.includes('timeout') ||
    causeMessage.includes('connect') ||
    causeMessage.includes('econnrefused') ||
    causeMessage.includes('timeout')
  );
}

function handleAuthError(res: Response, error: unknown, authLog?: Logger) {
  if (error instanceof AuthError) {
    const status =
      error.code === 'INVALID_CREDENTIALS'
        ? 401
        : error.code === 'EMAIL_IN_USE'
          ? 409
          : error.code === 'USER_NOT_FOUND'
            ? 404
            : error.code === 'SESSION_EXPIRED' || error.code === 'SESSION_INVALID'
              ? 401
              : error.code === 'INVITE_INVALID'
                ? 400
                : error.code === 'SIGNUP_FAILED' || error.code === 'SESSION_FAILED'
                  ? 503
                  : 400;

    authLog?.info({ code: error.code, status }, 'Auth request rejected');
    res.status(status).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  authLog?.error({ err: error }, 'Unexpected auth error');

  if (isDatabaseUnavailable(error)) {
    res.status(503).json({
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Authentication service is temporarily unavailable. Please try again.',
      },
    });
    return;
  }

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
