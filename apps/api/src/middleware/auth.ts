import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '@titan/auth';
import type { AuthService } from '../services/auth.service.js';

export type AuthenticatedRequest = Request & {
  auth: {
    userId: string;
    companyId: string;
    roleId: string;
    roleName: string;
    sessionId: string;
    permissions: string[];
  };
};

type AuthMiddlewareDeps = {
  jwtSecret: string;
  authService: AuthService;
};

export function createAuthMiddleware({ jwtSecret, authService }: AuthMiddlewareDeps) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    const token = header.slice('Bearer '.length);

    try {
      const payload = verifyAccessToken(token, jwtSecret);
      const sessionValid = await authService.validateSession(payload.sessionId, payload.sub);

      if (!sessionValid) {
        res.status(401).json({
          error: {
            code: 'SESSION_INVALID',
            message: 'Session expired or revoked',
          },
        });
        return;
      }

      (req as AuthenticatedRequest).auth = {
        userId: payload.sub,
        companyId: payload.companyId,
        roleId: payload.roleId,
        roleName: payload.roleName,
        sessionId: payload.sessionId,
        permissions: payload.permissions,
      };

      next();
    } catch {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired access token',
        },
      });
    }
  };
}
