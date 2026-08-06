import { Router } from 'express';
import { z } from 'zod';
import type { Customer360IntelligenceService } from '../services/customer-360-intelligence.service.js';
import {
  Customer360IntelligenceError,
  type C360Actor,
} from '../services/customer-360-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const updateSettingsSchema = z.object({
  insightsEnabled: z.boolean().optional(),
  timelineEnabled: z.boolean().optional(),
  recommendationDraftsEnabled: z.boolean().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

const refreshSchema = z.object({
  customerId: z.string().uuid().optional(),
});

const decideSchema = z.object({
  decision: z.enum(['approve', 'reject', 'acknowledge', 'cancel']),
  notes: z.string().trim().max(2000).optional(),
});

type RouterDeps = {
  customer360IntelligenceService: Customer360IntelligenceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): C360Actor {
  const auth = getAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function paramId(req: import('express').Request, key = 'id'): string {
  const raw = req.params[key];
  return String(Array.isArray(raw) ? raw[0] : raw ?? '');
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof Customer360IntelligenceError) {
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

export function createCustomer360IntelligenceRouter({
  customer360IntelligenceService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    '*',
    'customers:read',
    'customers:write',
    'customer_experience:read',
    'customer_experience:write',
    'communications:read',
    'communications:write',
    'communications:manage',
  );
  const requireWrite = requireAnyPermission(
    '*',
    'customers:write',
    'customer_experience:write',
    'communications:write',
    'communications:manage',
  );

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
      const dashboard = await customer360IntelligenceService.getDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          rebuildsCrm: false as const,
          inventCustomers: false as const,
          autoSend: false as const,
          crossCustomerVisibility: false as const,
          financeGated: true as const,
          technicianClientDenied: true as const,
          customer360: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/customers/:id', requireRead, async (req, res) => {
    try {
      const view = await customer360IntelligenceService.getCustomer360(
        toActor(req),
        paramId(req),
      );
      res.json({
        data: {
          customer360: view,
          rebuildsCrm: false as const,
          inventCustomers: false as const,
          autoSend: false as const,
          crossCustomerVisibility: false as const,
          financeGated: true as const,
          internalNotesGated: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/insights/refresh', requireWrite, async (req, res) => {
    try {
      const body = refreshSchema.parse(req.body ?? {});
      const result = await customer360IntelligenceService.refreshInsightDrafts(toActor(req), body);
      res.status(201).json({
        data: {
          ...result,
          autoSend: false as const,
          autoExecuted: false as const,
          inventCustomers: false as const,
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

  router.post('/insights/:id/decide', requireWrite, async (req, res) => {
    try {
      const body = decideSchema.parse(req.body ?? {});
      const insight = await customer360IntelligenceService.decideInsight(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          insight,
          autoSend: false as const,
          autoExecuted: false as const,
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
      const settings = await customer360IntelligenceService.updateSettings(toActor(req), body);
      res.json({
        data: {
          settings,
          autoSendEnabled: false as const,
          inventCustomersEnabled: false as const,
          rebuildsCrm: false as const,
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
