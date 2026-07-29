import { Router } from 'express';
import { z } from 'zod';
import type { EnterprisePublicDeveloperPlatformService } from '../services/enterprise-public-developer-platform.service.js';
import { EnterprisePublicDeveloperPlatformError } from '../services/enterprise-public-developer-platform.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const platformConfigSchema = z.object({
  apiPolicy: z.record(z.unknown()).optional(),
  webhookPolicy: z.record(z.unknown()).optional(),
  authPolicy: z.record(z.unknown()).optional(),
  rateLimitPolicy: z.record(z.unknown()).optional(),
  sandboxPolicy: z.record(z.unknown()).optional(),
  auditRetentionDays: z.number().int().min(1).optional(),
});

const sandboxConfigSchema = z.object({
  enabled: z.boolean().optional(),
  sandboxBaseUrl: z.string().trim().max(500).optional(),
  testKeyPolicy: z.record(z.unknown()).optional(),
  webhookTestPolicy: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
});

const rateLimitSchema = z.object({
  policyKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  tenantLimitPerMinute: z.number().int().optional(),
  applicationLimitPerMinute: z.number().int().optional(),
  burstLimit: z.number().int().optional(),
  config: z.record(z.unknown()).optional(),
});

const sdkSchema = z.object({
  language: z.enum(['typescript', 'javascript', 'python']),
});

const draftSchema = z.object({
  draftType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  sourceRecords: z.record(z.unknown()).optional(),
  aiGenerated: z.boolean().optional(),
});

