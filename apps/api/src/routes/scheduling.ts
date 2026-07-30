import { Router } from 'express';
import { z } from 'zod';
import type { SchedulingService } from '../services/scheduling.service.js';
import { SchedulingError } from '../services/scheduling.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { applyStaffOwnerGuards } from '../middleware/staff-owner-guard.js';

const scheduleJobSchema = z.object({
  scheduledAt: z.string().datetime(),
  scheduledEndAt: z.string().datetime().optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
});

const updateScheduleSchema = z.object({
  scheduledAt: z.string().datetime().optional().nullable(),
  scheduledEndAt: z.string().datetime().optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
  clearSchedule: z.boolean().optional(),
});

type SchedulingRouterDeps = {
  schedulingService: SchedulingService;
  teamService: TeamService;
  db: import('@titan/db').DatabaseClient;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export function createSchedulingRouter({
  schedulingService,
  teamService,
  db,
  jwtSecret,
  authService,
}: SchedulingRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);
  applyStaffOwnerGuards(router, db);
  router.use(async (req, _res, next) => {
    const { companyId } = getAuth(req);
    await teamService.ensureDefaultRoles(companyId);
    next();
  });

  router.get('/stats', requireAnyPermission('dispatch:read', 'dispatch:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const stats = await schedulingService.getStats(companyId);
    res.json({ data: stats });
  });

  router.get('/assignees', requireAnyPermission('dispatch:read', 'dispatch:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const assignees = await schedulingService.listAssignees(companyId);
    res.json({ data: { assignees } });
  });

  router.get('/calendar', requireAnyPermission('dispatch:read', 'dispatch:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const fromParam = typeof req.query.from === 'string' ? req.query.from : null;
    const toParam = typeof req.query.to === 'string' ? req.query.to : null;

    if (!fromParam || !toParam) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Calendar requires from and to query parameters',
        },
      });
      return;
    }

    const from = new Date(fromParam);
    const to = new Date(toParam);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid calendar date range',
        },
      });
      return;
    }

    try {
      const calendar = await schedulingService.getCalendar(companyId, from, to);
      res.json({ data: calendar });
    } catch (error) {
      handleSchedulingError(res, error);
    }
  });

  router.post(
    '/jobs/:jobId/schedule',
    requireAnyPermission('dispatch:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const parsed = scheduleJobSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid schedule payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const event = await schedulingService.scheduleJob(
          companyId,
          getRouteParam(req.params.jobId),
          parsed.data,
        );
        res.status(201).json({ data: { event } });
      } catch (error) {
        handleSchedulingError(res, error);
      }
    },
  );

  router.patch(
    '/jobs/:jobId/schedule',
    requireAnyPermission('dispatch:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const parsed = updateScheduleSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid schedule payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const event = await schedulingService.updateSchedule(
          companyId,
          getRouteParam(req.params.jobId),
          parsed.data,
        );
        res.json({ data: { event } });
      } catch (error) {
        handleSchedulingError(res, error);
      }
    },
  );

  return router;
}

function handleSchedulingError(res: import('express').Response, error: unknown) {
  if (error instanceof SchedulingError) {
    const status =
      error.code === 'NOT_FOUND' || error.code === 'ASSIGNEE_NOT_FOUND'
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
