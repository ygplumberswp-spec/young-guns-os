import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseProductionLaunchService } from '../services/enterprise-production-launch.service.js';
import { EnterpriseProductionLaunchError } from '../services/enterprise-production-launch.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const platformConfigSchema = z.object({
  deploymentPolicy: z.record(z.unknown()).optional(),
  providerPolicy: z.record(z.unknown()).optional(),
  launchPolicy: z.record(z.unknown()).optional(),
  alertLevelConfig: z.record(z.unknown()).optional(),
  auditRetentionDays: z.number().int().min(1).optional(),
});

const goLiveWizardSchema = z.object({
  title: z.string().trim().min(1).max(200),
  ownerUserId: z.string().uuid().optional(),
});

const wizardStepSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'passed', 'failed', 'blocked', 'skipped']),
  notes: z.string().trim().max(5000).optional(),
});

const approveSchema = z.object({
  notes: z.string().trim().max(5000).optional(),
});

const deploymentRunSchema = z.object({
  environment: z.string().trim().max(100).optional(),
  title: z.string().trim().max(200).optional(),
});

const actionDraftSchema = z.object({
  draftType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  sourceRecords: z.record(z.unknown()).optional(),
  aiGenerated: z.boolean().optional(),
});

type RouterDeps = {
  enterpriseProductionLaunchService: EnterpriseProductionLaunchService;
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
  if (error instanceof EnterpriseProductionLaunchError) {
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

export function createEnterpriseProductionLaunchRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireStaffAuth = createAuthMiddleware({ jwtSecret: deps.jwtSecret, authService: deps.authService });
  const requireRead = requireAnyPermission('production_launch:read', 'production_launch:manage', 'ops:read', 'release_center:read');
  const requireWrite = requireAnyPermission('production_launch:write', 'production_launch:manage', 'ops:manage');
  const requireManage = requireAnyPermission('production_launch:manage', 'ops:manage');

  router.use(requireStaffAuth);

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const dashboard = await deps.enterpriseProductionLaunchService.getDashboard(getAuth(req).companyId);
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/platform-config', requireRead, async (req, res) => {
    try {
      const platformConfig = await deps.enterpriseProductionLaunchService.getPlatformConfig(getAuth(req).companyId);
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/platform-config', requireManage, async (req, res) => {
    try {
      const input = platformConfigSchema.parse(req.body);
      const platformConfig = await deps.enterpriseProductionLaunchService.updatePlatformConfig(staffScope(req), input);
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/environment-review/run', requireWrite, async (req, res) => {
    try {
      const review = await deps.enterpriseProductionLaunchService.runEnvironmentReview(staffScope(req));
      res.json({ data: { review } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/domain-security-review/run', requireWrite, async (req, res) => {
    try {
      const review = await deps.enterpriseProductionLaunchService.runDomainSecurityReview(staffScope(req));
      res.json({ data: { review } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/live-integration-verification/run', requireWrite, async (req, res) => {
    try {
      const run = await deps.enterpriseProductionLaunchService.runLiveIntegrationVerification(staffScope(req));
      res.json({ data: { run } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/live-integration-verification/runs', requireRead, async (req, res) => {
    try {
      const runs = await deps.enterpriseProductionLaunchService.listLiveIntegrationRuns(getAuth(req).companyId);
      res.json({ data: { runs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/live-integration-verification/runs/:runId', requireRead, async (req, res) => {
    try {
      const run = await deps.enterpriseProductionLaunchService.getLiveIntegrationRunDetail(
        getAuth(req).companyId,
        getRouteParam(req.params.runId),
      );
      res.json({ data: { run } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/commercial-readiness/run', requireWrite, async (req, res) => {
    try {
      const review = await deps.enterpriseProductionLaunchService.runCommercialReadinessReview(staffScope(req));
      res.json({ data: { review } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/mobile-production-review/run', requireWrite, async (req, res) => {
    try {
      const review = await deps.enterpriseProductionLaunchService.runMobileProductionReview(staffScope(req));
      res.json({ data: { review } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/deployment-runs', requireRead, async (req, res) => {
    try {
      const runs = await deps.enterpriseProductionLaunchService.listDeploymentRuns(getAuth(req).companyId);
      res.json({ data: { runs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/deployment-runs', requireWrite, async (req, res) => {
    try {
      const input = deploymentRunSchema.parse(req.body ?? {});
      const run = await deps.enterpriseProductionLaunchService.createDeploymentRun(staffScope(req), input);
      res.json({ data: { run } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/deployment-runs/:runId/health-verification', requireWrite, async (req, res) => {
    try {
      const run = await deps.enterpriseProductionLaunchService.runDeploymentHealthVerification(
        staffScope(req),
        getRouteParam(req.params.runId),
      );
      res.json({ data: { run } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/deployment-runs/:runId/smoke-tests', requireWrite, async (req, res) => {
    try {
      const run = await deps.enterpriseProductionLaunchService.runDeploymentSmokeTests(
        staffScope(req),
        getRouteParam(req.params.runId),
      );
      res.json({ data: { run } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/deployment-runs/:runId/submit-approval', requireWrite, async (req, res) => {
    try {
      const run = await deps.enterpriseProductionLaunchService.submitDeploymentForApproval(
        staffScope(req),
        getRouteParam(req.params.runId),
      );
      res.json({ data: { run } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/deployment-runs/:runId/approve', requireManage, async (req, res) => {
    try {
      const input = approveSchema.parse(req.body ?? {});
      const run = await deps.enterpriseProductionLaunchService.approveDeployment(
        staffScope(req),
        getRouteParam(req.params.runId),
        input,
      );
      res.json({ data: { run } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/deployment-runs/:runId/confirm', requireManage, async (req, res) => {
    try {
      const run = await deps.enterpriseProductionLaunchService.confirmDeployment(
        staffScope(req),
        getRouteParam(req.params.runId),
      );
      res.json({ data: { run } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/deployment-runs/:runId/rollback', requireManage, async (req, res) => {
    try {
      const run = await deps.enterpriseProductionLaunchService.recordDeploymentRollback(
        staffScope(req),
        getRouteParam(req.params.runId),
      );
      res.json({ data: { run } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/go-live/wizards', requireRead, async (req, res) => {
    try {
      const wizards = await deps.enterpriseProductionLaunchService.listGoLiveWizards(getAuth(req).companyId);
      res.json({ data: { wizards } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/go-live/wizards', requireWrite, async (req, res) => {
    try {
      const input = goLiveWizardSchema.parse(req.body);
      const wizard = await deps.enterpriseProductionLaunchService.createGoLiveWizard(staffScope(req), input);
      res.json({ data: { wizard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.patch('/go-live/wizards/:wizardId/steps/:stepKey', requireWrite, async (req, res) => {
    try {
      const input = wizardStepSchema.parse(req.body);
      const wizard = await deps.enterpriseProductionLaunchService.updateGoLiveWizardStep(
        staffScope(req),
        getRouteParam(req.params.wizardId),
        getRouteParam(req.params.stepKey),
        input,
      );
      res.json({ data: { wizard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/go-live/wizards/:wizardId/approve', requireManage, async (req, res) => {
    try {
      const input = approveSchema.parse(req.body ?? {});
      const wizard = await deps.enterpriseProductionLaunchService.approveGoLiveWizard(
        staffScope(req),
        getRouteParam(req.params.wizardId),
        input,
      );
      res.json({ data: { wizard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/go-live/wizards/:wizardId/confirm-launch', requireManage, async (req, res) => {
    try {
      const wizard = await deps.enterpriseProductionLaunchService.confirmGoLiveLaunch(
        staffScope(req),
        getRouteParam(req.params.wizardId),
      );
      res.json({ data: { wizard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/platform-alerts/sync', requireWrite, async (req, res) => {
    try {
      const platformAlerts = await deps.enterpriseProductionLaunchService.syncPlatformAlerts(staffScope(req));
      res.json({ data: { platformAlerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/analytics/capture', requireWrite, async (req, res) => {
    try {
      const analytics = await deps.enterpriseProductionLaunchService.captureAnalytics(staffScope(req));
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/audit-logs', requireRead, async (req, res) => {
    try {
      const auditLogs = await deps.enterpriseProductionLaunchService.listAuditLogs(getAuth(req).companyId);
      res.json({ data: { auditLogs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/action-drafts', requireWrite, async (req, res) => {
    try {
      const input = actionDraftSchema.parse(req.body);
      const draft = await deps.enterpriseProductionLaunchService.createActionDraft(staffScope(req), input);
      res.json({ data: { draft } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
