import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseReleaseCenterService } from '../services/enterprise-release-center.service.js';
import { EnterpriseReleaseCenterError } from '../services/enterprise-release-center.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const platformConfigSchema = z.object({
  validationPolicy: z.record(z.unknown()).optional(),
  performancePolicy: z.record(z.unknown()).optional(),
  releasePolicy: z.record(z.unknown()).optional(),
  alertLevelConfig: z.record(z.unknown()).optional(),
  auditRetentionDays: z.number().int().min(1).optional(),
});

const actionDraftSchema = z.object({
  draftType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  sourceRecords: z.record(z.unknown()).optional(),
  aiGenerated: z.boolean().optional(),
});

type RouterDeps = {
  enterpriseReleaseCenterService: EnterpriseReleaseCenterService;
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
  if (error instanceof EnterpriseReleaseCenterError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'VALIDATION_ERROR' ? 400 : 500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof Error) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
    return;
  }
  throw error;
}

export function createEnterpriseReleaseCenterRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireStaffAuth = createAuthMiddleware({ jwtSecret: deps.jwtSecret, authService: deps.authService });
  const requireRead = requireAnyPermission('release_center:read', 'release_center:manage', 'ops:read', 'launch_center:read');
  const requireWrite = requireAnyPermission('release_center:write', 'release_center:manage', 'ops:manage');
  const requireManage = requireAnyPermission('release_center:manage', 'ops:manage');

  router.use(requireStaffAuth);

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const dashboard = await deps.enterpriseReleaseCenterService.getDashboard(getAuth(req).companyId);
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/platform-config', requireRead, async (req, res) => {
    try {
      const platformConfig = await deps.enterpriseReleaseCenterService.getPlatformConfig(getAuth(req).companyId);
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/platform-config', requireManage, async (req, res) => {
    try {
      const input = platformConfigSchema.parse(req.body);
      const platformConfig = await deps.enterpriseReleaseCenterService.updatePlatformConfig(staffScope(req), input);
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/integration-validation/run', requireWrite, async (req, res) => {
    try {
      const run = await deps.enterpriseReleaseCenterService.runIntegrationValidation(staffScope(req));
      res.json({ data: { run } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/integration-validation/runs', requireRead, async (req, res) => {
    try {
      const runs = await deps.enterpriseReleaseCenterService.listIntegrationRuns(getAuth(req).companyId);
      res.json({ data: { runs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/integration-validation/runs/:runId', requireRead, async (req, res) => {
    try {
      const run = await deps.enterpriseReleaseCenterService.getIntegrationRunDetail(
        getAuth(req).companyId,
        getRouteParam(req.params.runId),
      );
      res.json({ data: { run } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/workflow-validation/run', requireWrite, async (req, res) => {
    try {
      const run = await deps.enterpriseReleaseCenterService.runWorkflowValidation(staffScope(req));
      res.json({ data: { run } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/workflow-validation/runs', requireRead, async (req, res) => {
    try {
      const runs = await deps.enterpriseReleaseCenterService.listWorkflowRuns(getAuth(req).companyId);
      res.json({ data: { runs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/workflow-validation/runs/:runId', requireRead, async (req, res) => {
    try {
      const run = await deps.enterpriseReleaseCenterService.getWorkflowRunDetail(
        getAuth(req).companyId,
        getRouteParam(req.params.runId),
      );
      res.json({ data: { run } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/performance/capture', requireWrite, async (req, res) => {
    try {
      const snapshot = await deps.enterpriseReleaseCenterService.capturePerformanceSnapshot(staffScope(req));
      res.json({ data: { snapshot } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/performance/latest', requireRead, async (req, res) => {
    try {
      const snapshot = await deps.enterpriseReleaseCenterService.getLatestPerformanceSnapshot(getAuth(req).companyId);
      res.json({ data: { snapshot } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/security-verification/run', requireWrite, async (req, res) => {
    try {
      const run = await deps.enterpriseReleaseCenterService.runSecurityVerification(staffScope(req));
      res.json({ data: { run } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/configuration-review/run', requireWrite, async (req, res) => {
    try {
      const review = await deps.enterpriseReleaseCenterService.runConfigurationReview(staffScope(req));
      res.json({ data: { review } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/release-report/generate', requireWrite, async (req, res) => {
    try {
      const report = await deps.enterpriseReleaseCenterService.generateReleaseReport(staffScope(req));
      res.json({ data: { report } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/release-report/latest', requireRead, async (req, res) => {
    try {
      const report = await deps.enterpriseReleaseCenterService.getLatestReleaseReport(getAuth(req).companyId);
      res.json({ data: { report } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/release-checklist', requireRead, async (req, res) => {
    try {
      const checklist = await deps.enterpriseReleaseCenterService.listReleaseChecklist(getAuth(req).companyId);
      res.json({ data: { checklist } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/platform-alerts/sync', requireWrite, async (req, res) => {
    try {
      const platformAlerts = await deps.enterpriseReleaseCenterService.syncPlatformAlerts(staffScope(req));
      res.json({ data: { platformAlerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/analytics/capture', requireWrite, async (req, res) => {
    try {
      const analytics = await deps.enterpriseReleaseCenterService.captureAnalytics(staffScope(req));
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/audit-logs', requireRead, async (req, res) => {
    try {
      const auditLogs = await deps.enterpriseReleaseCenterService.listAuditLogs(getAuth(req).companyId);
      res.json({ data: { auditLogs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/action-drafts', requireWrite, async (req, res) => {
    try {
      const input = actionDraftSchema.parse(req.body);
      const draft = await deps.enterpriseReleaseCenterService.createActionDraft(staffScope(req), input);
      res.json({ data: { draft } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
