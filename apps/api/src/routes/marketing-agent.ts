import { Router } from 'express';
import { z } from 'zod';
import type { MarketingAgentService } from '../services/marketing-agent.service.js';
import {
  MarketingAgentError,
  type MktAgentActor,
} from '../services/marketing-agent.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const channelSchema = z.enum([
  'facebook',
  'instagram',
  'tiktok',
  'linkedin',
  'google_business',
  'website',
  'email',
  'other',
]);

const contentKindSchema = z.enum([
  'post_idea',
  'caption',
  'hashtags',
  'campaign_idea',
  'seasonal_promo',
  'educational',
  'plumbing_tip',
]);

const campaignStatusSchema = z.enum([
  'draft',
  'planned',
  'active',
  'paused',
  'completed',
  'cancelled',
]);

const recommendationKindSchema = z.enum([
  'campaign_idea',
  'content_plan',
  'seasonal_promo',
  'channel_focus',
  'performance_review',
  'aura_handoff',
]);

const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(200),
  objective: z.string().trim().min(1).max(5000),
  channels: z.array(channelSchema).max(10).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  goalId: z.string().uuid().optional(),
  notes: z.string().trim().max(5000).optional(),
});

const updateCampaignSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  objective: z.string().trim().min(1).max(5000).optional(),
  status: campaignStatusSchema.optional(),
  channels: z.array(channelSchema).max(10).optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  goalId: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

const createDraftSchema = z.object({
  campaignId: z.string().uuid().optional(),
  contentKind: contentKindSchema,
  channel: channelSchema,
  title: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(8000),
  hashtags: z.array(z.string().trim().max(64)).max(30).optional(),
  submitForApproval: z.boolean().optional(),
});

const generateSchema = z.object({
  contentKind: contentKindSchema,
  channel: channelSchema.optional(),
  campaignId: z.string().uuid().optional(),
  topicHint: z.string().trim().max(500).optional(),
  submitForApproval: z.boolean().optional(),
});

const decideSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  notes: z.string().trim().max(2000).optional(),
});

const publishSchema = z.object({
  notes: z.string().trim().max(2000).optional(),
});

const createGoalSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
  targetMetric: z.string().trim().max(120).optional(),
  targetValue: z.number().int().min(0).max(1_000_000_000).optional(),
});

const createRecommendationSchema = z.object({
  kind: recommendationKindSchema,
  title: z.string().trim().min(1).max(200),
  recommendation: z.string().trim().min(1).max(5000),
  channel: channelSchema.optional(),
  campaignId: z.string().uuid().optional(),
});

