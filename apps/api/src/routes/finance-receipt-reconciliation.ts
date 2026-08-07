import { Router } from 'express';
import { z } from 'zod';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import type { DatabaseClient } from '@titan/db';
import {
  FinanceReceiptReconciliationError,
  FinanceReceiptReconciliationService,
} from '../services/finance-receipt-reconciliation.service.js';

const createReceiptSchema = z.object({
  documentId: z.string().uuid().optional(),
  evidenceSource: z.enum(['document', 'mobile_job_documentation']).optional(),
  evidenceSourceId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  receiptNumber: z.string().trim().max(120).optional(),
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  totalAmountCents: z.number().int().nonnegative().optional(),
  vatAmountCents: z.number().int().nonnegative().optional(),
  taxRateBps: z.number().int().nonnegative().optional(),
  exclusiveTotalCents: z.number().int().nonnegative().optional(),
  currency: z.string().trim().max(8).optional(),
  jobId: z.string().uuid().optional(),
  directCostId: z.string().uuid().optional(),
  notes: z.string().trim().max(2000).optional(),
  fileChecksumSha256: z.string().trim().max(128).optional(),
  createdFromBankTransactionId: z.string().uuid().optional(),
});

const attachReceiptSchema = z.object({
  documentId: z.string().uuid().optional(),
  receiptRecordId: z.string().uuid().optional(),
  amountCents: z.number().int().positive().optional(),
  linkMethod: z.enum(['manual', 'deterministic', 'owner_approved_match', 'technician_upload']).optional(),
  notes: z.string().trim().max(2000).optional(),
  metadata: createReceiptSchema.partial().optional(),
});

const matchSchema = z.object({
  bankTransactionId: z.string().uuid(),
  sourceFingerprint: z.string().min(1),
  amountCents: z.number().int().positive().optional(),
});

const verifySchema = z.object({
  notes: z.string().trim().max(2000).optional(),
});

const supplierSchema = z.object({
  supplierId: z.string().uuid(),
});

const aliasSchema = z.object({
  aliasText: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(2000).optional(),
});

type RouterDeps = {
  financeReceiptReconciliationService: FinanceReceiptReconciliationService;
  db: DatabaseClient;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function toActor(req: import('express').Request) {
  const auth = (req as AuthenticatedRequest).auth;
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof FinanceReceiptReconciliationError) {
    const status =
      error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'CONFLICT' || error.code === 'STALE_MATCH'
            ? 409
            : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

function paramId(req: import('express').Request, key = 'id'): string {
  const raw = req.params[key];
  return String(Array.isArray(raw) ? raw[0] : raw ?? '');
}

export function createFinanceReceiptReconciliationRouter({
  financeReceiptReconciliationService,
  db,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const denyTechnician = createDenyTechnicianFromOwnerModules(db);
  const requireRead = requireAnyPermission('finance:read', 'finance:write', '*');
  const requireWrite = requireAnyPermission('finance:write', '*');

  router.get('/receipts/control', requireAuth, denyTechnician, requireRead, async (req, res) => {
    try {
      const queue = await financeReceiptReconciliationService.getControlQueue(toActor(req));
      res.json({ data: queue });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/receipts/:id', requireAuth, denyTechnician, requireRead, async (req, res) => {
    try {
      const receipt = await financeReceiptReconciliationService.getReceipt(toActor(req), paramId(req));
      res.json({ data: receipt });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/receipts', requireAuth, requireWrite, async (req, res) => {
    try {
      const body = createReceiptSchema.parse(req.body);
      const receipt = await financeReceiptReconciliationService.createReceipt(toActor(req), body);
      res.status(201).json({ data: receipt });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/bank-transactions/:id/receipts', requireAuth, denyTechnician, requireWrite, async (req, res) => {
    try {
      const body = attachReceiptSchema.parse(req.body);
      const result = await financeReceiptReconciliationService.attachReceiptToTransaction(
        toActor(req),
        paramId(req, 'id'),
        body,
      );
      res.json({ data: result });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.delete(
    '/bank-transactions/:id/receipts/:receiptId',
    requireAuth,
    denyTechnician,
    requireWrite,
    async (req, res) => {
      try {
        await financeReceiptReconciliationService.unlinkReceiptFromTransaction(
          toActor(req),
          paramId(req, 'id'),
          paramId(req, 'receiptId'),
        );
        res.status(204).end();
      } catch (error) {
        if (!handleError(res, error)) throw error;
      }
    },
  );

  router.get('/receipts/:id/transaction-candidates', requireAuth, denyTechnician, requireRead, async (req, res) => {
    try {
      const candidates = await financeReceiptReconciliationService.getTransactionCandidates(
        toActor(req),
        paramId(req),
      );
      res.json({ data: { candidates } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/receipts/:id/match', requireAuth, denyTechnician, requireWrite, async (req, res) => {
    try {
      const body = matchSchema.parse(req.body);
      const receipt = await financeReceiptReconciliationService.approveReceiptMatch(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({ data: receipt });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/receipts/:id/verify', requireAuth, denyTechnician, requireWrite, async (req, res) => {
    try {
      const body = verifySchema.parse(req.body);
      const receipt = await financeReceiptReconciliationService.verifyReceipt(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({ data: receipt });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/receipts/:id/supplier', requireAuth, denyTechnician, requireWrite, async (req, res) => {
    try {
      const body = supplierSchema.parse(req.body);
      const receipt = await financeReceiptReconciliationService.assignSupplierToReceipt(
        toActor(req),
        paramId(req),
        body.supplierId,
      );
      res.json({ data: receipt });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/bank-transactions/:id/supplier', requireAuth, denyTechnician, requireWrite, async (req, res) => {
    try {
      const body = supplierSchema.parse(req.body);
      await financeReceiptReconciliationService.confirmSupplierForTransaction(
        toActor(req),
        paramId(req, 'id'),
        body.supplierId,
      );
      res.status(204).end();
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/suppliers/:id/aliases', requireAuth, denyTechnician, requireWrite, async (req, res) => {
    try {
      const body = aliasSchema.parse(req.body);
      const alias = await financeReceiptReconciliationService.createSupplierAlias(
        toActor(req),
        paramId(req, 'id'),
        body,
      );
      res.status(201).json({ data: alias });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
