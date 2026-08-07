import { Router } from 'express';
import { z } from 'zod';
import { canAccessJobCostControl, canManageJobCostControl } from '@titan/shared';
import type { JobCostControlService } from '../services/job-cost-control.service.js';
import { JobCostControlError } from '../services/job-cost-control.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const allocateSchema = z.object({
  kind: z.enum(['direct_cost', 'purchase_order']),
  costId: z.string().uuid(),
  jobId: z.string().uuid(),
  reason: z.string().trim().min(1).max(2000),
});

const completeReviewSchema = z.object({
  notes: z.string().trim().max(2000).optional(),
});

const reopenReviewSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

type RouterDeps = {
  jobCostControlService: JobCostControlService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function denyTechnicianClient(
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
) {
  const role = getAuth(req).roleName;
  if (role === 'Technician' || role === 'Client') {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Job cost control is not available to Technician or Client roles.',
      },
    });
    return;
  }
  next();
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof JobCostControlError) {
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
  return false;
}

export function createJobCostControlRouter({
  jobCostControlService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireFinanceRead = requireAnyPermission('finance:read', 'finance:write', '*');
  const requireFinanceWrite = requireAnyPermission('finance:write', '*');

  router.use(requireAuth, denyTechnicianClient);

  router.get('/job-cost-control', requireFinanceRead, async (req, res) => {
    const auth = getAuth(req);
    if (!canAccessJobCostControl(auth)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Job cost control requires finance access.' },
      });
      return;
    }

    try {
      const queue = await jobCostControlService.getOwnerQueue(auth.companyId, {
        fromDate: typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined,
        toDate: typeof req.query.toDate === 'string' ? req.query.toDate : undefined,
        jobId: typeof req.query.jobId === 'string' ? req.query.jobId : undefined,
        severity: req.query.severity as 'info' | 'warning' | 'critical' | undefined,
        issueType: typeof req.query.issueType === 'string' ? req.query.issueType : undefined,
        reviewStatus: req.query.reviewStatus as
          | 'not_required'
          | 'needs_review'
          | 'in_review'
          | 'financially_complete'
          | undefined,
        reviewed:
          req.query.reviewed === 'true' ? true : req.query.reviewed === 'false' ? false : undefined,
      });
      res.json({ data: { queue } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/unallocated-costs', requireFinanceRead, async (req, res) => {
    const auth = getAuth(req);
    if (!canAccessJobCostControl(auth)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Unallocated costs require finance access.' },
      });
      return;
    }

    try {
      const items = await jobCostControlService.listUnallocatedCosts(auth.companyId);
      res.json({ data: { items } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/costs/:costId/allocate', requireFinanceWrite, async (req, res) => {
    const auth = getAuth(req);
    if (!canManageJobCostControl(auth)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Cost allocation requires finance write access.' },
      });
      return;
    }

    const parsed = allocateSchema.safeParse({ ...req.body, costId: req.params.costId });
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid allocation request' },
      });
      return;
    }

    try {
      await jobCostControlService.allocateCostToJob(
        {
          companyId: auth.companyId,
          userId: auth.userId,
          roleName: auth.roleName,
          permissions: auth.permissions,
        },
        parsed.data,
      );
      res.json({ data: { ok: true } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}

export function createJobFinancialReviewRouter({
  jobCostControlService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router({ mergeParams: true });
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireFinanceRead = requireAnyPermission('finance:read', 'finance:write', '*');
  const requireFinanceWrite = requireAnyPermission('finance:write', '*');

  router.use(requireAuth, denyTechnicianClient);

  router.get('/financial-review', requireFinanceRead, async (req, res) => {
    const auth = getAuth(req);
    if (!canAccessJobCostControl(auth)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Financial review requires finance access.' },
      });
      return;
    }

    const jobId = String(req.params.jobId ?? '');
    try {
      const review = await jobCostControlService.getJobFinancialReview(auth.companyId, jobId, {
        includeSensitiveCosts: canManageJobCostControl(auth),
      });
      res.json({ data: { review } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/cost-checklist', requireFinanceRead, async (req, res) => {
    const auth = getAuth(req);
    if (!canAccessJobCostControl(auth)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
      return;
    }

    const jobId = String(req.params.jobId ?? '');
    try {
      const checklist = await jobCostControlService.getJobCostChecklist(auth.companyId, jobId);
      res.json({ data: { checklist } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/financial-review/complete', requireFinanceWrite, async (req, res) => {
    const auth = getAuth(req);
    if (!canManageJobCostControl(auth)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Financial review sign-off requires finance write access.' },
      });
      return;
    }

    const parsed = completeReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request' } });
      return;
    }

    const jobId = String(req.params.jobId ?? '');
    try {
      const review = await jobCostControlService.completeFinancialReview(
        {
          companyId: auth.companyId,
          userId: auth.userId,
          roleName: auth.roleName,
          permissions: auth.permissions,
        },
        jobId,
        parsed.data,
      );
      res.json({ data: { review } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/financial-review/reopen', requireFinanceWrite, async (req, res) => {
    const auth = getAuth(req);
    if (!canManageJobCostControl(auth)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
      return;
    }

    const parsed = reopenReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Reason is required' } });
      return;
    }

    const jobId = String(req.params.jobId ?? '');
    try {
      const review = await jobCostControlService.reopenFinancialReview(
        {
          companyId: auth.companyId,
          userId: auth.userId,
          roleName: auth.roleName,
          permissions: auth.permissions,
        },
        jobId,
        parsed.data,
      );
      res.json({ data: { review } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
