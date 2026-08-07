import { Router } from 'express';
import { z } from 'zod';
import type { StockForecastingService } from '../services/stock-forecasting.service.js';
import {
  StockForecastingError,
  type SfActor,
} from '../services/stock-forecasting.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const refreshForecastsSchema = z.object({
  windowDays: z.number().int().min(7).max(90).optional(),
  submitRecommendationsForApproval: z.boolean().optional(),
});

const decideRecommendationSchema = z.object({
  decision: z.enum(['approve', 'reject', 'accept']),
  notes: z.string().trim().max(2000).optional(),
  createDraftPurchaseOrder: z.boolean().optional(),
});

const updateSettingsSchema = z.object({
  forecastingEnabled: z.boolean().optional(),
  recommendationsEnabled: z.boolean().optional(),
  minIssueEvents: z.number().int().min(1).max(50).optional(),
  windowDays: z.number().int().min(7).max(90).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

const createInsightSchema = z.object({
  target: z.enum([
    'command_centre',
    'executive_dashboard',
    'inventory_intelligence',
    'procurement_intelligence',
    'procurement',
    'maintenance',
    'jobs',
    'inventory',
    'operations',
  ]),
  title: z.string().trim().min(1).max(200),
  insight: z.string().trim().min(1).max(5000),
  href: z.string().trim().max(500).optional(),
  sourceForecastId: z.string().uuid().optional(),
  sourceRecommendationId: z.string().uuid().optional(),
});

const ackInsightSchema = z.object({
  status: z.enum(['acknowledged', 'dismissed']),
});

type RouterDeps = {
  stockForecastingService: StockForecastingService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): SfActor {
  const auth = getAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function paramId(req: import('express').Request): string {
  const raw = req.params.id;
  return String(Array.isArray(raw) ? raw[0] : raw ?? '');
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof StockForecastingError) {
    const status =
      error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'INVALID_STATE'
            ? 409
            : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

export function createStockForecastingRouter({
  stockForecastingService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'inventory:read',
    'inventory:write',
    'procurement:read',
    'procurement:write',
    'agents:read',
  );
  const requireWrite = requireAnyPermission('inventory:write', 'procurement:write');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    try {
      await teamService.ensureDefaultRoles(getAuth(req).companyId);
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const dashboard = await stockForecastingService.getDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          autoReorder: false as const,
          autoPurchase: false as const,
          inventedDemand: false as const,
          fakeStock: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/forecasts/refresh', requireWrite, async (req, res) => {
    try {
      const body = refreshForecastsSchema.parse(req.body ?? {});
      const result = await stockForecastingService.refreshForecasts(toActor(req), body);
      res.status(201).json({
        data: {
          ...result,
          autoReorder: false as const,
          autoPurchase: false as const,
          inventedDemand: false as const,
          purchaseOrderCreated: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/recommendations/:id/decide', requireWrite, async (req, res) => {
    try {
      const body = decideRecommendationSchema.parse(req.body ?? {});
      const recommendation = await stockForecastingService.decideRecommendation(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          recommendation,
          autoReorder: false as const,
          autoPurchase: false as const,
          purchaseOrderCreated: false as const,
          stockMutated: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.patch('/settings', requireWrite, async (req, res) => {
    try {
      const body = updateSettingsSchema.parse(req.body ?? {});
      const settings = await stockForecastingService.updateSettings(toActor(req), body);
      res.json({
        data: {
          settings,
          autoReorder: false as const,
          autoPurchase: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/aura-insights', requireWrite, async (req, res) => {
    try {
      const body = createInsightSchema.parse(req.body ?? {});
      const insight = await stockForecastingService.createAuraInsight(toActor(req), body);
      res.status(201).json({
        data: {
          insight,
          autoReorder: false as const,
          inventedDemand: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/aura-insights/:id/acknowledge', requireWrite, async (req, res) => {
    try {
      const body = ackInsightSchema.parse(req.body ?? {});
      const insight = await stockForecastingService.acknowledgeInsight(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          insight,
          autoReorder: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
