import { Router } from 'express';
import { z } from 'zod';
import type { VehicleIntelligenceService } from '../services/vehicle-intelligence.service.js';
import {
  VehicleIntelligenceError,
  type ViActor,
} from '../services/vehicle-intelligence.service.js';
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
  fuelSignalsEnabled: z.boolean().optional(),
  maintenanceSignalsEnabled: z.boolean().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

const createInsightSchema = z.object({
  target: z.enum([
    'command_centre',
    'executive_dashboard',
    'fleet',
    'fleet_intelligence',
    'operations',
    'jobs',
    'scheduling',
    'technicians',
  ]),
  title: z.string().trim().min(1).max(200),
  insight: z.string().trim().min(1).max(5000),
  href: z.string().trim().max(500).optional(),
  sourceInsightDraftId: z.string().uuid().optional(),
});

const ackInsightSchema = z.object({
  status: z.enum(['acknowledged', 'dismissed']),
});

type RouterDeps = {
  vehicleIntelligenceService: VehicleIntelligenceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): ViActor {
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
  if (error instanceof VehicleIntelligenceError) {
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

export function createVehicleIntelligenceRouter({
  vehicleIntelligenceService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'fleet:read',
    'fleet:write',
    'fleet_intelligence:read',
    'fleet_intelligence:write',
    'agents:read',
  );
  const requireWrite = requireAnyPermission('fleet:write', 'fleet_intelligence:write');

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
      const dashboard = await vehicleIntelligenceService.getDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          autoFleetMutation: false as const,
          inventTracking: false as const,
          inventedGps: false as const,
          inventedFuel: false as const,
          fakeTracking: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/insights/refresh', requireWrite, async (req, res) => {
    try {
      const body = refreshInsightsSchema.parse(req.body ?? {});
      const result = await vehicleIntelligenceService.refreshInsightDrafts(toActor(req), body);
      res.status(201).json({
        data: {
          ...result,
          autoFleetMutation: false as const,
          inventTracking: false as const,
          inventedGps: false as const,
          inventedFuel: false as const,
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
      const draft = await vehicleIntelligenceService.decideInsightDraft(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          draft,
          autoFleetMutation: false as const,
          fleetMutated: false as const,
          inventTracking: false as const,
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
      const settings = await vehicleIntelligenceService.updateSettings(toActor(req), body);
      res.json({
        data: {
          settings,
          autoFleetMutation: false as const,
          inventTracking: false as const,
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
      const insight = await vehicleIntelligenceService.createAuraInsight(toActor(req), body);
      res.status(201).json({
        data: {
          insight,
          invented: false as const,
          autoFleetMutation: false as const,
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
      const insight = await vehicleIntelligenceService.acknowledgeInsight(
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
