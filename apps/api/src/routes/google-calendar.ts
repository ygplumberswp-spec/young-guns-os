import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { applyStaffOwnerGuards } from '../middleware/staff-owner-guard.js';
import { canReadSchedulingCalendar } from '../services/scheduling-access.js';
import type { SchedulingAuthContext } from '../services/scheduling-access.js';
import {
  GoogleCalendarError,
  type GoogleCalendarActor,
  type GoogleCalendarService,
} from '../services/google-calendar.service.js';
import {
  GoogleCalendarOAuthError,
  mapGoogleCalendarOAuthError,
  type GoogleCalendarOAuthService,
} from '../services/google-calendar-oauth.service.js';
import { GoogleCalendarClientError } from '../lib/google-calendar.client.js';

const startOAuthSchema = z.object({
  returnPath: z.string().trim().max(500).optional().nullable(),
});

const updateConnectionSchema = z.object({
  autoSyncEnabled: z.boolean().optional(),
  pushJobsEnabled: z.boolean().optional(),
  importEventsEnabled: z.boolean().optional(),
  defaultPrivacyMode: z.enum(['busy_only', 'limited_details', 'approved_details']).optional(),
});

const updateCalendarSchema = z.object({
  selected: z.boolean().optional(),
  syncDirection: z.enum(['disabled', 'push_only', 'import_only', 'two_way']).optional(),
  privacyMode: z.enum(['busy_only', 'limited_details', 'approved_details']).optional(),
});

const technicianMappingSchema = z.object({
  userId: z.string().uuid(),
  calendarId: z.string().uuid(),
  pushAssignedJobs: z.boolean().optional(),
});

const convertEventSchema = z.object({
  target: z.enum(['job', 'quote', 'inspection', 'meeting', 'reminder']),
  customerId: z.string().uuid().optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
  title: z.string().trim().max(300).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
});

const resolveConflictSchema = z.object({
  status: z.enum(['acknowledged', 'resolved', 'dismissed']),
  note: z.string().trim().max(1000).optional().nullable(),
});

type GoogleCalendarRouterDeps = {
  googleCalendarService: GoogleCalendarService;
  googleCalendarOAuthService: GoogleCalendarOAuthService;
  teamService: import('../services/team.service.js').TeamService;
  db: import('@titan/db').DatabaseClient;
  appUrl: string;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(auth: AuthenticatedRequest['auth']): GoogleCalendarActor {
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
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

function normalizeQueryValue(value: unknown): string | string[] | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    return value as string[];
  }
  return undefined;
}

