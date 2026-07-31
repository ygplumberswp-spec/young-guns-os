import { Router } from 'express';
import { z } from 'zod';
import type { RecruitingService } from '../services/recruiting.service.js';
import { RecruitingError } from '../services/recruiting.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const recruitingStatusSchema = z.enum(['new', 'screening', 'interview', 'offered', 'rejected']);

const createCandidateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
  roleTitle: z.string().trim().max(200).optional().nullable(),
  status: recruitingStatusSchema.optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
});

const updateCandidateSchema = createCandidateSchema.partial();

const createApplicationSchema = z.object({
  candidateId: z.string().uuid(),
  roleTitle: z.string().trim().min(1).max(200),
  status: recruitingStatusSchema.optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
});

const updateApplicationSchema = z.object({
  roleTitle: z.string().trim().min(1).max(200).optional(),
  status: recruitingStatusSchema.optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
});

type RecruitingRouterDeps = {
  recruitingService: RecruitingService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export function createRecruitingRouter({
  recruitingService,
  teamService,
  jwtSecret,
  authService,
}: RecruitingRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    const { companyId } = getAuth(req);
    await teamService.ensureDefaultRoles(companyId);
    next();
  });

  router.get(
    '/stats',
    requireAnyPermission('recruiting:read', 'recruiting:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const stats = await recruitingService.getStats(companyId);
      res.json({ data: { stats } });
    },
  );

  router.get(
    '/candidates',
    requireAnyPermission('recruiting:read', 'recruiting:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const candidates = await recruitingService.listCandidates(companyId);
      res.json({ data: { candidates } });
    },
  );

  router.post('/candidates', requireAnyPermission('recruiting:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = createCandidateSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid candidate payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const candidate = await recruitingService.createCandidate(companyId, parsed.data);
      res.status(201).json({ data: { candidate } });
    } catch (error) {
      handleRecruitingError(res, error);
    }
  });

  router.get(
    '/candidates/:id',
    requireAnyPermission('recruiting:read', 'recruiting:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const candidate = await recruitingService.getCandidate(
        companyId,
        getRouteParam(req.params.id),
      );

      if (!candidate) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Candidate not found' } });
        return;
      }

      res.json({ data: { candidate } });
    },
  );

  router.patch('/candidates/:id', requireAnyPermission('recruiting:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = updateCandidateSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid candidate payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const candidate = await recruitingService.updateCandidate(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { candidate } });
    } catch (error) {
      handleRecruitingError(res, error);
    }
  });

  router.get(
    '/applications',
    requireAnyPermission('recruiting:read', 'recruiting:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const applications = await recruitingService.listApplications(companyId);
      res.json({ data: { applications } });
    },
  );

  router.post('/applications', requireAnyPermission('recruiting:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = createApplicationSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid application payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const application = await recruitingService.createApplication(companyId, parsed.data);
      res.status(201).json({ data: { application } });
    } catch (error) {
      handleRecruitingError(res, error);
    }
  });

  router.patch('/applications/:id', requireAnyPermission('recruiting:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = updateApplicationSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid application payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const application = await recruitingService.updateApplication(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { application } });
    } catch (error) {
      handleRecruitingError(res, error);
    }
  });

  return router;
}

function handleRecruitingError(res: import('express').Response, error: unknown) {
  if (error instanceof RecruitingError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'VALIDATION_ERROR' ? 400 : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }

  throw error;
}
