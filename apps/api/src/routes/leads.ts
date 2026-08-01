import { Router } from 'express';
import { z } from 'zod';
import { hasAnyPermission } from '@titan/auth';
import type { LeadsService } from '../services/leads.service.js';
import { LeadsError } from '../services/leads.service.js';
import type { LeadConversionService } from '../services/lead-conversion.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const leadStatusSchema = z.enum([
  'new',
  'attempted_contact',
  'contacted',
  'qualified',
  'awaiting_information',
  'quote_required',
  'ready_to_book',
  'opportunity',
  'converted',
  'lost',
  'duplicate',
]);
const activityTypeSchema = z.enum([
  'call',
  'email',
  'meeting',
  'follow_up',
  'note',
  'handoff',
  'status_change',
  'conversion',
  'duplicate_override',
  'other',
]);
const recommendationStatusSchema = z.enum(['pending', 'accepted', 'dismissed', 'completed']);
const urgencySchema = z.enum(['low', 'normal', 'high', 'urgent']);

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
  title: z.string().trim().max(200).optional(),
  companyName: z.string().trim().max(200).optional().nullable(),
  contactName: z.string().trim().min(1).max(200),
  contactEmail: z.string().trim().max(320).optional().nullable(),
  contactPhone: z.string().trim().max(50).optional().nullable(),
  serviceType: z.string().trim().max(200).optional().nullable(),
  urgency: urgencySchema.optional(),
  street: z.string().trim().max(300).optional().nullable(),
  suburb: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  province: z.string().trim().max(120).optional().nullable(),
  postalCode: z.string().trim().max(20).optional().nullable(),
  unit: z.string().trim().max(80).optional().nullable(),
  accessInstructions: z.string().trim().max(4000).optional().nullable(),
  preferredAppointmentAt: z.string().datetime().optional().nullable(),
  nextAction: z.string().trim().max(500).optional().nullable(),
  nextActionDueAt: z.string().datetime().optional().nullable(),
  marketingConsent: z.boolean().optional(),
  operationalContactPermission: z.boolean().optional(),
  assignedUserId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
  duplicateOverrideReason: z.string().trim().max(2000).optional().nullable(),
  acknowledgePlaceholderEmail: z.boolean().optional(),
});

const updateLeadSchema = createLeadSchema
  .omit({
    duplicateOverrideReason: true,
    acknowledgePlaceholderEmail: true,
  })
  .partial()
  .extend({
    lostReason: z.string().trim().max(2000).optional().nullable(),
    reopenReason: z.string().trim().max(2000).optional().nullable(),
  });

const duplicateCheckSchema = z.object({
  contactName: z.string().trim().max(200).optional().nullable(),
  companyName: z.string().trim().max(200).optional().nullable(),
  contactEmail: z.string().trim().max(320).optional().nullable(),
  contactPhone: z.string().trim().max(50).optional().nullable(),
  street: z.string().trim().max(300).optional().nullable(),
  suburb: z.string().trim().max(120).optional().nullable(),
  excludeLeadId: z.string().uuid().optional().nullable(),
});

