import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseMobilePlatformService } from '../services/enterprise-mobile-platform.service.js';
import { EnterpriseMobilePlatformError } from '../services/enterprise-mobile-platform.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const registerDeviceSchema = z.object({
  deviceKey: z.string().trim().min(1).max(200),
  deviceName: z.string().trim().max(200).optional(),
  platform: z.enum(['ios', 'android', 'web', 'pwa', 'tablet']).optional(),
  appVersion: z.string().trim().max(50).optional(),
  osVersion: z.string().trim().max(50).optional(),
  encryptionVerified: z.boolean().optional(),
});

const pushTokenSchema = z.object({
  deviceId: z.string().uuid(),
  token: z.string().trim().min(1).max(500),
  provider: z.string().trim().max(50).optional(),
});

const mediaAssetSchema = z.object({
  jobId: z.string().uuid().optional(),
  mediaType: z.enum([
    'photo',
    'video',
    'document',
    'barcode',
    'qr_code',
    'signature',
    'voice_note',
  ]),
  title: z.string().trim().min(1).max(500),
  fileName: z.string().trim().max(500).optional(),
  mimeType: z.string().trim().max(100).optional(),
  sizeBytes: z.number().int().min(0).optional(),
  storageKey: z.string().trim().max(500).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  capturedAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const fleetProviderSchema = z.object({
  providerType: z.enum([
    'cartrack',
    'netstar',
    'ctrack',
    'tracker',
    'mix_telematics',
    'geotab',
    'samsara',
    'verizon_connect',
    'wialon',
    'traccar',
    'generic_rest',
    'generic_mqtt',
  ]),
  name: z.string().trim().min(1).max(200),
  endpointUrl: z.string().url().optional(),
  credentialsVaultKey: z.string().trim().max(200).optional(),
  vehicleMapping: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

const platformConfigSchema = z.object({
  offlineRetentionDays: z.number().int().min(1).optional(),
  syncFrequencyMinutes: z.number().int().min(1).optional(),
  pushNotificationsEnabled: z.boolean().optional(),
  biometricLoginRequired: z.boolean().optional(),
  pwaEnabled: z.boolean().optional(),
  backgroundSyncEnabled: z.boolean().optional(),
  notificationPolicies: z.record(z.unknown()).optional(),
  mobilePolicies: z.record(z.unknown()).optional(),
});

type RouterDeps = {
  enterpriseMobilePlatformService: EnterpriseMobilePlatformService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0]! : value;
}

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof EnterpriseMobilePlatformError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'VALIDATION_ERROR' ? 400 : 500;
    res.status(status).json({ error: error.code, message: error.message });
    return;
  }
  throw error;
}

export function createEnterpriseMobilePlatformRouter(deps: RouterDeps): Router {
  const router = Router();
  const auth = createAuthMiddleware({ jwtSecret: deps.jwtSecret, authService: deps.authService });

  router.get(
    '/dashboard',
    auth,
    requireAnyPermission('mobile:read', 'mobile:manage', 'platform:read'),
    async (req, res, next) => {
      try {
        const authContext = getAuth(req);
        const dashboard = await deps.enterpriseMobilePlatformService.getDashboard(
          authContext.companyId,
        );
        res.json({ dashboard });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    '/dispatcher',
    auth,
    requireAnyPermission('mobile:read', 'dispatch:read', 'mobile:manage'),
    async (req, res, next) => {
      try {
        const authContext = getAuth(req);
        const workspace = await deps.enterpriseMobilePlatformService.getDispatcherWorkspace(
          authContext.companyId,
        );
        res.json({ workspace });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    '/aura-context',
    auth,
    requireAnyPermission('mobile:read', 'mobile:write'),
    async (req, res, next) => {
      try {
        const authContext = getAuth(req);
        const context = await deps.enterpriseMobilePlatformService.buildAuraContext({
          companyId: authContext.companyId,
          userId: authContext.userId,
        });
        res.json({ context });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/devices/register',
    auth,
    requireAnyPermission('mobile:read', 'mobile:write'),
    async (req, res) => {
      try {
        const authContext = getAuth(req);
        const body = registerDeviceSchema.parse(req.body);
        const device = await deps.enterpriseMobilePlatformService.registerDevice(
          { companyId: authContext.companyId, userId: authContext.userId },
          body,
        );
        res.status(201).json({ device });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: 'VALIDATION_ERROR', message: error.message });
          return;
        }
        handleError(error, res);
      }
    },
  );

  router.post(
    '/devices/:deviceId/revoke',
    auth,
    requireAnyPermission('mobile:manage', 'platform:manage'),
    async (req, res) => {
      try {
        const authContext = getAuth(req);
        const device = await deps.enterpriseMobilePlatformService.revokeDevice(
          { companyId: authContext.companyId, userId: authContext.userId },
          getRouteParam(req.params.deviceId),
        );
        res.json({ device });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/push-tokens',
    auth,
    requireAnyPermission('mobile:read', 'mobile:write'),
    async (req, res) => {
      try {
        const authContext = getAuth(req);
        const body = pushTokenSchema.parse(req.body);
        const result = await deps.enterpriseMobilePlatformService.registerPushToken(
          { companyId: authContext.companyId, userId: authContext.userId },
          body,
        );
        res.status(201).json(result);
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: 'VALIDATION_ERROR', message: error.message });
          return;
        }
        handleError(error, res);
      }
    },
  );

  router.post(
    '/media',
    auth,
    requireAnyPermission('mobile:read', 'mobile:write'),
    async (req, res) => {
      try {
        const authContext = getAuth(req);
        const body = mediaAssetSchema.parse(req.body);
        const asset = await deps.enterpriseMobilePlatformService.createMediaAsset(
          { companyId: authContext.companyId, userId: authContext.userId },
          body,
        );
        res.status(201).json({ asset });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: 'VALIDATION_ERROR', message: error.message });
          return;
        }
        handleError(error, res);
      }
    },
  );

  router.post(
    '/sync/process',
    auth,
    requireAnyPermission('mobile:read', 'mobile:write'),
    async (req, res, next) => {
      try {
        const authContext = getAuth(req);
        const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId : undefined;
        const result = await deps.enterpriseMobilePlatformService.processSyncWithHistory(
          { companyId: authContext.companyId, userId: authContext.userId },
          deviceId,
        );
        res.json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/field-intelligence/capture',
    auth,
    requireAnyPermission('mobile:manage', 'analytics:read'),
    async (req, res, next) => {
      try {
        const authContext = getAuth(req);
        const snapshot = await deps.enterpriseMobilePlatformService.captureFieldIntelligence(
          authContext.companyId,
        );
        res.json({ snapshot });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/fleet-providers',
    auth,
    requireAnyPermission('mobile:manage', 'fleet:write'),
    async (req, res) => {
      try {
        const authContext = getAuth(req);
        const body = fleetProviderSchema.parse(req.body);
        const provider = await deps.enterpriseMobilePlatformService.createFleetProvider(
          { companyId: authContext.companyId, userId: authContext.userId },
          body,
        );
        res.status(201).json({ provider });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: 'VALIDATION_ERROR', message: error.message });
          return;
        }
        handleError(error, res);
      }
    },
  );

  router.post(
    '/fleet-providers/:providerId/test',
    auth,
    requireAnyPermission('mobile:manage', 'fleet:write'),
    async (req, res) => {
      try {
        const authContext = getAuth(req);
        const provider = await deps.enterpriseMobilePlatformService.testFleetProvider(
          { companyId: authContext.companyId, userId: authContext.userId },
          getRouteParam(req.params.providerId),
        );
        res.json({ provider });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.patch(
    '/config',
    auth,
    requireAnyPermission('mobile:manage', 'platform:manage'),
    async (req, res) => {
      try {
        const authContext = getAuth(req);
        const body = platformConfigSchema.parse(req.body);
        const config = await deps.enterpriseMobilePlatformService.updatePlatformConfig(
          { companyId: authContext.companyId, userId: authContext.userId },
          body,
        );
        res.json({ config });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: 'VALIDATION_ERROR', message: error.message });
          return;
        }
        handleError(error, res);
      }
    },
  );

  return router;
}
