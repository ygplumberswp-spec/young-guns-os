import { Router } from 'express';
import { z } from 'zod';
import { canViewProfitAnalytics } from '@titan/shared';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import type { DatabaseClient } from '@titan/db';
import {
  ProfitAnalyticsError,
  ProfitAnalyticsService,
} from '../services/profit-analytics.service.js';

type RouterDeps = {
  profitAnalyticsService: ProfitAnalyticsService;
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
  if (error instanceof ProfitAnalyticsError) {
    const status = error.code === 'FORBIDDEN' ? 403 : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

const periodSchema = z.object({
  period: z.enum(['week', 'month', 'last_month', 'custom']).optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * FIN-002 routes — mounted under /api/v1/finance
 * GET /profit-analytics/overview  (full dashboard envelope)
 * GET /profit-analytics/jobs
 * GET /profit-analytics/services
 * GET /profit-analytics/customers
 * GET /profit-analytics/labour
 * GET /profit-analytics/suppliers
 */
export function createProfitAnalyticsRouter({
  profitAnalyticsService,
  db,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const denyTechnician = createDenyTechnicianFromOwnerModules(db);
  const requireRead = requireAnyPermission('finance:read', 'finance:write', '*');

  router.use(requireAuth, denyTechnician);

  async function loadDashboard(req: import('express').Request) {
    const parsed = periodSchema.safeParse(req.query);
    if (!parsed.success) {
      return { error: parsed.error.message as string };
    }
    const data = await profitAnalyticsService.getDashboard(toActor(req), parsed.data);
    return { data };
  }

  router.get('/profit-analytics/overview', requireRead, async (req, res) => {
    if (!canViewProfitAnalytics(getAuth(req))) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Profit analytics requires finance access.' },
      });
      return;
    }
    try {
      const result = await loadDashboard(req);
      if ('error' in result && result.error) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: result.error } });
        return;
      }
      res.json({ data: result.data });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/profit-analytics/jobs', requireRead, async (req, res) => {
    if (!canViewProfitAnalytics(getAuth(req))) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Profit analytics requires finance access.' },
      });
      return;
    }
    const parsed = periodSchema
      .extend({
        page: z.coerce.number().int().min(1).optional(),
        pageSize: z.coerce.number().int().min(1).max(200).optional(),
        list: z
          .enum(['all', 'top_profit', 'lowest_margin', 'loss', 'margin_misses', 'incomplete'])
          .optional(),
      })
      .safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      });
      return;
    }
    try {
      const data = await profitAnalyticsService.getJobsPage(toActor(req), parsed.data);
      res.json({ data });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/profit-analytics/services', requireRead, async (req, res) => {
    if (!canViewProfitAnalytics(getAuth(req))) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Profit analytics requires finance access.' },
      });
      return;
    }
    try {
      const result = await loadDashboard(req);
      if ('error' in result && result.error) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: result.error } });
        return;
      }
      res.json({ data: result.data!.services });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/profit-analytics/customers', requireRead, async (req, res) => {
    if (!canViewProfitAnalytics(getAuth(req))) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Profit analytics requires finance access.' },
      });
      return;
    }
    try {
      const result = await loadDashboard(req);
      if ('error' in result && result.error) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: result.error } });
        return;
      }
      res.json({ data: result.data!.customers });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/profit-analytics/labour', requireRead, async (req, res) => {
    if (!canViewProfitAnalytics(getAuth(req))) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Profit analytics requires finance access.' },
      });
      return;
    }
    try {
      const result = await loadDashboard(req);
      if ('error' in result && result.error) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: result.error } });
        return;
      }
      res.json({
        data: {
          labour: result.data!.labour,
          technicians: result.data!.technicians,
          materials: result.data!.materials,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/profit-analytics/suppliers', requireRead, async (req, res) => {
    if (!canViewProfitAnalytics(getAuth(req))) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Profit analytics requires finance access.' },
      });
      return;
    }
    try {
      const result = await loadDashboard(req);
      if ('error' in result && result.error) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: result.error } });
        return;
      }
      res.json({ data: result.data!.suppliers });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
