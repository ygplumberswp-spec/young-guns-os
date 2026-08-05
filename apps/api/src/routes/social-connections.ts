import { Router } from 'express';
import { z } from 'zod';
import type { SocialConnectionService } from '../services/social-connection.service.js';
import {
  SocialConnectionError,
  type SocialConnectionActor,
} from '../services/social-connection.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const providerSchema = z.enum(['facebook', 'instagram', 'tiktok']);

const startOAuthSchema = z.object({
  provider: providerSchema,
  returnPath: z.string().trim().max(500).optional(),
});

const selectAccountSchema = z.object({
  provider: providerSchema,
  selection: z.object({
    facebookPageId: z.string().trim().max(256).optional(),
    instagramBusinessAccountId: z.string().trim().max(256).optional(),
    googleBusinessAccountId: z.string().trim().max(256).optional(),
    googleBusinessLocationId: z.string().trim().max(256).optional(),
    whatsappBusinessAccountId: z.string().trim().max(256).optional(),
    whatsappPhoneNumberId: z.string().trim().max(256).optional(),
    tiktokAccountId: z.string().trim().max(256).optional(),
  }),
});

const providerBodySchema = z.object({ provider: providerSchema });

type RouterDeps = {
  socialConnectionService: SocialConnectionService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): SocialConnectionActor {
  const auth = getAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof SocialConnectionError) {
    const status =
      error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'NOT_CONFIGURED' || error.code === 'PROVIDER_REVIEW_REQUIRED'
            ? 503
            : error.code === 'INVALID_STATE' || error.code === 'STATE_REPLAY'
              ? 400
              : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

export function createSocialConnectionsRouter({
  socialConnectionService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'marketing:read',
    'marketing:write',
    'marketing_intelligence:read',
    'marketing_intelligence:write',
    'marketing_intelligence:manage',
    'integrations:read',
    'integrations:manage',
  );
  const requireManage = requireAnyPermission(
    'marketing:write',
    'marketing_intelligence:write',
    'marketing_intelligence:manage',
    'integrations:manage',
  );

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const dashboard = await socialConnectionService.getDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          publishingAvailable: false as const,
          schedulingAvailable: false as const,
          analyticsAvailable: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/setup/:provider', requireRead, async (req, res) => {
    try {
      const parsed = providerSchema.safeParse(req.params.provider);
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid provider' } });
        return;
      }
      const requirements = socialConnectionService.getSetupRequirements(parsed.data);
      res.json({ data: { requirements } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/oauth/start', requireManage, async (req, res) => {
    try {
      const parsed = startOAuthSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        });
        return;
      }
      const result = await socialConnectionService.startOAuth(toActor(req), parsed.data);
      res.json({
        data: {
          authorizationUrl: result.authorizationUrl,
          autoPublish: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/oauth/callback', async (req, res) => {
    try {
      const parsed = providerSchema.safeParse(req.query.provider);
      if (!parsed.success) {
        res.status(400).send('Invalid provider');
        return;
      }
      const redirectUrl = await socialConnectionService.handleOAuthCallback({
        provider: parsed.data,
        code: typeof req.query.code === 'string' ? req.query.code : undefined,
        state: typeof req.query.state === 'string' ? req.query.state : undefined,
        error: typeof req.query.error === 'string' ? req.query.error : undefined,
        errorDescription:
          typeof req.query.error_description === 'string'
            ? req.query.error_description
            : undefined,
      });
      res.redirect(302, redirectUrl);
    } catch (error) {
      if (error instanceof SocialConnectionError) {
        res.redirect(
          302,
          socialConnectionService.buildFrontendRedirect({
            returnPath: '/integrations',
            provider: (req.query.provider as 'facebook') ?? 'facebook',
            outcome: 'error',
            message: error.message,
          }),
        );
        return;
      }
      throw error;
    }
  });

  router.get('/accounts/:provider', requireManage, async (req, res) => {
    try {
      const parsed = providerSchema.safeParse(req.params.provider);
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid provider' } });
        return;
      }
      const accounts = await socialConnectionService.listDiscoveredAccounts(
        toActor(req),
        parsed.data,
      );
      res.json({
        data: {
          accounts,
          accessToken: undefined,
          refreshToken: undefined,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/accounts/select', requireManage, async (req, res) => {
    try {
      const parsed = selectAccountSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        });
        return;
      }
      const card = await socialConnectionService.selectAccount(toActor(req), parsed.data);
      res.json({
        data: {
          provider: card,
          credentials: undefined,
          accessToken: undefined,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/health', requireManage, async (req, res) => {
    try {
      const parsed = providerBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        });
        return;
      }
      const result = await socialConnectionService.checkHealth(toActor(req), parsed.data.provider);
      res.json({ data: result });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/reconnect', requireManage, async (req, res) => {
    try {
      const parsed = providerBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        });
        return;
      }
      const result = await socialConnectionService.reconnect(toActor(req), parsed.data.provider);
      res.json({ data: result });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/disconnect', requireManage, async (req, res) => {
    try {
      const parsed = providerBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        });
        return;
      }
      const card = await socialConnectionService.disconnect(toActor(req), parsed.data.provider);
      res.json({ data: { provider: card } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
