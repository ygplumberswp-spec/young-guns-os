import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseSaasPlatformService } from '../services/enterprise-saas-platform.service.js';
import { EnterpriseSaasPlatformError } from '../services/enterprise-saas-platform.service.js';
import type { AiOperationsService } from '../services/ai-operations.service.js';
import { AiOperationsError } from '../services/ai-operations.service.js';
import type { AiProviderResilienceService } from '../services/ai-provider-resilience.service.js';
import { AiProviderResilienceError } from '../services/ai-provider-resilience.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const planTierSchema = z.enum([
  'free_trial',
  'starter',
  'business',
  'pro',
  'professional',
  'enterprise',
]);
const billingIntervalSchema = z.enum(['monthly', 'annual']);

const seatLimitsSchema = z.object({
  adminOffice: z.number().int().min(0).nullable(),
  technician: z.number().int().min(0).nullable(),
  total: z.number().int().min(0).nullable().optional(),
});

const planLimitsSchema = z
  .object({
    users: z.number().int().optional(),
    storageMb: z.number().int().optional(),
    apiRequests: z.number().int().optional(),
    aiTokens: z.number().int().optional(),
    integrations: z.number().int().optional(),
    seats: seatLimitsSchema.optional(),
    fairUse: z
      .object({
        aiTokensMonthly: z.number().int().nullable().optional(),
        storageMb: z.number().int().nullable().optional(),
        communicationsMonthly: z.number().int().nullable().optional(),
        photosMonthly: z.number().int().nullable().optional(),
        highVolumeIntegrations: z.number().int().nullable().optional(),
        approachingPercent: z.number().min(0).max(100).optional(),
        warningPercent: z.number().min(0).max(100).optional(),
      })
      .optional(),
    extraSeatPricing: z
      .object({
        technicianCents: z.number().int().nullable().optional(),
        adminOfficeCents: z.number().int().nullable().optional(),
        currency: z.string().trim().min(3).max(3).optional(),
        pricingConfigurable: z.boolean().optional(),
      })
      .optional(),
  })
  .optional();

const planSchema = z.object({
  planKey: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  tier: planTierSchema,
  priceCents: z.number().int().min(0).optional(),
  billingInterval: billingIntervalSchema.optional(),
  features: z.array(z.string()).optional(),
  limits: planLimitsSchema,
  currency: z.string().trim().min(3).max(3).optional(),
  pricingConfigurable: z.boolean().optional(),
  commercialConfig: z
    .object({
      indicativeBandMinCents: z.number().int().nullable().optional(),
      indicativeBandMaxCents: z.number().int().nullable().optional(),
      pricingConfigurable: z.boolean(),
      pricingLocked: z.boolean(),
      notes: z.string().optional(),
      costInclusions: z.record(z.string()).optional(),
    })
    .nullable()
    .optional(),
});

const updatePlanSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(2000).optional(),
  priceCents: z.number().int().min(0).optional(),
  billingInterval: billingIntervalSchema.optional(),
  features: z.array(z.string()).optional(),
  limits: planLimitsSchema,
  isActive: z.boolean().optional(),
  currency: z.string().trim().min(3).max(3).optional(),
  pricingConfigurable: z.boolean().optional(),
  commercialConfig: z
    .object({
      indicativeBandMinCents: z.number().int().nullable().optional(),
      indicativeBandMaxCents: z.number().int().nullable().optional(),
      pricingConfigurable: z.boolean(),
      pricingLocked: z.boolean(),
      notes: z.string().optional(),
      costInclusions: z.record(z.string()).optional(),
    })
    .nullable()
    .optional(),
});

const assignPlanSchema = z.object({
  planId: z.string().uuid(),
  reason: z.string().trim().max(2000).optional().nullable(),
  extraSeatEntitlements: z
    .object({
      adminOffice: z.number().int().min(0).optional(),
      technician: z.number().int().min(0).optional(),
      total: z.number().int().min(0).optional(),
    })
    .nullable()
    .optional(),
});

const schedulePlanChangeSchema = z.object({
  planId: z.string().uuid(),
  changeType: z.enum(['upgrade', 'downgrade']),
  effectiveAt: z.string().trim().optional().nullable(),
  reason: z.string().trim().max(2000).optional().nullable(),
});

