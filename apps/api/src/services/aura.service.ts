import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
  AuraProviderError,
  buildAuraCompanyContext,
  deriveConversationTitle,
  trimConversationHistory,
  type AuraConfig,
  type AuraGenerateContext,
  type AuraProvider,
} from '@titan/aura';
import { hasAnyPermission } from '@titan/auth';
import { indicatesCapabilityCreationIntent } from '@titan/shared';
import type {
  AuraConversation,
  AuraConversationDetail,
  AuraConversationSummary,
  AuraMessage,
  AuraPageContext,
  SendAuraMessageResponse,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { auraConversations, auraMessages, users } from '@titan/db';
import type { CrmService } from './crm.service.js';
import type { JobsService } from './jobs.service.js';
import type { SchedulingService } from './scheduling.service.js';
import type { FinanceService } from './finance.service.js';
import type { InventoryService } from './inventory.service.js';
import type { FleetService } from './fleet.service.js';
import type { IntegrationsService } from './integrations.service.js';
import type { CommunicationsService } from './communications.service.js';
import type { DocumentsService } from './documents.service.js';
import type { AutomationService } from './automation.service.js';
import type { AgentsService } from './agents.service.js';
import type { IntegrationHubService } from './integration-hub.service.js';
import type { IntegrationApiManagementService } from './integration-api-management.service.js';
import type { XeroSyncService } from './xero-sync.service.js';
import type { WhatsappService } from './whatsapp.service.js';
import type { RecruitingService } from './recruiting.service.js';
import type { PortalService } from './portal.service.js';
import type { PortalExperienceService } from './portal-experience.service.js';
import type { MobileWorkforceService } from './mobile-workforce.service.js';
import type { QualityAssuranceService } from './quality-assurance.service.js';
import type { CommunicationsIntelligenceService } from './communications-intelligence.service.js';
import type { AssetEquipmentIntelligenceService } from './asset-equipment-intelligence.service.js';
import type { AiOrchestrationService } from './ai-orchestration.service.js';
import type { DispatchIntelligenceService } from './dispatch-intelligence.service.js';
import type { FleetIntelligenceService } from './fleet-intelligence.service.js';
import type { PersonalCommunicationsIntelligenceService } from './personal-communications-intelligence.service.js';
import type { EnterpriseSecurityService } from './enterprise-security.service.js';
import type { EnterpriseAutomationStudioService } from './enterprise-automation-studio.service.js';
import type { EnterpriseKnowledgeGraphService } from './enterprise-knowledge-graph.service.js';
import type { EnterpriseMissionControlService } from './enterprise-mission-control.service.js';
import type { EnterpriseEvolutionService } from './enterprise-evolution.service.js';
import type { EnterpriseDeveloperPlatformService } from './enterprise-developer-platform.service.js';
import type { EnterpriseSaasPlatformService } from './enterprise-saas-platform.service.js';
import type { AiProviderResilienceService } from './ai-provider-resilience.service.js';
import { AiProviderResilienceError } from './ai-provider-resilience.service.js';
import { AiOperationsError } from './ai-operations.service.js';
import type { EnterpriseDigitalTwinService } from './enterprise-digital-twin.service.js';
import type { IntegrationPlatformService } from './integration-platform.service.js';
import type { EnterpriseAnalyticsService } from './enterprise-analytics.service.js';
import type { TeamService } from './team.service.js';
import type { IntelligenceService } from './intelligence.service.js';
import type { RecommendationsService } from './recommendations.service.js';
import type { MemoryService } from './memory.service.js';
import type { AnalyticsService } from './analytics.service.js';
import type { MobileService } from './mobile.service.js';
import type { AgentOrchestrationService } from './agent-orchestration.service.js';
import type { SalesService } from './sales.service.js';
import type { MarketingService } from './marketing.service.js';
import type { LeadsService } from './leads.service.js';
import type { VoiceService } from './voice.service.js';
import type { CustomerSupportService } from './customer-support.service.js';
import type { WorkforceService } from './workforce.service.js';
import type { ProcurementService } from './procurement.service.js';
import type { ExecutiveService } from './executive.service.js';
import type { FinanceIntelligenceService } from './finance-intelligence.service.js';
import type { KnowledgeService } from './knowledge.service.js';
import type { BusinessIntelligenceService } from './business-intelligence.service.js';
import type { TenantCapabilityBuilderService } from './tenant-capability-builder.service.js';

export class AuraError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AuraError';
  }
}

type TenantScope = {
  companyId: string;
  userId: string;
};

