import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseMarketingIntelligenceService } from '../services/enterprise-marketing-intelligence.service.js';
import { EnterpriseMarketingIntelligenceError } from '../services/enterprise-marketing-intelligence.service.js';
import type { PortalAuthService } from '../services/portal-auth.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  createPortalAuthMiddleware,
  type PortalAuthenticatedRequest,
} from '../middleware/portal-auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const platformConfigSchema = z.object({
  marketingStandards: z.record(z.unknown()).optional(),
  providerAdapterTemplates: z.record(z.unknown()).optional(),
  brandTemplates: z.record(z.unknown()).optional(),
  campaignTemplates: z.record(z.unknown()).optional(),
  contentTemplates: z.record(z.unknown()).optional(),
  attributionStandards: z.record(z.unknown()).optional(),
  auditRetentionDays: z.number().int().min(1).optional(),
});

const strategySchema = z.object({
  name: z.string().trim().min(1).max(200),
  strategyKey: z.string().trim().min(1).max(100),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  goals: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
});

const brandSchema = z.object({
  name: z.string().trim().min(1).max(200),
  brandKey: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional(),
  config: z.record(z.unknown()).optional(),
});

const brandAssetSchema = z.object({
  brandId: z.string().uuid(),
  assetType: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  assetKey: z.string().trim().min(1).max(100),
  fileUrl: z.string().trim().max(2000).optional(),
  config: z.record(z.unknown()).optional(),
});

const audienceSchema = z.object({
  name: z.string().trim().min(1).max(200),
  audienceKey: z.string().trim().min(1).max(100),
  audienceType: z.string().trim().max(100).optional(),
  criteria: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
});

const suppressionListSchema = z.object({
  name: z.string().trim().min(1).max(200),
  listKey: z.string().trim().min(1).max(100),
  listType: z.string().trim().max(100).optional(),
  config: z.record(z.unknown()).optional(),
});

const campaignPlanSchema = z.object({
  name: z.string().trim().min(1).max(200),
  planKey: z.string().trim().min(1).max(100),
  strategyId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  audienceId: z.string().uuid().optional(),
  budgetCents: z.number().int().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});

const contentItemSchema = z.object({
  campaignPlanId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(1).max(100),
  body: z.string().trim().max(50000).optional(),
  config: z.record(z.unknown()).optional(),
});

const creativeRequestSchema = z.object({
  campaignPlanId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  requestType: z.string().trim().min(1).max(100),
  brief: z.string().trim().max(5000).optional(),
  config: z.record(z.unknown()).optional(),
});

const socialAccountSchema = z.object({
  brandId: z.string().uuid().optional(),
  providerType: z.string().trim().min(1).max(100),
  accountName: z.string().trim().min(1).max(200),
  accountHandle: z.string().trim().max(200).optional(),
  externalId: z.string().trim().max(200).optional(),
  config: z.record(z.unknown()).optional(),
});

const socialPostSchema = z.object({
  socialAccountId: z.string().uuid().optional(),
  campaignPlanId: z.string().uuid().optional(),
  title: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1),
  scheduledAt: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});

const reviewSchema = z.object({
  platform: z.string().trim().min(1).max(100),
  rating: z.number().optional(),
  reviewText: z.string().trim().max(5000).optional(),
  author: z.string().trim().max(200).optional(),
  reviewedAt: z.string().optional(),
});

const reviewResponseSchema = z.object({
  reviewId: z.string().uuid(),
  responseText: z.string().trim().min(1).max(5000),
});

const adAccountSchema = z.object({
  providerType: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  externalAccountId: z.string().trim().max(200).optional(),
  config: z.record(z.unknown()).optional(),
});

const adCampaignSchema = z.object({
  adAccountId: z.string().uuid().optional(),
  campaignPlanId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  budgetCents: z.number().int().optional(),
  config: z.record(z.unknown()).optional(),
});

const adBudgetSchema = z.object({
  adCampaignId: z.string().uuid(),
  budgetType: z.string().trim().min(1).max(100),
  amountCents: z.number().int().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});

const seoKeywordSchema = z.object({
  keyword: z.string().trim().min(1).max(200),
  searchVolume: z.number().int().optional(),
  difficulty: z.number().optional(),
  currentRank: z.number().int().optional(),
  targetUrl: z.string().trim().max(2000).optional(),
  config: z.record(z.unknown()).optional(),
});

