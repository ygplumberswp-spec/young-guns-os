import { Router } from 'express';
import { z } from 'zod';
import { canAccessExecutiveCommandCentre } from '@titan/shared';
import type { ExecutiveCommandCentreService } from '../services/executive-command-centre.service.js';
import {
  ExecutiveCommandCentreError,
  type EcActor,
} from '../services/executive-command-centre.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';

const panelSchema = z.enum([
  'revenue',
  'profit',
  'cash',
  'outstanding_invoices',
  'jobs',
  'staff',
  'fleet',
  'marketing',
  'sales',
]);

const createActionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  panel: panelSchema.nullable().optional(),
  submitForApproval: z.boolean().optional(),
});

const decideActionSchema = z.object({
  decision: z.enum(['approve', 'reject', 'acknowledge']),
  notes: z.string().trim().max(2000).optional(),
});

const refreshSchema = z.object({
  submitForApproval: z.boolean().optional(),
});

const createInsightSchema = z.object({
  panel: panelSchema.nullable().optional(),
  title: z.string().trim().min(1).max(200),
  insight: z.string().trim().min(1).max(5000),
  href: z.string().trim().max(500).optional(),
  sourceActionId: z.string().uuid().optional(),
});

const ackInsightSchema = z.object({
  status: z.enum(['acknowledged', 'dismissed']),
});

const updateSettingsSchema = z.object({
  financePanelsEnabled: z.boolean().optional(),
  operationsPanelsEnabled: z.boolean().optional(),
  riskDetectionEnabled: z.boolean().optional(),
  opportunityDetectionEnabled: z.boolean().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

type RouterDeps = {
  executiveCommandCentreService: ExecutiveCommandCentreService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): EcActor {
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
  return String(Array.isArray(raw) ? raw[0] : (raw ?? ''));
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof ExecutiveCommandCentreError) {
    const status =
      error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

export function createExecutiveCommandCentreRouter({
  executiveCommandCentreService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);

  /**
   * Owner-only gate. This surface exposes finance, payroll, margin, profit and
   * strategy data, so access is decided by owner role rather than by
   * permission breadth — a wildcard permission does not grant entry. The
   * service re-checks the same rule so the guard cannot be bypassed.
   */
  router.use((req, res, next) => {
    const auth = getAuth(req);
    if (!canAccessExecutiveCommandCentre({ roleName: auth.roleName, permissions: auth.permissions })) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message:
            'Executive Command Centre is Owner only. Technician, Client, Manager, Dispatcher, Accountant and Staff are denied.',
        },
      });
      return;
    }
    next();
  });

  router.use(async (req, _res, next) => {
    try {
      await teamService.ensureDefaultRoles(getAuth(req).companyId);
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get('/dashboard', async (req, res) => {
    try {
      const dashboard = await executiveCommandCentreService.getDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          ownerOnly: true as const,
          autoExecuted: false as const,
          inventFinancialFigures: false as const,
          fakeBusinessData: false as const,
          approvalRequired: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/settings', async (req, res) => {
    try {
      const settings = await executiveCommandCentreService.getSettings(toActor(req));
      res.json({ data: { settings, ownerOnly: true as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.patch('/settings', async (req, res) => {
    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID', message: 'Invalid settings payload.' } });
      return;
    }
    try {
      const settings = await executiveCommandCentreService.updateSettings(
        toActor(req),
        parsed.data,
      );
      res.json({
        data: {
          settings,
          ownerOnly: true as const,
          autoExecuted: false as const,
          inventFinancialFigures: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/actions', async (req, res) => {
    try {
      const actions = await executiveCommandCentreService.listActionDrafts(toActor(req));
      res.json({
        data: {
          actions,
          ownerOnly: true as const,
          approvalRequired: true as const,
          autoExecuted: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/actions', async (req, res) => {
    const parsed = createActionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID', message: 'Invalid action payload.' } });
      return;
    }
    try {
      const action = await executiveCommandCentreService.createActionDraft(
        toActor(req),
        parsed.data,
      );
      res.status(201).json({
        data: {
          action,
          ownerOnly: true as const,
          approvalRequired: true as const,
          autoExecuted: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/actions/refresh', async (req, res) => {
    const parsed = refreshSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID', message: 'Invalid refresh payload.' } });
      return;
    }
    try {
      const actions = await executiveCommandCentreService.refreshActionDrafts(
        toActor(req),
        parsed.data,
      );
      res.json({
        data: {
          actions,
          ownerOnly: true as const,
          approvalRequired: true as const,
          autoExecuted: false as const,
          inventFinancialFigures: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/actions/:id/decide', async (req, res) => {
    const parsed = decideActionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID', message: 'Invalid decision payload.' } });
      return;
    }
    try {
      const action = await executiveCommandCentreService.decideActionDraft(
        toActor(req),
        paramId(req),
        parsed.data,
      );
      res.json({
        data: {
          action,
          ownerOnly: true as const,
          autoExecuted: false as const,
          executedDownstreamChange: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/insights', async (req, res) => {
    try {
      const insights = await executiveCommandCentreService.listInsights(toActor(req));
      res.json({ data: { insights, ownerOnly: true as const, autoExecuted: false as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/insights', async (req, res) => {
    const parsed = createInsightSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID', message: 'Invalid insight payload.' } });
      return;
    }
    try {
      const insight = await executiveCommandCentreService.createInsight(
        toActor(req),
        parsed.data,
      );
      res.status(201).json({
        data: {
          insight,
          ownerOnly: true as const,
          autoExecuted: false as const,
          inventFinancialFigures: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/insights/:id/acknowledge', async (req, res) => {
    const parsed = ackInsightSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'INVALID', message: 'Invalid acknowledgement payload.' } });
      return;
    }
    try {
      const insight = await executiveCommandCentreService.acknowledgeInsight(
        toActor(req),
        paramId(req),
        parsed.data,
      );
      res.json({ data: { insight, ownerOnly: true as const, autoExecuted: false as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
