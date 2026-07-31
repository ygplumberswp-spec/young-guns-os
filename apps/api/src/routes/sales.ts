import { Router } from 'express';
import { z } from 'zod';
import type { SalesService } from '../services/sales.service.js';
import { SalesError } from '../services/sales.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const opportunityStatusSchema = z.enum(['open', 'won', 'lost', 'on_hold']);
const opportunityTypeSchema = z.enum([
  'recurring_service',
  'unconverted_quote',
  'incomplete_work',
  'maintenance_due',
  'high_value_customer',
  'follow_up',
  'custom',
]);
const opportunitySourceSchema = z.enum(['manual', 'detected', 'quote', 'job', 'customer']);
const activityTypeSchema = z.enum([
  'call',
  'email',
  'meeting',
  'follow_up',
  'quote_sent',
  'note',
  'other',
]);
const recommendationStatusSchema = z.enum(['pending', 'accepted', 'dismissed', 'completed']);

const createStageSchema = z.object({
  stageKey: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  sortOrder: z.number().int().optional(),
  probabilityPercent: z.number().int().min(0).max(100).optional(),
  isClosedWon: z.boolean().optional(),
  isClosedLost: z.boolean().optional(),
});

const updateStageSchema = createStageSchema.partial();

const createOpportunitySchema = z.object({
  customerId: z.string().uuid(),
  stageId: z.string().uuid().optional().nullable(),
  opportunityType: opportunityTypeSchema.optional(),
  source: opportunitySourceSchema.optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  estimatedValueCents: z.number().int().min(0).optional().nullable(),
  currency: z.string().trim().max(10).optional(),
  quoteId: z.string().uuid().optional().nullable(),
  jobId: z.string().uuid().optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
  detectedReason: z.record(z.unknown()).optional(),
});

const updateOpportunitySchema = z.object({
  stageId: z.string().uuid().optional().nullable(),
  status: opportunityStatusSchema.optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).optional().nullable(),
  estimatedValueCents: z.number().int().min(0).optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
});

const createActivitySchema = z.object({
  customerId: z.string().uuid(),
  opportunityId: z.string().uuid().optional().nullable(),
  activityType: activityTypeSchema.optional(),
  subject: z.string().trim().max(500).optional().nullable(),
  body: z.string().trim().min(1).max(8000),
  occurredAt: z.string().datetime().optional(),
});

const updateRecommendationSchema = z.object({
  status: recommendationStatusSchema,
});

type SalesRouterDeps = {
  salesService: SalesService;
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

export function createSalesRouter({
  salesService,
  teamService,
  jwtSecret,
  authService,
}: SalesRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission('sales:read', 'sales:write', 'customers:read');
  const requireWrite = requireAnyPermission('sales:write', 'customers:write');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/stats', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const stats = await salesService.getStats(companyId);
    res.json({ data: { stats } });
  });

  router.get('/pipeline', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const [stages, metrics] = await Promise.all([
      salesService.listPipelineStages(companyId),
      salesService.getPipelineMetrics(companyId),
    ]);
    res.json({ data: { stages, metrics } });
  });

  router.post('/pipeline/stages', requireWrite, async (req, res) => {
    const parsed = createStageSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid stage payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const stage = await salesService.createPipelineStage(companyId, parsed.data);
      res.status(201).json({ data: { stage } });
    } catch (error) {
      handleSalesError(res, error);
    }
  });

  router.patch('/pipeline/stages/:id', requireWrite, async (req, res) => {
    const parsed = updateStageSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid stage payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const stage = await salesService.updatePipelineStage(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { stage } });
    } catch (error) {
      handleSalesError(res, error);
    }
  });

  router.get('/opportunities', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const opportunities = await salesService.listOpportunities(companyId);
    res.json({ data: { opportunities } });
  });

  router.get('/opportunities/detected', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const detected = await salesService.detectOpportunities(companyId);
    res.json({ data: { detected } });
  });

  router.post('/opportunities', requireWrite, async (req, res) => {
    const parsed = createOpportunitySchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid opportunity payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const opportunity = await salesService.createOpportunity(auth, parsed.data);
      res.status(201).json({ data: { opportunity } });
    } catch (error) {
      handleSalesError(res, error);
    }
  });

  router.patch('/opportunities/:id', requireWrite, async (req, res) => {
    const parsed = updateOpportunitySchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid opportunity payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const opportunity = await salesService.updateOpportunity(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { opportunity } });
    } catch (error) {
      handleSalesError(res, error);
    }
  });

  router.get('/activities', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const opportunityId =
      typeof req.query.opportunityId === 'string' ? req.query.opportunityId : undefined;
    const activities = await salesService.listActivities(companyId, opportunityId);
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
      const activity = await salesService.createActivity(auth, parsed.data);
      res.status(201).json({ data: { activity } });
    } catch (error) {
      handleSalesError(res, error);
    }
  });

  router.get('/recommendations', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const recommendations = await salesService.listRecommendations(companyId);
    res.json({ data: { recommendations } });
  });

  router.post('/recommendations/generate', requireWrite, async (req, res) => {
    try {
      const { companyId } = getAuth(req);
      const recommendations = await salesService.generateRecommendations(companyId);
      res.status(201).json({ data: { recommendations } });
    } catch (error) {
      handleSalesError(res, error);
    }
  });

  router.patch('/recommendations/:id', requireWrite, async (req, res) => {
    const parsed = updateRecommendationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid recommendation payload' },
      });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const recommendation = await salesService.updateRecommendation(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { recommendation } });
    } catch (error) {
      handleSalesError(res, error);
    }
  });

  router.get('/quote-assistance/:customerId', requireRead, async (req, res) => {
    try {
      const { companyId } = getAuth(req);
      const context = await salesService.getQuoteAssistanceContext(
        companyId,
        getRouteParam(req.params.customerId),
      );
      res.json({ data: { context } });
    } catch (error) {
      handleSalesError(res, error);
    }
  });

  return router;
}

function handleSalesError(res: import('express').Response, error: unknown) {
  if (error instanceof SalesError) {
    res.status(error.code === 'NOT_FOUND' ? 404 : 400).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  throw error;
}