type AuraServiceDeps = {
  db: DatabaseClient;
  provider: AuraProvider | null;
  config: AuraConfig;
  crmService: CrmService;
  jobsService: JobsService;
  schedulingService: SchedulingService;
  financeService: FinanceService;
  inventoryService: InventoryService;
  fleetService: FleetService;
  integrationsService: IntegrationsService;
  integrationHubService: IntegrationHubService;
  integrationApiManagementService: IntegrationApiManagementService;
  xeroSyncService: XeroSyncService;
  whatsappService: WhatsappService;
  recruitingService: RecruitingService;
  communicationsService: CommunicationsService;
  documentsService: DocumentsService;
  automationService: AutomationService;
  agentsService: AgentsService;
  portalService: PortalService;
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
  enterpriseAnalyticsService: EnterpriseAnalyticsService;
  enterpriseAutomationStudioService: EnterpriseAutomationStudioService;
  enterpriseDigitalTwinService: EnterpriseDigitalTwinService;
  enterpriseKnowledgeGraphService: EnterpriseKnowledgeGraphService;
  enterpriseMissionControlService: EnterpriseMissionControlService;
  enterpriseEvolutionService: EnterpriseEvolutionService;
  enterpriseDeveloperPlatformService: EnterpriseDeveloperPlatformService;
  enterpriseSaasPlatformService: EnterpriseSaasPlatformService;
  aiProviderResilienceService: AiProviderResilienceService;
  teamService: TeamService;
  intelligenceService: IntelligenceService;
  recommendationsService: RecommendationsService;
  memoryService: MemoryService;
  analyticsService: AnalyticsService;
  mobileService: MobileService;
  orchestrationService: AgentOrchestrationService;
  salesService: SalesService;
  marketingService: MarketingService;
  leadsService: LeadsService;
  voiceService: VoiceService;
  customerSupportService: CustomerSupportService;
  workforceService: WorkforceService;
  procurementService: ProcurementService;
  executiveService: ExecutiveService;
  financeIntelligenceService: FinanceIntelligenceService;
  knowledgeService: KnowledgeService;
  businessIntelligenceService: BusinessIntelligenceService;
  tenantCapabilityBuilderService: TenantCapabilityBuilderService;
};

export class AuraService {
  private readonly db: DatabaseClient;
  private readonly provider: AuraProvider | null;
  private readonly config: AuraConfig;
  private readonly crmService: CrmService;
  private readonly jobsService: JobsService;
  private readonly schedulingService: SchedulingService;
  private readonly financeService: FinanceService;
  private readonly inventoryService: InventoryService;
  private readonly fleetService: FleetService;
  private readonly integrationsService: IntegrationsService;
  private readonly integrationHubService: IntegrationHubService;
  private readonly integrationApiManagementService: IntegrationApiManagementService;
  private readonly xeroSyncService: XeroSyncService;
  private readonly whatsappService: WhatsappService;
  private readonly recruitingService: RecruitingService;
  private readonly communicationsService: CommunicationsService;
  private readonly documentsService: DocumentsService;
  private readonly automationService: AutomationService;
  private readonly agentsService: AgentsService;
  private readonly portalService: PortalService;
  private readonly portalExperienceService: PortalExperienceService;
  private readonly mobileWorkforceService: MobileWorkforceService;
  private readonly qualityAssuranceService: QualityAssuranceService;
  private readonly communicationsIntelligenceService: CommunicationsIntelligenceService;
  private readonly assetEquipmentIntelligenceService: AssetEquipmentIntelligenceService;
  private readonly aiOrchestrationService: AiOrchestrationService;
  private readonly dispatchIntelligenceService: DispatchIntelligenceService;
  private readonly fleetIntelligenceService: FleetIntelligenceService;
  private readonly personalCommunicationsIntelligenceService: PersonalCommunicationsIntelligenceService;
  private readonly enterpriseSecurityService: EnterpriseSecurityService;
  private readonly integrationPlatformService: IntegrationPlatformService;
  private readonly enterpriseAnalyticsService: EnterpriseAnalyticsService;
  private readonly enterpriseAutomationStudioService: EnterpriseAutomationStudioService;
  private readonly enterpriseDigitalTwinService: EnterpriseDigitalTwinService;
  private readonly enterpriseKnowledgeGraphService: EnterpriseKnowledgeGraphService;
  private readonly enterpriseMissionControlService: EnterpriseMissionControlService;
  private readonly enterpriseEvolutionService: EnterpriseEvolutionService;
  private readonly enterpriseDeveloperPlatformService: EnterpriseDeveloperPlatformService;
  private readonly enterpriseSaasPlatformService: EnterpriseSaasPlatformService;
  private readonly aiProviderResilienceService: AiProviderResilienceService;
  private readonly teamService: TeamService;
  private readonly intelligenceService: IntelligenceService;
  private readonly recommendationsService: RecommendationsService;
  private readonly memoryService: MemoryService;
  private readonly analyticsService: AnalyticsService;
  private readonly mobileService: MobileService;
  private readonly orchestrationService: AgentOrchestrationService;
  private readonly salesService: SalesService;
  private readonly marketingService: MarketingService;
  private readonly leadsService: LeadsService;
  private readonly voiceService: VoiceService;
  private readonly customerSupportService: CustomerSupportService;
  private readonly workforceService: WorkforceService;
  private readonly procurementService: ProcurementService;
  private readonly executiveService: ExecutiveService;
  private readonly financeIntelligenceService: FinanceIntelligenceService;
  private readonly knowledgeService: KnowledgeService;
  private readonly businessIntelligenceService: BusinessIntelligenceService;
  private readonly tenantCapabilityBuilderService: TenantCapabilityBuilderService;

