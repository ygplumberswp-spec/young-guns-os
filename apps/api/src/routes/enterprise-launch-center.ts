import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseLaunchCenterService } from '../services/enterprise-launch-center.service.js';
import { EnterpriseLaunchCenterError } from '../services/enterprise-launch-center.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const platformConfigSchema = z.object({
  readinessPolicy: z.record(z.unknown()).optional(),
  scoringWeights: z.record(z.unknown()).optional(),
  acceptancePolicy: z.record(z.unknown()).optional(),
  goLivePolicy: z.record(z.unknown()).optional(),
  rollbackPolicy: z.record(z.unknown()).optional(),
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

const approveWizardSchema = z.object({
  notes: z.string().trim().max(5000).optional(),
});

const actionDraftSchema = z.object({
  draftType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  sourceRecords: z.record(z.unknown()).optional(),
  aiGenerated: z.boolean().optional(),
});

type RouterDeps = {
  enterpriseLaunchCenterService: EnterpriseLaunchCenterService;
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
  if (error instanceof EnterpriseLaunchCenterError) {
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

export function createEnterpriseLaunchCenterRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireStaffAuth = createAuthMiddleware({ jwtSecret: deps.jwtSecret, authService: deps.authService });
  const requireRead = requireAnyPermission('launch_center:read', 'launch_center:manage', 'ops:read', 'platform_health:read');
  const requireWrite = requireAnyPermission('launch_center:write', 'launch_center:manage', 'ops:manage');
  const requireManage = requireAnyPermission('launch_center:manage', 'ops:manage');

  router.use(requireStaffAuth);

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const dashboard = await deps.enterpriseLaunchCenterService.getDashboard(getAuth(req).companyId);
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/platform-config', requireRead, async (req, res) => {
    try {
      const platformConfig = await deps.enterpriseLaunchCenterService.getPlatformConfig(getAuth(req).companyId);
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/platform-config', requireManage, async (req, res) => {
    try {
      const input = platformConfigSchema.parse(req.body);
      const platformConfig = await deps.enterpriseLaunchCenterService.updatePlatformConfig(staffScope(req), input);
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/readiness-scans/run', requireWrite, async (req, res) => {
    try {
      const scan = await deps.enterpriseLaunchCenterService.runReadinessScan(staffScope(req));
      res.json({ data: { scan } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/readiness-scans', requireRead, async (req, res) => {
    try {
      const readinessScans = await deps.enterpriseLaunchCenterService.listReadinessScans(getAuth(req).companyId);
      res.json({ data: { readinessScans } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/readiness-scans/:scanId', requireRead, async (req, res) => {
    try {
      const scan = await deps.enterpriseLaunchCenterService.getReadinessScanDetail(getAuth(req).companyId, getRouteParam(req.params.scanId));
      res.json({ data: { scan } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/readiness-scores/latest', requireRead, async (req, res) => {
    try {
      const readinessScore = await deps.enterpriseLaunchCenterService.getLatestReadinessScore(getAuth(req).companyId);
      res.json({ data: { readinessScore } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/acceptance/suites', requireRead, async (req, res) => {
    try {
      const acceptanceTestSuites = await deps.enterpriseLaunchCenterService.listAcceptanceSuites(getAuth(req).companyId);
      res.json({ data: { acceptanceTestSuites } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/acceptance/run', requireWrite, async (req, res) => {
    try {
      const suiteId = typeof req.body?.suiteId === 'string' ? req.body.suiteId : undefined;
      const run = await deps.enterpriseLaunchCenterService.runAcceptanceTests(staffScope(req), suiteId);
      res.json({ data: { run } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/acceptance/runs', requireRead, async (req, res) => {
    try {
      const acceptanceTestRuns = await deps.enterpriseLaunchCenterService.listAcceptanceTestRuns(getAuth(req).companyId);
      res.json({ data: { acceptanceTestRuns } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/acceptance/runs/:runId', requireRead, async (req, res) => {
    try {
      const run = await deps.enterpriseLaunchCenterService.getAcceptanceTestRunDetail(getAuth(req).companyId, getRouteParam(req.params.runId));
      res.json({ data: { run } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/go-live/wizards', requireRead, async (req, res) => {
    try {
      const goLiveWizards = await deps.enterpriseLaunchCenterService.listGoLiveWizards(getAuth(req).companyId);
      res.json({ data: { goLiveWizards } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/go-live/wizards', requireWrite, async (req, res) => {
    try {
      const input = goLiveWizardSchema.parse(req.body);
      const wizard = await deps.enterpriseLaunchCenterService.createGoLiveWizard(staffScope(req), input);
      res.json({ data: { wizard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.patch('/go-live/wizards/:wizardId/steps/:stepKey', requireWrite, async (req, res) => {
    try {
      const input = wizardStepSchema.parse(req.body);
      const wizard = await deps.enterpriseLaunchCenterService.updateGoLiveWizardStep(
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
      const input = approveWizardSchema.parse(req.body ?? {});
      const wizard = await deps.enterpriseLaunchCenterService.approveGoLiveWizard(staffScope(req), getRouteParam(req.params.wizardId), input);
      res.json({ data: { wizard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/go-live/wizards/:wizardId/confirm-deployment', requireManage, async (req, res) => {
    try {
      const wizard = await deps.enterpriseLaunchCenterService.confirmDeployment(staffScope(req), getRouteParam(req.params.wizardId));
      res.json({ data: { wizard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/rollback-plans', requireRead, async (req, res) => {
    try {
      const wizardId = typeof req.query.wizardId === 'string' ? req.query.wizardId : undefined;
      const rollbackPlanLinks = await deps.enterpriseLaunchCenterService.listRollbackPlans(getAuth(req).companyId, wizardId);
      res.json({ data: { rollbackPlanLinks } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/rollback-plans/:linkId/validate', requireWrite, async (req, res) => {
    try {
      const link = await deps.enterpriseLaunchCenterService.validateRollbackPlan(staffScope(req), getRouteParam(req.params.linkId));
      res.json({ data: { link } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/rollback-plans/select', requireWrite, async (req, res) => {
    try {
      const wizardId = z.string().uuid().parse(req.body.wizardId);
      const rollbackPlanLinkId = z.string().uuid().parse(req.body.rollbackPlanLinkId);
      const rollbackPlanLinks = await deps.enterpriseLaunchCenterService.selectRollbackPlan(staffScope(req), wizardId, rollbackPlanLinkId);
      res.json({ data: { rollbackPlanLinks } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/deployment-validations', requireRead, async (req, res) => {
    try {
      const deploymentValidations = await deps.enterpriseLaunchCenterService.listDeploymentValidations(getAuth(req).companyId);
      res.json({ data: { deploymentValidations } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/deployment-validations/run', requireWrite, async (req, res) => {
    try {
      const goLiveWizardId = typeof req.body?.goLiveWizardId === 'string' ? req.body.goLiveWizardId : undefined;
      const validation = await deps.enterpriseLaunchCenterService.runPostDeploymentValidation(staffScope(req), goLiveWizardId);
      res.json({ data: { validation } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/platform-alerts/sync', requireWrite, async (req, res) => {
    try {
      const platformAlerts = await deps.enterpriseLaunchCenterService.syncPlatformAlerts(staffScope(req));
      res.json({ data: { platformAlerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/analytics/capture', requireWrite, async (req, res) => {
    try {
      const analytics = await deps.enterpriseLaunchCenterService.captureAnalytics(staffScope(req));
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/audit-logs', requireRead, async (req, res) => {
    try {
      const auditLogs = await deps.enterpriseLaunchCenterService.listAuditLogs(getAuth(req).companyId);
      res.json({ data: { auditLogs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/action-drafts', requireWrite, async (req, res) => {
    try {
      const input = actionDraftSchema.parse(req.body);
      const draft = await deps.enterpriseLaunchCenterService.createActionDraft(staffScope(req), input);
      res.json({ data: { draft } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
