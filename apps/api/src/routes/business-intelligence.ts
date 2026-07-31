import { Router } from 'express';
import { z } from 'zod';
import type { BusinessIntelligenceService } from '../services/business-intelligence.service.js';
import { BusinessIntelligenceError } from '../services/business-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const kpiKeySchema = z.enum([
  'revenue',
  'gross_profit',
  'net_profit',
  'cash_flow',
  'job_completion_rate',
  'technician_utilization',
  'customer_retention',
  'quote_conversion',
  'lead_conversion',
  'marketing_roi',
  'inventory_turnover',
  'procurement_costs',
  'customer_satisfaction',
  'automation_savings',
  'fleet_efficiency',
  'ai_performance',
]);

const dashboardTypeSchema = z.enum([
  'executive',
  'finance',
  'operations',
  'sales',
  'marketing',
  'workforce',
  'fleet',
  'customer_support',
  'branch',
  'personal',
  'dispatch',
  'procurement',
  'hr',
  'inventory',
  'ai',
]);

const insightStatusSchema = z.enum(['pending', 'accepted', 'dismissed', 'completed']);

const forecastTypeSchema = z.enum([
  'revenue',
  'workload',
  'inventory_demand',
  'staffing',
  'cash_flow',
  'customer_churn',
  'demand',
  'lead_scoring',
  'risk',
]);

