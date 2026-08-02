import { hasAnyPermission } from '@titan/auth';
import type { AuraGenerateContext } from '@titan/aura';
import type { AuraPageContext } from '@titan/shared';
import { resolveAuraContextDomains, type AuraContextDomain } from './aura-context-routing.js';
import type { AgentsService } from './agents.service.js';
import type { AnalyticsService } from './analytics.service.js';
import type { AutomationService } from './automation.service.js';
import type { AgentOrchestrationService } from './agent-orchestration.service.js';
import type { AssetEquipmentIntelligenceService } from './asset-equipment-intelligence.service.js';
import type { AiOrchestrationService } from './ai-orchestration.service.js';
import type { BusinessIntelligenceService } from './business-intelligence.service.js';
import type { CommunicationsIntelligenceService } from './communications-intelligence.service.js';
import type { CommunicationsService } from './communications.service.js';
import type { CrmService } from './crm.service.js';
import type { CustomerSupportService } from './customer-support.service.js';
import type { DispatchIntelligenceService } from './dispatch-intelligence.service.js';
import type { DocumentsService } from './documents.service.js';
import type { EnterpriseAnalyticsService } from './enterprise-analytics.service.js';
import type { EnterpriseAutomationStudioService } from './enterprise-automation-studio.service.js';
import type { EnterpriseDeveloperPlatformService } from './enterprise-developer-platform.service.js';
import type { EnterpriseDigitalTwinService } from './enterprise-digital-twin.service.js';
import type { EnterpriseEvolutionService } from './enterprise-evolution.service.js';
import type { EnterpriseKnowledgeGraphService } from './enterprise-knowledge-graph.service.js';
import type { EnterpriseMissionControlService } from './enterprise-mission-control.service.js';
import type { EnterpriseSaasPlatformService } from './enterprise-saas-platform.service.js';
import type { EnterpriseSecurityService } from './enterprise-security.service.js';
import type { ExecutiveService } from './executive.service.js';
import type { FinanceIntelligenceService } from './finance-intelligence.service.js';
import type { FinanceService } from './finance.service.js';
import type { FleetIntelligenceService } from './fleet-intelligence.service.js';
import type { FleetService } from './fleet.service.js';
import type { IntegrationApiManagementService } from './integration-api-management.service.js';
import type { IntegrationHubService } from './integration-hub.service.js';
import type { IntegrationPlatformService } from './integration-platform.service.js';
import type { IntegrationsService } from './integrations.service.js';
import type { IntelligenceService } from './intelligence.service.js';
import type { InventoryService } from './inventory.service.js';
import type { JobsService } from './jobs.service.js';
import type { KnowledgeService } from './knowledge.service.js';
import type { LeadsService } from './leads.service.js';
import type { MarketingService } from './marketing.service.js';
import type { MemoryService } from './memory.service.js';
import type { CompanyDayPlanService } from './company-day-plan.service.js';
import type { CompanyBusinessRulesService } from './company-business-rules.service.js';
import type { MobileService } from './mobile.service.js';
import type { MobileWorkforceService } from './mobile-workforce.service.js';
import type { PersonalCommunicationsIntelligenceService } from './personal-communications-intelligence.service.js';
import type { PortalExperienceService } from './portal-experience.service.js';
import type { PortalService } from './portal.service.js';
import type { ProcurementService } from './procurement.service.js';
import type { QualityAssuranceService } from './quality-assurance.service.js';
import type { RecruitingService } from './recruiting.service.js';
import type { RecommendationsService } from './recommendations.service.js';
import type { SalesService } from './sales.service.js';
import type { SchedulingService } from './scheduling.service.js';
import type { TeamService } from './team.service.js';
import type { VoiceService } from './voice.service.js';
import type { WhatsappService } from './whatsapp.service.js';
import type { WorkforceService } from './workforce.service.js';
import type { XeroSyncService } from './xero-sync.service.js';