const localPresenceSchema = z.object({
  name: z.string().trim().min(1).max(200),
  locationKey: z.string().trim().min(1).max(100),
  address: z.string().trim().max(500).optional(),
  config: z.record(z.unknown()).optional(),
});

const websiteSchema = z.object({
  name: z.string().trim().min(1).max(200),
  domain: z.string().trim().min(1).max(200),
  config: z.record(z.unknown()).optional(),
});

const landingPageSchema = z.object({
  websiteId: z.string().uuid().optional(),
  campaignPlanId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(200),
  config: z.record(z.unknown()).optional(),
});

const emailCampaignSchema = z.object({
  campaignPlanId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  subject: z.string().trim().max(500).optional(),
  scheduledAt: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});

const messagingCampaignSchema = z.object({
  campaignPlanId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  channel: z.string().trim().min(1).max(100),
  config: z.record(z.unknown()).optional(),
});

const customerJourneySchema = z.object({
  name: z.string().trim().min(1).max(200),
  journeyKey: z.string().trim().min(1).max(100),
  config: z.record(z.unknown()).optional(),
});

const attributionRecordSchema = z.object({
  campaignPlanId: z.string().uuid().optional(),
  channel: z.string().trim().min(1).max(100),
  touchpointType: z.string().trim().max(100).optional(),
  attributedValueCents: z.number().int().optional(),
  config: z.record(z.unknown()).optional(),
});

const referralCampaignSchema = z.object({
  name: z.string().trim().min(1).max(200),
  campaignKey: z.string().trim().min(1).max(100),
  config: z.record(z.unknown()).optional(),
});

const calendarEventSchema = z.object({
  campaignPlanId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  eventType: z.string().trim().max(100).optional(),
  startsAt: z.string(),
  endsAt: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});

const experimentSchema = z.object({
  name: z.string().trim().min(1).max(200),
  experimentKey: z.string().trim().min(1).max(100),
  experimentType: z.string().trim().max(100).optional(),
  config: z.record(z.unknown()).optional(),
});

const marketIntelligenceSchema = z.object({
  recordType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  source: z.string().trim().max(200).optional(),
  confidenceScore: z.number().optional(),
  data: z.record(z.unknown()).optional(),
});

const providerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  providerType: z.string().trim().min(1).max(100),
  syncDirection: z.string().trim().max(50).optional(),
  syncFrequency: z.string().trim().max(100).optional(),
  fieldMappings: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
});

const marketingDraftSchema = z.object({
  draftType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  sourceRecords: z.record(z.unknown()).optional(),
  aiGenerated: z.boolean().optional(),
});

const roiSnapshotSchema = z.object({
  campaignPlanId: z.string().uuid().optional(),
  spendCents: z.number().int().optional(),
  revenueCents: z.number().int().optional(),
  config: z.record(z.unknown()).optional(),
});

type RouterDeps = {
  enterpriseMarketingIntelligenceService: EnterpriseMarketingIntelligenceService;
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

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0]! : value;
}

