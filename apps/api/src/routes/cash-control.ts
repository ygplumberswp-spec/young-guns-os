import { Router } from 'express';
import { z } from 'zod';
import { canViewCashControl } from '@titan/shared';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import type { DatabaseClient } from '@titan/db';
import { CashControlError, CashControlService } from '../services/cash-control.service.js';

type RouterDeps = {
  cashControlService: CashControlService;
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
  if (error instanceof CashControlError) {
    const status =
      error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  if (
    error instanceof Error &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
  ) {
    const code = (error as { code: string }).code;
    if (code === 'NOT_FOUND' || code === 'FORBIDDEN') {
      res.status(code === 'NOT_FOUND' ? 404 : 403).json({
        error: { code, message: error.message },
      });
      return true;
    }
  }
  return false;
}

const ledgerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().trim().max(200).optional(),
  controlState: z.string().trim().max(80).optional(),
  direction: z.enum(['debit', 'credit']).optional(),
});

/**
 * CASH-001 routes — mounted under /api/v1/finance
 * GET /cash-control/summary
 * GET /cash-control/ledger
 * GET /cash-control/issues
 * GET /cash-control/jobs/:jobId
 */
export function createCashControlRouter({
  cashControlService,
  db,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const denyTechnician = createDenyTechnicianFromOwnerModules(db);
  const requireRead = requireAnyPermission('finance:read', 'finance:write', '*');

  router.use(requireAuth, denyTechnician);

  router.get('/cash-control/summary', requireRead, async (req, res) => {
    const auth = getAuth(req);
    if (!canViewCashControl(auth)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Cash control requires finance access.' },
      });
      return;
    }
    try {
      const data = await cashControlService.getSummary(toActor(req));
      res.json({ data });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/cash-control/ledger', requireRead, async (req, res) => {
    const auth = getAuth(req);
    if (!canViewCashControl(auth)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Cash control requires finance access.' },
      });
      return;
    }
    const parsed = ledgerQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      });
      return;
    }
    try {
      const data = await cashControlService.getLedger(toActor(req), parsed.data);
      res.json({ data });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/cash-control/issues', requireRead, async (req, res) => {
    const auth = getAuth(req);
    if (!canViewCashControl(auth)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Cash control requires finance access.' },
      });
      return;
    }
    try {
      const data = await cashControlService.getIssues(toActor(req));
      res.json({ data });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/cash-control/jobs/:jobId', requireRead, async (req, res) => {
    const auth = getAuth(req);
    if (!canViewCashControl(auth)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Cash control requires finance access.' },
      });
      return;
    }
    const jobId = String(Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId ?? '');
    const idParse = z.string().uuid().safeParse(jobId);
    if (!idParse.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'jobId must be a UUID' },
      });
      return;
    }
    try {
      const data = await cashControlService.getJobCashControl(toActor(req), idParse.data);
      res.json({ data });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
)
