import { Router } from 'express';
import { z } from 'zod';
import type { ExecutiveService } from '../services/executive.service.js';
import { ExecutiveError } from '../services/executive.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const alertStatusSchema = z.enum(['pending', 'acknowledged', 'dismissed']);
const recommendationStatusSchema = z.enum(['pending', 'accepted', 'dismissed', 'completed']);
const reportTypeSchema = z.enum(['daily_summary', 'weekly_review', 'monthly_review']);

const updateAlertSchema = z.object({
  status: alertStatusSchema,
});

const updateRecommendationSchema = z.object({
  status: recommendationStatusSchema,
});

const generateReportSchema = z.object({
  reportType: reportTypeSchema,
});

type ExecutiveRouterDeps = {
  executiveService: ExecutiveService;
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

export function createExecutiveRouter({
  executiveService,
  teamService,
  jwtSecret,
  authService,
}: ExecutiveRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'executive:read',
    'executive:write',
    'intelligence:read',
  );
  const requireWrite = requireAnyPermission('executive:write');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/stats', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const stats = await executiveService.getStats(companyId);
    res.json({ data: { stats } });
  });

  router.get('/summary', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const summary = await executiveService.getBusinessSummary(companyId);
    res.json({ data: { summary } });
  });

  router.get('/health', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const [latest, history] = await Promise.all([
      executiveService.getLatestHealthSnapshot(companyId),
      executiveService.listHealthSnapshots(companyId),
    ]);
    res.json({ data: { latest, history } });
  });

  router.post('/health/generate', requireWrite, async (req, res) => {
    try {
      const { companyId } = getAuth(req);
      const snapshot = await executiveService.generateHealthSnapshot(companyId);
      res.status(201).json({ data: { snapshot } });
    } catch (error) {
      handleExecutiveError(res, error);
    }
  });

  router.get('/alerts', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const alerts = await executiveService.listAlerts(companyId);
    res.json({ data: { alerts } });
  });

  router.post('/alerts/generate', requireWrite, async (req, res) => {
    try {
      const { companyId } = getAuth(req);
      const alerts = await executiveService.generateAlerts(companyId);
      res.status(201).json({ data: { alerts } });
    } catch (error) {
      handleExecutiveError(res, error);
    }
  });

  router.patch('/alerts/:id', requireWrite, async (req, res) => {
    const parsed = updateAlertSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid alert payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const alert = await executiveService.updateAlert(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { alert } });
    } catch (error) {
      handleExecutiveError(res, error);
    }
  });

  router.get('/recommendations', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const recommendations = await executiveService.listRecommendations(companyId);
    res.json({ data: { recommendations } });
  });

  router.post('/recommendations/generate', requireWrite, async (req, res) => {
    try {
      const { companyId } = getAuth(req);
      const recommendations = await executiveService.generateRecommendations(companyId);
      res.status(201).json({ data: { recommendations } });
    } catch (error) {
      handleExecutiveError(res, error);
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
      const recommendation = await executiveService.updateRecommendation(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { recommendation } });
    } catch (error) {
      handleExecutiveError(res, error);
    }
  });

  router.get('/reports', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const reports = await executiveService.listReports(companyId);
    res.json({ data: { reports } });
  });

  router.post('/reports/generate', requireWrite, async (req, res) => {
    const parsed = generateReportSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid report payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const report = await executiveService.generateReport(companyId, parsed.data);
      res.status(201).json({ data: { report } });
    } catch (error) {
      handleExecutiveError(res, error);
    }
  });

  return router;
}

function handleExecutiveError(res: import('express').Response, error: unknown) {
  if (error instanceof ExecutiveError) {
    res.status(error.code === 'NOT_FOUND' ? 404 : 400).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  throw error;
}
