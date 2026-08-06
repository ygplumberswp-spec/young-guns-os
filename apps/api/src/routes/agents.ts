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
import type { EnterpriseKnowledgeGraphService } from '../services/enterprise-knowledge-graph.service.js';
import type { EnterpriseMissionControlService } from '../services/enterprise-mission-control.service.js';
import type { EnterpriseEvolutionService } from '../services/enterprise-evolution.service.js';
import type { EnterpriseDeveloperPlatformService } from '../services/enterprise-developer-platform.service.js';
import type { EnterpriseSaasPlatformService } from '../services/enterprise-saas-platform.service.js';
import type { EnterpriseProductionReadinessService } from '../services/enterprise-production-readiness.service.js';
import type { EnterpriseMobilePlatformService } from '../services/enterprise-mobile-platform.service.js';
import type { EnterpriseUnifiedCommunicationsService } from '../services/enterprise-unified-communications.service.js';
import type { EnterpriseCustomerExperienceService } from '../services/enterprise-customer-experience.service.js';
import type { EnterpriseAssetLifecycleService } from '../services/enterprise-asset-lifecycle.service.js';
import type { EnterpriseWorkforceIntelligenceService } from '../services/enterprise-workforce-intelligence.service.js';
import type { EnterpriseLegalComplianceService } from '../services/enterprise-legal-compliance.service.js';
import type { EnterpriseFinancialPlanningService } from '../services/enterprise-financial-planning.service.js';
import type { EnterpriseSalesIntelligenceService } from '../services/enterprise-sales-intelligence.service.js';
import type { EnterpriseMarketingIntelligenceService } from '../services/enterprise-marketing-intelligence.service.js';
import type { EnterpriseServiceDeliveryService } from '../services/enterprise-service-delivery.service.js';
import type { EnterpriseItOperationsService } from '../services/enterprise-it-operations.service.js';
import type { EnterpriseBusinessEvolutionService } from '../services/enterprise-business-evolution.service.js';
import type { EnterpriseAppBuilderService } from '../services/enterprise-app-builder.service.js';
import type { EnterpriseIndustryPackService } from '../services/enterprise-industry-packs.service.js';
import type { EnterprisePublicDeveloperPlatformService } from '../services/enterprise-public-developer-platform.service.js';
import type { EnterpriseSaasManagementService } from '../services/enterprise-saas-management.service.js';
import type { EnterpriseVoiceReceptionService } from '../services/enterprise-voice-reception.service.js';
import type { EnterpriseDocumentAiService } from '../services/enterprise-document-ai.service.js';
import type { EnterpriseBusinessContinuityService } from '../services/enterprise-business-continuity.service.js';
import type { EnterpriseGlobalSearchService } from '../services/enterprise-global-search.service.js';
import type { EnterpriseDataMigrationService } from '../services/enterprise-data-migration.service.js';
import type { EnterpriseNotificationsService } from '../services/enterprise-notifications.service.js';
import type { EnterprisePlatformHealthService } from '../services/enterprise-platform-health.service.js';
import type { EnterpriseLaunchCenterService } from '../services/enterprise-launch-center.service.js';
import type { EnterpriseReleaseCenterService } from '../services/enterprise-release-center.service.js';
import type { EnterpriseProductionLaunchService } from '../services/enterprise-production-launch.service.js';
import type { EnterpriseReleaseManagementService } from '../services/enterprise-release-management.service.js';
import type { EnterpriseDigitalTwinService } from '../services/enterprise-digital-twin.service.js';
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
import { applyStaffOwnerGuards } from '../middleware/staff-owner-guard.js';

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
  'decision_intelligence',
  'knowledge',
  'executive_operations',
  'evolution',
  'developer',
  'saas',
  'production_operations',
  'mobile_field',
  'communications',
  'customer_experience',
  'asset_intelligence',
  'workforce_intelligence',
  'legal_compliance',
  'financial_planning',
  'sales_intelligence',
  'marketing_intelligence',
  'service_delivery',
  'it_operations',
  'business_evolution',
  'app_builder',
  'industry_intelligence',
  'developer_platform',
  'saas_management',
  'voice_reception',
  'document_intelligence',
  'business_continuity',
  'search_intelligence',
  'migration_intelligence',
  'notification_intelligence',
  'platform_health',
  'launch_readiness',
  'release_candidate',
  'production_launch',
  'release_manager',
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
  enterpriseDigitalTwinService: EnterpriseDigitalTwinService;
  enterpriseKnowledgeGraphService: EnterpriseKnowledgeGraphService;
  enterpriseMissionControlService: EnterpriseMissionControlService;
  enterpriseEvolutionService: EnterpriseEvolutionService;
  enterpriseDeveloperPlatformService: EnterpriseDeveloperPlatformService;
  enterpriseSaasPlatformService: EnterpriseSaasPlatformService;
  enterpriseProductionReadinessService: EnterpriseProductionReadinessService;
  enterpriseMobilePlatformService: EnterpriseMobilePlatformService;
  enterpriseUnifiedCommunicationsService: EnterpriseUnifiedCommunicationsService;
  enterpriseCustomerExperienceService: EnterpriseCustomerExperienceService;
  enterpriseAssetLifecycleService: EnterpriseAssetLifecycleService;
  enterpriseWorkforceIntelligenceService: EnterpriseWorkforceIntelligenceService;
  enterpriseLegalComplianceService: EnterpriseLegalComplianceService;
  enterpriseFinancialPlanningService: EnterpriseFinancialPlanningService;
  enterpriseSalesIntelligenceService: EnterpriseSalesIntelligenceService;
  enterpriseMarketingIntelligenceService: EnterpriseMarketingIntelligenceService;
  enterpriseServiceDeliveryService: EnterpriseServiceDeliveryService;
  enterpriseItOperationsService: EnterpriseItOperationsService;
  enterpriseBusinessEvolutionService: EnterpriseBusinessEvolutionService;
  enterpriseAppBuilderService: EnterpriseAppBuilderService;
  enterpriseIndustryPackService: EnterpriseIndustryPackService;
  enterprisePublicDeveloperPlatformService: EnterprisePublicDeveloperPlatformService;
  enterpriseSaasManagementService: EnterpriseSaasManagementService;
  enterpriseVoiceReceptionService: EnterpriseVoiceReceptionService;
  enterpriseDocumentAiService: EnterpriseDocumentAiService;
  enterpriseBusinessContinuityService: EnterpriseBusinessContinuityService;
  enterpriseGlobalSearchService: EnterpriseGlobalSearchService;
  enterpriseDataMigrationService: EnterpriseDataMigrationService;
  enterpriseNotificationsService: EnterpriseNotificationsService;
  enterprisePlatformHealthService: EnterprisePlatformHealthService;
  enterpriseLaunchCenterService: EnterpriseLaunchCenterService;
  enterpriseReleaseCenterService: EnterpriseReleaseCenterService;
  enterpriseProductionLaunchService: EnterpriseProductionLaunchService;
  enterpriseReleaseManagementService: EnterpriseReleaseManagementService;
  teamService: TeamService;
  db: import('@titan/db').DatabaseClient;
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
  knowledgeService: _knowledgeService,
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
  enterpriseDigitalTwinService,
  enterpriseKnowledgeGraphService,
  enterpriseMissionControlService,
  enterpriseEvolutionService,
  enterpriseDeveloperPlatformService,
  enterpriseSaasPlatformService,
  enterpriseProductionReadinessService,
  enterpriseMobilePlatformService,
  enterpriseUnifiedCommunicationsService,
  enterpriseCustomerExperienceService,
  enterpriseAssetLifecycleService,
  enterpriseWorkforceIntelligenceService,
  enterpriseLegalComplianceService,
  enterpriseFinancialPlanningService,
  enterpriseSalesIntelligenceService,
  enterpriseMarketingIntelligenceService,
  enterpriseServiceDeliveryService,
  enterpriseItOperationsService,
  enterpriseBusinessEvolutionService,
  enterpriseAppBuilderService,
  enterpriseIndustryPackService,
  enterprisePublicDeveloperPlatformService,
  enterpriseSaasManagementService,
  enterpriseVoiceReceptionService,
  enterpriseDocumentAiService,
  enterpriseBusinessContinuityService,
  enterpriseGlobalSearchService,
  enterpriseDataMigrationService,
  enterpriseNotificationsService,
  enterprisePlatformHealthService,
  enterpriseLaunchCenterService,
  enterpriseReleaseCenterService,
  enterpriseProductionLaunchService,
  enterpriseReleaseManagementService,
  teamService,
  db,
  jwtSecret,
  authService,
}: AgentsRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);
  applyStaffOwnerGuards(router, db);
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

  router.get(
    '/registry',
    requireAnyPermission('agents:read', 'agents:write'),
    async (_req, res) => {
      const registry = agentsService.getRegistry();
      res.json({ data: { registry } });
    },
  );

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
      const registry = getAgentRegistryEntry('knowledge');
      const context =
        await enterpriseKnowledgeGraphService.buildKnowledgeGraphAuraContext(companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/business-intelligence',
    requireAnyPermission(
      'agents:read',
      'bi:read',
      'bi:write',
      'intelligence:read',
      'analytics:read',
    ),
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
    '/decision-intelligence',
    requireAnyPermission('agents:read', 'executive:read', 'executive:write', 'intelligence:read'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('decision_intelligence');
      const context = await enterpriseDigitalTwinService.buildDigitalTwinAuraContext(companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/executive-operations',
    requireAnyPermission('agents:read', 'executive:read', 'executive:write', 'intelligence:read'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('executive_operations');
      const context =
        await enterpriseMissionControlService.buildMissionControlAuraContext(companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/evolution',
    requireAnyPermission(
      'agents:read',
      'intelligence:read',
      'executive:read',
      'ai_orchestration:read',
    ),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('evolution');
      const context = await enterpriseEvolutionService.buildEvolutionAuraContext(companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/developer',
    requireAnyPermission('agents:read', 'integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('developer');
      const context = await enterpriseDeveloperPlatformService.buildDeveloperAuraContext(companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/saas',
    requireAnyPermission('agents:read', 'saas:read', 'saas:manage', 'platform:read'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('saas');
      const context = await enterpriseSaasPlatformService.buildSaasAuraContext(companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/production-operations',
    requireAnyPermission(
      'agents:read',
      'ops:read',
      'ops:manage',
      'platform:read',
      'platform:manage',
    ),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('production_operations');
      const context = await enterpriseProductionReadinessService.buildAuraContext(companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/mobile-field',
    requireAnyPermission('agents:read', 'mobile:read', 'mobile:write', 'mobile:manage'),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('mobile_field');
      const context = await enterpriseMobilePlatformService.buildAuraContext({
        companyId: auth.companyId,
        userId: auth.userId,
      });
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/communications',
    requireAnyPermission(
      'agents:read',
      'communications:read',
      'communications:write',
      'communications:manage',
    ),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('communications');
      const context = await enterpriseUnifiedCommunicationsService.buildAuraContext(auth.companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/customer-experience',
    requireAnyPermission(
      'agents:read',
      'customer_experience:read',
      'customer_experience:write',
      'customer_experience:manage',
      'portal:read',
    ),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('customer_experience');
      const context = await enterpriseCustomerExperienceService.buildAuraContext(auth.companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/asset-intelligence',
    requireAnyPermission(
      'agents:read',
      'asset_lifecycle:read',
      'asset_lifecycle:write',
      'asset_lifecycle:manage',
      'asset_equipment:read',
    ),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('asset_intelligence');
      const context = await enterpriseAssetLifecycleService.buildAuraContext(auth.companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/workforce-intelligence',
    requireAnyPermission(
      'agents:read',
      'workforce:read',
      'workforce:write',
      'workforce_intelligence:read',
      'workforce_intelligence:write',
      'workforce_intelligence:manage',
    ),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('workforce_intelligence');
      const context = await enterpriseWorkforceIntelligenceService.buildAuraContext(auth.companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/legal-compliance',
    requireAnyPermission(
      'agents:read',
      'legal_compliance:read',
      'legal_compliance:write',
      'legal_compliance:manage',
      'documents:read',
    ),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('legal_compliance');
      const context = await enterpriseLegalComplianceService.buildAuraContext(auth.companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/financial-planning',
    requireAnyPermission(
      'agents:read',
      'financial_planning:read',
      'financial_planning:write',
      'financial_planning:manage',
      'finance:read',
    ),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('financial_planning');
      const context = await enterpriseFinancialPlanningService.buildAuraContext(auth.companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/sales-intelligence',
    requireAnyPermission(
      'agents:read',
      'sales_intelligence:read',
      'sales_intelligence:write',
      'sales_intelligence:manage',
      'sales:read',
      'leads:read',
    ),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('sales_intelligence');
      const context = await enterpriseSalesIntelligenceService.buildAuraContext(auth.companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/marketing-intelligence',
    requireAnyPermission(
      'agents:read',
      'marketing_intelligence:read',
      'marketing_intelligence:write',
      'marketing_intelligence:manage',
      'marketing:read',
    ),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('marketing_intelligence');
      const context = await enterpriseMarketingIntelligenceService.buildAuraContext(auth.companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/service-delivery',
    requireAnyPermission(
      'agents:read',
      'service_delivery:read',
      'service_delivery:write',
      'service_delivery:manage',
      'jobs:read',
      'quality:read',
    ),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('service_delivery');
      const context = await enterpriseServiceDeliveryService.buildAuraContext(auth.companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/it-operations',
    requireAnyPermission(
      'agents:read',
      'it_operations:read',
      'it_operations:write',
      'it_operations:manage',
      'ops:read',
      'ops:manage',
    ),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('it_operations');
      const context = await enterpriseItOperationsService.buildAuraContext(auth.companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/business-evolution',
    requireAnyPermission(
      'agents:read',
      'business_evolution:read',
      'business_evolution:write',
      'business_evolution:manage',
      'intelligence:read',
    ),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('business_evolution');
      const context = await enterpriseBusinessEvolutionService.buildAuraContext(auth.companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/app-builder',
    requireAnyPermission(
      'agents:read',
      'app_builder:read',
      'app_builder:write',
      'app_builder:manage',
      'platform:read',
      'platform:manage',
      'intelligence:read',
    ),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('app_builder');
      const context = await enterpriseAppBuilderService.buildAuraContext(auth.companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/industry-packs',
    requireAnyPermission(
      'agents:read',
      'industry_packs:read',
      'industry_packs:write',
      'industry_packs:manage',
      'intelligence:read',
    ),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('industry_intelligence');
      const context = await enterpriseIndustryPackService.buildAuraContext(auth.companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/developer-platform',
    requireAnyPermission(
      'agents:read',
      'public_developer:read',
      'public_developer:write',
      'public_developer:manage',
      'integrations:read',
    ),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('developer_platform');
      const context = await enterprisePublicDeveloperPlatformService.buildAuraContext(
        auth.companyId,
      );
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/saas-management',
    requireAnyPermission(
      'agents:read',
      'saas_management:read',
      'saas_management:write',
      'saas_management:manage',
      'saas:read',
      'platform:read',
    ),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('saas_management');
      const context = await enterpriseSaasManagementService.buildAuraContext(auth.companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/voice-reception',
    requireAnyPermission(
      'agents:read',
      'voice_reception:read',
      'voice_reception:write',
      'voice_reception:manage',
      'voice:read',
      'communications:read',
    ),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('voice_reception');
      const context = await enterpriseVoiceReceptionService.buildAuraContext(auth.companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/document-intelligence',
    requireAnyPermission(
      'agents:read',
      'document_ai:read',
      'document_ai:write',
      'document_ai:manage',
      'documents:read',
      'knowledge:read',
    ),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('document_intelligence');
      const context = await enterpriseDocumentAiService.buildAuraContext(auth.companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/business-continuity',
    requireAnyPermission(
      'agents:read',
      'business_continuity:read',
      'business_continuity:write',
      'business_continuity:manage',
      'ops:read',
      'it_operations:read',
    ),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('business_continuity');
      const context = await enterpriseBusinessContinuityService.buildAuraContext(auth.companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/search-intelligence',
    requireAnyPermission(
      'agents:read',
      'search:read',
      'search:write',
      'search:manage',
      'intelligence:read',
    ),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('search_intelligence');
      const context = await enterpriseGlobalSearchService.buildAuraContext(auth.companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/migration-intelligence',
    requireAnyPermission(
      'agents:read',
      'data_migration:read',
      'data_migration:write',
      'data_migration:manage',
      'integrations:read',
    ),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('migration_intelligence');
      const context = await enterpriseDataMigrationService.buildAuraContext(auth.companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/notification-intelligence',
    requireAnyPermission(
      'agents:read',
      'notifications:read',
      'notifications:write',
      'notifications:manage',
      'integrations:read',
    ),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('notification_intelligence');
      const context = await enterpriseNotificationsService.buildAuraContext(auth.companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/platform-health',
    requireAnyPermission(
      'agents:read',
      'platform_health:read',
      'platform_health:write',
      'platform_health:manage',
      'it_operations:read',
      'integrations:read',
    ),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('platform_health');
      const context = await enterprisePlatformHealthService.buildAuraContext(auth.companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/launch-center',
    requireAnyPermission(
      'agents:read',
      'launch_center:read',
      'launch_center:write',
      'launch_center:manage',
      'ops:read',
      'platform_health:read',
    ),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('launch_readiness');
      const context = await enterpriseLaunchCenterService.buildAuraContext(auth.companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/release-center',
    requireAnyPermission(
      'agents:read',
      'release_center:read',
      'release_center:write',
      'release_center:manage',
      'ops:read',
      'launch_center:read',
    ),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('release_candidate');
      const context = await enterpriseReleaseCenterService.buildAuraContext(auth.companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/go-live',
    requireAnyPermission(
      'agents:read',
      'production_launch:read',
      'production_launch:write',
      'production_launch:manage',
      'ops:read',
      'release_center:read',
    ),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('production_launch');
      const context = await enterpriseProductionLaunchService.buildAuraContext(auth.companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/release',
    requireAnyPermission(
      'agents:read',
      'release_manager:read',
      'release_manager:write',
      'release_manager:manage',
      'ops:read',
      'production_launch:read',
    ),
    async (req, res) => {
      const auth = getAuth(req);
      const registry = getAgentRegistryEntry('release_manager');
      const context = await enterpriseReleaseManagementService.buildAuraContext(auth.companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/integrations',
    requireAnyPermission(
      'agents:read',
      'integrations:read',
      'integrations:manage',
      'intelligence:read',
    ),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('finance');
      const context = await integrationApiManagementService.buildAuraContext(companyId);
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/portal',
    requireAnyPermission(
      'agents:read',
      'portal:read',
      'customer_support:read',
      'intelligence:read',
    ),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = getAgentRegistryEntry('customer_support');
      const customerId =
        typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
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
        await communicationsIntelligenceService.buildCommunicationsIntelligenceAuraContext(
          companyId,
        );
      res.json({ data: { registry, context } });
    },
  );

  router.get(
    '/asset-equipment',
    requireAnyPermission(
      'agents:read',
      'asset_equipment:read',
      'asset_equipment:write',
      'fleet:read',
    ),
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
        await personalCommunicationsIntelligenceService.buildPersonalCommunicationsAuraContext(
          companyId,
        );
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

  router.get(
    '/runs/:runId',
    requireAnyPermission('agents:read', 'agents:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const run = await agentRuntimeService.getRun(companyId, getRouteParam(req.params.runId));

      if (!run) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Agent run not found' } });
        return;
      }

      res.json({ data: { run } });
    },
  );

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
        {
          companyId: auth.companyId,
          userId: auth.userId,
          roleName: auth.roleName,
          permissions: auth.permissions,
        },
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
