import { Router } from 'express';
import type { CorporateDepartmentId } from '@titan/shared';
import { getCorporateDepartmentById } from '@titan/shared';
import type { CorporateDepartmentHubService } from '../services/corporate-department-hub.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

type CorporateDepartmentsRouterDeps = {
  corporateDepartmentHubService: CorporateDepartmentHubService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

export function createCorporateDepartmentsRouter({
  corporateDepartmentHubService,
  jwtSecret,
  authService,
}: CorporateDepartmentsRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);

  router.get(
    '/hub',
    requireAnyPermission('executive:read', 'analytics:read', 'ops:read', '*'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const hub = await corporateDepartmentHubService.getHub(companyId);
      res.json({ data: hub });
    },
  );

  router.get(
    '/:departmentId',
    requireAnyPermission('executive:read', 'analytics:read', 'ops:read', '*'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const departmentId = req.params.departmentId as CorporateDepartmentId;
      if (!getCorporateDepartmentById(departmentId)) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Unknown department' },
        });
        return;
      }
      const detail = await corporateDepartmentHubService.getDepartmentDetail(
        companyId,
        departmentId,
      );
      res.json({ data: detail });
    },
  );

  return router;
}
