import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '@titan/db';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import {
  MaterialQuantityReconciliationService,
  MaterialQtyReconServiceError,
} from '../services/material-quantity-reconciliation.service.js';
import type { TeamService } from '../services/team.service.js';

type Deps = {
  materialQuantityReconciliationService: MaterialQuantityReconciliationService;
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

export function createMaterialQuantityReconciliationRouter({
  materialQuantityReconciliationService,
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
    '/material-quantity-reconciliations/staging-audit',
    requireAnyPermission('finance:read', 'finance:write', 'procurement:read', '*'),
    async (req, res) => {
      try {
        const data = await materialQuantityReconciliationService.stagingAudit(
          toActor(getAuth(req)),
        );
        res.json({ data });
      } catch (error) {
        if (error instanceof MaterialQtyReconServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[material-qty-recon]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Audit failed' } });
      }
    },
  );

  router.post(
    '/material-quantity-reconciliations',
    requireAnyPermission('finance:write', 'procurement:write', '*'),
    async (req, res) => {
      try {
        const body = z
          .object({
            chainId: z.string().uuid(),
            chainLinkId: z.string().uuid(),
            quotedQty: z.number().min(0).nullable().optional(),
            quotedUnit: z.string().trim().max(40).nullable().optional(),
            usedQty: z.number().min(0).nullable().optional(),
            clientActionId: z.string().trim().min(1).max(120).nullable().optional(),
          })
          .parse(req.body ?? {});
        const data = await materialQuantityReconciliationService.reconcileChainLink(
          toActor(getAuth(req)),
          body,
        );
        res.status(data.idempotentReplay ? 200 : 201).json({ data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
          return;
        }
        if (error instanceof MaterialQtyReconServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[material-qty-recon]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Reconcile failed' } });
      }
    },
  );

  router.post(
    '/material-supplier-returns',
    requireAnyPermission('finance:write', 'procurement:write', '*'),
    async (req, res) => {
      try {
        const body = z
          .object({
            chainId: z.string().uuid(),
            chainLinkId: z.string().uuid(),
            quantity: z.number().positive(),
            unit: z.string().trim().max(40).nullable().optional(),
            reason: z.string().trim().max(500).nullable().optional(),
            sourceDocumentRef: z.string().trim().max(260).nullable().optional(),
            availableQuantity: z.number().min(0),
            clientActionId: z.string().trim().min(1).max(120).nullable().optional(),
            postCostAdjustment: z.boolean().optional(),
          })
          .parse(req.body ?? {});
        const data = await materialQuantityReconciliationService.recordSupplierReturn(
          toActor(getAuth(req)),
          body,
        );
        res.status(201).json({ data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
          return;
        }
        if (error instanceof MaterialQtyReconServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[material-qty-recon]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Return failed' } });
      }
    },
  );

  router.post(
    '/material-supplier-credits',
    requireAnyPermission('finance:write', 'procurement:write', '*'),
    async (req, res) => {
      try {
        const body = z
          .object({
            chainId: z.string().uuid(),
            amountCents: z.number().int().min(0),
            relatedReturnEventId: z.string().uuid().nullable().optional(),
            creditNoteRef: z.string().trim().max(120).nullable().optional(),
            sourceDocumentRef: z.string().trim().max(260).nullable().optional(),
            vatBasis: z.enum(['INCLUSIVE', 'EXCLUSIVE', 'UNKNOWN']).nullable().optional(),
            creditDate: z.string().trim().max(40).nullable().optional(),
            knownXeroCreditNoteId: z.string().trim().max(120).nullable().optional(),
            clientActionId: z.string().trim().min(1).max(120).nullable().optional(),
            postCostAdjustment: z.boolean().optional(),
          })
          .parse(req.body ?? {});
        const data = await materialQuantityReconciliationService.recordSupplierCredit(
          toActor(getAuth(req)),
          body,
        );
        res.status(201).json({ data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
          return;
        }
        if (error instanceof MaterialQtyReconServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[material-qty-recon]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Credit failed' } });
      }
    },
  );

  router.post(
    '/material-waste-events',
    requireAnyPermission('finance:write', 'procurement:write', '*'),
    async (req, res) => {
      try {
        const body = z
          .object({
            chainId: z.string().uuid(),
            chainLinkId: z.string().uuid(),
            quantity: z.number().positive(),
            unit: z.string().trim().max(40).nullable().optional(),
            reason: z.string().trim().max(500).nullable().optional(),
            availableQuantity: z.number().min(0),
            clientActionId: z.string().trim().min(1).max(120).nullable().optional(),
          })
          .parse(req.body ?? {});
        const data = await materialQuantityReconciliationService.recordWaste(
          toActor(getAuth(req)),
          body,
        );
        res.status(201).json({ data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
          return;
        }
        if (error instanceof MaterialQtyReconServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[material-qty-recon]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Waste failed' } });
      }
    },
  );

  return router;
}
