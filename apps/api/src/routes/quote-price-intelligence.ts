import { Router } from 'express';
import type { DatabaseClient } from '@titan/db';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import {
  QuotePriceIntelligenceService,
  QuotePriceIntelligenceServiceError,
} from '../services/quote-price-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';

type Deps = {
  quotePriceIntelligenceService: QuotePriceIntelligenceService;
  teamService: TeamService;
  db: DatabaseClient;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

export function createQuotePriceIntelligenceRouter({
  quotePriceIntelligenceService,
  teamService,
  db,
  jwtSecret,
  authService,
}: Deps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const denyTechnician = createDenyTechnicianFromOwnerModules(db);

  router.use(requireAuth);
  router.use(denyTechnician);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get(
    '/quotes/:quoteId/price-intelligence',
    requireAnyPermission('finance:read', 'finance:write', '*'),
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const data = await quotePriceIntelligenceService.getIntelligence(
          {
            companyId: auth.companyId,
            userId: auth.userId,
            roleName: auth.roleName,
            permissions: auth.permissions,
          },
          String(req.params.quoteId),
        );
        res.json({ data });
      } catch (error) {
        if (error instanceof QuotePriceIntelligenceServiceError) {
          res.status(error.status).json({
            error: { code: error.code, message: error.message },
          });
          return;
        }
        console.error('[quote-price-intelligence]', error);
        res.status(500).json({
          error: { code: 'INTERNAL_ERROR', message: 'Quote price intelligence failed' },
        });
      }
    },
  );

  return router;
}
