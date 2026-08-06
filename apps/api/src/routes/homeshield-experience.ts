import { Router } from 'express';
import { z } from 'zod';
import type { HomeshieldExperienceService } from '../services/homeshield-experience.service.js';
import {
  HomeshieldExperienceError,
  type HsActor,
} from '../services/homeshield-experience.service.js';
import type { TeamService } from '../services/team.service.js';
import type { PortalAuthService } from '../services/portal-auth.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  createPortalAuthMiddleware,
  requirePortalPermission,
  type PortalAuthenticatedRequest,
} from '../middleware/portal-auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const createPlanSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  billingInterval: z.enum(['monthly', 'quarterly', 'annual', 'custom']).optional(),
  priceCents: z.number().int().min(0).max(100_000_000),
  currency: z.string().trim().min(1).max(10).optional(),
  status: z.enum(['draft', 'active', 'paused', 'archived']).optional(),
});

const updatePlanSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  billingInterval: z.enum(['monthly', 'quarterly', 'annual', 'custom']).optional(),
  priceCents: z.number().int().min(0).max(100_000_000).optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  status: z.enum(['draft', 'active', 'paused', 'archived']).optional(),
});

const createSubscriptionSchema = z.object({
  planId: z.string().uuid(),
  customerId: z.string().uuid(),
  status: z
    .enum(['draft', 'active', 'paused', 'past_due', 'cancelled', 'expired'])
    .optional(),
  startsAt: z.string().datetime().nullable().optional(),
  renewsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
});

const createBenefitSchema = z.object({
  planId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  isActive: z.boolean().optional(),
});

const createReminderSchema = z.object({
  subscriptionId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  maintenancePlanId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  remindAt: z.string().datetime(),
});

const refreshRenewalsSchema = z.object({
  submitForApproval: z.boolean().optional(),
  withinDays: z.number().int().min(1).max(365).optional(),
});

const decideRenewalSchema = z.object({
  decision: z.enum(['approve', 'reject', 'cancel']),
  notes: z.string().trim().max(2000).optional(),
});

