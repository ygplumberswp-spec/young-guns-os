import { Router } from 'express';
import { z } from 'zod';
import type { JobsService } from '../services/jobs.service.js';
import { JobsError } from '../services/jobs.service.js';
import type { TeamService } from '../services/team.service.js';
import type { DatabaseClient } from '@titan/db';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import {
  createDenyTechnicianFromOwnerModules,
  createRequireAssignedJob,
} from '../middleware/authorization-guards.js';

const jobStatusSchema = z.enum(['new', 'scheduled', 'in_progress', 'completed', 'cancelled']);

const createJobSchema = z.object({
  customerId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  status: jobStatusSchema.optional(),
  scheduledAt: z.string().datetime().optional().nullable(),
  scheduledEndAt: z.string().datetime().optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
});

const updateJobSchema = z.object({
  customerId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).optional().nullable(),
  status: jobStatusSchema.optional(),
  scheduledAt: z.string().datetime().optional().nullable(),
  scheduledEndAt: z.string().datetime().optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
});

type JobsRouterDeps = {
  jobsService: JobsService;
  teamService: TeamService;
  db: DatabaseClient;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export function createJobsRouter({ jobsService, teamService, db, jwtSecret, authService }: JobsRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const denyTechnician = createDenyTechnicianFromOwnerModules(db);
  const requireAssignedJob = createRequireAssignedJob(db, (req) => getRouteParam(req.params.jobId));

  router.use(requireAuth);
  router.use(denyTechnician);
  router.use(async (req, _res, next) => {
    const { companyId } = getAuth(req);
    await teamService.ensureDefaultRoles(companyId);
    next();
  });

  router.get('/stats', requireAnyPermission('jobs:read', 'jobs:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const stats = await jobsService.getStats(companyId);
    res.json({ data: stats });
  });

  router.get('/', requireAnyPermission('jobs:read', 'jobs:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const jobs = await jobsService.listJobs(companyId);
    res.json({ data: { jobs } });
  });

  router.post('/', requireAnyPermission('jobs:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = createJobSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid job payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const job = await jobsService.createJob(companyId, parsed.data);
      res.status(201).json({ data: { job } });
    } catch (error) {
      handleJobsError(res, error);
    }
  });

  router.get('/:jobId', requireAnyPermission('jobs:read', 'jobs:write'), requireAssignedJob, async (req, res) => {
    const { companyId } = getAuth(req);
    const job = await jobsService.getJob(companyId, getRouteParam(req.params.jobId));

    if (!job) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Job not found' },
      });
      return;
    }

    res.json({ data: { job } });
  });

  router.patch('/:jobId', requireAnyPermission('jobs:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = updateJobSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid job payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const job = await jobsService.updateJob(companyId, getRouteParam(req.params.jobId), parsed.data);
      res.json({ data: { job } });
    } catch (error) {
      handleJobsError(res, error);
    }
  });

  return router;
}

function handleJobsError(res: import('express').Response, error: unknown) {
  if (error instanceof JobsError) {
    const status =
      error.code === 'NOT_FOUND' || error.code === 'CUSTOMER_NOT_FOUND' || error.code === 'ASSIGNEE_NOT_FOUND'
        ? 404
        : error.code === 'VALIDATION_ERROR'
          ? 400
          : 400;

    res.status(status).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  throw error;
}
