import { Router } from 'express';
import { z } from 'zod';
import { validatePasswordStrength } from '@titan/auth';
import type { PortalAuthService } from '../services/portal-auth.service.js';
import type { PortalService } from '../services/portal.service.js';
import { PortalError } from '../services/portal.service.js';
import type { PortalExperienceService } from '../services/portal-experience.service.js';
import { PortalExperienceError } from '../services/portal-experience.service.js';
import type { PortalAuraService } from '../services/portal-aura.service.js';
import { PortalAuraError } from '../services/portal-aura.service.js';
import type { NotificationService } from '../services/notification.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  createPortalAuthMiddleware,
  requirePortalPermission,
  type PortalAuthenticatedRequest,
} from '../middleware/portal-auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const portalAccessPermissionSchema = z.enum([
  'portal.dashboard:read',
  'portal.jobs:read',
  'portal.quotes:read',
  'portal.invoices:read',
  'portal.documents:read',
  'portal.communications:read',
  'portal.appointments:read',
  'portal.knowledge:read',
  'portal.notifications:read',
  'portal.payments:read',
]);

const createPortalRequestSchema = z.object({
  requestType: z.enum([
    'quote_clarification',
    'quote_approval',
    'appointment_reschedule',
    'appointment_cancellation',
    'appointment_confirmation',
    'support_message',
    'general_request',
  ]),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(4000),
  entityType: z.string().trim().max(50).optional().nullable(),
  entityId: z.string().uuid().optional().nullable(),
  payload: z.record(z.unknown()).optional(),
  clientActionId: z.string().trim().min(1).max(200).optional().nullable(),
});

const acceptQuoteSchema = z.object({
  clientActionId: z.string().trim().min(1).max(200),
  accepterName: z.string().trim().min(1).max(200),
  acknowledgeScope: z.literal(true), acknowledgeExclusions: z.literal(true), acknowledgePrice: z.literal(true),
  acknowledgeVat: z.literal(true), acknowledgePaymentTerms: z.literal(true), acknowledgeValidity: z.literal(true),
  typedSignature: z.string().trim().max(500).optional().nullable(),
});
const declineQuoteSchema = z.object({
  clientActionId: z.string().trim().min(1).max(200),
  decision: z.enum(['declined', 'change_requested']),
  reason: z.string().trim().min(1).max(2000),
  message: z.string().trim().max(4000).optional().nullable(),
});

const notificationPreferencesSchema = z.object({
  preferences: z.array(
    z.object({
      notificationType: z.enum([
        'job_assigned',
        'schedule_changed',
        'approval_request',
        'invoice_reminder',
        'system_alert',
        'job_update',
        'quote_update',
        'appointment_update',
        'support_update',
      ]),
      enabled: z.boolean(),
    }),
  ),
});

const createPortalUserSchema = z.object({
  customerId: z.string().uuid(),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  permissions: z.array(portalAccessPermissionSchema).optional(),
});

const updatePortalUserSchema = z.object({
  email: z.string().trim().email().optional(),
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  isActive: z.boolean().optional(),
  permissions: z.array(portalAccessPermissionSchema).optional(),
});

const createPortalInviteSchema = z.object({
  email: z.string().trim().email(),
  permissions: z.array(portalAccessPermissionSchema).optional(),
});

