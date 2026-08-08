import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '@titan/db';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import {
  JobProfitabilityTruthService,
  JobProfitabilityTruthServiceError,
} from '../services/job-profitability-truth.service.js';
import type { TeamService } from '../services/team.service.js';

type Deps = {
  jobProfitabilityTruthService: JobProfitabilityTruthService;
  teamService: TeamService;
  db: DatabaseClient;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(auth: ReturnType<typeof getAuth>) {
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

export function createJobProfitabilityTruthRouter({
  jobProfitabilityTruthService,
  teamService,
  db,
  jwtSecret,
  authService,
}: Deps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const denyTechnician = createDenyTechnicianFromOwnerModules(db);

  router.use(requireAuth);
  router.use(denyTechnician);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get(
    '/job-profitability-truth/staging-audit',
    requireAnyPermission('finance:read', 'finance:write', 'jobs:profitability', '*'),
    async (req, res) => {
      try {
        const data = await jobProfitabilityTruthService.stagingAudit(toActor(getAuth(req)));
        res.json({ data });
      } catch (error) {
        if (error instanceof JobProfitabilityTruthServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[job-profitability-truth]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Audit failed' } });
      }
    },
  );

  router.post(
    '/job-profitability-truth/jobs/:jobId',
    requireAnyPermission('finance:read', 'finance:write', 'jobs:profitability', '*'),
    async (req, res) => {
      try {
        const jobId = z.string().uuid().parse(req.params.jobId);
        const body = z
          .object({ clientActionId: z.string().trim().min(1).max(120).nullable().optional() })
          .parse(req.body ?? {});
        const data = await jobProfitabilityTruthService.resolveJob(toActor(getAuth(req)), {
          jobId,
          clientActionId: body.clientActionId,
        });
        res.status(data.idempotentReplay ? 200 : 201).json({ data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
          return;
        }
        if (error instanceof JobProfitabilityTruthServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[job-profitability-truth]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Resolve failed' } });
      }
    },
  );

  return router;
}