type RouterDeps = {
  marketingAgentService: MarketingAgentService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): MktAgentActor {
  const auth = getAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function paramId(req: import('express').Request): string {
  const raw = req.params.id;
  return String(Array.isArray(raw) ? raw[0] : raw ?? '');
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof MarketingAgentError) {
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

export function createMarketingAgentRouter({
  marketingAgentService,
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
      const dashboard = await marketingAgentService.getDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          autoPublish: false as const,
          socialIntegrationsLive: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to load Marketing Agent dashboard' },
        });
      }
    }
  });

  router.get('/analytics', requireRead, async (req, res) => {
    try {
      const analytics = await marketingAgentService.getAnalytics(toActor(req));
      res.json({
        data: {
          analytics,
          engagementInvented: false as const,
          socialIntegrationsLive: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to load marketing analytics' },
        });
      }
    }
  });

  router.get('/campaigns', requireRead, async (req, res) => {
    try {
      const campaigns = await marketingAgentService.listCampaigns(toActor(req));
      res.json({ data: { campaigns, autoPublish: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to list campaigns' },
        });
      }
    }
  });

  router.post('/campaigns', requireWrite, async (req, res) => {
    const parsed = createCampaignSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
      return;
    }
    try {
      const campaign = await marketingAgentService.createCampaign(toActor(req), parsed.data);
      res.json({ data: { campaign, autoPublish: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to create campaign' },
        });
      }
    }
  });

  router.patch('/campaigns/:id', requireWrite, async (req, res) => {
    const parsed = updateCampaignSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
      return;
    }
    try {
      const campaign = await marketingAgentService.updateCampaign(
        toActor(req),
        paramId(req),
        parsed.data,
      );
      res.json({ data: { campaign, autoPublish: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to update campaign' },
        });
      }
    }
  });

  router.get('/content-drafts', requireRead, async (req, res) => {
    try {
      const drafts = await marketingAgentService.listContentDrafts(toActor(req));
      res.json({ data: { drafts, autoPublish: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to list content drafts' },
        });
      }
    }
  });

  router.post('/content-drafts', requireWrite, async (req, res) => {
    const parsed = createDraftSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
      return;
    }
    try {
      const draft = await marketingAgentService.createContentDraft(toActor(req), parsed.data);
      res.json({ data: { draft, autoPublish: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to create content draft' },
        });
      }
    }
  });

  router.post('/content-drafts/generate', requireWrite, async (req, res) => {
    const parsed = generateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
      return;
    }
    try {
      const draft = await marketingAgentService.generateContentDraft(toActor(req), parsed.data);
      res.json({
        data: {
          draft,
          autoPublish: false as const,
          note: 'Generated as draft template for Owner approval — not published.',
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to generate content draft' },
        });
      }
    }
  });

  router.post('/content-drafts/:id/decide', requireWrite, async (req, res) => {
    const parsed = decideSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
      return;
    }
    try {
      const draft = await marketingAgentService.decideContentDraft(
        toActor(req),
        paramId(req),
        parsed.data,
      );
      res.json({
        data: {
          draft,
          autoPublish: false as const,
          note: 'Approval does not publish — social integrations are not live; use publish request for gated path.',
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to decide content draft' },
        });
      }
    }
  });

  router.post('/content-drafts/:id/publish', requireWrite, async (req, res) => {
    const parsed = publishSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
      return;
    }
    try {
      const result = await marketingAgentService.requestPublish(
        toActor(req),
        paramId(req),
        parsed.data,
      );
      res.json({
        data: {
          draft: result.draft,
          published: false as const,
          gated: true as const,
          reason: result.reason,
          autoPublish: false as const,
          note: 'Publish execute gated — social platform integrations are not live. Nothing was posted.',
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to request publish' },
        });
      }
    }
  });

  router.get('/goals', requireRead, async (req, res) => {
    try {
      const goals = await marketingAgentService.listGoals(toActor(req));
      res.json({ data: { goals } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to list goals' },
        });
      }
    }
  });

  router.post('/goals', requireWrite, async (req, res) => {
    const parsed = createGoalSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
      return;
    }
    try {
      const goal = await marketingAgentService.createGoal(toActor(req), parsed.data);
      res.json({ data: { goal } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to create goal' },
        });
      }
    }
  });

  router.get('/recommendations', requireRead, async (req, res) => {
    try {
      const recommendations = await marketingAgentService.listRecommendations(toActor(req));
      res.json({ data: { recommendations, autoExecuted: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to list recommendations' },
        });
      }
    }
  });

  router.post('/recommendations', requireWrite, async (req, res) => {
    const parsed = createRecommendationSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
      return;
    }
    try {
      const recommendation = await marketingAgentService.createRecommendation(
        toActor(req),
        parsed.data,
      );
      res.json({ data: { recommendation, autoExecuted: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to create recommendation' },
        });
      }
    }
  });

  router.post('/recommendations/:id/decide', requireWrite, async (req, res) => {
    const parsed = decideSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
      return;
    }
    try {
      const recommendation = await marketingAgentService.decideRecommendation(
        toActor(req),
        paramId(req),
        parsed.data,
      );
      res.json({ data: { recommendation, autoExecuted: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to decide recommendation' },
        });
      }
    }
  });

  return router;
}
