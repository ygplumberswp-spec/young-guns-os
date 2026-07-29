import { Router } from 'express';
import { z } from 'zod';
import type { VoiceService } from '../services/voice.service.js';
import { VoiceError } from '../services/voice.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const sessionStatusSchema = z.enum(['active', 'completed', 'missed', 'abandoned', 'failed']);
const channelSchema = z.enum(['phone', 'web_voice']);
const enquiryTypeSchema = z.enum([
  'new_enquiry',
  'existing_customer',
  'service_request',
  'quote_request',
  'appointment_request',
  'other',
]);
const speakerSchema = z.enum(['caller', 'agent', 'system']);
const outcomeTypeSchema = z.enum([
  'qualified',
  'appointment_requested',
  'quote_requested',
  'follow_up_required',
  'transferred',
  'resolved',
  'unresolved',
  'other',
]);
const followUpStatusSchema = z.enum(['pending', 'accepted', 'dismissed', 'completed']);

const createSessionSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  agentProfileId: z.string().uuid().optional().nullable(),
  status: sessionStatusSchema.optional(),
  channel: channelSchema.optional(),
  enquiryType: enquiryTypeSchema.optional(),
  callerName: z.string().trim().max(200).optional().nullable(),
  callerPhone: z.string().trim().max(50).optional().nullable(),
  callerEmail: z.string().trim().email().optional().nullable(),
  durationSeconds: z.number().int().min(0).optional().nullable(),
  summary: z.string().trim().max(8000).optional().nullable(),
  followUpRequired: z.boolean().optional(),
  qualification: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
  startedAt: z.string().datetime().optional(),
  endedAt: z.string().datetime().optional().nullable(),
});

const updateSessionSchema = createSessionSchema.partial();

const createConversationSchema = z.object({
  speaker: speakerSchema,
  content: z.string().trim().min(1).max(8000),
  occurredAt: z.string().datetime().optional(),
});

const createOutcomeSchema = z.object({
  outcomeType: outcomeTypeSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
  context: z.record(z.unknown()).optional(),
});

const updateFollowUpSchema = z.object({
  status: followUpStatusSchema,
});

type VoiceRouterDeps = {
  voiceService: VoiceService;
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

export function createVoiceRouter({
  voiceService,
  teamService,
  jwtSecret,
  authService,
}: VoiceRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission('voice:read', 'voice:write', 'communications:read');
  const requireWrite = requireAnyPermission('voice:write', 'communications:write');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/stats', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const stats = await voiceService.getStats(companyId);
    res.json({ data: { stats } });
  });

  router.get('/history', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const sessions = await voiceService.getCallHistory(companyId);
    res.json({ data: { sessions } });
  });

  router.get('/sessions', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const sessions = await voiceService.listSessions(companyId);
    res.json({ data: { sessions } });
  });

  router.post('/sessions', requireWrite, async (req, res) => {
    const parsed = createSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid session payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const session = await voiceService.createSession(auth, parsed.data);
      res.status(201).json({ data: { session } });
    } catch (error) {
      handleVoiceError(res, error);
    }
  });

  router.patch('/sessions/:id', requireWrite, async (req, res) => {
    const parsed = updateSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid session payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const session = await voiceService.updateSession(companyId, getRouteParam(req.params.id), parsed.data);
      res.json({ data: { session } });
    } catch (error) {
      handleVoiceError(res, error);
    }
  });

  router.get('/outcomes', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const outcomes = await voiceService.listOutcomes(companyId);
    res.json({ data: { outcomes } });
  });

  router.post('/sessions/:id/outcomes', requireWrite, async (req, res) => {
    const parsed = createOutcomeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid outcome payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const outcome = await voiceService.createOutcome(auth, getRouteParam(req.params.id), parsed.data);
      res.status(201).json({ data: { outcome } });
    } catch (error) {
      handleVoiceError(res, error);
    }
  });

  router.get('/follow-ups', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const followUps = await voiceService.listFollowUps(companyId);
    res.json({ data: { followUps } });
  });

  router.post('/follow-ups/generate', requireWrite, async (req, res) => {
    try {
      const { companyId } = getAuth(req);
      const followUps = await voiceService.generateFollowUpRecommendations(companyId);
      res.status(201).json({ data: { followUps } });
    } catch (error) {
      handleVoiceError(res, error);
    }
  });

  router.patch('/follow-ups/:id', requireWrite, async (req, res) => {
    const parsed = updateFollowUpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid follow-up payload' },
      });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const followUp = await voiceService.updateFollowUp(companyId, getRouteParam(req.params.id), parsed.data);
      res.json({ data: { followUp } });
    } catch (error) {
      handleVoiceError(res, error);
    }
  });

  router.get('/sessions/:id/conversations', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    try {
      const conversations = await voiceService.listConversations(companyId, getRouteParam(req.params.id));
      res.json({ data: { conversations } });
    } catch (error) {
      handleVoiceError(res, error);
    }
  });

  router.post('/sessions/:id/conversations', requireWrite, async (req, res) => {
    const parsed = createConversationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid conversation payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const conversation = await voiceService.addConversationTurn(auth, getRouteParam(req.params.id), parsed.data);
      res.status(201).json({ data: { conversation } });
    } catch (error) {
      handleVoiceError(res, error);
    }
  });

  router.get('/sessions/:id/summary', requireRead, async (req, res) => {
    try {
      const { companyId } = getAuth(req);
      const summary = await voiceService.summarizeCall(companyId, getRouteParam(req.params.id));
      res.json({ data: { summary } });
    } catch (error) {
      handleVoiceError(res, error);
    }
  });

  router.get('/sessions/:id/qualification', requireRead, async (req, res) => {
    try {
      const { companyId } = getAuth(req);
      const qualification = await voiceService.analyzeQualification(companyId, getRouteParam(req.params.id));
      res.json({ data: { qualification } });
    } catch (error) {
      handleVoiceError(res, error);
    }
  });

  router.get('/appointment-assistance', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const assistance = await voiceService.getAppointmentAssistance(companyId);
    res.json({ data: { assistance } });
  });

  router.get('/insights', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const insights = await voiceService.getWaitingEnquiries(companyId);
    res.json({ data: { insights } });
  });

  return router;
}

function handleVoiceError(res: import('express').Response, error: unknown) {
  if (error instanceof VoiceError) {
    res.status(error.code === 'NOT_FOUND' ? 404 : 400).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  throw error;
}
