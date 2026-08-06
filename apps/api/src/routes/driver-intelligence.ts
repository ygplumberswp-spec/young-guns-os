import { Router } from 'express';
import { z } from 'zod';
import type { DriverIntelligenceService } from '../services/driver-intelligence.service.js';
import {
  DriverIntelligenceError,
  type DriActor,
} from '../services/driver-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const refreshRecommendationsSchema = z.object({
  submitForReview: z.boolean().optional(),
});

const decideRecommendationSchema = z.object({
  decision: z.enum(['acknowledge', 'dismiss']),
  notes: z.string().trim().max(2000).optional(),
});

const updateSettingsSchema = z.object({
  recommendationDraftsEnabled: z.boolean().optional(),
  behaviourSignalsEnabled: z.boolean().optional(),
  tripSignalsEnabled: z.boolean().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

const createInsightSchema = z.object({
  target: z.enum([
    'command_centre',
    'executive_dashboard',
    'fleet',
    'fleet_intelligence',
    'vehicle_intelligence',
    'operations',
    'jobs',
    'scheduling',
    'technicians',
    'hr',
  ]),
  title: z.string().trim().min(1).max(200),
  insight: z.string().trim().min(1).max(5000),
  href: z.string().trim().max(500).optional(),
  sourceRecommendationId: z.string().uuid().optional(),
  driverUserId: z.string().uuid().optional(),
});

const ackInsightSchema = z.object({
  status: z.enum(['acknowledged', 'dismissed']),
});

type RouterDeps = {
  driverIntelligenceService: DriverIntelligenceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): DriActor {
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
  if (error instanceof DriverIntelligenceError) {
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

const honestyEnvelope = {
  ownerAdminOnly: true as const,
  autoDiscipline: false as const,
  inventGps: false as const,
  fakeGps: false as const,
  fakeBehaviour: false as const,
  disciplineExecuted: false as const,
};

export function createDriverIntelligenceRouter({
  driverIntelligenceService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    '*',
    'fleet:read',
    'fleet:write',
    'fleet_intelligence:read',
    'fleet_intelligence:write',
    'agents:read',
  );
  const requireWrite = requireAnyPermission(
    '*',
    'fleet:write',
    'fleet_intelligence:write',
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
      const dashboard = await driverIntelligenceService.getDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          ...honestyEnvelope,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/recommendations/refresh', requireWrite, async (req, res) => {
    try {
      const body = refreshRecommendationsSchema.parse(req.body ?? {});
      const result = await driverIntelligenceService.refreshRecommendations(toActor(req), body);
      res.status(201).json({
        data: {
          ...result,
          ...honestyEnvelope,
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
      const recommendation = await driverIntelligenceService.decideRecommendation(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          recommendation,
          ...honestyEnvelope,
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
      const settings = await driverIntelligenceService.updateSettings(toActor(req), body);
      res.json({
        data: {
          settings,
          ...honestyEnvelope,
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
      const insight = await driverIntelligenceService.createAuraInsight(toActor(req), body);
      res.status(201).json({
        data: {
          insight,
          invented: false as const,
          ...honestyEnvelope,
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
      const insight = await driverIntelligenceService.acknowledgeInsight(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          insight,
          invented: false as const,
          ...honestyEnvelope,
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
