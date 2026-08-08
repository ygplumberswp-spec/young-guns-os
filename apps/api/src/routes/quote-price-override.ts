import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '@titan/db';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import {
  QuotePriceOverrideService,
  QuotePriceOverrideServiceError,
} from '../services/quote-price-override.service.js';
import type { TeamService } from '../services/team.service.js';

const lineOverrideSchema = z
  .object({
    lineId: z.string().uuid(),
    targetSellPriceCents: z.number().int().min(0).nullable().optional(),
    targetMultiplier: z.number().positive().nullable().optional(),
  })
  .refine(
    (v) =>
      (v.targetSellPriceCents != null && v.targetMultiplier == null) ||
      (v.targetSellPriceCents == null && v.targetMultiplier != null),
    { message: 'PRICE_OVERRIDE_INPUT_CONFLICT' },
  );

const proposeSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
  lines: z.array(lineOverrideSchema).min(1),
});

type Deps = {
  quotePriceOverrideService: QuotePriceOverrideService;
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

export function createQuotePriceOverrideRouter({
  quotePriceOverrideService,
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
    '/quotes/:quoteId/price-overrides',
    requireAnyPermission('finance:read', 'finance:write', '*'),
    async (req, res) => {
      try {
        const data = await quotePriceOverrideService.listForQuote(
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
    '/quotes/:quoteId/price-overrides/preview',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        const parsed = proposeSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: parsed.error.issues[0]?.message ?? 'Invalid override preview',
            },
          });
          return;
        }
        const data = await quotePriceOverrideService.preview(toActor(getAuth(req)), {
          quoteId: String(req.params.quoteId),
          ...parsed.data,
        });
        res.json({ data });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    '/quotes/:quoteId/price-overrides',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        const parsed = proposeSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            error: {
              code: parsed.error.issues[0]?.message === 'PRICE_OVERRIDE_INPUT_CONFLICT'
                ? 'PRICE_OVERRIDE_INPUT_CONFLICT'
                : 'VALIDATION_ERROR',
              message: parsed.error.issues[0]?.message ?? 'Invalid override proposal',
            },
          });
          return;
        }
        const data = await quotePriceOverrideService.propose(toActor(getAuth(req)), {
          quoteId: String(req.params.quoteId),
          ...parsed.data,
        });
        res.status(201).json({ data });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    '/price-overrides/:overrideId/approve',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        const data = await quotePriceOverrideService.approve(
          toActor(getAuth(req)),
          String(req.params.overrideId),
        );
        res.json({ data });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    '/price-overrides/:overrideId/reject',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        const data = await quotePriceOverrideService.reject(
          toActor(getAuth(req)),
          String(req.params.overrideId),
        );
        res.json({ data });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    '/price-overrides/:overrideId/execute',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        const data = await quotePriceOverrideService.execute(
          toActor(getAuth(req)),
          String(req.params.overrideId),
        );
        res.json({ data });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  return router;
}

function handleError(res: import('express').Response, error: unknown) {
  if (error instanceof QuotePriceOverrideServiceError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }
  console.error('[quote-price-override]', error);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Quote price override request failed' },
  });
}
