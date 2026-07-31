import { Router } from 'express';
import { z } from 'zod';
import type { PersonalCommunicationsIntelligenceService } from '../services/personal-communications-intelligence.service.js';
import { PersonalCommunicationsIntelligenceError } from '../services/personal-communications-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const accountTypeSchema = z.enum(['personal', 'business']);
const classificationSchema = z.enum([
  'business_customer',
  'existing_customer',
  'new_lead',
  'supplier',
  'employee',
  'personal',
  'family',
  'friend',
  'marketing',
  'spam',
  'unknown',
]);
const actionTypeSchema = z.enum(['customer_reply', 'business_action']);

const accountSchema = z.object({
  accountType: accountTypeSchema,
  label: z.string().trim().min(1).max(200),
  phoneNumber: z.string().trim().max(50).optional(),
  whatsappConnectionId: z.string().uuid().optional(),
  syncEnabled: z.boolean().optional(),
});

const classificationOverrideSchema = z.object({
  classification: classificationSchema,
  notes: z.string().trim().max(2000).optional(),
});

const actionSchema = z.object({
  actionType: actionTypeSchema,
  subject: z.string().trim().min(1).max(500),
  recommendation: z.string().trim().min(1).max(5000),
  conversationId: z.string().uuid().optional(),
  payload: z.record(z.unknown()).optional(),
});

const privacySchema = z.object({
  businessOnlyMode: z.boolean().optional(),
  personalOnlyMode: z.boolean().optional(),
  excludedContacts: z.array(z.string()).optional(),
  excludedGroups: z.array(z.string()).optional(),
  excludedMediaTypes: z.array(z.string()).optional(),
});

const mediaAnalyzeSchema = z.object({
  mediaItemId: z.string().uuid(),
});

const voiceAnalyzeSchema = z.object({
  whatsappMessageId: z.string().uuid().optional(),
  mediaItemId: z.string().uuid().optional(),
});

