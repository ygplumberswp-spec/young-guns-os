import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '@titan/db';
import {
  QUOTE_COST_COMPONENT_TYPES,
  QUOTE_COST_PROVENANCE,
  QUOTE_COST_VAT_BASIS,
} from '@titan/shared';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import {
  QuoteCostModelService,
  QuoteCostModelServiceError,
} from '../services/quote-cost-model.service.js';
import type { TeamService } from '../services/team.service.js';

const componentSchema = z.object({
  quoteLineId: z.string().uuid().nullable().optional(),
  componentType: z.enum(QUOTE_COST_COMPONENT_TYPES as unknown as [string, ...string[]]),
  description: z.string().trim().min(1).max(2000),
  quantity: z.number().min(0),
  unit: z.string().trim().min(1).max(64).default('each'),
  unitCostCents: z.number().int().min(0).nullable(),
  vatBasis: z.enum(QUOTE_COST_VAT_BASIS as unknown as [string, ...string[]]),
  provenance: z.enum(QUOTE_COST_PROVENANCE as unknown as [string, ...string[]]),
  optionTier: z.string().trim().max(64).nullable().optional(),
  clientActionId: z.string().trim().max(200).nullable().optional(),
  wastagePercentBps: z.number().int().min(0).max(100_000).nullable().optional(),
  percentOfBaseBps: z.number().int().min(0).max(100_000).nullable().optional(),
  percentBase: z.enum(['DIRECT_COST', 'MATERIALS', 'LABOUR']).nullable().optional(),
  sourceRef: z.string().trim().max(500).nullable().optional(),
  catalogueItemId: z.string().uuid().nullable().optional(),
  planEstimateCostComponentId: z.string().uuid().nullable().optional(),
});

type Deps = {
  quoteCostModelService: QuoteCostModelService;
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

function handleError(res: import('express').Response, error: unknown) {
  if (error instanceof QuoteCostModelServiceError) {
    return res.status(error.status).json({
      error: { code: error.code, message: error.message },
    });
  }
  console.error('[quote-cost-model]', error);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Quote cost model failed' },
  });
}

export function createQuoteCostModelRouter({
  quoteCostModelService,
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
    '/quotes/:quoteId/cost-model',
    requireAnyPermission('finance:read', 'finance:write', '*'),
    async (req, res) => {
      try {
        const data = await quoteCostModelService.getModel(
          toActor(getAuth(req)),
          String(req.params.quoteId),
        );
        res.json({ data });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    '/quotes/:quoteId/cost-components',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        const body = componentSchema.parse(req.body);
        const data = await quoteCostModelService.upsertComponent(
          toActor(getAuth(req)),
          String(req.params.quoteId),
          {
            ...body,
            componentType: body.componentType as never,
            vatBasis: body.vatBasis as never,
            provenance: body.provenance as never,
            customerVisible: false,
          },
        );
        res.status(201).json({ data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: error.message, details: error.flatten() },
          });
          return;
        }
        handleError(res, error);
      }
    },
  );

  router.delete(
    '/quotes/:quoteId/cost-components/:componentId',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        const data = await quoteCostModelService.removeComponent(
          toActor(getAuth(req)),
          String(req.params.quoteId),
          String(req.params.componentId),
        );
        res.json({ data });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    '/quotes/:quoteId/cost-model/import-plan-estimate',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        const body = z
          .object({
            estimateId: z.string().uuid(),
            clientActionId: z.string().trim().max(200).nullable().optional(),
          })
          .parse(req.body);
        const data = await quoteCostModelService.importFromPlanEstimate(
          toActor(getAuth(req)),
          String(req.params.quoteId),
          body.estimateId,
          body.clientActionId,
        );
        res.json({ data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: error.message },
          });
          return;
        }
        handleError(res, error);
      }
    },
  );

  router.post(
    '/quotes/:quoteId/cost-model/snapshot',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        const body = z
          .object({
            clientActionId: z.string().trim().max(200).nullable().optional(),
          })
          .parse(req.body ?? {});
        const data = await quoteCostModelService.snapshotBaseline(
          toActor(getAuth(req)),
          String(req.params.quoteId),
          body.clientActionId,
        );
        res.status(201).json({ data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: error.message },
          });
          return;
        }
        handleError(res, error);
      }
    },
  );

  return router;
}
