import { Router } from 'express';
import { z } from 'zod';
import type { PayrollTimesheetIntelligenceService } from '../services/payroll-timesheet-intelligence.service.js';
import {
  PayrollTimesheetIntelligenceError,
  type PtiActor,
} from '../services/payroll-timesheet-intelligence.service.js';
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
  insightsEnabled: z.boolean().optional(),
  selfTimesheetViewEnabled: z.boolean().optional(),
  standardWeeklyHours: z.number().min(0).max(168).optional(),
  overtimeDailyThresholdHours: z.number().min(0).max(24).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

const createInsightSchema = z.object({
  target: z.enum([
    'command_centre',
    'executive_dashboard',
    'hr_employee_intelligence',
    'workforce_intelligence',
    'technician_intelligence',
    'scheduling',
    'jobs',
    'payroll',
    'timesheets',
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
  payrollTimesheetIntelligenceService: PayrollTimesheetIntelligenceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): PtiActor {
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
  if (error instanceof PayrollTimesheetIntelligenceError) {
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

export function createPayrollTimesheetIntelligenceRouter({
  payrollTimesheetIntelligenceService,
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
    'agents:read',
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
      const dashboard = await payrollTimesheetIntelligenceService.getOwnerDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          inventWages: false as const,
          autoPayrollMutation: false as const,
          fakePayroll: false as const,
          sensitivePayrollOwnerAdminOnly: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/me', requireAuth, async (req, res) => {
    try {
      const view = await payrollTimesheetIntelligenceService.getSelfTimesheetView(toActor(req));
      res.json({
        data: {
          view,
          payrollHidden: true as const,
          peerTimesheetsHidden: true as const,
          labourCostHidden: true as const,
          inventWages: false as const,
          fakePayroll: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/insights/refresh', requireWrite, async (req, res) => {
    try {
      const body = refreshInsightsSchema.parse(req.body ?? {});
      const result = await payrollTimesheetIntelligenceService.refreshInsightDrafts(
        toActor(req),
        body,
      );
      res.status(201).json({
        data: {
          ...result,
          inventWages: false as const,
          autoPayrollMutation: false as const,
          fakePayroll: false as const,
          timesheetAutoApproved: false as const,
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

  router.post('/insights/:id/decide', requireWrite, async (req, res) => {
    try {
      const body = decideInsightSchema.parse(req.body ?? {});
      const draft = await payrollTimesheetIntelligenceService.decideInsightDraft(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          draft,
          inventWages: false as const,
          autoPayrollMutation: false as const,
          fakePayroll: false as const,
          timesheetAutoApproved: false as const,
          payrollMutated: false as const,
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
      const settings = await payrollTimesheetIntelligenceService.updateSettings(toActor(req), body);
      res.json({
        data: {
          settings,
          inventWages: false as const,
          autoPayrollMutation: false as const,
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
      const insight = await payrollTimesheetIntelligenceService.createAuraInsight(
        toActor(req),
        body,
      );
      res.status(201).json({
        data: {
          insight,
          invented: false as const,
          inventWages: false as const,
          autoPayrollMutation: false as const,
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
      const insight = await payrollTimesheetIntelligenceService.acknowledgeAuraInsight(
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