const createOutreachSchema = z.object({
  customerId: z.string().uuid(),
  subscriptionId: z.string().uuid().nullable().optional(),
  renewalOpportunityId: z.string().uuid().nullable().optional(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
  submitForApproval: z.boolean().optional(),
});

const decideOutreachSchema = z.object({
  decision: z.enum(['approve', 'reject', 'cancel']),
  notes: z.string().trim().max(2000).optional(),
});

const refreshAuraSchema = z.object({
  submitForApproval: z.boolean().optional(),
});

const decideAuraSchema = z.object({
  decision: z.enum(['approve', 'reject', 'cancel', 'acknowledge']),
  notes: z.string().trim().max(2000).optional(),
});

const updateSettingsSchema = z.object({
  renewalDraftsEnabled: z.boolean().optional(),
  outreachDraftsEnabled: z.boolean().optional(),
  reminderDraftsEnabled: z.boolean().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

type RouterDeps = {
  homeshieldExperienceService: HomeshieldExperienceService;
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

function toActor(req: import('express').Request): HsActor {
  const auth = getAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
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

function paramId(req: import('express').Request): string {
  const raw = req.params.id;
  return String(Array.isArray(raw) ? raw[0] : raw ?? '');
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof HomeshieldExperienceError) {
    const status =
      error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'INVALID_STATE'
            ? 409
            : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

const honestyFlags = {
  autoBilling: false as const,
  autoCharge: false as const,
  billingCharged: false as const,
  inventedMemberships: false as const,
  fakeSubscriptions: false as const,
  inventedClv: false as const,
  fakeChurn: false as const,
  ownerControlled: true as const,
};

export function createHomeshieldExperienceRouter({
  homeshieldExperienceService,
  teamService,
  jwtSecret,
  authService,
  portalAuthService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requirePortalAuth = createPortalAuthMiddleware({ jwtSecret, portalAuthService });
  const requireRead = requireAnyPermission(
    'customers:read',
    'customers:write',
    'portal:read',
    'portal:manage',
    'agents:read',
    'finance:read',
    'finance:write',
  );
  const requireWrite = requireAnyPermission(
    'customers:write',
    'portal:manage',
    'finance:write',
  );

  router.get(
    '/portal/membership',
    requirePortalAuth,
    requirePortalPermission('portal.dashboard:read'),
    async (req, res) => {
      try {
        const membership = await homeshieldExperienceService.getPortalMembership(portalScope(req));
        res.json({
          data: {
            membership,
            ...honestyFlags,
            portalOwnDataOnly: true as const,
          },
        });
      } catch (error) {
        if (!handleError(res, error)) throw error;
      }
    },
  );

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    try {
      await teamService.ensureDefaultRoles(getAuth(req).companyId);
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const dashboard = await homeshieldExperienceService.getDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          ...honestyFlags,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/plans', requireWrite, async (req, res) => {
    try {
      const body = createPlanSchema.parse(req.body ?? {});
      const plan = await homeshieldExperienceService.createPlan(toActor(req), body);
      res.status(201).json({ data: { plan, ...honestyFlags } });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.patch('/plans/:id', requireWrite, async (req, res) => {
    try {
      const body = updatePlanSchema.parse(req.body ?? {});
      const plan = await homeshieldExperienceService.updatePlan(toActor(req), paramId(req), body);
      res.json({ data: { plan, ...honestyFlags } });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/subscriptions', requireWrite, async (req, res) => {
    try {
      const body = createSubscriptionSchema.parse(req.body ?? {});
      const subscription = await homeshieldExperienceService.createSubscription(
        toActor(req),
        body,
      );
      res.status(201).json({
        data: {
          subscription,
          ...honestyFlags,
          autoBilling: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/benefits', requireWrite, async (req, res) => {
    try {
      const body = createBenefitSchema.parse(req.body ?? {});
      const benefit = await homeshieldExperienceService.createBenefit(toActor(req), body);
      res.status(201).json({ data: { benefit, invented: false as const } });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/reminders', requireWrite, async (req, res) => {
    try {
      const body = createReminderSchema.parse(req.body ?? {});
      const reminder = await homeshieldExperienceService.createReminder(toActor(req), body);
      res.status(201).json({ data: { reminder, invented: false as const } });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/renewals/refresh', requireWrite, async (req, res) => {
    try {
      const body = refreshRenewalsSchema.parse(req.body ?? {});
      const result = await homeshieldExperienceService.refreshRenewalOpportunities(
        toActor(req),
        body,
      );
      res.status(201).json({
        data: {
          ...result,
          ...honestyFlags,
          invoiceCreated: false as const,
          chargeCreated: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/renewals/:id/decide', requireWrite, async (req, res) => {
    try {
      const body = decideRenewalSchema.parse(req.body ?? {});
      const opportunity = await homeshieldExperienceService.decideRenewalOpportunity(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          opportunity,
          ...honestyFlags,
          invoiceCreated: false as const,
          chargeCreated: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/outreach', requireWrite, async (req, res) => {
    try {
      const body = createOutreachSchema.parse(req.body ?? {});
      const draft = await homeshieldExperienceService.createOutreachDraft(toActor(req), body);
      res.status(201).json({
        data: {
          draft,
          autoExecuted: false as const,
          sent: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/outreach/:id/decide', requireWrite, async (req, res) => {
    try {
      const body = decideOutreachSchema.parse(req.body ?? {});
      const draft = await homeshieldExperienceService.decideOutreachDraft(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          draft,
          autoExecuted: false as const,
          sent: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });


  router.post('/aura-insights/refresh', requireWrite, async (req, res) => {
    try {
      const body = refreshAuraSchema.parse(req.body ?? {});
      const result = await homeshieldExperienceService.refreshAuraInsights(toActor(req), body);
      res.status(201).json({
        data: {
          ...result,
          autoBilling: false as const,
          autoExecuted: false as const,
          inventedMemberships: false as const,
          inventedClv: false as const,
          fakeChurn: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/aura-insights/:id/decide', requireWrite, async (req, res) => {
    try {
      const body = decideAuraSchema.parse(req.body ?? {});
      const insight = await homeshieldExperienceService.decideAuraInsight(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          insight,
          autoBilling: false as const,
          autoExecuted: false as const,
          billingCharged: false as const,
          inventedClv: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.patch('/settings', requireWrite, async (req, res) => {
    try {
      const body = updateSettingsSchema.parse(req.body ?? {});
      const settings = await homeshieldExperienceService.updateSettings(toActor(req), body);
      res.json({
        data: {
          settings,
          autoBilling: false as const,
          autoCharge: false as const,
          ownerControlled: true as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
