import { Router } from 'express';
import { z } from 'zod';
import {
  CustomerDuplicateReconciliationError,
  CustomerDuplicateReconciliationService,
} from '../services/customer-duplicate-reconciliation.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const draftSchema = z.object({
  resolutionType: z.enum([
    'NOT_DUPLICATE',
    'SAME_COMPANY_DIFFERENT_PERSON',
    'TRUE_DUPLICATE_CANONICALIZE',
    'DEFER',
  ]),
  canonicalCustomerId: z.string().uuid(),
  personId: z.string().uuid().nullable().optional(),
  fieldConflictSelections: z
    .record(z.enum(['left', 'right', 'preserve_both']))
    .optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

const createWarnSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().nullable().optional().or(z.literal('')),
  phone: z.string().trim().max(50).nullable().optional(),
  vatNumber: z.string().trim().max(80).nullable().optional(),
});

type RouterDeps = {
  reconciliationService: CustomerDuplicateReconciliationService;
  teamService: TeamService;
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

function paramId(req: import('express').Request, key: string): string {
  const raw = req.params[key];
  return String(Array.isArray(raw) ? raw[0] : raw ?? '');
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof CustomerDuplicateReconciliationError) {
    const status =
      error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'STALE_PREVIEW' || error.code === 'CONFLICT'
            ? 409
            : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

function nextError(res: import('express').Response, error: unknown) {
  console.error('[customer-duplicate-reconciliation]', error);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
}

export function createCustomerDuplicateReconciliationRouter({
  reconciliationService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission('*', 'customers:read', 'customers:write');
  const requireWrite = requireAnyPermission('*', 'customers:write');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    try {
      await teamService.ensureDefaultRoles(getAuth(req).companyId);
      next();
    } catch (error) {
      next(error);
    }
  });

  router.use((req, res, next) => {
    const role = getAuth(req).roleName;
    if (role === 'Technician' || role === 'Client') {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message:
            role === 'Technician'
              ? 'Technicians cannot open the duplicate review queue.'
              : 'Clients cannot access internal duplicate reconciliation.',
        },
      });
      return;
    }
    next();
  });

  router.post('/scan', requireRead, async (req, res) => {
    try {
      const result = await reconciliationService.scanAndClassify(toActor(req));
      res.json({
        data: {
          ...result,
          autoMerge: false as const,
          xeroWrites: 0 as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.get('/queue', requireRead, async (req, res) => {
    try {
      const status =
        typeof req.query.status === 'string'
          ? (req.query.status as
              | 'unreviewed'
              | 'draft'
              | 'approved'
              | 'executed'
              | 'reversed'
              | 'dismissed'
              | 'deferred')
          : undefined;
      const confidence =
        typeof req.query.confidence === 'string'
          ? (req.query.confidence as
              | 'HIGH_CONFIDENCE_DUPLICATE'
              | 'POSSIBLE_DUPLICATE'
              | 'SAME_COMPANY_DIFFERENT_CONTACT'
              | 'LIKELY_DIFFERENT'
              | 'REVIEW_REQUIRED')
          : undefined;
      const items = await reconciliationService.listQueue(toActor(req), { status, confidence });
      res.json({ data: { items, autoMerge: false as const } });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.get('/cases/:reconciliationId/side-by-side', requireRead, async (req, res) => {
    try {
      const data = await reconciliationService.getSideBySide(
        toActor(req),
        paramId(req, 'reconciliationId'),
      );
      res.json({ data });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.post('/cases/:reconciliationId/draft', requireWrite, async (req, res) => {
    try {
      const parsed = draftSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'INVALID', message: parsed.error.message } });
        return;
      }
      const result = await reconciliationService.createDraft(
        toActor(req),
        paramId(req, 'reconciliationId'),
        parsed.data,
      );
      res.status(201).json({ data: result });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.post('/cases/:reconciliationId/approve', requireWrite, async (req, res) => {
    try {
      const row = await reconciliationService.approve(
        toActor(req),
        paramId(req, 'reconciliationId'),
      );
      res.json({ data: { reconciliation: row } });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.post('/cases/:reconciliationId/execute', requireWrite, async (req, res) => {
    try {
      const result = await reconciliationService.execute(
        toActor(req),
        paramId(req, 'reconciliationId'),
      );
      res.json({ data: result });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.post('/cases/:reconciliationId/reverse', requireWrite, async (req, res) => {
    try {
      const row = await reconciliationService.reverse(
        toActor(req),
        paramId(req, 'reconciliationId'),
      );
      res.json({ data: { reconciliation: row } });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.post('/create-warning', requireRead, async (req, res) => {
    try {
      const parsed = createWarnSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'INVALID', message: parsed.error.message } });
        return;
      }
      const result = await reconciliationService.warnOnCreate(toActor(req), {
        ...parsed.data,
        email: parsed.data.email === '' ? null : parsed.data.email,
      });
      res.json({ data: result });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.get('/crc-rowan-proof', requireRead, async (req, res) => {
    try {
      const proof = await reconciliationService.proveCrcRowanReadOnly(toActor(req));
      res.json({ data: proof });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  return router;
}