export type AuraContextBuildDeps = {
  teamService: TeamService;
  crmService: CrmService;
  jobsService: JobsService;
  schedulingService: SchedulingService;
  financeService: FinanceService;
  inventoryService: InventoryService;
  fleetService: FleetService;
  integrationsService: IntegrationsService;
  communicationsService: CommunicationsService;
  documentsService: DocumentsService;
  automationService: AutomationService;
  agentsService: AgentsService;
  portalService: PortalService;
  portalExperienceService: PortalExperienceService;
  whatsappService: WhatsappService;
  recruitingService: RecruitingService;
  integrationHubService: IntegrationHubService;
  integrationApiManagementService: IntegrationApiManagementService;
  xeroSyncService: XeroSyncService;
  intelligenceService: IntelligenceService;
  recommendationsService: RecommendationsService;
  memoryService: MemoryService;
  businessRulesService: CompanyBusinessRulesService;
  dayPlanService: CompanyDayPlanService;
  analyticsService: AnalyticsService;
  orchestrationService: AgentOrchestrationService;
  salesService: SalesService;
  marketingService: MarketingService;
  leadsService: LeadsService;
  voiceService: VoiceService;
  customerSupportService: CustomerSupportService;
  workforceService: WorkforceService;
  procurementService: ProcurementService;
  financeIntelligenceService: FinanceIntelligenceService;
  knowledgeService: KnowledgeService;
  businessIntelligenceService: BusinessIntelligenceService;
  enterpriseAnalyticsService: EnterpriseAnalyticsService;
  enterpriseAutomationStudioService: EnterpriseAutomationStudioService;
  enterpriseKnowledgeGraphService: EnterpriseKnowledgeGraphService;
  enterpriseDigitalTwinService: EnterpriseDigitalTwinService;
  enterpriseMissionControlService: EnterpriseMissionControlService;
  enterpriseEvolutionService: EnterpriseEvolutionService;
  enterpriseDeveloperPlatformService: EnterpriseDeveloperPlatformService;
  enterpriseSaasPlatformService: EnterpriseSaasPlatformService;
  executiveService: ExecutiveService;
  mobileService: MobileService;
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
};

type ContextLoader = {
  domain: AuraContextDomain;
  enabled: boolean;
  load: () => Promise<Partial<AuraGenerateContext>>;
};

