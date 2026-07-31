import type { NextFunction, Request, Response } from 'express';
import { hasAnyPermission } from '@titan/auth';
import type { DatabaseClient } from '@titan/db';
import type { AuthenticatedRequest } from './auth.js';
import { recordAuthorizationFailure } from './authorization-guards.js';

let auditDb: DatabaseClient | null = null;

/** Wire once at API boot so permission denials are written to security_audit_logs. */
export function configureRbacAudit(db: DatabaseClient): void {
  auditDb = db;
}

export function getRbacAuditDb(): DatabaseClient | null {
  return auditDb;
}

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
      if (auditDb) {
        void recordAuthorizationFailure(auditDb, {
          companyId: auth.companyId,
          userId: auth.userId,
          sessionId: auth.sessionId,
          action: 'permission_denied',
          metadata: {
            path: req.path,
            method: req.method,
            roleName: auth.roleName,
            requiredPermissions: permissions,
          },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        }).catch(() => {
          /* never block the 403 on audit failure */
        });
      }
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
