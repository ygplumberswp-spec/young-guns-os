import { Router } from 'express';
import { z } from 'zod';
import type { PropertyIntelligenceService } from '../services/property-intelligence.service.js';
import {
  PropertyIntelligenceError,
  type PriActor,
} from '../services/property-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const refreshInsightsSchema = z.object({
  submitForApproval: z.boolean().optional(),
});

const decideInsightSchema = z.object({
  decision: z.enum(['approve', 'reject', 'acknowledge']),
  notes: z.string().trim().max(2000).optional(),
});

const updateSettingsSchema = z.object({
  insightDraftsEnabled: z.boolean().optional(),
  mapsSignalsEnabled: z.boolean().optional(),
  maintenanceSignalsEnabled: z.boolean().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

const createInsightSchema = z.object({
  target: z.enum([
    'command_centre',
    'executive_dashboard',
    'crm',
    'customer_360',
    'jobs',
    'documents',
    'recurring_maintenance',
    'operations',
  ]),
  title: z.string().trim().min(1).max(200),
  insight: z.string().trim().min(1).max(5000),
  href: z.string().trim().max(500).optional(),
  propertyId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  sourceInsightDraftId: z.string().uuid().optional(),
});

const ackInsightSchema = z.object({
  status: z.enum(['acknowledged', 'dismissed']),
});

type RouterDeps = {
  propertyIntelligenceService: PropertyIntelligenceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): PriActor {
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
  if (error instanceof PropertyIntelligenceError) {
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

export function createPropertyIntelligenceRouter({
  propertyIntelligenceService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'customers:read',
    'customers:write',
    'jobs:read',
    'documents:read',
    'ops:read',
    'agents:read',
  );
  const requireWrite = requireAnyPermission('customers:write', 'jobs:write', 'ops:manage');

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
      const dashboard = await propertyIntelligenceService.getDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          autoSend: false as const,
          inventedProperty: false as const,
          inventCoordinates: false as const,
          fakeProperties: false as const,
          autoComms: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/insights/refresh', requireWrite, async (req, res) => {
    try {
      const body = refreshInsightsSchema.parse(req.body ?? {});
      const result = await propertyIntelligenceService.refreshInsightDrafts(toActor(req), body);
      res.status(201).json({
        data: {
          ...result,
          autoSend: false as const,
          inventedProperty: false as const,
          inventCoordinates: false as const,
          autoComms: false as const,
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
      const body = decideInsightSchema.parse(req.body ?? {});
      const draft = await propertyIntelligenceService.decideInsightDraft(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          draft,
          autoSend: false as const,
          autoSent: false as const,
          inventedProperty: false as const,
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
      const settings = await propertyIntelligenceService.updateSettings(toActor(req), body);
      res.json({
        data: {
          settings,
          autoSend: false as const,
          inventedProperty: false as const,
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
      const insight = await propertyIntelligenceService.createAuraInsight(toActor(req), body);
      res.status(201).json({
        data: {
          insight,
          invented: false as const,
          autoSend: false as const,
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
      const insight = await propertyIntelligenceService.acknowledgeInsight(
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
