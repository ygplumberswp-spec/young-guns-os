import { Router } from 'express';
import { z } from 'zod';
import type { CommunicationsIntelligenceService } from '../services/communications-intelligence.service.js';
import { CommunicationsIntelligenceError } from '../services/communications-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const callTypeSchema = z.enum(['inbound', 'outbound', 'missed', 'transferred', 'voicemail', 'callback']);
const callOutcomeSchema = z.enum([
  'answered',
  'missed',
  'voicemail',
  'transferred',
  'resolved',
  'unresolved',
  'callback_requested',
]);
const sentimentSchema = z.enum(['positive', 'neutral', 'negative', 'mixed']);
const channelSchema = z.enum(['phone', 'whatsapp', 'email', 'sms', 'portal', 'support', 'internal']);
const sourceTypeSchema = z.enum([
  'voice_session',
  'whatsapp_message',
  'communication',
  'support_conversation',
  'portal_request',
]);
const draftTypeSchema = z.enum(['customer_reply', 'follow_up']);
const smsStatusSchema = z.enum(['sent', 'delivered', 'failed', 'replied']);

const recordingSchema = z.object({
  voiceSessionId: z.string().uuid().optional(),
  storageReference: z.string().trim().max(500).optional(),
  retentionPolicyDays: z.number().int().min(1).max(3650).optional(),
  consentStatus: z.string().trim().optional(),
  transcriptReference: z.string().trim().max(500).optional(),
  aiSummary: z.string().trim().max(5000).optional(),
});

const callIntelligenceSchema = z.object({
  voiceSessionId: z.string().uuid(),
  callType: callTypeSchema,
  customerId: z.string().uuid().optional(),
  queueName: z.string().trim().max(200).optional(),
  assignedStaffId: z.string().uuid().optional(),
  outcome: callOutcomeSchema.optional(),
  sentiment: sentimentSchema.optional(),
  intent: z.string().trim().max(500).optional(),
  followUpStatus: z.string().trim().max(100).optional(),
  recordingId: z.string().uuid().optional(),
});

const insightSchema = z.object({
  sourceType: sourceTypeSchema,
  sourceId: z.string().uuid(),
  channel: channelSchema,
  customerId: z.string().uuid().optional(),
  sentiment: sentimentSchema.optional(),
  urgencyScore: z.number().int().min(0).max(100).optional(),
  hasComplaint: z.boolean().optional(),
  hasCompliment: z.boolean().optional(),
  buyingIntent: z.boolean().optional(),
  cancellationRisk: z.boolean().optional(),
  escalationRisk: z.boolean().optional(),
  followUpRecommendation: z.string().trim().max(2000).optional(),
  aiSummary: z.string().trim().max(5000).optional(),
});

const emailThreadSchema = z.object({
  customerId: z.string().uuid(),
  subject: z.string().trim().min(1).max(500),
  threadKey: z.string().trim().min(1).max(500),
  communicationIds: z.array(z.string().uuid()).optional(),
  sentiment: sentimentSchema.optional(),
  priority: z.string().trim().max(50).optional(),
  aiSummary: z.string().trim().max(5000).optional(),
});

const smsRecordSchema = z.object({
  customerId: z.string().uuid().optional(),
  communicationId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  campaignKey: z.string().trim().max(200).optional(),
  direction: z.string().trim().min(1).max(50),
  status: smsStatusSchema.optional(),
  bodyPreview: z.string().trim().min(1).max(2000),
});

const draftActionSchema = z.object({
  draftType: draftTypeSchema,
  channel: channelSchema,
  customerId: z.string().uuid().optional(),
  subject: z.string().trim().max(500).optional(),
  body: z.string().trim().min(1).max(10000),
  sourceType: sourceTypeSchema.optional(),
  sourceId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  quoteId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
  supportConversationId: z.string().uuid().optional(),
});

