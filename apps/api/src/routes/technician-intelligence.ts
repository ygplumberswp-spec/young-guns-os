import { Router } from 'express';
import { z } from 'zod';
import { isTechnicianRole } from '@titan/auth';
import {
  TechnicianIntelligenceError,
  type TechnicianIntelligenceActor,
  type TechnicianIntelligenceService,
} from '../services/technician-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import type { DatabaseClient } from '@titan/db';

const periodSchema = z.enum(['daily', 'weekly', 'monthly']).default('weekly');

const generateSchema = z.object({
  period: z.enum(['daily', 'weekly', 'monthly']).optional(),
});

const decideSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  notes: z.string().trim().max(2000).optional(),
});

type RouterDeps = {
  technicianIntelligenceService: TechnicianIntelligenceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
  db: DatabaseClient;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): TechnicianIntelligenceActor {
  const auth = getAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof TechnicianIntelligenceError) {
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

export function createTechnicianIntelligenceRouter({
  technicianIntelligenceService,
  teamService,
  jwtSecret,
  authService,
  db,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const denyTechnicianFromOwner = createDenyTechnicianFromOwnerModules(db);

  const requireOwnerRead = requireAnyPermission(
    'ops:read',
    'ops:manage',
    'workforce_intelligence:read',
    'workforce_intelligence:manage',
    'dispatch_intelligence:read',
    'dispatch:read',
    'dispatch:write',
    'intelligence:read',
    'jobs:read',
  );
  const requireOwnerWrite = requireAnyPermission(
    'ops:manage',
    'workforce_intelligence:write',
    'workforce_intelligence:manage',
    'dispatch_intelligence:write',
    'dispatch:write',
    'intelligence:write',
  );
  const requireSelfRead = requireAnyPermission(
    'jobs:read',
    'mobile:read',
    'mobile:write',
    'ops:read',
    'workforce_intelligence:read',
    'dispatch:read',
  );

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  // ── Owner analytics (technicians denied) ───────────────────────────────────

  router.get('/owner/overview', denyTechnicianFromOwner, requireOwnerRead, async (req, res) => {
    const actor = toActor(req);
    const periodParsed = periodSchema.safeParse(req.query.period ?? 'weekly');
    if (!periodParsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'period must be daily, weekly, or monthly' },
      });
      return;
    }
    try {
      const overview = await technicianIntelligenceService.getOwnerOverview(
        actor,
        periodParsed.data,
      );
      res.json({ data: { overview } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get(
    '/owner/technicians/:technicianId',
    denyTechnicianFromOwner,
    requireOwnerRead,
    async (req, res) => {
      const actor = toActor(req);
      const periodParsed = periodSchema.safeParse(req.query.period ?? 'weekly');
      if (!periodParsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'period must be daily, weekly, or monthly' },
        });
        return;
      }
      const technicianId = String(
        Array.isArray(req.params.technicianId)
          ? req.params.technicianId[0]
          : req.params.technicianId ?? '',
      );
      if (!technicianId) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'technicianId is required' },
        });
        return;
      }
      try {
        const detail = await technicianIntelligenceService.getOwnerTechnicianDetail(
          actor,
          technicianId,
          periodParsed.data,
        );
        res.json({ data: { detail } });
      } catch (error) {
        if (!handleError(res, error)) throw error;
      }
    },
  );

  router.get('/insights', denyTechnicianFromOwner, requireOwnerRead, async (req, res) => {
    const actor = toActor(req);
    try {
      const bundle = await technicianIntelligenceService.listInsights(actor);
      res.json({ data: { insights: bundle.insights, pendingCount: bundle.pendingCount, guarantees: bundle.guarantees, autoExecuted: false as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/insights/generate', denyTechnicianFromOwner, requireOwnerWrite, async (req, res) => {
    const actor = toActor(req);
    const parsed = generateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid generate payload' },
      });
      return;
    }
    try {
      const bundle = await technicianIntelligenceService.generateInsights(actor, parsed.data);
      res.status(201).json({
        data: {
          insights: bundle.insights,
          pendingCount: bundle.pendingCount,
          guarantees: bundle.guarantees,
          autoExecuted: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post(
    '/insights/:insightId/decide',
    denyTechnicianFromOwner,
    requireOwnerWrite,
    async (req, res) => {
      const actor = toActor(req);
      const parsed = decideSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'decision must be approve or reject',
          },
        });
        return;
      }
      const insightId = String(
        Array.isArray(req.params.insightId) ? req.params.insightId[0] : req.params.insightId ?? '',
      );
      if (!insightId) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'insightId is required' },
        });
        return;
      }
      try {
        const insight = await technicianIntelligenceService.decideInsight(
          actor,
          insightId,
          parsed.data,
        );
        res.json({
          data: {
            insight,
            autoExecuted: false as const,
          },
        });
      } catch (error) {
        if (!handleError(res, error)) throw error;
      }
    },
  );

  // ── Technician self view ───────────────────────────────────────────────────

  router.get('/me', requireSelfRead, async (req, res) => {
    const actor = toActor(req);
    const periodParsed = periodSchema.safeParse(req.query.period ?? 'weekly');
    if (!periodParsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'period must be daily, weekly, or monthly' },
      });
      return;
    }
    try {
      const view = await technicianIntelligenceService.getSelfView(actor, periodParsed.data);
      res.json({ data: { view } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/me/jobs', requireSelfRead, async (req, res) => {
    const actor = toActor(req);
    const periodParsed = periodSchema.safeParse(req.query.period ?? 'weekly');
    if (!periodParsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'period must be daily, weekly, or monthly' },
      });
      return;
    }
    try {
      const view = await technicianIntelligenceService.getSelfView(actor, periodParsed.data);
      res.json({
        data: {
          assignedJobs: view.assignedJobs,
          exclusions: view.exclusions,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/me/history', requireSelfRead, async (req, res) => {
    const actor = toActor(req);
    const periodParsed = periodSchema.safeParse(req.query.period ?? 'weekly');
    if (!periodParsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'period must be daily, weekly, or monthly' },
      });
      return;
    }
    try {
      const view = await technicianIntelligenceService.getSelfView(actor, periodParsed.data);
      res.json({
        data: {
          completionHistory: view.completionHistory,
          exclusions: view.exclusions,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/jobs/:jobId/lifecycle', requireSelfRead, async (req, res) => {
    const actor = toActor(req);
    // Technicians: assigned-job only (enforced in service). Owners: analytics permissions.
    if (!isTechnicianRole(actor)) {
      // Owner path still needs owner-module permission check beyond jobs:read wildcard cases.
    }
    const jobId = String(
      Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId ?? '',
    );
    if (!jobId) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'jobId is required' },
      });
      return;
    }
    try {
      const lifecycle = await technicianIntelligenceService.getJobLifecycle(actor, jobId);
      res.json({ data: { lifecycle } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
