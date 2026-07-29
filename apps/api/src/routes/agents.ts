import { Router } from 'express';
import { z } from 'zod';
import { getAgentRegistryEntry } from '@titan/shared';
import type { AgentsService } from '../services/agents.service.js';
import { AgentsError } from '../services/agents.service.js';
import type { AgentRuntimeService } from '../services/agent-runtime.service.js';
import { AgentRuntimeError } from '../services/agent-runtime.service.js';
import type { LeadsService } from '../services/leads.service.js';
import type { VoiceService } from '../services/voice.service.js';
import type { CustomerSupportService } from '../services/customer-support.service.js';
import type { RecruitingService } from '../services/recruiting.service.js';
import type { WorkforceService } from '../services/workforce.service.js';
import type { ProcurementService } from '../services/procurement.service.js';
import type { ExecutiveService } from '../services/executive.service.js';
import type { FinanceIntelligenceService } from '../services/finance-intelligence.service.js';
import type { KnowledgeService } from '../services/knowledge.service.js';
import type { BusinessIntelligenceService } from '../services/business-intelligence.service.js';
import type { EnterpriseAutomationStudioService } from '../services/enterprise-automation-studio.service.js';
import type { WorkflowStudioService } from '../services/workflow-studio.service.js';
import type { PortalExperienceService } from '../services/portal-experience.service.js';
import type { MobileWorkforceService } from '../services/mobile-workforce.service.js';
import type { QualityAssuranceService } from '../services/quality-assurance.service.js';
import type { CommunicationsIntelligenceService } from '../services/communications-intelligence.service.js';
import type { AssetEquipmentIntelligenceService } from '../services/asset-equipment-intelligence.service.js';
import type { AiOrchestrationService } from '../services/ai-orchestration.service.js';
import type { DispatchIntelligenceService } from '../services/dispatch-intelligence.service.js';
import type { FleetIntelligenceService } from '../services/fleet-intelligence.service.js';
import type { PersonalCommunicationsIntelligenceService } from '../services/personal-communications-intelligence.service.js';
import type { EnterpriseSecurityService } from '../services/enterprise-security.service.js';
import type { EnterpriseAnalyticsService } from '../services/enterprise-analytics.service.js';
import type { IntegrationPlatformService } from '../services/integration-platform.service.js';
import type { ConnectorEngineService } from '../services/connector-engine.service.js';
import type { IntegrationApiManagementService } from '../services/integration-api-management.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const agentKeySchema = z.enum([
  'executive',
  'operations',
  'finance',
  'recruiting',
  'sales',
  'marketing',
  'lead_generation',
  'voice_receptionist',
  'customer_support',
  'procurement',
  'security',
  'integration',
  'business_intelligence',
  'automation',
]);
const profileStatusSchema = z.enum(['draft', 'active', 'paused']);

const createProfileSchema = z.object({
  agentKey: agentKeySchema,
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  status: profileStatusSchema.optional(),
  config: z.record(z.unknown()).optional(),
  permissions: z.array(z.string().trim().min(1).max(100)).optional(),
  enabledToolKeys: z.array(z.string().trim().min(1).max(100)).optional(),
});

const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  status: profileStatusSchema.optional(),
  config: z.record(z.unknown()).optional(),
});

const setPermissionsSchema = z.object({
  permissions: z.array(z.string().trim().min(1).max(100)),
});

const setToolsSchema = z.object({
  tools: z.array(
    z.object({
      toolKey: z.string().trim().min(1).max(100),
      enabled: z.boolean(),
      config: z.record(z.unknown()).optional(),
    }),
  ),
});

const runAgentSchema = z.object({
  request: z.string().trim().min(1).max(8000),
  agentKey: agentKeySchema.optional(),
  agentProfileId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  pageContext: z
    .object({
      customerId: z.string().uuid().optional(),
      jobId: z.string().uuid().optional(),
      vehicleId: z.string().uuid().optional(),
      schedulingView: z.boolean().optional(),
    })
    .optional(),
});

const updateTaskSchema = z.object({
  preview: z.string().trim().min(1).max(2000).optional(),
  payload: z.record(z.unknown()).optional(),
});