  constructor({
    db,
    provider,
    config,
    crmService,
    jobsService,
    schedulingService,
    financeService,
    inventoryService,
    fleetService,
    integrationsService,
    integrationHubService,
    integrationApiManagementService,
    xeroSyncService,
    whatsappService,
    recruitingService,
    communicationsService,
    documentsService,
    automationService,
    agentsService,
    portalService,
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
    enterpriseAnalyticsService,
    enterpriseAutomationStudioService,
    enterpriseDigitalTwinService,
    enterpriseKnowledgeGraphService,
    enterpriseMissionControlService,
    enterpriseEvolutionService,
    enterpriseDeveloperPlatformService,
    enterpriseSaasPlatformService,
    aiProviderResilienceService,
    teamService,
    intelligenceService,
    recommendationsService,
    memoryService,
    analyticsService,
    mobileService,
    orchestrationService,
    salesService,
    marketingService,
    leadsService,
    voiceService,
    customerSupportService,
    workforceService,
    procurementService,
    executiveService,
    financeIntelligenceService,
    knowledgeService,
    businessIntelligenceService,
    tenantCapabilityBuilderService,
  }: AuraServiceDeps) {
    this.db = db;
    this.provider = provider;
    this.config = config;
    this.crmService = crmService;
    this.jobsService = jobsService;
    this.schedulingService = schedulingService;
    this.financeService = financeService;
    this.inventoryService = inventoryService;
    this.fleetService = fleetService;
    this.integrationsService = integrationsService;
    this.integrationHubService = integrationHubService;
    this.integrationApiManagementService = integrationApiManagementService;
    this.xeroSyncService = xeroSyncService;
    this.whatsappService = whatsappService;
    this.recruitingService = recruitingService;
    this.communicationsService = communicationsService;
    this.documentsService = documentsService;
    this.automationService = automationService;
    this.agentsService = agentsService;
    this.portalService = portalService;
    this.portalExperienceService = portalExperienceService;
    this.mobileWorkforceService = mobileWorkforceService;
    this.qualityAssuranceService = qualityAssuranceService;
    this.communicationsIntelligenceService = communicationsIntelligenceService;
    this.assetEquipmentIntelligenceService = assetEquipmentIntelligenceService;
    this.aiOrchestrationService = aiOrchestrationService;
    this.dispatchIntelligenceService = dispatchIntelligenceService;
    this.fleetIntelligenceService = fleetIntelligenceService;
    this.personalCommunicationsIntelligenceService = personalCommunicationsIntelligenceService;
    this.enterpriseSecurityService = enterpriseSecurityService;
    this.integrationPlatformService = integrationPlatformService;
    this.enterpriseAnalyticsService = enterpriseAnalyticsService;
    this.enterpriseAutomationStudioService = enterpriseAutomationStudioService;
    this.enterpriseDigitalTwinService = enterpriseDigitalTwinService;
    this.enterpriseKnowledgeGraphService = enterpriseKnowledgeGraphService;
    this.enterpriseMissionControlService = enterpriseMissionControlService;
    this.enterpriseEvolutionService = enterpriseEvolutionService;
    this.enterpriseDeveloperPlatformService = enterpriseDeveloperPlatformService;
    this.enterpriseSaasPlatformService = enterpriseSaasPlatformService;
    this.aiProviderResilienceService = aiProviderResilienceService;
    this.teamService = teamService;
    this.intelligenceService = intelligenceService;
    this.recommendationsService = recommendationsService;
    this.memoryService = memoryService;
    this.analyticsService = analyticsService;
    this.mobileService = mobileService;
    this.orchestrationService = orchestrationService;
    this.salesService = salesService;
    this.marketingService = marketingService;
    this.leadsService = leadsService;
    this.voiceService = voiceService;
    this.customerSupportService = customerSupportService;
    this.workforceService = workforceService;
    this.procurementService = procurementService;
    this.executiveService = executiveService;
    this.financeIntelligenceService = financeIntelligenceService;
    this.knowledgeService = knowledgeService;
    this.businessIntelligenceService = businessIntelligenceService;
    this.tenantCapabilityBuilderService = tenantCapabilityBuilderService;
  }

