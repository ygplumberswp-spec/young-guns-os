import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseVoiceReceptionService } from '../services/enterprise-voice-reception.service.js';
import { EnterpriseVoiceReceptionError } from '../services/enterprise-voice-reception.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const platformConfigSchema = z.object({
  telephonyPolicy: z.record(z.unknown()).optional(),
  receptionistPolicy: z.record(z.unknown()).optional(),
  routingPolicy: z.record(z.unknown()).optional(),
  recordingPolicy: z.record(z.unknown()).optional(),
  languagePolicy: z.record(z.unknown()).optional(),
  auditRetentionDays: z.number().int().min(1).optional(),
});

const aiReceptionistSchema = z.object({
  enabled: z.boolean().optional(),
  welcomeMessage: z.string().trim().max(5000).optional(),
  confidenceThreshold: z.number().int().min(0).max(100).optional(),
  escalationPolicy: z.record(z.unknown()).optional(),
  knowledgePolicy: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
});

const telephonyProviderSchema = z.object({
  providerKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  enabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

const extensionSchema = z.object({
  extensionKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  destinationType: z.string().trim().min(1).max(100),
  destinationRef: z.string().trim().max(200).optional(),
  locationKey: z.string().trim().max(200).optional(),
});

const ringGroupSchema = z.object({
  groupKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  extensionIds: z.array(z.string()).optional(),
  strategy: z.string().trim().max(100).optional(),
});

const callQueueSchema = z.object({
  queueKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  maxWaitSeconds: z.number().int().optional(),
  overflowDestination: z.string().trim().max(200).optional(),
});

const routingRuleSchema = z.object({
  ruleKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  priority: z.number().int().optional(),
  matchCriteria: z.record(z.unknown()).optional(),
  destinationType: z.string().trim().min(1).max(100),
  destinationRef: z.string().trim().max(200).optional(),
});

const businessHoursSchema = z.object({
  scheduleKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  timezone: z.string().trim().max(100).optional(),
  weeklySchedule: z.record(z.unknown()).optional(),
  holidayOverrides: z.record(z.unknown()).optional(),
  afterHoursDestination: z.string().trim().max(200).optional(),
});

const emergencyRuleSchema = z.object({
  ruleKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  triggerKeywords: z.array(z.string()).optional(),
  escalationWorkflow: z.record(z.unknown()).optional(),
  priority: z.number().int().optional(),
});

const voicemailPolicySchema = z.object({
  policyKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  greetingText: z.string().trim().max(5000).optional(),
  retentionDays: z.number().int().optional(),
  config: z.record(z.unknown()).optional(),
});

const languageConfigSchema = z.object({
  languageCode: z.string().trim().min(2).max(20),
  name: z.string().trim().min(1).max(200),
  isDefault: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

const locationConfigSchema = z.object({
  locationKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  routingConfig: z.record(z.unknown()).optional(),
  businessHoursId: z.string().uuid().optional(),
});

const callIntelligenceSchema = z.object({
  voiceSessionId: z.string().uuid().optional(),
  durationSeconds: z.number().int().optional(),
  queueTimeSeconds: z.number().int().optional(),
  holdTimeSeconds: z.number().int().optional(),
  transferCount: z.number().int().optional(),
  outcome: z.string().trim().max(200).optional(),
  sentiment: z.string().trim().max(100).optional(),
  intent: z.string().trim().max(500).optional(),
  category: z.string().trim().max(200).optional(),
  actionItems: z.array(z.string()).optional(),
  followUps: z.array(z.string()).optional(),
  metrics: z.record(z.unknown()).optional(),
});

const conversationDraftSchema = z.object({
  voiceSessionId: z.string().uuid().optional(),
  draftType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  approvalRequired: z.boolean().optional(),
});

const actionDraftSchema = z.object({
  draftType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  sourceRecords: z.record(z.unknown()).optional(),
  aiGenerated: z.boolean().optional(),
});

type RouterDeps = {
  enterpriseVoiceReceptionService: EnterpriseVoiceReceptionService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function staffScope(req: import('express').Request) {
  const auth = getAuth(req);
  return { companyId: auth.companyId, userId: auth.userId };
}

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof EnterpriseVoiceReceptionError) {
    const status =
      error.code === 'NOT_FOUND' ? 404 : error.code === 'VALIDATION_ERROR' || error.code === 'FORBIDDEN' ? 400 : 500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createEnterpriseVoiceReceptionRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireStaffAuth = createAuthMiddleware({ jwtSecret: deps.jwtSecret, authService: deps.authService });
  const requireRead = requireAnyPermission(
    'voice_reception:read',
    'voice_reception:manage',
    'voice:read',
    'communications:read',
    'communications_intelligence:read',
  );
  const requireWrite = requireAnyPermission('voice_reception:write', 'voice_reception:manage', 'voice:write');
  const requireManage = requireAnyPermission('voice_reception:manage');

  router.use(requireStaffAuth);

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const dashboard = await deps.enterpriseVoiceReceptionService.getDashboard(auth.companyId);
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/platform-config', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const platformConfig = await deps.enterpriseVoiceReceptionService.getPlatformConfig(auth.companyId);
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/platform-config', requireManage, async (req, res) => {
    const parsed = platformConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid platform config' } });
      return;
    }
    try {
      const platformConfig = await deps.enterpriseVoiceReceptionService.updatePlatformConfig(staffScope(req), parsed.data);
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/ai-receptionist', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const aiReceptionist = await deps.enterpriseVoiceReceptionService.getAiReceptionistConfig(auth.companyId);
      res.json({ data: { aiReceptionist } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/ai-receptionist', requireManage, async (req, res) => {
    const parsed = aiReceptionistSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid AI receptionist config' } });
      return;
    }
    try {
      const aiReceptionist = await deps.enterpriseVoiceReceptionService.updateAiReceptionistConfig(staffScope(req), parsed.data);
      res.json({ data: { aiReceptionist } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/telephony-providers', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const telephonyProviders = await deps.enterpriseVoiceReceptionService.listTelephonyProviders(auth.companyId);
      res.json({ data: { telephonyProviders } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/telephony-providers', requireWrite, async (req, res) => {
    const parsed = telephonyProviderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid telephony provider' } });
      return;
    }
    try {
      const telephonyProvider = await deps.enterpriseVoiceReceptionService.createTelephonyProvider(staffScope(req), parsed.data);
      res.status(201).json({ data: { telephonyProvider } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/extensions', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const extensions = await deps.enterpriseVoiceReceptionService.listExtensions(auth.companyId);
      res.json({ data: { extensions } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/extensions', requireWrite, async (req, res) => {
    const parsed = extensionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid extension' } });
      return;
    }
    try {
      const extension = await deps.enterpriseVoiceReceptionService.createExtension(staffScope(req), parsed.data);
      res.status(201).json({ data: { extension } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/ring-groups', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const ringGroups = await deps.enterpriseVoiceReceptionService.listRingGroups(auth.companyId);
      res.json({ data: { ringGroups } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/ring-groups', requireWrite, async (req, res) => {
    const parsed = ringGroupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid ring group' } });
      return;
    }
    try {
      const ringGroup = await deps.enterpriseVoiceReceptionService.createRingGroup(staffScope(req), parsed.data);
      res.status(201).json({ data: { ringGroup } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/call-queues', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const callQueues = await deps.enterpriseVoiceReceptionService.listCallQueues(auth.companyId);
      res.json({ data: { callQueues } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/call-queues', requireWrite, async (req, res) => {
    const parsed = callQueueSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid call queue' } });
      return;
    }
    try {
      const callQueue = await deps.enterpriseVoiceReceptionService.createCallQueue(staffScope(req), parsed.data);
      res.status(201).json({ data: { callQueue } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/routing-rules', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const routingRules = await deps.enterpriseVoiceReceptionService.listRoutingRules(auth.companyId);
      res.json({ data: { routingRules } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/routing-rules', requireWrite, async (req, res) => {
    const parsed = routingRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid routing rule' } });
      return;
    }
    try {
      const routingRule = await deps.enterpriseVoiceReceptionService.createRoutingRule(staffScope(req), parsed.data);
      res.status(201).json({ data: { routingRule } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/business-hours', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const businessHours = await deps.enterpriseVoiceReceptionService.listBusinessHours(auth.companyId);
      res.json({ data: { businessHours } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/business-hours', requireWrite, async (req, res) => {
    const parsed = businessHoursSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid business hours' } });
      return;
    }
    try {
      const businessHours = await deps.enterpriseVoiceReceptionService.createBusinessHours(staffScope(req), parsed.data);
      res.status(201).json({ data: { businessHours } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/emergency-rules', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const emergencyRules = await deps.enterpriseVoiceReceptionService.listEmergencyRules(auth.companyId);
      res.json({ data: { emergencyRules } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/emergency-rules', requireWrite, async (req, res) => {
    const parsed = emergencyRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid emergency rule' } });
      return;
    }
    try {
      const emergencyRule = await deps.enterpriseVoiceReceptionService.createEmergencyRule(staffScope(req), parsed.data);
      res.status(201).json({ data: { emergencyRule } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/voicemail-policies', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const voicemailPolicies = await deps.enterpriseVoiceReceptionService.listVoicemailPolicies(auth.companyId);
      res.json({ data: { voicemailPolicies } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/voicemail-policies', requireWrite, async (req, res) => {
    const parsed = voicemailPolicySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid voicemail policy' } });
      return;
    }
    try {
      const voicemailPolicy = await deps.enterpriseVoiceReceptionService.createVoicemailPolicy(staffScope(req), parsed.data);
      res.status(201).json({ data: { voicemailPolicy } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/languages', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const languageConfigs = await deps.enterpriseVoiceReceptionService.listLanguageConfigs(auth.companyId);
      res.json({ data: { languageConfigs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/languages', requireWrite, async (req, res) => {
    const parsed = languageConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid language config' } });
      return;
    }
    try {
      const languageConfig = await deps.enterpriseVoiceReceptionService.createLanguageConfig(staffScope(req), parsed.data);
      res.status(201).json({ data: { languageConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/locations', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const locationConfigs = await deps.enterpriseVoiceReceptionService.listLocationConfigs(auth.companyId);
      res.json({ data: { locationConfigs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/locations', requireWrite, async (req, res) => {
    const parsed = locationConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid location config' } });
      return;
    }
    try {
      const locationConfig = await deps.enterpriseVoiceReceptionService.createLocationConfig(staffScope(req), parsed.data);
      res.status(201).json({ data: { locationConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/call-intelligence', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const callIntelligence = await deps.enterpriseVoiceReceptionService.listCallIntelligence(auth.companyId);
      res.json({ data: { callIntelligence } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/call-intelligence', requireWrite, async (req, res) => {
    const parsed = callIntelligenceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid call intelligence' } });
      return;
    }
    try {
      const callIntelligence = await deps.enterpriseVoiceReceptionService.captureCallIntelligence(staffScope(req), parsed.data);
      res.status(201).json({ data: { callIntelligence } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/conversation-drafts', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const conversationDrafts = await deps.enterpriseVoiceReceptionService.listConversationDrafts(auth.companyId);
      res.json({ data: { conversationDrafts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/conversation-drafts', requireWrite, async (req, res) => {
    const parsed = conversationDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid conversation draft' } });
      return;
    }
    try {
      const conversationDraft = await deps.enterpriseVoiceReceptionService.createConversationDraft(staffScope(req), parsed.data);
      res.status(201).json({ data: { conversationDraft } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/action-drafts', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const actionDrafts = await deps.enterpriseVoiceReceptionService.listActionDrafts(auth.companyId);
      res.json({ data: { actionDrafts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/action-drafts', requireWrite, async (req, res) => {
    const parsed = actionDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid action draft' } });
      return;
    }
    try {
      const actionDraft = await deps.enterpriseVoiceReceptionService.createActionDraft(staffScope(req), parsed.data);
      res.status(201).json({ data: { actionDraft } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/voice-alerts', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const voiceAlerts = await deps.enterpriseVoiceReceptionService.listVoiceAlerts(auth.companyId);
      res.json({ data: { voiceAlerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/voice-alerts/sync', requireWrite, async (req, res) => {
    try {
      const voiceAlerts = await deps.enterpriseVoiceReceptionService.syncVoiceAlerts(staffScope(req));
      res.json({ data: { voiceAlerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/analytics/capture', requireWrite, async (req, res) => {
    try {
      const analytics = await deps.enterpriseVoiceReceptionService.captureAnalytics(staffScope(req));
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/quality/capture', requireWrite, async (req, res) => {
    try {
      const quality = await deps.enterpriseVoiceReceptionService.captureQualityMetrics(staffScope(req));
      res.json({ data: { quality } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/audit-logs', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const auditLogs = await deps.enterpriseVoiceReceptionService.listAuditLogs(auth.companyId);
      res.json({ data: { auditLogs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/recording-policies', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const recordingPolicies = await deps.enterpriseVoiceReceptionService.listRecordingPolicies(auth.companyId);
      res.json({ data: { recordingPolicies } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