function staffScope(req: import('express').Request) {
  const auth = getAuth(req);
  return { companyId: auth.companyId, userId: auth.userId };
}

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof EnterpriseMarketingIntelligenceError) {
    const status =
      error.code === 'NOT_FOUND' ? 404 : error.code === 'VALIDATION_ERROR' || error.code === 'CONFLICT' ? 400 : 500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createEnterpriseMarketingIntelligenceRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireStaffAuth = createAuthMiddleware({ jwtSecret: deps.jwtSecret, authService: deps.authService });
  const requirePortalAuth = createPortalAuthMiddleware({
    jwtSecret: deps.jwtSecret,
    portalAuthService: deps.portalAuthService,
  });
  const requireRead = requireAnyPermission(
    'marketing_intelligence:read',
    'marketing_intelligence:manage',
    'marketing:read',
  );
  const requireWrite = requireAnyPermission('marketing_intelligence:write', 'marketing_intelligence:manage');
  const requireManage = requireAnyPermission('marketing_intelligence:manage', 'platform:manage');

  router.get('/dashboard', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const dashboard = await deps.enterpriseMarketingIntelligenceService.getDashboard(auth.companyId);
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/campaign-monitoring', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const campaignMonitoring = await deps.enterpriseMarketingIntelligenceService.getCampaignMonitoring(auth.companyId);
      res.json({ data: { campaignMonitoring } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/portal', requirePortalAuth, async (req, res) => {
    try {
      const portalAuth = getPortalAuth(req);
      const summary = await deps.enterpriseMarketingIntelligenceService.getPortalMarketingSummary(portalAuth.companyId);
      res.json({ data: { summary } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/platform-config', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const platformConfig = await deps.enterpriseMarketingIntelligenceService.getPlatformConfig(auth.companyId);
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/platform-config', requireStaffAuth, requireManage, async (req, res) => {
    const parsed = platformConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid platform config' } });
      return;
    }
    try {
      const platformConfig = await deps.enterpriseMarketingIntelligenceService.updatePlatformConfig(staffScope(req), parsed.data);
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/marketing-campaigns', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const campaigns = await deps.enterpriseMarketingIntelligenceService.listMarketingCampaigns(auth.companyId);
      res.json({ data: { campaigns } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/marketing-segments', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const segments = await deps.enterpriseMarketingIntelligenceService.listMarketingSegments(auth.companyId);
      res.json({ data: { segments } });
    } catch (error) {
      handleError(error, res);
    }
  });


  router.get('/strategies', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const strategies = await deps.enterpriseMarketingIntelligenceService.listStrategies(auth.companyId);
      res.json({ data: { strategies } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/strategies', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = strategySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid strategy' } });
      return;
    }
    try {
      const strategy = await deps.enterpriseMarketingIntelligenceService.createStrategy(staffScope(req), parsed.data);
      res.status(201).json({ data: { strategy } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/brands', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const brands = await deps.enterpriseMarketingIntelligenceService.listBrands(auth.companyId);
      res.json({ data: { brands } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/brands', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = brandSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid brand' } });
      return;
    }
    try {
      const brand = await deps.enterpriseMarketingIntelligenceService.createBrand(staffScope(req), parsed.data);
      res.status(201).json({ data: { brand } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/brand-assets', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const brandAssets = await deps.enterpriseMarketingIntelligenceService.listBrandAssets(auth.companyId);
      res.json({ data: { brandAssets } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/brand-assets', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = brandAssetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid brand asset' } });
      return;
    }
    try {
      const brandAsset = await deps.enterpriseMarketingIntelligenceService.createBrandAsset(staffScope(req), parsed.data);
      res.status(201).json({ data: { brandAsset } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/audiences', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const audiences = await deps.enterpriseMarketingIntelligenceService.listAudiences(auth.companyId);
      res.json({ data: { audiences } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/audiences', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = audienceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid audience' } });
      return;
    }
    try {
      const audience = await deps.enterpriseMarketingIntelligenceService.createAudience(staffScope(req), parsed.data);
      res.status(201).json({ data: { audience } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/suppression-lists', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const suppressionLists = await deps.enterpriseMarketingIntelligenceService.listSuppressionLists(auth.companyId);
      res.json({ data: { suppressionLists } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/suppression-lists', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = suppressionListSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid suppression list' } });
      return;
    }
    try {
      const suppressionList = await deps.enterpriseMarketingIntelligenceService.createSuppressionList(staffScope(req), parsed.data);
      res.status(201).json({ data: { suppressionList } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/campaign-plans', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const campaignPlans = await deps.enterpriseMarketingIntelligenceService.listCampaignPlans(auth.companyId);
      res.json({ data: { campaignPlans } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/campaign-plans', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = campaignPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid campaign plan' } });
      return;
    }
    try {
      const campaignPlan = await deps.enterpriseMarketingIntelligenceService.createCampaignPlan(staffScope(req), parsed.data);
      res.status(201).json({ data: { campaignPlan } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/content-items', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const contentItems = await deps.enterpriseMarketingIntelligenceService.listContentItems(auth.companyId);
      res.json({ data: { contentItems } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/content-items', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = contentItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid content item' } });
      return;
    }
    try {
      const contentItem = await deps.enterpriseMarketingIntelligenceService.createContentItem(staffScope(req), parsed.data);
      res.status(201).json({ data: { contentItem } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/creative-requests', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const creativeRequests = await deps.enterpriseMarketingIntelligenceService.listCreativeRequests(auth.companyId);
      res.json({ data: { creativeRequests } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/creative-requests', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = creativeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid creative request' } });
      return;
    }
    try {
      const creativeRequest = await deps.enterpriseMarketingIntelligenceService.createCreativeRequest(staffScope(req), parsed.data);
      res.status(201).json({ data: { creativeRequest } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/social-accounts', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const socialAccounts = await deps.enterpriseMarketingIntelligenceService.listSocialAccounts(auth.companyId);
      res.json({ data: { socialAccounts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/social-accounts', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = socialAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid social account' } });
      return;
    }
    try {
      const socialAccount = await deps.enterpriseMarketingIntelligenceService.createSocialAccount(staffScope(req), parsed.data);
      res.status(201).json({ data: { socialAccount } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/social-posts', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const socialPosts = await deps.enterpriseMarketingIntelligenceService.listSocialPosts(auth.companyId);
      res.json({ data: { socialPosts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/social-posts', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = socialPostSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid social post' } });
      return;
    }
    try {
      const socialPost = await deps.enterpriseMarketingIntelligenceService.createSocialPost(staffScope(req), parsed.data);
      res.status(201).json({ data: { socialPost } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/reviews', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const reviews = await deps.enterpriseMarketingIntelligenceService.listReviews(auth.companyId);
      res.json({ data: { reviews } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/reviews', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid review' } });
      return;
    }
    try {
      const review = await deps.enterpriseMarketingIntelligenceService.createReview(staffScope(req), parsed.data);
      res.status(201).json({ data: { review } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/ad-accounts', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const adAccounts = await deps.enterpriseMarketingIntelligenceService.listAdAccounts(auth.companyId);
      res.json({ data: { adAccounts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/ad-accounts', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = adAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid ad account' } });
      return;
    }
    try {
      const adAccount = await deps.enterpriseMarketingIntelligenceService.createAdAccount(staffScope(req), parsed.data);
      res.status(201).json({ data: { adAccount } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/ad-campaigns', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const adCampaigns = await deps.enterpriseMarketingIntelligenceService.listAdCampaigns(auth.companyId);
      res.json({ data: { adCampaigns } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/ad-campaigns', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = adCampaignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid ad campaign' } });
      return;
    }
    try {
      const adCampaign = await deps.enterpriseMarketingIntelligenceService.createAdCampaign(staffScope(req), parsed.data);
      res.status(201).json({ data: { adCampaign } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/ad-budgets', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const adBudgets = await deps.enterpriseMarketingIntelligenceService.listAdBudgets(auth.companyId);
      res.json({ data: { adBudgets } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/ad-budgets', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = adBudgetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid ad budget' } });
      return;
    }
    try {
      const adBudget = await deps.enterpriseMarketingIntelligenceService.createAdBudget(staffScope(req), parsed.data);
      res.status(201).json({ data: { adBudget } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/seo-keywords', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const seoKeywords = await deps.enterpriseMarketingIntelligenceService.listSeoKeywords(auth.companyId);
      res.json({ data: { seoKeywords } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/seo-keywords', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = seoKeywordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid SEO keyword' } });
      return;
    }
    try {
      const seoKeyword = await deps.enterpriseMarketingIntelligenceService.createSeoKeyword(staffScope(req), parsed.data);
      res.status(201).json({ data: { seoKeyword } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/local-presence', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const profiles = await deps.enterpriseMarketingIntelligenceService.listLocalPresenceProfiles(auth.companyId);
      res.json({ data: { profiles } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/local-presence', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = localPresenceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid local presence profile' } });
      return;
    }
    try {
      const profile = await deps.enterpriseMarketingIntelligenceService.createLocalPresenceProfile(staffScope(req), parsed.data);
      res.status(201).json({ data: { profile } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/websites', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const websites = await deps.enterpriseMarketingIntelligenceService.listWebsites(auth.companyId);
      res.json({ data: { websites } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/websites', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = websiteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid website' } });
      return;
    }
    try {
      const website = await deps.enterpriseMarketingIntelligenceService.createWebsite(staffScope(req), parsed.data);
      res.status(201).json({ data: { website } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/landing-pages', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const landingPages = await deps.enterpriseMarketingIntelligenceService.listLandingPages(auth.companyId);
      res.json({ data: { landingPages } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/landing-pages', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = landingPageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid landing page' } });
      return;
    }
    try {
      const landingPage = await deps.enterpriseMarketingIntelligenceService.createLandingPage(staffScope(req), parsed.data);
      res.status(201).json({ data: { landingPage } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/email-campaigns', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const emailCampaigns = await deps.enterpriseMarketingIntelligenceService.listEmailCampaigns(auth.companyId);
      res.json({ data: { emailCampaigns } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/email-campaigns', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = emailCampaignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid email campaign' } });
      return;
    }
    try {
      const emailCampaign = await deps.enterpriseMarketingIntelligenceService.createEmailCampaign(staffScope(req), parsed.data);
      res.status(201).json({ data: { emailCampaign } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/messaging-campaigns', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const messagingCampaigns = await deps.enterpriseMarketingIntelligenceService.listMessagingCampaigns(auth.companyId);
      res.json({ data: { messagingCampaigns } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/messaging-campaigns', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = messagingCampaignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid messaging campaign' } });
      return;
    }
    try {
      const messagingCampaign = await deps.enterpriseMarketingIntelligenceService.createMessagingCampaign(staffScope(req), parsed.data);
      res.status(201).json({ data: { messagingCampaign } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/customer-journeys', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const journeys = await deps.enterpriseMarketingIntelligenceService.listCustomerJourneys(auth.companyId);
      res.json({ data: { journeys } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/customer-journeys', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = customerJourneySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid customer journey' } });
      return;
    }
    try {
      const journey = await deps.enterpriseMarketingIntelligenceService.createCustomerJourney(staffScope(req), parsed.data);
      res.status(201).json({ data: { journey } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/attribution-records', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const records = await deps.enterpriseMarketingIntelligenceService.listAttributionRecords(auth.companyId);
      res.json({ data: { records } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/attribution-records', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = attributionRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid attribution record' } });
      return;
    }
    try {
      const record = await deps.enterpriseMarketingIntelligenceService.createAttributionRecord(staffScope(req), parsed.data);
      res.status(201).json({ data: { record } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/referral-campaigns', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const referralCampaigns = await deps.enterpriseMarketingIntelligenceService.listReferralCampaigns(auth.companyId);
      res.json({ data: { referralCampaigns } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/referral-campaigns', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = referralCampaignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid referral campaign' } });
      return;
    }
    try {
      const referralCampaign = await deps.enterpriseMarketingIntelligenceService.createReferralCampaign(staffScope(req), parsed.data);
      res.status(201).json({ data: { referralCampaign } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/calendar-events', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const events = await deps.enterpriseMarketingIntelligenceService.listCalendarEvents(auth.companyId);
      res.json({ data: { events } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/calendar-events', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = calendarEventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid calendar event' } });
      return;
    }
    try {
      const event = await deps.enterpriseMarketingIntelligenceService.createCalendarEvent(staffScope(req), parsed.data);
      res.status(201).json({ data: { event } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/experiments', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const experiments = await deps.enterpriseMarketingIntelligenceService.listExperiments(auth.companyId);
      res.json({ data: { experiments } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/experiments', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = experimentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid experiment' } });
      return;
    }
    try {
      const experiment = await deps.enterpriseMarketingIntelligenceService.createExperiment(staffScope(req), parsed.data);
      res.status(201).json({ data: { experiment } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/market-intelligence', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const records = await deps.enterpriseMarketingIntelligenceService.listMarketIntelligenceRecords(auth.companyId);
      res.json({ data: { records } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/market-intelligence', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = marketIntelligenceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid market intelligence record' } });
      return;
    }
    try {
      const record = await deps.enterpriseMarketingIntelligenceService.createMarketIntelligenceRecord(staffScope(req), parsed.data);
      res.status(201).json({ data: { record } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/providers', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const providers = await deps.enterpriseMarketingIntelligenceService.listProviders(auth.companyId);
      res.json({ data: { providers } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/providers', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = providerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid provider' } });
      return;
    }
    try {
      const provider = await deps.enterpriseMarketingIntelligenceService.createProvider(staffScope(req), parsed.data);
      res.status(201).json({ data: { provider } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/roi-snapshots', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const snapshots = await deps.enterpriseMarketingIntelligenceService.listRoiSnapshots(auth.companyId);
      res.json({ data: { snapshots } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/roi-snapshots', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = roiSnapshotSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid ROI snapshot' } });
      return;
    }
    try {
      const snapshot = await deps.enterpriseMarketingIntelligenceService.createRoiSnapshot(staffScope(req), parsed.data);
      res.status(201).json({ data: { snapshot } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/campaign-plans/:planId/submit-for-review', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const campaignPlan = await deps.enterpriseMarketingIntelligenceService.submitCampaignPlanForReview(
        staffScope(req),
        getRouteParam(req.params.planId),
      );
      res.json({ data: { campaignPlan } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/campaign-plans/:planId/submit-for-approval', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const campaignPlan = await deps.enterpriseMarketingIntelligenceService.submitCampaignPlanForApproval(
        staffScope(req),
        getRouteParam(req.params.planId),
      );
      res.json({ data: { campaignPlan } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/campaign-plans/:planId/approve', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const campaignPlan = await deps.enterpriseMarketingIntelligenceService.approveCampaignPlan(
        staffScope(req),
        getRouteParam(req.params.planId),
      );
      res.json({ data: { campaignPlan } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/campaign-plans/:planId/execute', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const campaignPlan = await deps.enterpriseMarketingIntelligenceService.executeCampaignPlan(
        staffScope(req),
        getRouteParam(req.params.planId),
      );
      res.json({ data: { campaignPlan } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/content-items/:contentId/submit-for-review', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const contentItem = await deps.enterpriseMarketingIntelligenceService.submitContentItemForReview(
        staffScope(req),
        getRouteParam(req.params.contentId),
      );
      res.json({ data: { contentItem } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/content-items/:contentId/approve', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const contentItem = await deps.enterpriseMarketingIntelligenceService.approveContentItem(
        staffScope(req),
        getRouteParam(req.params.contentId),
      );
      res.json({ data: { contentItem } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/social-posts/:postId/submit-for-review', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const socialPost = await deps.enterpriseMarketingIntelligenceService.submitSocialPostForReview(
        staffScope(req),
        getRouteParam(req.params.postId),
      );
      res.json({ data: { socialPost } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/social-posts/:postId/approve', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const socialPost = await deps.enterpriseMarketingIntelligenceService.approveSocialPost(
        staffScope(req),
        getRouteParam(req.params.postId),
      );
      res.json({ data: { socialPost } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/social-posts/:postId/execute', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const socialPost = await deps.enterpriseMarketingIntelligenceService.executeSocialPost(
        staffScope(req),
        getRouteParam(req.params.postId),
      );
      res.json({ data: { socialPost } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/email-campaigns/:campaignId/submit-for-review', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const emailCampaign = await deps.enterpriseMarketingIntelligenceService.submitEmailCampaignForReview(
        staffScope(req),
        getRouteParam(req.params.campaignId),
      );
      res.json({ data: { emailCampaign } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/email-campaigns/:campaignId/approve', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const emailCampaign = await deps.enterpriseMarketingIntelligenceService.approveEmailCampaign(
        staffScope(req),
        getRouteParam(req.params.campaignId),
      );
      res.json({ data: { emailCampaign } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/email-campaigns/:campaignId/execute', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const emailCampaign = await deps.enterpriseMarketingIntelligenceService.executeEmailCampaign(
        staffScope(req),
        getRouteParam(req.params.campaignId),
      );
      res.json({ data: { emailCampaign } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/reviews/respond', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = reviewResponseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid review response' } });
      return;
    }
    try {
      const review = await deps.enterpriseMarketingIntelligenceService.submitReviewResponse(staffScope(req), parsed.data);
      res.json({ data: { review } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/providers/:providerId/test', requireStaffAuth, requireManage, async (req, res) => {
    try {
      const provider = await deps.enterpriseMarketingIntelligenceService.testMarketingProvider(
        staffScope(req),
        getRouteParam(req.params.providerId),
      );
      res.json({ data: { provider } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/alerts', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const alerts = await deps.enterpriseMarketingIntelligenceService.listMarketingAlerts(auth.companyId, { status });
      res.json({ data: { alerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/alerts/sync', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const alerts = await deps.enterpriseMarketingIntelligenceService.syncMarketingAlerts(staffScope(req));
      res.json({ data: { alerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/analytics/capture', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const analytics = await deps.enterpriseMarketingIntelligenceService.captureAnalytics(staffScope(req));
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/analytics/latest', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const analytics = await deps.enterpriseMarketingIntelligenceService.getLatestAnalytics(auth.companyId);
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/marketing-drafts', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = marketingDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid marketing action draft' } });
      return;
    }
    try {
      const draft = await deps.enterpriseMarketingIntelligenceService.createMarketingActionDraft(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { draft } });
    } catch (error) {
      handleError(error, res);
    }
  });


  return router;
}
