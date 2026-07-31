import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { isCompanyOwnerRole, isTechnicianRole } from '@titan/auth';
import {
  MarketingEligibilityError,
  type MarketingEligibilityService,
} from '../services/marketing-eligibility.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

type RouterDeps = {
  marketingEligibilityService: MarketingEligibilityService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: Request) {
  return (req as AuthenticatedRequest).auth;
}

function scopeOf(req: Request) {
  const auth = getAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0]! : value;
}

function handleError(error: unknown, res: Response) {
  if (error instanceof MarketingEligibilityError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'FORBIDDEN'
          ? 403
          : error.code === 'VALIDATION_ERROR' || error.code === 'CONFLICT'
            ? 400
            : 500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

const contactFieldKeySchema = z.enum(['name', 'contact_person', 'email', 'phone']);

const correctContactSchema = z.object({
  fieldKey: contactFieldKeySchema,
  value: z.string().max(500).nullable(),
  reason: z.string().trim().min(1).max(1000),
  markVerified: z.boolean().optional(),
  source: z.string().trim().max(100).optional(),
  clientActionId: z.string().trim().max(200).nullable().optional(),
});

const upsertConsentSchema = z.object({
  channel: z.enum(['whatsapp', 'email', 'sms', 'phone']),
  status: z.enum(['unknown', 'granted', 'denied', 'withdrawn', 'do_not_contact']),
  lawfulBasis: z.string().trim().max(500).nullable().optional(),
  captureSource: z.string().trim().max(200).nullable().optional(),
  wordingVersion: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  reason: z.string().trim().min(1).max(1000),
});

const createAudienceRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  criteria: z.record(z.unknown()).optional(),
  exclusions: z.record(z.unknown()).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  clientActionId: z.string().trim().max(200).nullable().optional(),
});

const rejectAudienceRequestSchema = z.object({
  rejectionReason: z.string().trim().min(1).max(1000),
});

const createXeroSyncBackRequestSchema = z.object({
  customerId: z.string().uuid(),
  requestedFields: z.array(z.enum(['name', 'email', 'phone', 'contact_person'])).min(1),
  notes: z.string().trim().max(2000).nullable().optional(),
  clientActionId: z.string().trim().max(200).nullable().optional(),
});

const recomputeClassificationsSchema = z.object({
  clientActionId: z.string().trim().max(200).nullable().optional(),
});