  async listConversations(scope: TenantScope): Promise<AuraConversationSummary[]> {
    const rows = await this.db.query.auraConversations.findMany({
      where: and(
        eq(auraConversations.companyId, scope.companyId),
        eq(auraConversations.userId, scope.userId),
      ),
      orderBy: [desc(auraConversations.updatedAt)],
      with: {
        messages: {
          orderBy: [desc(auraMessages.createdAt)],
          limit: 1,
        },
      },
    });

    const summaries = await Promise.all(
      rows.map(async (row) => {
        const [countRow] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(auraMessages)
          .where(eq(auraMessages.conversationId, row.id));

        return toConversationSummary(row, countRow?.count ?? 0, row.messages[0]?.createdAt ?? null);
      }),
    );

    return summaries;
  }

  async getConversation(
    scope: TenantScope,
    conversationId: string,
  ): Promise<AuraConversationDetail | null> {
    const conversation = await this.db.query.auraConversations.findFirst({
      where: and(
        eq(auraConversations.id, conversationId),
        eq(auraConversations.companyId, scope.companyId),
        eq(auraConversations.userId, scope.userId),
      ),
      with: {
        messages: {
          orderBy: [asc(auraMessages.createdAt)],
        },
      },
    });

    if (!conversation) {
      return null;
    }

    return {
      ...toConversation(conversation),
      messages: conversation.messages.map(toMessage),
    };
  }

