import { Router } from 'express';
import { z } from 'zod';
import type { LeadsService } from '../services/leads.service.js';
import { LeadsError } from '../services/leads.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const leadStatusSchema = z.enum(['new', 'qualified', 'contacted', 'opportunity', 'converted', 'lost']);
const activityTypeSchema = z.enum(['call', 'email', 'meeting', 'follow_up', 'note', 'handoff', 'other']);
const recommendationStatusSchema = z.enum(['pending', 'accepted', 'dismissed', 'completed']);

const createSourceSchema = z.object({
  sourceKey: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  enabled: z.boolean().optional(),
});

const updateSourceSchema = createSourceSchema.partial();

const createLeadSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  sourceId: z.string().uuid().optional().nullable(),
  status: leadStatusSchema.optional(),
  title: z.string().trim().min(1).max(200),
  contactName: z.string().trim().min(1).max(200),
  contactEmail: z.string().trim().email().optional().nullable(),
  contactPhone: z.string().trim().max(50).optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

const updateLeadSchema = createLeadSchema.partial();

const createActivitySchema = z.object({
  activityType: activityTypeSchema.optional(),
  subject: z.string().trim().max(500).optional().nullable(),
  body: z.string().trim().min(1).max(8000),
  occurredAt: z.string().datetime().optional(),
});

const updateRecommendationSchema = z.object({
  status: recommendationStatusSchema,
});

type LeadsRouterDeps = {
  leadsService: LeadsService;
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

export function createLeadsRouter({
  leadsService,
  teamService,
  jwtSecret,
  authService,
}: LeadsRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission('leads:read', 'leads:write', 'customers:read');
  const requireWrite = requireAnyPermission('leads:write', 'customers:write');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/stats', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const stats = await leadsService.getStats(companyId);
    res.json({ data: { stats } });
  });

  router.get('/pipeline', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const metrics = await leadsService.getPipelineMetrics(companyId);
    res.json({ data: { metrics } });
  });

  router.get('/sources', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const sources = await leadsService.listSources(companyId);
    res.json({ data: { sources } });
  });

  router.post('/sources', requireWrite, async (req, res) => {
    const parsed = createSourceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid source payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const source = await leadsService.createSource(auth, parsed.data);
      res.status(201).json({ data: { source } });
    } catch (error) {
      handleLeadsError(res, error);
    }
  });

  router.patch('/sources/:id', requireWrite, async (req, res) => {
    const parsed = updateSourceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid source payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const source = await leadsService.updateSource(companyId, getRouteParam(req.params.id), parsed.data);
      res.json({ data: { source } });
    } catch (error) {
      handleLeadsError(res, error);
    }
  });

  router.get('/', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const leads = await leadsService.listLeads(companyId);
    res.json({ data: { leads } });
  });

  router.post('/', requireWrite, async (req, res) => {
    const parsed = createLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid lead payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const lead = await leadsService.createLead(auth, parsed.data);
      res.status(201).json({ data: { lead } });
    } catch (error) {
      handleLeadsError(res, error);
    }
  });

  router.get('/scoring/insights', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const insights = await leadsService.getAcquisitionInsights(companyId);
    res.json({ data: { insights } });
  });

  router.get('/scoring', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const [insights, metrics] = await Promise.all([
      leadsService.getAcquisitionInsights(companyId),
      leadsService.getPipelineMetrics(companyId),
    ]);
    res.json({ data: { insights, metrics } });
  });

  router.get('/recommendations/list', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const recommendations = await leadsService.listRecommendations(companyId);
    res.json({ data: { recommendations } });
  });

  router.get('/recommendations', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const recommendations = await leadsService.listRecommendations(companyId);
    res.json({ data: { recommendations } });
  });

  router.post('/recommendations/generate', requireWrite, async (req, res) => {
    try {
      const { companyId } = getAuth(req);
      const recommendations = await leadsService.generateRecommendations(companyId);
      res.status(201).json({ data: { recommendations } });
    } catch (error) {
      handleLeadsError(res, error);
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
      const recommendation = await leadsService.updateRecommendation(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { recommendation } });
    } catch (error) {
      handleLeadsError(res, error);
    }
  });

  router.patch('/:id', requireWrite, async (req, res) => {
    const parsed = updateLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid lead payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const lead = await leadsService.updateLead(companyId, getRouteParam(req.params.id), parsed.data);
      res.json({ data: { lead } });
    } catch (error) {
      handleLeadsError(res, error);
    }
  });

  router.get('/:id/activities', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const activities = await leadsService.listActivities(companyId, getRouteParam(req.params.id));
    res.json({ data: { activities } });
  });

  router.post('/:id/activities', requireWrite, async (req, res) => {
    const parsed = createActivitySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid activity payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const activity = await leadsService.createActivity(auth, getRouteParam(req.params.id), parsed.data);
      res.status(201).json({ data: { activity } });
    } catch (error) {
      handleLeadsError(res, error);
    }
  });

  router.post('/:id/score', requireWrite, async (req, res) => {
    try {
      const { companyId } = getAuth(req);
      const result = await leadsService.scoreLead(companyId, getRouteParam(req.params.id));
      res.json({ data: { result } });
    } catch (error) {
      handleLeadsError(res, error);
    }
  });

  router.get('/:id/scores', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const scores = await leadsService.listScores(companyId, getRouteParam(req.params.id));
    res.json({ data: { scores } });
  });

  router.get('/:id/handoff', requireRead, async (req, res) => {
    try {
      const { companyId } = getAuth(req);
      const handoff = await leadsService.getSalesHandoffPreview(companyId, getRouteParam(req.params.id));
      res.json({ data: { handoff } });
    } catch (error) {
      handleLeadsError(res, error);
    }
  });

  return router;
}

function handleLeadsError(res: import('express').Response, error: unknown) {
  if (error instanceof LeadsError) {
    res.status(error.code === 'NOT_FOUND' ? 404 : 400).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  throw error;
}
