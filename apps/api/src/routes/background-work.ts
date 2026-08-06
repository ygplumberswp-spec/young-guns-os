import { Router } from 'express';
import type { BackgroundWorkOrchestratorService } from '../services/background-work-orchestrator.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

type RouterDeps = {
  backgroundWorkOrchestrator: BackgroundWorkOrchestratorService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

export function createBackgroundWorkRouter({
  backgroundWorkOrchestrator,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'integrations:read',
    'integrations:manage',
    'jobs:read',
    'jobs:manage',
    'crm:read',
    'crm:manage',
  );

  router.use(requireAuth);

  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/status', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const status = await backgroundWorkOrchestrator.getTenantBackgroundWorkStatus(companyId);
    res.json({ data: { status } });
  });

  return router;
}
