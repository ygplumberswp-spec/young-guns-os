import { Router } from 'express';
import { z } from 'zod';
import { canAccessJobLinkageControl, canManageJobLinkageControl } from '@titan/shared';
import type { JobLinkageControlService } from '../services/job-linkage-control.service.js';
import { JobLinkageControlError } from '../services/job-linkage-control.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const linkSchema = z.object({
  jobId: z.string().uuid(),
  reason: z.string().trim().min(1).max(2000),
  entityFingerprint: z.string().trim().max(500).optional(),
});

const unlinkSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

const rejectSchema = z.object({
  jobId: z.string().uuid(),
  reason: z.string().trim().min(1).max(2000),
});

type RouterDeps = {
  jobLinkageControlService: JobLinkageControlService;
  teamService: TeamService;
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
        message: 'Job linkage control is not available to Technician or Client roles.',
      },
    });
    return;
  }
  next();
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof JobLinkageControlError) {
    const status =
      error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'CONFLICT' || error.code === 'STALE_CANDIDATE'
            ? 409
            : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

export function createJobLinkageControlRouter({
  jobLinkageControlService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ teamService, jwtSecret, authService });
  const requireFinanceRead = requireAnyPermission('finance:read', 'finance:write', '*');
  const requireFinanceWrite = requireAnyPermission('finance:write', '*');

  router.use(requireAuth, denyTechnicianClient);

  router.get('/job-linkage-control', requireFinanceRead, async (req, res) => {
    const auth = getAuth(req);
    if (!canAccessJobLinkageControl(auth)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Job linkage control requires finance access.' },
      });
      return;
    }

    try {
      const queue = await jobLinkageControlService.getLinkageControlQueue(auth.companyId, {
        documentType:
          req.query.documentType === 'invoice' || req.query.documentType === 'quote'
            ? req.query.documentType
            : 'all',
        customerId: typeof req.query.customerId === 'string' ? req.query.customerId : undefined,
        fromDate: typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined,
        toDate: typeof req.query.toDate === 'string' ? req.query.toDate : undefined,
        confidence: req.query.confidence as
          | 'deterministic'
          | 'high'
          | 'medium'
          | 'low'
          | 'ambiguous'
          | undefined,
        reviewState: req.query.reviewState as
          | 'unlinked'
          | 'suggested'
          | 'ambiguous'
          | 'linked'
          | 'rejected'
          | undefined,
        jobId: typeof req.query.jobId === 'string' ? req.query.jobId : undefined,
        reference: typeof req.query.reference === 'string' ? req.query.reference : undefined,
        page: req.query.page ? Number(req.query.page) : 1,
        pageSize: req.query.pageSize ? Number(req.query.pageSize) : 25,
      });
      res.json({ data: { queue } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/linkage/invoices/:invoiceId/candidates', requireFinanceRead, async (req, res) => {
    const auth = getAuth(req);
    if (!canAccessJobLinkageControl(auth)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Linkage candidates require finance access.' },
      });
      return;
    }
    try {
      const result = await jobLinkageControlService.getInvoiceCandidates(
        auth.companyId,
        req.params.invoiceId!,
      );
      res.json({ data: result });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/linkage/quotes/:quoteId/candidates', requireFinanceRead, async (req, res) => {
    const auth = getAuth(req);
    if (!canAccessJobLinkageControl(auth)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Linkage candidates require finance access.' },
      });
      return;
    }
    try {
      const result = await jobLinkageControlService.getQuoteCandidates(
        auth.companyId,
        req.params.quoteId!,
      );
      res.json({ data: result });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/linkage/invoices/:invoiceId/link', requireFinanceWrite, async (req, res) => {
    const auth = getAuth(req);
    if (!canManageJobLinkageControl(auth)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Invoice linkage requires finance write access.' },
      });
      return;
    }
    const parsed = linkSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
      return;
    }
    try {
      const result = await jobLinkageControlService.linkInvoice(auth, req.params.invoiceId!, parsed.data);
      res.json({ data: result });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/linkage/quotes/:quoteId/link', requireFinanceWrite, async (req, res) => {
    const auth = getAuth(req);
    if (!canManageJobLinkageControl(auth)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Quote linkage requires finance write access.' },
      });
      return;
    }
    const parsed = linkSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
      return;
    }
    try {
      const result = await jobLinkageControlService.linkQuote(auth, req.params.quoteId!, parsed.data);
      res.json({ data: result });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/linkage/invoices/:invoiceId/unlink', requireFinanceWrite, async (req, res) => {
    const auth = getAuth(req);
    if (!canManageJobLinkageControl(auth)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Invoice unlink requires finance write access.' },
      });
      return;
    }
    const parsed = unlinkSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
      return;
    }
    try {
      const result = await jobLinkageControlService.unlinkInvoice(
        auth,
        req.params.invoiceId!,
        parsed.data,
      );
      res.json({ data: result });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/linkage/reject', requireFinanceWrite, async (req, res) => {
    const auth = getAuth(req);
    if (!canManageJobLinkageControl(auth)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Rejecting linkage suggestions requires finance write access.' },
      });
      return;
    }
    const bodySchema = rejectSchema.extend({
      entityType: z.enum(['invoice', 'quote']),
      entityId: z.string().uuid(),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
      return;
    }
    try {
      await jobLinkageControlService.rejectSuggestion(auth, parsed.data.entityType, parsed.data.entityId, {
        jobId: parsed.data.jobId,
        reason: parsed.data.reason,
      });
      res.json({ data: { ok: true } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
