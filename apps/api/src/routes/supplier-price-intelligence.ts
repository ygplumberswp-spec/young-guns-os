import { Router } from 'express';
import { z } from 'zod';
import {
  SupplierPriceIntelligenceError,
  type SupplierPriceIntelligenceService,
} from '../services/supplier-price-intelligence.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

type RouterDeps = {
  supplierPriceIntelligenceService: SupplierPriceIntelligenceService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

const importLineSchema = z.object({
  lineNumber: z.number().int().positive().optional(),
  supplierCode: z.string().nullable().optional(),
  description: z.string().min(1),
  unit: z.string().nullable().optional(),
  packSize: z.string().nullable().optional(),
  unitCostCents: z.number().int().nonnegative(),
  vatIncluded: z.boolean().optional(),
  effectiveDate: z.string().nullable().optional(),
});

const importBodySchema = z.object({
  supplierId: z.string().uuid().nullable().optional(),
  sourceFilename: z.string().nullable().optional(),
  lines: z.array(importLineSchema).min(1),
});

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof SupplierPriceIntelligenceError) {
    const status = error.code === 'VALIDATION_ERROR' ? 400 : 500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createSupplierPriceIntelligenceRouter({
  supplierPriceIntelligenceService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);

  router.get(
    '/dashboard',
    requireAnyPermission('inventory:read', 'inventory:write', 'finance:read'),
    async (req, res) => {
      try {
        const { companyId } = getAuth(req);
        const counts = await supplierPriceIntelligenceService.getDashboardCounts(companyId);
        res.json({ data: counts });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get(
    '/imports',
    requireAnyPermission('inventory:read', 'inventory:write'),
    async (req, res) => {
      try {
        const { companyId } = getAuth(req);
        const jobs = await supplierPriceIntelligenceService.listImportJobs(companyId);
        res.json({ data: jobs });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get(
    '/review-queue',
    requireAnyPermission('inventory:read', 'inventory:write', 'finance:read'),
    async (req, res) => {
      try {
        const { companyId } = getAuth(req);
        const items = await supplierPriceIntelligenceService.listReviewQueue(companyId);
        res.json({ data: items });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/imports',
    requireAnyPermission('inventory:write'),
    async (req, res) => {
      try {
        const { companyId } = getAuth(req);
        const parsed = importBodySchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid import payload',
              details: parsed.error.flatten(),
            },
          });
          return;
        }

        const result = await supplierPriceIntelligenceService.importSupplierPriceLines({
          companyId,
          supplierId: parsed.data.supplierId,
          sourceFilename: parsed.data.sourceFilename,
          lines: parsed.data.lines,
        });

        res.status(201).json({ data: result });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  return router;
}