type CommunicationsIntelligenceRouterDeps = {
  communicationsIntelligenceService: CommunicationsIntelligenceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

export function createCommunicationsIntelligenceRouter({
  communicationsIntelligenceService,
  teamService,
  jwtSecret,
  authService,
}: CommunicationsIntelligenceRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'communications_intelligence:read',
    'communications_intelligence:write',
    'communications:read',
    'voice:read',
  );
  const requireWrite = requireAnyPermission(
    'communications_intelligence:write',
    'communications:write',
  );

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const dashboard = await communicationsIntelligenceService.getUnifiedDashboard(companyId);
    res.json({ data: { dashboard } });
  });

  router.get('/analytics', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const analytics = await communicationsIntelligenceService.getAnalyticsDashboard(companyId);
    res.json({ data: { analytics } });
  });

  router.get('/timeline', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const customerId = typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
    const timeline = await communicationsIntelligenceService.buildTimeline(companyId, { customerId });
    res.json({ data: { timeline } });
  });

  router.get('/calls', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const calls = await communicationsIntelligenceService.getCallHistory(companyId);
    res.json({ data: { calls } });
  });

  router.post('/calls/intelligence', requireWrite, async (req, res) => {
    const parsed = callIntelligenceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid call intelligence payload' } });
      return;
    }
    try {
      const call = await communicationsIntelligenceService.createCallIntelligence(getAuth(req), parsed.data);
      res.status(201).json({ data: { call } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/recordings', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const recordings = await communicationsIntelligenceService.listRecordings(companyId);
    res.json({ data: { recordings } });
  });

  router.post('/recordings', requireWrite, async (req, res) => {
    const parsed = recordingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid recording payload' } });
      return;
    }
    try {
      const recording = await communicationsIntelligenceService.createRecording(getAuth(req), parsed.data);
      res.status(201).json({ data: { recording } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/insights', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const insights = await communicationsIntelligenceService.listConversationInsights(companyId);
    res.json({ data: { insights } });
  });

  router.get('/insights/:sourceType/:sourceId', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const sourceType = Array.isArray(req.params.sourceType) ? req.params.sourceType[0] : req.params.sourceType;
    const sourceId = Array.isArray(req.params.sourceId) ? req.params.sourceId[0] : req.params.sourceId;
    const insight = await communicationsIntelligenceService.getConversationSummary(
      companyId,
      sourceType,
      sourceId,
    );
    res.json({ data: { insight } });
  });

  router.post('/insights', requireWrite, async (req, res) => {
    const parsed = insightSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid insight payload' } });
      return;
    }
    try {
      const insight = await communicationsIntelligenceService.createConversationInsight(getAuth(req), parsed.data);
      res.status(201).json({ data: { insight } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/email-threads', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const threads = await communicationsIntelligenceService.listEmailThreads(companyId);
    res.json({ data: { threads } });
  });

  router.post('/email-threads', requireWrite, async (req, res) => {
    const parsed = emailThreadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid email thread payload' } });
      return;
    }
    try {
      const thread = await communicationsIntelligenceService.createEmailThread(getAuth(req), parsed.data);
      res.status(201).json({ data: { thread } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/sms', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const records = await communicationsIntelligenceService.listSmsRecords(companyId);
    res.json({ data: { records } });
  });

  router.post('/sms', requireWrite, async (req, res) => {
    const parsed = smsRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid SMS record payload' } });
      return;
    }
    try {
      const record = await communicationsIntelligenceService.createSmsRecord(getAuth(req), parsed.data);
      res.status(201).json({ data: { record } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/drafts', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const drafts = await communicationsIntelligenceService.listDraftActions(companyId, status);
    res.json({ data: { drafts } });
  });

  router.post('/drafts', requireWrite, async (req, res) => {
    const parsed = draftActionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid draft payload' } });
      return;
    }
    try {
      const draft = await communicationsIntelligenceService.createDraftAction(getAuth(req), parsed.data);
      res.status(201).json({ data: { draft } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/aura/context', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const context = await communicationsIntelligenceService.buildCommunicationsIntelligenceAuraContext(companyId);
    res.json({ data: { context } });
  });

  return router;
}

function handleError(res: import('express').Response, error: unknown) {
  if (error instanceof CommunicationsIntelligenceError) {
    const status =
      error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }

  throw error;
}
