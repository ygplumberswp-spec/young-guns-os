import { Router } from 'express';
import { z } from 'zod';
import type { AssetEquipmentIntelligenceService } from '../services/asset-equipment-intelligence.service.js';
import { AssetEquipmentIntelligenceError } from '../services/asset-equipment-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const assetTypeSchema = z.enum([
  'vehicle',
  'machinery',
  'tool',
  'equipment',
  'office_asset',
  'it_equipment',
  'rented_asset',
]);
const assetStatusSchema = z.enum([
  'active',
  'inactive',
  'maintenance',
  'retired',
  'disposed',
  'out_of_service',
]);
const assetConditionSchema = z.enum(['excellent', 'good', 'fair', 'poor', 'critical']);
const scheduleTypeSchema = z.enum([
  'recurring',
  'usage_based',
  'inspection_reminder',
  'warranty_reminder',
  'service_interval',
]);
const maintenanceTypeSchema = z.enum(['planned', 'emergency', 'corrective', 'preventative']);
const inspectionTypeSchema = z.enum(['safety', 'vehicle', 'equipment', 'toolbox', 'compliance']);
const calibrationStatusSchema = z.enum(['valid', 'expiring', 'expired', 'not_required']);
const costTypeSchema = z.enum([
  'maintenance',
  'repair',
  'downtime',
  'replacement',
  'warranty_recovery',
]);
const actionTypeSchema = z.enum(['maintenance_action', 'replacement_recommendation']);

const createAssetSchema = z.object({
  assetType: assetTypeSchema,
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  serialNumber: z.string().trim().max(200).optional(),
  barcodeReference: z.string().trim().max(200).optional(),
  vehicleId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  purchaseDate: z.string().optional(),
  warrantyExpiresAt: z.string().optional(),
  depreciationReference: z.string().trim().max(200).optional(),
  assignedTechnicianId: z.string().uuid().optional(),
  branchKey: z.string().trim().max(100).optional(),
  status: assetStatusSchema.optional(),
  condition: assetConditionSchema.optional(),
  locationText: z.string().trim().max(500).optional(),
});

const updateAssetSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  status: assetStatusSchema.optional(),
  condition: assetConditionSchema.optional(),
  assignedTechnicianId: z.string().uuid().optional(),
  branchKey: z.string().trim().max(100).optional(),
  locationText: z.string().trim().max(500).optional(),
});

const scheduleSchema = z.object({
  assetId: z.string().uuid(),
  scheduleType: scheduleTypeSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  intervalDays: z.number().int().min(1).optional(),
  intervalUsageHours: z.number().int().min(1).optional(),
  nextDueAt: z.string().optional(),
});