export function createMarketingEligibilityRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireStaffAuth = createAuthMiddleware({
    jwtSecret: deps.jwtSecret,
    authService: deps.authService,
  });

  const requireRead = requireAnyPermission(
    'marketing:read',
    'marketing_intelligence:read',
    'finance:read',
    'customers:read',
  );
  const requireClassificationWrite = requireAnyPermission(
    'marketing:write',
    'marketing_intelligence:write',
    'finance:write',
  );
  const requireContactWrite = requireAnyPermission('customers:write');
  const requireConsentWrite = requireAnyPermission('marketing:write', 'marketing_intelligence:write');
  const requireAudienceWrite = requireAnyPermission('marketing:write', 'marketing_intelligence:write');

  function denyTechnicianAudienceAccess(req: Request, res: Response, next: NextFunction) {
    const auth = getAuth(req);
    if (isTechnicianRole({ roleName: auth.roleName, permissions: auth.permissions })) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Technicians cannot access reactivation eligibility or audience requests',
        },
      });
      return;
    }
    next();
  }

  function requireOwnerOrManage(req: Request, res: Response, next: NextFunction) {
    const auth = getAuth(req);
    if (
      isCompanyOwnerRole({ roleName: auth.roleName, permissions: auth.permissions }) ||
      auth.permissions.includes('marketing_intelligence:manage') ||
      auth.permissions.includes('*')
    ) {
      next();
      return;
    }
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Only Company Owner or marketing_intelligence:manage may approve audience requests',
      },
    });
  }

  // --- Buyer classification (Decision 3 / FIN-006) ------------------------------------

  router.get('/classifications', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const classification =
        typeof req.query.classification === 'string' ? req.query.classification : undefined;
      const isPaidBuyer =
        typeof req.query.isPaidBuyer === 'string' ? req.query.isPaidBuyer === 'true' : undefined;
      const classifications = await deps.marketingEligibilityService.listClassifications(
        auth.companyId,
        { classification, isPaidBuyer },
      );
      res.json({ data: { classifications } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post(
    '/classifications/recompute',
    requireStaffAuth,
    requireClassificationWrite,
    async (req, res) => {
      const parsed = recomputeClassificationsSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid recompute request' } });
        return;
      }
      try {
        const auth = getAuth(req);
        const classifications = await deps.marketingEligibilityService.recomputeClassifications(
          auth.companyId,
          { clientActionId: parsed.data.clientActionId },
        );
        res.json({ data: { classifications } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  // --- Contact quality ---------------------------------------------------

  router.get(
    '/customers/:customerId/contact-fields',
    requireStaffAuth,
    requireRead,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const contactFields = await deps.marketingEligibilityService.listContactFields(
          auth.companyId,
          getRouteParam(req.params.customerId),
        );
        res.json({ data: { contactFields } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get(
    '/customers/:customerId/contact-corrections',
    requireStaffAuth,
    requireRead,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const contactCorrections = await deps.marketingEligibilityService.listContactCorrections(
          auth.companyId,
          getRouteParam(req.params.customerId),
        );
        res.json({ data: { contactCorrections } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/customers/:customerId/contact-fields/ensure',
    requireStaffAuth,
    requireRead,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const contactFields = await deps.marketingEligibilityService.ensureContactQualityFromCustomer(
          auth.companyId,
          getRouteParam(req.params.customerId),
        );
        res.json({ data: { contactFields } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/customers/:customerId/contact-correct',
    requireStaffAuth,
    requireContactWrite,
    async (req, res) => {
      const parsed = correctContactSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid contact correction' } });
        return;
      }
      try {
        const contactField = await deps.marketingEligibilityService.correctContact(
          scopeOf(req),
          getRouteParam(req.params.customerId),
          parsed.data,
        );
        res.json({ data: { contactField } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  // --- Marketing consent ---------------------------------------------------

  router.get('/consents', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const customerId = typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
      const consents = await deps.marketingEligibilityService.listConsents(
        auth.companyId,
        customerId,
      );
      res.json({ data: { consents } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/customers/:customerId/consents', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const consents = await deps.marketingEligibilityService.listConsents(
        auth.companyId,
        getRouteParam(req.params.customerId),
      );
      res.json({ data: { consents } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post(
    '/customers/:customerId/consents',
    requireStaffAuth,
    requireConsentWrite,
    async (req, res) => {
      const parsed = upsertConsentSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid consent update' } });
        return;
      }
      try {
        const consent = await deps.marketingEligibilityService.upsertConsent(
          scopeOf(req),
          getRouteParam(req.params.customerId),
          parsed.data,
        );
        res.json({ data: { consent } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  // --- Reactivation eligibility ---------------------------------------------------

  router.get(
    '/eligibility',
    requireStaffAuth,
    requireRead,
    denyTechnicianAudienceAccess,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const status = typeof req.query.status === 'string' ? req.query.status : undefined;
        const eligibility = await deps.marketingEligibilityService.listEligibility(auth.companyId, {
          status,
        });
        res.json({ data: { eligibility } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get(
    '/eligibility/counts',
    requireStaffAuth,
    requireRead,
    denyTechnicianAudienceAccess,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const counts = await deps.marketingEligibilityService.getEligibilityCounts(auth.companyId);
        res.json({ data: { counts } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/eligibility/recompute',
    requireStaffAuth,
    requireClassificationWrite,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const eligibility = await deps.marketingEligibilityService.recomputeEligibility(
          auth.companyId,
        );
        res.json({ data: { eligibility } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  // --- Audience requests (never provider-sent) ------------------------------------

  router.get(
    '/audience-requests',
    requireStaffAuth,
    requireRead,
    denyTechnicianAudienceAccess,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const audienceRequests = await deps.marketingEligibilityService.listAudienceRequests(
          auth.companyId,
        );
        res.json({ data: { audienceRequests } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/audience-requests',
    requireStaffAuth,
    requireAudienceWrite,
    denyTechnicianAudienceAccess,
    async (req, res) => {
      const parsed = createAudienceRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid audience request' } });
        return;
      }
      try {
        const audienceRequest = await deps.marketingEligibilityService.createAudienceRequest(
          scopeOf(req),
          parsed.data,
        );
        res.status(201).json({ data: { audienceRequest } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/audience-requests/:requestId/submit-for-approval',
    requireStaffAuth,
    requireAudienceWrite,
    denyTechnicianAudienceAccess,
    async (req, res) => {
      try {
        const audienceRequest =
          await deps.marketingEligibilityService.submitAudienceRequestForApproval(
            scopeOf(req),
            getRouteParam(req.params.requestId),
          );
        res.json({ data: { audienceRequest } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/audience-requests/:requestId/approve',
    requireStaffAuth,
    requireOwnerOrManage,
    async (req, res) => {
      try {
        const audienceRequest = await deps.marketingEligibilityService.approveAudienceRequest(
          scopeOf(req),
          getRouteParam(req.params.requestId),
        );
        res.json({ data: { audienceRequest } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/audience-requests/:requestId/reject',
    requireStaffAuth,
    requireAudienceWrite,
    denyTechnicianAudienceAccess,
    async (req, res) => {
      const parsed = rejectAudienceRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: { code: 'VALIDATION_ERROR', message: 'Rejection reason is required' } });
        return;
      }
      try {
        const audienceRequest = await deps.marketingEligibilityService.rejectAudienceRequest(
          scopeOf(req),
          getRouteParam(req.params.requestId),
          parsed.data.rejectionReason,
        );
        res.json({ data: { audienceRequest } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  // --- Xero contact sync-back boundary (never calls Xero) ------------------------------

  router.get(
    '/customers/:customerId/xero-sync-back-requests',
    requireStaffAuth,
    requireRead,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const syncBackRequests = await deps.marketingEligibilityService.listXeroSyncBackRequests(
          auth.companyId,
          getRouteParam(req.params.customerId),
        );
        res.json({ data: { syncBackRequests } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/xero-sync-back-requests',
    requireStaffAuth,
    requireContactWrite,
    async (req, res) => {
      const parsed = createXeroSyncBackRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid sync-back request' } });
        return;
      }
      try {
        const syncBackRequest = await deps.marketingEligibilityService.createXeroSyncBackRequest(
          scopeOf(req),
          parsed.data,
        );
        res.status(201).json({ data: { syncBackRequest } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  // --- Human-Quality Content Standard (future marketing requirement) ------------------

  router.get('/human-quality-content-standard', requireStaffAuth, requireRead, (_req, res) => {
    const standard = deps.marketingEligibilityService.getHumanQualityContentStandard();
    res.json({ data: { standard } });
  });

  return router;
}
