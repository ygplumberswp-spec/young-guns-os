import { Router } from 'express';
import { z } from 'zod';
import type { FinanceCashflowProfitService } from '../services/finance-cashflow-profit.service.js';
import {
  FinanceCashflowProfitError,
  type FcpActor,
} from '../services/finance-cashflow-profit.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const createActionSchema = z.object({
  kind: z.enum([
    'collections_push',
    'expense_review',
    'margin_review',
    'job_cost_review',
    'cash_position_review',
    'inventory_cost_gap',
    'aura_handoff',
  ]),
  title: z.string().trim().min(1).max(200),
  recommendation: z.string().trim().min(1).max(5000),
  sourceInvoiceId: z.string().uuid().optional(),
  sourceJobId: z.string().uuid().optional(),
  sourceInsightId: z.string().uuid().optional(),
  submitForApproval: z.boolean().optional(),
});

const decideSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  notes: z.string().trim().max(2000).optional(),
});

const ackSchema = z.object({
  status: z.enum(['acknowledged', 'dismissed']),
});

type RouterDeps = {
  financeCashflowProfitService: FinanceCashflowProfitService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): FcpActor {
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
  if (error instanceof FinanceCashflowProfitError) {
    const status =
      error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'CONFLICT'
            ? 409
            : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

function denyTechnicianClient(
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
) {
  const role = getAuth(req).roleName;
  if (role === 'Technician' || role === 'Client') {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Cashflow & Profit Intelligence is not available to Technician or Client roles.',
      },
    });
    return;
  }
  next();
}

export function createFinanceCashflowProfitRouter({
  financeCashflowProfitService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'finance:read',
    'finance:write',
    'agents:read',
    '*',
  );
  const requireWrite = requireAnyPermission('finance:write', 'agents:write', '*');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });
  router.use(denyTechnicianClient);

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const dashboard = await financeCashflowProfitService.getDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          autoExecuted: false as const,
          fakeDataInvented: false as const,
          technicianClientDenied: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to load cashflow & profit dashboard' },
        });
      }
    }
  });

  router.get('/cashflow', requireRead, async (req, res) => {
    try {
      const cashflow = await financeCashflowProfitService.computeCashflow(toActor(req));
      res.json({
        data: {
          cashflow,
          fakeDataInvented: false as const,
          autoExecuted: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to compute cashflow intelligence' },
        });
      }
    }
  });

  router.get('/profit', requireRead, async (req, res) => {
    try {
      const profit = await financeCashflowProfitService.computeProfit(toActor(req));
      res.json({
        data: {
          profit,
          fakeDataInvented: false as const,
          autoExecuted: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to compute profit intelligence' },
        });
      }
    }
  });

  router.get('/insights', requireRead, async (req, res) => {
    try {
      const insights = await financeCashflowProfitService.listInsights(toActor(req));
      res.json({
        data: { insights, invented: false as const },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to list insights' },
        });
      }
    }
  });

  router.post('/insights/refresh', requireWrite, async (req, res) => {
    try {
      const insights = await financeCashflowProfitService.refreshInsights(toActor(req));
      res.json({
        data: {
          insights,
          invented: false as const,
          autoExecuted: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to refresh insights' },
        });
      }
    }
  });

  router.post('/insights/:id/acknowledge', requireWrite, async (req, res) => {
    const parsed = ackSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
      });
      return;
    }
    try {
      const insight = await financeCashflowProfitService.acknowledgeInsight(
        toActor(req),
        paramId(req),
        parsed.data,
      );
      res.json({ data: { insight, autoExecuted: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to acknowledge insight' },
        });
      }
    }
  });

  router.get('/actions', requireRead, async (req, res) => {
    try {
      const actions = await financeCashflowProfitService.listActions(toActor(req));
      res.json({
        data: { actions, autoExecuted: false as const },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to list actions' },
        });
      }
    }
  });

  router.post('/actions/generate', requireWrite, async (req, res) => {
    try {
      const actions = await financeCashflowProfitService.generateActions(toActor(req));
      res.json({
        data: {
          actions,
          autoExecuted: false as const,
          requiresOwnerApproval: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to generate actions' },
        });
      }
    }
  });

  router.post('/actions', requireWrite, async (req, res) => {
    const parsed = createActionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
      });
      return;
    }
    try {
      const action = await financeCashflowProfitService.createAction(toActor(req), parsed.data);
      res.status(201).json({
        data: {
          action,
          autoExecuted: false as const,
          requiresOwnerApproval: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to create action' },
        });
      }
    }
  });

  router.post('/actions/:id/decide', requireWrite, async (req, res) => {
    const parsed = decideSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
      });
      return;
    }
    try {
      const action = await financeCashflowProfitService.decideAction(
        toActor(req),
        paramId(req),
        parsed.data,
      );
      res.json({
        data: {
          action,
          autoExecuted: false as const,
          executedMutation: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to decide action' },
        });
      }
    }
  });

  return router;
}