export function createGoogleCalendarRouter({
  googleCalendarService,
  googleCalendarOAuthService,
  teamService,
  db,
  appUrl,
  jwtSecret,
  authService,
}: GoogleCalendarRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  /**
   * Google redirects the browser here, so it cannot carry a TITAN bearer token.
   * Trust comes from the single-use OAuth state row instead, which is why this is
   * mounted before requireAuth.
   */
  router.get('/oauth/callback', async (req, res) => {
    try {
      const redirectUrl = await googleCalendarOAuthService.handleOAuthCallback({
        code: normalizeQueryValue(req.query.code),
        state: normalizeQueryValue(req.query.state),
        error: normalizeQueryValue(req.query.error),
        errorDescription: normalizeQueryValue(req.query.error_description),
        scope: normalizeQueryValue(req.query.scope),
      });
      res.redirect(redirectUrl);
    } catch {
      const fallback = new URL('/integrations/google-calendar', appUrl);
      fallback.searchParams.set('googleCalendar', 'error');
      fallback.searchParams.set(
        'message',
        'Unable to complete Google Calendar sign-in. Try again from Settings.',
      );
      res.redirect(fallback.toString());
    }
  });

  router.use(requireAuth);
  applyStaffOwnerGuards(router, db);
  router.use(async (req, _res, next) => {
    const { companyId } = getAuth(req);
    await teamService.ensureDefaultRoles(companyId);
    next();
  });

  // ---------------------------------------------------------- status/settings

  router.get(
    '/status',
    requireAnyPermission('integrations:read', 'integrations:manage', 'dispatch:read', 'dispatch:write'),
    async (req, res) => {
      try {
        const status = await googleCalendarService.getConnectionStatus(getAuth(req).companyId);
        res.json({ data: status });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.get(
    '/settings',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      try {
        const settings = await googleCalendarService.getSettings(getAuth(req).companyId);
        res.json({ data: settings });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.patch(
    '/settings',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const parsed = updateConnectionSchema.safeParse(req.body);
      if (!parsed.success) {
        respondValidationError(res, 'Invalid Google Calendar settings payload', parsed.error);
        return;
      }

      try {
        const status = await googleCalendarService.updateConnectionSettings(
          toActor(getAuth(req)),
          parsed.data,
        );
        res.json({ data: status });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  // ------------------------------------------------------------------- OAuth

  router.post(
    '/oauth/start',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const parsed = startOAuthSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        respondValidationError(res, 'Invalid Google Calendar OAuth start payload', parsed.error);
        return;
      }

      const auth = getAuth(req);
      try {
        const result = await googleCalendarOAuthService.startOAuth({
          companyId: auth.companyId,
          userId: auth.userId,
          returnPath: parsed.data.returnPath ?? null,
        });
        res.json({ data: result });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    '/oauth/disconnect',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const auth = getAuth(req);
      try {
        await googleCalendarOAuthService.disconnect(auth.companyId, auth.userId);
        const status = await googleCalendarService.getConnectionStatus(auth.companyId);
        res.json({ data: status });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  // --------------------------------------------------------------- calendars

  router.get(
    '/calendars',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      try {
        const calendars = await googleCalendarService.listCalendars(getAuth(req).companyId);
        res.json({ data: { calendars } });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    '/calendars/refresh',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      try {
        const calendars = await googleCalendarService.refreshCalendarList(toActor(getAuth(req)));
        res.json({ data: { calendars } });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.patch(
    '/calendars/:calendarId',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const parsed = updateCalendarSchema.safeParse(req.body);
      if (!parsed.success) {
        respondValidationError(res, 'Invalid calendar update payload', parsed.error);
        return;
      }

      try {
        const calendar = await googleCalendarService.updateCalendar(
          toActor(getAuth(req)),
          getRouteParam(req.params.calendarId),
          parsed.data,
        );
        res.json({ data: { calendar } });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  // ----------------------------------------------------- technician mappings

  router.get(
    '/technician-mappings',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      try {
        const mappings = await googleCalendarService.listTechnicianMappings(
          getAuth(req).companyId,
        );
        res.json({ data: { mappings } });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.put(
    '/technician-mappings',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const parsed = technicianMappingSchema.safeParse(req.body);
      if (!parsed.success) {
        respondValidationError(res, 'Invalid technician calendar mapping payload', parsed.error);
        return;
      }

      try {
        const mappings = await googleCalendarService.setTechnicianMapping(
          toActor(getAuth(req)),
          parsed.data,
        );
        res.json({ data: { mappings } });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.delete(
    '/technician-mappings/:mappingId',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      try {
        const mappings = await googleCalendarService.removeTechnicianMapping(
          toActor(getAuth(req)),
          getRouteParam(req.params.mappingId),
        );
        res.json({ data: { mappings } });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  // -------------------------------------------------------------------- sync

  router.post(
    '/sync',
    requireAnyPermission('integrations:manage', 'dispatch:write'),
    async (req, res) => {
      const auth = getAuth(req);
      try {
        const outcome = await googleCalendarService.sync({
          companyId: auth.companyId,
          userId: auth.userId,
          trigger: 'manual',
        });
        res.json({ data: outcome });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.get(
    '/sync-runs',
    requireAnyPermission('integrations:read', 'integrations:manage', 'dispatch:read', 'dispatch:write'),
    async (req, res) => {
      const limit = Number.parseInt(String(req.query.limit ?? '20'), 10);
      try {
        const runs = await googleCalendarService.listSyncRuns(
          getAuth(req).companyId,
          Number.isFinite(limit) ? limit : 20,
        );
        res.json({ data: { runs } });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  // ---------------------------------------------------------------- calendar

  /**
   * The merged calendar. Access mirrors the TITAN scheduling calendar exactly, so
   * connecting Google cannot widen who can see the schedule.
   */
  router.get('/calendar', async (req, res) => {
    const auth = getAuth(req);
    if (!canReadSchedulingCalendar(auth.permissions)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Scheduling calendar access denied' },
      });
      return;
    }

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
        error: { code: 'VALIDATION_ERROR', message: 'Invalid calendar date range' },
      });
      return;
    }

    try {
      const calendar = await googleCalendarService.getUnifiedCalendar(
        auth.companyId,
        from,
        to,
        toSchedulingAuth(auth),
      );
      res.json({ data: calendar });
    } catch (error) {
      handleError(res, error);
    }
  });

  // --------------------------------------------------------- external events

  router.get(
    '/external-events',
    requireAnyPermission('dispatch:read', 'dispatch:write'),
    async (req, res) => {
      const fromParam = typeof req.query.from === 'string' ? new Date(req.query.from) : undefined;
      const toParam = typeof req.query.to === 'string' ? new Date(req.query.to) : undefined;

      try {
        const events = await googleCalendarService.listExternalEvents(getAuth(req).companyId, {
          from: fromParam && !Number.isNaN(fromParam.getTime()) ? fromParam : undefined,
          to: toParam && !Number.isNaN(toParam.getTime()) ? toParam : undefined,
          includeConverted: req.query.includeConverted === 'true',
        });
        res.json({ data: { events } });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    '/external-events/:externalEventId/convert',
    requireAnyPermission('dispatch:write'),
    async (req, res) => {
      const parsed = convertEventSchema.safeParse(req.body);
      if (!parsed.success) {
        respondValidationError(res, 'Invalid conversion payload', parsed.error);
        return;
      }

      try {
        const event = await googleCalendarService.convertExternalEvent(
          toActor(getAuth(req)),
          getRouteParam(req.params.externalEventId),
          parsed.data,
        );
        res.status(201).json({ data: { event } });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    '/external-events/:externalEventId/dismiss',
    requireAnyPermission('dispatch:write'),
    async (req, res) => {
      try {
        await googleCalendarService.dismissExternalEvent(
          toActor(getAuth(req)),
          getRouteParam(req.params.externalEventId),
        );
        res.status(204).send();
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  // --------------------------------------------------------------- conflicts

  router.get(
    '/conflicts',
    requireAnyPermission('dispatch:read', 'dispatch:write', 'integrations:read', 'integrations:manage'),
    async (req, res) => {
      try {
        const conflicts = await googleCalendarService.listConflicts(getAuth(req).companyId, {
          includeResolved: req.query.includeResolved === 'true',
        });
        res.json({ data: { conflicts } });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    '/conflicts/:conflictId/resolve',
    requireAnyPermission('dispatch:write'),
    async (req, res) => {
      const parsed = resolveConflictSchema.safeParse(req.body);
      if (!parsed.success) {
        respondValidationError(res, 'Invalid conflict resolution payload', parsed.error);
        return;
      }

      try {
        const conflict = await googleCalendarService.resolveConflict(
          toActor(getAuth(req)),
          getRouteParam(req.params.conflictId),
          parsed.data,
        );
        res.json({ data: { conflict } });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  return router;
}

function respondValidationError(res: Response, message: string, error: z.ZodError): void {
  res.status(400).json({
    error: { code: 'VALIDATION_ERROR', message, details: error.flatten() },
  });
}

function handleError(res: Response, error: unknown): void {
  if (error instanceof GoogleCalendarError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'NOT_CONNECTED'
          ? 409
          : error.code === 'ALREADY_CONVERTED'
            ? 409
            : error.code === 'READ_ONLY_CALENDAR'
              ? 422
              : 400;

    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }

  if (error instanceof GoogleCalendarOAuthError || error instanceof GoogleCalendarClientError) {
    const mapped = mapGoogleCalendarOAuthError(error);
    res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    return;
  }

  throw error;
}
