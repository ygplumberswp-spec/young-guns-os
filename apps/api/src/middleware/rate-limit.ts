import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedRequest } from './auth.js';
import type { EnterpriseSecurityService } from '../services/enterprise-security.service.js';

type RateLimitDeps = {
  enterpriseSecurityService: EnterpriseSecurityService;
  maxRequestsPerWindow?: number;
  windowMs?: number;
};

export function createRateLimitMiddleware({
  enterpriseSecurityService,
  maxRequestsPerWindow = 600,
  windowMs = 60_000,
}: RateLimitDeps) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) {
      next();
      return;
    }

    try {
      const result = await enterpriseSecurityService.checkRateLimit({
        companyId: auth.companyId,
        userId: auth.userId,
        maxRequests: maxRequestsPerWindow,
        windowMs,
      });

      res.setHeader('X-RateLimit-Limit', String(maxRequestsPerWindow));
      res.setHeader('X-RateLimit-Remaining', String(result.remaining));
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));

      if (!result.allowed) {
        res.status(429).json({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'API rate limit exceeded for this tenant',
          },
        });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