type AgentsRouterDeps = {
  agentsService: AgentsService;
  agentRuntimeService: AgentRuntimeService;
  leadsService: LeadsService;
  voiceService: VoiceService;
  customerSupportService: CustomerSupportService;
  recruitingService: RecruitingService;
  workforceService: WorkforceService;
  procurementService: ProcurementService;
  executiveService: ExecutiveService;
  financeIntelligenceService: FinanceIntelligenceService;
  knowledgeService: KnowledgeService;
  businessIntelligenceService: BusinessIntelligenceService;
  workflowStudioService: WorkflowStudioService;
  integrationApiManagementService: IntegrationApiManagementService;
  portalExperienceService: PortalExperienceService;
  mobileWorkforceService: MobileWorkforceService;
  qualityAssuranceService: QualityAssuranceService;
  communicationsIntelligenceService: CommunicationsIntelligenceService;
  assetEquipmentIntelligenceService: AssetEquipmentIntelligenceService;
  aiOrchestrationService: AiOrchestrationService;
  dispatchIntelligenceService: DispatchIntelligenceService;
  fleetIntelligenceService: FleetIntelligenceService;
  personalCommunicationsIntelligenceService: PersonalCommunicationsIntelligenceService;
  enterpriseSecurityService: EnterpriseSecurityService;
  integrationPlatformService: IntegrationPlatformService;
  connectorEngineService: ConnectorEngineService;
  enterpriseAnalyticsService: EnterpriseAnalyticsService;
  enterpriseAutomationStudioService: EnterpriseAutomationStudioService;
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

export function createAgentsRouter({
  agentsService,
  agentRuntimeService,
  leadsService,
  voiceService,
  customerSupportService,
  recruitingService,
  workforceService,
  procurementService,
  executiveService,
  financeIntelligenceService,
  knowledgeService,
  businessIntelligenceService: _businessIntelligenceService,
  workflowStudioService: _workflowStudioService,
  integrationApiManagementService,
  portalExperienceService,
  mobileWorkforceService,
  qualityAssuranceService,
  communicationsIntelligenceService,
  assetEquipmentIntelligenceService,
  aiOrchestrationService,
  dispatchIntelligenceService,
  fleetIntelligenceService,
  personalCommunicationsIntelligenceService,
  enterpriseSecurityService,
  integrationPlatformService,
  connectorEngineService: _connectorEngineService,
  enterpriseAnalyticsService,
  enterpriseAutomationStudioService,
  teamService,
  jwtSecret,
  authService,
}: AgentsRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    const { companyId } = getAuth(req);
    await teamService.ensureDefaultRoles(companyId);
    next();
  });

  router.get('/stats', requireAnyPermission('agents:read', 'agents:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const stats = await agentsService.getStats(companyId);
    res.json({ data: stats });
  });

  router.get('/registry', requireAnyPermission('agents:read', 'agents:write'), async (_req, res) => {
    const registry = agentsService.getRegistry();
    res.json({ data: { registry } });
  });

  router.get('/tools', requireAnyPermission('agents:read', 'agents:write'), async (_req, res) => {
    const tools = agentsService.getToolCatalog();
    res.json({ data: { tools } });
  });

  router.get(
    '/lead-generation',
    requireAnyPermission('agents:read', 'leads:read', 'leads:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('lead_generation');
      const context = await leadsService.buildAuraContext(companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/voice-receptionist',
    requireAnyPermission('agents:read', 'voice:read', 'voice:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('voice_receptionist');
      const context = await voiceService.buildAuraContext(companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/customer-support',
    requireAnyPermission('agents:read', 'customer_support:read', 'customer_support:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('customer_support');
      const context = await customerSupportService.buildAuraContext(companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/recruiting',
    requireAnyPermission(
      'agents:read',
      'recruiting:read',
      'recruiting:write',
      'workforce:read',
      'workforce:write',
    ),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('recruiting');
      const [recruiting, workforce] = await Promise.all([
        recruitingService.buildAuraContext(companyId),
        workforceService.buildAuraContext(companyId),
      ]);
      res.json({ data: { registry, context: { recruiting, workforce } } });
    },
  );

  router.get(
    '/procurement',
    requireAnyPermission('agents:read', 'procurement:read', 'procurement:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('procurement');
      const context = await procurementService.buildAuraContext(companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/executive',
    requireAnyPermission('agents:read', 'executive:read', 'executive:write', 'intelligence:read'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('executive');
      const context = await executiveService.buildAuraContext(companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/finance',
    requireAnyPermission('agents:read', 'finance:read', 'finance:write', 'intelligence:read'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('finance');
      const context = await financeIntelligenceService.buildAuraContext(companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/knowledge',
    requireAnyPermission('agents:read', 'knowledge:read', 'knowledge:write', 'intelligence:read'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const context = await knowledgeService.buildAuraContext(companyId);
      res.json({ data: { context } });
    },
  );

  router.get(
    '/business-intelligence',
    requireAnyPermission('agents:read', 'bi:read', 'bi:write', 'intelligence:read', 'analytics:read'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('business_intelligence');
      const context = await enterpriseAnalyticsService.buildAnalyticsAuraContext(companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/automation',
    requireAnyPermission('agents:read', 'automation:read', 'automation:write', 'intelligence:read'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('automation');
      const context = await enterpriseAutomationStudioService.buildAutomationAuraContext(companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/integrations',
    requireAnyPermission('agents:read', 'integrations:read', 'integrations:manage', 'intelligence:read'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('finance');
      const context = await integrationApiManagementService.buildAuraContext(companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/portal',
    requireAnyPermission('agents:read', 'portal:read', 'customer_support:read', 'intelligence:read'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('customer_support');
      const customerId = typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
      const context = customerId
        ? await portalExperienceService.buildStaffCustomerAuraContext({ companyId, customerId })
        : null;
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/mobile',
    requireAnyPermission('agents:read', 'mobile:read', 'jobs:read', 'intelligence:read'),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('operations');
      const context = await mobileWorkforceService.buildWorkforceAuraContext(auth);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/quality',
    requireAnyPermission('agents:read', 'quality:read', 'quality:write', 'executive:read'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('executive');
      const context = await qualityAssuranceService.buildQualityAuraContext(companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/communications-intelligence',
    requireAnyPermission(
      'agents:read',
      'communications_intelligence:read',
      'communications_intelligence:write',
      'voice:read',
      'customer_support:read',
    ),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('customer_support');
      const context =
        await communicationsIntelligenceService.buildCommunicationsIntelligenceAuraContext(companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/asset-equipment',
    requireAnyPermission('agents:read', 'asset_equipment:read', 'asset_equipment:write', 'fleet:read'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('operations');
      const context = await assetEquipmentIntelligenceService.buildAssetAuraContext(companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/ai-orchestration',
    requireAnyPermission(
      'agents:read',
      'ai_orchestration:read',
      'ai_orchestration:write',
      'executive:read',
    ),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('executive');
      const context = await aiOrchestrationService.buildAiOrchestrationAuraContext(companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/dispatch-intelligence',
    requireAnyPermission(
      'agents:read',
      'dispatch_intelligence:read',
      'dispatch_intelligence:write',
      'dispatch:read',
      'voice:read',
    ),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('operations');
      const context = await dispatchIntelligenceService.buildDispatchAuraContext(companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/fleet-intelligence',
    requireAnyPermission(
      'agents:read',
      'fleet_intelligence:read',
      'fleet_intelligence:write',
      'fleet:read',
      'integrations:read',
    ),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('operations');
      const context = await fleetIntelligenceService.buildFleetIntelligenceAuraContext(companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/personal-communications-intelligence',
    requireAnyPermission(
      'agents:read',
      'personal_communications:read',
      'personal_communications:write',
      'communications_intelligence:read',
      'communications:read',
    ),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('voice_receptionist');
      const context =
        await personalCommunicationsIntelligenceService.buildPersonalCommunicationsAuraContext(companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/security',
    requireAnyPermission('agents:read', 'security:read', 'security:write', 'settings:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('security');
      const context = await enterpriseSecurityService.buildSecurityAuraContext(companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/integration-platform',
    requireAnyPermission('agents:read', 'integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('integration');
      const context = await integrationPlatformService.buildIntegrationAuraContext(companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get('/profiles', requireAnyPermission('agents:read', 'agents:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const profiles = await agentsService.listProfiles(companyId);
    res.json({ data: { profiles } });
  });

  router.post('/profiles', requireAnyPermission('agents:write'), async (req, res) => {
    const { companyId, userId } = getAuth(req);
    const parsed = createProfileSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid agent profile payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const profile = await agentsService.createProfile({ companyId, userId }, parsed.data);
      res.status(201).json({ data: { profile } });
    } catch (error) {
      handleAgentsError(res, error);
    }
  });

  router.get(
    '/profiles/:id',
    requireAnyPermission('agents:read', 'agents:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const profile = await agentsService.getProfile(companyId, getRouteParam(req.params.id));

      if (!profile) {
        res.status(404).json({
          error: {
            code: 'PROFILE_NOT_FOUND',
            message: 'Agent profile not found',
          },
        });
        return;
      }

      res.json({ data: { profile } });
    },
  );

  router.patch('/profiles/:id', requireAnyPermission('agents:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = updateProfileSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid agent profile payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const profile = await agentsService.updateProfile(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { profile } });
    } catch (error) {
      handleAgentsError(res, error);
    }
  });

  router.put(
    '/profiles/:id/permissions',
    requireAnyPermission('agents:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const parsed = setPermissionsSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid permissions payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const profile = await agentsService.setProfilePermissions(
          companyId,
          getRouteParam(req.params.id),
          parsed.data,
        );
        res.json({ data: { profile } });
      } catch (error) {
        handleAgentsError(res, error);
      }
    },
  );

  router.put('/profiles/:id/tools', requireAnyPermission('agents:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = setToolsSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid tools payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const profile = await agentsService.setProfileTools(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { profile } });
    } catch (error) {
      handleAgentsError(res, error);
    }
  });

  router.get(
    '/executions',
    requireAnyPermission('agents:read', 'agents:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const executions = await agentsService.listExecutions(companyId);
      res.json({ data: { executions } });
    },
  );

  router.get(
    '/profiles/:id/executions',
    requireAnyPermission('agents:read', 'agents:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);

      try {
        const executions = await agentsService.listProfileExecutions(
          companyId,
          getRouteParam(req.params.id),
        );
        res.json({ data: { executions } });
      } catch (error) {
        handleAgentsError(res, error);
      }
    },
  );

  router.post('/runs', requireAnyPermission('agents:read', 'agents:write'), async (req, res) => {
    const auth = getAuth(req);
    const parsed = runAgentSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid agent run payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const result = await agentRuntimeService.runAgent(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: result });
    } catch (error) {
      handleAgentRuntimeError(res, error);
    }
  });

  router.get('/runs', requireAnyPermission('agents:read', 'agents:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const runs = await agentRuntimeService.listRuns(companyId);
    res.json({ data: { runs } });
  });

  router.get('/runs/:runId', requireAnyPermission('agents:read', 'agents:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const run = await agentRuntimeService.getRun(companyId, getRouteParam(req.params.runId));

    if (!run) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Agent run not found' } });
      return;
    }

    res.json({ data: { run } });
  });

  router.get('/tasks', requireAnyPermission('agents:read', 'agents:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const tasks = await agentRuntimeService.listTasks(companyId, status);
    res.json({ data: { tasks } });
  });

  router.post('/tasks/:taskId/approve', requireAnyPermission('agents:write'), async (req, res) => {
    const auth = getAuth(req);

    try {
      const task = await agentRuntimeService.approveTask(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.taskId),
      );
      res.json({ data: { task } });
    } catch (error) {
      handleAgentRuntimeError(res, error);
    }
  });

  router.post('/tasks/:taskId/reject', requireAnyPermission('agents:write'), async (req, res) => {
    const auth = getAuth(req);

    try {
      const task = await agentRuntimeService.rejectTask(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.taskId),
      );
      res.json({ data: { task } });
    } catch (error) {
      handleAgentRuntimeError(res, error);
    }
  });

  router.patch('/tasks/:taskId', requireAnyPermission('agents:write'), async (req, res) => {
    const auth = getAuth(req);
    const parsed = updateTaskSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid task payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const task = await agentRuntimeService.updateTask(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.taskId),
        parsed.data,
      );
      res.json({ data: { task } });
    } catch (error) {
      handleAgentRuntimeError(res, error);
    }
  });

  return router;
}

function handleAgentRuntimeError(res: import('express').Response, error: unknown) {
  if (error instanceof AgentRuntimeError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'FORBIDDEN'
          ? 403
          : error.code === 'PROVIDER_NOT_CONFIGURED'
            ? 503
            : error.code === 'VALIDATION_ERROR' || error.code === 'INVALID_STATE'
              ? 400
              : 400;

    res.status(status).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  throw error;
}

function handleAgentsError(res: import('express').Response, error: unknown) {
  if (error instanceof AgentsError) {
    const status =
      error.code === 'PROFILE_NOT_FOUND'
        ? 404
        : error.code === 'PROFILE_ALREADY_EXISTS'
          ? 409
          : error.code === 'VALIDATION_ERROR' ||
              error.code === 'INVALID_AGENT_KEY' ||
              error.code === 'INVALID_TOOL_KEY'
            ? 400
            : 400;

    res.status(status).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  throw error;
}
