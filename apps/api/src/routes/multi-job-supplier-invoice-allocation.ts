import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '@titan/db';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import {
  MultiJobAllocServiceError,
  MultiJobSupplierInvoiceAllocationService,
} from '../services/multi-job-supplier-invoice-allocation.service.js';
import type { TeamService } from '../services/team.service.js';

type Deps = {
  multiJobSupplierInvoiceAllocationService: MultiJobSupplierInvoiceAllocationService;
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

export function createMultiJobSupplierInvoiceAllocationRouter({
  multiJobSupplierInvoiceAllocationService,
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
    '/multi-job-supplier-invoices/staging-audit',
    requireAnyPermission('finance:read', 'finance:write', 'procurement:read', '*'),
    async (req, res) => {
      try {
        const data = await multiJobSupplierInvoiceAllocationService.stagingAudit(
          toActor(getAuth(req)),
        );
        res.json({ data });
      } catch (error) {
        if (error instanceof MultiJobAllocServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[multi-job-alloc]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Audit failed' } });
      }
    },
  );

  router.post(
    '/multi-job-supplier-invoices',
    requireAnyPermission('finance:write', 'procurement:write', '*'),
    async (req, res) => {
      try {
        const body = z
          .object({
            supplierId: z.string().uuid().nullable().optional(),
            supplierInvoiceEvidenceId: z.string().uuid().nullable().optional(),
            sourceDocumentRef: z.string().trim().max(260).nullable().optional(),
            sourceDocumentHash: z.string().trim().max(128).nullable().optional(),
            invoiceNumber: z.string().trim().max(120).nullable().optional(),
            invoiceDate: z.string().trim().max(40).nullable().optional(),
            netAmountCents: z.number().int().nullable().optional(),
            vatAmountCents: z.number().int().nullable().optional(),
            vatBasis: z.string().trim().max(40).nullable().optional(),
            grossAmountCents: z.number().int().nullable().optional(),
            knownXeroBillId: z.string().trim().max(120).nullable().optional(),
            knownXeroInvoiceId: z.string().trim().max(120).nullable().optional(),
            clientActionId: z.string().trim().min(1).max(120).nullable().optional(),
            lines: z
              .array(
                z.object({
                  lineOrder: z.number().int().positive().optional(),
                  itemCode: z.string().trim().max(80).nullable().optional(),
                  description: z.string().trim().max(500).nullable().optional(),
                  quantity: z.number().nullable().optional(),
                  unit: z.string().trim().max(40).nullable().optional(),
                  netAmountCents: z.number().int().nullable().optional(),
                  vatAmountCents: z.number().int().nullable().optional(),
                  vatBasis: z.string().trim().max(40).nullable().optional(),
                  grossAmountCents: z.number().int().nullable().optional(),
                  purchaseOrderId: z.string().uuid().nullable().optional(),
                  purchaseOrderLineId: z.string().uuid().nullable().optional(),
                }),
              )
              .optional(),
          })
          .parse(req.body ?? {});
        const data = await multiJobSupplierInvoiceAllocationService.registerInvoice(
          toActor(getAuth(req)),
          body,
        );
        res.status(data.idempotentReplay ? 200 : 201).json({ data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
          return;
        }
        if (error instanceof MultiJobAllocServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[multi-job-alloc]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Register failed' } });
      }
    },
  );

  router.post(
    '/multi-job-supplier-invoice-allocations',
    requireAnyPermission('finance:write', 'procurement:write', '*'),
    async (req, res) => {
      try {
        const body = z
          .object({
            invoiceId: z.string().uuid(),
            invoiceLineId: z.string().uuid().nullable().optional(),
            jobId: z.string().uuid(),
            purchaseOrderId: z.string().uuid().nullable().optional(),
            purchaseOrderLineId: z.string().uuid().nullable().optional(),
            allocationNetCents: z.number().int(),
            allocationVatCents: z.number().int().nullable().optional(),
            allocationGrossCents: z.number().int().nullable().optional(),
            allocationQuantity: z.number().nullable().optional(),
            reason: z.string().trim().max(500).nullable().optional(),
            reviewStatus: z.enum(['DRAFT', 'REVIEWED', 'APPROVED']).optional(),
            clientActionId: z.string().trim().min(1).max(120).nullable().optional(),
            postJpe: z.boolean().optional(),
            expectedJobId: z.string().uuid().nullable().optional(),
          })
          .parse(req.body ?? {});
        const data = await multiJobSupplierInvoiceAllocationService.allocateToJob(
          toActor(getAuth(req)),
          body,
        );
        res.status(data.idempotentReplay ? 200 : 201).json({ data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
          return;
        }
        if (error instanceof MultiJobAllocServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[multi-job-alloc]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Allocate failed' } });
      }
    },
  );

  router.post(
    '/multi-job-supplier-invoice-allocations/correct',
    requireAnyPermission('finance:write', 'procurement:write', '*'),
    async (req, res) => {
      try {
        const body = z
          .object({
            priorAllocationId: z.string().uuid(),
            newJobId: z.string().uuid().nullable().optional(),
            newAllocationNetCents: z.number().int().nullable().optional(),
            reason: z.string().trim().min(1).max(500),
            clientActionId: z.string().trim().min(1).max(120).nullable().optional(),
          })
          .parse(req.body ?? {});
        const data = await multiJobSupplierInvoiceAllocationService.correctAllocation(
          toActor(getAuth(req)),
          body,
        );
        res.status(201).json({ data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
          return;
        }
        if (error instanceof MultiJobAllocServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[multi-job-alloc]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Correct failed' } });
      }
    },
  );

  router.post(
    '/multi-job-supplier-invoice-allocations/credit',
    requireAnyPermission('finance:write', 'procurement:write', '*'),
    async (req, res) => {
      try {
        const body = z
          .object({
            allocationIds: z.array(z.string().uuid()).min(1),
            creditAmountCents: z.number().int().positive(),
            ambiguous: z.boolean().optional(),
            clientActionId: z.string().trim().min(1).max(120).nullable().optional(),
          })
          .parse(req.body ?? {});
        const data = await multiJobSupplierInvoiceAllocationService.applyCreditToAllocation(
          toActor(getAuth(req)),
          body,
        );
        res.status(201).json({ data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
          return;
        }
        if (error instanceof MultiJobAllocServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[multi-job-alloc]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Credit failed' } });
      }
    },
  );

  return router;
}