const createKpiSchema = z.object({
  kpiKey: kpiKeySchema,
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  targetValue: z.number().optional().nullable(),
  unit: z.string().trim().max(50).optional(),
  isActive: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

const updateKpiSchema = createKpiSchema.partial();

const createDashboardSchema = z.object({
  dashboardType: dashboardTypeSchema,
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  isDefault: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
  widgets: z
    .array(
      z.object({
        widgetKey: z.string().trim().min(1).max(100),
        title: z.string().trim().min(1).max(200),
        kpiKey: kpiKeySchema.optional().nullable(),
        position: z.number().int().min(0).optional(),
        config: z.record(z.unknown()).optional(),
      }),
    )
    .optional(),
});

const updateDashboardSchema = createDashboardSchema.partial().omit({ widgets: true });

const createWidgetSchema = z.object({
  widgetKey: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  kpiKey: kpiKeySchema.optional().nullable(),
  position: z.number().int().min(0).optional(),
  config: z.record(z.unknown()).optional(),
});

const createReportTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  templateKey: z.string().trim().min(1).max(100),
  modules: z.array(z.string().trim().min(1).max(100)).optional(),
  defaultFilters: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

const updateReportTemplateSchema = createReportTemplateSchema.partial();

const createReportSchema = z.object({
  templateId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  filters: z.record(z.unknown()).optional(),
  scheduleCron: z.string().trim().max(100).optional().nullable(),
});

const updateReportSchema = createReportSchema.partial();

const scheduleReportSchema = z.object({
  scheduleCron: z.string().trim().min(1).max(100),
});

const generateKpiSnapshotsSchema = z.object({
  kpiIds: z.array(z.string().uuid()).optional(),
});

const generateForecastSchema = z.object({
  forecastType: forecastTypeSchema,
});

const generateReportSchema = z.object({
  filters: z.record(z.unknown()).optional(),
});

const updateInsightSchema = z.object({
  status: insightStatusSchema,
});

type BusinessIntelligenceRouterDeps = {
  businessIntelligenceService: BusinessIntelligenceService;
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

export function createBusinessIntelligenceRouter({
  businessIntelligenceService,
  teamService,
  jwtSecret,
  authService,
}: BusinessIntelligenceRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'bi:read',
    'bi:write',
    'intelligence:read',
    'analytics:read',
  );
  const requireWrite = requireAnyPermission('bi:write');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/stats', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const stats = await businessIntelligenceService.getStats(companyId);
    res.json({ data: { stats } });
  });

  router.get('/data-lake', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const modules = await businessIntelligenceService.getDataLakeSummary(companyId);
    res.json({ data: { modules } });
  });

  router.get('/kpis', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const kpis = await businessIntelligenceService.listKpis(companyId);
    res.json({ data: { kpis } });
  });

  router.post('/kpis', requireWrite, async (req, res) => {
    const parsed = createKpiSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid KPI payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const kpi = await businessIntelligenceService.createKpi(companyId, parsed.data);
      res.status(201).json({ data: { kpi } });
    } catch (error) {
      handleBusinessIntelligenceError(res, error);
    }
  });

  router.patch('/kpis/:id', requireWrite, async (req, res) => {
    const parsed = updateKpiSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid KPI payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const kpi = await businessIntelligenceService.updateKpi(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { kpi } });
    } catch (error) {
      handleBusinessIntelligenceError(res, error);
    }
  });

  router.post('/kpis/snapshots/generate', requireWrite, async (req, res) => {
    const parsed = generateKpiSnapshotsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid snapshot payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const snapshots = await businessIntelligenceService.generateKpiSnapshots(
        companyId,
        parsed.data,
      );
      res.status(201).json({ data: { snapshots } });
    } catch (error) {
      handleBusinessIntelligenceError(res, error);
    }
  });

  router.get('/kpis/snapshots', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const snapshots = await businessIntelligenceService.listKpiSnapshots(companyId);
    res.json({ data: { snapshots } });
  });

  router.get('/kpis/:id/snapshots', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const snapshots = await businessIntelligenceService.listKpiSnapshots(
      companyId,
      getRouteParam(req.params.id),
    );
    res.json({ data: { snapshots } });
  });

  router.get('/dashboards', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const dashboards = await businessIntelligenceService.listDashboards(companyId);
    res.json({ data: { dashboards } });
  });

  router.get('/dashboards/type/:type', requireRead, async (req, res) => {
    const dashboardType = dashboardTypeSchema.safeParse(getRouteParam(req.params.type));
    if (!dashboardType.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid dashboard type' } });
      return;
    }

    const { companyId } = getAuth(req);
    const dashboard = await businessIntelligenceService.getDashboardByType(
      companyId,
      dashboardType.data,
    );
    res.json({ data: { dashboard } });
  });

  router.get('/dashboards/:id', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const dashboard = await businessIntelligenceService.getDashboard(
      companyId,
      getRouteParam(req.params.id),
    );
    if (!dashboard) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Dashboard not found' } });
      return;
    }
    res.json({ data: { dashboard } });
  });

  router.post('/dashboards', requireWrite, async (req, res) => {
    const parsed = createDashboardSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid dashboard payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const dashboard = await businessIntelligenceService.createDashboard(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { dashboard } });
    } catch (error) {
      handleBusinessIntelligenceError(res, error);
    }
  });

  router.patch('/dashboards/:id', requireWrite, async (req, res) => {
    const parsed = updateDashboardSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid dashboard payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const dashboard = await businessIntelligenceService.updateDashboard(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { dashboard } });
    } catch (error) {
      handleBusinessIntelligenceError(res, error);
    }
  });

  router.post('/dashboards/:id/widgets', requireWrite, async (req, res) => {
    const parsed = createWidgetSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid widget payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const dashboard = await businessIntelligenceService.addDashboardWidget(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { dashboard } });
    } catch (error) {
      handleBusinessIntelligenceError(res, error);
    }
  });

  router.get('/report-templates', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const templates = await businessIntelligenceService.listReportTemplates(companyId);
    res.json({ data: { templates } });
  });

  router.post('/report-templates', requireWrite, async (req, res) => {
    const parsed = createReportTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid template payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const template = await businessIntelligenceService.createReportTemplate(
        companyId,
        parsed.data,
      );
      res.status(201).json({ data: { template } });
    } catch (error) {
      handleBusinessIntelligenceError(res, error);
    }
  });

  router.patch('/report-templates/:id', requireWrite, async (req, res) => {
    const parsed = updateReportTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid template payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const template = await businessIntelligenceService.updateReportTemplate(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { template } });
    } catch (error) {
      handleBusinessIntelligenceError(res, error);
    }
  });

  router.get('/reports', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const reports = await businessIntelligenceService.listReports(companyId);
    res.json({ data: { reports } });
  });

  router.get('/reports/:id', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const report = await businessIntelligenceService.getReport(
      companyId,
      getRouteParam(req.params.id),
    );
    if (!report) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
      return;
    }
    res.json({ data: { report } });
  });

  router.post('/reports', requireWrite, async (req, res) => {
    const parsed = createReportSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid report payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const report = await businessIntelligenceService.createReport(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { report } });
    } catch (error) {
      handleBusinessIntelligenceError(res, error);
    }
  });

  router.patch('/reports/:id', requireWrite, async (req, res) => {
    const parsed = updateReportSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid report payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const report = await businessIntelligenceService.updateReport(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { report } });
    } catch (error) {
      handleBusinessIntelligenceError(res, error);
    }
  });

  router.post('/reports/:id/submit', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const report = await businessIntelligenceService.submitReport(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.id),
      );
      res.json({ data: { report } });
    } catch (error) {
      handleBusinessIntelligenceError(res, error);
    }
  });

  router.post('/reports/:id/approve', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const report = await businessIntelligenceService.approveReport(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.id),
        { status: 'approved' },
      );
      res.json({ data: { report } });
    } catch (error) {
      handleBusinessIntelligenceError(res, error);
    }
  });

  router.post('/reports/:id/schedule', requireWrite, async (req, res) => {
    const parsed = scheduleReportSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid schedule payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const report = await businessIntelligenceService.scheduleReport(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { report } });
    } catch (error) {
      handleBusinessIntelligenceError(res, error);
    }
  });

  router.post('/reports/:id/generate', requireWrite, async (req, res) => {
    const parsed = generateReportSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid generate payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const report = await businessIntelligenceService.generateReport(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.status(201).json({ data: { report } });
    } catch (error) {
      handleBusinessIntelligenceError(res, error);
    }
  });

  router.get('/insights', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const insights = await businessIntelligenceService.listInsights(companyId);
    res.json({ data: { insights } });
  });

  router.post('/insights/generate', requireWrite, async (req, res) => {
    try {
      const { companyId } = getAuth(req);
      const insights = await businessIntelligenceService.generateInsights(companyId);
      res.status(201).json({ data: { insights } });
    } catch (error) {
      handleBusinessIntelligenceError(res, error);
    }
  });

  router.patch('/insights/:id', requireWrite, async (req, res) => {
    const parsed = updateInsightSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid insight payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const insight = await businessIntelligenceService.updateInsight(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { insight } });
    } catch (error) {
      handleBusinessIntelligenceError(res, error);
    }
  });

  router.get('/forecasts', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const forecasts = await businessIntelligenceService.listForecasts(companyId);
    res.json({ data: { forecasts } });
  });

  router.post('/forecasts/generate', requireWrite, async (req, res) => {
    const parsed = generateForecastSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid forecast payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const forecast = await businessIntelligenceService.generateForecast(companyId, parsed.data);
      res.status(201).json({ data: { forecast } });
    } catch (error) {
      handleBusinessIntelligenceError(res, error);
    }
  });

  return router;
}

function handleBusinessIntelligenceError(res: import('express').Response, error: unknown) {
  if (error instanceof BusinessIntelligenceError) {
    res.status(error.code === 'NOT_FOUND' ? 404 : 400).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  throw error;
}
