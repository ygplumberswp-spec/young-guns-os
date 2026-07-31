import { Router } from 'express';
import { z } from 'zod';
import type { FinanceIntelligenceService } from '../services/finance-intelligence.service.js';
import { FinanceIntelligenceError } from '../services/finance-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const budgetPeriodTypeSchema = z.enum(['monthly', 'quarterly', 'yearly']);
const budgetStatusSchema = z.enum(['draft', 'active', 'closed']);
const forecastTypeSchema = z.enum(['weekly', 'monthly']);
const recommendationStatusSchema = z.enum(['pending', 'accepted', 'dismissed', 'completed']);

const createBudgetSchema = z.object({
  name: z.string().trim().min(1).max(200),
  periodType: budgetPeriodTypeSchema.optional(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  currency: z.string().trim().min(3).max(3).optional(),
  status: budgetStatusSchema.optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
  lines: z
    .array(
      z.object({
        categoryKey: z.string().trim().min(1).max(100),
        categoryName: z.string().trim().min(1).max(200),
        budgetedAmountCents: z.number().int().min(0),
        notes: z.string().trim().max(2000).optional().nullable(),
      }),
    )
    .optional(),
});

const updateBudgetSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  periodType: budgetPeriodTypeSchema.optional(),
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
  currency: z.string().trim().min(3).max(3).optional(),
  status: budgetStatusSchema.optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const createBudgetLineSchema = z.object({
  categoryKey: z.string().trim().min(1).max(100),
  categoryName: z.string().trim().min(1).max(200),
  budgetedAmountCents: z.number().int().min(0),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const generateForecastSchema = z.object({
  forecastType: forecastTypeSchema,
});

const updateRecommendationSchema = z.object({
  status: recommendationStatusSchema,
});

type FinanceIntelligenceRouterDeps = {
  financeIntelligenceService: FinanceIntelligenceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export function createFinanceIntelligenceRouter({
  financeIntelligenceService,
  teamService,
  jwtSecret,
  authService,
}: FinanceIntelligenceRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission('finance:read', 'finance:write', 'intelligence:read');
  const requireWrite = requireAnyPermission('finance:write');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/stats', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const stats = await financeIntelligenceService.getStats(companyId);
    res.json({ data: { stats } });
  });

  router.get('/insights', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const [cashFlow, profitability, receivables, expenses, risks] = await Promise.all([
      financeIntelligenceService.getCashFlowIntelligence(companyId),
      financeIntelligenceService.getProfitabilityIntelligence(companyId),
      financeIntelligenceService.getReceivablesIntelligence(companyId),
      financeIntelligenceService.getExpenseIntelligence(companyId),
      financeIntelligenceService.getFinancialRisks(companyId),
    ]);
    res.json({ data: { cashFlow, profitability, receivables, expenses, risks } });
  });

  router.get('/cashflow', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const cashFlow = await financeIntelligenceService.getCashFlowIntelligence(companyId);
    res.json({ data: { cashFlow } });
  });

  router.get('/profitability', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const profitability = await financeIntelligenceService.getProfitabilityIntelligence(companyId);
    res.json({ data: { profitability } });
  });

  router.get('/receivables', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const receivables = await financeIntelligenceService.getReceivablesIntelligence(companyId);
    res.json({ data: { receivables } });
  });

  router.get('/expenses', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const expenses = await financeIntelligenceService.getExpenseIntelligence(companyId);
    res.json({ data: { expenses } });
  });

  router.get('/budgets', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const budgets = await financeIntelligenceService.listBudgets(companyId);
    res.json({ data: { budgets } });
  });

  router.post('/budgets', requireWrite, async (req, res) => {
    const parsed = createBudgetSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid budget payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const budget = await financeIntelligenceService.createBudget(companyId, parsed.data);
      res.status(201).json({ data: { budget } });
    } catch (error) {
      handleFinanceIntelligenceError(res, error);
    }
  });

  router.patch('/budgets/:id', requireWrite, async (req, res) => {
    const parsed = updateBudgetSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid budget payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const budget = await financeIntelligenceService.updateBudget(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { budget } });
    } catch (error) {
      handleFinanceIntelligenceError(res, error);
    }
  });

  router.post('/budgets/:id/lines', requireWrite, async (req, res) => {
    const parsed = createBudgetLineSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid budget line payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const variance = await financeIntelligenceService.addBudgetLine(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.status(201).json({ data: { variance } });
    } catch (error) {
      handleFinanceIntelligenceError(res, error);
    }
  });

  router.get('/budgets/:id/variance', requireRead, async (req, res) => {
    try {
      const { companyId } = getAuth(req);
      const variance = await financeIntelligenceService.getBudgetVariance(
        companyId,
        getRouteParam(req.params.id),
      );
      res.json({ data: { variance } });
    } catch (error) {
      handleFinanceIntelligenceError(res, error);
    }
  });

  router.get('/forecast', requireRead, async (req, res) => {
    const forecastType = forecastTypeSchema.safeParse(req.query.type ?? 'monthly');
    if (!forecastType.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid forecast type' } });
      return;
    }

    const { companyId } = getAuth(req);
    const forecast = await financeIntelligenceService.getFinanceForecast(
      companyId,
      forecastType.data,
    );
    res.json({ data: { forecast } });
  });

  router.post('/forecast/generate', requireWrite, async (req, res) => {
    const parsed = generateForecastSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid forecast payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const snapshot = await financeIntelligenceService.generateForecastSnapshot(
        companyId,
        parsed.data,
      );
      res.status(201).json({ data: { snapshot } });
    } catch (error) {
      handleFinanceIntelligenceError(res, error);
    }
  });

  router.get('/recommendations', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const recommendations = await financeIntelligenceService.listRecommendations(companyId);
    res.json({ data: { recommendations } });
  });

  router.post('/recommendations/generate', requireWrite, async (req, res) => {
    try {
      const { companyId } = getAuth(req);
      const recommendations = await financeIntelligenceService.generateRecommendations(companyId);
      res.status(201).json({ data: { recommendations } });
    } catch (error) {
      handleFinanceIntelligenceError(res, error);
    }
  });

  router.patch('/recommendations/:id', requireWrite, async (req, res) => {
    const parsed = updateRecommendationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid recommendation payload' },
      });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const recommendation = await financeIntelligenceService.updateRecommendation(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { recommendation } });
    } catch (error) {
      handleFinanceIntelligenceError(res, error);
    }
  });

  router.get('/risks', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const risks = await financeIntelligenceService.getFinancialRisks(companyId);
    res.json({ data: { risks } });
  });

  return router;
}

function handleFinanceIntelligenceError(res: import('express').Response, error: unknown) {
  if (error instanceof FinanceIntelligenceError) {
    res.status(error.code === 'NOT_FOUND' ? 404 : 400).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  throw error;
}