const extraSeatsSchema = z.object({
  adminOffice: z.number().int().min(0).optional(),
  technician: z.number().int().min(0).optional(),
  total: z.number().int().min(0).optional(),
});

const brandingSchema = z.object({
  logoUrl: z.string().url().optional().nullable(),
  companyDisplayName: z.string().trim().max(200).optional().nullable(),
  primaryColor: z.string().trim().max(20).optional().nullable(),
  secondaryColor: z.string().trim().max(20).optional().nullable(),
  accentColor: z.string().trim().max(20).optional().nullable(),
  emailBranding: z.record(z.unknown()).optional(),
  pdfBranding: z.record(z.unknown()).optional(),
  invoiceBranding: z.record(z.unknown()).optional(),
  portalBranding: z.record(z.unknown()).optional(),
  loginBranding: z.record(z.unknown()).optional(),
  mobileBranding: z.record(z.unknown()).optional(),
});

const provisionSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  branchLabel: z.string().trim().max(200).optional().nullable(),
  planId: z.string().uuid().optional().nullable(),
});

const planChangeSchema = z.object({
  planId: z.string().uuid(),
});

const actionSchema = z.object({
  actionType: z.enum([
    'tenant_provision',
    'tenant_suspend',
    'tenant_reactivate',
    'plan_upgrade',
    'plan_downgrade',
    'subscription_cancel',
    'branding_update',
    'feature_flag_update',
  ]),
  subject: z.string().trim().min(1).max(500),
  recommendation: z.string().trim().min(1).max(5000),
  targetCompanyId: z.string().uuid().optional().nullable(),
  payload: z.record(z.unknown()).optional(),
});

const featureFlagSchema = z.object({
  flagKey: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  defaultEnabled: z.boolean().optional(),
});

const branchSchema = z.object({
  branchKey: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
});

const reasonSchema = z.object({
  reason: z.string().trim().max(2000).optional().nullable(),
});

const paymentFailureSchema = z.object({
  reason: z.string().trim().max(2000).optional().nullable(),
  paymentProviderRef: z.string().trim().max(200).optional().nullable(),
});

const paymentSuccessSchema = z.object({
  paidThroughAt: z.string().trim().min(1),
  paymentProviderRef: z.string().trim().max(200).optional().nullable(),
  amountCents: z.number().int().min(0).optional(),
});

const resilienceConfigSchema = z.object({
  fallbackOrder: z
    .array(
      z.object({
        providerKey: z.string().trim().min(1),
        modelKey: z.string().trim().optional(),
        providerId: z.string().uuid().optional(),
      }),
    )
    .optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  retryBaseDelayMs: z.number().int().min(100).max(60_000).optional(),
  queueEnabled: z.boolean().optional(),
  lowCreditWarningCents: z.number().int().min(0).optional(),
  highUsageWarningTokens: z.number().int().min(0).optional(),
  hardSpendingLimitEnabled: z.boolean().optional(),
  hardSpendingLimitCents: z.number().int().min(0).nullable().optional(),
  taskRoutingEnabled: z.boolean().optional(),
});

type RouterDeps = {
  enterpriseSaasPlatformService: EnterpriseSaasPlatformService;
  aiOperationsService: AiOperationsService;
  aiProviderResilienceService: AiProviderResilienceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof EnterpriseSaasPlatformError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'SUBSCRIPTION_REQUIRED'
          ? 402
          : error.code === 'VALIDATION_ERROR'
            ? 400
            : error.code === 'FORBIDDEN'
              ? 403
              : 500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }

  if (error instanceof AiOperationsError || error instanceof AiProviderResilienceError) {
    const status =
      error.code === 'AI_ALLOWANCE_EXCEEDED' || error.code === 'AI_ACCESS_DENIED' ? 403 : 500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }

  throw error;
}

