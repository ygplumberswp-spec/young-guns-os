import { Router } from 'express';
import { z } from 'zod';
import type { ContentReputationIntelligenceService } from '../services/content-reputation-intelligence.service.js';
import {
  ContentReputationIntelligenceError,
  type CriActor,
} from '../services/content-reputation-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const categorySchema = z.enum([
  'content_idea',
  'caption',
  'hashtags',
  'campaign_idea',
  'seasonal',
  'education',
  'customer_focused',
  'maintenance_reminder',
  'geyser_education',
  'before_after',
  'trust_building',
  'video_review',
  'trend',
  'improvement',
]);

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

const decideSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  notes: z.string().trim().max(2000).optional(),
});

const generateSchema = z.object({
  category: categorySchema,
  channel: channelSchema.optional(),
  topicHint: z.string().trim().max(500).optional(),
  marketingDraftId: z.string().uuid().optional(),
  sourceText: z.string().trim().max(8000).optional(),
  submitForApproval: z.boolean().optional(),
});

const scoreSchema = z.object({
  title: z.string().trim().max(500).optional(),
  body: z.string().trim().max(8000).optional().default(''),
  hashtags: z.array(z.string().trim().max(64)).max(30).optional(),
  channel: channelSchema.optional(),
  marketingDraftId: z.string().uuid().optional(),
});

const createReviewSchema = z.object({
  source: z
    .enum(['owner_entered', 'social_monitoring', 'cx', 'google_business', 'other'])
    .optional(),
  platform: z.string().trim().max(80).optional(),
  authorName: z.string().trim().max(200).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  body: z.string().trim().min(1).max(8000),
  occurredAt: z.string().datetime().optional(),
  socialItemId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
});

const createResponseSchema = z.object({
  reviewId: z.string().uuid(),
  title: z.string().trim().max(500).optional(),
  body: z.string().trim().max(8000).optional(),
  submitForApproval: z.boolean().optional(),
});

const createCompetitorSchema = z.object({
  name: z.string().trim().min(1).max(200),
  website: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(5000).optional(),
});

const createObservationSchema = z.object({
  competitorId: z.string().uuid().optional(),
  kind: z.enum([
    'industry_trend',
    'market_observation',
    'pricing_observation',
    'competitor_note',
    'other',
  ]),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  observedAt: z.string().datetime().optional(),
});

const createInsightSchema = z.object({
  target: z.enum([
    'command_centre',
    'executive_dashboard',
    'marketing_agent',
    'social_media',
    'communication_timeline',
    'customer_360',
    'cx',
  ]),
  title: z.string().trim().min(1).max(200),
  insight: z.string().trim().min(1).max(5000),
  href: z.string().trim().max(500).optional(),
  sourceSuggestionId: z.string().uuid().optional(),
  sourceReviewId: z.string().uuid().optional(),
});

const ackInsightSchema = z.object({
  status: z.enum(['acknowledged', 'dismissed']),
});

