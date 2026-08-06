import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  WhatsappContactEnrichmentError,
  type WhatsappContactEnrichmentService,
} from '../services/whatsapp-contact-enrichment.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import type { TeamService } from '../services/team.service.js';

type RouterDeps = {
  enrichmentService: WhatsappContactEnrichmentService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: Request) {
  return (req as AuthenticatedRequest).auth;
}

function scopeOf(req: Request) {
  const auth = getAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    permissions: auth.permissions,
  };
}

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0]! : value;
}

function handleError(error: unknown, res: Response) {
  if (error instanceof WhatsappContactEnrichmentError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'FORBIDDEN'
          ? 403
          : error.code === 'XERO_IMPORT_IN_PROGRESS' || error.code === 'CONFLICT'
            ? 409
            : error.code === 'VALIDATION_ERROR'
              ? 400
              : 500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

const approveReviewSchema = z.object({
  reviewNotes: z.string().trim().max(2000).nullable().optional(),
  requestXeroSyncBack: z.boolean().optional(),
});

export function createWhatsappEnrichmentRouter({
  enrichmentService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    const { companyId } = getAuth(req);
    await teamService.ensureDefaultRoles(companyId);
    next();
  });

  router.get(
    '/metrics',
    requireAnyPermission(
      'integrations:read',
      'integrations:manage',
      'communications:read',
      'crm:read',
    ),
    async (req, res) => {
      try {
        const { companyId } = getAuth(req);
        const metrics = await enrichmentService.getMetrics(companyId);
        res.json({ data: { metrics } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get(
    '/reviews',
    requireAnyPermission(
      'integrations:read',
      'integrations:manage',
      'communications:read',
      'crm:read',
    ),
    async (req, res) => {
      try {
        const { companyId } = getAuth(req);
        const status = typeof req.query.status === 'string' ? req.query.status : undefined;
        const matchClassification =
          typeof req.query.matchClassification === 'string'
            ? req.query.matchClassification
            : undefined;
        const reviews = await enrichmentService.listReviews(companyId, {
          status,
          matchClassification,
        });
        res.json({ data: { reviews } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/reviews/:id/approve',
    requireAnyPermission('integrations:manage', 'communications:write', 'crm:write'),
    async (req, res) => {
      try {
        const parsed = approveReviewSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          res.status(400).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid approval payload',
              details: parsed.error.flatten(),
            },
          });
          return;
        }

        const review = await enrichmentService.approveReview(
          scopeOf(req),
          getRouteParam(req.params.id),
          parsed.data,
        );
        res.json({ data: { review } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  return router;
}
