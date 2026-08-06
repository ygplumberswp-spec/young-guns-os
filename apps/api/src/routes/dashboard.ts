import { Router } from 'express';
import type { DashboardExecutiveService } from '../services/dashboard-executive.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

type DashboardRouterDeps = {
  dashboardExecutiveService: DashboardExecutiveService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

export function createDashboardRouter({
  dashboardExecutiveService,
  jwtSecret,
  authService,
}: DashboardRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);

  router.get(
    '/executive-summary',
    requireAnyPermission(
      'jobs:read',
      'jobs:write',
      'finance:read',
      'finance:write',
      'intelligence:read',
      'executive:read',
      'dispatch:read',
    ),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const summary = await dashboardExecutiveService.getExecutiveSummary(companyId);
      res.json({ data: summary });
    },
  );

  return router;
}
