import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseAnalyticsService } from '../services/enterprise-analytics.service.js';
import { EnterpriseAnalyticsError } from '../services/enterprise-analytics.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const moduleSchema = z.enum([
  'finance',
  'sales',
  'marketing',
  'operations',
  'dispatch',
  'fleet',
  'inventory',
  'procurement',
  'hr',
  'customer_success',
  'ai',
  'productivity',
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

const permissionSchema = z.enum(['read', 'write', 'admin']);
const actionTypeSchema = z.enum([
  'strategic_report',
  'kpi_recommendation',
  'forecast_review',
  'governance_action',
]);

const actionSchema = z.object({
  actionType: actionTypeSchema,
  subject: z.string().trim().min(1).max(500),
  recommendation: z.string().trim().min(1).max(5000),
  payload: z.record(z.unknown()).optional(),
});

const layoutSchema = z.object({
  dashboardType: dashboardTypeSchema,
  name: z.string().trim().min(1).max(200),
  layout: z.record(z.unknown()).optional(),
  isDefault: z.boolean().optional(),
});

const datasetPermissionSchema = z.object({
  datasetKey: z.string().trim().min(1).max(200),
  permission: permissionSchema,
  roleId: z.string().uuid().optional().nullable(),
  userId: z.string().uuid().optional().nullable(),
});

const retentionPolicySchema = z.object({
  datasetKey: z.string().trim().min(1).max(200),
  retentionDays: z.number().int().min(1).max(3650),
  enabled: z.boolean().optional(),
});

const aggregationSchema = z.object({
  modules: z.array(moduleSchema).optional(),
});

type RouterDeps = {
  enterpriseAnalyticsService: EnterpriseAnalyticsService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

export function createEnterpriseAnalyticsRouter({
  enterpriseAnalyticsService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'bi:read',
    'bi:write',
    'analytics:read',
    'intelligence:read',
  );
  const requireWrite = requireAnyPermission('bi:write', 'analytics:write');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    const auth = getAuth(req);
    const dashboard = await enterpriseAnalyticsService.getExecutiveDashboard(auth.companyId);
    await enterpriseAnalyticsService.recordAccessAudit(auth, {
      action: 'view_dashboard',
      resourceType: 'executive_dashboard',
    });
    res.json({ data: { dashboard } });
  });

  router.get('/warehouse', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const warehouse = await enterpriseAnalyticsService.getWarehouseSummary(companyId);
    res.json({ data: { warehouse } });
  });

  router.get('/snapshots', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const snapshots = await enterpriseAnalyticsService.listSnapshots(companyId);
    res.json({ data: { snapshots } });
  });

  router.get('/lineage', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const lineage = await enterpriseAnalyticsService.listLineage(companyId);
    res.json({ data: { lineage } });
  });

  router.post('/aggregate', requireWrite, async (req, res) => {
    const parsed = aggregationSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid aggregation payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const snapshots = await enterpriseAnalyticsService.runIncrementalAggregation(
        auth.companyId,
        parsed.data,
      );
      await enterpriseAnalyticsService.recordAccessAudit(auth, {
        action: 'run_aggregation',
        resourceType: 'data_warehouse',
        metadata: { snapshotCount: snapshots.length },
      });
      res.status(201).json({ data: { snapshots } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/governance', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const governance = await enterpriseAnalyticsService.getGovernanceSummary(companyId);
    res.json({ data: { governance } });
  });

  router.get('/audit', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const audit = await enterpriseAnalyticsService.listAccessAudit(companyId);
    res.json({ data: { audit } });
  });

  router.post('/governance/dataset-permissions', requireWrite, async (req, res) => {
    const parsed = datasetPermissionSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid permission payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const permission = await enterpriseAnalyticsService.createDatasetPermission(
        auth.companyId,
        parsed.data,
      );
      res.status(201).json({ data: { permission } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post('/governance/retention-policies', requireWrite, async (req, res) => {
    const parsed = retentionPolicySchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid retention policy payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const policy = await enterpriseAnalyticsService.createRetentionPolicy(companyId, parsed.data);
      res.status(201).json({ data: { policy } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/layouts', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const layouts = await enterpriseAnalyticsService.listSavedLayouts(companyId);
    res.json({ data: { layouts } });
  });

  router.post('/layouts', requireWrite, async (req, res) => {
    const parsed = layoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid layout payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const layout = await enterpriseAnalyticsService.createSavedLayout(auth, parsed.data);
      res.status(201).json({ data: { layout } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/actions', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const actions = await enterpriseAnalyticsService.listActions(companyId);
    res.json({ data: { actions } });
  });

  router.post('/actions', requireWrite, async (req, res) => {
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid action payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const action = await enterpriseAnalyticsService.createAction(auth, parsed.data);
      res.status(201).json({ data: { action } });
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
}

function handleError(res: import('express').Response, error: unknown) {
  if (error instanceof EnterpriseAnalyticsError) {
    res.status(error.code === 'NOT_FOUND' ? 404 : 400).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  throw error;
}
