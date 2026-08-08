import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '@titan/db';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import {
  SupplierQuoteBoqMatchService,
  SupplierQuoteBoqMatchServiceError,
} from '../services/supplier-quote-boq-match.service.js';
import type { TeamService } from '../services/team.service.js';

const lineSchema = z.object({
  clientKey: z.string().trim().min(1).max(120),
  sourceLineOrder: z.number().int().min(0),
  pageNumber: z.number().int().min(1).nullable().optional(),
  supplierSku: z.string().trim().max(120).nullable().optional(),
  manufacturerCode: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  unit: z.string().trim().max(40).nullable().optional(),
  quantity: z.number().min(0).nullable().optional(),
  packSize: z.number().min(0).nullable().optional(),
  unitPriceCents: z.number().int().min(0).nullable().optional(),
  vatBasis: z.enum(['INCLUSIVE', 'EXCLUSIVE', 'UNKNOWN']).nullable().optional(),
  currency: z.string().trim().max(8).nullable().optional(),
  priceValidTo: z.string().trim().max(40).nullable().optional(),
  sourceReference: z.string().trim().max(200).nullable().optional(),
});

const matchSchema = z.object({
  originalFilename: z.string().trim().min(1).max(260),
  fileHashSha256: z.string().trim().length(64).nullable().optional(),
  contentBase64: z.string().min(1).nullable().optional(),
  revisionLabel: z.string().trim().max(80).nullable().optional(),
  supplierId: z.string().uuid().nullable().optional(),
  supplierName: z.string().trim().max(200).nullable().optional(),
  sourceDocumentId: z.string().uuid().nullable().optional(),
  clientActionId: z.string().trim().min(1).max(120).nullable().optional(),
  supplierLines: z.array(lineSchema).min(1),
  allowSequenceOnlyAttempt: z.boolean().optional(),
});

type Deps = {
  supplierQuoteBoqMatchService: SupplierQuoteBoqMatchService;
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

export function createSupplierQuoteBoqMatchRouter({
  supplierQuoteBoqMatchService,
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
    '/boq-imports/:boqImportId/supplier-quote-matches',
    requireAnyPermission('finance:read', 'finance:write', '*'),
    async (req, res) => {
      try {
        const data = await supplierQuoteBoqMatchService.listForBoqImport(
          toActor(getAuth(req)),
          String(req.params.boqImportId),
        );
        res.json({ data });
      } catch (error) {
        if (error instanceof SupplierQuoteBoqMatchServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[supplier-quote-boq-match]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'List failed' } });
      }
    },
  );

  router.post(
    '/boq-imports/:boqImportId/supplier-quote-matches',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        const body = matchSchema.parse(req.body ?? {});
        const data = await supplierQuoteBoqMatchService.matchAgainstBoqImport(
          toActor(getAuth(req)),
          {
            boqImportId: String(req.params.boqImportId),
            ...body,
          },
        );
        res.status(data.idempotentReplay ? 200 : 201).json({ data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
          return;
        }
        if (error instanceof SupplierQuoteBoqMatchServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[supplier-quote-boq-match]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Match failed' } });
      }
    },
  );

  router.get(
    '/supplier-quote-imports/:importId',
    requireAnyPermission('finance:read', 'finance:write', '*'),
    async (req, res) => {
      try {
        const data = await supplierQuoteBoqMatchService.get(
          toActor(getAuth(req)),
          String(req.params.importId),
        );
        res.json({ data });
      } catch (error) {
        if (error instanceof SupplierQuoteBoqMatchServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[supplier-quote-boq-match]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Get failed' } });
      }
    },
  );

  router.post(
    '/supplier-quote-imports/:importId/proposals/:proposalId/confirm',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        const data = await supplierQuoteBoqMatchService.confirmProposal(
          toActor(getAuth(req)),
          String(req.params.importId),
          String(req.params.proposalId),
        );
        res.json({ data });
      } catch (error) {
        if (error instanceof SupplierQuoteBoqMatchServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[supplier-quote-boq-match]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Confirm failed' } });
      }
    },
  );

  router.post(
    '/supplier-quote-imports/:importId/proposals/:proposalId/reject',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        const data = await supplierQuoteBoqMatchService.rejectProposal(
          toActor(getAuth(req)),
          String(req.params.importId),
          String(req.params.proposalId),
        );
        res.json({ data });
      } catch (error) {
        if (error instanceof SupplierQuoteBoqMatchServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[supplier-quote-boq-match]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Reject failed' } });
      }
    },
  );

  return router;
}
