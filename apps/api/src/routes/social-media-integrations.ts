import { Router } from 'express';
import { z } from 'zod';
import type { SocialMediaIntegrationsService } from '../services/social-media-integrations.service.js';
import {
  SocialMediaIntegrationsError,
  type SocialMediaActor,
} from '../services/social-media-integrations.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const platformSchema = z.enum([
  'facebook',
  'instagram',
  'tiktok',
  'linkedin',
  'google_business',
]);

const outboundKindSchema = z.enum([
  'publish_post',
  'reply_comment',
  'reply_message',
  'reply_review',
]);

const upsertSchema = z.object({
  platform: platformSchema,
  displayName: z.string().trim().max(200).optional(),
  externalAccountId: z.string().trim().max(256).optional(),
  pageOrProfileUrl: z.string().trim().max(1000).optional(),
  accessToken: z.string().trim().min(1).max(8000).optional(),
  refreshToken: z.string().trim().min(1).max(8000).optional(),
  syncEnabled: z.boolean().optional(),
  permissions: z
    .object({
      readComments: z.boolean().optional(),
      readMessages: z.boolean().optional(),
      readMentions: z.boolean().optional(),
      readReviews: z.boolean().optional(),
      readEngagement: z.boolean().optional(),
    })
    .optional(),
});

const platformBodySchema = z.object({ platform: platformSchema });

const createDraftSchema = z.object({
  platform: platformSchema,
  outboundKind: outboundKindSchema,
  title: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(8000),
  targetItemId: z.string().uuid().optional(),
  marketingDraftId: z.string().uuid().optional(),
  submitForApproval: z.boolean().optional(),
});

const suggestReplySchema = z.object({
  platform: platformSchema,
  targetItemId: z.string().uuid(),
  outboundKind: z.enum(['reply_comment', 'reply_message', 'reply_review']).optional(),
  submitForApproval: z.boolean().optional(),
});

const queueMarketingSchema = z.object({
  marketingDraftId: z.string().uuid(),
  platform: platformSchema,
  submitForApproval: z.boolean().optional(),
});

const decideSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  notes: z.string().trim().max(2000).optional(),
});

const publishSchema = z.object({
  notes: z.string().trim().max(2000).optional(),
});

type RouterDeps = {
  socialMediaIntegrationsService: SocialMediaIntegrationsService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): SocialMediaActor {
  const auth = getAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof SocialMediaIntegrationsError) {
    const status =
      error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'NOT_CONFIGURED'
            ? 503
            : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

export function createSocialMediaIntegrationsRouter({
  socialMediaIntegrationsService,
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
    'agents:read',
  );
  const requireWrite = requireAnyPermission(
    'marketing:write',
    'marketing_intelligence:write',
    'marketing_intelligence:manage',
  );

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const dashboard = await socialMediaIntegrationsService.getDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          autoPublish: false as const,
          autoReply: false as const,
          livePublishAvailable: false as const,
          liveSyncAvailable: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/connections', requireRead, async (req, res) => {
    try {
      const dashboard = await socialMediaIntegrationsService.getDashboard(toActor(req));
      res.json({
        data: {
          connections: dashboard.connections,
          platforms: dashboard.platforms,
          autoPublish: false as const,
          autoReply: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/connections', requireWrite, async (req, res) => {
    try {
      const parsed = upsertSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        });
        return;
      }
      const connection = await socialMediaIntegrationsService.upsertConnection(
        toActor(req),
        parsed.data,
      );
      res.status(201).json({
        data: {
          connection,
          autoPublish: false as const,
          autoReply: false as const,
          liveProviderVerified: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/connections/disconnect', requireWrite, async (req, res) => {
    try {
      const parsed = platformBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        });
        return;
      }
      const connection = await socialMediaIntegrationsService.disconnect(
        toActor(req),
        parsed.data.platform,
      );
      res.json({
        data: { connection, autoPublish: false as const, autoReply: false as const },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/connections/health', requireWrite, async (req, res) => {
    try {
      const parsed = platformBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        });
        return;
      }
      const result = await socialMediaIntegrationsService.checkHealth(
        toActor(req),
        parsed.data.platform,
      );
      res.json({
        data: {
          ...result,
          liveProviderVerified: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/sync', requireWrite, async (req, res) => {
    try {
      const parsed = platformBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        });
        return;
      }
      const syncRun = await socialMediaIntegrationsService.requestSync(toActor(req), parsed.data);
      res.status(201).json({
        data: {
          syncRun,
          itemsIngested: 0 as const,
          liveSyncAvailable: false as const,
          demoData: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/monitoring', requireRead, async (req, res) => {
    try {
      const items = await socialMediaIntegrationsService.listMonitoredItems(toActor(req));
      res.json({
        data: {
          items,
          inventedEngagement: false as const,
          emptyWhenNone: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/outbound-drafts', requireWrite, async (req, res) => {
    try {
      const parsed = createDraftSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        });
        return;
      }
      const draft = await socialMediaIntegrationsService.createOutboundDraft(
        toActor(req),
        parsed.data,
      );
      res.status(201).json({
        data: {
          draft,
          autoPublish: false as const,
          autoReply: false as const,
          socialPublishAvailable: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/outbound-drafts/queue-marketing', requireWrite, async (req, res) => {
    try {
      const parsed = queueMarketingSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        });
        return;
      }
      const draft = await socialMediaIntegrationsService.queueMarketingDraft(
        toActor(req),
        parsed.data,
      );
      res.status(201).json({
        data: {
          draft,
          autoPublish: false as const,
          autoReply: false as const,
          workflow: ['draft', 'owner_review', 'approved', 'execute_gated'] as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/outbound-drafts/suggest-reply', requireWrite, async (req, res) => {
    try {
      const parsed = suggestReplySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        });
        return;
      }
      const draft = await socialMediaIntegrationsService.suggestReply(toActor(req), parsed.data);
      res.status(201).json({
        data: {
          draft,
          autoPublish: false as const,
          autoReply: false as const,
          sent: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/outbound-drafts/:id/decide', requireWrite, async (req, res) => {
    try {
      const parsed = decideSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        });
        return;
      }
      const draftId = String(req.params.id);
      const draft = await socialMediaIntegrationsService.decideOutboundDraft(
        toActor(req),
        draftId,
        parsed.data,
      );
      res.json({
        data: { draft, autoPublish: false as const, autoReply: false as const },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/outbound-drafts/:id/publish', requireWrite, async (req, res) => {
    try {
      const parsed = publishSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        });
        return;
      }
      const draftId = String(req.params.id);
      const result = await socialMediaIntegrationsService.requestPublish(
        toActor(req),
        draftId,
        parsed.data,
      );
      res.json({
        data: {
          ...result,
          published: false as const,
          gated: true as const,
          autoPublish: false as const,
          autoReply: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