  async createConversation(scope: TenantScope): Promise<AuraConversationDetail> {
    const [conversation] = await this.db
      .insert(auraConversations)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        title: 'New conversation',
      })
      .returning();

    if (!conversation) {
      throw new AuraError('CONVERSATION_FAILED', 'Unable to create conversation');
    }

    return {
      ...toConversation(conversation),
      messages: [],
    };
  }

  async sendMessage(
    scope: TenantScope,
    conversationId: string,
    content: string,
    pageContext?: AuraPageContext,
  ): Promise<SendAuraMessageResponse> {
    const trimmed = content.trim();

    if (!trimmed) {
      throw new AuraError('EMPTY_MESSAGE', 'Message content is required');
    }

    if (!this.provider && !(await this.aiProviderResilienceService.hasConfiguredProviders(scope.companyId))) {
      throw new AuraError(
        'PROVIDER_NOT_CONFIGURED',
        'No AI providers are configured. Configure tenant providers or set AURA_OPENAI_API_KEY.',
      );
    }

    const conversation = await this.getConversation(scope, conversationId);

    if (!conversation) {
      throw new AuraError('NOT_FOUND', 'Conversation not found');
    }

    const priorMessages = trimConversationHistory(
      conversation.messages
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .map((message) => ({
          role: message.role,
          content: message.content,
        })),
      this.config.maxHistoryMessages,
    );

    const user = await this.db.query.users.findFirst({
      where: and(eq(users.id, scope.userId), eq(users.companyId, scope.companyId)),
      with: { company: true, role: true },
    });

    if (!user?.company) {
      throw new AuraError('USER_NOT_FOUND', 'User not found');
    }

    const baseContext = buildAuraCompanyContext(
      {
        id: user.company.id,
        name: user.company.name,
        industry: user.company.industry,
        businessType: user.company.businessType,
        preferences: user.company.preferences,
      },
      `${user.firstName} ${user.lastName}`,
    );

    const context = await this.buildAuraContext(
      scope.companyId,
      scope.userId,
      baseContext,
      user.role?.permissions ?? [],
      pageContext,
    );

    const enrichedContext = await this.enrichTenantCapabilityContext(
      scope.companyId,
      trimmed,
      user.role?.permissions ?? [],
      context,
    );

    let assistantContent: string;

    try {
      const result = await this.aiProviderResilienceService.generate(
        scope.companyId,
        {
          messages: [...priorMessages, { role: 'user', content: trimmed }],
          context: enrichedContext,
        },
        {
          operationType: 'conversation',
          routingCategory: 'summarization',
          conversationId,
          userId: scope.userId,
        },
      );
      assistantContent = result.content;
    } catch (error) {
      if (error instanceof AiOperationsError) {
        throw new AuraError(error.code, error.message);
      }
      if (error instanceof AiProviderResilienceError) {
        throw new AuraError(error.code, error.message);
      }
      if (error instanceof AuraProviderError) {
        throw new AuraError(error.code, error.message);
      }

      throw new AuraError('PROVIDER_ERROR', 'Unable to generate an AI response.');
    }

    const result = await this.db.transaction(async (tx) => {
      const [storedUserMessage] = await tx
        .insert(auraMessages)
        .values({
          conversationId,
          role: 'user',
          content: trimmed,
        })
        .returning();

      if (!storedUserMessage) {
        throw new AuraError('MESSAGE_FAILED', 'Unable to store user message');
      }

      const [storedAssistantMessage] = await tx
        .insert(auraMessages)
        .values({
          conversationId,
          role: 'assistant',
          content: assistantContent,
        })
        .returning();

      if (!storedAssistantMessage) {
        throw new AuraError('MESSAGE_FAILED', 'Unable to store assistant message');
      }

      const title =
        conversation.messages.length === 0
          ? deriveConversationTitle(trimmed)
          : conversation.title;

      const [updatedConversation] = await tx
        .update(auraConversations)
        .set({
          title,
          updatedAt: new Date(),
        })
        .where(eq(auraConversations.id, conversationId))
        .returning();

      if (!updatedConversation) {
        throw new AuraError('CONVERSATION_FAILED', 'Unable to update conversation');
      }

      return {
        conversation: toConversation(updatedConversation),
        userMessage: toMessage(storedUserMessage),
        assistantMessage: toMessage(storedAssistantMessage),
      };
    });

    return result;
  }

  async deleteConversation(scope: TenantScope, conversationId: string): Promise<boolean> {
    const [deleted] = await this.db
      .delete(auraConversations)
      .where(
        and(
          eq(auraConversations.id, conversationId),
          eq(auraConversations.companyId, scope.companyId),
          eq(auraConversations.userId, scope.userId),
        ),
      )
      .returning();

    return Boolean(deleted);
  }

  private async enrichTenantCapabilityContext(
    companyId: string,
    message: string,
    permissions: string[],
    context: AuraGenerateContext,
  ): Promise<AuraGenerateContext> {
    if (!hasAnyPermission(permissions, ['agents:read', 'agents:write'])) {
      return context;
    }

    const capabilities = await this.tenantCapabilityBuilderService.listCapabilities(companyId);
    const active = capabilities.filter((capability) => capability.status === 'active');
    const matched = await this.tenantCapabilityBuilderService.matchCapabilityForRequest(
      companyId,
      message,
    );
    const wantsNewCapability = indicatesCapabilityCreationIntent(message);

    return {
      ...context,
      tenantCapabilities: {
        activeCapabilities: active.map((capability) => ({
          id: capability.id,
          name: capability.name,
          department: capability.department,
          purpose: capability.purpose,
          baseAgentKey: capability.baseAgentKey,
        })),
        matchedCapability: matched
          ? {
              id: matched.id,
              name: matched.name,
              department: matched.department,
              purpose: matched.purpose,
            }
          : null,
        createCapabilityGuidance: wantsNewCapability
          ? 'The user may want a new capability. Ask only plain-language discovery questions (purpose, department, data access, action mode, users, external provider). Guide them to AURA Capabilities → Create capability at /aura/capabilities/create when ready for a proposal. Do not ask about prompts, tool scopes, or execution engines.'
          : null,
      },
    };
  }

  private async buildAuraContext(
    companyId: string,
    userId: string,
    baseContext: AuraGenerateContext,
    permissions: string[],
    pageContext?: AuraPageContext,
  ): Promise<AuraGenerateContext> {
    await this.teamService.ensureDefaultRoles(companyId);

    let context = baseContext;

    if (hasAnyPermission(permissions, ['customers:read', 'customers:write'])) {
      const crm = await this.crmService.buildAuraContext(companyId, pageContext?.customerId);
      context = { ...context, crm };
    }

    if (hasAnyPermission(permissions, ['jobs:read', 'jobs:write'])) {
      const jobs = await this.jobsService.buildAuraContext(companyId, pageContext?.jobId);
      context = { ...context, jobs };
    }

    if (hasAnyPermission(permissions, ['dispatch:read', 'dispatch:write'])) {
      const scheduling = await this.schedulingService.buildAuraContext(companyId);
      context = { ...context, scheduling };
    }

    if (hasAnyPermission(permissions, ['finance:read', 'finance:write'])) {
      const finance = await this.financeService.buildAuraContext(companyId);
      context = { ...context, finance };
    }

    if (hasAnyPermission(permissions, ['inventory:read', 'inventory:write'])) {
      const inventory = await this.inventoryService.buildAuraContext(companyId);
      context = { ...context, inventory };
    }

    if (hasAnyPermission(permissions, ['fleet:read', 'fleet:write'])) {
      const fleet = await this.fleetService.buildAuraContext(companyId, pageContext?.vehicleId);
      const tracking = await this.integrationsService.buildFleetTrackingContext(companyId);
      context = { ...context, fleet: { ...fleet, tracking } };
    }

    if (hasAnyPermission(permissions, ['communications:read', 'communications:write'])) {
      const communications = await this.communicationsService.buildAuraContext(
        companyId,
        pageContext?.customerId,
      );
      context = { ...context, communications };
    }

    if (hasAnyPermission(permissions, ['documents:read', 'documents:write'])) {
      const documents = await this.documentsService.buildAuraContext(
        companyId,
        pageContext?.customerId,
        pageContext?.jobId,
      );
      context = { ...context, documents };
    }

    if (hasAnyPermission(permissions, ['automation:read', 'automation:write'])) {
      const automation = await this.automationService.buildAuraContext(
        companyId,
        pageContext?.workflowId,
      );
      context = { ...context, automation };
    }

    if (hasAnyPermission(permissions, ['agents:read', 'agents:write'])) {
      const agents = await this.agentsService.buildAuraContext(
        companyId,
        pageContext?.agentProfileId,
      );
      context = { ...context, agents };
    }

    if (hasAnyPermission(permissions, ['portal:read', 'portal:manage'])) {
      const portal = await this.portalService.buildAuraContext(companyId);
      const customerPortalExperience = pageContext?.customerId
        ? await this.portalExperienceService.buildStaffCustomerAuraContext({
            companyId,
            customerId: pageContext.customerId,
          })
        : undefined;
      context = {
        ...context,
        portal,
        ...(customerPortalExperience ? { customerPortalExperience } : {}),
      };
    }

    if (hasAnyPermission(permissions, ['communications:read', 'communications:write', 'integrations:read', 'integrations:manage'])) {
      const whatsapp = await this.whatsappService.buildAuraContext(
        companyId,
        pageContext?.customerId,
      );
      context = { ...context, whatsapp };
    }

    if (hasAnyPermission(permissions, ['recruiting:read', 'recruiting:write'])) {
      const recruiting = await this.recruitingService.buildAuraContext(companyId);
      context = { ...context, recruiting };
    }

    if (hasAnyPermission(permissions, ['integrations:read', 'integrations:manage'])) {
      const integrationHub = await this.integrationHubService.buildAuraContext(companyId);
      const integrationApiManagement =
        await this.integrationApiManagementService.buildAuraContext(companyId);
      const xeroAccounting = await this.xeroSyncService.buildAuraContext(companyId);
      context = {
        ...context,
        integrationHub,
        integrationApiManagement,
        ...(xeroAccounting ? { xeroAccounting } : {}),
      };
    }

    if (hasAnyPermission(permissions, ['intelligence:read', 'agents:read'])) {
      const intelligence = await this.intelligenceService.buildAuraContext(companyId);
      const recommendations = await this.recommendationsService.getRecommendations(companyId);
      context = {
        ...context,
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
    }

    if (hasAnyPermission(permissions, ['intelligence:read'])) {
      const memory = await this.memoryService.buildAuraContext(companyId);
      context = { ...context, memory };
    }

    if (hasAnyPermission(permissions, ['analytics:read', 'analytics:write'])) {
      const analytics = await this.analyticsService.buildAuraContext(companyId, { period: 'monthly' });
      context = { ...context, analytics };
    }

    if (hasAnyPermission(permissions, ['orchestration:read', 'orchestration:write', 'agents:read'])) {
      const orchestration = await this.orchestrationService.buildAuraContext(companyId);
      context = { ...context, orchestration };
    }

    if (hasAnyPermission(permissions, ['sales:read', 'sales:write', 'agents:read'])) {
      const sales = await this.salesService.buildAuraContext(companyId);
      context = { ...context, sales };
    }

    if (hasAnyPermission(permissions, ['marketing:read', 'marketing:write', 'agents:read'])) {
      const marketing = await this.marketingService.buildAuraContext(companyId);
      context = { ...context, marketing };
    }

    if (hasAnyPermission(permissions, ['leads:read', 'leads:write', 'agents:read'])) {
      const leads = await this.leadsService.buildAuraContext(companyId);
      context = { ...context, leads };
    }

    if (hasAnyPermission(permissions, ['voice:read', 'voice:write', 'agents:read'])) {
      const voice = await this.voiceService.buildAuraContext(companyId);
      context = { ...context, voice };
    }

    if (hasAnyPermission(permissions, ['customer_support:read', 'customer_support:write', 'agents:read'])) {
      const customerSupport = await this.customerSupportService.buildAuraContext(companyId);
      context = { ...context, customerSupport };
    }

    if (hasAnyPermission(permissions, ['workforce:read', 'workforce:write', 'recruiting:read', 'agents:read'])) {
      const workforce = await this.workforceService.buildAuraContext(companyId);
      context = { ...context, workforce };
    }

    if (hasAnyPermission(permissions, ['procurement:read', 'procurement:write', 'agents:read'])) {
      const procurement = await this.procurementService.buildAuraContext(companyId);
      context = { ...context, procurement };
    }

    if (hasAnyPermission(permissions, ['finance:read', 'finance:write', 'agents:read'])) {
      const financeIntelligence = await this.financeIntelligenceService.buildAuraContext(companyId);
      context = { ...context, financeIntelligence };
    }

    if (hasAnyPermission(permissions, ['knowledge:read', 'knowledge:write', 'agents:read'])) {
      const knowledge = await this.knowledgeService.buildAuraContext(companyId);
      context = { ...context, knowledge };
    }

    if (hasAnyPermission(permissions, ['bi:read', 'bi:write', 'intelligence:read', 'agents:read'])) {
      const businessIntelligence = await this.businessIntelligenceService.buildAuraContext(companyId);
      context = { ...context, businessIntelligence };
    }

    if (hasAnyPermission(permissions, ['bi:read', 'analytics:read', 'intelligence:read', 'agents:read'])) {
      const enterpriseAnalytics = await this.enterpriseAnalyticsService.buildAnalyticsAuraContext(companyId);
      context = { ...context, enterpriseAnalytics };
    }

    if (hasAnyPermission(permissions, ['automation:read', 'automation:write', 'agents:read'])) {
      const enterpriseAutomationStudio =
        await this.enterpriseAutomationStudioService.buildAutomationAuraContext(companyId);
      context = { ...context, enterpriseAutomationStudio };
    }

    if (hasAnyPermission(permissions, ['knowledge:read', 'knowledge:write', 'agents:read'])) {
      const enterpriseKnowledgeGraph =
        await this.enterpriseKnowledgeGraphService.buildKnowledgeGraphAuraContext(companyId);
      context = { ...context, enterpriseKnowledgeGraph };
    }

    if (hasAnyPermission(permissions, ['executive:read', 'executive:write', 'intelligence:read', 'agents:read'])) {
      const enterpriseDigitalTwin =
        await this.enterpriseDigitalTwinService.buildDigitalTwinAuraContext(companyId);
      context = { ...context, enterpriseDigitalTwin };
    }

    if (hasAnyPermission(permissions, ['executive:read', 'executive:write', 'intelligence:read', 'agents:read'])) {
      const enterpriseMissionControl =
        await this.enterpriseMissionControlService.buildMissionControlAuraContext(companyId);
      context = { ...context, enterpriseMissionControl };
    }

    if (hasAnyPermission(permissions, ['intelligence:read', 'executive:read', 'executive:write', 'agents:read'])) {
      const enterpriseEvolution = await this.enterpriseEvolutionService.buildEvolutionAuraContext(companyId);
      context = { ...context, enterpriseEvolution };
    }

    if (hasAnyPermission(permissions, ['integrations:read', 'integrations:manage', 'agents:read'])) {
      const enterpriseDeveloperPlatform =
        await this.enterpriseDeveloperPlatformService.buildDeveloperAuraContext(companyId);
      context = { ...context, enterpriseDeveloperPlatform };
    }

    if (hasAnyPermission(permissions, ['saas:read', 'saas:manage', 'platform:read', 'agents:read'])) {
      const enterpriseSaasPlatform = await this.enterpriseSaasPlatformService.buildSaasAuraContext(companyId);
      context = { ...context, enterpriseSaasPlatform };
    }

    if (hasAnyPermission(permissions, ['executive:read', 'executive:write', 'intelligence:read', 'agents:read'])) {
      const executive = await this.executiveService.buildAuraContext(companyId);
      context = { ...context, executive };
    }

    if (pageContext?.mobileRole === 'owner' && hasAnyPermission(permissions, ['mobile:read', 'intelligence:read'])) {
      const ownerContext = await this.mobileService.buildOwnerAuraContext({
        companyId,
        userId,
      });
      context = {
        ...context,
        mobile: { role: 'owner', summary: ownerContext.summary, details: ownerContext },
      };
    }

    if (pageContext?.mobileRole === 'technician' && hasAnyPermission(permissions, ['mobile:read', 'jobs:read'])) {
      const [technicianContext, workforceContext] = await Promise.all([
        this.mobileService.buildTechnicianAuraContext({ companyId, userId }),
        this.mobileWorkforceService.buildWorkforceAuraContext({ companyId, userId }),
      ]);
      context = {
        ...context,
        mobile: { role: 'technician', summary: technicianContext.summary, details: technicianContext },
        mobileWorkforceExperience: workforceContext,
      };
    }

    if (hasAnyPermission(permissions, ['quality:read', 'quality:write', 'executive:read', 'agents:read'])) {
      const qualityAssurance = await this.qualityAssuranceService.buildQualityAuraContext(companyId);
      context = { ...context, qualityAssurance };
    }

    if (
      hasAnyPermission(permissions, [
        'communications_intelligence:read',
        'communications_intelligence:write',
        'communications:read',
        'voice:read',
        'customer_support:read',
        'agents:read',
      ])
    ) {
      const communicationsIntelligence =
        await this.communicationsIntelligenceService.buildCommunicationsIntelligenceAuraContext(companyId);
      context = { ...context, communicationsIntelligence };
    }

    if (hasAnyPermission(permissions, ['asset_equipment:read', 'asset_equipment:write', 'fleet:read', 'agents:read'])) {
      const assetEquipment = await this.assetEquipmentIntelligenceService.buildAssetAuraContext(companyId);
      context = { ...context, assetEquipment };
    }

    if (
      hasAnyPermission(permissions, [
        'ai_orchestration:read',
        'ai_orchestration:write',
        'agents:read',
        'executive:read',
      ])
    ) {
      const aiOrchestration = await this.aiOrchestrationService.buildAiOrchestrationAuraContext(companyId);
      context = { ...context, aiOrchestration };
    }

    if (
      hasAnyPermission(permissions, [
        'dispatch_intelligence:read',
        'dispatch_intelligence:write',
        'dispatch:read',
        'voice:read',
        'agents:read',
      ])
    ) {
      const dispatchIntelligence = await this.dispatchIntelligenceService.buildDispatchAuraContext(companyId);
      context = { ...context, dispatchIntelligence };
    }

    if (
      hasAnyPermission(permissions, [
        'fleet_intelligence:read',
        'fleet_intelligence:write',
        'fleet:read',
        'integrations:read',
        'agents:read',
      ])
    ) {
      const fleetIntelligence = await this.fleetIntelligenceService.buildFleetIntelligenceAuraContext(companyId);
      context = { ...context, fleetIntelligence };
    }

    if (
      hasAnyPermission(permissions, [
        'personal_communications:read',
        'personal_communications:write',
        'communications_intelligence:read',
        'communications:read',
        'agents:read',
      ])
    ) {
      const personalCommunications =
        await this.personalCommunicationsIntelligenceService.buildPersonalCommunicationsAuraContext(companyId);
      context = { ...context, personalCommunications };
    }

    if (hasAnyPermission(permissions, ['security:read', 'security:write', 'settings:manage', 'agents:read'])) {
      const security = await this.enterpriseSecurityService.buildSecurityAuraContext(companyId);
      context = { ...context, security };
    }

    if (hasAnyPermission(permissions, ['integrations:read', 'integrations:manage', 'agents:read'])) {
      const integrationPlatform = await this.integrationPlatformService.buildIntegrationAuraContext(companyId);
      context = { ...context, integrationPlatform };
    }

    return context;
  }
}

function toConversation(row: typeof auraConversations.$inferSelect): AuraConversation {
  return {
    id: row.id,
    companyId: row.companyId,
    userId: row.userId,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMessage(row: typeof auraMessages.$inferSelect): AuraMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  };
}

function toConversationSummary(
  row: typeof auraConversations.$inferSelect,
  messageCount: number,
  lastMessageAt: Date | null,
): AuraConversationSummary {
  return {
    ...toConversation(row),
    messageCount,
    lastMessageAt: lastMessageAt ? lastMessageAt.toISOString() : null,
  };
}
