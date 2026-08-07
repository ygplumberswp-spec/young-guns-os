import { Router } from 'express';
import { z } from 'zod';
import { canAccessJobCostControl, canManageJobCostControl } from '@titan/shared';
import type { JobCostCaptureService } from '../services/job-cost-capture.service.js';
import { JobCostCaptureError } from '../services/job-cost-capture.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const directCostSchema = z.object({
  category: z.string().trim().min(1),
  description: z.string().trim().min(1).max(500),
  amountCents: z.number().int().min(0).optional().nullable(),
  costDate: z.string().optional(),
  isPaid: z.boolean().optional(),
  receiptDocumentId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  clientActionId: z.string().trim().min(1).max(200),
});

type RouterDeps = {
  jobCostCaptureService: JobCostCaptureService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0]! : value;
}

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof JobCostCaptureError) {
    const status = error.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

export function createJobCostCaptureRouter({
  jobCostCaptureService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireFinanceWrite = requireAnyPermission('finance:write', '*');

  router.use(requireAuth);

  router.get('/cost-capture/daily-summary', requireFinanceWrite, async (req, res) => {
    const auth = getAuth(req);
    if (!canAccessJobCostControl(auth)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Finance access required.' } });
      return;
    }
    const date = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0, 10);
    try {
      const summary = await jobCostCaptureService.getDailyCaptureSummary(auth.companyId, date);
      res.json({ data: { summary } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/jobs/:jobId/direct-costs', requireFinanceWrite, async (req, res) => {
    const auth = getAuth(req);
    if (!canManageJobCostControl(auth)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Finance write access required.' } });
      return;
    }
    const parsed = directCostSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
      return;
    }
    try {
      const row = await jobCostCaptureService.createDirectCost(auth, getRouteParam(req.params.jobId), parsed.data);
      res.status(201).json({ data: { directCost: row } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/jobs/:jobId/capture-status', requireFinanceWrite, async (req, res) => {
    const auth = getAuth(req);
    if (!canAccessJobCostControl(auth)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Finance access required.' } });
      return;
    }
    try {
      const status = await jobCostCaptureService.getJobCaptureStatus(auth.companyId, getRouteParam(req.params.jobId));
      res.json({ data: status });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
