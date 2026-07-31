import { Router } from 'express';
import { z } from 'zod';
import type { MarketingService } from '../services/marketing.service.js';
import { MarketingError } from '../services/marketing.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const campaignStatusSchema = z.enum(['draft', 'active', 'paused', 'completed', 'cancelled']);
const campaignTypeSchema = z.enum([
  'retention',
  'maintenance',
  'seasonal',
  'engagement',
  'acquisition',
  'custom',
]);
const segmentTypeSchema = z.enum([
  'high_value',
  'repeat_service',
  'dormant',
  'new_customer',
  'high_engagement',
  'custom',
]);
const activityTypeSchema = z.enum([
  'email_draft',
  'content',
  'outreach',
  'social_draft',
  'note',
  'other',
]);
const recommendationStatusSchema = z.enum(['pending', 'accepted', 'dismissed', 'completed']);

const createSegmentSchema = z.object({
  segmentKey: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  segmentType: segmentTypeSchema.optional(),
  criteria: z.record(z.unknown()).optional(),
});

const updateSegmentSchema = createSegmentSchema.partial();

const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  status: campaignStatusSchema.optional(),
  campaignType: campaignTypeSchema.optional(),
  targetSegmentKey: z.string().trim().max(100).optional().nullable(),
  config: z.record(z.unknown()).optional(),
});

const updateCampaignSchema = createCampaignSchema.partial();

const createActivitySchema = z.object({
  campaignId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  activityType: activityTypeSchema.optional(),
  subject: z.string().trim().max(500).optional().nullable(),
  body: z.string().trim().min(1).max(8000),
  occurredAt: z.string().datetime().optional(),
});

const updateRecommendationSchema = z.object({
  status: recommendationStatusSchema,
});

type MarketingRouterDeps = {
  marketingService: MarketingService;
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

export function createMarketingRouter({
  marketingService,
  teamService,
  jwtSecret,
  authService,
}: MarketingRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission('marketing:read', 'marketing:write', 'customers:read');
  const requireWrite = requireAnyPermission('marketing:write', 'communications:write');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/stats', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const stats = await marketingService.getStats(companyId);
    res.json({ data: { stats } });
  });

  router.get('/segments', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const segments = await marketingService.listSegments(companyId);
    res.json({ data: { segments } });
  });

  router.post('/segments', requireWrite, async (req, res) => {
    const parsed = createSegmentSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid segment payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const segment = await marketingService.createSegment(auth, parsed.data);
      res.status(201).json({ data: { segment } });
    } catch (error) {
      handleMarketingError(res, error);
    }
  });

  router.patch('/segments/:id', requireWrite, async (req, res) => {
    const parsed = updateSegmentSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid segment payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const segment = await marketingService.updateSegment(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { segment } });
    } catch (error) {
      handleMarketingError(res, error);
    }
  });

  router.get('/campaigns', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const campaigns = await marketingService.listCampaigns(companyId);
    res.json({ data: { campaigns } });
  });

  router.post('/campaigns', requireWrite, async (req, res) => {
    const parsed = createCampaignSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid campaign payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const campaign = await marketingService.createCampaign(auth, parsed.data);
      res.status(201).json({ data: { campaign } });
    } catch (error) {
      handleMarketingError(res, error);
    }
  });

  router.patch('/campaigns/:id', requireWrite, async (req, res) => {
    const parsed = updateCampaignSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid campaign payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const campaign = await marketingService.updateCampaign(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { campaign } });
    } catch (error) {
      handleMarketingError(res, error);
    }
  });

  router.get('/activities', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const campaignId = typeof req.query.campaignId === 'string' ? req.query.campaignId : undefined;
    const activities = await marketingService.listActivities(companyId, campaignId);
    res.json({ data: { activities } });
  });

  router.post('/activities', requireWrite, async (req, res) => {
    const parsed = createActivitySchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid activity payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const activity = await marketingService.createActivity(auth, parsed.data);
      res.status(201).json({ data: { activity } });
    } catch (error) {
      handleMarketingError(res, error);
    }
  });

  router.get('/recommendations', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const recommendations = await marketingService.listRecommendations(companyId);
    res.json({ data: { recommendations } });
  });

  router.post('/recommendations/generate', requireWrite, async (req, res) => {
    try {
      const { companyId } = getAuth(req);
      const recommendations = await marketingService.generateRecommendations(companyId);
      res.status(201).json({ data: { recommendations } });
    } catch (error) {
      handleMarketingError(res, error);
    }
  });

  router.patch('/recommendations/:id', requireWrite, async (req, res) => {
    const parsed = updateRecommendationSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid recommendation payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const recommendation = await marketingService.updateRecommendation(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { recommendation } });
    } catch (error) {
      handleMarketingError(res, error);
    }
  });

  router.get('/content-suggestions', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const suggestions = await marketingService.getContentSuggestions(companyId);
    res.json({ data: { suggestions } });
  });

  return router;
}

function handleMarketingError(res: import('express').Response, error: unknown) {
  if (error instanceof MarketingError) {
    res.status(error.code === 'NOT_FOUND' ? 404 : 400).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  throw error;
}
