import { Router } from 'express';
import { z } from 'zod';
import type { PortalAuthService } from '../services/portal-auth.service.js';
import { PortalAuthError } from '../services/portal-auth.service.js';
import {
  createPortalAuthMiddleware,
  type PortalAuthenticatedRequest,
} from '../middleware/portal-auth.js';

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128),
});

export const PORTAL_REFRESH_COOKIE_NAME = 'titan_portal_refresh_token';

type PortalAuthRouterDeps = {
  portalAuthService: PortalAuthService;
  jwtSecret: string;
  isProduction: boolean;
};

export function createPortalAuthRouter({
  portalAuthService,
  jwtSecret,
  isProduction,
}: PortalAuthRouterDeps): Router {
  const router = Router();
  const requirePortalAuth = createPortalAuthMiddleware({ jwtSecret, portalAuthService });

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

    try {
      const result = await portalAuthService.login({
        ...parsed.data,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });

      setRefreshCookie(res, result.refreshToken, isProduction);

      res.json({
        data: {
          user: result.user,
          session: result.session,
        },
      });
    } catch (error) {
      handlePortalAuthError(res, error);
    }
  });

  router.post('/logout', async (req, res) => {
    const refreshToken = req.cookies?.[PORTAL_REFRESH_COOKIE_NAME] as string | undefined;

    if (refreshToken) {
      await portalAuthService.logout(refreshToken);
    }

    clearRefreshCookie(res, isProduction);
    res.json({ data: { success: true } });
  });

  router.post('/refresh', async (req, res) => {
    const refreshToken = req.cookies?.[PORTAL_REFRESH_COOKIE_NAME] as string | undefined;

    if (!refreshToken) {
      res.status(401).json({
        error: {
          code: 'SESSION_EXPIRED',
          message: 'Portal session expired. Please sign in again.',
        },
      });
      return;
    }

    try {
      const result = await portalAuthService.refresh(refreshToken);
      setRefreshCookie(res, result.refreshToken, isProduction);

      res.json({
        data: {
          user: result.user,
          session: result.session,
        },
      });
    } catch (error) {
      clearRefreshCookie(res, isProduction);
      handlePortalAuthError(res, error);
    }
  });

  router.get('/me', requirePortalAuth, async (req, res) => {
    const { portalUserId } = (req as PortalAuthenticatedRequest).portalAuth;
    const user = await portalAuthService.getPortalUserById(portalUserId);

    if (!user) {
      res.status(404).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Portal user not found',
        },
      });
      return;
    }

    res.json({ data: { user } });
  });

  return router;
}

function setRefreshCookie(
  res: import('express').Response,
  refreshToken: string,
  isProduction: boolean,
) {
  res.cookie(PORTAL_REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api/v1/portal/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res: import('express').Response, isProduction: boolean) {
  res.clearCookie(PORTAL_REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api/v1/portal/auth',
  });
}

function handlePortalAuthError(res: import('express').Response, error: unknown) {
  if (error instanceof PortalAuthError) {
    const status =
      error.code === 'INVALID_CREDENTIALS' || error.code === 'SESSION_EXPIRED' ? 401 : 400;

    res.status(status).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  throw error;
}