export function createEnterpriseSaasPlatformRouter({
  enterpriseSaasPlatformService,
  aiOperationsService,
  aiProviderResilienceService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'platform:read',
    'platform:manage',
    'saas:read',
    'saas:manage',
    'agents:read',
  );
  const requireWrite = requireAnyPermission('platform:manage', 'saas:manage');
  const requirePlatformManage = requireAnyPermission('platform:manage');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const dashboard = await enterpriseSaasPlatformService.getPlatformDashboard(
        getAuth(req).companyId,
      );
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/platform-owner/mark', requirePlatformManage, async (req, res) => {
    try {
      const auth = getAuth(req);
      const result = await enterpriseSaasPlatformService.markPlatformOwner({
        companyId: auth.companyId,
        userId: auth.userId,
      });
      res.json({ data: result });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/tenants/provision', requirePlatformManage, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = provisionSchema.parse(req.body);
      const tenant = await enterpriseSaasPlatformService.provisionTenant(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.status(201).json({ data: { tenant } });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** Customer locked-screen status — own company only; allowlisted from SaaS access gate. */
  router.get('/access-status', async (req, res) => {
    try {
      const auth = getAuth(req);
      const status = await enterpriseSaasPlatformService.getCustomerAccessStatus(auth.companyId);
      res.json({
        data: {
          companyName: status.companyName,
          accessState: status.decision.accessState,
          allowed: status.decision.allowed,
          accountStatus: status.decision.accountStatus,
          subscriptionStatus: status.decision.subscriptionStatus,
          paidThroughAt: status.decision.paidThroughAt,
          paymentFailed: status.decision.paymentFailed,
          customerMessage: status.decision.customerMessage,
          statusChip: status.statusChip,
        },
      });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/tenants/:companyId', requirePlatformManage, async (req, res) => {
    try {
      const auth = getAuth(req);
      const companyId = getRouteParam(req.params.companyId);
      if (!(await enterpriseSaasPlatformService.isPlatformOwnerTenant(auth.companyId))) {
        res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'Platform owner access required' },
        });
        return;
      }
      const dashboard = await enterpriseSaasPlatformService.getPlatformDashboard(auth.companyId);
      const tenant = dashboard.tenants.find((entry) => entry.companyId === companyId);
      if (!tenant) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tenant not found' } });
        return;
      }
      const audits = dashboard.recentAudits.filter(
        (audit) => audit.subject === companyId || audit.details?.includes(companyId),
      );
      res.json({ data: { tenant, audits } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/tenants/:companyId/suspend', requirePlatformManage, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = reasonSchema.parse(req.body ?? {});
      const tenant = await enterpriseSaasPlatformService.suspendTenant(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.companyId),
        body.reason,
      );
      res.json({ data: { tenant } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/tenants/:companyId/reactivate', requirePlatformManage, async (req, res) => {
    try {
      const auth = getAuth(req);
      const tenant = await enterpriseSaasPlatformService.reactivateTenant(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.companyId),
      );
      res.json({ data: { tenant } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/tenants/:companyId/cancel-access', requirePlatformManage, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = reasonSchema.parse(req.body ?? {});
      const tenant = await enterpriseSaasPlatformService.cancelTenantAccess(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.companyId),
        body.reason,
      );
      res.json({ data: { tenant } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/tenants/:companyId/payment-failure', requirePlatformManage, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = paymentFailureSchema.parse(req.body ?? {});
      const tenant = await enterpriseSaasPlatformService.recordPaymentFailure(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.companyId),
        body,
      );
      res.json({ data: { tenant } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/tenants/:companyId/payment-success', requirePlatformManage, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = paymentSuccessSchema.parse(req.body ?? {});
      const tenant = await enterpriseSaasPlatformService.recordSuccessfulPayment(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.companyId),
        body,
      );
      res.json({ data: { tenant } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/plans', requireRead, async (req, res) => {
    try {
      const dashboard = await enterpriseSaasPlatformService.getPlatformDashboard(
        getAuth(req).companyId,
      );
      res.json({ data: { plans: dashboard.plans } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/plans', requirePlatformManage, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = planSchema.parse(req.body);
      const plan = await enterpriseSaasPlatformService.createPlan(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.status(201).json({ data: { plan } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/plans/seed-canonical', requirePlatformManage, async (req, res) => {
    try {
      const auth = getAuth(req);
      const plans = await enterpriseSaasPlatformService.seedCanonicalPlans({
        companyId: auth.companyId,
        userId: auth.userId,
      });
      res.json({ data: { plans } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.patch('/plans/:planId', requirePlatformManage, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = updatePlanSchema.parse(req.body ?? {});
      const plan = await enterpriseSaasPlatformService.updatePlan(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.planId),
        body,
      );
      res.json({ data: { plan } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/subscription/view', requireRead, async (req, res) => {
    try {
      const view = await enterpriseSaasPlatformService.getTenantSubscriptionView(
        getAuth(req).companyId,
      );
      res.json({ data: { view } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/subscription/schedule-change', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = schedulePlanChangeSchema.parse(req.body);
      const subscription = await enterpriseSaasPlatformService.schedulePlanChange(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.json({ data: { subscription } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/tenants/:companyId/assign-plan', requirePlatformManage, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = assignPlanSchema.parse(req.body);
      const tenant = await enterpriseSaasPlatformService.assignPlanToTenant(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.companyId),
        body,
      );
      res.json({ data: { tenant } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/tenants/:companyId/extra-seats', requirePlatformManage, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = extraSeatsSchema.parse(req.body ?? {});
      const tenant = await enterpriseSaasPlatformService.setExtraSeatEntitlements(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.companyId),
        body,
      );
      res.json({ data: { tenant } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/tenants/:companyId/margin-hook', requirePlatformManage, async (req, res) => {
    try {
      const auth = getAuth(req);
      if (!(await enterpriseSaasPlatformService.isPlatformOwnerTenant(auth.companyId))) {
        res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'Platform owner access required' },
        });
        return;
      }
      const margin = await enterpriseSaasPlatformService.getTenantMarginHook(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.companyId),
      );
      res.json({ data: { margin } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/subscription/upgrade', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = planChangeSchema.parse(req.body);
      const subscription = await enterpriseSaasPlatformService.upgradePlan(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.json({ data: { subscription } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/subscription/downgrade', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = planChangeSchema.parse(req.body);
      const subscription = await enterpriseSaasPlatformService.downgradePlan(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.json({ data: { subscription } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/subscription/cancel', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const subscription = await enterpriseSaasPlatformService.cancelSubscription({
        companyId: auth.companyId,
        userId: auth.userId,
      });
      res.json({ data: { subscription } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/branding', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = brandingSchema.parse(req.body);
      const branding = await enterpriseSaasPlatformService.updateBranding(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.json({ data: { branding } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/usage/capture', requireWrite, async (req, res) => {
    try {
      const snapshot = await enterpriseSaasPlatformService.captureUsageSnapshot(
        getAuth(req).companyId,
      );
      res.status(201).json({ data: { snapshot: { id: snapshot.id } } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/feature-flags', requirePlatformManage, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = featureFlagSchema.parse(req.body);
      const flag = await enterpriseSaasPlatformService.createFeatureFlag(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.status(201).json({ data: { flag } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/branches', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = branchSchema.parse(req.body);
      const branch = await enterpriseSaasPlatformService.createBranch(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.status(201).json({ data: { branch } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/actions', requireRead, async (req, res) => {
    try {
      const actions = await enterpriseSaasPlatformService.listPlatformActions(
        getAuth(req).companyId,
      );
      res.json({ data: { actions } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/actions', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = actionSchema.parse(req.body);
      const action = await enterpriseSaasPlatformService.createPlatformAction(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.status(201).json({ data: { action } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/ai-operations/dashboard', requireRead, async (req, res) => {
    try {
      const companyId = getAuth(req).companyId;
      const dashboard = await aiOperationsService.getPlatformOwnerAiDashboard(companyId);
      dashboard.resilience = await aiProviderResilienceService.getResilienceStatus(companyId);
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/ai-operations/resilience', requireRead, async (req, res) => {
    try {
      const resilience = await aiProviderResilienceService.getResilienceStatus(
        getAuth(req).companyId,
      );
      res.json({ data: { resilience } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/ai-operations/resilience', requirePlatformManage, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = resilienceConfigSchema.parse(req.body);
      const config = await aiOperationsService.updateResilienceConfig(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.json({ data: { config } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
