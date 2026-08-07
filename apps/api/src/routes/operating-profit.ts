import { Router } from 'express';
import { z } from 'zod';
import { canViewOperatingProfit } from '@titan/shared';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import type { DatabaseClient } from '@titan/db';
import {
  OperatingProfitError,
  OperatingProfitService,
} from '../services/operating-profit.service.js';

type RouterDeps = {
  operatingProfitService: OperatingProfitService;
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
  if (error instanceof OperatingProfitError) {
    const status = error.code === 'FORBIDDEN' ? 403 : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

const periodSchema = z.object({
  period: z.enum(['today', 'week', 'month', 'last_month', 'custom']).optional(),
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/**
 * FIN-003 routes — mounted under /api/v1/finance
 * GET /operating-profit/summary
 * GET /operating-profit/overhead
 * GET /operating-profit/issues
 */
export function createOperatingProfitRouter({
  operatingProfitService,
  db,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const denyTechnician = createDenyTechnicianFromOwnerModules(db);
  const requireRead = requireAnyPermission('finance:read', 'finance:write', '*');

  router.use(requireAuth, denyTechnician);

  router.get('/operating-profit/summary', requireRead, async (req, res) => {
    if (!canViewOperatingProfit(getAuth(req))) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Operating profit requires finance access.' },
      });
      return;
    }
    const parsed = periodSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      });
      return;
    }
    try {
      const data = await operatingProfitService.getDashboard(toActor(req), parsed.data);
      res.json({ data });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/operating-profit/overhead', requireRead, async (req, res) => {
    if (!canViewOperatingProfit(getAuth(req))) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Operating profit requires finance access.' },
      });
      return;
    }
    const parsed = periodSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      });
      return;
    }
    try {
      const data = await operatingProfitService.getOverhead(toActor(req), parsed.data);
      res.json({ data });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/operating-profit/issues', requireRead, async (req, res) => {
    if (!canViewOperatingProfit(getAuth(req))) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Operating profit requires finance access.' },
      });
      return;
    }
    const parsed = periodSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      });
      return;
    }
    try {
      const data = await operatingProfitService.getIssues(toActor(req), parsed.data);
      res.json({ data });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
