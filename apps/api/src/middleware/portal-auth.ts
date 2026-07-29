import type { NextFunction, Request, Response } from 'express';
import { verifyPortalAccessToken } from '@titan/auth';
import type { PortalAccessPermission } from '@titan/shared';
import { isPortalAccessPermission } from '@titan/shared';
import type { PortalAuthService } from '../services/portal-auth.service.js';

export type PortalAuthenticatedRequest = Request & {
  portalAuth: {
    portalUserId: string;
    companyId: string;
    customerId: string;
    sessionId: string;
    permissions: PortalAccessPermission[];
  };
};

type PortalAuthMiddlewareDeps = {
  jwtSecret: string;
  portalAuthService: PortalAuthService;
};

export function createPortalAuthMiddleware({
  jwtSecret,
  portalAuthService,
}: PortalAuthMiddlewareDeps) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Portal authentication required',
        },
      });
      return;
    }

    const token = header.slice('Bearer '.length);

    try {
      const payload = verifyPortalAccessToken(token, jwtSecret);
      const sessionValid = await portalAuthService.validateSession(payload.sessionId, payload.sub);

      if (!sessionValid) {
        res.status(401).json({
          error: {
            code: 'SESSION_INVALID',
            message: 'Portal session expired or revoked',
          },
        });
        return;
      }

      (req as PortalAuthenticatedRequest).portalAuth = {
        portalUserId: payload.sub,
        companyId: payload.companyId,
        customerId: payload.customerId,
        sessionId: payload.sessionId,
        permissions: payload.permissions.filter(isPortalAccessPermission),
      };

      next();
    } catch {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired portal access token',
        },
      });
    }
  };
}

export function requirePortalPermission(...required: PortalAccessPermission[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as PortalAuthenticatedRequest).portalAuth;
    const allowed = required.some((permission) => auth.permissions.includes(permission));

    if (!allowed) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Portal permission denied',
        },
      });
      return;
    }

    next();
  };
}
