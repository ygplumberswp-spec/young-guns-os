import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedRequest } from './auth.js';
import type { EnterpriseSecurityService } from '../services/enterprise-security.service.js';

type ZeroTrustDeps = {
  enterpriseSecurityService: EnterpriseSecurityService;
};

export function createZeroTrustMiddleware({ enterpriseSecurityService }: ZeroTrustDeps) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) {
      next();
      return;
    }

    const deviceFingerprint =
      typeof req.headers['x-titan-device-fingerprint'] === 'string'
        ? req.headers['x-titan-device-fingerprint']
        : undefined;

    try {
      const validation = await enterpriseSecurityService.validateZeroTrustRequest({
        companyId: auth.companyId,
        userId: auth.userId,
        sessionId: auth.sessionId,
        roleId: auth.roleId,
        permissions: auth.permissions,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        deviceFingerprint,
        method: req.method,
        path: req.path,
      });

      if (!validation.allowed) {
        res.status(validation.statusCode ?? 403).json({
          error: {
            code: validation.code ?? 'ZERO_TRUST_DENIED',
            message: validation.message ?? 'Request denied by zero-trust policy',
          },
        });
        return;
      }

      if (validation.touchDevice && deviceFingerprint) {
        await enterpriseSecurityService.touchTrustedDevice({
          companyId: auth.companyId,
          userId: auth.userId,
          deviceFingerprint,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
