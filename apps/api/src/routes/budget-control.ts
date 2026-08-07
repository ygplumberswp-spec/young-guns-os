import { Router } from 'express';
import { z } from 'zod';
import { canViewBudgetControl, canWriteBudgetControl } from '@titan/shared';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import type { DatabaseClient } from '@titan/db';
import {
  BudgetControlError,
  BudgetControlService,
} from '../services/budget-control.service.js';

type RouterDeps = {
  budgetControlService: BudgetControlService;
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
  if (error instanceof BudgetControlError) {
    const status =
      error.code === 'FORBIDDEN' ? 403 : error.code === 'VALIDATION_ERROR' ? 400 : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

const monthParam = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/);

const upsertSchema = z.object({
  revenueTargetCents: z.number().int().nullable().optional(),
  grossMarginTargetPct: z.number().nullable().optional(),
  grossProfitTargetCents: z.number().int().nullable().optional(),
  overheadBudgetCents: z.number().int().nullable().optional(),
  operatingProfitTargetCents: z.number().int().nullable().optional(),
  cashCollectionTargetCents: z.number().int().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  currency: z.string().min(3).max(8).optional(),
  overheadLines: z
    .array(
      z.object({
        category: z.string().min(1).max(64),
        budgetCents: z.number().int().min(0),
      }),
    )
    .optional(),
});

/**
 * FIN-004 routes — mounted under /api/v1/finance
 * GET  /budget-control?month=YYYY-MM
 * PUT  /budget-control/:month
 * GET  /budget-control/:month/actuals
 * GET  /budget-control/:month/forecast
 */
export function createBudgetControlRouter({
  budgetControlService,
  db,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const denyTechnician = createDenyTechnicianFromOwnerModules(db);
  const requireRead = requireAnyPermission('finance:read', 'finance:write', '*');
  const requireWrite = requireAnyPermission('finance:write', '*');

  router.use(requireAuth, denyTechnician);

  router.get('/budget-control', requireRead, async (req, res) => {
    if (!canViewBudgetControl(getAuth(req))) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Budget control requires finance access.' },
      });
      return;
    }
    try {
      const month =
        typeof req.query.month === 'string' ? req.query.month : undefined;
      if (month && !monthParam.safeParse(month).success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid month. Use YYYY-MM.' },
        });
        return;
      }
      const data = await budgetControlService.getDashboard(toActor(req), month);
      res.json({ data });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.put('/budget-control/:month', requireWrite, async (req, res) => {
    if (!canWriteBudgetControl(getAuth(req))) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Budget plan updates require Owner or finance:write.',
        },
      });
      return;
    }
    const monthParsed = monthParam.safeParse(req.params.month);
    if (!monthParsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid month. Use YYYY-MM.' },
      });
      return;
    }
    const body = upsertSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: body.error.message },
      });
      return;
    }
    try {
      const plan = await budgetControlService.upsertPlan(
        toActor(req),
        monthParsed.data,
        body.data,
      );
      res.json({ data: plan });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/budget-control/:month/actuals', requireRead, async (req, res) => {
    if (!canViewBudgetControl(getAuth(req))) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Budget control requires finance access.' },
      });
      return;
    }
    const monthParsed = monthParam.safeParse(req.params.month);
    if (!monthParsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid month. Use YYYY-MM.' },
      });
      return;
    }
    try {
      const dashboard = await budgetControlService.getDashboard(
        toActor(req),
        monthParsed.data,
      );
      res.json({
        data: {
          actuals: dashboard.actuals,
          compares: dashboard.compares,
          sourceTrace: dashboard.actuals.sourceTrace,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/budget-control/:month/forecast', requireRead, async (req, res) => {
    if (!canViewBudgetControl(getAuth(req))) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Budget control requires finance access.' },
      });
      return;
    }
    const monthParsed = monthParam.safeParse(req.params.month);
    if (!monthParsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid month. Use YYYY-MM.' },
      });
      return;
    }
    try {
      const dashboard = await budgetControlService.getDashboard(
        toActor(req),
        monthParsed.data,
      );
      res.json({
        data: {
          forecast: dashboard.forecast,
          note: 'FORECAST is a run-rate estimate — never actual financial truth.',
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
