import { Router } from 'express';
import { z } from 'zod';
import type { EnterprisePlatformHealthService } from '../services/enterprise-platform-health.service.js';
import { EnterprisePlatformHealthError } from '../services/enterprise-platform-health.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const platformConfigSchema = z.object({
  monitoringPolicy: z.record(z.unknown()).optional(),
  diagnosticsPolicy: z.record(z.unknown()).optional(),
  capacityPolicy: z.record(z.unknown()).optional(),
  incidentPolicy: z.record(z.unknown()).optional(),
  alertLevelConfig: z.record(z.unknown()).optional(),
  auditRetentionDays: z.number().int().min(1).optional(),
});

const incidentSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(5000).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  sourceModule: z.string().trim().max(200).optional(),
  assignedUserId: z.string().uuid().optional(),
});

const updateIncidentSchema = incidentSchema.partial().extend({
  status: z.enum(['open', 'investigating', 'mitigated', 'resolved', 'closed']).optional(),
});

const actionDraftSchema = z.object({
  draftType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  sourceRecords: z.record(z.unknown()).optional(),
  aiGenerated: z.boolean().optional(),
});

type RouterDeps = {
  enterprisePlatformHealthService: EnterprisePlatformHealthService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function staffScope(req: import('express').Request) {
  const auth = getAuth(req);
  return { companyId: auth.companyId, userId: auth.userId };
}

function getRouteParam(value: string | string[]) {
  return Array.isArray(value) ? value[0]! : value;
}

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof EnterprisePlatformHealthError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'VALIDATION_ERROR' ? 400 : 500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createEnterprisePlatformHealthRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireStaffAuth = createAuthMiddleware({ jwtSecret: deps.jwtSecret, authService: deps.authService });
  const requireRead = requireAnyPermission('platform_health:read', 'platform_health:manage', 'integrations:read', 'it_operations:read');
  const requireWrite = requireAnyPermission('platform_health:write', 'platform_health:manage', 'integrations:manage', 'it_operations:write');
  const requireManage = requireAnyPermission('platform_health:manage', 'integrations:manage', 'it_operations:manage');

  router.use(requireStaffAuth);

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const dashboard = await deps.enterprisePlatformHealthService.getDashboard(getAuth(req).companyId);
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/platform-config', requireRead, async (req, res) => {
    try {
      const platformConfig = await deps.enterprisePlatformHealthService.getPlatformConfig(getAuth(req).companyId);
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/platform-config', requireManage, async (req, res) => {
    try {
      const input = platformConfigSchema.parse(req.body);
      const platformConfig = await deps.enterprisePlatformHealthService.updatePlatformConfig(staffScope(req), input);
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/health-snapshots/capture', requireWrite, async (req, res) => {
    try {
      const healthSnapshot = await deps.enterprisePlatformHealthService.captureHealthSnapshot(staffScope(req));
      res.json({ data: { healthSnapshot } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/diagnostics/runs', requireRead, async (req, res) => {
    try {
      const diagnosticRuns = await deps.enterprisePlatformHealthService.listDiagnosticRuns(getAuth(req).companyId);
      res.json({ data: { diagnosticRuns } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/diagnostics/run', requireWrite, async (req, res) => {
    try {
      const diagnosticRun = await deps.enterprisePlatformHealthService.runDiagnostics(staffScope(req));
      res.status(201).json({ data: { diagnosticRun } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/diagnostics/runs/:id', requireRead, async (req, res) => {
    try {
      const diagnosticRun = await deps.enterprisePlatformHealthService.getDiagnosticRunDetail(
        getAuth(req).companyId,
        getRouteParam(req.params.id),
      );
      res.json({ data: { diagnosticRun } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/performance/insights', requireRead, async (req, res) => {
    try {
      const performanceInsights = await deps.enterprisePlatformHealthService.listPerformanceInsights(getAuth(req).companyId);
      res.json({ data: { performanceInsights } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/performance/insights/generate', requireWrite, async (req, res) => {
    try {
      const performanceInsights = await deps.enterprisePlatformHealthService.generatePerformanceInsights(getAuth(req).companyId);
      res.json({ data: { performanceInsights } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/capacity/capture', requireWrite, async (req, res) => {
    try {
      const capacitySnapshot = await deps.enterprisePlatformHealthService.captureCapacitySnapshot(getAuth(req).companyId);
      res.json({ data: { capacitySnapshot } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/incidents', requireRead, async (req, res) => {
    try {
      const incidents = await deps.enterprisePlatformHealthService.listIncidents(getAuth(req).companyId);
      res.json({ data: { incidents } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/incidents', requireWrite, async (req, res) => {
    try {
      const input = incidentSchema.parse(req.body);
      const incident = await deps.enterprisePlatformHealthService.createIncident(staffScope(req), input);
      res.status(201).json({ data: { incident } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/incidents/:id', requireWrite, async (req, res) => {
    try {
      const input = updateIncidentSchema.parse(req.body);
      const incident = await deps.enterprisePlatformHealthService.updateIncident(
        staffScope(req),
        getRouteParam(req.params.id),
        input,
      );
      res.json({ data: { incident } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/platform-alerts', requireRead, async (req, res) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const platformAlerts = await deps.enterprisePlatformHealthService.listPlatformAlerts(getAuth(req).companyId, { status });
      res.json({ data: { platformAlerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/platform-alerts/sync', requireWrite, async (req, res) => {
    try {
      const platformAlerts = await deps.enterprisePlatformHealthService.syncPlatformAlerts(staffScope(req));
      res.json({ data: { platformAlerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/analytics/capture', requireWrite, async (req, res) => {
    try {
      const analytics = await deps.enterprisePlatformHealthService.captureAnalytics(staffScope(req));
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/action-drafts', requireRead, async (req, res) => {
    try {
      const actionDrafts = await deps.enterprisePlatformHealthService.listActionDrafts(getAuth(req).companyId);
      res.json({ data: { actionDrafts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/action-drafts', requireWrite, async (req, res) => {
    try {
      const input = actionDraftSchema.parse(req.body);
      const actionDraft = await deps.enterprisePlatformHealthService.createActionDraft(staffScope(req), input);
      res.status(201).json({ data: { actionDraft } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/audit-logs', requireRead, async (req, res) => {
    try {
      const auditLogs = await deps.enterprisePlatformHealthService.listAuditLogs(getAuth(req).companyId);
      res.json({ data: { auditLogs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
