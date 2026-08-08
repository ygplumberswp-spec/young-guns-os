import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '@titan/db';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import {
  JobProcurementChainService,
  JobProcurementChainServiceError,
} from '../services/job-procurement-chain.service.js';
import type { TeamService } from '../services/team.service.js';

type Deps = {
  jobProcurementChainService: JobProcurementChainService;
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

export function createJobProcurementChainRouter({
  jobProcurementChainService,
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
    '/job-procurement-chains/staging-audit',
    requireAnyPermission('finance:read', 'finance:write', 'procurement:read', '*'),
    async (req, res) => {
      try {
        const data = await jobProcurementChainService.stagingAudit(toActor(getAuth(req)));
        res.json({ data });
      } catch (error) {
        if (error instanceof JobProcurementChainServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[job-procurement-chain]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Audit failed' } });
      }
    },
  );

  router.post(
    '/job-procurement-chains/from-proposal',
    requireAnyPermission('finance:write', 'procurement:write', '*'),
    async (req, res) => {
      try {
        const body = z
          .object({
            proposalId: z.string().uuid(),
            proposalLineId: z.string().uuid(),
            purchasePath: z.enum(['DIRECT_TO_JOB', 'STOCK']).optional(),
            clientActionId: z.string().trim().min(1).max(120).nullable().optional(),
          })
          .parse(req.body ?? {});
        const data = await jobProcurementChainService.createFromApprovedProposal(
          toActor(getAuth(req)),
          body,
        );
        res.status(data.idempotentReplay ? 200 : 201).json({ data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
          return;
        }
        if (error instanceof JobProcurementChainServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[job-procurement-chain]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Chain create failed' } });
      }
    },
  );

  router.get(
    '/job-procurement-chains/:chainId',
    requireAnyPermission('finance:read', 'finance:write', 'procurement:read', '*'),
    async (req, res) => {
      try {
        const data = await jobProcurementChainService.get(
          toActor(getAuth(req)),
          String(req.params.chainId),
        );
        res.json({ data });
      } catch (error) {
        if (error instanceof JobProcurementChainServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[job-procurement-chain]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Get failed' } });
      }
    },
  );

  router.post(
    '/job-procurement-chains/:chainId/delivery',
    requireAnyPermission('finance:write', 'procurement:write', '*'),
    async (req, res) => {
      try {
        const body = z
          .object({
            deliveredQuantity: z.number().min(0).nullable(),
            deliveredAt: z.string().trim().max(40).nullable().optional(),
            deliveryReference: z.string().trim().max(120).nullable().optional(),
          })
          .parse(req.body ?? {});
        const data = await jobProcurementChainService.recordDelivery(
          toActor(getAuth(req)),
          String(req.params.chainId),
          body,
        );
        res.status(201).json({ data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
          return;
        }
        if (error instanceof JobProcurementChainServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[job-procurement-chain]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Delivery failed' } });
      }
    },
  );

  router.post(
    '/job-procurement-chains/:chainId/supplier-invoice',
    requireAnyPermission('finance:write', 'procurement:write', '*'),
    async (req, res) => {
      try {
        const body = z
          .object({
            invoiceNumber: z.string().trim().max(120).nullable().optional(),
            invoiceDate: z.string().trim().max(40).nullable().optional(),
            sourceDocumentRef: z.string().trim().max(260).nullable().optional(),
            lineQuantity: z.number().min(0).nullable().optional(),
            lineCostCents: z.number().int().min(0).nullable().optional(),
            vatBasis: z.enum(['INCLUSIVE', 'EXCLUSIVE', 'UNKNOWN']).nullable().optional(),
          })
          .parse(req.body ?? {});
        const data = await jobProcurementChainService.recordSupplierInvoice(
          toActor(getAuth(req)),
          String(req.params.chainId),
          body,
        );
        res.status(201).json({ data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
          return;
        }
        if (error instanceof JobProcurementChainServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[job-procurement-chain]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Invoice failed' } });
      }
    },
  );

  router.post(
    '/job-procurement-chains/:chainId/xero-project',
    requireAnyPermission('finance:write', 'procurement:write', '*'),
    async (req, res) => {
      try {
        const body = z
          .object({
            knownXeroBillId: z.string().uuid().nullable().optional(),
            knownXeroInvoiceId: z.string().trim().max(120).nullable().optional(),
          })
          .parse(req.body ?? {});
        const data = await jobProcurementChainService.projectXeroBill(
          toActor(getAuth(req)),
          String(req.params.chainId),
          body,
        );
        res.json({ data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
          return;
        }
        if (error instanceof JobProcurementChainServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[job-procurement-chain]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Xero project failed' } });
      }
    },
  );

  router.post(
    '/job-procurement-chains/:chainId/post-material-cost',
    requireAnyPermission('finance:write', 'procurement:write', '*'),
    async (req, res) => {
      try {
        const body = z
          .object({
            materialUseTransactionId: z.string().trim().max(120).nullable().optional(),
            stockReceiptMovementId: z.string().uuid().nullable().optional(),
          })
          .parse(req.body ?? {});
        const data = await jobProcurementChainService.postMaterialCost(
          toActor(getAuth(req)),
          String(req.params.chainId),
          body,
        );
        res.json({ data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
          return;
        }
        if (error instanceof JobProcurementChainServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[job-procurement-chain]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Cost post failed' } });
      }
    },
  );

  return router;
}
