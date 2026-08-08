import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '@titan/db';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import {
  PlanAiTakeoffService,
  PlanAiTakeoffServiceError,
} from '../services/plan-ai-takeoff.service.js';
import type { TeamService } from '../services/team.service.js';

const candidateSchema = z.object({
  clientKey: z.string().trim().min(1).max(120),
  pointType: z.enum(['WATER', 'WASTE', 'GEYSER', 'OTHER']),
  subtypeLabel: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().min(1).max(500),
  quantity: z.number().min(0).nullable(),
  unit: z.string().trim().max(40),
  isLengthMeasurement: z.boolean(),
  quantityOrigin: z.enum([
    'MANUAL_COUNT',
    'PLAN_ANNOTATION',
    'EXPLICIT_PLAN_LABEL',
    'MEASURED',
    'IMPORTED_STRUCTURED_SOURCE',
    'AI_DETECTION',
  ]),
  pageReference: z.string().trim().max(80).nullable().optional(),
  annotationRef: z.string().trim().max(120).nullable().optional(),
  supportingText: z.string().trim().max(1000).nullable().optional(),
  providerConfidence: z.enum(['HIGH', 'MEDIUM', 'LOW', 'NONE']),
  ambiguityFlags: z
    .array(
      z.enum([
        'SCALE_MISSING',
        'SYMBOL_AMBIGUOUS',
        'QUANTITY_UNCLEAR',
        'ROUTE_UNCLEAR',
        'FIXTURE_TYPE_UNCLEAR',
        'REVISION_CONFLICT',
        'MEASUREMENT_UNSUPPORTED',
        'SOURCE_EVIDENCE_INSUFFICIENT',
      ]),
    )
    .optional(),
  unitCostCents: z.number().int().nullable().optional(),
  materialSku: z.string().trim().max(80).nullable().optional(),
  labourHours: z.number().nullable().optional(),
});

const generateSchema = z.object({
  evidenceCandidates: z.array(candidateSchema).optional(),
  complexWork: z.boolean().optional(),
  complianceSensitive: z.boolean().optional(),
  idempotencyKey: z.string().trim().min(1).max(200).nullable().optional(),
  previousRevisionLabel: z.string().trim().max(80).nullable().optional(),
});

const acceptSchema = z.object({
  humanConfirm: z.boolean().optional(),
});

type Deps = {
  planAiTakeoffService: PlanAiTakeoffService;
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

export function createPlanAiTakeoffRouter({
  planAiTakeoffService,
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
    '/plan-estimates/:estimateId/ai-takeoff',
    requireAnyPermission('finance:read', 'finance:write', '*'),
    async (req, res) => {
      try {
        const data = await planAiTakeoffService.listForEstimate(
          toActor(getAuth(req)),
          String(req.params.estimateId),
        );
        res.json({ data });
      } catch (error) {
        if (error instanceof PlanAiTakeoffServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[plan-ai-takeoff]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'AI take-off list failed' } });
      }
    },
  );

  router.post(
    '/plan-estimates/:estimateId/ai-takeoff/generate',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        const body = generateSchema.parse(req.body ?? {});
        const data = await planAiTakeoffService.generateDraft(
          toActor(getAuth(req)),
          String(req.params.estimateId),
          body,
        );
        res.status(201).json({ data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
          return;
        }
        if (error instanceof PlanAiTakeoffServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[plan-ai-takeoff]', error);
        res.status(500).json({
          error: { code: 'INTERNAL_ERROR', message: 'AI take-off generate failed' },
        });
      }
    },
  );

  router.post(
    '/plan-estimates/:estimateId/ai-takeoff/items/:itemId/accept',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        const body = acceptSchema.parse(req.body ?? {});
        const data = await planAiTakeoffService.acceptItem(
          toActor(getAuth(req)),
          String(req.params.estimateId),
          String(req.params.itemId),
          body,
        );
        res.json({ data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
          return;
        }
        if (error instanceof PlanAiTakeoffServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[plan-ai-takeoff]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'AI take-off accept failed' } });
      }
    },
  );

  router.post(
    '/plan-estimates/:estimateId/ai-takeoff/items/:itemId/reject',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        const data = await planAiTakeoffService.rejectItem(
          toActor(getAuth(req)),
          String(req.params.estimateId),
          String(req.params.itemId),
        );
        res.json({ data });
      } catch (error) {
        if (error instanceof PlanAiTakeoffServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[plan-ai-takeoff]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'AI take-off reject failed' } });
      }
    },
  );

  return router;
}
