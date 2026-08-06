import { Router } from 'express';
import { z } from 'zod';
import type { SchedulingService } from '../services/scheduling.service.js';
import { SchedulingError } from '../services/scheduling.service.js';
import {
  BusinessDayTimelineError,
  BusinessDayTimelineService,
} from '../services/business-day-timeline.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { applyStaffOwnerGuards } from '../middleware/staff-owner-guard.js';
import { canReadSchedulingCalendar } from '../services/scheduling-access.js';
import type { SchedulingAuthContext } from '../services/scheduling-access.js';

const scheduleJobSchema = z.object({
  scheduledAt: z.string().datetime(),
  scheduledEndAt: z.string().datetime().optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
  overrideReason: z.string().optional().nullable(),
  acknowledgeConflicts: z.boolean().optional(),
});

const updateScheduleSchema = z.object({
  scheduledAt: z.string().datetime().optional().nullable(),
  scheduledEndAt: z.string().datetime().optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
  clearSchedule: z.boolean().optional(),
  overrideReason: z.string().optional().nullable(),
  acknowledgeConflicts: z.boolean().optional(),
});

const conflictCheckSchema = z.object({
  jobId: z.string().uuid().optional().nullable(),
  scheduledAt: z.string().datetime(),
  scheduledEndAt: z.string().datetime().optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
  durationMinutes: z.number().int().positive().optional().nullable(),
});

const calendarPatchSchema = z.object({
  scheduledAt: z.string().datetime(),
  scheduledEndAt: z.string().datetime().optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
  overrideReason: z.string().optional().nullable(),
  acknowledgeConflicts: z.boolean().optional(),
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

function toSchedulingAuth(auth: AuthenticatedRequest['auth']): SchedulingAuthContext {
  return {
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function requireCalendarRead(req: import('express').Request, res: import('express').Response) {
  const auth = getAuth(req);
  if (!canReadSchedulingCalendar(auth.permissions)) {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Scheduling calendar access denied',
      },
    });
    return null;
  }
  return auth;
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

  router.get(
    '/assignees',
    requireAnyPermission('dispatch:read', 'dispatch:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const assignees = await schedulingService.listAssignees(companyId);
      res.json({ data: { assignees } });
    },
  );

  router.get('/calendar', async (req, res) => {
    const auth = requireCalendarRead(req, res);
    if (!auth) return;

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

    const filters = {
      technicianId: typeof req.query.technicianId === 'string' ? req.query.technicianId : null,
      status: typeof req.query.status === 'string' ? req.query.status : null,
      suburb: typeof req.query.suburb === 'string' ? req.query.suburb : null,
      priority: typeof req.query.priority === 'string' ? req.query.priority : null,
    };

    try {
      const calendar = await schedulingService.getCalendar(
        auth.companyId,
        from,
        to,
        toSchedulingAuth(auth),
        filters,
      );
      res.json({ data: calendar });
    } catch (error) {
      handleSchedulingError(res, error);
    }
  });

  router.post('/calendar/conflicts', async (req, res) => {
    const auth = requireCalendarRead(req, res);
    if (!auth) return;

    const parsed = conflictCheckSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid conflict check payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const result = await schedulingService
        .getConflictService()
        .checkConflicts(auth.companyId, toSchedulingAuth(auth), parsed.data);
      res.json({ data: result });
    } catch (error) {
      handleSchedulingError(res, error);
    }
  });

  router.patch('/calendar/:jobId', requireAnyPermission('dispatch:write'), async (req, res) => {
    const auth = getAuth(req);
    const parsed = calendarPatchSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid calendar patch payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const event = await schedulingService.updateSchedule(
        auth.companyId,
        getRouteParam(req.params.jobId),
        parsed.data,
        toSchedulingAuth(auth),
      );
      res.json({ data: { event } });
    } catch (error) {
      handleSchedulingError(res, error);
    }
  });

  router.get(
    '/day-timeline',
    requireAnyPermission('dispatch:read', 'dispatch:write', 'workforce:read'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const dateParam = typeof req.query.date === 'string' ? req.query.date : null;
      const userIdParam = typeof req.query.userId === 'string' ? req.query.userId : null;

      if (!dateParam) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Day timeline requires a date query parameter (YYYY-MM-DD)',
          },
        });
        return;
      }

      const timelineService = new BusinessDayTimelineService(db);

      try {
        const timeline = await timelineService.getDayTimeline(companyId, dateParam, userIdParam);
        res.json({ data: timeline });
      } catch (error) {
        handleTimelineError(res, error);
      }
    },
  );

  router.post('/jobs/:jobId/schedule', requireAnyPermission('dispatch:write'), async (req, res) => {
    const auth = getAuth(req);
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
        auth.companyId,
        getRouteParam(req.params.jobId),
        parsed.data,
        toSchedulingAuth(auth),
      );
      res.status(201).json({ data: { event } });
    } catch (error) {
      handleSchedulingError(res, error);
    }
  });

  router.patch(
    '/jobs/:jobId/schedule',
    requireAnyPermission('dispatch:write'),
    async (req, res) => {
      const auth = getAuth(req);
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
          auth.companyId,
          getRouteParam(req.params.jobId),
          parsed.data,
          toSchedulingAuth(auth),
        );
        res.json({ data: { event } });
      } catch (error) {
        handleSchedulingError(res, error);
      }
    },
  );

  return router;
}

function handleTimelineError(res: import('express').Response, error: unknown) {
  if (error instanceof BusinessDayTimelineError) {
    res.status(error.code === 'VALIDATION_ERROR' ? 400 : 400).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  throw error;
}

function handleSchedulingError(res: import('express').Response, error: unknown) {
  if (error instanceof SchedulingError) {
    const status =
      error.code === 'NOT_FOUND' || error.code === 'ASSIGNEE_NOT_FOUND'
        ? 404
        : error.code === 'SCHEDULING_CONFLICT' || error.code === 'OVERRIDE_REASON_REQUIRED'
          ? 409
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
