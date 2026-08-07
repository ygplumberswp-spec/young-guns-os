import { Router } from 'express';
import { z } from 'zod';
import type { FinanceReportingForecastService } from '../services/finance-reporting-forecast.service.js';
import {
  FinanceReportingForecastError,
  type FrfActor,
} from '../services/finance-reporting-forecast.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const reportKindSchema = z.enum([
  'revenue',
  'expense',
  'profit',
  'invoice',
  'payment',
  'job',
  'job_profitability',
]);

const forecastKindSchema = z.enum(['revenue', 'cashflow', 'budget_planning', 'trend']);

const generateReportSchema = z.object({
  kind: reportKindSchema,
  persist: z.boolean().optional(),
});

const generateForecastSchema = z.object({
  kind: forecastKindSchema,
  horizonMonths: z.number().int().min(1).max(12).optional(),
  persist: z.boolean().optional(),
});

const budgetSchema = z.object({
  name: z.string().trim().min(1).max(200),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  currency: z.string().trim().max(8).optional(),
  budgetedRevenueCents: z.number().int().nullable().optional(),
  budgetedExpenseCents: z.number().int().nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

const insightSchema = z.object({
  target: z.enum([
    'command_centre',
    'executive_dashboard',
    'finance_aura_agent',
    'dashboard',
  ]),
  title: z.string().trim().min(1).max(200),
  insight: z.string().trim().min(1).max(5000),
  href: z.string().trim().max(500).optional(),
  sourceReportId: z.string().uuid().optional(),
  sourceForecastId: z.string().uuid().optional(),
});

const ackSchema = z.object({
  status: z.enum(['acknowledged', 'dismissed']),
});

const createActionSchema = z.object({
  kind: z.enum([
    'review_forecast',
    'budget_adjustment',
    'collections_focus',
    'expense_review',
    'executive_brief',
    'aura_handoff',
  ]),
  title: z.string().trim().min(1).max(200),
  recommendation: z.string().trim().min(1).max(5000),
  sourceReportId: z.string().uuid().optional(),
  sourceForecastId: z.string().uuid().optional(),
  submitForApproval: z.boolean().optional(),
});

const decideSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  notes: z.string().trim().max(2000).optional(),
});

type RouterDeps = {
  financeReportingForecastService: FinanceReportingForecastService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): FrfActor {
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
  if (error instanceof FinanceReportingForecastError) {
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
        message:
          'Financial Reporting & Forecasting is not available to Technician or Client roles.',
      },
    });
    return;
  }
  next();
}

export function createFinanceReportingForecastRouter({
  financeReportingForecastService,
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
      const dashboard = await financeReportingForecastService.getDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          autoExecuted: false as const,
          fakeDataInvented: false as const,
          technicianClientDenied: true as const,
          forecastsExplainAssumptions: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/reports/live', requireRead, async (req, res) => {
    try {
      const reports = await financeReportingForecastService.computeAllReports(toActor(req));
      res.json({
        data: {
          reports,
          autoExecuted: false as const,
          fakeDataInvented: false as const,
          technicianClientDenied: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/reports/generate', requireWrite, async (req, res) => {
    try {
      const body = generateReportSchema.parse(req.body ?? {});
      const result = await financeReportingForecastService.generateReport(toActor(req), body);
      res.status(201).json({
        data: {
          ...result,
          autoExecuted: false as const,
          fakeDataInvented: false as const,
          technicianClientDenied: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/forecasts/live', requireRead, async (req, res) => {
    try {
      const forecasts = await financeReportingForecastService.computeAllForecasts(toActor(req));
      res.json({
        data: {
          forecasts,
          autoExecuted: false as const,
          fakeDataInvented: false as const,
          technicianClientDenied: true as const,
          forecastsExplainAssumptions: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/forecasts/generate', requireWrite, async (req, res) => {
    try {
      const body = generateForecastSchema.parse(req.body ?? {});
      const result = await financeReportingForecastService.generateForecast(toActor(req), body);
      res.status(201).json({
        data: {
          ...result,
          autoExecuted: false as const,
          fakeDataInvented: false as const,
          technicianClientDenied: true as const,
          forecastsExplainAssumptions: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/budgets', requireWrite, async (req, res) => {
    try {
      const body = budgetSchema.parse(req.body ?? {});
      const budgetPlan = await financeReportingForecastService.createBudgetPlan(
        toActor(req),
        body,
      );
      res.status(201).json({
        data: {
          budgetPlan,
          autoExecuted: false as const,
          fakeDataInvented: false as const,
          technicianClientDenied: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/insights', requireWrite, async (req, res) => {
    try {
      const body = insightSchema.parse(req.body ?? {});
      const insight = await financeReportingForecastService.createInsight(toActor(req), body);
      res.status(201).json({
        data: {
          insight,
          autoExecuted: false as const,
          fakeDataInvented: false as const,
          technicianClientDenied: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/insights/refresh', requireWrite, async (req, res) => {
    try {
      const insights = await financeReportingForecastService.refreshInsights(toActor(req));
      res.status(201).json({
        data: {
          insights,
          autoExecuted: false as const,
          fakeDataInvented: false as const,
          technicianClientDenied: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/insights/:id/acknowledge', requireWrite, async (req, res) => {
    try {
      const body = ackSchema.parse(req.body ?? {});
      const insight = await financeReportingForecastService.acknowledgeInsight(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          insight,
          autoExecuted: false as const,
          fakeDataInvented: false as const,
          technicianClientDenied: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/actions', requireWrite, async (req, res) => {
    try {
      const body = createActionSchema.parse(req.body ?? {});
      const action = await financeReportingForecastService.createAction(toActor(req), body);
      res.status(201).json({
        data: {
          action,
          autoExecuted: false as const,
          fakeDataInvented: false as const,
          technicianClientDenied: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/actions/generate', requireWrite, async (req, res) => {
    try {
      const actions = await financeReportingForecastService.generateActions(toActor(req));
      res.status(201).json({
        data: {
          actions,
          autoExecuted: false as const,
          fakeDataInvented: false as const,
          technicianClientDenied: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/actions/:id/decide', requireWrite, async (req, res) => {
    try {
      const body = decideSchema.parse(req.body ?? {});
      const action = await financeReportingForecastService.decideAction(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          action,
          autoExecuted: false as const,
          fakeDataInvented: false as const,
          technicianClientDenied: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
