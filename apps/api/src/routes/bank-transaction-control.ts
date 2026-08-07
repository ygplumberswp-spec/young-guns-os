import { Router } from 'express';
import { z } from 'zod';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import type { DatabaseClient } from '@titan/db';
import {
  BankTransactionControlError,
  BankTransactionControlService,
} from '../services/bank-transaction-control.service.js';

const allocateLineSchema = z.object({
  amountCents: z.number().int().positive(),
  allocationType: z.enum([
    'direct_job_cost',
    'overhead',
    'transfer',
    'supplier_settlement',
    'customer_payment',
    'owner_director',
    'tax',
    'other',
  ]),
  category: z.string().trim().max(80).optional(),
  jobId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  directCostId: z.string().uuid().optional(),
  notes: z.string().trim().max(2000).optional(),
  createDirectCost: z.boolean().optional(),
  directCostDescription: z.string().trim().max(500).optional(),
  directCostCategory: z.string().trim().max(80).optional(),
});

const allocateSchema = z.object({
  lines: z.array(allocateLineSchema).min(1),
  reason: z.string().trim().max(2000).optional(),
});

const reallocateSchema = z.object({
  deactivateAllocationIds: z.array(z.string().uuid()),
  newLines: z.array(allocateLineSchema).min(1),
  reason: z.string().trim().min(1).max(2000),
});

const receiptSchema = z.object({
  documentId: z.string().uuid(),
});

const ignoreSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

type RouterDeps = {
  bankTransactionControlService: BankTransactionControlService;
  db: DatabaseClient;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request) {
  const auth = getAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof BankTransactionControlError) {
    const status =
      error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'CONFLICT'
            ? 409
            : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  if (error instanceof Error && error.message.includes('exceeds transaction amount')) {
    res.status(400).json({ error: { code: 'OVER_ALLOCATION', message: error.message } });
    return true;
  }
  return false;
}

function paramId(req: import('express').Request): string {
  const raw = req.params.id;
  return String(Array.isArray(raw) ? raw[0] : raw ?? '');
}

export function createBankTransactionControlRouter({
  bankTransactionControlService,
  db,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const denyTechnician = createDenyTechnicianFromOwnerModules(db);
  const requireRead = requireAnyPermission('finance:read', 'finance:write', '*');
  const requireWrite = requireAnyPermission('finance:write', '*');

  router.use(requireAuth, denyTechnician);

  router.get('/bank-transactions/control', requireRead, async (req, res) => {
    try {
      const queue = await bankTransactionControlService.getControlQueue(toActor(req));
      res.json({ data: queue });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/bank-transactions', requireRead, async (req, res) => {
    try {
      const result = await bankTransactionControlService.listTransactions(toActor(req), {
        allocationStatus: typeof req.query.allocationStatus === 'string' ? req.query.allocationStatus : undefined,
        direction: typeof req.query.direction === 'string' ? req.query.direction : undefined,
        dateFrom: typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined,
        dateTo: typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
      });
      res.json({ data: result });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/bank-transactions/:id', requireRead, async (req, res) => {
    try {
      const detail = await bankTransactionControlService.getTransaction(toActor(req), paramId(req));
      res.json({ data: detail });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/bank-transactions/:id/candidates', requireRead, async (req, res) => {
    try {
      const candidates = await bankTransactionControlService.getCandidates(toActor(req), paramId(req));
      res.json({ data: { candidates } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/bank-transactions/:id/allocate', requireWrite, async (req, res) => {
    try {
      const body = allocateSchema.parse(req.body);
      const detail = await bankTransactionControlService.allocate(
        toActor(req),
        paramId(req),
        body.lines,
        body.reason,
      );
      res.json({ data: detail });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/bank-transactions/:id/reallocate', requireWrite, async (req, res) => {
    try {
      const body = reallocateSchema.parse(req.body);
      const detail = await bankTransactionControlService.reallocate(toActor(req), paramId(req), body);
      res.json({ data: detail });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/bank-transactions/:id/receipt', requireWrite, async (req, res) => {
    try {
      const body = receiptSchema.parse(req.body);
      const detail = await bankTransactionControlService.attachReceipt(
        toActor(req),
        paramId(req),
        body.documentId,
      );
      res.json({ data: detail });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/bank-transactions/:id/ignore', requireWrite, async (req, res) => {
    try {
      const body = ignoreSchema.parse(req.body);
      const detail = await bankTransactionControlService.ignore(
        toActor(req),
        paramId(req),
        body.reason,
      );
      res.json({ data: detail });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
