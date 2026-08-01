import { Router } from 'express';
import { z } from 'zod';
import type { AiOrchestrationService } from '../services/ai-orchestration.service.js';
import { AiOrchestrationError } from '../services/ai-orchestration.service.js';
import type { AiUnifiedGatewayService } from '../services/ai-unified-gateway.service.js';
import type { AiMemorySyncService } from '../services/ai-memory-sync.service.js';
import type { AiComparisonService } from '../services/ai-comparison.service.js';
import { AiComparisonError } from '../services/ai-comparison.service.js';
import type { AiProviderResilienceService } from '../services/ai-provider-resilience.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission, requireCompanyMemoryWrite } from '../middleware/rbac.js';

const providerKeySchema = z.enum([
  'openai',
  'google_gemini',
  'anthropic_claude',
  'ollama',
  'azure_openai',
  'openrouter',
  'groq',
  'mistral',
  'custom',
]);

const routingCategorySchema = z.enum([
  'reasoning',
  'coding',
  'business_analysis',
  'finance',
  'legal',
  'marketing',
  'image_understanding',
  'document_analysis',
  'long_context_analysis',
  'speech',
  'translation',
  'summarization',
]);

const promptCategorySchema = z.enum(['system', 'department', 'agent']);
const actionTypeSchema = z.enum(['prompt_update', 'provider_configuration']);

