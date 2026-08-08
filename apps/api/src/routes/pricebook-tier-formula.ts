import { Router } from 'express';
import { z } from 'zod';
import { hasAnyPermission } from '@titan/auth';
import type { DatabaseClient } from '@titan/db';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import {
  PricebookTierFormulaError,
  PricebookTierFormulaService,
} from '../services/pricebook-tier-formula.service.js';
import type { TeamService } from '../services/team.service.js';

const tierSchema = z.object({
  minCentsInclusive: z.number().int().min(0),
  maxCentsInclusive: z.number().int().min(0).nullable(),
  multiplierNumerator: z.number().int().positive(),
  multiplierDenominator: z.number().int().positive(),
  label: z.string().trim().min(1).max(120),
});

const saveDraftSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  baseCostType: z
    .enum(['UNIT_COST_CENTS', 'SUPPLIER_NET_COST', 'SUPPLIER_NET_DISCOUNTED', 'UNKNOWN'])
    .optional(),
  status: z.enum(['DRAFT', 'INACTIVE']).optional(),
  tiers: z.array(tierSchema).min(1),
});

const previewSchema = z.object({
  baseCostCents: z.number().int().nullable(),
  isDiscountedNet: z.boolean().optional(),
  costSource: z.string().trim().max(200).optional(),
});

type Deps = {
  pricebookTierFormulaService: PricebookTierFormulaService;
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

export function createPricebookTierFormulaRouter({
  pricebookTierFormulaService,
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
    const { companyId } = getAuth(req);
    await teamService.ensureDefaultRoles(companyId);
    next();
  });

  router.get(
    '/pricebook-rules',
    requireAnyPermission('finance:read', 'finance:write', '*'),
    async (req, res) => {
      try {
        const data = await pricebookTierFormulaService.getRuleSet(toActor(getAuth(req)));
        res.json({ data });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.put(
    '/pricebook-rules/draft',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        const parsed = saveDraftSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: 'Invalid pricebook rule draft' },
          });
          return;
        }
        const data = await pricebookTierFormulaService.saveDraft(toActor(getAuth(req)), parsed.data);
        res.json({ data });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    '/pricebook-rules/preview',
    requireAnyPermission('finance:read', 'finance:write', '*'),
    async (req, res) => {
      try {
        const parsed = previewSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: 'Invalid preview payload' },
          });
          return;
        }
        const data = await pricebookTierFormulaService.previewBaseCost(
          toActor(getAuth(req)),
          parsed.data,
        );
        res.json({ data });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.get(
    '/pricebook-rules/bulk-impact',
    requireAnyPermission('finance:read', 'finance:write', '*'),
    async (req, res) => {
      try {
        const data = await pricebookTierFormulaService.bulkImpactPreview(toActor(getAuth(req)));
        res.json({ data });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    '/pricebook-rules/activate',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        const token =
          typeof req.body?.ownerConfirmationToken === 'string'
            ? req.body.ownerConfirmationToken
            : null;
        await pricebookTierFormulaService.attemptActivation(toActor(getAuth(req)), token);
        res.status(403).json({
          error: {
            code: 'PRICEBOOK_RULE_OWNER_CONFIRMATION_REQUIRED',
            message: 'Activation blocked',
          },
        });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  // Explicit deny path for technicians is middleware; this documents client denial of internals.
  void hasAnyPermission;

  return router;
}

function handleError(res: import('express').Response, error: unknown) {
  if (error instanceof PricebookTierFormulaError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }
  console.error('[pricebook-tier-formula]', error);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Pricebook rule request failed' },
  });
}