type PortalRouterDeps = {
  portalService: PortalService;
  portalExperienceService: PortalExperienceService;
  portalAuraService: PortalAuraService;
  notificationService: NotificationService;
  portalAuthService: PortalAuthService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function getPortalAuth(req: import('express').Request) {
  return (req as PortalAuthenticatedRequest).portalAuth;
}

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function portalScope(req: import('express').Request) {
  const auth = getPortalAuth(req);
  return {
    companyId: auth.companyId,
    customerId: auth.customerId,
    portalUserId: auth.portalUserId,
    permissions: auth.permissions,
  };
}

export function createPortalRouter({
  portalService,
  portalExperienceService,
  portalAuraService,
  notificationService,
  portalAuthService,
  teamService,
  jwtSecret,
  authService,
}: PortalRouterDeps): Router {
  const router = Router();
  const requireStaffAuth = createAuthMiddleware({ jwtSecret, authService });
  const requirePortalAuth = createPortalAuthMiddleware({ jwtSecret, portalAuthService });

  router.get(
    '/dashboard',
    requirePortalAuth,
    requirePortalPermission('portal.dashboard:read'),
    async (req, res) => {
      const auth = getPortalAuth(req);

      try {
        const dashboard = await portalService.getDashboard({
          companyId: auth.companyId,
          customerId: auth.customerId,
          permissions: auth.permissions,
        });
        res.json({ data: dashboard });
      } catch (error) {
        handlePortalError(res, error);
      }
    },
  );

  router.get(
    '/experience/dashboard',
    requirePortalAuth,
    requirePortalPermission('portal.dashboard:read'),
    async (req, res) => {
      try {
        const dashboard = await portalExperienceService.getExperienceDashboard(portalScope(req));
        res.json({ data: { dashboard } });
      } catch (error) {
        handlePortalExperienceError(res, error);
      }
    },
  );

  router.get(
    '/jobs',
    requirePortalAuth,
    requirePortalPermission('portal.jobs:read'),
    async (req, res) => {
      try {
        const jobs = await portalExperienceService.listJobs(portalScope(req));
        res.json({ data: jobs });
      } catch (error) {
        handlePortalExperienceError(res, error);
      }
    },
  );

  router.get(
    '/jobs/:jobId',
    requirePortalAuth,
    requirePortalPermission('portal.jobs:read'),
    async (req, res) => {
      try {
        const job = await portalExperienceService.getJobTracking(
          portalScope(req),
          getRouteParam(req.params.jobId),
        );
        if (!job) {
          res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
          return;
        }
        res.json({ data: { job } });
      } catch (error) {
        handlePortalExperienceError(res, error);
      }
    },
  );

  router.get(
    '/quotes',
    requirePortalAuth,
    requirePortalPermission('portal.quotes:read'),
    async (req, res) => {
      try {
        const quotes = await portalExperienceService.listQuotes(portalScope(req));
        res.json({ data: { quotes } });
      } catch (error) {
        handlePortalExperienceError(res, error);
      }
    },
  );

  router.get(
    '/quotes/:quoteId',
    requirePortalAuth,
    requirePortalPermission('portal.quotes:read'),
    async (req, res) => {
      try {
        const quote = await portalExperienceService.getQuote(
          portalScope(req),
          getRouteParam(req.params.quoteId),
        );
        if (!quote) {
          res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Quote not found' } });
          return;
        }
        res.json({ data: { quote } });
      } catch (error) {
        handlePortalExperienceError(res, error);
      }
    },
  );

  router.post('/quotes/:quoteId/accept', requirePortalAuth, requirePortalPermission('portal.quotes:read'), async (req, res) => {
    const parsed = acceptQuoteSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid acceptance payload', details: parsed.error.flatten() } }); return; }
    try {
      const acceptance = await portalExperienceService.acceptQuote(portalScope(req), getRouteParam(req.params.quoteId), parsed.data, { ipAddress: req.ip, userAgent: req.get('user-agent') ?? null });
      res.status(201).json({ data: { acceptance } });
    } catch (error) { handlePortalExperienceError(res, error); }
  });
  router.post('/quotes/:quoteId/decline', requirePortalAuth, requirePortalPermission('portal.quotes:read'), async (req, res) => {
    const parsed = declineQuoteSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid decline payload', details: parsed.error.flatten() } }); return; }
    try {
      const acceptance = await portalExperienceService.declineQuote(portalScope(req), getRouteParam(req.params.quoteId), parsed.data, { ipAddress: req.ip, userAgent: req.get('user-agent') ?? null });
      res.status(201).json({ data: { acceptance } });
    } catch (error) { handlePortalExperienceError(res, error); }
  });

  router.get(
    '/finance',
    requirePortalAuth,
    requirePortalPermission('portal.invoices:read'),
    async (req, res) => {
      try {
        const finance = await portalExperienceService.getFinanceCentre(portalScope(req));
        res.json({ data: { finance } });
      } catch (error) {
        handlePortalExperienceError(res, error);
      }
    },
  );

  router.get(
    '/appointments',
    requirePortalAuth,
    requirePortalPermission('portal.appointments:read'),
    async (req, res) => {
      try {
        const appointments = await portalExperienceService.listAppointments(portalScope(req));
        res.json({ data: { appointments } });
      } catch (error) {
        handlePortalExperienceError(res, error);
      }
    },
  );

  router.get(
    '/communications',
    requirePortalAuth,
    requirePortalPermission('portal.communications:read'),
    async (req, res) => {
      try {
        const communications = await portalExperienceService.getCommunicationsCentre(
          portalScope(req),
        );
        res.json({ data: { communications } });
      } catch (error) {
        handlePortalExperienceError(res, error);
      }
    },
  );

  router.get(
    '/knowledge/search',
    requirePortalAuth,
    requirePortalPermission('portal.knowledge:read'),
    async (req, res) => {
      const query = String(req.query.q ?? '').trim();
      try {
        const results = await portalExperienceService.searchKnowledge(portalScope(req), { query });
        res.json({ data: { results } });
      } catch (error) {
        handlePortalExperienceError(res, error);
      }
    },
  );

  router.get(
    '/notifications',
    requirePortalAuth,
    requirePortalPermission('portal.notifications:read'),
    async (req, res) => {
      const scope = portalScope(req);
      const notifications = await notificationService.listForPortal({
        companyId: scope.companyId,
        portalUserId: scope.portalUserId,
      });
      res.json({ data: { notifications } });
    },
  );

  router.patch(
    '/notifications/:notificationId/read',
    requirePortalAuth,
    requirePortalPermission('portal.notifications:read'),
    async (req, res) => {
      const scope = portalScope(req);
      const updated = await notificationService.markReadPortal(
        { companyId: scope.companyId, portalUserId: scope.portalUserId },
        getRouteParam(req.params.notificationId),
      );
      if (!updated) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Notification not found' } });
        return;
      }
      res.json({ data: { read: true } });
    },
  );

  router.get(
    '/notifications/preferences',
    requirePortalAuth,
    requirePortalPermission('portal.notifications:read'),
    async (req, res) => {
      const scope = portalScope(req);
      const preferences = await notificationService.getPortalPreferences({
        companyId: scope.companyId,
        portalUserId: scope.portalUserId,
      });
      res.json({ data: { preferences } });
    },
  );

  router.patch(
    '/notifications/preferences',
    requirePortalAuth,
    requirePortalPermission('portal.notifications:read'),
    async (req, res) => {
      const scope = portalScope(req);
      const parsed = notificationPreferencesSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid preferences payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }
      const preferences = await notificationService.updatePortalPreferences(
        { companyId: scope.companyId, portalUserId: scope.portalUserId },
        parsed.data,
      );
      res.json({ data: { preferences } });
    },
  );

  router.get('/requests', requirePortalAuth, async (req, res) => {
    try {
      const requests = await portalExperienceService.listCustomerRequests(portalScope(req));
      res.json({ data: { requests } });
    } catch (error) {
      handlePortalExperienceError(res, error);
    }
  });

  router.post('/requests', requirePortalAuth, async (req, res) => {
    const parsed = createPortalRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }
    try {
      const request = await portalExperienceService.createCustomerRequest(
        portalScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { request } });
    } catch (error) {
      handlePortalExperienceError(res, error);
    }
  });

  router.get(
    '/aura/context',
    requirePortalAuth,
    requirePortalPermission('portal.dashboard:read'),
    async (req, res) => {
      try {
        const context = await portalExperienceService.buildPortalAuraContext(portalScope(req));
        res.json({ data: { context } });
      } catch (error) {
        handlePortalExperienceError(res, error);
      }
    },
  );

  router.post(
    '/aura/chat',
    requirePortalAuth,
    requirePortalPermission('portal.dashboard:read'),
    async (req, res) => {
      const parsed = z
        .object({
          content: z.string().trim().min(1).max(4000),
          pageContext: z.object({
            route: z.string().trim().min(1).max(300),
            module: z.string().trim().min(1).max(80),
            recordType: z.string().trim().max(80).optional(),
            recordId: z.string().uuid().optional(),
            customerId: z.string().uuid().optional(),
            jobId: z.string().uuid().optional(),
          }),
          history: z
            .array(
              z.object({
                role: z.enum(['user', 'assistant']),
                content: z.string().trim().min(1).max(8000),
              }),
            )
            .max(8)
            .optional(),
        })
        .safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid AURA chat payload' } });
        return;
      }

      try {
        const result = await portalAuraService.sendChatMessage(portalScope(req), parsed.data);
        res.json({ data: result });
      } catch (error) {
        handlePortalAuraError(res, error);
      }
    },
  );

  router.get('/permissions/catalog', requireStaffAuth, async (_req, res) => {
    res.json({ data: { permissions: portalService.getAccessPermissionCatalog() } });
  });

  router.get(
    '/stats',
    requireStaffAuth,
    requireAnyPermission('portal:read', 'portal:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      await teamService.ensureDefaultRoles(companyId);
      const stats = await portalService.getStats(companyId);
      res.json({ data: stats });
    },
  );

  router.get(
    '/users',
    requireStaffAuth,
    requireAnyPermission('portal:read', 'portal:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      await teamService.ensureDefaultRoles(companyId);
      const users = await portalService.listPortalUsers(companyId);
      res.json({ data: { users } });
    },
  );

  router.post(
    '/users',
    requireStaffAuth,
    requireAnyPermission('portal:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      await teamService.ensureDefaultRoles(companyId);
      const parsed = createPortalUserSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid portal user payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      const passwordError = validatePasswordStrength(parsed.data.password);

      if (passwordError) {
        res.status(400).json({
          error: {
            code: 'WEAK_PASSWORD',
            message: passwordError,
          },
        });
        return;
      }

      try {
        const user = await portalService.createPortalUser(companyId, parsed.data);
        res.status(201).json({ data: { user } });
      } catch (error) {
        handlePortalError(res, error);
      }
    },
  );

  router.get(
    '/users/:id',
    requireStaffAuth,
    requireAnyPermission('portal:read', 'portal:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      await teamService.ensureDefaultRoles(companyId);
      const user = await portalService.getPortalUser(companyId, getRouteParam(req.params.id));

      if (!user) {
        res.status(404).json({
          error: {
            code: 'PORTAL_USER_NOT_FOUND',
            message: 'Portal user not found',
          },
        });
        return;
      }

      res.json({ data: { user } });
    },
  );

  router.patch(
    '/users/:id',
    requireStaffAuth,
    requireAnyPermission('portal:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      await teamService.ensureDefaultRoles(companyId);
      const parsed = updatePortalUserSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid portal user payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const user = await portalService.updatePortalUser(
          companyId,
          getRouteParam(req.params.id),
          parsed.data,
        );
        res.json({ data: { user } });
      } catch (error) {
        handlePortalError(res, error);
      }
    },
  );

  router.post(
    '/users/:id/revoke-access',
    requireStaffAuth,
    requireAnyPermission('portal:manage'),
    async (req, res) => {
      const auth = getAuth(req);
      try {
        const user = await portalService.revokePortalUserAccess(
          { companyId: auth.companyId, userId: auth.userId },
          getRouteParam(req.params.id),
        );
        res.json({ data: { user } });
      } catch (error) {
        handlePortalError(res, error);
      }
    },
  );

  router.get(
    '/customers/:customerId/access',
    requireStaffAuth,
    requireAnyPermission('portal:read', 'portal:manage', 'customers:read', 'customers:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const access = await portalService.getCustomerPortalAccess(
        companyId,
        getRouteParam(req.params.customerId),
      );
      res.json({ data: access });
    },
  );

  router.post(
    '/customers/:customerId/invites',
    requireStaffAuth,
    requireAnyPermission('portal:manage', 'customers:write'),
    async (req, res) => {
      const auth = getAuth(req);
      const parsed = createPortalInviteSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid portal invitation payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const result = await portalService.createCustomerPortalInvite(
          { companyId: auth.companyId, userId: auth.userId },
          {
            customerId: getRouteParam(req.params.customerId),
            email: parsed.data.email,
            permissions: parsed.data.permissions,
          },
        );
        res.status(201).json({ data: result });
      } catch (error) {
        handlePortalError(res, error);
      }
    },
  );

  router.delete(
    '/customers/:customerId/invites/:inviteId',
    requireStaffAuth,
    requireAnyPermission('portal:manage', 'customers:write'),
    async (req, res) => {
      const auth = getAuth(req);
      try {
        await portalService.revokeCustomerPortalInvite(
          { companyId: auth.companyId, userId: auth.userId },
          getRouteParam(req.params.customerId),
          getRouteParam(req.params.inviteId),
        );
        res.json({ data: { success: true } });
      } catch (error) {
        handlePortalError(res, error);
      }
    },
  );

  return router;
}

function handlePortalError(res: import('express').Response, error: unknown) {
  if (error instanceof PortalError) {
    const status =
      error.code === 'PORTAL_USER_NOT_FOUND' || error.code === 'CUSTOMER_NOT_FOUND'
        ? 404
        : error.code === 'EMAIL_IN_USE' || error.code === 'PORTAL_USER_EXISTS'
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

function handlePortalExperienceError(res: import('express').Response, error: unknown) {
  if (error instanceof PortalExperienceError) {
    const status =
      error.code === 'NOT_FOUND' || error.code === 'CUSTOMER_NOT_FOUND'
        ? 404
        : error.code === 'FORBIDDEN'
          ? 403
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

function handlePortalAuraError(res: import('express').Response, error: unknown) {
  if (error instanceof PortalAuraError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'PROVIDER_NOT_CONFIGURED' || error.code === 'PROVIDER_ERROR'
          ? 503
          : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }

  throw error;
}
