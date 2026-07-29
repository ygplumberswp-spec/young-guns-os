import type { NextFunction, Request, Response } from 'express';
import { hasAnyPermission } from '@titan/auth';
import type { AuthenticatedRequest } from './auth.js';

export function requireAnyPermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;

    if (!auth) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    if (!hasAnyPermission(auth.permissions, permissions)) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to perform this action',
        },
      });
      return;
    }

    next();
  };
}
