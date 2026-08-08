import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '@titan/db';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import {
  BoqSupplierComparisonService,
  BoqSupplierComparisonServiceError,
} from '../services/boq-supplier-comparison.service.js';
import type { TeamService } from '../services/team.service.js';

const selectionSchema = z.object({
  boqImportRowId: z.string().uuid(),
  offerKey: z.string().trim().min(1).max(200),
  quantityProposed: z.number().min(0).nullable().optional(),
});

const createProposalSchema = z.object({
  selections: z.array(selectionSchema).optional(),
  preferEligibleCheapest: z.boolean().optional(),
  clientActionId: z.string().trim().min(1).max(120).nullable().optional(),
  status: z
    .enum(['DRAFT', 'REVIEW_REQUIRED', 'REVIEWED', 'APPROVED_DRAFT'])
    .optional(),
});

const updateProposalSchema = z.object({
  selections: z.array(selectionSchema).optional(),
  status: z
    .enum(['DRAFT', 'REVIEW_REQUIRED', 'REVIEWED', 'APPROVED_DRAFT'])
    .optional(),
  clientActionId: z.string().trim().min(1).max(120).nullable().optional(),
});

type Deps = {
  boqSupplierComparisonService: BoqSupplierComparisonService;
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

export function createBoqSupplierComparisonRouter({
  boqSupplierComparisonService,
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
    '/boq-imports/:boqImportId/supplier-comparison',
    requireAnyPermission('finance:read', 'finance:write', '*'),
    async (req, res) => {
      try {
        const data = await boqSupplierComparisonService.getComparison(
          toActor(getAuth(req)),
          String(req.params.boqImportId),
        );
        res.json({ data });
      } catch (error) {
        if (error instanceof BoqSupplierComparisonServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[boq-supplier-comparison]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Comparison failed' } });
      }
    },
  );

  router.get(
    '/boq-imports/:boqImportId/split-purchase-proposals',
    requireAnyPermission('finance:read', 'finance:write', '*'),
    async (req, res) => {
      try {
        const data = await boqSupplierComparisonService.listProposals(
          toActor(getAuth(req)),
          String(req.params.boqImportId),
        );
        res.json({ data });
      } catch (error) {
        if (error instanceof BoqSupplierComparisonServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[boq-supplier-comparison]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'List proposals failed' } });
      }
    },
  );

  router.post(
    '/boq-imports/:boqImportId/split-purchase-proposals',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        const body = createProposalSchema.parse(req.body ?? {});
        const data = await boqSupplierComparisonService.createSplitPurchaseProposal(
          toActor(getAuth(req)),
          String(req.params.boqImportId),
          {
            selections: (body.selections ?? []).map((s) => ({
              boqImportRowId: s.boqImportRowId,
              offerKey: s.offerKey,
              quantityProposed: s.quantityProposed ?? null,
            })),
            preferEligibleCheapest: body.preferEligibleCheapest,
            clientActionId: body.clientActionId,
            status: body.status,
          },
        );
        res.status(data.idempotentReplay ? 200 : 201).json({ data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
          return;
        }
        if (error instanceof BoqSupplierComparisonServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[boq-supplier-comparison]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Proposal create failed' } });
      }
    },
  );

  router.get(
    '/split-purchase-proposals/:proposalId',
    requireAnyPermission('finance:read', 'finance:write', '*'),
    async (req, res) => {
      try {
        const data = await boqSupplierComparisonService.getProposal(
          toActor(getAuth(req)),
          String(req.params.proposalId),
        );
        res.json({ data });
      } catch (error) {
        if (error instanceof BoqSupplierComparisonServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[boq-supplier-comparison]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Get proposal failed' } });
      }
    },
  );

  router.patch(
    '/split-purchase-proposals/:proposalId',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        const body = updateProposalSchema.parse(req.body ?? {});
        const data = await boqSupplierComparisonService.updateProposal(
          toActor(getAuth(req)),
          String(req.params.proposalId),
          {
            selections: body.selections?.map((s) => ({
              boqImportRowId: s.boqImportRowId,
              offerKey: s.offerKey,
              quantityProposed: s.quantityProposed ?? null,
            })),
            status: body.status,
            clientActionId: body.clientActionId,
          },
        );
        res.json({ data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
          return;
        }
        if (error instanceof BoqSupplierComparisonServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[boq-supplier-comparison]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Proposal update failed' } });
      }
    },
  );

  return router;
}
