import { Router } from 'express';
import { z } from 'zod';
import type { HrEmployeeIntelligenceService } from '../services/hr-employee-intelligence.service.js';
import {
  HrEmployeeIntelligenceError,
  type HrIntelActor,
} from '../services/hr-employee-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const updateSettingsSchema = z.object({
  insightsEnabled: z.boolean().optional(),
  selfViewEnabled: z.boolean().optional(),
  recommendationDraftsEnabled: z.boolean().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

const createInsightSchema = z.object({
  target: z.enum([
    'command_centre',
    'executive_dashboard',
    'workforce_intelligence',
    'technician_intelligence',
    'timesheets',
    'payroll',
    'jobs',
    'scheduling',
    'recruitment',
    'compliance',
    'hr',
  ]),
  title: z.string().trim().min(1).max(200),
  insight: z.string().trim().min(1).max(5000),
  href: z.string().trim().max(500).optional(),
  subjectUserId: z.string().uuid().optional(),
});

const ackInsightSchema = z.object({
  status: z.enum(['acknowledged', 'dismissed']),
});

const decideRecommendationSchema = z.object({
  decision: z.enum(['acknowledge', 'dismiss']),
});

type RouterDeps = {
  hrEmployeeIntelligenceService: HrEmployeeIntelligenceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): HrIntelActor {
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
  if (error instanceof HrEmployeeIntelligenceError) {
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

export function createHrEmployeeIntelligenceRouter({
  hrEmployeeIntelligenceService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    '*',
    'workforce:read',
    'workforce:write',
    'workforce_intelligence:read',
    'workforce_intelligence:write',
    'workforce_intelligence:manage',
  );
  const requireWrite = requireAnyPermission(
    '*',
    'workforce:write',
    'workforce_intelligence:write',
    'workforce_intelligence:manage',
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
      const dashboard = await hrEmployeeIntelligenceService.getDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          inventEmployees: false as const,
          fakeEmployees: false as const,
          fakePayroll: false as const,
          autoPayrollMutation: false as const,
          autoHrActions: false as const,
          sensitiveHrOwnerAdminOnly: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/employees/:id', requireRead, async (req, res) => {
    try {
      const employee = await hrEmployeeIntelligenceService.getEmployee(toActor(req), paramId(req));
      res.json({
        data: {
          employee,
          inventEmployees: false as const,
          fakePayroll: false as const,
          sensitiveHrOwnerAdminOnly: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/me', requireAuth, async (req, res) => {
    try {
      const profile = await hrEmployeeIntelligenceService.getSelfProfile(toActor(req));
      res.json({
        data: {
          profile,
          sensitiveHrHidden: true as const,
          payrollHidden: true as const,
          emergencyContactHidden: true as const,
          hrAnalyticsHidden: true as const,
          inventEmployees: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/recommendations/refresh', requireWrite, async (req, res) => {
    try {
      const result = await hrEmployeeIntelligenceService.refreshRecommendationDrafts(toActor(req));
      res.status(201).json({
        data: {
          ...result,
          autoHrActions: false as const,
          hrActionExecuted: false as const,
          inventEmployees: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/recommendations/:id/decide', requireWrite, async (req, res) => {
    try {
      const body = decideRecommendationSchema.parse(req.body ?? {});
      const recommendation = await hrEmployeeIntelligenceService.decideRecommendation(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          recommendation,
          autoHrActions: false as const,
          hrActionExecuted: false as const,
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
      const settings = await hrEmployeeIntelligenceService.updateSettings(toActor(req), body);
      res.json({
        data: {
          settings,
          inventEmployees: false as const,
          autoPayrollMutation: false as const,
          autoHrActions: false as const,
          ownerAdminControlled: true as const,
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
      const insight = await hrEmployeeIntelligenceService.createAuraInsight(toActor(req), body);
      res.status(201).json({
        data: {
          insight,
          invented: false as const,
          inventEmployees: false as const,
          autoHrActions: false as const,
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
      const insight = await hrEmployeeIntelligenceService.acknowledgeInsight(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({ data: { insight, invented: false as const } });
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
