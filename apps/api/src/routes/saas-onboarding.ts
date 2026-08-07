import { Router } from 'express';
import { z } from 'zod';
import type { SaasOnboardingService } from '../services/saas-onboarding.service.js';
import { SaasOnboardingError } from '../services/saas-onboarding.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const tradeTypeSchema = z.enum([
  'plumbing',
  'electrical',
  'hvac',
  'construction',
  'maintenance',
  'landscaping',
  'other',
]);

const companySchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  tradingName: z.string().trim().max(200).optional().nullable(),
  registrationNumber: z.string().trim().max(100).optional().nullable(),
  vatNumber: z.string().trim().max(100).optional().nullable(),
  mainPhone: z.string().trim().max(50).optional().nullable(),
  mainEmail: z.string().trim().email().optional().nullable().or(z.literal('')),
  website: z.string().trim().max(300).optional().nullable(),
  country: z.string().trim().max(100).optional().nullable(),
  timezone: z.string().trim().max(100).optional().nullable(),
  currency: z.string().trim().min(3).max(3).optional().nullable(),
  addressLine1: z.string().trim().max(200).optional().nullable(),
  addressLine2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  region: z.string().trim().max(100).optional().nullable(),
  postalCode: z.string().trim().max(40).optional().nullable(),
  tradeType: tradeTypeSchema.optional().nullable(),
  logoUrl: z.string().url().optional().nullable(),
});

const planSchema = z.object({
  planId: z.string().uuid(),
});

const inviteSchema = z.object({
  email: z.string().trim().email(),
  roleId: z.string().uuid(),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  mobile: z.string().trim().max(50).optional().nullable(),
  payrollSetup: z
    .object({
      monthlySalaryCents: z.number().int().positive(),
      effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      workingDaysPerWeek: z.number().positive().max(7).optional(),
      workingHoursPerDay: z.number().positive().max(24).optional(),
      overtimeDailyThresholdHours: z.number().positive().max(24).optional(),
      overtimeMultiplierBps: z.number().int().min(10000).max(50000).optional(),
    })
    .nullable()
    .optional(),
});

const importModeSchema = z.object({
  mode: z.enum(['start_clean', 'importing', 'complete']),
});

const skipIntegrationSchema = z.object({
  providerKey: z.string().trim().min(1).max(100),
  reason: z.string().trim().max(500).optional().nullable(),
});

const operationsSchema = z.object({
  timezone: z.string().trim().max(100).optional().nullable(),
  currency: z.string().trim().min(3).max(3).optional().nullable(),
  workingDays: z.array(z.string()).optional().nullable(),
  operatingHoursStart: z.string().trim().max(20).optional().nullable(),
  operatingHoursEnd: z.string().trim().max(20).optional().nullable(),
  technicianStandardStartTime: z.string().trim().max(20).optional().nullable(),
  defaultVatEnabled: z.boolean().optional().nullable(),
  notificationPreferences: z.record(z.unknown()).optional().nullable(),
});

const advanceSchema = z.object({
  step: z.enum(['company', 'plan', 'team', 'import', 'integrations', 'operations', 'review']),
  markComplete: z.boolean().optional(),
  markSkipped: z.boolean().optional(),
});

type RouterDeps = {
  saasOnboardingService: SaasOnboardingService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof SaasOnboardingError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'SEAT_LIMIT_REACHED'
          ? 409
          : error.code === 'FORBIDDEN'
            ? 403
            : error.code === 'SUBSCRIPTION_REQUIRED'
              ? 402
              : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createSaasOnboardingRouter({
  saasOnboardingService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  // Company Owner / billing roles — not technicians/clients by default permission packs.
  const requireOwnerish = requireAnyPermission(
    '*',
    'company:manage',
    'settings:manage',
    'saas:manage',
    'users:manage',
  );

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/state', requireOwnerish, async (req, res) => {
    try {
      const auth = getAuth(req);
      const state = await saasOnboardingService.getState({
        companyId: auth.companyId,
        userId: auth.userId,
      });
      res.json({ data: { state } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/company', requireOwnerish, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = companySchema.parse(req.body);
      const state = await saasOnboardingService.saveCompanyDetails(
        { companyId: auth.companyId, userId: auth.userId },
        {
          ...body,
          mainEmail: body.mainEmail === '' ? null : body.mainEmail,
        },
      );
      res.json({ data: { state } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/plan', requireOwnerish, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = planSchema.parse(req.body);
      const state = await saasOnboardingService.selectPlan(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.json({ data: { state } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/team/invite', requireOwnerish, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = inviteSchema.parse(req.body);
      const state = await saasOnboardingService.inviteTeamMember(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.json({ data: { state } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/import', requireOwnerish, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = importModeSchema.parse(req.body);
      const state = await saasOnboardingService.markImportStep(
        { companyId: auth.companyId, userId: auth.userId },
        body.mode,
      );
      res.json({ data: { state } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/integrations/skip', requireOwnerish, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = skipIntegrationSchema.parse(req.body);
      const state = await saasOnboardingService.skipIntegration(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.json({ data: { state } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/integrations/complete', requireOwnerish, async (req, res) => {
    try {
      const auth = getAuth(req);
      const state = await saasOnboardingService.completeIntegrationsStep({
        companyId: auth.companyId,
        userId: auth.userId,
      });
      res.json({ data: { state } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/operations', requireOwnerish, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = operationsSchema.parse(req.body ?? {});
      const state = await saasOnboardingService.saveOperations(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.json({ data: { state } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/advance', requireOwnerish, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = advanceSchema.parse(req.body);
      const state = await saasOnboardingService.advance(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.json({ data: { state } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/activate', requireOwnerish, async (req, res) => {
    try {
      const auth = getAuth(req);
      const state = await saasOnboardingService.activate({
        companyId: auth.companyId,
        userId: auth.userId,
      });
      res.json({ data: { state } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