type RouterDeps = {
  enterprisePublicDeveloperPlatformService: EnterprisePublicDeveloperPlatformService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function getRouteParam(value: string | string[]) {
  return Array.isArray(value) ? value[0]! : value;
}

function staffScope(req: import('express').Request) {
  const auth = getAuth(req);
  return { companyId: auth.companyId, userId: auth.userId };
}

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof EnterprisePublicDeveloperPlatformError) {
    const status =
      error.code === 'NOT_FOUND' ? 404 : error.code === 'VALIDATION_ERROR' || error.code === 'CONFLICT' ? 400 : 500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createEnterprisePublicDeveloperPlatformRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireStaffAuth = createAuthMiddleware({ jwtSecret: deps.jwtSecret, authService: deps.authService });
  const requireRead = requireAnyPermission('public_developer:read', 'public_developer:manage', 'integrations:read', 'integrations:manage');
  const requireWrite = requireAnyPermission('public_developer:write', 'public_developer:manage', 'integrations:manage');
  const requireManage = requireAnyPermission('public_developer:manage', 'integrations:manage');

  router.use(requireStaffAuth);

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const dashboard = await deps.enterprisePublicDeveloperPlatformService.getDashboard(auth.companyId);
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/developer-monitoring', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const developerMonitoring = await deps.enterprisePublicDeveloperPlatformService.getDeveloperMonitoring(auth.companyId);
      res.json({ data: { developerMonitoring } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/platform-config', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const platformConfig = await deps.enterprisePublicDeveloperPlatformService.getPlatformConfig(auth.companyId);
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/platform-config', requireManage, async (req, res) => {
    const parsed = platformConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid platform config' } });
      return;
    }
    try {
      const platformConfig = await deps.enterprisePublicDeveloperPlatformService.updatePlatformConfig(staffScope(req), parsed.data);
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/sandbox-config', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const sandboxConfig = await deps.enterprisePublicDeveloperPlatformService.getSandboxConfig(auth.companyId);
      res.json({ data: { sandboxConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/sandbox-config', requireManage, async (req, res) => {
    const parsed = sandboxConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid sandbox config' } });
      return;
    }
    try {
      const sandboxConfig = await deps.enterprisePublicDeveloperPlatformService.updateSandboxConfig(staffScope(req), parsed.data);
      res.json({ data: { sandboxConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/developer-alerts/sync', requireWrite, async (req, res) => {
    try {
      const alerts = await deps.enterprisePublicDeveloperPlatformService.syncDeveloperAlerts(staffScope(req));
      res.json({ data: { developerAlerts: alerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/analytics/capture', requireWrite, async (req, res) => {
    try {
      const analytics = await deps.enterprisePublicDeveloperPlatformService.captureAnalytics(staffScope(req));
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/api-status/capture', requireWrite, async (req, res) => {
    try {
      const apiStatus = await deps.enterprisePublicDeveloperPlatformService.captureApiStatus(staffScope(req));
      res.json({ data: { apiStatus } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/aura-context', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const auraContext = await deps.enterprisePublicDeveloperPlatformService.buildAuraContext(auth.companyId);
      res.json({ data: { auraContext } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/api-versions', requireRead, async (_req, res) => {
    try {
      const apiVersions = await deps.enterprisePublicDeveloperPlatformService.listApiVersions();
      res.json({ data: { apiVersions } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/api-scopes', requireRead, async (_req, res) => {
    try {
      const apiScopes = await deps.enterprisePublicDeveloperPlatformService.listApiScopes();
      res.json({ data: { apiScopes } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/webhook-event-types', requireRead, async (_req, res) => {
    try {
      const webhookEventTypes = await deps.enterprisePublicDeveloperPlatformService.listWebhookEventTypes();
      res.json({ data: { webhookEventTypes } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/rate-limit-policies', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const rateLimitPolicies = await deps.enterprisePublicDeveloperPlatformService.listRateLimitPolicies(auth.companyId);
      res.json({ data: { rateLimitPolicies } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/rate-limit-policies', requireManage, async (req, res) => {
    const parsed = rateLimitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid rate limit policy' } });
      return;
    }
    try {
      const policy = await deps.enterprisePublicDeveloperPlatformService.createRateLimitPolicy(staffScope(req), parsed.data);
      res.status(201).json({ data: { policy } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/openapi/generate', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const openapiSpec = await deps.enterprisePublicDeveloperPlatformService.generateOpenApiSpec(auth.companyId);
      res.json({ data: { openapiSpec } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/sdk/generate', requireWrite, async (req, res) => {
    const parsed = sdkSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid SDK request' } });
      return;
    }
    try {
      const record = await deps.enterprisePublicDeveloperPlatformService.generateSdk(staffScope(req), parsed.data);
      res.status(201).json({ data: { record } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/sdk-generation-records', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const sdkGenerationRecords = await deps.enterprisePublicDeveloperPlatformService.listSdkGenerationRecords(auth.companyId);
      res.json({ data: { sdkGenerationRecords } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/webhook-subscriptions', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const webhookSubscriptions = await deps.enterprisePublicDeveloperPlatformService.listWebhookSubscriptions(auth.companyId);
      res.json({ data: { webhookSubscriptions } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/webhook-dead-letter', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const webhookDeadLetter = await deps.enterprisePublicDeveloperPlatformService.listWebhookDeadLetter(auth.companyId);
      res.json({ data: { webhookDeadLetter } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/webhook-deliveries', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const webhookDeliveries = await deps.enterprisePublicDeveloperPlatformService.listWebhookDeliveryHistory(auth.companyId);
      res.json({ data: { webhookDeliveries } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/api-keys', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const apiKeys = await deps.enterprisePublicDeveloperPlatformService.listDeveloperApiKeys(auth.companyId);
      res.json({ data: { apiKeys } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/developer-alerts', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const developerAlerts = await deps.enterprisePublicDeveloperPlatformService.listDeveloperAlerts(auth.companyId);
      res.json({ data: { developerAlerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/developer-alerts/:alertId/acknowledge', requireWrite, async (req, res) => {
    try {
      const developerAlert = await deps.enterprisePublicDeveloperPlatformService.acknowledgeDeveloperAlert(
        staffScope(req),
        getRouteParam(req.params.alertId),
      );
      res.json({ data: { developerAlert } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/action-drafts', requireWrite, async (req, res) => {
    const parsed = draftSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid action draft' } });
      return;
    }
    try {
      const actionDraft = await deps.enterprisePublicDeveloperPlatformService.createActionDraft(staffScope(req), parsed.data);
      res.status(201).json({ data: { actionDraft } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/oauth-applications', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const oauthApplications = await deps.enterprisePublicDeveloperPlatformService.listOauthApplications(auth.companyId);
      res.json({ data: { oauthApplications } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/audit-logs', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const auditLogs = await deps.enterprisePublicDeveloperPlatformService.listAuditLogs(auth.companyId);
      res.json({ data: { auditLogs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
