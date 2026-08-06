import { Router } from 'express';
import { z } from 'zod';
import type { PortalExpansionService } from '../services/portal-expansion.service.js';
import { PortalExpansionError } from '../services/portal-expansion.service.js';
import type { PortalAuthService } from '../services/portal-auth.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  createPortalAuthMiddleware,
  requirePortalPermission,
  type PortalAuthenticatedRequest,
} from '../middleware/portal-auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

type RouterDeps = {
  portalExpansionService: PortalExpansionService;
  portalAuthService: PortalAuthService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getPortalAuth(req: import('express').Request) {
  return (req as PortalAuthenticatedRequest).portalAuth;
}

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
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

function staffActor(req: import('express').Request) {
  const auth = getAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function param(req: import('express').Request, key: string): string {
  const raw = req.params[key];
  return String(Array.isArray(raw) ? raw[0] : raw ?? '');
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof PortalExpansionError) {
    const status =
      error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

const bookingSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  preferredDate: z.string().trim().max(40).optional().nullable(),
  preferredTimeWindow: z.string().trim().max(120).optional().nullable(),
  jobNotes: z.string().trim().max(4000).optional().nullable(),
  propertyId: z.string().uuid().optional().nullable(),
});

const shareSchema = z.object({
  documentId: z.string().uuid(),
  customerId: z.string().uuid(),
});

/**
 * Customer Portal Expansion routes.
 * Mounted at /api/v1/portal/expansion
 */
export function createPortalExpansionRouter({
  portalExpansionService,
  portalAuthService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requirePortalAuth = createPortalAuthMiddleware({ jwtSecret, portalAuthService });
  const requireStaffAuth = createAuthMiddleware({ jwtSecret, authService });

  router.get(
    '/hub',
    requirePortalAuth,
    requirePortalPermission('portal.dashboard:read'),
    async (req, res) => {
      try {
        const hub = await portalExpansionService.getHub(portalScope(req));
        res.json({
          data: { hub },
          meta: {
            invented: false as const,
            ownDataOnly: true as const,
            marginsHidden: true as const,
            xeroInternalsHidden: true as const,
            onlinePayAvailable: false as const,
          },
        });
      } catch (error) {
        if (!handleError(res, error)) throw error;
      }
    },
  );

  router.get('/jobs', requirePortalAuth, requirePortalPermission('portal.jobs:read'), async (req, res) => {
    try {
      const jobs = await portalExpansionService.listJobs(portalScope(req));
      res.json({
        data: { jobs },
        meta: { invented: false as const, ownDataOnly: true as const, internalNotesHidden: true as const },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/jobs/:jobId', requirePortalAuth, requirePortalPermission('portal.jobs:read'), async (req, res) => {
    try {
      const detail = await portalExpansionService.getJobDetail(portalScope(req), param(req, 'jobId'));
      if (!detail) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
        return;
      }
      res.json({
        data: { detail },
        meta: { invented: false as const, ownDataOnly: true as const, internalNotesHidden: true as const },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/quotes', requirePortalAuth, requirePortalPermission('portal.quotes:read'), async (req, res) => {
    try {
      const quotes = await portalExpansionService.listQuotes(portalScope(req));
      res.json({
        data: { quotes },
        meta: {
          invented: false as const,
          ownDataOnly: true as const,
          marginsHidden: true as const,
          costsHidden: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/quotes/:quoteId', requirePortalAuth, requirePortalPermission('portal.quotes:read'), async (req, res) => {
    try {
      const quote = await portalExpansionService.getQuote(portalScope(req), param(req, 'quoteId'));
      if (!quote) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Quote not found' } });
        return;
      }
      res.json({
        data: { quote },
        meta: {
          invented: false as const,
          ownDataOnly: true as const,
          marginsHidden: true as const,
          costsHidden: true as const,
          internalNotesHidden: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/finance', requirePortalAuth, requirePortalPermission('portal.invoices:read'), async (req, res) => {
    try {
      const finance = await portalExpansionService.getFinance(portalScope(req));
      res.json({
        data: { finance },
        meta: {
          invented: false as const,
          ownDataOnly: true as const,
          marginsHidden: true as const,
          xeroInternalsHidden: true as const,
          onlinePayAvailable: false as const,
          paymentStatusOnly: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/invoices/:invoiceId', requirePortalAuth, requirePortalPermission('portal.invoices:read'), async (req, res) => {
    try {
      const invoice = await portalExpansionService.getInvoice(portalScope(req), param(req, 'invoiceId'));
      if (!invoice) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } });
        return;
      }
      res.json({
        data: { invoice },
        meta: {
          invented: false as const,
          ownDataOnly: true as const,
          marginsHidden: true as const,
          xeroInternalsHidden: true as const,
          onlinePayAvailable: false as const,
          paymentStatusOnly: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/documents', requirePortalAuth, requirePortalPermission('portal.documents:read'), async (req, res) => {
    try {
      const documents = await portalExpansionService.listDocuments(portalScope(req));
      res.json({
        data: { documents },
        meta: { invented: false as const, ownDataOnly: true as const, sharedOnly: true as const },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/timeline', requirePortalAuth, requirePortalPermission('portal.communications:read'), async (req, res) => {
    try {
      const timeline = await portalExpansionService.getTimeline(portalScope(req));
      res.json({
        data: { timeline },
        meta: {
          invented: false as const,
          ownDataOnly: true as const,
          customerVisibleOnly: true as const,
          internalNotesHidden: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/appointments', requirePortalAuth, requirePortalPermission('portal.appointments:read'), async (req, res) => {
    try {
      const appointments = await portalExpansionService.listAppointments(portalScope(req));
      res.json({ data: { appointments }, meta: { invented: false as const, ownDataOnly: true as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/bookings', requirePortalAuth, requirePortalPermission('portal.appointments:read'), async (req, res) => {
    try {
      const bookings = await portalExpansionService.listBookings(portalScope(req));
      res.json({ data: { bookings }, meta: { invented: false as const, ownDataOnly: true as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/bookings', requirePortalAuth, requirePortalPermission('portal.appointments:read'), async (req, res) => {
    try {
      const parsed = bookingSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid booking request' } });
        return;
      }
      const booking = await portalExpansionService.createBooking(portalScope(req), parsed.data);
      res.status(201).json({
        data: { booking },
        meta: { invented: false as const, ownDataOnly: true as const, autoConfirmed: false as const },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get(
    '/staff/document-shares',
    requireStaffAuth,
    requireAnyPermission(
      'portal:read',
      'portal:write',
      'documents:read',
      'documents:write',
      'customers:read',
      'customers:write',
    ),
    async (req, res) => {
      try {
        const customerId = typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
        const shares = await portalExpansionService.listDocumentShares(staffActor(req), customerId);
        res.json({ data: { shares }, meta: { invented: false as const, ownerControlled: true as const } });
      } catch (error) {
        if (!handleError(res, error)) throw error;
      }
    },
  );

  router.post(
    '/staff/document-shares',
    requireStaffAuth,
    requireAnyPermission('portal:write', 'documents:write', 'customers:write'),
    async (req, res) => {
      try {
        const parsed = shareSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid document share request' } });
          return;
        }
        const share = await portalExpansionService.shareDocument(staffActor(req), parsed.data);
        res.status(201).json({ data: { share }, meta: { invented: false as const, ownerControlled: true as const } });
      } catch (error) {
        if (!handleError(res, error)) throw error;
      }
    },
  );

  router.delete(
    '/staff/document-shares/:shareId',
    requireStaffAuth,
    requireAnyPermission('portal:write', 'documents:write', 'customers:write'),
    async (req, res) => {
      try {
        const share = await portalExpansionService.revokeDocumentShare(staffActor(req), param(req, 'shareId'));
        res.json({ data: { share }, meta: { invented: false as const, ownerControlled: true as const } });
      } catch (error) {
        if (!handleError(res, error)) throw error;
      }
    },
  );

  return router;
}
