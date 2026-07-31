import { Router } from 'express';
import { z } from 'zod';
import type { DispatchIntelligenceService } from '../services/dispatch-intelligence.service.js';
import { DispatchIntelligenceError } from '../services/dispatch-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const emergencyTypeSchema = z.enum([
  'burst_pipe',
  'flooding',
  'blocked_drain',
  'gas_leak',
  'water_leak',
  'no_water',
  'sewer_overflow',
  'other',
]);

const routingTypeSchema = z.enum([
  'branch',
  'region',
  'department',
  'emergency',
  'technician',
  'office',
  'service_type',
]);

const actionTypeSchema = z.enum(['dispatch_action', 'callback_action']);

const receptionistSummarySchema = z.object({
  voiceSessionId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  serviceIntent: z.string().trim().max(500).optional(),
  emergencyDetected: z.boolean().optional(),
  afterHours: z.boolean().optional(),
  branchKey: z.string().trim().max(100).optional(),
  languagePreference: z.string().trim().max(50).optional(),
  priorityScore: z.number().int().min(0).max(100).optional(),
  summary: z.string().trim().min(1).max(5000),
});

const routingRecommendationSchema = z.object({
  voiceSessionId: z.string().uuid().optional(),
  callIntelligenceId: z.string().uuid().optional(),
  routingType: routingTypeSchema,
  targetBranch: z.string().trim().max(100).optional(),
  targetDepartment: z.string().trim().max(100).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  recommendation: z.string().trim().min(1).max(5000),
});

const callbackRequestSchema = z.object({
  customerId: z.string().uuid().optional(),
  voiceSessionId: z.string().uuid().optional(),
  phoneNumber: z.string().trim().max(50).optional(),
  scheduledAt: z.string().optional(),
  missedCallTracked: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional(),
});

const emergencyAssessmentSchema = z.object({
  jobId: z.string().uuid().optional(),
  voiceSessionId: z.string().uuid().optional(),
  emergencyType: emergencyTypeSchema,
  priority: z.number().int().min(0).max(1000).optional(),
  recommendedResponseMinutes: z.number().int().min(0).optional(),
  escalationRecommendation: z.string().trim().max(2000).optional(),
  branchRecommendation: z.string().trim().max(200).optional(),
});

const actionSchema = z.object({
  actionType: actionTypeSchema,
  subject: z.string().trim().min(1).max(500),
  recommendation: z.string().trim().min(1).max(5000),
  jobId: z.string().uuid().optional(),
  technicianId: z.string().uuid().optional(),
  callbackRequestId: z.string().uuid().optional(),
  payload: z.record(z.unknown()).optional(),
});

type DispatchIntelligenceRouterDeps = {
  dispatchIntelligenceService: DispatchIntelligenceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

export function createDispatchIntelligenceRouter({
  dispatchIntelligenceService,
  teamService,
  jwtSecret,
  authService,
}: DispatchIntelligenceRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'dispatch_intelligence:read',
    'dispatch_intelligence:write',
    'dispatch:read',
    'voice:read',
    'agents:read',
  );
  const requireWrite = requireAnyPermission(
    'dispatch_intelligence:write',
    'dispatch:write',
    'voice:write',
  );

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const dashboard = await dispatchIntelligenceService.getOperationsDashboard(companyId);
    res.json({ data: { dashboard } });
  });

  router.get('/call-queue', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const callQueue = await dispatchIntelligenceService.getCallQueueAnalytics(companyId);
    res.json({ data: { callQueue } });
  });

  router.get('/technician-matching', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const jobId = typeof req.query.jobId === 'string' ? req.query.jobId : undefined;
    const matches = await dispatchIntelligenceService.getTechnicianMatching(companyId, jobId);
    res.json({ data: { matches } });
  });

  router.get('/recommendations', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const recommendations = await dispatchIntelligenceService.listRecommendations(companyId);
    res.json({ data: { recommendations } });
  });

  router.post('/recommendations/generate', requireWrite, async (req, res) => {
    const { companyId } = getAuth(req);
    const branchKey = typeof req.body?.branchKey === 'string' ? req.body.branchKey : undefined;
    const recommendations = await dispatchIntelligenceService.generateRecommendations(companyId, {
      branchKey,
    });
    res.status(201).json({ data: { recommendations } });
  });

  router.get('/callbacks', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const callbacks = await dispatchIntelligenceService.listCallbackRequests(companyId, status);
    res.json({ data: { callbacks } });
  });

  router.post('/callbacks', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = callbackRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid callback payload' } });
      return;
    }

    const callback = await dispatchIntelligenceService.createCallbackRequest(
      { companyId: auth.companyId, userId: auth.userId },
      parsed.data,
    );
    res.status(201).json({ data: { callback } });
  });

  router.get('/emergency', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const assessments = await dispatchIntelligenceService.listEmergencyAssessments(companyId);
    res.json({ data: { assessments } });
  });

  router.post('/emergency', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = emergencyAssessmentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid emergency assessment payload' },
      });
      return;
    }

    const assessment = await dispatchIntelligenceService.createEmergencyAssessment(
      { companyId: auth.companyId, userId: auth.userId },
      parsed.data,
    );
    res.status(201).json({ data: { assessment } });
  });

  router.get('/receptionist', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const summaries = await dispatchIntelligenceService.listReceptionistSummaries(companyId);
    res.json({ data: { summaries } });
  });

  router.post('/receptionist', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = receptionistSummarySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid receptionist summary payload' },
      });
      return;
    }

    try {
      const summary = await dispatchIntelligenceService.createReceptionistSummary(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { summary } });
    } catch (error) {
      if (error instanceof DispatchIntelligenceError) {
        res.status(400).json({ error: { code: error.code, message: error.message } });
        return;
      }
      throw error;
    }
  });

  router.get('/routing', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const recommendations = await dispatchIntelligenceService.listRoutingRecommendations(companyId);
    res.json({ data: { recommendations } });
  });

  router.post('/routing', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = routingRecommendationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid routing recommendation payload' },
      });
      return;
    }

    const recommendation = await dispatchIntelligenceService.createRoutingRecommendation(
      { companyId: auth.companyId, userId: auth.userId },
      parsed.data,
    );
    res.status(201).json({ data: { recommendation } });
  });

  router.get('/actions', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const actions = await dispatchIntelligenceService.listActions(companyId, status);
    res.json({ data: { actions } });
  });

  router.post('/actions', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid dispatch action payload' } });
      return;
    }

    const action = await dispatchIntelligenceService.createAction(
      { companyId: auth.companyId, userId: auth.userId },
      parsed.data,
    );
    res.status(201).json({ data: { action } });
  });

  router.get('/aura/context', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const context = await dispatchIntelligenceService.buildDispatchAuraContext(companyId);
    res.json({ data: { context } });
  });

  return router;
}