type RouterDeps = {
  personalCommunicationsIntelligenceService: PersonalCommunicationsIntelligenceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

export function createPersonalCommunicationsIntelligenceRouter({
  personalCommunicationsIntelligenceService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'personal_communications:read',
    'personal_communications:write',
    'communications_intelligence:read',
    'communications:read',
    'communications:read',
    'integrations:read',
    'agents:read',
  );
  const requireWrite = requireAnyPermission(
    'personal_communications:write',
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
    const dashboard =
      await personalCommunicationsIntelligenceService.getExecutiveDashboard(companyId);
    res.json({ data: { dashboard } });
  });

  router.get('/accounts', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const accounts = await personalCommunicationsIntelligenceService.listAccounts(companyId);
    res.json({ data: { accounts } });
  });

  router.post('/accounts', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = accountSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid account payload' } });
      return;
    }
    try {
      const account = await personalCommunicationsIntelligenceService.createAccount(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { account } });
    } catch (error) {
      if (error instanceof PersonalCommunicationsIntelligenceError) {
        res.status(400).json({ error: { code: error.code, message: error.message } });
        return;
      }
      throw error;
    }
  });

  router.post('/conversations/sync', requireWrite, async (req, res) => {
    const { companyId } = getAuth(req);
    const conversations =
      await personalCommunicationsIntelligenceService.syncConversations(companyId);
    res.status(201).json({ data: { conversations } });
  });

  router.get('/conversations', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const conversations =
      await personalCommunicationsIntelligenceService.listBusinessConversations(companyId);
    res.json({ data: { conversations } });
  });

  router.post('/conversations/:conversationId/classification', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const conversationId = Array.isArray(req.params.conversationId)
      ? req.params.conversationId[0]
      : req.params.conversationId;
    const parsed = classificationOverrideSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid classification payload' } });
      return;
    }
    try {
      const conversation = await personalCommunicationsIntelligenceService.overrideClassification(
        { companyId: auth.companyId, userId: auth.userId },
        conversationId,
        parsed.data,
      );
      res.json({ data: { conversation } });
    } catch (error) {
      if (error instanceof PersonalCommunicationsIntelligenceError) {
        res.status(400).json({ error: { code: error.code, message: error.message } });
        return;
      }
      throw error;
    }
  });

  router.get('/media', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const media = await personalCommunicationsIntelligenceService.listMediaItems(companyId);
    res.json({ data: { media } });
  });

  router.get('/voice-analyses', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const analyses = await personalCommunicationsIntelligenceService.listVoiceAnalyses(companyId);
    res.json({ data: { analyses } });
  });

  router.post('/voice-analyses/analyze', requireWrite, async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = voiceAnalyzeSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid voice analysis payload' } });
      return;
    }
    const analysis = await personalCommunicationsIntelligenceService.analyzeVoiceNote(
      companyId,
      parsed.data,
    );
    res.status(201).json({ data: { analysis } });
  });

  router.get('/media-analyses', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const analyses = await personalCommunicationsIntelligenceService.listMediaAnalyses(companyId);
    res.json({ data: { analyses } });
  });

  router.post('/media-analyses/analyze', requireWrite, async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = mediaAnalyzeSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid media analysis payload' } });
      return;
    }
    const analysis = await personalCommunicationsIntelligenceService.analyzeMedia(
      companyId,
      parsed.data,
    );
    res.status(201).json({ data: { analysis } });
  });

  router.get('/document-analyses', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const analyses =
      await personalCommunicationsIntelligenceService.listDocumentAnalyses(companyId);
    res.json({ data: { analyses } });
  });

  router.post('/document-analyses/analyze', requireWrite, async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = mediaAnalyzeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid document analysis payload' },
      });
      return;
    }
    const analysis = await personalCommunicationsIntelligenceService.analyzeDocument(
      companyId,
      parsed.data,
    );
    res.status(201).json({ data: { analysis } });
  });

  router.get('/lead-signals', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const signals = await personalCommunicationsIntelligenceService.detectLeadSignals(companyId);
    res.json({ data: { signals } });
  });

  router.post('/lead-signals/detect', requireWrite, async (req, res) => {
    const { companyId } = getAuth(req);
    const signals = await personalCommunicationsIntelligenceService.detectLeadSignals(companyId);
    res.status(201).json({ data: { signals } });
  });

  router.get('/follow-ups', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const followUps = await personalCommunicationsIntelligenceService.listFollowUpQueue(companyId);
    res.json({ data: { followUps } });
  });

  router.post('/follow-ups/generate', requireWrite, async (req, res) => {
    const { companyId } = getAuth(req);
    const followUps =
      await personalCommunicationsIntelligenceService.generateFollowUpQueue(companyId);
    res.status(201).json({ data: { followUps } });
  });

  router.get('/privacy', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const privacy = await personalCommunicationsIntelligenceService.getPrivacySettings(companyId);
    res.json({ data: { privacy } });
  });

  router.put('/privacy', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = privacySchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid privacy payload' } });
      return;
    }
    const privacy = await personalCommunicationsIntelligenceService.updatePrivacySettings(
      { companyId: auth.companyId, userId: auth.userId },
      parsed.data,
    );
    res.json({ data: { privacy } });
  });

  router.get('/actions', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const actions = await personalCommunicationsIntelligenceService.listActions(companyId, status);
    res.json({ data: { actions } });
  });

  router.post('/actions', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid action payload' } });
      return;
    }
    try {
      const action = await personalCommunicationsIntelligenceService.createAction(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { action } });
    } catch (error) {
      if (error instanceof PersonalCommunicationsIntelligenceError) {
        res.status(400).json({ error: { code: error.code, message: error.message } });
        return;
      }
      throw error;
    }
  });

  router.get('/aura/context', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const context =
      await personalCommunicationsIntelligenceService.buildPersonalCommunicationsAuraContext(
        companyId,
      );
    res.json({ data: { context } });
  });

  return router;
}