const convertLeadSchema = z.object({
  clientActionId: z.string().trim().min(8).max(200),
  customerMode: z.enum(['existing', 'new']),
  customerId: z.string().uuid().optional().nullable(),
  newCustomer: z
    .object({
      name: z.string().trim().min(1).max(200),
      email: z.string().trim().max(320).optional().nullable(),
      phone: z.string().trim().max(50).optional().nullable(),
      notes: z.string().trim().max(5000).optional().nullable(),
    })
    .optional()
    .nullable(),
  propertyMode: z.enum(['existing', 'new', 'none']),
  propertyId: z.string().uuid().optional().nullable(),
  newProperty: z
    .object({
      propertyName: z.string().trim().max(200).optional().nullable(),
      street: z.string().trim().min(1).max(300),
      suburb: z.string().trim().min(1).max(120),
      city: z.string().trim().min(1).max(120),
      province: z.string().trim().min(1).max(120),
      postalCode: z.string().trim().min(1).max(20),
      unit: z.string().trim().max(80).optional().nullable(),
    })
    .optional()
    .nullable(),
  createJob: z.boolean(),
  job: z
    .object({
      jobType: z.string().trim().min(1).max(200),
      description: z.string().trim().min(1).max(8000),
      priority: urgencySchema.optional(),
      preferredAppointmentAt: z.string().datetime().optional().nullable(),
      scheduledEndAt: z.string().datetime().optional().nullable(),
      assignedUserId: z.string().uuid().optional().nullable(),
      accessInstructions: z.string().trim().max(4000).optional().nullable(),
      notes: z.string().trim().max(5000).optional().nullable(),
      siteContactName: z.string().trim().max(200).optional().nullable(),
      siteContactMobile: z.string().trim().max(50).optional().nullable(),
      siteContactEmail: z.string().trim().max(320).optional().nullable(),
      siteContactDiffersFromCustomer: z.boolean().optional(),
    })
    .optional()
    .nullable(),
  duplicateResolution: z
    .enum([
      'use_existing_customer',
      'use_existing_property',
      'create_new',
      'keep_as_lead',
      'override',
    ])
    .optional()
    .nullable(),
  duplicateOverrideReason: z.string().trim().max(2000).optional().nullable(),
});

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
  leadConversionService: LeadConversionService;
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
  leadConversionService,
  teamService,
  jwtSecret,
  authService,
}: LeadsRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission('leads:read', 'leads:write');
  const requireWrite = requireAnyPermission('leads:write');

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
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid source payload' } });
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
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid source payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const source = await leadsService.updateSource(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { source } });
    } catch (error) {
      handleLeadsError(res, error);
    }
  });

  router.post('/duplicates/check', requireWrite, async (req, res) => {
    const parsed = duplicateCheckSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid duplicate check payload' } });
      return;
    }

    const { companyId } = getAuth(req);
    const result = await leadsService.findDuplicates(companyId, parsed.data);
    res.json({ data: result });
  });

  router.get('/', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const statusParam = typeof req.query.status === 'string' ? req.query.status : undefined;
    const leads = await leadsService.listLeads(companyId, {
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      status: statusParam as never,
      sourceId: typeof req.query.sourceId === 'string' ? req.query.sourceId : undefined,
      serviceType: typeof req.query.serviceType === 'string' ? req.query.serviceType : undefined,
      assignedUserId:
        typeof req.query.assignedUserId === 'string' ? req.query.assignedUserId : undefined,
      overdueOnly: req.query.overdueOnly === '1' || req.query.overdueOnly === 'true',
    });
    res.json({ data: { leads } });
  });

  router.post('/', requireWrite, async (req, res) => {
    const parsed = createLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid lead payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const result = await leadsService.createLead(auth, parsed.data);
      res.status(201).json({ data: result });
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

  router.get('/:id', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const lead = await leadsService.getLeadDetail(companyId, getRouteParam(req.params.id));
    if (!lead) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Lead not found' } });
      return;
    }
    res.json({ data: { lead } });
  });

  router.patch('/:id', requireWrite, async (req, res) => {
    const parsed = updateLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid lead payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const lead = await leadsService.updateLead(auth, getRouteParam(req.params.id), parsed.data);
      res.json({ data: { lead } });
    } catch (error) {
      handleLeadsError(res, error);
    }
  });

  router.delete('/:id', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      await leadsService.deleteLead(auth, getRouteParam(req.params.id));
      res.json({ data: { deleted: true } });
    } catch (error) {
      handleLeadsError(res, error);
    }
  });

  router.delete('/:id', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      await leadsService.deleteLead(auth, getRouteParam(req.params.id));
      res.json({ data: { deleted: true } });
    } catch (error) {
      handleLeadsError(res, error);
    }
  });

  router.post('/:id/convert', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    if (!hasAnyPermission(auth.permissions, ['customers:write', '*'])) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Customer write permission is required to convert leads',
        },
      });
      return;
    }

    const parsed = convertLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid conversion payload' } });
      return;
    }

    if (parsed.data.createJob && !hasAnyPermission(auth.permissions, ['jobs:write', '*'])) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Job write permission is required to create a job during conversion',
        },
      });
      return;
    }

    try {
      const result = await leadConversionService.convertLead(
        auth,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.status(result.idempotentReplay ? 200 : 201).json({ data: { conversion: result } });
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
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid activity payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const activity = await leadsService.createActivity(
        auth,
        getRouteParam(req.params.id),
        parsed.data,
      );
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
      const handoff = await leadsService.getSalesHandoffPreview(
        companyId,
        getRouteParam(req.params.id),
      );
      res.json({ data: { handoff } });
    } catch (error) {
      handleLeadsError(res, error);
    }
  });

  return router;
}

function handleLeadsError(res: import('express').Response, error: unknown) {
  if (error instanceof LeadsError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'FORBIDDEN'
          ? 403
          : error.code === 'DUPLICATE_SUSPECTED' || error.code === 'PLACEHOLDER_EMAIL'
            ? 409
            : error.code === 'ALREADY_CONVERTED'
              ? 409
              : 400;
    res.status(status).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  throw error;
}
