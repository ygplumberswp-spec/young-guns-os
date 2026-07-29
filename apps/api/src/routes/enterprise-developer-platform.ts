import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseDeveloperPlatformService } from '../services/enterprise-developer-platform.service.js';
import { EnterpriseDeveloperPlatformError } from '../services/enterprise-developer-platform.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { DEVELOPER_SDK_LANGUAGES } from '@titan/shared';

const extensionTypeSchema = z.enum([
  'frontend',
  'backend',
  'ai_agent',
  'workflow',
  'dashboard_widget',
  'report',
  'integration',
  'automation',
]);

const extensionSchema = z.object({
  extensionKey: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  extensionType: extensionTypeSchema,
  permissions: z.array(z.string()).optional(),
  manifest: z.record(z.unknown()).optional(),
});

const webhookSchema = z.object({
  name: z.string().trim().min(1).max(200),
  targetUrl: z.string().url(),
  eventTypes: z.array(z.string().trim().min(1)).min(1),
  maxRetries: z.number().int().min(1).max(10).optional(),
});

const oauthSchema = z.object({
  name: z.string().trim().min(1).max(200),
  redirectUris: z.array(z.string().url()).min(1),
  scopes: z.array(z.string()).optional(),
});

const tokenSchema = z.object({
  name: z.string().trim().min(1).max(200),
  scopes: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

const serviceAccountSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional().nullable(),
  scopes: z.array(z.string()).optional(),
});

const sdkSchema = z.object({
  language: z.enum(DEVELOPER_SDK_LANGUAGES),
});

const actionSchema = z.object({
  actionType: z.enum([
    'extension_install',
    'extension_publish',
    'webhook_subscription',
    'oauth_app_create',
    'sdk_generate',
    'integration_guide',
  ]),
  subject: z.string().trim().min(1).max(500),
  recommendation: z.string().trim().min(1).max(5000),
  extensionId: z.string().uuid().optional().nullable(),
  payload: z.record(z.unknown()).optional(),
});

type RouterDeps = {
  enterpriseDeveloperPlatformService: EnterpriseDeveloperPlatformService;
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

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof EnterpriseDeveloperPlatformError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'VALIDATION_ERROR' ? 400 : 500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createEnterpriseDeveloperPlatformRouter({
  enterpriseDeveloperPlatformService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission('integrations:read', 'integrations:manage', 'agents:read');
  const requireWrite = requireAnyPermission('integrations:manage');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const dashboard = await enterpriseDeveloperPlatformService.getDeveloperDashboard(getAuth(req).companyId);
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/explorer', requireRead, async (req, res) => {
    try {
      const dashboard = await enterpriseDeveloperPlatformService.getDeveloperDashboard(getAuth(req).companyId);
      res.json({ data: { endpoints: dashboard.apiExplorerEndpoints } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/openapi/generate', requireWrite, async (req, res) => {
    try {
      const spec = await enterpriseDeveloperPlatformService.generateOpenApiSpec(getAuth(req).companyId);
      res.status(201).json({ data: { spec } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/sdk/generate', requireWrite, async (req, res) => {
    try {
      const body = sdkSchema.parse(req.body);
      const sdk = await enterpriseDeveloperPlatformService.generateSdkPackage(getAuth(req).companyId, body);
      res.status(201).json({ data: { sdk } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/sdk', requireRead, async (req, res) => {
    try {
      const packages = await enterpriseDeveloperPlatformService.listSdkPackages(getAuth(req).companyId);
      res.json({ data: { packages } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/changelog', requireRead, async (req, res) => {
    try {
      const changelog = await enterpriseDeveloperPlatformService.listChangelog(getAuth(req).companyId);
      res.json({ data: { changelog } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/extensions', requireRead, async (req, res) => {
    try {
      const extensions = await enterpriseDeveloperPlatformService.listExtensions(getAuth(req).companyId);
      res.json({ data: { extensions } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/extensions', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = extensionSchema.parse(req.body);
      const extension = await enterpriseDeveloperPlatformService.createExtension(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.status(201).json({ data: { extension } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/extensions/:extensionId/install', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const extension = await enterpriseDeveloperPlatformService.installExtension(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.extensionId),
      );
      res.json({ data: { extension } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/marketplace', requireRead, async (req, res) => {
    try {
      const listings = await enterpriseDeveloperPlatformService.listMarketplaceListings(getAuth(req).companyId);
      res.json({ data: { listings } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/webhooks/subscriptions', requireRead, async (req, res) => {
    try {
      const subscriptions = await enterpriseDeveloperPlatformService.listWebhookSubscriptions(getAuth(req).companyId);
      res.json({ data: { subscriptions } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/webhooks/subscriptions', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = webhookSchema.parse(req.body);
      const subscription = await enterpriseDeveloperPlatformService.createWebhookSubscription(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.status(201).json({ data: { subscription } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/webhooks/dead-letter', requireRead, async (req, res) => {
    try {
      const deadLetter = await enterpriseDeveloperPlatformService.listWebhookDeadLetter(getAuth(req).companyId);
      res.json({ data: { deadLetter } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/webhooks/deliveries/:deliveryId/replay', requireWrite, async (req, res) => {
    try {
      const delivery = await enterpriseDeveloperPlatformService.replayWebhookDelivery(
        getAuth(req).companyId,
        getRouteParam(req.params.deliveryId),
      );
      res.json({ data: { delivery } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/oauth/apps', requireRead, async (req, res) => {
    try {
      const apps = await enterpriseDeveloperPlatformService.listOauthApplications(getAuth(req).companyId);
      res.json({ data: { apps } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/oauth/apps', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = oauthSchema.parse(req.body);
      const app = await enterpriseDeveloperPlatformService.createOauthApplication(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.status(201).json({ data: { app } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/tokens/personal', requireRead, async (req, res) => {
    try {
      const tokens = await enterpriseDeveloperPlatformService.listPersonalAccessTokens(getAuth(req).companyId);
      res.json({ data: { tokens } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/tokens/personal', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = tokenSchema.parse(req.body);
      const token = await enterpriseDeveloperPlatformService.createPersonalAccessToken(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.status(201).json({ data: { token } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/tokens/personal/:tokenId/revoke', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const token = await enterpriseDeveloperPlatformService.revokePersonalAccessToken(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.tokenId),
      );
      res.json({ data: { token } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/service-accounts', requireRead, async (req, res) => {
    try {
      const accounts = await enterpriseDeveloperPlatformService.listServiceAccounts(getAuth(req).companyId);
      res.json({ data: { accounts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/service-accounts', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = serviceAccountSchema.parse(req.body);
      const account = await enterpriseDeveloperPlatformService.createServiceAccount(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.status(201).json({ data: { account } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/analytics', requireRead, async (req, res) => {
    try {
      const analytics = await enterpriseDeveloperPlatformService.getAnalytics(getAuth(req).companyId);
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/analytics/capture', requireWrite, async (req, res) => {
    try {
      const snapshot = await enterpriseDeveloperPlatformService.captureAnalyticsSnapshot(getAuth(req).companyId);
      res.status(201).json({ data: { snapshot: { id: snapshot.id } } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/actions', requireRead, async (req, res) => {
    try {
      const actions = await enterpriseDeveloperPlatformService.listPlatformActions(getAuth(req).companyId);
      res.json({ data: { actions } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/actions', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = actionSchema.parse(req.body);
      const action = await enterpriseDeveloperPlatformService.createPlatformAction(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.status(201).json({ data: { action } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
