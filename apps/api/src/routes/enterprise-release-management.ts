import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseReleaseManagementService } from '../services/enterprise-release-management.service.js';
import { EnterpriseReleaseManagementError } from '../services/enterprise-release-management.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const platformConfigSchema = z.object({
  releasePolicy: z.record(z.unknown()).optional(),
  documentationPolicy: z.record(z.unknown()).optional(),
  mobilePolicy: z.record(z.unknown()).optional(),
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
  enterpriseReleaseManagementService: EnterpriseReleaseManagementService;
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

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof EnterpriseReleaseManagementError) {
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

export function createEnterpriseReleaseManagementRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireStaffAuth = createAuthMiddleware({
    jwtSecret: deps.jwtSecret,
    authService: deps.authService,
  });
  const requireRead = requireAnyPermission(
    'release_manager:read',
    'release_manager:manage',
    'ops:read',
    'production_launch:read',
  );
  const requireWrite = requireAnyPermission(
    'release_manager:write',
    'release_manager:manage',
    'ops:manage',
  );
  const requireManage = requireAnyPermission('release_manager:manage', 'ops:manage');

  router.use(requireStaffAuth);

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const dashboard = await deps.enterpriseReleaseManagementService.getDashboard(
        getAuth(req).companyId,
      );
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/platform-config', requireRead, async (req, res) => {
    try {
      const platformConfig = await deps.enterpriseReleaseManagementService.getPlatformConfig(
        getAuth(req).companyId,
      );
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/platform-config', requireManage, async (req, res) => {
    try {
      const input = platformConfigSchema.parse(req.body);
      const platformConfig = await deps.enterpriseReleaseManagementService.updatePlatformConfig(
        staffScope(req),
        input,
      );
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/mobile-packaging-review/run', requireWrite, async (req, res) => {
    try {
      const review = await deps.enterpriseReleaseManagementService.runMobilePackagingReview(
        staffScope(req),
      );
      res.json({ data: { review } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/app-store-readiness/run', requireWrite, async (req, res) => {
    try {
      const reviews = await deps.enterpriseReleaseManagementService.runAppStoreReadinessReviews(
        staffScope(req),
      );
      res.json({ data: { reviews } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/branding-review/run', requireWrite, async (req, res) => {
    try {
      const review = await deps.enterpriseReleaseManagementService.runBrandingReview(
        staffScope(req),
      );
      res.json({ data: { review } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/ux-review/run', requireWrite, async (req, res) => {
    try {
      const review = await deps.enterpriseReleaseManagementService.runUxReview(staffScope(req));
      res.json({ data: { review } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/documentation/refresh', requireWrite, async (req, res) => {
    try {
      const artifacts = await deps.enterpriseReleaseManagementService.refreshDocumentationStatus(
        staffScope(req),
      );
      res.json({ data: { artifacts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/version/finalize', requireManage, async (req, res) => {
    try {
      const versionRecord = await deps.enterpriseReleaseManagementService.finalizeVersion(
        staffScope(req),
      );
      res.json({ data: { versionRecord } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/platform-alerts/sync', requireWrite, async (req, res) => {
    try {
      const platformAlerts = await deps.enterpriseReleaseManagementService.syncPlatformAlerts(
        staffScope(req),
      );
      res.json({ data: { platformAlerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/analytics/capture', requireWrite, async (req, res) => {
    try {
      const analytics = await deps.enterpriseReleaseManagementService.captureAnalytics(
        staffScope(req),
      );
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/audit-logs', requireRead, async (req, res) => {
    try {
      const auditLogs = await deps.enterpriseReleaseManagementService.listAuditLogs(
        getAuth(req).companyId,
      );
      res.json({ data: { auditLogs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/action-drafts', requireWrite, async (req, res) => {
    try {
      const input = actionDraftSchema.parse(req.body);
      const draft = await deps.enterpriseReleaseManagementService.createActionDraft(
        staffScope(req),
        input,
      );
      res.json({ data: { draft } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
