import { Router } from 'express';
import { z } from 'zod';
import type { QualityAssuranceService } from '../services/quality-assurance.service.js';
import { QualityAssuranceError } from '../services/quality-assurance.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const comebackTypeSchema = z.enum(['callback', 'revisit', 'warranty_visit', 'quality_inspection']);
const comebackStatusSchema = z.enum(['open', 'investigating', 'resolved', 'closed', 'cancelled']);
const rootCauseSchema = z.enum([
  'installation_error',
  'workmanship',
  'wrong_diagnosis',
  'incorrect_materials',
  'defective_materials',
  'manufacturer_defect',
  'customer_misuse',
  'unrelated_new_fault',
  'wear_and_tear',
  'warranty',
  'unknown',
]);
const actionTypeSchema = z.enum([
  'coaching',
  'retraining',
  'warning',
  'labour_recovery',
  'material_recovery',
  'payroll_recommendation',
]);

const createComebackSchema = z.object({
  comebackType: comebackTypeSchema,
  originalJobId: z.string().uuid(),
  comebackJobId: z.string().uuid().optional(),
  originalTechnicianId: z.string().uuid().optional(),
  currentTechnicianId: z.string().uuid().optional(),
  branchKey: z.string().optional(),
  reason: z.string().trim().min(1),
  resolution: z.string().optional(),
  occurredAt: z.string().optional(),
  labourHours: z.number().optional(),
  photoDocumentIds: z.array(z.string().uuid()).optional(),
  documentIds: z.array(z.string().uuid()).optional(),
});

const updateComebackSchema = z.object({
  status: comebackStatusSchema.optional(),
  resolution: z.string().optional(),
  currentTechnicianId: z.string().uuid().optional(),
  labourHours: z.number().optional(),
  photoDocumentIds: z.array(z.string().uuid()).optional(),
  documentIds: z.array(z.string().uuid()).optional(),
});

const rootCauseSchemaBody = z.object({
  classification: rootCauseSchema,
  notes: z.string().optional(),
  auraRecommendedCause: rootCauseSchema.optional(),
  auraConfidence: z.number().min(0).max(100).optional(),
});

const costEntrySchema = z.object({
  labourCostCents: z.number().int().nonnegative().optional(),
  materialCostCents: z.number().int().nonnegative().optional(),
  travelCostCents: z.number().int().nonnegative().optional(),
  warrantyCostCents: z.number().int().nonnegative().optional(),
  supplierRecoveryCents: z.number().int().nonnegative().optional(),
  currency: z.string().optional(),
  notes: z.string().optional(),
});

const warrantyClaimSchema = z.object({
  jobId: z.string().uuid(),
  comebackId: z.string().uuid().optional(),
  claimNumber: z.string().optional(),
  description: z.string().trim().min(1),
});

const supplierDefectSchema = z.object({
  supplierId: z.string().uuid().optional(),
  inventoryItemId: z.string().uuid().optional(),
  comebackId: z.string().uuid().optional(),
  defectDescription: z.string().trim().min(1),
  isRecurring: z.boolean().optional(),
  replacementCount: z.number().int().nonnegative().optional(),
});

const actionSchema = z.object({
  actionType: actionTypeSchema,
  technicianId: z.string().uuid().optional(),
  comebackId: z.string().uuid().optional(),
  subject: z.string().trim().min(1),
  recommendation: z.string().trim().min(1),
  payload: z.record(z.unknown()).optional(),
});

