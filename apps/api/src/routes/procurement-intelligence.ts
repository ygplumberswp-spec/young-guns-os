import { Router } from 'express';
import { z } from 'zod';
import type { ProcurementIntelligenceService } from '../services/procurement-intelligence.service.js';
import {
  ProcurementIntelligenceError,
  type PiActor,
} from '../services/procurement-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const refreshRecommendationsSchema = z.object({
  submitForApproval: z.boolean().optional(),
});

const decideRecommendationSchema = z.object({
  decision: z.enum(['approve', 'reject', 'accept']),
  notes: z.string().trim().max(2000).optional(),
  createDraftPurchaseOrder: z.boolean().optional(),
});

const refreshComparisonsSchema = z.object({
  productKey: z.string().trim().max(200).optional(),
});

const updateSettingsSchema = z.object({
  recommendationsEnabled: z.boolean().optional(),
  costComparisonsEnabled: z.boolean().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

const createInsightSchema = z.object({
  target: z.enum([
    'command_centre',
    'executive_dashboard',
    'inventory_intelligence',
    'procurement',
    'operations',
    'inventory',
  ]),
  title: z.string().trim().min(1).max(200),
  insight: z.string().trim().min(1).max(5000),
  href: z.string().trim().max(500).optional(),
  sourceRecommendationId: z.string().uuid().optional(),
  sourceCostComparisonId: z.string().uuid().optional(),
});

const ackInsightSchema = z.object({
  status: z.enum(['acknowledged', 'dismissed']),
});

type RouterDeps = {
  procurementIntelligenceService: ProcurementIntelligenceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): PiActor {
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
  if (error instanceof ProcurementIntelligenceError) {
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

/** Deny Technician/Client even if a wildcard somehow appears on the token. */
function denyTechnicianClient(
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
): void {
  const role = getAuth(req).roleName;
  if (role === 'Technician' || role === 'Client') {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message:
          'Supplier & Procurement Intelligence is Owner / procurement-access only. Technician and Client are denied.',
      },
    });
    return;
  }
  next();
}

export function createProcurementIntelligenceRouter({
  procurementIntelligenceService,
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
  router.use(denyTechnicianClient);
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
      const dashboard = await procurementIntelligenceService.getDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          autoPurchase: false as const,
          inventedSuppliers: false as const,
          inventedPrices: false as const,
          fakePurchaseOrders: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/recommendations/refresh', requireWrite, async (req, res) => {
    try {
      const body = refreshRecommendationsSchema.parse(req.body ?? {});
      const result = await procurementIntelligenceService.refreshRecommendations(
        toActor(req),
        body,
      );
      res.status(201).json({
        data: {
          ...result,
          autoPurchase: false as const,
          purchaseOrderOrdered: false as const,
          inventedPrices: false as const,
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
      const recommendation = await procurementIntelligenceService.decideRecommendation(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          recommendation,
          autoPurchase: false as const,
          purchaseOrderOrdered: false as const,
          draftPurchaseOrderId: recommendation.draftPurchaseOrderId,
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

  router.post('/cost-comparisons/refresh', requireWrite, async (req, res) => {
    try {
      const body = refreshComparisonsSchema.parse(req.body ?? {});
      const result = await procurementIntelligenceService.refreshCostComparisons(
        toActor(req),
        body,
      );
      res.status(201).json({
        data: {
          ...result,
          inventedPrices: false as const,
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

  router.patch('/settings', requireWrite, async (req, res) => {
    try {
      const body = updateSettingsSchema.parse(req.body ?? {});
      const settings = await procurementIntelligenceService.updateSettings(toActor(req), body);
      res.json({
        data: {
          settings,
          autoPurchaseEnabled: false as const,
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
      const insight = await procurementIntelligenceService.createAuraInsight(toActor(req), body);
      res.status(201).json({
        data: {
          insight,
          autoPurchase: false as const,
          invented: false as const,
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
      const insight = await procurementIntelligenceService.acknowledgeInsight(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          insight,
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

  return router;
}
