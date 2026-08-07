import { Router } from 'express';
import { z } from 'zod';
import { canViewGrowthPlanner } from '@titan/shared';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import type { DatabaseClient } from '@titan/db';
import {
  GrowthPlannerError,
  GrowthPlannerService,
} from '../services/growth-planner.service.js';

type RouterDeps = {
  growthPlannerService: GrowthPlannerService;
  db: DatabaseClient;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request) {
  const auth = getAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof GrowthPlannerError) {
    const status = error.code === 'FORBIDDEN' ? 403 : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

const monthSchema = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).optional();

/**
 * GROWTH-001 routes — mounted under /api/v1/finance
 * GET /growth-planner
 * GET /growth-planner/scenarios
 */
export function createGrowthPlannerRouter({
  growthPlannerService,
  db,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const denyTechnician = createDenyTechnicianFromOwnerModules(db);
  const requireRead = requireAnyPermission('finance:read', 'finance:write', '*');

  router.use(requireAuth, denyTechnician);

  router.get('/growth-planner', requireRead, async (req, res) => {
    if (!canViewGrowthPlanner(getAuth(req))) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Growth planner requires finance access.' },
      });
      return;
    }
    const month =
      typeof req.query.month === 'string' ? req.query.month : undefined;
    if (month && !monthSchema.safeParse(month).success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid month. Use YYYY-MM.' },
      });
      return;
    }
    try {
      const data = await growthPlannerService.getPlan(toActor(req), month);
      res.json({ data });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/growth-planner/scenarios', requireRead, async (req, res) => {
    if (!canViewGrowthPlanner(getAuth(req))) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Growth planner requires finance access.' },
      });
      return;
    }
    const month =
      typeof req.query.month === 'string' ? req.query.month : undefined;
    if (month && !monthSchema.safeParse(month).success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid month. Use YYYY-MM.' },
      });
      return;
    }
    try {
      const data = await growthPlannerService.getScenarios(toActor(req), month);
      res.json({ data });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