const maintenanceRecordSchema = z.object({
  assetId: z.string().uuid(),
  maintenanceType: maintenanceTypeSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  scheduledAt: z.string().optional(),
  assignedTechnicianId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  labourCostCents: z.number().int().min(0).optional(),
  partsCostCents: z.number().int().min(0).optional(),
  downtimeHours: z.number().min(0).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const inspectionSchema = z.object({
  assetId: z.string().uuid(),
  inspectionType: inspectionTypeSchema,
  checklist: z.array(z.object({ item: z.string(), passed: z.boolean().nullable() })).optional(),
  findings: z.string().trim().max(5000).optional(),
  inspectorUserId: z.string().uuid().optional(),
});

const calibrationSchema = z.object({
  assetId: z.string().uuid(),
  certificationName: z.string().trim().min(1).max(200),
  calibratedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  complianceStatus: calibrationStatusSchema.optional(),
  renewalRecommendation: z.string().trim().max(2000).optional(),
});

const costSchema = z.object({
  assetId: z.string().uuid(),
  maintenanceRecordId: z.string().uuid().optional(),
  costType: costTypeSchema,
  amountCents: z.number().int().min(0).optional(),
  currency: z.string().trim().max(10).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const actionSchema = z.object({
  actionType: actionTypeSchema,
  assetId: z.string().uuid().optional(),
  subject: z.string().trim().min(1).max(500),
  recommendation: z.string().trim().min(1).max(5000),
  payload: z.record(z.unknown()).optional(),
});

type AssetEquipmentRouterDeps = {
  assetEquipmentIntelligenceService: AssetEquipmentIntelligenceService;
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

export function createAssetEquipmentRouter({
  assetEquipmentIntelligenceService,
  teamService,
  jwtSecret,
  authService,
}: AssetEquipmentRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'asset_equipment:read',
    'asset_equipment:write',
    'fleet:read',
  );
  const requireWrite = requireAnyPermission('asset_equipment:write', 'fleet:write');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const dashboard = await assetEquipmentIntelligenceService.getExecutiveDashboard(companyId);
    res.json({ data: { dashboard } });
  });

  router.get('/analytics', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const analytics = await assetEquipmentIntelligenceService.getPerformanceAnalytics(companyId);
    res.json({ data: { analytics } });
  });

  router.get('/assets', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const assets = await assetEquipmentIntelligenceService.listAssets(companyId);
    res.json({ data: { assets } });
  });

  router.get('/assets/:id', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const asset = await assetEquipmentIntelligenceService.getAsset(
      companyId,
      getRouteParam(req.params.id),
    );
    if (!asset) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Asset not found' } });
      return;
    }
    res.json({ data: { asset } });
  });

  router.post('/assets', requireWrite, async (req, res) => {
    const parsed = createAssetSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid asset payload' } });
      return;
    }
    try {
      const asset = await assetEquipmentIntelligenceService.createAsset(getAuth(req), parsed.data);
      res.status(201).json({ data: { asset } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.patch('/assets/:id', requireWrite, async (req, res) => {
    const parsed = updateAssetSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid update payload' } });
      return;
    }
    try {
      const asset = await assetEquipmentIntelligenceService.updateAsset(
        getAuth(req).companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { asset } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/history', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const assetId = typeof req.query.assetId === 'string' ? req.query.assetId : undefined;
    const history = await assetEquipmentIntelligenceService.listLifecycleHistory(
      companyId,
      assetId,
    );
    res.json({ data: { history } });
  });

  router.get('/schedules', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const schedules = await assetEquipmentIntelligenceService.listMaintenanceSchedules(companyId);
    res.json({ data: { schedules } });
  });

  router.post('/schedules', requireWrite, async (req, res) => {
    const parsed = scheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid schedule payload' } });
      return;
    }
    try {
      const schedule = await assetEquipmentIntelligenceService.createMaintenanceSchedule(
        getAuth(req),
        parsed.data,
      );
      res.status(201).json({ data: { schedule } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/maintenance', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const records = await assetEquipmentIntelligenceService.listMaintenanceRecords(companyId);
    res.json({ data: { records } });
  });

  router.post('/maintenance', requireWrite, async (req, res) => {
    const parsed = maintenanceRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid maintenance payload' } });
      return;
    }
    try {
      const record = await assetEquipmentIntelligenceService.createMaintenanceRecord(
        getAuth(req),
        parsed.data,
      );
      res.status(201).json({ data: { record } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/inspections', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const inspections = await assetEquipmentIntelligenceService.listInspections(companyId);
    res.json({ data: { inspections } });
  });

  router.post('/inspections', requireWrite, async (req, res) => {
    const parsed = inspectionSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid inspection payload' } });
      return;
    }
    try {
      const inspection = await assetEquipmentIntelligenceService.createInspection(
        getAuth(req),
        parsed.data,
      );
      res.status(201).json({ data: { inspection } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/calibrations', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const calibrations = await assetEquipmentIntelligenceService.listCalibrations(companyId);
    res.json({ data: { calibrations } });
  });

  router.post('/calibrations', requireWrite, async (req, res) => {
    const parsed = calibrationSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid calibration payload' } });
      return;
    }
    try {
      const calibration = await assetEquipmentIntelligenceService.createCalibration(
        getAuth(req),
        parsed.data,
      );
      res.status(201).json({ data: { calibration } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/costs', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const costs = await assetEquipmentIntelligenceService.listMaintenanceCosts(companyId);
    res.json({ data: { costs } });
  });

  router.post('/costs', requireWrite, async (req, res) => {
    const parsed = costSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid cost payload' } });
      return;
    }
    try {
      const cost = await assetEquipmentIntelligenceService.createMaintenanceCost(
        getAuth(req),
        parsed.data,
      );
      res.status(201).json({ data: { cost } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/actions', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const actions = await assetEquipmentIntelligenceService.listActions(companyId, status);
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
      const action = await assetEquipmentIntelligenceService.createAction(
        getAuth(req),
        parsed.data,
      );
      res.status(201).json({ data: { action } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/aura/context', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const context = await assetEquipmentIntelligenceService.buildAssetAuraContext(companyId);
    res.json({ data: { context } });
  });

  return router;
}

function handleError(res: import('express').Response, error: unknown) {
  if (error instanceof AssetEquipmentIntelligenceError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }

  throw error;
}