const createProviderSchema = z.object({
  providerKey: providerKeySchema,
  displayName: z.string().trim().max(200).optional(),
  baseUrl: z.string().trim().max(500).optional(),
  apiVersion: z.string().trim().max(100).optional(),
  apiKey: z.string().trim().min(1).optional(),
  priorityWeight: z.number().int().min(0).max(1000).optional(),
  isEnabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

const updateProviderSchema = z.object({
  displayName: z.string().trim().max(200).optional(),
  baseUrl: z.string().trim().max(500).optional(),
  apiVersion: z.string().trim().max(100).optional(),
  apiKey: z.string().trim().min(1).optional(),
  status: z.enum(['active', 'inactive', 'degraded']).optional(),
  isEnabled: z.boolean().optional(),
  priorityWeight: z.number().int().min(0).max(1000).optional(),
  config: z.record(z.unknown()).optional(),
});

const routingRuleSchema = z.object({
  category: routingCategorySchema,
  routingMode: z.enum(['automatic', 'manual']).optional(),
  primaryProviderId: z.string().uuid().optional(),
  primaryModelId: z.string().uuid().optional(),
  fallbackChain: z
    .array(
      z.object({
        providerId: z.string().uuid().optional(),
        modelId: z.string().uuid().optional(),
        providerKey: providerKeySchema.optional(),
        modelKey: z.string().optional(),
      }),
    )
    .optional(),
  priorityOrder: z.number().int().min(0).optional(),
  weight: z.number().int().min(0).max(1000).optional(),
  isEnabled: z.boolean().optional(),
});

const promptTemplateSchema = z.object({
  templateKey: z.string().trim().min(1).max(200),
  category: promptCategorySchema,
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  agentKey: z.string().trim().max(100).optional(),
  content: z.string().trim().min(1).max(20000),
  changeNotes: z.string().trim().max(2000).optional(),
});

const promptVersionSchema = z.object({
  templateId: z.string().uuid(),
  content: z.string().trim().min(1).max(20000),
  changeNotes: z.string().trim().max(2000).optional(),
});

const configurationActionSchema = z.object({
  actionType: actionTypeSchema,
  subject: z.string().trim().min(1).max(500),
  recommendation: z.string().trim().min(1).max(5000),
  payload: z.record(z.unknown()).optional(),
});

const feedbackSchema = z.object({
  providerId: z.string().uuid().optional(),
  modelId: z.string().uuid().optional(),
  agentRunId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  correctionText: z.string().trim().max(5000).optional(),
  accepted: z.boolean().optional(),
  rejected: z.boolean().optional(),
  workflowOutcome: z.string().trim().max(2000).optional(),
});

const qualityEvaluationSchema = z.object({
  providerId: z.string().uuid().optional(),
  modelId: z.string().uuid().optional(),
  agentRunId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  responseQualityScore: z.number().min(0).max(100).optional(),
  success: z.boolean().optional(),
  correctionRate: z.number().min(0).max(1).optional(),
  hallucinationReported: z.boolean().optional(),
  responseTimeMs: z.number().int().min(0).optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
});

const memorySyncSchema = z.object({
  contextType: z.enum(['business', 'customer', 'job', 'finance', 'executive', 'workflow']),
  syncKey: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(500),
  content: z.string().trim().min(1).max(20000),
  summary: z.string().trim().max(5000).optional(),
  conversationId: z.string().uuid().optional(),
  providerId: z.string().uuid().optional(),
  classification: z.enum(['public', 'internal', 'confidential', 'restricted']).optional(),
});

const comparisonRunSchema = z.object({
  subject: z.string().trim().min(1).max(500),
  taskPrompt: z.string().trim().min(1).max(20000),
  routingCategory: routingCategorySchema.optional(),
  providerTargets: z
    .array(
      z.object({
        providerKey: providerKeySchema,
        modelKey: z.string().optional(),
        providerId: z.string().uuid().optional(),
      }),
    )
    .optional(),
});

type AiOrchestrationRouterDeps = {
  aiOrchestrationService: AiOrchestrationService;
  aiUnifiedGatewayService: AiUnifiedGatewayService;
  aiMemorySyncService: AiMemorySyncService;
  aiComparisonService: AiComparisonService;
  aiProviderResilienceService: AiProviderResilienceService;
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

export function createAiOrchestrationRouter({
  aiOrchestrationService,
  aiUnifiedGatewayService,
  aiMemorySyncService,
  aiComparisonService,
  aiProviderResilienceService,
  teamService,
  jwtSecret,
  authService,
}: AiOrchestrationRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'ai_orchestration:read',
    'ai_orchestration:write',
    'agents:read',
    'executive:read',
  );
  const requireWrite = requireAnyPermission('ai_orchestration:write', 'agents:write');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const dashboard = await aiOrchestrationService.getExecutiveDashboard(companyId);
    res.json({ data: { dashboard } });
  });

  router.get('/providers', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const providers = await aiOrchestrationService.listProviders(companyId);
    res.json({ data: { providers } });
  });

  router.post('/providers', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = createProviderSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid provider payload' } });
      return;
    }

    try {
      const provider = await aiOrchestrationService.createProvider(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { provider } });
    } catch (error) {
      if (error instanceof AiOrchestrationError) {
        res
          .status(error.code === 'NOT_FOUND' ? 404 : 400)
          .json({ error: { code: error.code, message: error.message } });
        return;
      }
      throw error;
    }
  });

  router.patch('/providers/:id', requireWrite, async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = updateProviderSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid provider update payload' } });
      return;
    }

    try {
      const provider = await aiOrchestrationService.updateProvider(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { provider } });
    } catch (error) {
      if (error instanceof AiOrchestrationError) {
        res
          .status(error.code === 'NOT_FOUND' ? 404 : 400)
          .json({ error: { code: error.code, message: error.message } });
        return;
      }
      throw error;
    }
  });

  router.get('/models', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const models = await aiOrchestrationService.listModels(companyId);
    res.json({ data: { models } });
  });

  router.get('/routing', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const [rules, statistics] = await Promise.all([
      aiOrchestrationService.listRoutingRules(companyId),
      aiOrchestrationService.getRoutingStatistics(companyId),
    ]);
    res.json({ data: { rules, statistics } });
  });

  router.post('/routing', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = routingRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid routing rule payload' } });
      return;
    }

    const rule = await aiOrchestrationService.createRoutingRule(
      { companyId: auth.companyId, userId: auth.userId },
      parsed.data,
    );
    res.status(201).json({ data: { rule } });
  });

  router.get('/prompts/templates', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const templates = await aiOrchestrationService.listPromptTemplates(companyId);
    res.json({ data: { templates } });
  });

  router.get('/prompts/versions', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const templateId = typeof req.query.templateId === 'string' ? req.query.templateId : undefined;
    const versions = await aiOrchestrationService.listPromptVersions(companyId, templateId);
    res.json({ data: { versions } });
  });

  router.post('/prompts/templates', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = promptTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid prompt template payload' } });
      return;
    }

    try {
      const result = await aiOrchestrationService.createPromptTemplate(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: result });
    } catch (error) {
      if (error instanceof AiOrchestrationError) {
        res
          .status(error.code === 'NOT_FOUND' ? 404 : 400)
          .json({ error: { code: error.code, message: error.message } });
        return;
      }
      throw error;
    }
  });

  router.post('/prompts/versions', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = promptVersionSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid prompt version payload' } });
      return;
    }

    try {
      const version = await aiOrchestrationService.createPromptVersion(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { version } });
    } catch (error) {
      if (error instanceof AiOrchestrationError) {
        res
          .status(error.code === 'NOT_FOUND' ? 404 : 400)
          .json({ error: { code: error.code, message: error.message } });
        return;
      }
      throw error;
    }
  });

  router.get('/costs', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const [costAnalytics, usage] = await Promise.all([
      aiOrchestrationService.getCostAnalytics(companyId),
      aiOrchestrationService.listUsageRecords(companyId),
    ]);
    res.json({ data: { costAnalytics, usage } });
  });

  router.get('/quality', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const [qualityAnalytics, evaluations, feedback] = await Promise.all([
      aiOrchestrationService.getQualityAnalytics(companyId),
      aiOrchestrationService.listQualityEvaluations(companyId),
      aiOrchestrationService.listFeedback(companyId),
    ]);
    res.json({ data: { qualityAnalytics, evaluations, feedback } });
  });

  router.post('/quality/evaluations', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = qualityEvaluationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid quality evaluation payload' },
      });
      return;
    }

    const evaluation = await aiOrchestrationService.createQualityEvaluation(
      { companyId: auth.companyId, userId: auth.userId },
      parsed.data,
    );
    res.status(201).json({ data: { evaluation } });
  });

  router.post('/feedback', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid feedback payload' } });
      return;
    }

    const feedback = await aiOrchestrationService.createFeedback(
      { companyId: auth.companyId, userId: auth.userId },
      parsed.data,
    );
    res.status(201).json({ data: { feedback } });
  });

  router.get('/failovers', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const failovers = await aiOrchestrationService.listFailoverEvents(companyId);
    res.json({ data: { failovers } });
  });

  router.get('/memory-sync', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const records = await aiOrchestrationService.listMemorySyncRecords(companyId);
    res.json({ data: { records } });
  });

  router.get('/actions', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const actions = await aiOrchestrationService.listConfigurationActions(companyId, status);
    res.json({ data: { actions } });
  });

  router.post('/actions', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = configurationActionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid configuration action payload' },
      });
      return;
    }

    const action = await aiOrchestrationService.createConfigurationAction(
      { companyId: auth.companyId, userId: auth.userId },
      parsed.data,
    );
    res.status(201).json({ data: { action } });
  });

  router.get('/aura/context', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const context = await aiOrchestrationService.buildAiOrchestrationAuraContext(companyId);
    res.json({ data: { context } });
  });

  router.get('/gateway/status', requireRead, async (req, res) => {
    const status = await aiUnifiedGatewayService.getGatewayStatus(getAuth(req).companyId);
    res.json({ data: { status } });
  });

  router.get('/resilience', requireRead, async (req, res) => {
    const resilience = await aiProviderResilienceService.getResilienceStatus(
      getAuth(req).companyId,
    );
    res.json({ data: { resilience } });
  });

  router.post('/memory-sync', requireWrite, requireCompanyMemoryWrite(), async (req, res) => {
    const auth = getAuth(req);
    const parsed = memorySyncSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid memory sync payload' } });
      return;
    }

    const result = await aiMemorySyncService.syncApprovedContext(
      {
        companyId: auth.companyId,
        userId: auth.userId,
        roleName: auth.roleName,
        permissions: auth.permissions,
      },
      parsed.data,
    );
    res.status(201).json({ data: result });
  });

  router.get('/comparisons', requireRead, async (req, res) => {
    const runs = await aiComparisonService.listComparisonRuns(getAuth(req).companyId);
    res.json({ data: { runs } });
  });

  router.post('/comparisons', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = comparisonRunSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid comparison payload' } });
      return;
    }

    try {
      const run = await aiComparisonService.createComparisonRun(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
        {
          messages: [{ role: 'user', content: parsed.data.taskPrompt }],
          context: {
            companyId: auth.companyId,
            companyName: 'Tenant',
            userName: 'Operator',
            industry: null,
            businessType: null,
            preferences: {},
          },
        },
      );
      res.status(201).json({ data: { run } });
    } catch (error) {
      if (error instanceof AiComparisonError) {
        res
          .status(error.code === 'NOT_FOUND' ? 404 : 400)
          .json({ error: { code: error.code, message: error.message } });
        return;
      }
      throw error;
    }
  });

  router.patch('/comparisons/:runId/status', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const statusSchema = z.object({ status: z.enum(['approved', 'rejected']) });
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid comparison status payload' },
      });
      return;
    }

    try {
      const run = await aiComparisonService.updateComparisonStatus(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.runId),
        parsed.data.status,
      );
      res.json({ data: { run } });
    } catch (error) {
      if (error instanceof AiComparisonError) {
        res
          .status(error.code === 'NOT_FOUND' ? 404 : 400)
          .json({ error: { code: error.code, message: error.message } });
        return;
      }
      throw error;
    }
  });

  return router;
}