type RouterDeps = {
  contentReputationIntelligenceService: ContentReputationIntelligenceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): CriActor {
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
  if (error instanceof ContentReputationIntelligenceError) {
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

export function createContentReputationIntelligenceRouter({
  contentReputationIntelligenceService,
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
      const dashboard = await contentReputationIntelligenceService.getDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          autoPublish: false as const,
          autoReply: false as const,
          inventedScores: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: {
            code: 'INTERNAL',
            message: 'Unable to load Content & Reputation Intelligence dashboard',
          },
        });
      }
    }
  });

  router.post('/content/score', requireRead, async (req, res) => {
    try {
      const body = scoreSchema.parse(req.body);
      const quality = await contentReputationIntelligenceService.scoreContent(toActor(req), body);
      res.json({
        data: {
          quality,
          inventedScores: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION', message: error.message } });
        return;
      }
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to score content' },
        });
      }
    }
  });

  router.post('/content/suggestions/generate', requireWrite, async (req, res) => {
    try {
      const body = generateSchema.parse(req.body);
      const suggestion = await contentReputationIntelligenceService.generateSuggestion(
        toActor(req),
        body,
      );
      res.status(201).json({
        data: {
          suggestion,
          autoPublish: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION', message: error.message } });
        return;
      }
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to generate content suggestion' },
        });
      }
    }
  });

  router.post('/content/suggestions/:id/decide', requireWrite, async (req, res) => {
    try {
      const body = decideSchema.parse(req.body);
      const suggestion = await contentReputationIntelligenceService.decideSuggestion(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          suggestion,
          autoPublish: false as const,
          published: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION', message: error.message } });
        return;
      }
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to decide content suggestion' },
        });
      }
    }
  });

  router.post('/reviews', requireWrite, async (req, res) => {
    try {
      const body = createReviewSchema.parse(req.body);
      const review = await contentReputationIntelligenceService.createReview(toActor(req), body);
      res.status(201).json({
        data: {
          review,
          invented: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION', message: error.message } });
        return;
      }
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to create review' },
        });
      }
    }
  });

  router.post('/reviews/sync-social', requireWrite, async (req, res) => {
    try {
      const result = await contentReputationIntelligenceService.syncSocialReviewsIntoFoundation(
        toActor(req),
      );
      res.json({
        data: {
          ...result,
          invented: false as const,
          autoReply: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to sync social reviews' },
        });
      }
    }
  });

  router.post('/reviews/response-drafts', requireWrite, async (req, res) => {
    try {
      const body = createResponseSchema.parse(req.body);
      const draft = await contentReputationIntelligenceService.createReviewResponseDraft(
        toActor(req),
        body,
      );
      res.status(201).json({
        data: {
          draft,
          autoReply: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION', message: error.message } });
        return;
      }
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to create review response draft' },
        });
      }
    }
  });

  router.post('/reviews/response-drafts/:id/decide', requireWrite, async (req, res) => {
    try {
      const body = decideSchema.parse(req.body);
      const draft = await contentReputationIntelligenceService.decideReviewResponse(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          draft,
          autoReply: false as const,
          published: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION', message: error.message } });
        return;
      }
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to decide review response draft' },
        });
      }
    }
  });

  router.post('/competitors', requireWrite, async (req, res) => {
    try {
      const body = createCompetitorSchema.parse(req.body);
      const competitor = await contentReputationIntelligenceService.createCompetitor(
        toActor(req),
        body,
      );
      res.status(201).json({
        data: {
          competitor,
          ownerEntered: true as const,
          invented: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION', message: error.message } });
        return;
      }
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to create competitor' },
        });
      }
    }
  });

  router.post('/observations', requireWrite, async (req, res) => {
    try {
      const body = createObservationSchema.parse(req.body);
      const observation = await contentReputationIntelligenceService.createObservation(
        toActor(req),
        body,
      );
      res.status(201).json({
        data: {
          observation,
          scraping: false as const,
          invented: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION', message: error.message } });
        return;
      }
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to create observation' },
        });
      }
    }
  });

  router.post('/aura-insights', requireWrite, async (req, res) => {
    try {
      const body = createInsightSchema.parse(req.body);
      const insight = await contentReputationIntelligenceService.createAuraInsight(
        toActor(req),
        body,
      );
      res.status(201).json({
        data: {
          insight,
          invented: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION', message: error.message } });
        return;
      }
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to create AURA insight' },
        });
      }
    }
  });

  router.post('/aura-insights/:id/acknowledge', requireWrite, async (req, res) => {
    try {
      const body = ackInsightSchema.parse(req.body);
      const insight = await contentReputationIntelligenceService.acknowledgeInsight(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({ data: { insight } });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION', message: error.message } });
        return;
      }
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to acknowledge AURA insight' },
        });
      }
    }
  });

  return router;
}
