import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseCustomerExperienceService } from '../services/enterprise-customer-experience.service.js';
import { EnterpriseCustomerExperienceError } from '../services/enterprise-customer-experience.service.js';
import type { PortalExperienceService } from '../services/portal-experience.service.js';
import type { TeamService } from '../services/team.service.js';
import type { PortalAuthService } from '../services/portal-auth.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  createPortalAuthMiddleware,
  requirePortalPermission,
  type PortalAuthenticatedRequest,
} from '../middleware/portal-auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const platformConfigSchema = z.object({
  globalPolicies: z.record(z.unknown()).optional(),
  brandingTemplates: z.record(z.unknown()).optional(),
  portalDefaults: z.record(z.unknown()).optional(),
  communicationPolicies: z.record(z.unknown()).optional(),
  engagementRules: z.record(z.unknown()).optional(),
  loyaltySettings: z.record(z.unknown()).optional(),
  trackingEnabled: z.boolean().optional(),
  pwaEnabled: z.boolean().optional(),
});

const propertySchema = z.object({
  propertyName: z.string().trim().min(1).max(200),
  addressLine1: z.string().trim().max(200).optional(),
  addressLine2: z.string().trim().max(200).optional(),
  suburb: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  province: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  unitNumber: z.string().trim().max(50).optional(),
  isPrimary: z.boolean().optional(),
});

const bookingSchema = z.object({
  bookingType: z.enum(['standard', 'emergency', 'reschedule', 'cancellation']).optional(),
  subject: z.string().trim().min(1).max(200),
  propertyId: z.string().uuid().optional(),
  preferredDate: z.string().optional(),
  preferredTimeWindow: z.string().trim().max(100).optional(),
  jobNotes: z.string().trim().max(4000).optional(),
  photoUrls: z.array(z.string().url()).optional(),
  payload: z.record(z.unknown()).optional(),
});

const reviewSchema = z.object({
  reviewType: z.enum([
    'satisfaction_survey',
    'job_rating',
    'technician_rating',
    'business_review',
    'complaint',
    'internal_feedback',
  ]),
  subject: z.string().trim().min(1).max(200),
  feedback: z.string().trim().min(1).max(4000),
  rating: z.number().int().min(1).max(5).optional(),
  jobId: z.string().uuid().optional(),
});

const referralSchema = z.object({
  referredEmail: z.string().trim().email(),
});

const loyaltyProgramSchema = z.object({
  name: z.string().trim().min(1).max(200),
  tier: z.enum(['bronze', 'silver', 'gold', 'platinum', 'custom']).optional(),
  pointsRequired: z.number().int().min(0).optional(),
  rewardDescription: z.string().trim().max(500).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

const engagementPreferencesSchema = z.object({
  pushEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  marketingEnabled: z.boolean().optional(),
  trackingConsent: z.boolean().optional(),
  preferences: z.record(z.unknown()).optional(),
});

type RouterDeps = {
  enterpriseCustomerExperienceService: EnterpriseCustomerExperienceService;
  portalExperienceService: PortalExperienceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
  portalAuthService: PortalAuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function getPortalAuth(req: import('express').Request) {
  return (req as PortalAuthenticatedRequest).portalAuth;
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

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0]! : value;
}

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof EnterpriseCustomerExperienceError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'FORBIDDEN'
          ? 403
          : error.code === 'VALIDATION_ERROR'
            ? 400
            : 500;
    res.status(status).json({ error: error.code, message: error.message });
    return;
  }
  throw error;
}

export function createEnterpriseCustomerExperienceRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireStaffAuth = createAuthMiddleware({
    jwtSecret: deps.jwtSecret,
    authService: deps.authService,
  });
  const requirePortalAuth = createPortalAuthMiddleware({
    jwtSecret: deps.jwtSecret,
    portalAuthService: deps.portalAuthService,
  });
  const requireRead = requireAnyPermission(
    'portal:read',
    'portal:manage',
    'customer_experience:read',
    'customer_experience:manage',
  );
  const requireWrite = requireAnyPermission(
    'portal:manage',
    'customer_experience:write',
    'customer_experience:manage',
  );
  const requireManage = requireAnyPermission(
    'portal:manage',
    'customer_experience:manage',
    'platform:manage',
  );

  router.get('/dashboard', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const dashboard = await deps.enterpriseCustomerExperienceService.getDashboard(auth.companyId);
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/platform-config', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const platformConfig = await deps.enterpriseCustomerExperienceService.getPlatformConfig(
        auth.companyId,
      );
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/platform-config', requireStaffAuth, requireManage, async (req, res) => {
    const parsed = platformConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid platform config' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const platformConfig = await deps.enterpriseCustomerExperienceService.updatePlatformConfig(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/bookings', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const customerId =
        typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
      const bookings = await deps.enterpriseCustomerExperienceService.listBookings(auth.companyId, {
        customerId,
      });
      res.json({ data: { bookings } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/bookings/:bookingId/approve', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const booking = await deps.enterpriseCustomerExperienceService.approveBooking(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.bookingId),
      );
      res.json({ data: { booking } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/bookings/:bookingId/confirm', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const booking = await deps.enterpriseCustomerExperienceService.confirmBooking(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.bookingId),
      );
      res.json({ data: { booking } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/reviews', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const reviews = await deps.enterpriseCustomerExperienceService.listReviews(auth.companyId);
      res.json({ data: { reviews } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.patch('/reviews/:reviewId/status', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = z
      .object({
        status: z.enum(['acknowledged', 'resolved', 'closed']),
        resolutionNotes: z.string().trim().max(4000).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid review status payload' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const review = await deps.enterpriseCustomerExperienceService.updateReviewStatus(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.reviewId),
        parsed.data.status,
        parsed.data.resolutionNotes,
      );
      res.json({ data: { review } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/loyalty-programs', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const loyaltyPrograms = await deps.enterpriseCustomerExperienceService.listLoyaltyPrograms(
        auth.companyId,
      );
      res.json({ data: { loyaltyPrograms } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/loyalty-programs', requireStaffAuth, requireManage, async (req, res) => {
    const parsed = loyaltyProgramSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid loyalty program payload' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const loyaltyProgram = await deps.enterpriseCustomerExperienceService.createLoyaltyProgram(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.json({ data: { loyaltyProgram } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/referrals', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const referrals = await deps.enterpriseCustomerExperienceService.listReferrals(
        auth.companyId,
      );
      res.json({ data: { referrals } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/analytics/capture', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const analytics = await deps.enterpriseCustomerExperienceService.captureAnalytics(
        auth.companyId,
      );
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/aura-context', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const context = await deps.enterpriseCustomerExperienceService.buildAuraContext(
        auth.companyId,
      );
      res.json({ data: { context } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get(
    '/portal/dashboard',
    requirePortalAuth,
    requirePortalPermission('portal.dashboard:read'),
    async (req, res) => {
      try {
        const dashboard = await deps.enterpriseCustomerExperienceService.getCustomerDashboard(
          portalScope(req),
        );
        res.json({ data: { dashboard } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get(
    '/portal/documents',
    requirePortalAuth,
    requirePortalPermission('portal.documents:read'),
    async (req, res) => {
      try {
        const documentCentre = await deps.enterpriseCustomerExperienceService.getDocumentCentre(
          portalScope(req),
        );
        res.json({ data: { documentCentre } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get(
    '/portal/communications',
    requirePortalAuth,
    requirePortalPermission('portal.communications:read'),
    async (req, res) => {
      try {
        const communicationCentre =
          await deps.enterpriseCustomerExperienceService.getCommunicationCentre(portalScope(req));
        res.json({ data: { communicationCentre } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get(
    '/portal/properties',
    requirePortalAuth,
    requirePortalPermission('portal.dashboard:read'),
    async (req, res) => {
      try {
        const properties = await deps.enterpriseCustomerExperienceService.listCustomerProperties(
          portalScope(req),
        );
        res.json({ data: { properties } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/portal/properties',
    requirePortalAuth,
    requirePortalPermission('portal.dashboard:read'),
    async (req, res) => {
      const parsed = propertySchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid property payload' } });
        return;
      }
      try {
        const property = await deps.enterpriseCustomerExperienceService.createCustomerProperty(
          portalScope(req),
          parsed.data,
        );
        res.status(201).json({ data: { property } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get(
    '/portal/bookings',
    requirePortalAuth,
    requirePortalPermission('portal.appointments:read'),
    async (req, res) => {
      try {
        const bookings = await deps.enterpriseCustomerExperienceService.listCustomerBookings(
          portalScope(req),
        );
        res.json({ data: { bookings } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/portal/bookings',
    requirePortalAuth,
    requirePortalPermission('portal.appointments:read'),
    async (req, res) => {
      const parsed = bookingSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid booking payload' } });
        return;
      }
      try {
        const booking = await deps.enterpriseCustomerExperienceService.createBooking(
          portalScope(req),
          parsed.data,
        );
        res.status(201).json({ data: { booking } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/portal/bookings/:bookingId/cancel',
    requirePortalAuth,
    requirePortalPermission('portal.appointments:read'),
    async (req, res) => {
      try {
        const booking = await deps.enterpriseCustomerExperienceService.cancelBooking(
          portalScope(req),
          getRouteParam(req.params.bookingId),
          false,
        );
        res.json({ data: { booking } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get(
    '/portal/tracking/:jobId',
    requirePortalAuth,
    requirePortalPermission('portal.jobs:read'),
    async (req, res) => {
      try {
        const tracking = await deps.enterpriseCustomerExperienceService.getTechnicianTracking(
          portalScope(req),
          getRouteParam(req.params.jobId),
        );
        if (!tracking) {
          res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
          return;
        }
        res.json({ data: { tracking } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get(
    '/portal/reviews',
    requirePortalAuth,
    requirePortalPermission('portal.dashboard:read'),
    async (req, res) => {
      try {
        const scope = portalScope(req);
        const reviews = await deps.enterpriseCustomerExperienceService.listReviews(
          scope.companyId,
          {
            customerId: scope.customerId,
          },
        );
        res.json({ data: { reviews } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/portal/reviews',
    requirePortalAuth,
    requirePortalPermission('portal.dashboard:read'),
    async (req, res) => {
      const parsed = reviewSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid review payload' } });
        return;
      }
      try {
        const review = await deps.enterpriseCustomerExperienceService.submitReview(
          portalScope(req),
          parsed.data,
        );
        res.status(201).json({ data: { review } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get(
    '/portal/referrals',
    requirePortalAuth,
    requirePortalPermission('portal.dashboard:read'),
    async (req, res) => {
      try {
        const scope = portalScope(req);
        const referrals = await deps.enterpriseCustomerExperienceService.listReferrals(
          scope.companyId,
        );
        const customerReferrals = referrals.filter(
          (r) => r.referrerCustomerId === scope.customerId,
        );
        res.json({ data: { referrals: customerReferrals } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/portal/referrals',
    requirePortalAuth,
    requirePortalPermission('portal.dashboard:read'),
    async (req, res) => {
      const parsed = referralSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid referral payload' } });
        return;
      }
      try {
        const referral = await deps.enterpriseCustomerExperienceService.createReferral(
          portalScope(req),
          parsed.data,
        );
        res.status(201).json({ data: { referral } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get(
    '/portal/engagement-preferences',
    requirePortalAuth,
    requirePortalPermission('portal.notifications:read'),
    async (req, res) => {
      try {
        const preferences = await deps.enterpriseCustomerExperienceService.getEngagementPreferences(
          portalScope(req),
        );
        res.json({ data: { preferences } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.patch(
    '/portal/engagement-preferences',
    requirePortalAuth,
    requirePortalPermission('portal.notifications:read'),
    async (req, res) => {
      const parsed = engagementPreferencesSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid engagement preferences' } });
        return;
      }
      try {
        const preferences =
          await deps.enterpriseCustomerExperienceService.updateEngagementPreferences(
            portalScope(req),
            parsed.data,
          );
        res.json({ data: { preferences } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  return router;
}
