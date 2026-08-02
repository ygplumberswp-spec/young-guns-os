import { Router } from 'express';
import { z } from 'zod';
import type { AnalyticsService } from '../services/analytics.service.js';
import { AnalyticsError } from '../services/analytics.service.js';
import type { AnalyticsReportingService } from '../services/analytics-reporting.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const periodSchema = z.enum(['daily', 'weekly', 'monthly']);
const reportTypeSchema = z.enum([
  'revenue',
  'customer',
  'job_performance',
  'technician_performance',
  'finance',
  'fleet',
  'inventory',
]);

const rangeQuerySchema = z.object({
  period: periodSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const generateReportSchema = z.object({
  reportType: reportTypeSchema,
  period: periodSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

type AnalyticsRouterDeps = {
  analyticsService: AnalyticsService;
  analyticsReportingService: AnalyticsReportingService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

export function createAnalyticsRouter({
  analyticsService,
  analyticsReportingService,
  teamService,
  jwtSecret,
  authService,
}: AnalyticsRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission('analytics:read', 'analytics:write');
  const requireWrite = requireAnyPermission('analytics:write');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    const { companyId } = getAuth(req);
    await teamService.ensureDefaultRoles(companyId);
    next();
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    const parsed = rangeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const dashboard = await analyticsService.getDashboard(companyId, parsed.data);
      res.json({ data: { dashboard } });
    } catch (error) {
      handleAnalyticsError(res, error);
    }
  });

  router.get('/reporting-workspace', requireRead, async (req, res) => {
    const parsed = rangeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const workspace = await analyticsReportingService.getReportingWorkspace(
        companyId,
        parsed.data,
      );
      res.json({ data: { workspace } });
    } catch (error) {
      handleAnalyticsError(res, error);
    }
  });

  router.get('/trends', requireRead, async (req, res) => {
    const parsed = rangeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const trends = await analyticsService.getTrends(companyId, parsed.data);
      res.json({ data: { trends } });
    } catch (error) {
      handleAnalyticsError(res, error);
    }
  });

  router.get('/profitability', requireRead, async (req, res) => {
    const parsed = rangeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const profitability = await analyticsService.getProfitability(companyId, parsed.data);
      res.json({ data: { profitability } });
    } catch (error) {
      handleAnalyticsError(res, error);
    }
  });

  router.get('/technicians', requireRead, async (req, res) => {
    const parsed = rangeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const technicians = await analyticsService.getTechnicianPerformance(companyId, parsed.data);
      res.json({ data: { technicians } });
    } catch (error) {
      handleAnalyticsError(res, error);
    }
  });

  router.get('/customers', requireRead, async (req, res) => {
    const parsed = rangeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const customers = await analyticsService.getCustomerAnalytics(companyId, parsed.data);
      res.json({ data: { customers } });
    } catch (error) {
      handleAnalyticsError(res, error);
    }
  });

  router.get('/finance', requireRead, async (req, res) => {
    const parsed = rangeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const finance = await analyticsService.getFinanceAnalytics(companyId, parsed.data);
      res.json({ data: { finance } });
    } catch (error) {
      handleAnalyticsError(res, error);
    }
  });

  router.get('/reports', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const [definitions, runs] = await Promise.all([
      analyticsService.listReportDefinitions(companyId),
      analyticsService.listReportRuns(companyId),
    ]);
    res.json({ data: { definitions, runs } });
  });

  router.get('/reports/:id', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const runId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const run = await analyticsService.getReportRun(companyId, runId);

    if (!run) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report run not found' } });
      return;
    }

    res.json({ data: { run } });
  });

  router.post('/reports/generate', requireWrite, async (req, res) => {
    const parsed = generateReportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid report payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const { companyId, userId } = getAuth(req);
      const run = await analyticsService.generateReport({ companyId, userId }, parsed.data);
      res.status(201).json({ data: { run } });
    } catch (error) {
      handleAnalyticsError(res, error);
    }
  });

  return router;
}

function handleAnalyticsError(res: import('express').Response, error: unknown) {
  if (error instanceof AnalyticsError) {
    res.status(error.code === 'NOT_FOUND' ? 404 : 400).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  throw error;
}