export async function buildSelectedAuraContext(
  deps: AuraContextBuildDeps,
  companyId: string,
  userId: string,
  baseContext: AuraGenerateContext,
  permissions: string[],
  message: string,
  pageContext: AuraPageContext | undefined,
  loadedDomains: string[],
): Promise<{ context: AuraGenerateContext; agentsMinimal: boolean }> {
  await deps.teamService.ensureDefaultRoles(companyId);

  const { domains, agentsMinimal } = resolveAuraContextDomains(message, pageContext);
  const loaders: ContextLoader[] = [
    {
      domain: 'crm',
      enabled: hasAnyPermission(permissions, ['customers:read', 'customers:write']),
      load: async () => ({
        crm: await deps.crmService.buildAuraContext(companyId, pageContext?.customerId),
      }),
    },
    {
      domain: 'jobs',
      enabled: hasAnyPermission(permissions, ['jobs:read', 'jobs:write']),
      load: async () => ({
        jobs: await deps.jobsService.buildAuraContext(companyId, pageContext?.jobId),
      }),
    },
    {
      domain: 'scheduling',
      enabled: hasAnyPermission(permissions, ['dispatch:read', 'dispatch:write']),
      load: async () => ({
        scheduling: await deps.schedulingService.buildAuraContext(companyId),
      }),
    },
    {
      domain: 'finance',
      enabled: hasAnyPermission(permissions, ['finance:read', 'finance:write']),
      load: async () => ({
        finance: await deps.financeService.buildAuraContext(companyId, pageContext),
      }),
    },
    {
      domain: 'inventory',
      enabled: hasAnyPermission(permissions, ['inventory:read', 'inventory:write']),
      load: async () => ({
        inventory: await deps.inventoryService.buildAuraContext(companyId),
      }),
    },
    {
      domain: 'fleet',
      enabled: hasAnyPermission(permissions, ['fleet:read', 'fleet:write']),
      load: async () => {
        const [fleet, tracking] = await Promise.all([
          deps.fleetService.buildAuraContext(companyId, pageContext?.vehicleId),
          deps.integrationsService.buildFleetTrackingContext(companyId),
        ]);
        return { fleet: { ...fleet, tracking } };
      },
    },
    {
      domain: 'communications',
      enabled: hasAnyPermission(permissions, ['communications:read', 'communications:write']),
      load: async () => ({
        communications: await deps.communicationsService.buildAuraContext(
          companyId,
          pageContext?.customerId,
        ),
      }),
    },
    {
      domain: 'documents',
      enabled: hasAnyPermission(permissions, ['documents:read', 'documents:write']),
      load: async () => ({
        documents: await deps.documentsService.buildAuraContext(
          companyId,
          pageContext?.customerId,
          pageContext?.jobId,
        ),
      }),
    },
    {
      domain: 'automation',
      enabled: hasAnyPermission(permissions, ['automation:read', 'automation:write']),
      load: async () => ({
        automation: await deps.automationService.buildAuraContext(
          companyId,
          pageContext?.workflowId,
        ),
      }),
    },
    {
      domain: 'agents',
      enabled: hasAnyPermission(permissions, ['agents:read', 'agents:write']),
      load: async () => ({
        agents: agentsMinimal
          ? await deps.agentsService.buildAuraContextSummary(companyId)
          : await deps.agentsService.buildAuraContext(companyId, pageContext?.agentProfileId),
      }),
    },
    {
      domain: 'portal',
      enabled: hasAnyPermission(permissions, ['portal:read', 'portal:manage']),
      load: async () => {
        const portal = await deps.portalService.buildAuraContext(companyId);
        const customerPortalExperience = pageContext?.customerId
          ? await deps.portalExperienceService.buildStaffCustomerAuraContext({
              companyId,
              customerId: pageContext.customerId,
            })
          : undefined;
        return {
          portal,
          ...(customerPortalExperience ? { customerPortalExperience } : {}),
        };
      },
    },
    {
      domain: 'whatsapp',
      enabled: hasAnyPermission(permissions, [
        'communications:read',
        'communications:write',
        'integrations:read',
        'integrations:manage',
      ]),
      load: async () => ({
        whatsapp: await deps.whatsappService.buildAuraContext(companyId, pageContext?.customerId),
      }),
    },
    {
      domain: 'recruiting',
      enabled: hasAnyPermission(permissions, ['recruiting:read', 'recruiting:write']),
      load: async () => ({
        recruiting: await deps.recruitingService.buildAuraContext(companyId),
      }),
    },
    {
      domain: 'integrations',
      enabled: hasAnyPermission(permissions, ['integrations:read', 'integrations:manage']),
      load: async () => {
        const [integrationHub, integrationApiManagement, xeroAccounting] = await Promise.all([
          deps.integrationHubService.buildAuraContext(companyId),
          deps.integrationApiManagementService.buildAuraContext(companyId),
          deps.xeroSyncService.buildAuraContext(companyId),
        ]);
        return {
          integrationHub,
          integrationApiManagement,
          ...(xeroAccounting ? { xeroAccounting } : {}),
        };
      },
    },
    {
      domain: 'intelligence',
      enabled: hasAnyPermission(permissions, ['intelligence:read', 'agents:read']),
      load: async () => {
        const [intelligence, recommendations] = await Promise.all([
          deps.intelligenceService.buildAuraContext(companyId),
          deps.recommendationsService.getRecommendations(companyId),
        ]);
        return {
          intelligence,
          recommendations: {
            count: recommendations.recommendations.length,
            items: recommendations.recommendations.slice(0, 10).map((item) => ({
              category: item.category,
              priority: item.priority,
              title: item.title,
              description: item.description,
            })),
          },
        };
      },
    },
    {
      domain: 'memory',
      enabled: hasAnyPermission(permissions, ['intelligence:read']),
      load: async () => ({
        memory: await deps.memoryService.buildAuraContext(companyId),
      }),
    },
    {
      domain: 'analytics',
      enabled: hasAnyPermission(permissions, ['analytics:read', 'analytics:write']),
      load: async () => ({
        analytics: await deps.analyticsService.buildAuraContext(companyId, { period: 'monthly' }),
      }),
    },
    {
      domain: 'orchestration',
      enabled: hasAnyPermission(permissions, [
        'orchestration:read',
        'orchestration:write',
        'agents:read',
      ]),
      load: async () => ({
        orchestration: await deps.orchestrationService.buildAuraContext(companyId),
      }),
    },
    {
      domain: 'sales',
      enabled: hasAnyPermission(permissions, ['sales:read', 'sales:write', 'agents:read']),
      load: async () => ({
        sales: await deps.salesService.buildAuraContext(companyId),
      }),
    },
    {
      domain: 'marketing',
      enabled: hasAnyPermission(permissions, ['marketing:read', 'marketing:write', 'agents:read']),
      load: async () => ({
        marketing: await deps.marketingService.buildAuraContext(companyId),
      }),
    },
    {
      domain: 'leads',
      enabled: hasAnyPermission(permissions, ['leads:read', 'leads:write', 'agents:read']),
      load: async () => ({
        leads: await deps.leadsService.buildAuraContext(companyId),
      }),
    },
    {
      domain: 'voice',
      enabled: hasAnyPermission(permissions, ['voice:read', 'voice:write', 'agents:read']),
      load: async () => ({
        voice: await deps.voiceService.buildAuraContext(companyId),
      }),
    },
    {
      domain: 'customerSupport',
      enabled: hasAnyPermission(permissions, [
        'customer_support:read',
        'customer_support:write',
        'agents:read',
      ]),
      load: async () => ({
        customerSupport: await deps.customerSupportService.buildAuraContext(companyId),
      }),
    },
    {
      domain: 'workforce',
      enabled: hasAnyPermission(permissions, [
        'workforce:read',
        'workforce:write',
        'recruiting:read',
        'agents:read',
      ]),
      load: async () => ({
        workforce: await deps.workforceService.buildAuraContext(companyId),
      }),
    },
    {
      domain: 'procurement',
      enabled: hasAnyPermission(permissions, [
        'procurement:read',
        'procurement:write',
        'agents:read',
      ]),
      load: async () => ({
        procurement: await deps.procurementService.buildAuraContext(companyId),
      }),
    },
    {
      domain: 'financeIntelligence',
      enabled: hasAnyPermission(permissions, ['finance:read', 'finance:write', 'agents:read']),
      load: async () => ({
        financeIntelligence: await deps.financeIntelligenceService.buildAuraContext(companyId),
      }),
    },
    {
      domain: 'knowledge',
      enabled: hasAnyPermission(permissions, ['knowledge:read', 'knowledge:write', 'agents:read']),
      load: async () => ({
        knowledge: await deps.knowledgeService.buildAuraContext(companyId),
      }),
    },
    {
      domain: 'businessIntelligence',
      enabled: hasAnyPermission(permissions, [
        'bi:read',
        'bi:write',
        'intelligence:read',
        'agents:read',
      ]),
      load: async () => ({
        businessIntelligence: await deps.businessIntelligenceService.buildAuraContext(companyId),
      }),
    },
    {
      domain: 'enterpriseAnalytics',
      enabled: hasAnyPermission(permissions, [
        'bi:read',
        'analytics:read',
        'intelligence:read',
        'agents:read',
      ]),
      load: async () => ({
        enterpriseAnalytics:
          await deps.enterpriseAnalyticsService.buildAnalyticsAuraContext(companyId),
      }),
    },
    {
      domain: 'enterpriseAutomationStudio',
      enabled: hasAnyPermission(permissions, [
        'automation:read',
        'automation:write',
        'agents:read',
      ]),
      load: async () => ({
        enterpriseAutomationStudio:
          await deps.enterpriseAutomationStudioService.buildAutomationAuraContext(companyId),
      }),
    },
    {
      domain: 'enterpriseKnowledgeGraph',
      enabled: hasAnyPermission(permissions, ['knowledge:read', 'knowledge:write', 'agents:read']),
      load: async () => ({
        enterpriseKnowledgeGraph:
          await deps.enterpriseKnowledgeGraphService.buildKnowledgeGraphAuraContext(companyId),
      }),
    },
    {
      domain: 'enterpriseDigitalTwin',
      enabled: hasAnyPermission(permissions, [
        'executive:read',
        'executive:write',
        'intelligence:read',
        'agents:read',
      ]),
      load: async () => ({
        enterpriseDigitalTwin:
          await deps.enterpriseDigitalTwinService.buildDigitalTwinAuraContext(companyId),
      }),
    },
    {
      domain: 'enterpriseMissionControl',
      enabled: hasAnyPermission(permissions, [
        'executive:read',
        'executive:write',
        'intelligence:read',
        'agents:read',
      ]),
      load: async () => ({
        enterpriseMissionControl:
          await deps.enterpriseMissionControlService.buildMissionControlAuraContext(companyId),
      }),
    },
    {
      domain: 'enterpriseEvolution',
      enabled: hasAnyPermission(permissions, [
        'intelligence:read',
        'executive:read',
        'executive:write',
        'agents:read',
      ]),
      load: async () => ({
        enterpriseEvolution:
          await deps.enterpriseEvolutionService.buildEvolutionAuraContext(companyId),
      }),
    },
    {
      domain: 'enterpriseDeveloperPlatform',
      enabled: hasAnyPermission(permissions, [
        'integrations:read',
        'integrations:manage',
        'agents:read',
      ]),
      load: async () => ({
        enterpriseDeveloperPlatform:
          await deps.enterpriseDeveloperPlatformService.buildDeveloperAuraContext(companyId),
      }),
    },
    {
      domain: 'enterpriseSaasPlatform',
      enabled: hasAnyPermission(permissions, [
        'saas:read',
        'saas:manage',
        'platform:read',
        'agents:read',
      ]),
      load: async () => ({
        enterpriseSaasPlatform:
          await deps.enterpriseSaasPlatformService.buildSaasAuraContext(companyId),
      }),
    },
    {
      domain: 'executive',
      enabled: hasAnyPermission(permissions, [
        'executive:read',
        'executive:write',
        'intelligence:read',
        'agents:read',
      ]),
      load: async () => ({
        executive: await deps.executiveService.buildAuraContext(companyId),
      }),
    },
    {
      domain: 'mobile',
      enabled:
        pageContext?.mobileRole === 'owner' &&
        hasAnyPermission(permissions, ['mobile:read', 'intelligence:read']),
      load: async () => {
        const ownerContext = await deps.mobileService.buildOwnerAuraContext({
          companyId,
          userId,
        });
        return {
          mobile: { role: 'owner', summary: ownerContext.summary, details: ownerContext },
        };
      },
    },
    {
      domain: 'mobileWorkforce',
      enabled:
        pageContext?.mobileRole === 'technician' &&
        hasAnyPermission(permissions, ['mobile:read', 'jobs:read']),
      load: async () => {
        const [technicianContext, workforceContext] = await Promise.all([
          deps.mobileService.buildTechnicianAuraContext({ companyId, userId }),
          deps.mobileWorkforceService.buildWorkforceAuraContext({ companyId, userId }),
        ]);
        return {
          mobile: {
            role: 'technician',
            summary: technicianContext.summary,
            details: technicianContext,
          },
          mobileWorkforceExperience: workforceContext,
        };
      },
    },
    {
      domain: 'qualityAssurance',
      enabled: hasAnyPermission(permissions, [
        'quality:read',
        'quality:write',
        'executive:read',
        'agents:read',
      ]),
      load: async () => ({
        qualityAssurance: await deps.qualityAssuranceService.buildQualityAuraContext(companyId),
      }),
    },
    {
      domain: 'communicationsIntelligence',
      enabled: hasAnyPermission(permissions, [
        'communications_intelligence:read',
        'communications_intelligence:write',
        'communications:read',
        'voice:read',
        'customer_support:read',
        'agents:read',
      ]),
      load: async () => ({
        communicationsIntelligence:
          await deps.communicationsIntelligenceService.buildCommunicationsIntelligenceAuraContext(
            companyId,
          ),
      }),
    },
    {
      domain: 'assetEquipment',
      enabled: hasAnyPermission(permissions, [
        'asset_equipment:read',
        'asset_equipment:write',
        'fleet:read',
        'agents:read',
      ]),
      load: async () => ({
        assetEquipment:
          await deps.assetEquipmentIntelligenceService.buildAssetAuraContext(companyId),
      }),
    },
    {
      domain: 'aiOrchestration',
      enabled: hasAnyPermission(permissions, [
        'ai_orchestration:read',
        'ai_orchestration:write',
        'agents:read',
        'executive:read',
      ]),
      load: async () => ({
        aiOrchestration:
          await deps.aiOrchestrationService.buildAiOrchestrationAuraContext(companyId),
      }),
    },
    {
      domain: 'dispatchIntelligence',
      enabled: hasAnyPermission(permissions, [
        'dispatch_intelligence:read',
        'dispatch_intelligence:write',
        'dispatch:read',
        'voice:read',
        'agents:read',
      ]),
      load: async () => ({
        dispatchIntelligence:
          await deps.dispatchIntelligenceService.buildDispatchAuraContext(companyId),
      }),
    },
    {
      domain: 'fleetIntelligence',
      enabled: hasAnyPermission(permissions, [
        'fleet_intelligence:read',
        'fleet_intelligence:write',
        'fleet:read',
        'integrations:read',
        'agents:read',
      ]),
      load: async () => ({
        fleetIntelligence:
          await deps.fleetIntelligenceService.buildFleetIntelligenceAuraContext(companyId),
      }),
    },
    {
      domain: 'personalCommunications',
      enabled: hasAnyPermission(permissions, [
        'personal_communications:read',
        'personal_communications:write',
        'communications_intelligence:read',
        'communications:read',
        'agents:read',
      ]),
      load: async () => ({
        personalCommunications:
          await deps.personalCommunicationsIntelligenceService.buildPersonalCommunicationsAuraContext(
            companyId,
          ),
      }),
    },
    {
      domain: 'security',
      enabled: hasAnyPermission(permissions, [
        'security:read',
        'security:write',
        'settings:manage',
        'agents:read',
      ]),
      load: async () => ({
        security: await deps.enterpriseSecurityService.buildSecurityAuraContext(companyId),
      }),
    },
    {
      domain: 'integrationPlatform',
      enabled: hasAnyPermission(permissions, [
        'integrations:read',
        'integrations:manage',
        'agents:read',
      ]),
      load: async () => ({
        integrationPlatform:
          await deps.integrationPlatformService.buildIntegrationAuraContext(companyId),
      }),
    },
  ];

  const activeLoaders = loaders.filter((loader) => loader.enabled && domains.has(loader.domain));
  const partials = await Promise.all(
    activeLoaders.map(async (loader) => {
      const partial = await loader.load();
      loadedDomains.push(loader.domain);
      return partial;
    }),
  );

  const context = partials.reduce<AuraGenerateContext>(
    (accumulator, partial) => ({ ...accumulator, ...partial }),
    baseContext,
  );

  if (
    hasAnyPermission(permissions, [
      'intelligence:read',
      'executive:read',
      'executive:write',
      'agents:read',
    ])
  ) {
    const auraDayPlan = await deps.dayPlanService.buildAuraContext(companyId);
    context.dayPlanning = {
      planDate: auraDayPlan.planDate,
      planCount: auraDayPlan.priorityCount,
      plans: auraDayPlan.priorities.map((entry) => ({
        content: entry.priorityText,
        category: entry.department,
        status: entry.status,
        planDate: entry.planDate,
      })),
    };
    context.businessRules = await deps.businessRulesService.buildAuraContext(companyId);
    loadedDomains.push('dayPlanning', 'businessRules');
  }

  return { context, agentsMinimal };
}
