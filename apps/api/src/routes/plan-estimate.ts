import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '@titan/db';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import {
  PlanEstimateService,
  PlanEstimateServiceError,
} from '../services/plan-estimate.service.js';
import type { TeamService } from '../services/team.service.js';

const itemSchema = z.object({
  pointType: z.enum(['WATER', 'WASTE', 'GEYSER', 'OTHER']),
  subtypeLabel: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().min(1).max(500),
  quantity: z.number().min(0),
  unit: z.string().trim().max(40).optional(),
  quantityOrigin: z.enum([
    'MANUAL_COUNT',
    'PLAN_ANNOTATION',
    'EXPLICIT_PLAN_LABEL',
    'MEASURED',
    'IMPORTED_STRUCTURED_SOURCE',
  ]),
  pageReference: z.string().trim().max(80).nullable().optional(),
  planAnnotationRef: z.string().trim().max(120).nullable().optional(),
  confidence: z.enum(['CONFIRMED', 'REVIEW_REQUIRED', 'INSUFFICIENT_INFORMATION']),
  customerVisibleScopeText: z.string().trim().max(500).nullable().optional(),
});

const costSchema = z.object({
  estimateItemIndex: z.number().int().min(0).nullable().optional(),
  componentType: z.enum(['MATERIAL', 'LABOUR', 'SITE', 'OTHER']),
  description: z.string().trim().min(1).max(500),
  quantity: z.number().min(0),
  unit: z.string().trim().max(40).optional(),
  unitCostCents: z.number().int().min(0).nullable().optional(),
  costProvenance: z.enum([
    'SUPPLIER_QUOTE',
    'CATALOGUE_COST',
    'APPROVED_MANUAL_COST',
    'HISTORICAL_VERIFIED',
    'MISSING',
  ]),
  catalogueItemId: z.string().uuid().nullable().optional(),
});

const createSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  propertyId: z.string().uuid().nullable().optional(),
  jobId: z.string().uuid().nullable().optional(),
  sourceDocumentId: z.string().uuid().nullable().optional(),
  sourceFilename: z.string().trim().max(260).nullable().optional(),
  sourceFileHash: z.string().trim().max(128).nullable().optional(),
  sourceRevisionLabel: z.string().trim().max(80).nullable().optional(),
  scaleStatus: z
    .enum(['SCALE_VERIFIED', 'SCALE_NOT_PROVIDED', 'MEASUREMENT_REVIEW_REQUIRED'])
    .optional(),
  scaleProvenance: z.string().trim().max(260).nullable().optional(),
  proposedSellExVatCents: z.number().int().min(0).nullable().optional(),
  sellSource: z.string().trim().max(40).optional(),
  clientActionId: z.string().trim().min(1).max(120).nullable().optional(),
  items: z.array(itemSchema).min(1),
  costComponents: z.array(costSchema).optional(),
});

type Deps = {
  planEstimateService: PlanEstimateService;
  teamService: TeamService;
  db: DatabaseClient;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(auth: ReturnType<typeof getAuth>) {
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

export function createPlanEstimateRouter({
  planEstimateService,
  teamService,
  db,
  jwtSecret,
  authService,
}: Deps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const denyTechnician = createDenyTechnicianFromOwnerModules(db);

  router.use(requireAuth);
  router.use(denyTechnician);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get(
    '/plan-estimates',
    requireAnyPermission('finance:read', 'finance:write', '*'),
    async (req, res) => {
      try {
        res.json({ data: await planEstimateService.list(toActor(getAuth(req))) });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.get(
    '/plan-estimates/:id',
    requireAnyPermission('finance:read', 'finance:write', '*'),
    async (req, res) => {
      try {
        res.json({
          data: await planEstimateService.get(toActor(getAuth(req)), String(req.params.id)),
        });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    '/plan-estimates',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        const parsed = createSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: 'Invalid plan estimate payload' },
          });
          return;
        }
        const data = await planEstimateService.create(toActor(getAuth(req)), parsed.data);
        res.status(data.idempotent ? 200 : 201).json({ data });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    '/plan-estimates/:id/review',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        res.json({
          data: await planEstimateService.markReviewed(
            toActor(getAuth(req)),
            String(req.params.id),
          ),
        });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    '/plan-estimates/:id/approve',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        res.json({
          data: await planEstimateService.approveForQuote(
            toActor(getAuth(req)),
            String(req.params.id),
          ),
        });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    '/plan-estimates/:id/generate-quote',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        const clientActionId =
          typeof req.body?.clientActionId === 'string' ? req.body.clientActionId.trim() : '';
        if (!clientActionId) {
          res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: 'clientActionId required' },
          });
          return;
        }
        const data = await planEstimateService.generateDraftQuote(
          toActor(getAuth(req)),
          String(req.params.id),
          {
            clientActionId,
            customerId:
              typeof req.body?.customerId === 'string' ? req.body.customerId : undefined,
          },
        );
        res.json({ data });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    '/plan-estimates/:id/link-job',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        const jobId = typeof req.body?.jobId === 'string' ? req.body.jobId : '';
        if (!jobId) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'jobId required' } });
          return;
        }
        res.json({
          data: await planEstimateService.linkJob(
            toActor(getAuth(req)),
            String(req.params.id),
            jobId,
          ),
        });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.get(
    '/plan-estimates/:id/comparison',
    requireAnyPermission('finance:read', 'finance:write', '*'),
    async (req, res) => {
      try {
        const jobComplete = req.query.jobComplete === 'true';
        res.json({
          data: await planEstimateService.comparison(
            toActor(getAuth(req)),
            String(req.params.id),
            jobComplete,
          ),
        });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  return router;
}

function handleError(res: import('express').Response, error: unknown) {
  if (error instanceof PlanEstimateServiceError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  console.error('[plan-estimate]', error);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Plan estimate request failed' },
  });
}