type QualityRouterDeps = {
  qualityAssuranceService: QualityAssuranceService;
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

export function createQualityRouter({
  qualityAssuranceService,
  teamService,
  jwtSecret,
  authService,
}: QualityRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission('quality:read', 'quality:write', 'executive:read');
  const requireWrite = requireAnyPermission('quality:write', 'executive:write');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const dashboard = await qualityAssuranceService.getExecutiveDashboard(companyId);
    res.json({ data: { dashboard } });
  });

  router.get('/comebacks', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const comebacks = await qualityAssuranceService.listComebacks(companyId);
    res.json({ data: { comebacks } });
  });

  router.get('/comebacks/:id', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const comeback = await qualityAssuranceService.getComeback(companyId, getRouteParam(req.params.id));
    if (!comeback) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Comeback not found' } });
      return;
    }
    res.json({ data: { comeback } });
  });

  router.post('/comebacks', requireWrite, async (req, res) => {
    const parsed = createComebackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid comeback payload' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const comeback = await qualityAssuranceService.createComeback(auth, parsed.data);
      res.status(201).json({ data: { comeback } });
    } catch (error) {
      handleQualityError(res, error);
    }
  });

  router.patch('/comebacks/:id', requireWrite, async (req, res) => {
    const parsed = updateComebackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid update payload' } });
      return;
    }
    try {
      const { companyId } = getAuth(req);
      const comeback = await qualityAssuranceService.updateComeback(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { comeback } });
    } catch (error) {
      handleQualityError(res, error);
    }
  });

  router.get('/comebacks/:id/root-cause', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const analysis = await qualityAssuranceService.getRootCauseAnalysis(
      companyId,
      getRouteParam(req.params.id),
    );
    res.json({ data: { analysis } });
  });

  router.post('/comebacks/:id/root-cause', requireWrite, async (req, res) => {
    const parsed = rootCauseSchemaBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid root cause payload' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const analysis = await qualityAssuranceService.setRootCauseAnalysis(
        auth,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.status(201).json({ data: { analysis } });
    } catch (error) {
      handleQualityError(res, error);
    }
  });

  router.post('/comebacks/:id/costs', requireWrite, async (req, res) => {
    const parsed = costEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid cost payload' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const cost = await qualityAssuranceService.createCostEntry(
        auth,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.status(201).json({ data: { cost } });
    } catch (error) {
      handleQualityError(res, error);
    }
  });

  router.get('/costs', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const costs = await qualityAssuranceService.listCostEntries(companyId);
    res.json({ data: { costs } });
  });

  router.get('/warranty', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const claims = await qualityAssuranceService.listWarrantyClaims(companyId);
    res.json({ data: { claims } });
  });

  router.post('/warranty', requireWrite, async (req, res) => {
    const parsed = warrantyClaimSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid warranty payload' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const claim = await qualityAssuranceService.createWarrantyClaim(auth, parsed.data);
      res.status(201).json({ data: { claim } });
    } catch (error) {
      handleQualityError(res, error);
    }
  });

  router.get('/technicians', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const intelligence = await qualityAssuranceService.getTechnicianIntelligence(companyId);
    res.json({ data: { intelligence } });
  });

  router.get('/suppliers', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const intelligence = await qualityAssuranceService.getSupplierIntelligence(companyId);
    res.json({ data: { intelligence } });
  });

  router.post('/suppliers/defects', requireWrite, async (req, res) => {
    const parsed = supplierDefectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid supplier defect payload' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const defect = await qualityAssuranceService.createSupplierDefect(auth, parsed.data);
      res.status(201).json({ data: { defect } });
    } catch (error) {
      handleQualityError(res, error);
    }
  });

  router.get('/actions', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const actions = await qualityAssuranceService.listActions(companyId);
    res.json({ data: { actions } });
  });

  router.post('/actions', requireWrite, async (req, res) => {
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid action payload' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const action = await qualityAssuranceService.createAction(auth, parsed.data);
      res.status(201).json({ data: { action } });
    } catch (error) {
      handleQualityError(res, error);
    }
  });

  router.get('/aura/context', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const context = await qualityAssuranceService.buildQualityAuraContext(companyId);
    res.json({ data: { context } });
  });

  return router;
}

function handleQualityError(res: import('express').Response, error: unknown) {
  if (error instanceof QualityAssuranceError) {
    const status =
      error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }

  throw error;
}
