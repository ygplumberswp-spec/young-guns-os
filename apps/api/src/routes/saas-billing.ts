import { Router } from 'express';
import { z } from 'zod';
import type { SaasBillingCheckoutService } from '../services/saas-billing/saas-billing-checkout.service.js';
import { SaasBillingCheckoutError } from '../services/saas-billing/saas-billing-checkout.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const checkoutSchema = z.object({
  planId: z.string().uuid(),
  extraAdminOfficeSeats: z.number().int().min(0).max(500).optional(),
  extraTechnicianSeats: z.number().int().min(0).max(5000).optional(),
  clientQuotedTotalCents: z.number().int().optional(),
});

const manualSchema = z.object({
  targetCompanyId: z.string().uuid(),
  planId: z.string().uuid(),
  amountCents: z.number().int().min(0),
  currency: z.string().trim().min(3).max(3),
  paidThroughAt: z.string().trim().min(1),
  method: z.enum(['eft', 'invoice', 'enterprise_contract', 'other']),
  externalReference: z.string().trim().min(1).max(300),
  periodStartAt: z.string().trim().min(1).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

type RouterDeps = {
  saasBillingCheckoutService: SaasBillingCheckoutService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof SaasBillingCheckoutError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'FORBIDDEN'
          ? 403
          : error.code === 'INVALID_SIGNATURE'
            ? 401
            : error.code === 'AMOUNT_TAMPER_REJECTED'
              ? 400
              : error.code === 'PROVIDER_CAPABILITY_REQUIRED'
                ? 503
                : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createSaasBillingRouter({
  saasBillingCheckoutService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireOwnerish = requireAnyPermission(
    '*',
    'company:manage',
    'settings:manage',
    'saas:manage',
    'saas:read',
  );
  const requirePlatform = requireAnyPermission('platform:manage', '*');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/provider-capability', requireOwnerish, async (_req, res) => {
    res.json({ data: { capability: saasBillingCheckoutService.getProviderCapability() } });
  });

  router.post('/checkout/preview', requireOwnerish, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = checkoutSchema.parse(req.body);
      const summary = await saasBillingCheckoutService.previewCheckout(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.json({ data: { summary } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/checkout', requireOwnerish, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = checkoutSchema.parse(req.body);
      const session = await saasBillingCheckoutService.createCheckoutSession(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.status(201).json({ data: { session } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/checkout/:sessionId', requireOwnerish, async (req, res) => {
    try {
      const auth = getAuth(req);
      const session = await saasBillingCheckoutService.getCheckoutSession(
        { companyId: auth.companyId, userId: auth.userId },
        String(req.params.sessionId),
      );
      res.json({ data: { session } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/checkout/:sessionId/browser-return', requireOwnerish, async (req, res) => {
    try {
      const auth = getAuth(req);
      const session = await saasBillingCheckoutService.markBrowserReturn(
        { companyId: auth.companyId, userId: auth.userId },
        String(req.params.sessionId),
      );
      res.json({ data: { session } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/checkout/:sessionId/cancel', requireOwnerish, async (req, res) => {
    try {
      const auth = getAuth(req);
      const session = await saasBillingCheckoutService.cancelCheckout(
        { companyId: auth.companyId, userId: auth.userId },
        String(req.params.sessionId),
      );
      res.json({ data: { session } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/history', requireOwnerish, async (req, res) => {
    try {
      const auth = getAuth(req);
      const history = await saasBillingCheckoutService.listBillingHistory({
        companyId: auth.companyId,
        userId: auth.userId,
      });
      res.json({ data: { history } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/cancel-at-period-end', requireOwnerish, async (req, res) => {
    try {
      const auth = getAuth(req);
      const result = await saasBillingCheckoutService.requestCancelAtPeriodEnd({
        companyId: auth.companyId,
        userId: auth.userId,
      });
      res.json({ data: result });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/manual-activation', requirePlatform, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = manualSchema.parse(req.body);
      const result = await saasBillingCheckoutService.activateManualBilling(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.json({ data: result });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}

export function createSaasBillingWebhookRouter({
  saasBillingCheckoutService,
}: {
  saasBillingCheckoutService: SaasBillingCheckoutService;
}): Router {
  const router = Router();

  router.post('/:providerKey', async (req, res) => {
    try {
      const rawBody =
        typeof (req as { rawBody?: string }).rawBody === 'string'
          ? (req as { rawBody?: string }).rawBody!
          : JSON.stringify(req.body ?? {});
      const result = await saasBillingCheckoutService.processProviderWebhook({
        providerKey: String(req.params.providerKey),
        rawBody,
        headers: req.headers as Record<string, string | string[] | undefined>,
      });
      res.json({ data: result });
    } catch (error) {
      if (error instanceof SaasBillingCheckoutError) {
        const status =
          error.code === 'INVALID_SIGNATURE'
            ? 401
            : error.code === 'PROVIDER_CAPABILITY_REQUIRED'
              ? 503
              : 400;
        res.status(status).json({ error: { code: error.code, message: error.message } });
        return;
      }
      throw error;
    }
  });

  return router;
}
