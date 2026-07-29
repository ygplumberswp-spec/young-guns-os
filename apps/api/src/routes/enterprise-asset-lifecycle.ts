import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseAssetLifecycleService } from '../services/enterprise-asset-lifecycle.service.js';
import { EnterpriseAssetLifecycleError } from '../services/enterprise-asset-lifecycle.service.js';
import type { TeamService } from '../services/team.service.js';
import type { PortalAuthService } from '../services/portal-auth.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  createPortalAuthMiddleware,
  type PortalAuthenticatedRequest,
} from '../middleware/portal-auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const platformConfigSchema = z.object({
  globalPolicies: z.record(z.unknown()).optional(),
  iotAdapterTemplates: z.record(z.unknown()).optional(),
  telemetryStandards: z.record(z.unknown()).optional(),
  retentionPolicies: z.record(z.unknown()).optional(),
  defaultAlertPolicies: z.record(z.unknown()).optional(),
});

const categorySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  config: z.record(z.unknown()).optional(),
});

const registryProfileSchema = z.object({
  assetId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  customCategoryName: z.string().trim().max(200).optional(),
  ownershipType: z.enum(['customer_owned', 'company_owned']).optional(),
  customerId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
  manufacturer: z.string().trim().max(200).optional(),
  model: z.string().trim().max(200).optional(),
  installationDate: z.string().optional(),
  commissioningDate: z.string().optional(),
  warrantyDetails: z.record(z.unknown()).optional(),
  criticality: z.string().trim().max(50).optional(),
  lifecycleStage: z
    .enum([
      'procurement',
      'delivery',
      'installation',
      'commissioning',
      'active_operation',
      'inspection',
      'maintenance',
      'repair',
      'upgrade',
      'transfer',
      'decommissioning',
      'disposal',
    ])
    .optional(),
});

const iotProviderSchema = z.object({
  providerType: z.enum([
    'mqtt',
    'http_rest',
    'webhook',
    'modbus',
    'lorawan',
    'azure_iot',
    'aws_iot',
    'thingsboard',
    'particle',
    'siemens',
    'schneider',
    'bosch',
    'custom',
  ]),
  providerKey: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  endpointUrl: z.string().url().optional(),
  credentialsVaultKey: z.string().trim().max(200).optional(),
  isPrimary: z.boolean().optional(),
  pollingIntervalSeconds: z.number().int().min(1).optional(),
  config: z.record(z.unknown()).optional(),
});

const iotDeviceSchema = z.object({
  providerAdapterId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  externalDeviceId: z.string().trim().min(1).max(200),
  deviceName: z.string().trim().min(1).max(200),
  telemetryFieldMap: z.record(z.unknown()).optional(),
  thresholdConfig: z.record(z.unknown()).optional(),
});

const telemetrySchema = z.object({
  deviceId: z.string().uuid(),
  field: z.enum([
    'temperature',
    'pressure',
    'flow',
    'voltage',
    'current',
    'power',
    'energy_usage',
    'vibration',
    'humidity',
    'water_level',
    'fuel_level',
    'runtime',
    'starts_stops',
    'fault_code',
    'battery_level',
    'signal_strength',
    'gps_position',
    'device_health',
    'custom',
  ]),
  normalizedValue: z.number(),
  unit: z.string().trim().max(50).optional(),
  quality: z.enum(['good', 'uncertain', 'bad', 'unknown']).optional(),
  customFieldName: z.string().trim().max(100).optional(),
  rawPayloadRef: z.string().trim().max(500).optional(),
  recordedAt: z.string().datetime().optional(),
});

const lifecycleStageSchema = z.object({
  assetId: z.string().uuid(),
  stage: z.enum([
    'procurement',
    'delivery',
    'installation',
    'commissioning',
    'active_operation',
    'inspection',
    'maintenance',
    'repair',
    'upgrade',
    'transfer',
    'decommissioning',
    'disposal',
  ]),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
  requiresApproval: z.boolean().optional(),
  costCents: z.number().int().min(0).optional(),
});

const workOrderDraftSchema = z.object({
  assetId: z.string().uuid().optional(),
  alertId: z.string().uuid().optional(),
  draftType: z.enum([
    'inspection_request',
    'maintenance_job',
    'emergency_job',
    'technician_assignment',
    'parts_requirement',
    'quotation_draft',
    'customer_notification',
  ]),
  subject: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
  payload: z.record(z.unknown()).optional(),
});

type RouterDeps = {
  enterpriseAssetLifecycleService: EnterpriseAssetLifecycleService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
  portalAuthService: PortalAuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function getPortalAuth(req: import('express').Request) {
  return (req as PortalAuthenticatedRequest).portalAuth;
}

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0]! : value;
}

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof EnterpriseAssetLifecycleError) {
    const status =
      error.code === 'NOT_FOUND' ? 404 : error.code === 'VALIDATION_ERROR' ? 400 : 500;
    res.status(status).json({ error: error.code, message: error.message });
    return;
  }
  throw error;
}

export function createEnterpriseAssetLifecycleRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireStaffAuth = createAuthMiddleware({ jwtSecret: deps.jwtSecret, authService: deps.authService });
  const requirePortalAuth = createPortalAuthMiddleware({
    jwtSecret: deps.jwtSecret,
    portalAuthService: deps.portalAuthService,
  });
  const requireRead = requireAnyPermission(
    'asset_equipment:read',
    'asset_lifecycle:read',
    'asset_lifecycle:manage',
    'fleet:read',
  );
  const requireWrite = requireAnyPermission(
    'asset_equipment:write',
    'asset_lifecycle:write',
    'asset_lifecycle:manage',
  );
  const requireManage = requireAnyPermission('asset_lifecycle:manage', 'platform:manage');

  router.get('/dashboard', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const dashboard = await deps.enterpriseAssetLifecycleService.getDashboard(auth.companyId);
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/iot/monitoring', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const monitoring = await deps.enterpriseAssetLifecycleService.getIotMonitoring(auth.companyId);
      res.json({ data: { monitoring } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/platform-config', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const platformConfig = await deps.enterpriseAssetLifecycleService.getPlatformConfig(auth.companyId);
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/platform-config', requireStaffAuth, requireManage, async (req, res) => {
    const parsed = platformConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid platform config' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const platformConfig = await deps.enterpriseAssetLifecycleService.updatePlatformConfig(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/categories', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const categories = await deps.enterpriseAssetLifecycleService.listCategories(auth.companyId);
      res.json({ data: { categories } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/categories', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = categorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid category payload' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const category = await deps.enterpriseAssetLifecycleService.createCategory(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { category } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/registry-profiles', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = registryProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid registry profile' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const profile = await deps.enterpriseAssetLifecycleService.createRegistryProfile(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { profile } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/iot/providers', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = iotProviderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid IoT provider' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const provider = await deps.enterpriseAssetLifecycleService.createIotProvider(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { provider } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/iot/providers/:providerId/test', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const provider = await deps.enterpriseAssetLifecycleService.testIotProvider(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.providerId),
      );
      res.json({ data: { provider } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/iot/devices', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = iotDeviceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid IoT device' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const device = await deps.enterpriseAssetLifecycleService.createIotDevice(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { device } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/iot/devices/:deviceId/map-asset', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = z.object({ assetId: z.string().uuid() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'assetId required' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const device = await deps.enterpriseAssetLifecycleService.mapDeviceToAsset(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.deviceId),
        parsed.data.assetId,
      );
      res.json({ data: { device } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/telemetry/ingest', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = telemetrySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid telemetry payload' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const reading = await deps.enterpriseAssetLifecycleService.ingestTelemetry(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { reading } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/lifecycle/stages', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = lifecycleStageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid lifecycle stage' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const stage = await deps.enterpriseAssetLifecycleService.createLifecycleStage(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { stage } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/lifecycle/stages/:historyId/approve', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const stage = await deps.enterpriseAssetLifecycleService.approveLifecycleStage(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.historyId),
      );
      res.json({ data: { stage } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/lifecycle/stages/:historyId/execute', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const stage = await deps.enterpriseAssetLifecycleService.executeLifecycleStage(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.historyId),
      );
      res.json({ data: { stage } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/alerts/:alertId/acknowledge', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const alert = await deps.enterpriseAssetLifecycleService.acknowledgeAlert(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.alertId),
      );
      res.json({ data: { alert } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/alerts/:alertId/resolve', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = z.object({ resolutionNotes: z.string().trim().max(4000).optional() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid resolution payload' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const alert = await deps.enterpriseAssetLifecycleService.resolveAlert(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.alertId),
        parsed.data.resolutionNotes,
      );
      res.json({ data: { alert } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/maintenance/generate-due', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const dueRecords = await deps.enterpriseAssetLifecycleService.generateMaintenanceDue({
        companyId: auth.companyId,
        userId: auth.userId,
      });
      res.json({ data: { dueRecords } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/predictive/:assetId', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const assessment = await deps.enterpriseAssetLifecycleService.generatePredictiveAssessment(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.assetId),
      );
      res.status(201).json({ data: { assessment } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/work-order-drafts', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = workOrderDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid work order draft' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const draft = await deps.enterpriseAssetLifecycleService.createWorkOrderDraft(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { draft } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/work-order-drafts/:draftId/approve', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const draft = await deps.enterpriseAssetLifecycleService.approveWorkOrderDraft(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.draftId),
      );
      res.json({ data: { draft } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/analytics/capture', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const analytics = await deps.enterpriseAssetLifecycleService.captureAnalytics({
        companyId: auth.companyId,
        userId: auth.userId,
      });
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/digital-twin/assets/:assetId/state', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const state = await deps.enterpriseAssetLifecycleService.buildDigitalTwinAssetState(
        auth.companyId,
        getRouteParam(req.params.assetId),
      );
      if (!state) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Asset not found' } });
        return;
      }
      res.json({ data: { state } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/aura-context', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const context = await deps.enterpriseAssetLifecycleService.buildAuraContext(auth.companyId);
      res.json({ data: { context } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/portal/assets', requirePortalAuth, async (req, res) => {
    try {
      const auth = getPortalAuth(req);
      const assets = await deps.enterpriseAssetLifecycleService.listCustomerAssets(
        auth.companyId,
        auth.customerId,
      );
      res.json({ data: { assets } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/portal/assets/:assetId', requirePortalAuth, async (req, res) => {
    try {
      const auth = getPortalAuth(req);
      const asset = await deps.enterpriseAssetLifecycleService.getCustomerAssetDetail(
        auth.companyId,
        auth.customerId,
        getRouteParam(req.params.assetId),
      );
      if (!asset) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Asset not found' } });
        return;
      }
      res.json({ data: { asset } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
