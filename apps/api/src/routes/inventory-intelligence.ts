import { Router } from 'express';
import { z } from 'zod';
import type { InventoryIntelligenceService } from '../services/inventory-intelligence.service.js';
import {
  InventoryIntelligenceError,
  type InvIntelActor,
} from '../services/inventory-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const refreshAlertsSchema = z.object({
  submitForApproval: z.boolean().optional(),
});

const decideAlertSchema = z.object({
  decision: z.enum(['approve', 'reject', 'acknowledge']),
  notes: z.string().trim().max(2000).optional(),
});

const refreshUsageSchema = z.object({
  windowDays: z.number().int().min(1).max(90).optional(),
});

const updateSettingsSchema = z.object({
  alertDraftsEnabled: z.boolean().optional(),
  usageSignalsEnabled: z.boolean().optional(),
  shortageThresholdMode: z.enum(['reorder_level', 'zero_only']).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

const createInsightSchema = z.object({
  target: z.enum([
    'command_centre',
    'executive_dashboard',
    'procurement',
    'operations',
    'jobs',
    'inventory',
  ]),
  title: z.string().trim().min(1).max(200),
  insight: z.string().trim().min(1).max(5000),
  href: z.string().trim().max(500).optional(),
  sourceAlertId: z.string().uuid().optional(),
  sourceUsageSignalId: z.string().uuid().optional(),
});

const ackInsightSchema = z.object({
  status: z.enum(['acknowledged', 'dismissed']),
});

type RouterDeps = {
  inventoryIntelligenceService: InventoryIntelligenceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): InvIntelActor {
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
  if (error instanceof InventoryIntelligenceError) {
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

export function createInventoryIntelligenceRouter({
  inventoryIntelligenceService,
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
      const dashboard = await inventoryIntelligenceService.getDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          autoReorder: false as const,
          autoStockMutation: false as const,
          inventedStock: false as const,
          fakeStock: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/alerts/refresh', requireWrite, async (req, res) => {
    try {
      const body = refreshAlertsSchema.parse(req.body ?? {});
      const result = await inventoryIntelligenceService.refreshAlertDrafts(toActor(req), body);
      res.status(201).json({
        data: {
          ...result,
          autoReorder: false as const,
          purchaseOrderCreated: false as const,
          inventedStock: false as const,
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

  router.post('/alerts/:id/decide', requireWrite, async (req, res) => {
    try {
      const body = decideAlertSchema.parse(req.body ?? {});
      const alert = await inventoryIntelligenceService.decideAlertDraft(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          alert,
          autoReorder: false as const,
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

  router.post('/usage/refresh', requireWrite, async (req, res) => {
    try {
      const body = refreshUsageSchema.parse(req.body ?? {});
      const result = await inventoryIntelligenceService.refreshUsageSignals(toActor(req), body);
      res.status(201).json({
        data: {
          ...result,
          inventedUsage: false as const,
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

  router.patch('/settings', requireWrite, async (req, res) => {
    try {
      const body = updateSettingsSchema.parse(req.body ?? {});
      const settings = await inventoryIntelligenceService.updateSettings(toActor(req), body);
      res.json({
        data: {
          settings,
          autoReorder: false as const,
          autoStockMutation: false as const,
          ownerControlled: true as const,
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
      const insight = await inventoryIntelligenceService.createAuraInsight(toActor(req), body);
      res.status(201).json({
        data: {
          insight,
          invented: false as const,
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

  router.post('/aura-insights/:id/acknowledge', requireWrite, async (req, res) => {
    try {
      const body = ackInsightSchema.parse(req.body ?? {});
      const insight = await inventoryIntelligenceService.acknowledgeInsight(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          insight,
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

  return router;
}
