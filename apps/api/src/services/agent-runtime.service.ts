import { and, desc, eq } from 'drizzle-orm';
import {
  AuraProviderError,
  buildAuraCompanyContext,
  type AuraConfig,
  type AuraGenerateContext,
  type AuraProvider,
} from '@titan/aura';
import { hasAnyPermission, hasPermission } from '@titan/auth';
import type {
  AgentKey,
  AgentRunDetail,
  AgentRunSummary,
  AgentTaskSummary,
  AgentTaskType,
  AgentToolExecutionResult,
  RunAgentRequest,
  RunAgentResponse,
  UpdateAgentTaskRequest,
} from '@titan/shared';
import { getAgentRegistryEntry, getAgentToolDefinition } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { agentProfiles, agentRuns, agentTasks, users } from '@titan/db';
import type { AgentsService } from './agents.service.js';
import type { CrmService } from './crm.service.js';
import type { FinanceService } from './finance.service.js';
import type { FleetService } from './fleet.service.js';
import type { IntegrationsService } from './integrations.service.js';
import type { InventoryService } from './inventory.service.js';
import type { JobsService } from './jobs.service.js';
import type { RecruitingService } from './recruiting.service.js';
import type { SchedulingService } from './scheduling.service.js';
import type { WhatsappService } from './whatsapp.service.js';
import type { XeroSyncService } from './xero-sync.service.js';
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
import type { WorkflowStudioService } from './workflow-studio.service.js';
import type { IntegrationApiManagementService } from './integration-api-management.service.js';
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
import type { AutomationService } from './automation.service.js';
import type { EnterpriseKnowledgeGraphService } from './enterprise-knowledge-graph.service.js';
import type { EnterpriseMissionControlService } from './enterprise-mission-control.service.js';
import type { EnterpriseEvolutionService } from './enterprise-evolution.service.js';
import type { EnterpriseDeveloperPlatformService } from './enterprise-developer-platform.service.js';
import type { EnterpriseProductionReadinessService } from './enterprise-production-readiness.service.js';
import type { EnterpriseMobilePlatformService } from './enterprise-mobile-platform.service.js';
import type { EnterpriseUnifiedCommunicationsService } from './enterprise-unified-communications.service.js';
import type { EnterpriseCustomerExperienceService } from './enterprise-customer-experience.service.js';
import type { EnterpriseAssetLifecycleService } from './enterprise-asset-lifecycle.service.js';
import type { EnterpriseWorkforceIntelligenceService } from './enterprise-workforce-intelligence.service.js';
import type { EnterpriseLegalComplianceService } from './enterprise-legal-compliance.service.js';
import type { EnterpriseFinancialPlanningService } from './enterprise-financial-planning.service.js';
import type { EnterpriseSalesIntelligenceService } from './enterprise-sales-intelligence.service.js';
import type { EnterpriseMarketingIntelligenceService } from './enterprise-marketing-intelligence.service.js';
import type { EnterpriseServiceDeliveryService } from './enterprise-service-delivery.service.js';
import type { EnterpriseItOperationsService } from './enterprise-it-operations.service.js';
import type { EnterpriseBusinessEvolutionService } from './enterprise-business-evolution.service.js';
import type { EnterpriseAppBuilderService } from './enterprise-app-builder.service.js';
import type { EnterpriseIndustryPackService } from './enterprise-industry-packs.service.js';
import type { EnterprisePublicDeveloperPlatformService } from './enterprise-public-developer-platform.service.js';
import type { EnterpriseSaasManagementService } from './enterprise-saas-management.service.js';
import type { EnterpriseVoiceReceptionService } from './enterprise-voice-reception.service.js';
import type { EnterpriseDocumentAiService } from './enterprise-document-ai.service.js';
import type { EnterpriseBusinessContinuityService } from './enterprise-business-continuity.service.js';
import type { EnterpriseGlobalSearchService } from './enterprise-global-search.service.js';
import type { EnterpriseDataMigrationService } from './enterprise-data-migration.service.js';
import type { EnterpriseNotificationsService } from './enterprise-notifications.service.js';
import type { EnterprisePlatformHealthService } from './enterprise-platform-health.service.js';
import type { EnterpriseLaunchCenterService } from './enterprise-launch-center.service.js';
import type { EnterpriseReleaseCenterService } from './enterprise-release-center.service.js';
import type { EnterpriseProductionLaunchService } from './enterprise-production-launch.service.js';
import type { EnterpriseSaasPlatformService } from './enterprise-saas-platform.service.js';
import type { AiProviderResilienceService } from './ai-provider-resilience.service.js';
import { AiProviderResilienceError } from './ai-provider-resilience.service.js';
import { AiOperationsError } from './ai-operations.service.js';
import type { EnterpriseDigitalTwinService } from './enterprise-digital-twin.service.js';
import type { EnterpriseAutomationStudioService } from './enterprise-automation-studio.service.js';
import type { IntegrationPlatformService } from './integration-platform.service.js';
import type { EnterpriseAnalyticsService } from './enterprise-analytics.service.js';
import type { ConnectorEngineService } from './connector-engine.service.js';

export class AgentRuntimeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AgentRuntimeError';
  }
}

type TenantScope = {
  companyId: string;
  userId: string;
  roleName?: string;
  permissions?: string[];
};

type AgentRuntimeDeps = {
  db: DatabaseClient;
  provider: AuraProvider | null;
  config: AuraConfig;
  agentsService: AgentsService;
  crmService: CrmService;
  jobsService: JobsService;
  schedulingService: SchedulingService;
  financeService: FinanceService;
  inventoryService: InventoryService;
  fleetService: FleetService;
  integrationsService: IntegrationsService;
  xeroSyncService: XeroSyncService;
  whatsappService: WhatsappService;
  recruitingService: RecruitingService;
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
  enterpriseReleaseManagementService: import('./enterprise-release-management.service.js').EnterpriseReleaseManagementService;
  aiProviderResilienceService: AiProviderResilienceService;
  automationService: AutomationService;
  ownerFinancialCommandService?: import('./owner-financial-command.service.js').OwnerFinancialCommandService;
  growthPlannerService?: import('./growth-planner.service.js').GrowthPlannerService;
  cashControlService?: import('./cash-control.service.js').CashControlService;
  profitAnalyticsService?: import('./profit-analytics.service.js').ProfitAnalyticsService;
};

type ResolvedAgent = {
  agentKey: AgentKey;
  agentProfileId: string | null;
  agentName: string;
  enabledToolKeys: string[];
  effectivePermissions: string[];
};

type PlannedTask = {
  taskType: AgentTaskType;
  preview: string;
  payload: Record<string, unknown>;
};

export class AgentRuntimeService {
  constructor(private readonly deps: AgentRuntimeDeps) {}

  async runAgent(scope: TenantScope, input: RunAgentRequest): Promise<RunAgentResponse> {
    const request = input.request.trim();

    if (!request) {
      throw new AgentRuntimeError('VALIDATION_ERROR', 'Agent request is required');
    }

    if (
      !this.deps.provider &&
      !(await this.deps.aiProviderResilienceService.hasConfiguredProviders(scope.companyId))
    ) {
      throw new AgentRuntimeError(
        'PROVIDER_NOT_CONFIGURED',
        'No AI providers are configured. Configure tenant providers or set AURA_OPENAI_API_KEY.',
      );
    }

    const user = await this.deps.db.query.users.findFirst({
      where: and(eq(users.id, scope.userId), eq(users.companyId, scope.companyId)),
      with: { company: true, role: true },
    });

    if (!user?.company) {
      throw new AgentRuntimeError('USER_NOT_FOUND', 'User not found');
    }

    const userPermissions = user.role?.permissions ?? [];

    if (!hasAnyPermission(userPermissions, ['agents:read', 'agents:write'])) {
      throw new AgentRuntimeError('FORBIDDEN', 'You do not have permission to run agents');
    }

    const resolved = await this.resolveAgent(scope.companyId, input, userPermissions);
    const [run] = await this.deps.db
      .insert(agentRuns)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        agentProfileId: resolved.agentProfileId,
        agentKey: resolved.agentKey,
        request,
        status: 'running',
      })
      .returning();

    try {
      const toolResults = await this.executeReadTools(
        scope,
        resolved,
        userPermissions,
        input.pageContext,
      );
      const toolsUsed = toolResults.map((result) => result.toolKey);
      const plannedTasks = this.planMutatingTasks(
        request,
        resolved,
        toolResults,
        input.pageContext,
      );

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

      const context = await this.buildAgentContext(
        scope.companyId,
        baseContext,
        resolved,
        userPermissions,
        input.pageContext,
      );

      const agentPrompt = this.buildAgentSystemPrompt(resolved, toolResults, plannedTasks);
      const generation = await this.deps.aiProviderResilienceService.generate(
        scope.companyId,
        {
          messages: [
            { role: 'system', content: agentPrompt },
            { role: 'user', content: request },
          ],
          context,
        },
        {
          operationType: 'agent_run',
          routingCategory: 'business_analysis',
          agentRunId: run!.id,
          userId: scope.userId,
        },
      );
      const assistantMessage = generation.content;

      const createdTasks: AgentTaskSummary[] = [];

      for (const planned of plannedTasks) {
        const [task] = await this.deps.db
          .insert(agentTasks)
          .values({
            companyId: scope.companyId,
            agentRunId: run!.id,
            agentProfileId: resolved.agentProfileId,
            agentKey: resolved.agentKey,
            userId: scope.userId,
            taskType: planned.taskType,
            status: 'pending_approval',
            approvalRequired: true,
            preview: planned.preview,
            payload: planned.payload,
          })
          .returning();

        createdTasks.push(await this.toTaskSummary(task!));
      }

      const responseText =
        createdTasks.length > 0
          ? `${assistantMessage}\n\nI've prepared ${createdTasks.length} action(s) for your approval. Review the task cards below before anything is executed.`
          : assistantMessage;

      const [updatedRun] = await this.deps.db
        .update(agentRuns)
        .set({
          response: responseText,
          toolsUsed,
          status: 'completed',
          completedAt: new Date(),
        })
        .where(eq(agentRuns.id, run!.id))
        .returning();

      const runDetail = await this.getRun(scope.companyId, updatedRun!.id);

      return {
        run: runDetail!,
        assistantMessage: responseText,
        pendingTasks: createdTasks,
      };
    } catch (error) {
      const message =
        error instanceof AgentRuntimeError
          ? error.message
          : error instanceof AiOperationsError
            ? error.message
            : error instanceof AiProviderResilienceError
              ? error.message
              : error instanceof AuraProviderError
                ? error.message
                : error instanceof Error
                  ? error.message
                  : 'Agent run failed';

      await this.deps.db
        .update(agentRuns)
        .set({
          status: 'failed',
          errorMessage: message,
          completedAt: new Date(),
        })
        .where(eq(agentRuns.id, run!.id));

      if (error instanceof AgentRuntimeError) {
        throw error;
      }

      if (error instanceof AiOperationsError) {
        throw new AgentRuntimeError(error.code, error.message);
      }

      if (error instanceof AiProviderResilienceError) {
        throw new AgentRuntimeError(error.code, error.message);
      }

      if (error instanceof AuraProviderError) {
        throw new AgentRuntimeError(error.code, error.message);
      }

      throw new AgentRuntimeError('RUN_FAILED', message);
    }
  }

  async listRuns(companyId: string, limit = 50): Promise<AgentRunSummary[]> {
    const rows = await this.deps.db.query.agentRuns.findMany({
      where: eq(agentRuns.companyId, companyId),
      with: { user: true, agentProfile: true, tasks: true },
      orderBy: [desc(agentRuns.startedAt)],
      limit,
    });

    return Promise.all(rows.map((row) => this.toRunSummary(row)));
  }

  async getRun(companyId: string, runId: string): Promise<AgentRunDetail | null> {
    const row = await this.deps.db.query.agentRuns.findFirst({
      where: and(eq(agentRuns.id, runId), eq(agentRuns.companyId, companyId)),
      with: { user: true, agentProfile: true, tasks: { with: { user: true, approvedBy: true } } },
    });

    if (!row) {
      return null;
    }

    const summary = await this.toRunSummary(row);
    const tasks = await Promise.all(row.tasks.map((task) => this.toTaskSummary(task)));

    return { ...summary, tasks };
  }

  async listTasks(companyId: string, status?: string): Promise<AgentTaskSummary[]> {
    const rows = await this.deps.db.query.agentTasks.findMany({
      where: status
        ? and(
            eq(agentTasks.companyId, companyId),
            eq(agentTasks.status, status as (typeof agentTasks.$inferSelect)['status']),
          )
        : eq(agentTasks.companyId, companyId),
      with: { user: true, approvedBy: true, agentProfile: true },
      orderBy: [desc(agentTasks.createdAt)],
      limit: 100,
    });

    return Promise.all(rows.map((row) => this.toTaskSummary(row)));
  }

  async approveTask(scope: TenantScope, taskId: string): Promise<AgentTaskSummary> {
    const task = await this.getTaskForAction(scope.companyId, taskId);

    if (task.status !== 'pending_approval') {
      throw new AgentRuntimeError('INVALID_STATE', 'Task is not pending approval');
    }

    const result = await this.executeTask(scope, task);

    const [updated] = await this.deps.db
      .update(agentTasks)
      .set({
        status: 'executed',
        result,
        approvedByUserId: scope.userId,
        executedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentTasks.id, taskId))
      .returning();

    return this.toTaskSummary(updated!);
  }

  async rejectTask(scope: TenantScope, taskId: string): Promise<AgentTaskSummary> {
    const task = await this.getTaskForAction(scope.companyId, taskId);

    if (task.status !== 'pending_approval') {
      throw new AgentRuntimeError('INVALID_STATE', 'Task is not pending approval');
    }

    const [updated] = await this.deps.db
      .update(agentTasks)
      .set({
        status: 'rejected',
        approvedByUserId: scope.userId,
        updatedAt: new Date(),
      })
      .where(eq(agentTasks.id, taskId))
      .returning();

    return this.toTaskSummary(updated!);
  }

  async updateTask(
    scope: TenantScope,
    taskId: string,
    input: UpdateAgentTaskRequest,
  ): Promise<AgentTaskSummary> {
    const task = await this.getTaskForAction(scope.companyId, taskId);

    if (task.status !== 'pending_approval') {
      throw new AgentRuntimeError('INVALID_STATE', 'Only pending tasks can be edited');
    }

    const [updated] = await this.deps.db
      .update(agentTasks)
      .set({
        preview: input.preview?.trim() ?? task.preview,
        payload: input.payload ?? (task.payload as Record<string, unknown>),
        updatedAt: new Date(),
      })
      .where(eq(agentTasks.id, taskId))
      .returning();

    return this.toTaskSummary(updated!);
  }

  private async resolveAgent(
    companyId: string,
    input: RunAgentRequest,
    userPermissions: string[],
  ): Promise<ResolvedAgent> {
    let agentKey = input.agentKey ?? detectAgentKey(input.request);
    let profile = null;

    if (input.agentProfileId) {
      profile = await this.deps.db.query.agentProfiles.findFirst({
        where: and(
          eq(agentProfiles.id, input.agentProfileId),
          eq(agentProfiles.companyId, companyId),
        ),
        with: { permissions: true, tools: true },
      });

      if (!profile) {
        throw new AgentRuntimeError('NOT_FOUND', 'Agent profile not found');
      }

      agentKey = profile.agentKey;
    } else {
      profile =
        (await this.deps.db.query.agentProfiles.findFirst({
          where: and(
            eq(agentProfiles.companyId, companyId),
            eq(agentProfiles.agentKey, agentKey),
            eq(agentProfiles.status, 'active'),
          ),
          with: { permissions: true, tools: true },
        })) ?? null;
    }

    const registry = getAgentRegistryEntry(agentKey);

    if (!registry) {
      throw new AgentRuntimeError('INVALID_AGENT_KEY', 'Unknown agent type');
    }

    const profilePermissions =
      profile?.permissions.map((entry) => entry.permission) ?? registry.suggestedPermissions;
    const enabledToolKeys =
      profile?.tools.filter((tool) => tool.enabled).map((tool) => tool.toolKey) ??
      registry.suggestedToolKeys;

    const effectivePermissions = profilePermissions.filter((permission) =>
      hasPermission(userPermissions, permission),
    );

    return {
      agentKey,
      agentProfileId: profile?.id ?? null,
      agentName: profile?.name ?? registry.name,
      enabledToolKeys: enabledToolKeys.filter((toolKey) =>
        this.canUseTool(toolKey, userPermissions),
      ),
      effectivePermissions,
    };
  }

  private canUseTool(toolKey: string, userPermissions: string[]): boolean {
    const definition = getAgentToolDefinition(toolKey);

    if (!definition) {
      return false;
    }

    if (definition.requiredPermissions.length === 0) {
      return true;
    }

    return hasAnyPermission(userPermissions, definition.requiredPermissions);
  }

  private async executeReadTools(
    scope: TenantScope,
    resolved: ResolvedAgent,
    userPermissions: string[],
    pageContext?: RunAgentRequest['pageContext'],
  ): Promise<AgentToolExecutionResult[]> {
    const results: AgentToolExecutionResult[] = [];

    for (const toolKey of resolved.enabledToolKeys) {
      const definition = getAgentToolDefinition(toolKey);

      if (!definition?.executable || definition.requiresApproval) {
        continue;
      }

      try {
        const result = await this.runReadTool(scope, toolKey, userPermissions, pageContext);
        results.push(result);
      } catch (error) {
        results.push({
          toolKey,
          success: false,
          summary: error instanceof Error ? error.message : 'Tool execution failed',
        });
      }
    }

    return results;
  }

  private async runReadTool(
    scope: TenantScope,
    toolKey: string,
    userPermissions: string[],
    pageContext?: RunAgentRequest['pageContext'],
  ): Promise<AgentToolExecutionResult> {
    switch (toolKey) {
      case 'read_customers': {
        const customers = await this.deps.crmService.listCustomers(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `Loaded ${customers.length} customer record(s).`,
          data: { count: customers.length, customers: customers.slice(0, 20) },
        };
      }
      case 'read_jobs': {
        const jobs = await this.deps.jobsService.listJobs(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `Loaded ${jobs.length} job record(s).`,
          data: { count: jobs.length, jobs: jobs.slice(0, 20) },
        };
      }
      case 'read_invoices': {
        const invoices = await this.deps.financeService.listInvoices(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `Loaded ${invoices.length} invoice record(s).`,
          data: { count: invoices.length, invoices: invoices.slice(0, 20) },
        };
      }
      case 'read_quotes': {
        const quotes = await this.deps.financeService.listQuotes(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `Loaded ${quotes.length} quote record(s).`,
          data: { count: quotes.length, quotes: quotes.slice(0, 20) },
        };
      }
      case 'read_payments': {
        const payments = await this.deps.financeService.listPayments(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `Loaded ${payments.length} payment record(s).`,
          data: { count: payments.length, payments: payments.slice(0, 20) },
        };
      }
      case 'read_inventory': {
        const context = await this.deps.inventoryService.buildAuraContext(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `Loaded ${context.itemCount} inventory item(s).`,
          data: { itemCount: context.itemCount, lowStockCount: context.lowStockCount },
        };
      }
      case 'read_fleet': {
        const context = await this.deps.fleetService.buildAuraContext(
          scope.companyId,
          pageContext?.vehicleId,
        );
        return {
          toolKey,
          success: true,
          summary: `Loaded ${context.totalCount} vehicle(s).`,
          data: { vehicleCount: context.totalCount, availableCount: context.availableCount },
        };
      }
      case 'read_gps_positions': {
        const tracking = await this.deps.integrationsService.buildFleetTrackingContext(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `Loaded ${tracking.positionCount} GPS position(s) from Cartrack.`,
          data: {
            connected: tracking.cartrackConnected,
            positionCount: tracking.positionCount,
            latestPositions: tracking.latestPositions.slice(0, 10),
          },
        };
      }
      case 'read_candidates': {
        const candidates = await this.deps.recruitingService.listCandidates(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `Loaded ${candidates.length} recruiting candidate(s).`,
          data: { count: candidates.length, candidates: candidates.slice(0, 20) },
        };
      }
      case 'summarize_context':
        return {
          toolKey,
          success: true,
          summary: 'Prepared structured business context summary.',
        };
      case 'read_intelligence_dashboard': {
        const context = await this.deps.intelligenceService.buildAuraContext(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: context.greeting.message,
          data: context,
        };
      }
      case 'read_recommendations': {
        const result = await this.deps.recommendationsService.getRecommendations(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `Loaded ${result.recommendations.length} recommendation(s).`,
          data: { recommendations: result.recommendations.slice(0, 10) },
        };
      }
      case 'read_memory': {
        const context = await this.deps.memoryService.buildAuraContext(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `Loaded ${context.memoryCount} company memory record(s).`,
          data: context,
        };
      }
      case 'analyze_cash_flow': {
        const dashboard = await this.deps.intelligenceService.getDashboard(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `Revenue MTD ${dashboard.revenue.revenueMtdCents / 100} ${dashboard.revenue.currency}; ${dashboard.outstandingInvoices.count} outstanding invoice(s).`,
          data: {
            revenueMtdCents: dashboard.revenue.revenueMtdCents,
            currency: dashboard.revenue.currency,
            outstandingInvoiceCount: dashboard.outstandingInvoices.count,
            totalOutstandingCents: dashboard.outstandingInvoices.totalOutstandingCents,
          },
        };
      }
      case 'read_owner_financial_command': {
        if (!this.deps.ownerFinancialCommandService) {
          return {
            toolKey,
            success: false,
            summary: 'Owner Financial Command service is unavailable.',
            data: { completeness: 'unavailable' },
          };
        }
        const actor = {
          companyId: scope.companyId,
          userId: scope.userId,
          roleName: scope.roleName ?? 'Owner',
          permissions: userPermissions,
        };
        const { buildAuraOwnerFinanceTruthContext } = await import('./aura-owner-finance-truth.js');
        const truth = await buildAuraOwnerFinanceTruthContext({
          actor,
          ownerFinancialCommandService: this.deps.ownerFinancialCommandService,
          growthPlannerService:
            this.deps.growthPlannerService ??
            ({
              getPlan: async () => {
                throw new Error('growth unavailable');
              },
            } as never),
        });
        if (!truth) {
          return {
            toolKey,
            success: false,
            summary: 'Owner finance truth denied for this role (Technician/Client blocked).',
            data: { completeness: 'unavailable', denied: true },
          };
        }
        return {
          toolKey,
          success: true,
          summary: truth.summary,
          data: truth,
        };
      }
      case 'read_cash_control': {
        if (!this.deps.cashControlService) {
          return {
            toolKey,
            success: false,
            summary: 'Cash Control service is unavailable.',
            data: { completeness: 'unavailable' },
          };
        }
        const actor = {
          companyId: scope.companyId,
          userId: scope.userId,
          roleName: scope.roleName ?? 'Owner',
          permissions: userPermissions,
        };
        try {
          const summary = await this.deps.cashControlService.getSummary(actor);
          const moneyInCents =
            summary.monthToDate.moneyIn.customerCashCollectedCents +
            summary.monthToDate.moneyIn.otherClassifiedMoneyInCents;
          const moneyOutCents =
            summary.monthToDate.moneyOut.directJobCashOutCents +
            summary.monthToDate.moneyOut.overheadCashOutCents +
            summary.monthToDate.moneyOut.otherClassifiedMoneyOutCents;
          return {
            toolKey,
            success: true,
            summary: `Cash control ${summary.completeness}; known money in ${(moneyInCents / 100).toFixed(2)}; known money out ${(moneyOutCents / 100).toFixed(2)}. No bank connection is not zero spending.`,
            data: summary,
          };
        } catch (error) {
          return {
            toolKey,
            success: false,
            summary:
              error instanceof Error ? error.message : 'Cash Control denied or unavailable.',
            data: { completeness: 'unavailable' },
          };
        }
      }
      case 'read_profit_analytics': {
        if (!this.deps.profitAnalyticsService) {
          return {
            toolKey,
            success: false,
            summary: 'Profit Analytics service is unavailable.',
            data: { completeness: 'unavailable' },
          };
        }
        const actor = {
          companyId: scope.companyId,
          userId: scope.userId,
          roleName: scope.roleName ?? 'Owner',
          permissions: userPermissions,
        };
        try {
          const dashboard = await this.deps.profitAnalyticsService.getDashboard(actor, {
            period: 'month',
          });
          return {
            toolKey,
            success: true,
            summary: `JPE profit analytics loaded for ${dashboard.overview.period}. Missing costs ≠ 100% profit.`,
            data: dashboard,
          };
        } catch (error) {
          return {
            toolKey,
            success: false,
            summary:
              error instanceof Error ? error.message : 'Profit analytics denied or unavailable.',
            data: { completeness: 'unavailable' },
          };
        }
      }
      case 'read_growth_planner': {
        if (!this.deps.growthPlannerService) {
          return {
            toolKey,
            success: false,
            summary: 'Growth Planner service is unavailable.',
            data: { completeness: 'unavailable' },
          };
        }
        const actor = {
          companyId: scope.companyId,
          userId: scope.userId,
          roleName: scope.roleName ?? 'Owner',
          permissions: userPermissions,
        };
        try {
          const monthKey = new Date().toISOString().slice(0, 7);
          const plan = await this.deps.growthPlannerService.getPlan(actor, monthKey);
          return {
            toolKey,
            success: true,
            summary: `Growth planner ${plan.status}; jobs required ${plan.requiredOutput.jobsRequired ?? 'unavailable'}.`,
            data: plan,
          };
        } catch (error) {
          return {
            toolKey,
            success: false,
            summary:
              error instanceof Error ? error.message : 'Growth planner denied or unavailable.',
            data: { completeness: 'unavailable' },
          };
        }
      }
      case 'read_analytics_dashboard': {
        const dashboard = await this.deps.analyticsService.getDashboard(scope.companyId, {
          period: 'monthly',
        });
        return {
          toolKey,
          success: true,
          summary: `Revenue ${(dashboard.revenue.totalCents / 100).toFixed(2)} ${dashboard.currency}; ${dashboard.jobVolume.total} jobs; ${dashboard.customerGrowth.newInPeriod} new customers.`,
          data: dashboard,
        };
      }
      case 'read_analytics_profitability': {
        const profitability = await this.deps.analyticsService.getProfitability(scope.companyId, {
          period: 'monthly',
        });
        const topJobs = [...profitability.jobs]
          .sort((a, b) => b.revenueCents - a.revenueCents)
          .slice(0, 10);
        return {
          toolKey,
          success: true,
          summary: `${profitability.jobs.length} job(s) analyzed; total revenue ${(profitability.totals.revenueCents / 100).toFixed(2)} ${profitability.currency}.`,
          data: { ...profitability, topJobs },
        };
      }
      case 'read_technician_performance': {
        const technicians = await this.deps.analyticsService.getTechnicianPerformance(
          scope.companyId,
          {
            period: 'monthly',
          },
        );
        const overloaded = [...technicians.technicians]
          .sort((a, b) => b.workloadScore - a.workloadScore)
          .slice(0, 10);
        return {
          toolKey,
          success: true,
          summary: `${technicians.technicians.length} technician(s) tracked.`,
          data: { ...technicians, overloaded },
        };
      }
      case 'read_customer_analytics': {
        const customers = await this.deps.analyticsService.getCustomerAnalytics(scope.companyId, {
          period: 'monthly',
        });
        return {
          toolKey,
          success: true,
          summary: `${customers.newCustomers} new customer(s); ${customers.repeatCustomers} repeat customer(s); ${customers.totalCustomers} total.`,
          data: customers,
        };
      }
      case 'read_mobile_context': {
        const context = await this.deps.mobileService.buildOwnerAuraContext(scope);
        return {
          toolKey,
          success: true,
          summary: context.summary,
          data: context,
        };
      }
      case 'read_orchestration_status': {
        const context = await this.deps.orchestrationService.buildAuraContext(scope.companyId);
        const [runs, approvals] = await Promise.all([
          this.deps.orchestrationService.listRuns(scope.companyId),
          this.deps.orchestrationService.listApprovals(scope.companyId),
        ]);
        return {
          toolKey,
          success: true,
          summary: `${context.activeRunCount} active run(s), ${context.pendingApprovalCount} pending approval(s).`,
          data: { ...context, runs: runs.slice(0, 10), approvals: approvals.slice(0, 10) },
        };
      }
      case 'read_sales_context': {
        const context = await this.deps.salesService.buildAuraContext(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: context.summary,
          data: context,
        };
      }
      case 'read_opportunities': {
        const [tracked, detected] = await Promise.all([
          this.deps.salesService.listOpportunities(scope.companyId),
          this.deps.salesService.detectOpportunities(scope.companyId),
        ]);
        return {
          toolKey,
          success: true,
          summary: `${tracked.length} tracked opportunity(ies), ${detected.length} detected signal(s).`,
          data: { tracked: tracked.slice(0, 20), detected: detected.slice(0, 20) },
        };
      }
      case 'read_sales_pipeline': {
        const [stages, metrics] = await Promise.all([
          this.deps.salesService.listPipelineStages(scope.companyId),
          this.deps.salesService.getPipelineMetrics(scope.companyId),
        ]);
        return {
          toolKey,
          success: true,
          summary: `${stages.length} pipeline stage(s), ${metrics.totalOpenValueCents / 100} open pipeline value.`,
          data: { stages, metrics },
        };
      }
      case 'read_marketing_context': {
        const context = await this.deps.marketingService.buildAuraContext(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: context.summary,
          data: context,
        };
      }
      case 'read_customer_segments': {
        const segments = await this.deps.marketingService.listSegments(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${segments.length} segment(s); ${segments.reduce((sum, segment) => sum + segment.customerCount, 0)} total customer memberships.`,
          data: { segments: segments.slice(0, 20) },
        };
      }
      case 'read_marketing_activity': {
        const [activities, campaigns] = await Promise.all([
          this.deps.marketingService.listActivities(scope.companyId),
          this.deps.marketingService.listCampaigns(scope.companyId),
        ]);
        return {
          toolKey,
          success: true,
          summary: `${activities.length} marketing activity record(s), ${campaigns.length} campaign(s).`,
          data: { activities: activities.slice(0, 20), campaigns: campaigns.slice(0, 10) },
        };
      }
      case 'read_lead_context': {
        const context = await this.deps.leadsService.buildAuraContext(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: context.summary,
          data: context,
        };
      }
      case 'read_lead_pipeline': {
        const metrics = await this.deps.leadsService.getPipelineMetrics(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${metrics.totalActive} active lead(s), ${metrics.convertedCount} converted.`,
          data: metrics,
        };
      }
      case 'score_lead': {
        const leadRows = await this.deps.leadsService.listLeads(scope.companyId);
        const activeLeads = leadRows.filter((row) => !['converted', 'lost'].includes(row.status));
        let targetLead =
          activeLeads.find((row) => row.customerId === pageContext?.customerId) ?? null;

        if (!targetLead && activeLeads.length > 0) {
          targetLead = [...activeLeads].sort((a, b) => b.score - a.score)[0] ?? null;
        }

        if (!targetLead) {
          return {
            toolKey,
            success: true,
            summary: 'No active leads available to score.',
            data: { scored: [] },
          };
        }

        const result = await this.deps.leadsService.analyzeLeadScore(
          scope.companyId,
          targetLead.id,
        );
        return {
          toolKey,
          success: true,
          summary: result.summary,
          data: result,
        };
      }
      case 'read_acquisition_insights': {
        const insights = await this.deps.leadsService.getAcquisitionInsights(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${insights.length} acquisition insight(s) from real tenant data.`,
          data: { insights: insights.slice(0, 20) },
        };
      }
      case 'read_voice_context': {
        const context = await this.deps.voiceService.buildAuraContext(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: context.summary,
          data: context,
        };
      }
      case 'read_call_history': {
        const calls = await this.deps.communicationsIntelligenceService.getCallHistory(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${calls.length} call(s) in unified call history.`,
          data: { calls: calls.slice(0, 20) },
        };
      }
      case 'summarize_call': {
        const sessions = await this.deps.voiceService.listSessions(scope.companyId);
        const targetSession = sessions[0];

        if (!targetSession) {
          return {
            toolKey,
            success: true,
            summary: 'No voice sessions available to summarize.',
            data: { summarized: [] },
          };
        }

        const summary = await this.deps.voiceService.summarizeCall(
          scope.companyId,
          targetSession.id,
        );
        return {
          toolKey,
          success: true,
          summary: summary.summary,
          data: summary,
        };
      }
      case 'read_customer_support_context': {
        const context = await this.deps.customerSupportService.buildAuraContext(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: context.summary,
          data: context,
        };
      }
      case 'read_customer_conversation': {
        const conversations = await this.deps.customerSupportService.listConversations(
          scope.companyId,
        );
        const target =
          conversations.find((row) => row.customerId === pageContext?.customerId) ??
          conversations[0];

        if (!target) {
          return {
            toolKey,
            success: true,
            summary: 'No support conversations available.',
            data: { conversations: [] },
          };
        }

        const messages = await this.deps.customerSupportService.listMessages(
          scope.companyId,
          target.id,
        );
        return {
          toolKey,
          success: true,
          summary: `Loaded conversation "${target.subject}" with ${messages.length} message(s).`,
          data: { conversation: target, messages: messages.slice(0, 30) },
        };
      }
      case 'read_customer_job_status': {
        const customerId = pageContext?.customerId;
        if (!customerId) {
          const customers = await this.deps.crmService.listCustomers(scope.companyId);
          if (customers.length === 0) {
            return {
              toolKey,
              success: true,
              summary: 'No customer selected for job status lookup.',
              data: { status: null },
            };
          }

          const status = await this.deps.customerSupportService.getCustomerJobStatus(
            scope.companyId,
            customers[0]!.id,
          );
          return { toolKey, success: true, summary: status.summary, data: status };
        }

        const status = await this.deps.customerSupportService.getCustomerJobStatus(
          scope.companyId,
          customerId,
        );
        return { toolKey, success: true, summary: status.summary, data: status };
      }
      case 'score_candidates': {
        const candidates = await this.deps.recruitingService.listCandidates(scope.companyId);
        const scored = candidates.map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          status: candidate.status,
          score:
            candidate.status === 'interview'
              ? 85
              : candidate.status === 'screening'
                ? 70
                : candidate.status === 'offered' || candidate.status === 'offer'
                  ? 95
                  : candidate.status === 'rejected'
                    ? 20
                    : 50,
        }));
        return {
          toolKey,
          success: true,
          summary: `Scored ${scored.length} candidate(s) by pipeline stage.`,
          data: { candidates: scored.slice(0, 20) },
        };
      }
      case 'read_workforce_context': {
        const context = await this.deps.workforceService.buildAuraContext(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: context.summary,
          data: context,
        };
      }
      case 'read_candidate_pipeline': {
        const pipeline = await this.deps.workforceService.getCandidatePipeline(scope.companyId);
        const total = pipeline.reduce((sum, stage) => sum + stage.count, 0);
        return {
          toolKey,
          success: true,
          summary: `${total} candidate(s) across ${pipeline.length} pipeline stage(s).`,
          data: { pipeline },
        };
      }
      case 'read_skill_gaps': {
        const skillGaps = await this.deps.workforceService.getSkillGaps(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${skillGaps.length} skill gap signal(s) identified.`,
          data: { skillGaps: skillGaps.slice(0, 20) },
        };
      }
      case 'read_staffing_insights': {
        const staffingInsights = await this.deps.workforceService.getStaffingInsights(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${staffingInsights.length} staffing insight(s) available.`,
          data: { staffingInsights },
        };
      }
      case 'read_procurement_context': {
        const context = await this.deps.procurementService.buildAuraContext(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: context.summary,
          data: context,
        };
      }
      case 'read_stock_intelligence': {
        const stockIntelligence = await this.deps.procurementService.getStockIntelligence(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${stockIntelligence.length} stock intelligence signal(s) identified.`,
          data: { stockIntelligence: stockIntelligence.slice(0, 20) },
        };
      }
      case 'read_supplier_insights': {
        const supplierInsights = await this.deps.procurementService.getSupplierInsights(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${supplierInsights.length} supplier insight(s) available.`,
          data: { supplierInsights },
        };
      }
      case 'read_purchase_orders': {
        const purchaseOrders = await this.deps.procurementService.listPurchaseOrders(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${purchaseOrders.length} purchase order(s) loaded.`,
          data: { purchaseOrders: purchaseOrders.slice(0, 20) },
        };
      }
      case 'read_business_health': {
        const latest = await this.deps.executiveService.getLatestHealthSnapshot(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: latest
            ? `Business health score ${latest.overallScore}/100 (${latest.trend}).`
            : 'No business health snapshot available yet.',
          data: { latest },
        };
      }
      case 'read_executive_alerts': {
        const alerts = await this.deps.executiveService.listAlerts(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${alerts.length} executive alert(s) loaded.`,
          data: { alerts: alerts.slice(0, 20) },
        };
      }
      case 'read_business_summary': {
        const summary = await this.deps.executiveService.getBusinessSummary(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: summary.headline,
          data: { summary },
        };
      }
      case 'read_strategic_recommendations': {
        const recommendations = await this.deps.executiveService.listRecommendations(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${recommendations.length} strategic recommendation(s) loaded.`,
          data: { recommendations: recommendations.slice(0, 20) },
        };
      }
      case 'read_cashflow_context': {
        const cashFlow = await this.deps.financeIntelligenceService.getCashFlowIntelligence(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: cashFlow.summary,
          data: { cashFlow },
        };
      }
      case 'read_profitability_context': {
        const profitability =
          await this.deps.financeIntelligenceService.getProfitabilityIntelligence(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: profitability.summary,
          data: { profitability },
        };
      }
      case 'read_receivables_context': {
        const receivables = await this.deps.financeIntelligenceService.getReceivablesIntelligence(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: receivables.summary,
          data: { receivables },
        };
      }
      case 'read_expense_context': {
        const expenses = await this.deps.financeIntelligenceService.getExpenseIntelligence(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: expenses.summary,
          data: { expenses },
        };
      }
      case 'read_budget_context': {
        const [budgets, variances] = await Promise.all([
          this.deps.financeIntelligenceService.listBudgets(scope.companyId),
          this.deps.financeIntelligenceService.listBudgets(scope.companyId).then(async (rows) => {
            const active = rows.find((row) => row.status === 'active') ?? rows[0];
            if (!active) return null;
            return this.deps.financeIntelligenceService.getBudgetVariance(
              scope.companyId,
              active.id,
            );
          }),
        ]);
        return {
          toolKey,
          success: true,
          summary: `${budgets.length} budget(s) loaded${variances ? ` — ${variances.summary}` : ''}.`,
          data: { budgets: budgets.slice(0, 10), activeVariance: variances },
        };
      }
      case 'read_finance_forecast': {
        const forecast = await this.deps.financeIntelligenceService.getFinanceForecast(
          scope.companyId,
          'monthly',
        );
        return {
          toolKey,
          success: true,
          summary: forecast.summary,
          data: { forecast },
        };
      }
      case 'read_knowledge_base': {
        const context = await this.deps.knowledgeService.buildAuraContext(scope.companyId);
        const articles = await this.deps.knowledgeService.listArticles(
          scope.companyId,
          userPermissions,
        );
        return {
          toolKey,
          success: true,
          summary: context.summary,
          data: { context, articles: articles.slice(0, 15) },
        };
      }
      case 'search_knowledge': {
        const articles = await this.deps.knowledgeService.listArticles(
          scope.companyId,
          userPermissions,
        );
        return {
          toolKey,
          success: true,
          summary: `${articles.length} accessible knowledge item(s) available — use POST /api/v1/knowledge/search for targeted queries.`,
          data: { articles: articles.slice(0, 10) },
        };
      }
      case 'read_sop': {
        const sops = await this.deps.knowledgeService.listSops(scope.companyId, userPermissions);
        const sop = sops[0]
          ? await this.deps.knowledgeService.getSop(scope.companyId, sops[0].id, userPermissions)
          : null;
        return {
          toolKey,
          success: true,
          summary: sop ? `SOP loaded: ${sop.title}` : `${sops.length} SOP(s) available.`,
          data: { sop, sops: sops.slice(0, 10) },
        };
      }
      case 'read_training': {
        const [courses, records] = await Promise.all([
          this.deps.knowledgeService.listTrainingCourses(scope.companyId),
          this.deps.knowledgeService.listTrainingRecords(scope.companyId),
        ]);
        return {
          toolKey,
          success: true,
          summary: `${courses.length} training course(s), ${records.length} training record(s).`,
          data: { courses: courses.slice(0, 10), records: records.slice(0, 10) },
        };
      }
      case 'read_company_policy': {
        const policies = await this.deps.knowledgeService.listPolicies(
          scope.companyId,
          userPermissions,
        );
        const policy = policies[0]
          ? await this.deps.knowledgeService.getPolicy(
              scope.companyId,
              policies[0].id,
              userPermissions,
            )
          : null;
        return {
          toolKey,
          success: true,
          summary: policy
            ? `Policy loaded: ${policy.title}`
            : `${policies.length} policy document(s) available.`,
          data: { policy, policies: policies.slice(0, 10) },
        };
      }
      case 'read_business_kpis': {
        const kpis = await this.deps.businessIntelligenceService.listKpis(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${kpis.length} configured KPI(s) from real tenant data.`,
          data: { kpis: kpis.slice(0, 20) },
        };
      }
      case 'read_business_dashboard': {
        const [dashboards, executiveDashboard] = await Promise.all([
          this.deps.businessIntelligenceService.listDashboards(scope.companyId),
          this.deps.businessIntelligenceService.getDashboardByType(scope.companyId, 'executive'),
        ]);
        return {
          toolKey,
          success: true,
          summary: `${dashboards.length} dashboard(s) configured${executiveDashboard ? ` — executive dashboard "${executiveDashboard.name}" loaded` : ''}.`,
          data: { dashboards, executiveDashboard },
        };
      }
      case 'read_business_reports': {
        const reports = await this.deps.businessIntelligenceService.listReports(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${reports.length} saved report(s); generation requires explicit approval workflow.`,
          data: { reports: reports.slice(0, 20) },
        };
      }
      case 'read_business_insights': {
        const insights = await this.deps.businessIntelligenceService.listInsights(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${insights.length} insight(s) from real operational signals.`,
          data: { insights: insights.slice(0, 15) },
        };
      }
      case 'read_predictive_forecasts': {
        const forecasts = await this.deps.businessIntelligenceService.listForecasts(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${forecasts.length} predictive forecast(s) from historical tenant data.`,
          data: { forecasts: forecasts.slice(0, 10) },
        };
      }
      case 'read_workflows': {
        const workflows = await this.deps.workflowStudioService.listWorkflows(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${workflows.length} workflow(s) configured.`,
          data: { workflows: workflows.slice(0, 20) },
        };
      }
      case 'read_workflow_history': {
        const history = await this.deps.workflowStudioService.listWorkflowHistory(
          scope.companyId,
          pageContext?.workflowId,
        );
        return {
          toolKey,
          success: true,
          summary: `${history.runs.length} run(s), ${history.executions.length} execution(s), ${history.auditLogs.length} audit log(s).`,
          data: history,
        };
      }
      case 'validate_workflow': {
        const workflowId = pageContext?.workflowId;
        if (!workflowId) {
          throw new AgentRuntimeError('VALIDATION_ERROR', 'workflowId in page context is required');
        }
        const validation = await this.deps.workflowStudioService.validateWorkflow(
          scope.companyId,
          workflowId,
        );
        return {
          toolKey,
          success: validation.valid,
          summary: validation.valid ? 'Workflow validation passed' : validation.errors.join('; '),
          data: { validation },
        };
      }
      case 'simulate_workflow': {
        const workflowId = pageContext?.workflowId;
        if (!workflowId) {
          throw new AgentRuntimeError('VALIDATION_ERROR', 'workflowId in page context is required');
        }
        const simulation = await this.deps.workflowStudioService.simulateWorkflow(
          scope,
          workflowId,
          {},
        );
        return {
          toolKey,
          success: true,
          summary: simulation.summary,
          data: { simulation },
        };
      }
      case 'execute_workflow': {
        const workflowId = pageContext?.workflowId;
        if (!workflowId) {
          throw new AgentRuntimeError('VALIDATION_ERROR', 'workflowId in page context is required');
        }
        const run = await this.deps.workflowStudioService.executeWorkflow(scope, workflowId, {});
        return {
          toolKey,
          success: true,
          summary: `Workflow executed — run ${run.id} (${run.status}).`,
          data: { run },
        };
      }
      case 'read_integrations': {
        const registry = await this.deps.integrationApiManagementService.listRegistry(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${registry.length} integration(s) in registry.`,
          data: { registry: registry.slice(0, 20) },
        };
      }
      case 'read_api_health': {
        const health = await this.deps.integrationApiManagementService.getApiHealth(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${health.length} integration health snapshot(s).`,
          data: { health },
        };
      }
      case 'read_sync_status': {
        const sync = await this.deps.integrationApiManagementService.getSyncManagerStatus(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${sync.syncJobs.length} sync job(s), ${sync.scheduledSyncs.filter((row) => row.enabled).length} scheduled.`,
          data: { sync },
        };
      }
      case 'read_webhook_status': {
        const deliveries = await this.deps.integrationApiManagementService.listWebhookDeliveries(
          scope.companyId,
          20,
        );
        return {
          toolKey,
          success: true,
          summary: `${deliveries.length} webhook delivery record(s).`,
          data: { deliveries },
        };
      }
      case 'validate_integration': {
        const provider = pageContext?.integrationProvider;
        if (!provider) {
          throw new AgentRuntimeError(
            'VALIDATION_ERROR',
            'integrationProvider in page context is required',
          );
        }
        const validation = await this.deps.integrationApiManagementService.validateIntegration(
          scope.companyId,
          provider,
        );
        return {
          toolKey,
          success: validation.valid,
          summary: validation.valid
            ? `Integration ${provider} validation passed`
            : validation.checks
                .filter((check) => !check.passed)
                .map((check) => check.message)
                .join('; '),
          data: { validation },
        };
      }
      case 'read_customer_dashboard': {
        const customerId = pageContext?.customerId;
        if (!customerId) {
          throw new AgentRuntimeError('VALIDATION_ERROR', 'customerId in page context is required');
        }
        const dashboard = await this.deps.portalExperienceService.getExperienceDashboardForStaff({
          companyId: scope.companyId,
          customerId,
        });
        return {
          toolKey,
          success: true,
          summary: `${dashboard.activeJobCount} active job(s), ${dashboard.pendingQuoteCount} pending quote(s), ${dashboard.outstandingInvoiceCount} outstanding invoice(s).`,
          data: { dashboard },
        };
      }
      case 'read_customer_jobs': {
        const customerId = pageContext?.customerId;
        if (!customerId) {
          throw new AgentRuntimeError('VALIDATION_ERROR', 'customerId in page context is required');
        }
        const jobs = await this.deps.portalExperienceService.listJobs({
          companyId: scope.companyId,
          customerId,
          portalUserId: customerId,
          permissions: ['portal.jobs:read'],
        });
        return {
          toolKey,
          success: true,
          summary: `${jobs.jobs.length} job(s) found.`,
          data: jobs,
        };
      }
      case 'read_customer_finances': {
        const customerId = pageContext?.customerId;
        if (!customerId) {
          throw new AgentRuntimeError('VALIDATION_ERROR', 'customerId in page context is required');
        }
        const finance = await this.deps.portalExperienceService.getFinanceCentre({
          companyId: scope.companyId,
          customerId,
          portalUserId: customerId,
          permissions: ['portal.invoices:read', 'portal.payments:read'],
        });
        return {
          toolKey,
          success: true,
          summary: `${finance.invoices.length} invoice(s), ${finance.payments.length} payment(s), outstanding ${finance.outstandingBalanceCents}.`,
          data: { finance },
        };
      }
      case 'read_customer_notifications': {
        const customerId = pageContext?.customerId;
        if (!customerId) {
          throw new AgentRuntimeError('VALIDATION_ERROR', 'customerId in page context is required');
        }
        const dashboard = await this.deps.portalExperienceService.getExperienceDashboardForStaff({
          companyId: scope.companyId,
          customerId,
        });
        return {
          toolKey,
          success: true,
          summary: `${dashboard.notifications.length} notification(s), ${dashboard.unreadNotificationCount} unread.`,
          data: { notifications: dashboard.notifications },
        };
      }
      case 'search_customer_knowledge': {
        const customerId = pageContext?.customerId;
        if (!customerId) {
          throw new AgentRuntimeError('VALIDATION_ERROR', 'customerId in page context is required');
        }
        const query = String(pageContext?.knowledgeQuery ?? '').trim();
        if (!query) {
          throw new AgentRuntimeError(
            'VALIDATION_ERROR',
            'knowledgeQuery in page context is required',
          );
        }
        const results = await this.deps.portalExperienceService.searchKnowledge(
          {
            companyId: scope.companyId,
            customerId,
            portalUserId: customerId,
            permissions: ['portal.knowledge:read'],
          },
          { query },
        );
        return {
          toolKey,
          success: true,
          summary: `${results.length} customer knowledge result(s).`,
          data: { results },
        };
      }
      case 'read_mobile_dashboard': {
        const dashboard = await this.deps.mobileWorkforceService.getWorkforceDashboard(scope);
        return {
          toolKey,
          success: true,
          summary: `${dashboard.assignedJobs.length} assigned job(s), ${dashboard.routeSummary.stopCount} route stop(s), ${dashboard.pendingRequestCount} pending request(s).`,
          data: { dashboard },
        };
      }
      case 'read_mobile_jobs': {
        const jobs = await this.deps.mobileWorkforceService.listWorkforceJobs(scope);
        return {
          toolKey,
          success: true,
          summary: `${jobs.jobs.length} job(s), ${jobs.activeCount} active.`,
          data: jobs,
        };
      }
      case 'read_mobile_route': {
        const route = await this.deps.mobileWorkforceService.getRouteIntelligence(scope);
        return {
          toolKey,
          success: true,
          summary: `${route.route.stopCount} stop(s), Cartrack ${route.cartrackConnected ? 'connected' : 'disconnected'}.`,
          data: { route },
        };
      }
      case 'read_mobile_inventory': {
        const inventory = await this.deps.mobileWorkforceService.getInventoryCentre(scope);
        return {
          toolKey,
          success: true,
          summary: `${inventory.alerts.length} alert(s), ${inventory.pendingUsageCount} pending usage submission(s).`,
          data: { inventory },
        };
      }
      case 'read_mobile_notifications': {
        const centre = await this.deps.mobileWorkforceService.getNotificationCentre(scope);
        return {
          toolKey,
          success: true,
          summary: `${centre.notifications.length} notification(s), ${centre.unreadCount} unread.`,
          data: centre,
        };
      }
      case 'read_comeback_history': {
        const comebacks = await this.deps.qualityAssuranceService.listComebacks(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${comebacks.length} comeback record(s).`,
          data: { comebacks: comebacks.slice(0, 20) },
        };
      }
      case 'read_quality_score': {
        const dashboard = await this.deps.qualityAssuranceService.getExecutiveDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `FTFR ${dashboard.firstTimeFixRatePercent ?? 'N/A'}%, quality score ${dashboard.monthlyQualityScore ?? 'N/A'}.`,
          data: {
            firstTimeFixRatePercent: dashboard.firstTimeFixRatePercent,
            monthlyQualityScore: dashboard.monthlyQualityScore,
            totalQualityCostCents: dashboard.totalQualityCostCents,
          },
        };
      }
      case 'read_root_cause_analysis': {
        const comebacks = await this.deps.qualityAssuranceService.listComebacks(scope.companyId);
        const comebackId = pageContext?.jobId
          ? comebacks.find(
              (item) =>
                item.originalJobId === pageContext.jobId ||
                item.comebackJobId === pageContext.jobId,
            )?.id
          : comebacks[0]?.id;
        const analysis = comebackId
          ? await this.deps.qualityAssuranceService.getRootCauseAnalysis(
              scope.companyId,
              comebackId,
            )
          : null;
        return {
          toolKey,
          success: true,
          summary: analysis
            ? `Root cause: ${analysis.classification}`
            : 'No root cause analysis on file.',
          data: { analysis },
        };
      }
      case 'read_warranty_history': {
        const claims = await this.deps.qualityAssuranceService.listWarrantyClaims(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${claims.length} warranty claim(s).`,
          data: { claims: claims.slice(0, 20) },
        };
      }
      case 'read_supplier_quality': {
        const intelligence = await this.deps.qualityAssuranceService.getSupplierIntelligence(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${intelligence.totalDefectCount} supplier defect(s), ${intelligence.recurringDefectCount} recurring.`,
          data: intelligence,
        };
      }
      case 'read_customer_communications': {
        const customerId = pageContext?.customerId;
        const timeline = await this.deps.communicationsIntelligenceService.buildTimeline(
          scope.companyId,
          {
            customerId,
            limit: 30,
          },
        );
        return {
          toolKey,
          success: true,
          summary: `${timeline.length} communication event(s)${customerId ? ' for customer' : ''}.`,
          data: { timeline },
        };
      }
      case 'read_conversation_summary': {
        const insights = await this.deps.communicationsIntelligenceService.listConversationInsights(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${insights.length} conversation insight(s) on file.`,
          data: { insights: insights.slice(0, 10) },
        };
      }
      case 'read_whatsapp_history': {
        const messages = await this.deps.whatsappService.listMessages(
          scope.companyId,
          pageContext?.customerId ? { customerId: pageContext.customerId } : undefined,
        );
        return {
          toolKey,
          success: true,
          summary: `${messages.length} WhatsApp message(s).`,
          data: { messages: messages.slice(0, 20) },
        };
      }
      case 'read_email_threads': {
        const threads = await this.deps.communicationsIntelligenceService.listEmailThreads(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${threads.length} email thread(s).`,
          data: { threads: threads.slice(0, 20) },
        };
      }
      case 'read_sms_history': {
        const records = await this.deps.communicationsIntelligenceService.listSmsRecords(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${records.length} SMS record(s).`,
          data: { records: records.slice(0, 20) },
        };
      }
      case 'read_asset_register': {
        const assets = await this.deps.assetEquipmentIntelligenceService.listAssets(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${assets.length} asset(s) in register.`,
          data: { assets: assets.slice(0, 20) },
        };
      }
      case 'read_asset_history': {
        const history = await this.deps.assetEquipmentIntelligenceService.listLifecycleHistory(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${history.length} lifecycle event(s).`,
          data: { history: history.slice(0, 20) },
        };
      }
      case 'read_maintenance_schedule': {
        const schedules =
          await this.deps.assetEquipmentIntelligenceService.listMaintenanceSchedules(
            scope.companyId,
          );
        return {
          toolKey,
          success: true,
          summary: `${schedules.length} maintenance schedule(s).`,
          data: { schedules: schedules.slice(0, 20) },
        };
      }
      case 'read_asset_performance': {
        const analytics = await this.deps.assetEquipmentIntelligenceService.getPerformanceAnalytics(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${analytics.totalAssets} asset(s), ${analytics.totalMaintenanceCostCents} maintenance cost (cents).`,
          data: analytics,
        };
      }
      case 'read_inspection_history': {
        const inspections = await this.deps.assetEquipmentIntelligenceService.listInspections(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${inspections.length} inspection record(s).`,
          data: { inspections: inspections.slice(0, 20) },
        };
      }
      case 'read_calibration_status': {
        const calibrations = await this.deps.assetEquipmentIntelligenceService.listCalibrations(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${calibrations.length} calibration record(s).`,
          data: { calibrations: calibrations.slice(0, 20) },
        };
      }
      case 'read_ai_provider_status': {
        const providers = await this.deps.aiOrchestrationService.listProviders(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${providers.length} provider(s), ${providers.filter((item) => item.healthStatus === 'healthy').length} healthy.`,
          data: { providers: providers.slice(0, 20) },
        };
      }
      case 'read_ai_capabilities': {
        const models = await this.deps.aiOrchestrationService.listModels(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${models.length} model(s) with capability metadata.`,
          data: { models: models.slice(0, 20) },
        };
      }
      case 'read_ai_costs': {
        const costAnalytics = await this.deps.aiOrchestrationService.getCostAnalytics(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${costAnalytics.totalTokens} tokens, ${costAnalytics.totalCostCents} cost (cents).`,
          data: costAnalytics,
        };
      }
      case 'read_ai_quality': {
        const qualityAnalytics = await this.deps.aiOrchestrationService.getQualityAnalytics(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${qualityAnalytics.evaluationCount} evaluation(s) recorded.`,
          data: qualityAnalytics,
        };
      }
      case 'read_ai_routing': {
        const [rules, statistics] = await Promise.all([
          this.deps.aiOrchestrationService.listRoutingRules(scope.companyId),
          this.deps.aiOrchestrationService.getRoutingStatistics(scope.companyId),
        ]);
        return {
          toolKey,
          success: true,
          summary: `${rules.length} routing rule(s), ${statistics.failoverEventCount} failover event(s).`,
          data: { rules: rules.slice(0, 20), statistics },
        };
      }
      case 'read_prompt_versions': {
        const versions = await this.deps.aiOrchestrationService.listPromptVersions(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${versions.length} prompt version(s).`,
          data: { versions: versions.slice(0, 20) },
        };
      }
      case 'read_dispatch_dashboard': {
        const dashboard = await this.deps.dispatchIntelligenceService.getOperationsDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard,
        };
      }
      case 'read_call_queue': {
        const callQueue = await this.deps.dispatchIntelligenceService.getCallQueueAnalytics(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${callQueue.liveQueueCount} live queue item(s), ${callQueue.callbackQueueCount} callback(s).`,
          data: callQueue,
        };
      }
      case 'read_technician_matching': {
        const matches = await this.deps.dispatchIntelligenceService.getTechnicianMatching(
          scope.companyId,
          pageContext?.jobId,
        );
        return {
          toolKey,
          success: true,
          summary: `${matches.length} technician match recommendation(s).`,
          data: { matches: matches.slice(0, 20) },
        };
      }
      case 'read_dispatch_recommendations': {
        const recommendations = await this.deps.dispatchIntelligenceService.listRecommendations(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${recommendations.length} dispatch recommendation(s).`,
          data: { recommendations: recommendations.slice(0, 20) },
        };
      }
      case 'read_callback_queue': {
        const callbacks = await this.deps.dispatchIntelligenceService.listCallbackRequests(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${callbacks.length} callback request(s).`,
          data: { callbacks: callbacks.slice(0, 20) },
        };
      }
      case 'read_emergency_dispatch': {
        const assessments = await this.deps.dispatchIntelligenceService.listEmergencyAssessments(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${assessments.length} emergency assessment(s).`,
          data: { assessments: assessments.slice(0, 20) },
        };
      }
      case 'read_fleet_dashboard': {
        const dashboard = await this.deps.fleetIntelligenceService.getExecutiveDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard,
        };
      }
      case 'read_trip_history': {
        const trips = await this.deps.fleetIntelligenceService.getTripHistory(
          scope.companyId,
          pageContext?.vehicleId,
        );
        return {
          toolKey,
          success: true,
          summary: `${trips.length} GPS-derived trip(s).`,
          data: { trips: trips.slice(0, 20) },
        };
      }
      case 'read_monthly_trip_report': {
        const reports = await this.deps.fleetIntelligenceService.listMonthlyReports(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${reports.length} monthly report(s).`,
          data: { reports: reports.slice(0, 12) },
        };
      }
      case 'read_driver_behaviour': {
        const events = await this.deps.fleetIntelligenceService.listDriverBehaviourEvents(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${events.length} driver behaviour event(s).`,
          data: { events: events.slice(0, 50) },
        };
      }
      case 'read_vehicle_utilization': {
        const utilization = await this.deps.fleetIntelligenceService.getVehicleUtilization(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${utilization.length} vehicle utilization record(s).`,
          data: { utilization },
        };
      }
      case 'read_fleet_costs': {
        const [costs, analytics] = await Promise.all([
          this.deps.fleetIntelligenceService.listOperatingCosts(scope.companyId),
          this.deps.fleetIntelligenceService.getCostAnalytics(scope.companyId),
        ]);
        return {
          toolKey,
          success: true,
          summary: `${costs.length} cost record(s), ${analytics.totalOperatingCostCents} total (cents).`,
          data: { costs: costs.slice(0, 20), analytics },
        };
      }
      case 'read_personal_communications_dashboard': {
        const dashboard =
          await this.deps.personalCommunicationsIntelligenceService.getExecutiveDashboard(
            scope.companyId,
          );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard,
        };
      }
      case 'read_business_conversations': {
        const conversations =
          await this.deps.personalCommunicationsIntelligenceService.listBusinessConversations(
            scope.companyId,
          );
        return {
          toolKey,
          success: true,
          summary: `${conversations.length} business conversation(s).`,
          data: { conversations: conversations.slice(0, 20) },
        };
      }
      case 'read_voice_note_summary': {
        const analyses =
          await this.deps.personalCommunicationsIntelligenceService.listVoiceAnalyses(
            scope.companyId,
          );
        return {
          toolKey,
          success: true,
          summary: `${analyses.length} voice note analysis record(s).`,
          data: { analyses: analyses.slice(0, 20) },
        };
      }
      case 'read_media_analysis': {
        const [mediaAnalyses, documentAnalyses] = await Promise.all([
          this.deps.personalCommunicationsIntelligenceService.listMediaAnalyses(scope.companyId),
          this.deps.personalCommunicationsIntelligenceService.listDocumentAnalyses(scope.companyId),
        ]);
        return {
          toolKey,
          success: true,
          summary: `${mediaAnalyses.length} media and ${documentAnalyses.length} document analysis record(s).`,
          data: {
            mediaAnalyses: mediaAnalyses.slice(0, 20),
            documentAnalyses: documentAnalyses.slice(0, 20),
          },
        };
      }
      case 'read_follow_up_queue': {
        const followUps =
          await this.deps.personalCommunicationsIntelligenceService.listFollowUpQueue(
            scope.companyId,
          );
        return {
          toolKey,
          success: true,
          summary: `${followUps.length} follow-up item(s).`,
          data: { followUps: followUps.slice(0, 20) },
        };
      }
      case 'read_communication_classification': {
        const conversations =
          await this.deps.personalCommunicationsIntelligenceService.listBusinessConversations(
            scope.companyId,
          );
        return {
          toolKey,
          success: true,
          summary: `${conversations.length} classified conversation(s).`,
          data: {
            classifications: conversations.slice(0, 30).map((row) => ({
              conversationId: row.id,
              classification: row.classification,
              confidence: row.classificationConfidence,
              customerName: row.customerName,
            })),
          },
        };
      }
      case 'read_security_dashboard': {
        const dashboard = await this.deps.enterpriseSecurityService.getExecutiveDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard,
        };
      }
      case 'read_audit_logs': {
        const auditLogs = await this.deps.enterpriseSecurityService.listAuditLogs(
          scope.companyId,
          50,
        );
        return {
          toolKey,
          success: true,
          summary: `${auditLogs.length} audit log event(s).`,
          data: { auditLogs },
        };
      }
      case 'read_active_sessions': {
        const sessions = await this.deps.enterpriseSecurityService.listActiveSessions(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${sessions.length} active session(s).`,
          data: { sessions: sessions.slice(0, 30) },
        };
      }
      case 'read_risk_alerts': {
        const riskAlerts = await this.deps.enterpriseSecurityService.listRiskAlerts(
          scope.companyId,
          false,
        );
        return {
          toolKey,
          success: true,
          summary: `${riskAlerts.length} unresolved risk alert(s).`,
          data: { riskAlerts },
        };
      }
      case 'read_login_events': {
        const loginEvents = await this.deps.enterpriseSecurityService.listLoginEvents(
          scope.companyId,
          50,
        );
        return {
          toolKey,
          success: true,
          summary: `${loginEvents.length} login event(s).`,
          data: { loginEvents },
        };
      }
      case 'read_integration_platform_dashboard': {
        const dashboard = await this.deps.integrationPlatformService.getExecutiveDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard,
        };
      }
      case 'read_integration_connectors': {
        const connectors = await this.deps.connectorEngineService.listConnectors(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${connectors.length} connector(s), ${connectors.filter((row) => row.status === 'connected').length} connected.`,
          data: { connectors },
        };
      }
      case 'read_enterprise_analytics_dashboard': {
        const dashboard = await this.deps.enterpriseAnalyticsService.getExecutiveDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard,
        };
      }
      case 'read_data_warehouse': {
        const warehouse = await this.deps.enterpriseAnalyticsService.getWarehouseSummary(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${warehouse.modules.length} module(s), ${warehouse.snapshots.length} snapshot(s), ${warehouse.lineage.length} lineage record(s).`,
          data: warehouse,
        };
      }
      case 'read_analytics_governance': {
        const governance = await this.deps.enterpriseAnalyticsService.getGovernanceSummary(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${governance.datasetPermissions.length} dataset permission(s), ${governance.retentionPolicies.length} retention policy(ies).`,
          data: governance,
        };
      }
      case 'read_automation_studio_dashboard': {
        const dashboard = await this.deps.enterpriseAutomationStudioService.getExecutiveDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard,
        };
      }
      case 'read_automation_monitoring': {
        const monitoring = await this.deps.enterpriseAutomationStudioService.getMonitoringSummary(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${monitoring.runningCount} running, ${monitoring.failedCount} failed, queue depth ${monitoring.queueDepth}.`,
          data: monitoring,
        };
      }
      case 'read_digital_twin_dashboard': {
        const dashboard = await this.deps.enterpriseDigitalTwinService.getExecutiveDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard,
        };
      }
      case 'read_operational_state': {
        const operationalState = await this.deps.enterpriseDigitalTwinService.buildOperationalState(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `Live operational state captured at ${operationalState.capturedAt}.`,
          data: { operationalState },
        };
      }
      case 'read_scenario_comparisons': {
        const comparisons = await this.deps.enterpriseDigitalTwinService.listComparisons(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${comparisons.length} scenario comparison(s) available.`,
          data: { comparisons },
        };
      }
      case 'read_knowledge_graph_dashboard': {
        const dashboard = await this.deps.enterpriseKnowledgeGraphService.getExecutiveDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard,
        };
      }
      case 'search_organizational_memory': {
        const query = String(pageContext?.knowledgeQuery ?? '').trim();
        if (!query) {
          return {
            toolKey,
            success: true,
            summary:
              'Organizational memory indexed — provide knowledgeQuery in page context for targeted search.',
            data: { results: [] },
          };
        }
        const results = await this.deps.enterpriseKnowledgeGraphService.semanticSearch(
          scope,
          { query, mode: 'hybrid' },
          userPermissions,
        );
        return {
          toolKey,
          success: true,
          summary: `${results.length} result(s) for "${query}".`,
          data: { results },
        };
      }
      case 'read_knowledge_relationships': {
        const relationships = await this.deps.enterpriseKnowledgeGraphService.listRelationships(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${relationships.length} knowledge graph relationship(s).`,
          data: { relationships },
        };
      }
      case 'read_mission_control_dashboard': {
        const dashboard =
          await this.deps.enterpriseMissionControlService.getMissionControlDashboard(
            scope.companyId,
          );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard,
        };
      }
      case 'read_mission_control_alerts': {
        const alerts = await this.deps.enterpriseMissionControlService.listAlerts(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${alerts.length} mission control alert(s).`,
          data: { alerts },
        };
      }
      case 'read_mission_control_incidents': {
        const incidents = await this.deps.enterpriseMissionControlService.listIncidents(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${incidents.length} incident(s) on record.`,
          data: { incidents },
        };
      }
      case 'read_evolution_dashboard': {
        const dashboard = await this.deps.enterpriseEvolutionService.getEvolutionDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard,
        };
      }
      case 'read_evolution_patterns': {
        const patterns = await this.deps.enterpriseEvolutionService.listPatterns(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${patterns.length} pattern(s) detected.`,
          data: { patterns },
        };
      }
      case 'read_evolution_recommendations': {
        const recommendations = await this.deps.enterpriseEvolutionService.listRecommendations(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${recommendations.length} optimization recommendation(s).`,
          data: { recommendations },
        };
      }
      case 'read_evolution_learning': {
        const events = await this.deps.enterpriseEvolutionService.listLearningEvents(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${events.length} learning event(s) recorded.`,
          data: { events },
        };
      }
      case 'read_developer_platform_dashboard': {
        const dashboard = await this.deps.enterpriseDeveloperPlatformService.getDeveloperDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard,
        };
      }
      case 'read_saas_platform_dashboard': {
        const dashboard = await this.deps.enterpriseSaasPlatformService.getPlatformDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard,
        };
      }
      case 'read_saas_tenant_usage': {
        const dashboard = await this.deps.enterpriseSaasPlatformService.getPlatformDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `Usage: ${dashboard.usage.userCount} user(s), ${dashboard.usage.integrationCount} integration(s).`,
          data: { usage: dashboard.usage },
        };
      }
      case 'read_saas_subscription': {
        const dashboard = await this.deps.enterpriseSaasPlatformService.getPlatformDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.subscription
            ? `Subscription ${dashboard.subscription.status}${dashboard.subscription.plan ? ` on ${dashboard.subscription.plan.name}` : ''}.`
            : 'No subscription on record.',
          data: { subscription: dashboard.subscription },
        };
      }
      case 'read_production_readiness_dashboard': {
        const dashboard = await this.deps.enterpriseProductionReadinessService.getDashboard(
          scope.companyId,
        );
        return { toolKey, success: true, summary: dashboard.summary, data: dashboard };
      }
      case 'read_production_health': {
        const dashboard = await this.deps.enterpriseProductionReadinessService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.systemHealth.length} module(s), overall ${dashboard.overallHealthStatus}.`,
          data: {
            systemHealth: dashboard.systemHealth,
            overallHealthStatus: dashboard.overallHealthStatus,
          },
        };
      }
      case 'read_production_performance': {
        const dashboard = await this.deps.enterpriseProductionReadinessService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.performance
            ? `Queue depth ${dashboard.performance.queueDepth}, memory ${dashboard.performance.memoryUsageMb ?? '—'} MB.`
            : 'No performance snapshot captured yet.',
          data: { performance: dashboard.performance },
        };
      }
      case 'read_production_ai_providers': {
        const dashboard = await this.deps.enterpriseProductionReadinessService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.aiProviders.length} AI provider(s) monitored.`,
          data: { aiProviders: dashboard.aiProviders },
        };
      }
      case 'read_production_readiness_checks': {
        const dashboard = await this.deps.enterpriseProductionReadinessService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.latestReadinessRun
            ? `Readiness ${dashboard.latestReadinessRun.overallStatus} — ${dashboard.latestReadinessRun.checks.length} check(s).`
            : 'No readiness checks executed yet.',
          data: { readinessRun: dashboard.latestReadinessRun },
        };
      }
      case 'read_production_backups': {
        const dashboard = await this.deps.enterpriseProductionReadinessService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.backupPolicies.length} policy/policies, ${dashboard.recentBackupRuns.length} recent run(s).`,
          data: {
            backupPolicies: dashboard.backupPolicies,
            recentBackupRuns: dashboard.recentBackupRuns,
            recovery: dashboard.recovery,
          },
        };
      }
      case 'read_mobile_platform_dashboard': {
        const dashboard = await this.deps.enterpriseMobilePlatformService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard as unknown as Record<string, unknown>,
        };
      }
      case 'read_mobile_devices': {
        const dashboard = await this.deps.enterpriseMobilePlatformService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.devices.length} registered device(s), ${dashboard.activeDeviceCount} active.`,
          data: { devices: dashboard.devices },
        };
      }
      case 'read_mobile_sync_health': {
        const dashboard = await this.deps.enterpriseMobilePlatformService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.pendingSyncQueueCount} pending sync item(s), ${dashboard.pendingConflictCount} conflict(s).`,
          data: {
            pendingSyncQueueCount: dashboard.pendingSyncQueueCount,
            pendingConflictCount: dashboard.pendingConflictCount,
            syncHistory: dashboard.syncHistory,
          },
        };
      }
      case 'read_mobile_field_intelligence': {
        const dashboard = await this.deps.enterpriseMobilePlatformService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.fieldIntelligence
            ? `Field intelligence captured ${dashboard.fieldIntelligence.capturedAt}`
            : 'No field intelligence snapshot — capture one from the mobile platform dashboard.',
          data: { fieldIntelligence: dashboard.fieldIntelligence },
        };
      }
      case 'read_mobile_fleet_providers': {
        const dashboard = await this.deps.enterpriseMobilePlatformService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.fleetProviders.length} fleet provider(s), Cartrack ${dashboard.cartrackConnected ? 'connected' : 'not connected'}.`,
          data: {
            fleetProviders: dashboard.fleetProviders,
            cartrackConnected: dashboard.cartrackConnected,
          },
        };
      }
      case 'read_unified_communications_dashboard': {
        const dashboard = await this.deps.enterpriseUnifiedCommunicationsService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard as unknown as Record<string, unknown>,
        };
      }
      case 'read_communication_timeline': {
        const dashboard = await this.deps.enterpriseUnifiedCommunicationsService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.recentTimeline.length} timeline entry/entries.`,
          data: {
            timeline: dashboard.recentTimeline,
            intelligenceTimeline: dashboard.intelligence.recentTimeline,
          },
        };
      }
      case 'read_voice_receptionist_status': {
        const dashboard = await this.deps.enterpriseUnifiedCommunicationsService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.voiceReceptionist.totalSessionCount} session(s), ${dashboard.voiceReceptionist.missedCallCount} missed.`,
          data: { voiceReceptionist: dashboard.voiceReceptionist },
        };
      }
      case 'read_communication_providers': {
        const dashboard = await this.deps.enterpriseUnifiedCommunicationsService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.providerAdapters.length} provider adapter(s), ${dashboard.activeProviderCount} active.`,
          data: {
            providerAdapters: dashboard.providerAdapters,
            whatsappConnected: dashboard.whatsappConnected,
          },
        };
      }
      case 'read_customer_experience_dashboard': {
        const dashboard = await this.deps.enterpriseCustomerExperienceService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard as unknown as Record<string, unknown>,
        };
      }
      case 'read_portal_customer_context': {
        const customerId = pageContext?.customerId;
        if (!customerId) {
          return {
            toolKey,
            success: false,
            summary: 'No customer selected — provide customerId in page context.',
            data: {},
          };
        }
        const context = await this.deps.portalExperienceService.buildStaffCustomerAuraContext({
          companyId: scope.companyId,
          customerId,
        });
        return {
          toolKey,
          success: true,
          summary: `Portal context for ${context.customerName}`,
          data: context as unknown as Record<string, unknown>,
        };
      }
      case 'read_customer_bookings': {
        const bookings = await this.deps.enterpriseCustomerExperienceService.listBookings(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${bookings.length} booking request(s).`,
          data: { bookings },
        };
      }
      case 'read_customer_reviews': {
        const reviews = await this.deps.enterpriseCustomerExperienceService.listReviews(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${reviews.length} review(s) and feedback submission(s).`,
          data: { reviews },
        };
      }
      case 'read_technician_tracking': {
        const jobId = pageContext?.jobId;
        if (!jobId) {
          return {
            toolKey,
            success: false,
            summary: 'No job selected — provide jobId in page context.',
            data: {},
          };
        }
        const dashboard = await this.deps.enterpriseCustomerExperienceService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `Tracking ${dashboard.trackingEnabled ? 'enabled' : 'disabled'}, fleet ${dashboard.cartrackConnected ? 'connected' : 'not connected'}.`,
          data: {
            trackingEnabled: dashboard.trackingEnabled,
            cartrackConnected: dashboard.cartrackConnected,
            jobId,
          },
        };
      }
      case 'read_asset_lifecycle_dashboard': {
        const dashboard = await this.deps.enterpriseAssetLifecycleService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard as unknown as Record<string, unknown>,
        };
      }
      case 'read_asset_registry': {
        const dashboard = await this.deps.enterpriseAssetLifecycleService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.assetCount} asset(s), ${dashboard.registryProfileCount} registry profile(s).`,
          data: { recentAssets: dashboard.recentAssets },
        };
      }
      case 'read_iot_telemetry': {
        const monitoring = await this.deps.enterpriseAssetLifecycleService.getIotMonitoring(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${monitoring.deviceCount} device(s), ${monitoring.recentReadings.length} recent reading(s).`,
          data: monitoring as unknown as Record<string, unknown>,
        };
      }
      case 'read_asset_alerts': {
        const dashboard = await this.deps.enterpriseAssetLifecycleService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.openAlertCount} open alert(s).`,
          data: { recentAlerts: dashboard.recentAlerts },
        };
      }
      case 'read_maintenance_schedules': {
        const dashboard = await this.deps.enterpriseAssetLifecycleService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.maintenanceDueCount} maintenance due record(s).`,
          data: { maintenanceDue: dashboard.maintenanceDue },
        };
      }
      case 'read_predictive_assessments': {
        const dashboard = await this.deps.enterpriseAssetLifecycleService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.predictiveAssessmentCount} predictive assessment(s).`,
          data: { predictiveAssessments: dashboard.predictiveAssessments },
        };
      }
      case 'read_workforce_dashboard': {
        const dashboard = await this.deps.enterpriseWorkforceIntelligenceService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard as unknown as Record<string, unknown>,
        };
      }
      case 'read_workforce_registry': {
        const dashboard = await this.deps.enterpriseWorkforceIntelligenceService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.profileCount} workforce profile(s).`,
          data: { recentProfiles: dashboard.recentProfiles },
        };
      }
      case 'read_workforce_timesheets': {
        const timesheets = await this.deps.enterpriseWorkforceIntelligenceService.listTimesheets(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${timesheets.length} timesheet record(s).`,
          data: { timesheets },
        };
      }
      case 'read_workforce_leave': {
        const dashboard = await this.deps.enterpriseWorkforceIntelligenceService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.pendingLeaveCount} pending leave application(s).`,
          data: { pendingLeaveApplications: dashboard.pendingLeaveApplications },
        };
      }
      case 'read_workforce_skills': {
        const matrix = await this.deps.enterpriseWorkforceIntelligenceService.getSkillsMatrix(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${matrix.length} skills matrix entr(ies).`,
          data: { matrix },
        };
      }
      case 'read_technician_performance': {
        const performance =
          await this.deps.enterpriseWorkforceIntelligenceService.listTechnicianPerformance(
            scope.companyId,
          );
        return {
          toolKey,
          success: true,
          summary: `${performance.length} performance snapshot(s).`,
          data: { performance },
        };
      }
      case 'read_workforce_capacity': {
        const capacity = await this.deps.enterpriseWorkforceIntelligenceService.getCapacitySummary(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${capacity.activeTechnicianCount} active technician(s), ${capacity.scheduledJobCount} scheduled job(s).`,
          data: capacity as unknown as Record<string, unknown>,
        };
      }
      case 'read_payroll_preparation': {
        const preparations =
          await this.deps.enterpriseWorkforceIntelligenceService.listPayrollPreparations(
            scope.companyId,
          );
        return {
          toolKey,
          success: true,
          summary: `${preparations.length} payroll preparation batch(es).`,
          data: { preparations },
        };
      }
      case 'read_legal_compliance_dashboard': {
        const dashboard = await this.deps.enterpriseLegalComplianceService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard as unknown as Record<string, unknown>,
        };
      }
      case 'read_legal_contracts': {
        const contracts = await this.deps.enterpriseLegalComplianceService.listContracts(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${contracts.length} contract record(s).`,
          data: { contracts },
        };
      }
      case 'read_legal_obligations': {
        const obligations = await this.deps.enterpriseLegalComplianceService.listObligations(
          scope.companyId,
        );
        const overdue = obligations.filter((item) => item.isOverdue).length;
        return {
          toolKey,
          success: true,
          summary: `${obligations.length} obligation(s), ${overdue} overdue.`,
          data: { obligations },
        };
      }
      case 'read_legal_risks': {
        const risks = await this.deps.enterpriseLegalComplianceService.listRisks(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${risks.length} risk record(s).`,
          data: { risks },
        };
      }
      case 'read_legal_controls': {
        const controls = await this.deps.enterpriseLegalComplianceService.listControls(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${controls.length} control record(s).`,
          data: { controls },
        };
      }
      case 'read_legal_policies': {
        const policies = await this.deps.enterpriseLegalComplianceService.listPolicies(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${policies.length} policy record(s).`,
          data: { policies },
        };
      }
      case 'read_legal_matters': {
        const matters = await this.deps.enterpriseLegalComplianceService.listLegalMatters(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${matters.length} legal matter(s).`,
          data: { matters },
        };
      }
      case 'read_compliance_monitoring': {
        const monitoring = await this.deps.enterpriseLegalComplianceService.getComplianceMonitoring(
          scope.companyId,
        );
        const summary =
          monitoring.alerts.length > 0
            ? monitoring.alerts.join(' · ')
            : 'No compliance alerts from real tenant data.';
        return {
          toolKey,
          success: true,
          summary,
          data: monitoring as unknown as Record<string, unknown>,
        };
      }
      case 'read_financial_planning_dashboard': {
        const dashboard = await this.deps.enterpriseFinancialPlanningService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard as unknown as Record<string, unknown>,
        };
      }
      case 'read_fp_budgets': {
        const budgets = await this.deps.enterpriseFinancialPlanningService.listBudgets(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${budgets.length} budget record(s).`,
          data: { budgets },
        };
      }
      case 'read_fp_forecasts': {
        const forecasts = await this.deps.enterpriseFinancialPlanningService.listForecasts(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${forecasts.length} forecast record(s).`,
          data: { forecasts },
        };
      }
      case 'read_fp_cash_flow': {
        const projections =
          await this.deps.enterpriseFinancialPlanningService.listCashFlowProjections(
            scope.companyId,
          );
        const dashboard = await this.deps.enterpriseFinancialPlanningService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `Cash position ${(dashboard.cashPositionCents / 100).toFixed(2)} ${dashboard.currency}, ${projections.length} projection(s).`,
          data: { cashPositionCents: dashboard.cashPositionCents, projections },
        };
      }
      case 'read_fp_receivables': {
        const receivables =
          await this.deps.enterpriseFinancialPlanningService.getReceivablesIntelligence(
            scope.companyId,
          );
        return {
          toolKey,
          success: true,
          summary: receivables.summary,
          data: receivables as unknown as Record<string, unknown>,
        };
      }
      case 'read_fp_payables': {
        const payables = await this.deps.enterpriseFinancialPlanningService.getPayablesIntelligence(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: payables.summary,
          data: payables as unknown as Record<string, unknown>,
        };
      }
      case 'read_fp_treasury': {
        const accounts = await this.deps.enterpriseFinancialPlanningService.listTreasuryAccounts(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${accounts.length} treasury account(s).`,
          data: { accounts },
        };
      }
      case 'read_fp_profitability': {
        const snapshots =
          await this.deps.enterpriseFinancialPlanningService.listProfitabilitySnapshots(
            scope.companyId,
          );
        return {
          toolKey,
          success: true,
          summary: `${snapshots.length} profitability snapshot(s).`,
          data: { snapshots },
        };
      }
      case 'read_fp_working_capital': {
        const workingCapital =
          await this.deps.enterpriseFinancialPlanningService.getWorkingCapitalSummary(
            scope.companyId,
          );
        return {
          toolKey,
          success: true,
          summary: workingCapital.summary,
          data: workingCapital as unknown as Record<string, unknown>,
        };
      }
      case 'read_fp_scenarios': {
        const scenarios = await this.deps.enterpriseFinancialPlanningService.listScenarios(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${scenarios.length} scenario(s), all marked as simulations when applicable.`,
          data: { scenarios },
        };
      }
      case 'read_fp_alerts': {
        const alerts = await this.deps.enterpriseFinancialPlanningService.listFinancialAlerts(
          scope.companyId,
        );
        const openAlerts = alerts.filter((alert) => alert.status === 'open');
        return {
          toolKey,
          success: true,
          summary: `${openAlerts.length} open financial alert(s).`,
          data: { alerts },
        };
      }
      case 'read_sales_intelligence_dashboard': {
        const dashboard = await this.deps.enterpriseSalesIntelligenceService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard as unknown as Record<string, unknown>,
        };
      }
      case 'read_si_leads': {
        const leads = await this.deps.leadsService.listLeads(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${leads.length} lead record(s).`,
          data: { leads },
        };
      }
      case 'read_si_opportunities': {
        const opportunities = await this.deps.salesService.listOpportunities(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${opportunities.length} opportunity record(s).`,
          data: { opportunities },
        };
      }
      case 'read_si_accounts': {
        const accounts = await this.deps.enterpriseSalesIntelligenceService.listAccounts(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${accounts.length} account record(s).`,
          data: { accounts },
        };
      }
      case 'read_si_pipeline': {
        const metrics = await this.deps.salesService.getPipelineMetrics(scope.companyId);
        const openCount = metrics.stages.reduce((sum, stage) => sum + stage.opportunityCount, 0);
        return {
          toolKey,
          success: true,
          summary: `Pipeline value ${(metrics.totalOpenValueCents / 100).toFixed(2)}, ${openCount} open opportunity(ies).`,
          data: metrics as unknown as Record<string, unknown>,
        };
      }
      case 'read_si_forecasts': {
        const forecasts = await this.deps.enterpriseSalesIntelligenceService.listForecasts(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${forecasts.length} forecast record(s).`,
          data: { forecasts },
        };
      }
      case 'read_si_targets': {
        const targets = await this.deps.enterpriseSalesIntelligenceService.listSalesTargets(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${targets.length} sales target(s).`,
          data: { targets },
        };
      }
      case 'read_si_renewals': {
        const renewals = await this.deps.enterpriseSalesIntelligenceService.listRenewals(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${renewals.length} renewal record(s).`,
          data: { renewals },
        };
      }
      case 'read_si_customer_growth': {
        const growth =
          await this.deps.enterpriseSalesIntelligenceService.listCustomerGrowthSnapshots(
            scope.companyId,
          );
        const retention =
          await this.deps.enterpriseSalesIntelligenceService.listRetentionRiskSnapshots(
            scope.companyId,
          );
        return {
          toolKey,
          success: true,
          summary: `${growth.length} growth opportunity(ies), ${retention.length} retention risk snapshot(s).`,
          data: { growth, retention },
        };
      }
      case 'read_si_revenue_leakage': {
        const findings =
          await this.deps.enterpriseSalesIntelligenceService.listRevenueLeakageFindings(
            scope.companyId,
          );
        return {
          toolKey,
          success: true,
          summary: `${findings.length} revenue leakage finding(s).`,
          data: { findings },
        };
      }
      case 'read_si_alerts': {
        const alerts = await this.deps.enterpriseSalesIntelligenceService.listSalesAlerts(
          scope.companyId,
        );
        const openAlerts = alerts.filter((alert) => alert.status === 'open');
        return {
          toolKey,
          success: true,
          summary: `${openAlerts.length} open sales alert(s).`,
          data: { alerts },
        };
      }
      case 'read_marketing_intelligence_dashboard': {
        const dashboard = await this.deps.enterpriseMarketingIntelligenceService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard as unknown as Record<string, unknown>,
        };
      }
      case 'read_mi_strategies': {
        const strategies = await this.deps.enterpriseMarketingIntelligenceService.listStrategies(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${strategies.length} marketing strateg(ies).`,
          data: { strategies },
        };
      }
      case 'read_mi_campaigns': {
        const campaigns = await this.deps.enterpriseMarketingIntelligenceService.listCampaignPlans(
          scope.companyId,
        );
        const marketingCampaigns =
          await this.deps.enterpriseMarketingIntelligenceService.listMarketingCampaigns(
            scope.companyId,
          );
        return {
          toolKey,
          success: true,
          summary: `${campaigns.length} campaign plan(s), ${marketingCampaigns.length} marketing campaign(s).`,
          data: { campaignPlans: campaigns, marketingCampaigns },
        };
      }
      case 'read_mi_audiences': {
        const audiences = await this.deps.enterpriseMarketingIntelligenceService.listAudiences(
          scope.companyId,
        );
        const segments =
          await this.deps.enterpriseMarketingIntelligenceService.listMarketingSegments(
            scope.companyId,
          );
        return {
          toolKey,
          success: true,
          summary: `${audiences.length} audience segment(s), ${segments.length} marketing segment(s).`,
          data: { audiences, segments },
        };
      }
      case 'read_mi_content': {
        const contentItems =
          await this.deps.enterpriseMarketingIntelligenceService.listContentItems(scope.companyId);
        const socialPosts = await this.deps.enterpriseMarketingIntelligenceService.listSocialPosts(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${contentItems.length} content item(s), ${socialPosts.length} social post(s).`,
          data: { contentItems, socialPosts },
        };
      }
      case 'read_mi_advertising': {
        const adAccounts = await this.deps.enterpriseMarketingIntelligenceService.listAdAccounts(
          scope.companyId,
        );
        const adCampaigns = await this.deps.enterpriseMarketingIntelligenceService.listAdCampaigns(
          scope.companyId,
        );
        const adBudgets = await this.deps.enterpriseMarketingIntelligenceService.listAdBudgets(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${adAccounts.length} ad account(s), ${adCampaigns.length} ad campaign(s), ${adBudgets.length} budget(s).`,
          data: { adAccounts, adCampaigns, adBudgets },
        };
      }
      case 'read_mi_attribution': {
        const attribution =
          await this.deps.enterpriseMarketingIntelligenceService.listAttributionRecords(
            scope.companyId,
          );
        return {
          toolKey,
          success: true,
          summary: `${attribution.length} attribution record(s).`,
          data: { attribution },
        };
      }
      case 'read_mi_roi': {
        const roiSnapshots =
          await this.deps.enterpriseMarketingIntelligenceService.listRoiSnapshots(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${roiSnapshots.length} ROI snapshot(s).`,
          data: { roiSnapshots },
        };
      }
      case 'read_mi_alerts': {
        const alerts = await this.deps.enterpriseMarketingIntelligenceService.listMarketingAlerts(
          scope.companyId,
        );
        const openAlerts = alerts.filter((alert) => alert.status === 'open');
        return {
          toolKey,
          success: true,
          summary: `${openAlerts.length} open marketing alert(s).`,
          data: { alerts },
        };
      }
      case 'read_service_delivery_dashboard': {
        const dashboard = await this.deps.enterpriseServiceDeliveryService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard as unknown as Record<string, unknown>,
        };
      }
      case 'read_sd_jobs': {
        const jobs = await this.deps.enterpriseServiceDeliveryService.listJobs(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${jobs.length} job record(s).`,
          data: { jobs },
        };
      }
      case 'read_sd_inspections': {
        const inspections = await this.deps.enterpriseServiceDeliveryService.listInspections(
          scope.companyId,
        );
        const qaInspections = await this.deps.enterpriseServiceDeliveryService.listQaInspections(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${inspections.length} inspection(s), ${qaInspections.length} QA inspection(s).`,
          data: { inspections, qaInspections },
        };
      }
      case 'read_sd_sla': {
        const frameworks = await this.deps.enterpriseServiceDeliveryService.listSlaFrameworks(
          scope.companyId,
        );
        const records = await this.deps.enterpriseServiceDeliveryService.listSlaRecords(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${frameworks.length} SLA framework(s), ${records.length} SLA record(s).`,
          data: { frameworks, records },
        };
      }
      case 'read_sd_quality': {
        const defects = await this.deps.enterpriseServiceDeliveryService.listDefects(
          scope.companyId,
        );
        const nonConformances =
          await this.deps.enterpriseServiceDeliveryService.listNonConformances(scope.companyId);
        const correctiveActions =
          await this.deps.enterpriseServiceDeliveryService.listCorrectiveActions(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${defects.length} defect(s), ${nonConformances.length} non-conformance(s), ${correctiveActions.length} corrective action(s).`,
          data: { defects, nonConformances, correctiveActions },
        };
      }
      case 'read_sd_warranty': {
        const warranties = await this.deps.enterpriseServiceDeliveryService.listWarrantyRecords(
          scope.companyId,
        );
        const claims = await this.deps.enterpriseServiceDeliveryService.listWarrantyClaimTrackings(
          scope.companyId,
        );
        const qualityClaims =
          await this.deps.enterpriseServiceDeliveryService.listQualityWarrantyClaims(
            scope.companyId,
          );
        return {
          toolKey,
          success: true,
          summary: `${warranties.length} warranty record(s), ${claims.length} claim tracking record(s), ${qualityClaims.length} quality claim(s).`,
          data: { warranties, claims, qualityClaims },
        };
      }
      case 'read_sd_callbacks': {
        const callbacks = await this.deps.enterpriseServiceDeliveryService.listCallbackRecords(
          scope.companyId,
        );
        const comebacks = await this.deps.enterpriseServiceDeliveryService.listQualityComebacks(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${callbacks.length} callback record(s), ${comebacks.length} quality comeback(s).`,
          data: { callbacks, comebacks },
        };
      }
      case 'read_sd_alerts': {
        const alerts = await this.deps.enterpriseServiceDeliveryService.listServiceAlerts(
          scope.companyId,
        );
        const openAlerts = alerts.filter((alert) => alert.status === 'open');
        return {
          toolKey,
          success: true,
          summary: `${openAlerts.length} open service delivery alert(s).`,
          data: { alerts },
        };
      }
      case 'read_it_operations_dashboard': {
        const dashboard = await this.deps.enterpriseItOperationsService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard as unknown as Record<string, unknown>,
        };
      }
      case 'read_ito_platform_health': {
        const platformHealth =
          await this.deps.enterpriseItOperationsService.getPlatformHealthMonitoring(
            scope.companyId,
          );
        return {
          toolKey,
          success: true,
          summary: `${platformHealth.overallHealthStatus} platform health with ${platformHealth.openAlertCount} open alert(s).`,
          data: platformHealth as unknown as Record<string, unknown>,
        };
      }
      case 'read_ito_incidents': {
        const incidents = await this.deps.enterpriseItOperationsService.listIncidents(
          scope.companyId,
        );
        const openIncidents = incidents.filter((incident) => incident.status !== 'resolved');
        return {
          toolKey,
          success: true,
          summary: `${openIncidents.length} open incident(s) of ${incidents.length} total.`,
          data: { incidents },
        };
      }
      case 'read_ito_bug_detections': {
        const bugDetections = await this.deps.enterpriseItOperationsService.listBugDetections(
          scope.companyId,
        );
        const openBugs = bugDetections.filter((bug) => bug.workflowStatus !== 'resolved');
        return {
          toolKey,
          success: true,
          summary: `${openBugs.length} open bug detection(s) of ${bugDetections.length} total.`,
          data: { bugDetections },
        };
      }
      case 'read_ito_alerts': {
        const alerts = await this.deps.enterpriseItOperationsService.listItAlerts(scope.companyId);
        const openAlerts = alerts.filter((alert) => alert.status === 'open');
        return {
          toolKey,
          success: true,
          summary: `${openAlerts.length} open IT alert(s).`,
          data: { alerts },
        };
      }
      case 'read_business_evolution_dashboard': {
        const dashboard = await this.deps.enterpriseBusinessEvolutionService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard as unknown as Record<string, unknown>,
        };
      }
      case 'read_bev_observations': {
        const observations = await this.deps.enterpriseBusinessEvolutionService.listObservations(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${observations.length} business observation(s) from real tenant activity.`,
          data: { observations },
        };
      }
      case 'read_bev_patterns': {
        const patterns = await this.deps.enterpriseBusinessEvolutionService.listPatterns(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${patterns.length} detected pattern(s) with supporting evidence.`,
          data: { patterns },
        };
      }
      case 'read_bev_recommendations': {
        const recommendations =
          await this.deps.enterpriseBusinessEvolutionService.listRecommendations(scope.companyId);
        const pending = recommendations.filter((rec) =>
          ['created', 'viewed', 'accepted', 'approved'].includes(rec.workflowStatus),
        );
        return {
          toolKey,
          success: true,
          summary: `${pending.length} active recommendation(s) of ${recommendations.length} total.`,
          data: { recommendations },
        };
      }
      case 'read_bev_experiments': {
        const experiments = await this.deps.enterpriseBusinessEvolutionService.listExperiments(
          scope.companyId,
        );
        const active = experiments.filter((exp) =>
          ['active', 'scheduled', 'approved'].includes(exp.workflowStatus),
        );
        return {
          toolKey,
          success: true,
          summary: `${active.length} active experiment(s) of ${experiments.length} total.`,
          data: { experiments },
        };
      }
      case 'read_bev_alerts': {
        const alerts = await this.deps.enterpriseBusinessEvolutionService.listEvolutionAlerts(
          scope.companyId,
        );
        const openAlerts = alerts.filter((alert) => alert.status === 'open');
        return {
          toolKey,
          success: true,
          summary: `${openAlerts.length} open evolution alert(s).`,
          data: { alerts },
        };
      }
      case 'read_app_builder_dashboard': {
        const dashboard = await this.deps.enterpriseAppBuilderService.getDashboard(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard as unknown as Record<string, unknown>,
        };
      }
      case 'read_ab_feature_requests': {
        const featureRequests = await this.deps.enterpriseAppBuilderService.listFeatureRequests(
          scope.companyId,
        );
        const active = featureRequests.filter(
          (request) =>
            !['deployed', 'rejected', 'rolled_back', 'cancelled'].includes(request.workflowStatus),
        );
        return {
          toolKey,
          success: true,
          summary: `${active.length} active feature request(s) of ${featureRequests.length} total.`,
          data: { featureRequests },
        };
      }
      case 'read_ab_requirements': {
        const requirements = await this.deps.enterpriseAppBuilderService.listRequirementsAnalyses(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${requirements.length} requirements analysis record(s) from real feature requests.`,
          data: { requirements },
        };
      }
      case 'read_ab_architecture_impacts': {
        const architectureImpacts =
          await this.deps.enterpriseAppBuilderService.listArchitectureImpactAnalyses(
            scope.companyId,
          );
        return {
          toolKey,
          success: true,
          summary: `${architectureImpacts.length} architecture impact analysis record(s).`,
          data: { architectureImpacts },
        };
      }
      case 'read_ab_workspaces': {
        const workspaces = await this.deps.enterpriseAppBuilderService.listDevelopmentWorkspaces(
          scope.companyId,
        );
        const active = workspaces.filter((workspace) => workspace.status === 'active');
        return {
          toolKey,
          success: true,
          summary: `${active.length} active development workspace(s) of ${workspaces.length} total.`,
          data: { workspaces },
        };
      }
      case 'read_ab_approvals': {
        const approvals = await this.deps.enterpriseAppBuilderService.listApprovalRecords(
          scope.companyId,
        );
        const pending = approvals.filter((approval) => approval.workflowStatus === 'pending');
        return {
          toolKey,
          success: true,
          summary: `${pending.length} pending approval(s) of ${approvals.length} total.`,
          data: { approvals },
        };
      }
      case 'read_ab_alerts': {
        const alerts = await this.deps.enterpriseAppBuilderService.listAppBuilderAlerts(
          scope.companyId,
        );
        const openAlerts = alerts.filter((alert) => alert.status === 'open');
        return {
          toolKey,
          success: true,
          summary: `${openAlerts.length} open app builder alert(s).`,
          data: { alerts },
        };
      }
      case 'read_industry_packs_dashboard': {
        const dashboard = await this.deps.enterpriseIndustryPackService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard as unknown as Record<string, unknown>,
        };
      }
      case 'read_ip_installed_packs': {
        const installedPacks = await this.deps.enterpriseIndustryPackService.listInstalledPacks(
          scope.companyId,
        );
        const active = installedPacks.filter((pack) => pack.status === 'installed');
        return {
          toolKey,
          success: true,
          summary: `${active.length} active installed pack(s) of ${installedPacks.length} total.`,
          data: { installedPacks },
        };
      }
      case 'read_ip_templates': {
        const templates = await this.deps.enterpriseIndustryPackService.listTemplates(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${templates.length} industry template(s) from installed packs.`,
          data: { templates },
        };
      }
      case 'read_ip_compliance_frameworks': {
        const frameworks = await this.deps.enterpriseIndustryPackService.listComplianceFrameworks(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${frameworks.length} configurable compliance framework(s).`,
          data: { frameworks },
        };
      }
      case 'read_ip_certificates': {
        const certificates = await this.deps.enterpriseIndustryPackService.listCertificates(
          scope.companyId,
        );
        const issued = certificates.filter((cert) => cert.status === 'issued');
        return {
          toolKey,
          success: true,
          summary: `${issued.length} issued certificate(s) of ${certificates.length} total.`,
          data: { certificates },
        };
      }
      case 'read_ip_equipment_catalog': {
        const equipmentCatalog = await this.deps.enterpriseIndustryPackService.listEquipmentCatalog(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${equipmentCatalog.length} equipment catalog entr${equipmentCatalog.length === 1 ? 'y' : 'ies'}.`,
          data: { equipmentCatalog },
        };
      }
      case 'read_ip_industry_alerts': {
        const alerts = await this.deps.enterpriseIndustryPackService.listIndustryAlerts(
          scope.companyId,
        );
        const openAlerts = alerts.filter((alert) => alert.status === 'open');
        return {
          toolKey,
          success: true,
          summary: `${openAlerts.length} open industry alert(s).`,
          data: { alerts },
        };
      }
      case 'read_public_developer_dashboard': {
        const dashboard = await this.deps.enterprisePublicDeveloperPlatformService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard as unknown as Record<string, unknown>,
        };
      }
      case 'read_pdp_api_scopes': {
        const apiScopes = await this.deps.enterprisePublicDeveloperPlatformService.listApiScopes();
        return {
          toolKey,
          success: true,
          summary: `${apiScopes.length} public API scope(s) available.`,
          data: { apiScopes },
        };
      }
      case 'read_pdp_webhook_events': {
        const webhookEventTypes =
          await this.deps.enterprisePublicDeveloperPlatformService.listWebhookEventTypes();
        return {
          toolKey,
          success: true,
          summary: `${webhookEventTypes.length} webhook event type(s) supported.`,
          data: { webhookEventTypes },
        };
      }
      case 'read_pdp_webhook_deliveries': {
        const webhookDeliveries =
          await this.deps.enterprisePublicDeveloperPlatformService.listWebhookDeliveryHistory(
            scope.companyId,
          );
        const failed = webhookDeliveries.filter((delivery) => delivery.status === 'failed');
        return {
          toolKey,
          success: true,
          summary: `${webhookDeliveries.length} delivery record(s), ${failed.length} failed.`,
          data: { webhookDeliveries },
        };
      }
      case 'read_pdp_sdk_packages': {
        const [sdkPackages, sdkGenerationRecords] = await Promise.all([
          this.deps.enterprisePublicDeveloperPlatformService
            .getDashboard(scope.companyId)
            .then((d) => d.sdkPackages),
          this.deps.enterprisePublicDeveloperPlatformService.listSdkGenerationRecords(
            scope.companyId,
          ),
        ]);
        return {
          toolKey,
          success: true,
          summary: `${sdkPackages.length} SDK package(s), ${sdkGenerationRecords.length} generation record(s).`,
          data: { sdkPackages, sdkGenerationRecords },
        };
      }
      case 'read_pdp_developer_alerts': {
        const alerts = await this.deps.enterprisePublicDeveloperPlatformService.listDeveloperAlerts(
          scope.companyId,
        );
        const openAlerts = alerts.filter((alert) => alert.status === 'open');
        return {
          toolKey,
          success: true,
          summary: `${openAlerts.length} open developer alert(s).`,
          data: { alerts },
        };
      }
      case 'read_sm_dashboard': {
        const dashboard = await this.deps.enterpriseSaasManagementService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard as unknown as Record<string, unknown>,
        };
      }
      case 'read_sm_plans': {
        const dashboard = await this.deps.enterpriseSaasManagementService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.plans.length} subscription plan(s).`,
          data: { plans: dashboard.plans },
        };
      }
      case 'read_sm_subscriptions': {
        const dashboard = await this.deps.enterpriseSaasManagementService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.subscriptions.length} subscription record(s), ${dashboard.activeSubscriptionCount} active.`,
          data: { subscriptions: dashboard.subscriptions, tenants: dashboard.tenants },
        };
      }
      case 'read_sm_billing': {
        const [dashboard, billingHealth] = await Promise.all([
          this.deps.enterpriseSaasManagementService.getDashboard(scope.companyId),
          this.deps.enterpriseSaasManagementService.getBillingHealth(scope.companyId),
        ]);
        return {
          toolKey,
          success: true,
          summary: `${dashboard.billingRecords.length} billing record(s), ${billingHealth.failedPaymentCount} failed payment(s).`,
          data: { billingRecords: dashboard.billingRecords, billingHealth },
        };
      }
      case 'read_sm_usage': {
        const usageMonitoring = await this.deps.enterpriseSaasManagementService.getUsageMonitoring(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${usageMonitoring.userCount} user(s), ${usageMonitoring.apiRequestCount} API call(s), ${usageMonitoring.alerts.length} usage alert(s).`,
          data: { usageMonitoring },
        };
      }
      case 'read_sm_licenses': {
        const licenses = await this.deps.enterpriseSaasManagementService.listLicenses(
          scope.companyId,
        );
        const active = licenses.filter((license) => license.status === 'active');
        return {
          toolKey,
          success: true,
          summary: `${active.length} active license(s) of ${licenses.length} total.`,
          data: { licenses },
        };
      }
      case 'read_vr_dashboard': {
        const dashboard = await this.deps.enterpriseVoiceReceptionService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard as unknown as Record<string, unknown>,
        };
      }
      case 'read_vr_call_history': {
        const dashboard = await this.deps.enterpriseVoiceReceptionService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.callHistory.length} call(s) in history.`,
          data: { callHistory: dashboard.callHistory },
        };
      }
      case 'read_vr_live_calls': {
        const dashboard = await this.deps.enterpriseVoiceReceptionService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.liveCalls.length} active call(s).`,
          data: { liveCalls: dashboard.liveCalls },
        };
      }
      case 'read_vr_schedules': {
        const scheduling = await this.deps.schedulingService.buildAuraContext(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: 'Scheduling context loaded.',
          data: { scheduling },
        };
      }
      case 'read_vr_crm_context': {
        const [crm, leads] = await Promise.all([
          this.deps.crmService.buildAuraContext(scope.companyId),
          this.deps.leadsService.buildAuraContext(scope.companyId),
        ]);
        return {
          toolKey,
          success: true,
          summary: 'CRM and lead context loaded.',
          data: { crm, leads },
        };
      }
      case 'read_vr_knowledge': {
        const knowledge =
          await this.deps.enterpriseKnowledgeGraphService.buildKnowledgeGraphAuraContext(
            scope.companyId,
          );
        return {
          toolKey,
          success: true,
          summary: 'Approved knowledge context loaded.',
          data: { knowledge },
        };
      }
      case 'read_vr_routing': {
        const dashboard = await this.deps.enterpriseVoiceReceptionService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.routingRules.length} routing rule(s), ${dashboard.emergencyRules.length} emergency rule(s).`,
          data: {
            routingRules: dashboard.routingRules,
            callQueues: dashboard.callQueues,
            extensions: dashboard.extensions,
            emergencyRules: dashboard.emergencyRules,
          },
        };
      }
      case 'read_dip_dashboard': {
        const dashboard = await this.deps.enterpriseDocumentAiService.getDashboard(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard as unknown as Record<string, unknown>,
        };
      }
      case 'read_dip_documents': {
        const dashboard = await this.deps.enterpriseDocumentAiService.getDashboard(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${dashboard.inboxDocuments.length} document(s).`,
          data: { documents: dashboard.inboxDocuments },
        };
      }
      case 'read_dip_ocr_queue': {
        const dashboard = await this.deps.enterpriseDocumentAiService.getDashboard(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${dashboard.ocrQueue.length} OCR job(s) in queue.`,
          data: { ocrQueue: dashboard.ocrQueue, processingHealth: dashboard.processingHealth },
        };
      }
      case 'read_dip_review_queue': {
        const dashboard = await this.deps.enterpriseDocumentAiService.getDashboard(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${dashboard.reviewQueue.length} review item(s).`,
          data: { reviewQueue: dashboard.reviewQueue },
        };
      }
      case 'read_dip_classifications': {
        const dashboard = await this.deps.enterpriseDocumentAiService.getDashboard(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${dashboard.classifications.length} classification(s).`,
          data: {
            classifications: dashboard.classifications,
            classificationCatalog: dashboard.classificationCatalog,
          },
        };
      }
      case 'read_dip_analytics': {
        const dashboard = await this.deps.enterpriseDocumentAiService.getDashboard(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${dashboard.searchIndexCount} indexed document(s), ${dashboard.openAlertCount} open alert(s).`,
          data: {
            analytics: dashboard.analytics,
            processingHealth: dashboard.processingHealth,
            openAlertCount: dashboard.openAlertCount,
          },
        };
      }
      case 'read_bc_dashboard': {
        const dashboard = await this.deps.enterpriseBusinessContinuityService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard as unknown as Record<string, unknown>,
        };
      }
      case 'read_bc_backup_status': {
        const dashboard = await this.deps.enterpriseBusinessContinuityService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.backupPolicies.length} backup polic${dashboard.backupPolicies.length === 1 ? 'y' : 'ies'}, ${dashboard.backupJobs.length} job(s), ${dashboard.continuityHealth.failedBackupCount} failed.`,
          data: {
            backupPolicies: dashboard.backupPolicies,
            backupJobs: dashboard.backupJobs,
            continuityHealth: dashboard.continuityHealth,
          },
        };
      }
      case 'read_bc_restore_history': {
        const dashboard = await this.deps.enterpriseBusinessContinuityService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.restoreRequests.length} restore request(s).`,
          data: { restoreRequests: dashboard.restoreRequests },
        };
      }
      case 'read_bc_recovery_plans': {
        const dashboard = await this.deps.enterpriseBusinessContinuityService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.recoveryPlans.length} recovery plan(s).`,
          data: { recoveryPlans: dashboard.recoveryPlans },
        };
      }
      case 'read_bc_verification_reports': {
        const dashboard = await this.deps.enterpriseBusinessContinuityService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.verificationRecords.length} verification record(s), ${dashboard.continuityHealth.verificationFailureCount} failure(s).`,
          data: { verificationRecords: dashboard.verificationRecords },
        };
      }
      case 'read_bc_analytics': {
        const dashboard = await this.deps.enterpriseBusinessContinuityService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `Backup success ${dashboard.continuityHealth.backupSuccessRatePercent ?? '—'}%, ${dashboard.openAlertCount} open alert(s).`,
          data: {
            analytics: dashboard.analytics,
            continuityHealth: dashboard.continuityHealth,
            openAlertCount: dashboard.openAlertCount,
          },
        };
      }
      case 'read_gs_dashboard': {
        const dashboard = await this.deps.enterpriseGlobalSearchService.getDashboard(
          scope.companyId,
          scope.userId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard as unknown as Record<string, unknown>,
        };
      }
      case 'read_gs_search_index': {
        const dashboard = await this.deps.enterpriseGlobalSearchService.getDashboard(
          scope.companyId,
          scope.userId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.searchHealth.indexedCount} indexed, ${dashboard.searchHealth.failedIndexCount} failed, ${dashboard.searchHealth.pendingIndexCount} pending.`,
          data: { searchHealth: dashboard.searchHealth },
        };
      }
      case 'read_gs_timeline': {
        if (pageContext?.customerId) {
          const timeline = await this.deps.enterpriseGlobalSearchService.getTimeline(scope, {
            entityType: 'customer',
            entityId: pageContext.customerId,
            limit: 50,
          });
          return {
            toolKey,
            success: true,
            summary: `${timeline.length} timeline event(s) for customer.`,
            data: { timeline },
          };
        }
        const dashboard = await this.deps.enterpriseGlobalSearchService.getDashboard(
          scope.companyId,
          scope.userId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.timelinePreview.length} recent timeline event(s).`,
          data: { timelinePreview: dashboard.timelinePreview },
        };
      }
      case 'read_gs_activity_feed': {
        const activityFeed = await this.deps.enterpriseGlobalSearchService.getActivityFeed(scope, {
          feedScope: 'company',
          limit: 50,
        });
        return {
          toolKey,
          success: true,
          summary: `${activityFeed.length} activity feed item(s).`,
          data: { activityFeed },
        };
      }
      case 'read_gs_relationships': {
        if (pageContext?.customerId) {
          const relationships = await this.deps.enterpriseGlobalSearchService.getRelationships(
            scope,
            {
              entityType: 'customer',
              entityId: pageContext.customerId,
              limit: 50,
            },
          );
          return {
            toolKey,
            success: true,
            summary: `${relationships.length} relationship link(s) for customer.`,
            data: { relationships },
          };
        }
        const dashboard = await this.deps.enterpriseGlobalSearchService.getDashboard(
          scope.companyId,
          scope.userId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.relationshipPreview.length} recent relationship link(s).`,
          data: { relationshipPreview: dashboard.relationshipPreview },
        };
      }
      case 'read_gs_analytics': {
        const dashboard = await this.deps.enterpriseGlobalSearchService.getDashboard(
          scope.companyId,
          scope.userId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.analytics
            ? `Latest analytics captured ${dashboard.analytics.capturedAt}.`
            : 'No analytics snapshot captured yet.',
          data: { analytics: dashboard.analytics, searchHealth: dashboard.searchHealth },
        };
      }
      case 'read_dm_dashboard': {
        const dashboard = await this.deps.enterpriseDataMigrationService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard as unknown as Record<string, unknown>,
        };
      }
      case 'read_dm_imports': {
        const dashboard = await this.deps.enterpriseDataMigrationService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.importJobs.length} import job(s), ${dashboard.migrationHistory.length} history record(s).`,
          data: { importJobs: dashboard.importJobs, migrationHistory: dashboard.migrationHistory },
        };
      }
      case 'read_dm_validation': {
        const importJobs = await this.deps.enterpriseDataMigrationService.listImportJobs(
          scope.companyId,
        );
        const latest = importJobs[0];
        const detail = latest
          ? await this.deps.enterpriseDataMigrationService.getImportJobDetail(
              scope.companyId,
              latest.id,
            )
          : null;
        return {
          toolKey,
          success: true,
          summary: detail
            ? `${detail.validationResults.length} validation issue(s), ${detail.duplicateReviews.length} duplicate review(s).`
            : 'No import jobs available.',
          data: {
            validationResults: detail?.validationResults ?? [],
            duplicateReviews: detail?.duplicateReviews ?? [],
          },
        };
      }
      case 'read_dm_mappings': {
        const importJobs = await this.deps.enterpriseDataMigrationService.listImportJobs(
          scope.companyId,
        );
        const latest = importJobs[0];
        const detail = latest
          ? await this.deps.enterpriseDataMigrationService.getImportJobDetail(
              scope.companyId,
              latest.id,
            )
          : null;
        return {
          toolKey,
          success: true,
          summary: detail
            ? `${detail.fieldMappingDetails.length} field mapping(s).`
            : 'No field mappings available.',
          data: { fieldMappings: detail?.fieldMappingDetails ?? [] },
        };
      }
      case 'read_dm_exports': {
        const exportJobs = await this.deps.enterpriseDataMigrationService.listExportJobs(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${exportJobs.length} export job(s).`,
          data: { exportJobs },
        };
      }
      case 'read_dm_analytics': {
        const dashboard = await this.deps.enterpriseDataMigrationService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.analytics
            ? `Latest analytics captured ${dashboard.analytics.capturedAt}.`
            : 'No analytics snapshot captured yet.',
          data: { analytics: dashboard.analytics, migrationHealth: dashboard.migrationHealth },
        };
      }
      case 'read_nc_dashboard': {
        const dashboard = await this.deps.enterpriseNotificationsService.getDashboard({
          companyId: scope.companyId,
          userId: scope.userId,
        });
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: {
            notificationHealth: dashboard.notificationHealth,
            overallNotificationHealthStatus: dashboard.overallNotificationHealthStatus,
            openAlertCount: dashboard.openAlertCount,
          },
        };
      }
      case 'read_nc_notifications': {
        const dashboard = await this.deps.enterpriseNotificationsService.getDashboard({
          companyId: scope.companyId,
          userId: scope.userId,
        });
        return {
          toolKey,
          success: true,
          summary: `${dashboard.inboxItems.length} inbox item(s), ${dashboard.deliveryJobs.length} delivery job(s).`,
          data: { inboxItems: dashboard.inboxItems, deliveryJobs: dashboard.deliveryJobs },
        };
      }
      case 'read_nc_alerts': {
        const alerts = await this.deps.enterpriseNotificationsService.listAlerts(scope.companyId, {
          status: 'open',
        });
        const platformAlerts = await this.deps.enterpriseNotificationsService.listPlatformAlerts(
          scope.companyId,
          {
            status: 'open',
          },
        );
        return {
          toolKey,
          success: true,
          summary: `${alerts.length} active alert(s), ${platformAlerts.length} platform alert(s).`,
          data: { alerts, platformAlerts },
        };
      }
      case 'read_nc_escalations': {
        const escalations = await this.deps.enterpriseNotificationsService.listEscalations(
          scope.companyId,
          {
            status: 'pending',
          },
        );
        return {
          toolKey,
          success: true,
          summary: `${escalations.length} pending escalation(s).`,
          data: { escalations },
        };
      }
      case 'read_nc_analytics': {
        const dashboard = await this.deps.enterpriseNotificationsService.getDashboard({
          companyId: scope.companyId,
          userId: scope.userId,
        });
        return {
          toolKey,
          success: true,
          summary: dashboard.analytics
            ? `Latest analytics captured ${dashboard.analytics.capturedAt}.`
            : 'No analytics snapshot captured yet.',
          data: {
            analytics: dashboard.analytics,
            notificationHealth: dashboard.notificationHealth,
          },
        };
      }
      case 'read_ph_dashboard': {
        const dashboard = await this.deps.enterprisePlatformHealthService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: {
            platformHealth: dashboard.platformHealth,
            overallPlatformHealthStatus: dashboard.overallPlatformHealthStatus,
            openAlertCount: dashboard.openAlertCount,
          },
        };
      }
      case 'read_ph_health_metrics': {
        const dashboard = await this.deps.enterprisePlatformHealthService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.serviceHealth.length} service(s) monitored.`,
          data: {
            latestHealthSnapshot: dashboard.latestHealthSnapshot,
            serviceHealth: dashboard.serviceHealth,
            backgroundJobs: dashboard.backgroundJobs,
          },
        };
      }
      case 'read_ph_diagnostics': {
        const diagnosticRuns = await this.deps.enterprisePlatformHealthService.listDiagnosticRuns(
          scope.companyId,
        );
        const latest = diagnosticRuns[0]
          ? await this.deps.enterprisePlatformHealthService.getDiagnosticRunDetail(
              scope.companyId,
              diagnosticRuns[0].id,
            )
          : null;
        return {
          toolKey,
          success: true,
          summary: `${diagnosticRuns.length} diagnostic run(s), latest ${latest?.status ?? 'none'}.`,
          data: { diagnosticRuns, latestResults: latest?.results ?? [] },
        };
      }
      case 'read_ph_incidents': {
        const incidents = await this.deps.enterprisePlatformHealthService.listIncidents(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${incidents.filter((i) => !['resolved', 'closed'].includes(i.status)).length} open incident(s).`,
          data: { incidents },
        };
      }
      case 'read_ph_analytics': {
        const dashboard = await this.deps.enterprisePlatformHealthService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.analytics
            ? `Latest analytics captured ${dashboard.analytics.capturedAt}.`
            : 'No analytics snapshot captured yet.',
          data: { analytics: dashboard.analytics, platformHealth: dashboard.platformHealth },
        };
      }
      case 'read_lnc_dashboard': {
        const dashboard = await this.deps.enterpriseLaunchCenterService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: {
            launchReadiness: dashboard.launchReadiness,
            overallLaunchReadinessStatus: dashboard.overallLaunchReadinessStatus,
            openAlertCount: dashboard.openAlertCount,
          },
        };
      }
      case 'read_lnc_readiness': {
        const scans = await this.deps.enterpriseLaunchCenterService.listReadinessScans(
          scope.companyId,
        );
        const latest = scans[0]
          ? await this.deps.enterpriseLaunchCenterService.getReadinessScanDetail(
              scope.companyId,
              scans[0].id,
            )
          : null;
        return {
          toolKey,
          success: true,
          summary: `${scans.length} readiness scan(s), latest ${latest?.overallStatus ?? 'none'}.`,
          data: { readinessScans: scans, latestResults: latest?.results ?? [] },
        };
      }
      case 'read_lnc_acceptance_tests': {
        const runs = await this.deps.enterpriseLaunchCenterService.listAcceptanceTestRuns(
          scope.companyId,
        );
        const latest = runs[0]
          ? await this.deps.enterpriseLaunchCenterService.getAcceptanceTestRunDetail(
              scope.companyId,
              runs[0].id,
            )
          : null;
        return {
          toolKey,
          success: true,
          summary: `${runs.length} acceptance test run(s), latest ${latest?.status ?? 'none'}.`,
          data: { acceptanceTestRuns: runs, latestResults: latest?.results ?? [] },
        };
      }
      case 'read_lnc_deployment_reports': {
        const wizards = await this.deps.enterpriseLaunchCenterService.listGoLiveWizards(
          scope.companyId,
        );
        const validations = await this.deps.enterpriseLaunchCenterService.listDeploymentValidations(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${wizards.length} go-live wizard(s), ${validations.length} deployment validation(s).`,
          data: { goLiveWizards: wizards, deploymentValidations: validations },
        };
      }
      case 'read_lnc_integrations': {
        const dashboard = await this.deps.enterpriseLaunchCenterService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.integrations.length} integration(s) tracked for launch readiness.`,
          data: { integrations: dashboard.integrations },
        };
      }
      case 'read_lnc_analytics': {
        const dashboard = await this.deps.enterpriseLaunchCenterService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.analytics
            ? `Latest analytics captured ${dashboard.analytics.capturedAt}.`
            : 'No analytics snapshot captured yet.',
          data: { analytics: dashboard.analytics, launchReadiness: dashboard.launchReadiness },
        };
      }
      case 'read_rc_dashboard': {
        const dashboard = await this.deps.enterpriseReleaseCenterService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: {
            releaseReadiness: dashboard.releaseReadiness,
            overallReleaseStatus: dashboard.overallReleaseStatus,
            openAlertCount: dashboard.openAlertCount,
          },
        };
      }
      case 'read_rc_integration_validation': {
        const runs = await this.deps.enterpriseReleaseCenterService.listIntegrationRuns(
          scope.companyId,
        );
        const latest = runs[0]
          ? await this.deps.enterpriseReleaseCenterService.getIntegrationRunDetail(
              scope.companyId,
              runs[0].id,
            )
          : null;
        return {
          toolKey,
          success: true,
          summary: `${runs.length} integration validation run(s), latest ${latest?.status ?? 'none'}.`,
          data: { runs, latestResults: latest?.results ?? [] },
        };
      }
      case 'read_rc_workflow_validation': {
        const runs = await this.deps.enterpriseReleaseCenterService.listWorkflowRuns(
          scope.companyId,
        );
        const latest = runs[0]
          ? await this.deps.enterpriseReleaseCenterService.getWorkflowRunDetail(
              scope.companyId,
              runs[0].id,
            )
          : null;
        return {
          toolKey,
          success: true,
          summary: `${runs.length} workflow validation run(s), latest ${latest?.status ?? 'none'}.`,
          data: { runs, latestResults: latest?.results ?? [] },
        };
      }
      case 'read_rc_performance': {
        const snapshot =
          await this.deps.enterpriseReleaseCenterService.getLatestPerformanceSnapshot(
            scope.companyId,
          );
        return {
          toolKey,
          success: true,
          summary: snapshot
            ? `Performance snapshot ${snapshot.snapshotKey}: ${snapshot.optimizationOpportunities.length} optimization opportunity(ies).`
            : 'No performance snapshot captured yet.',
          data: { snapshot },
        };
      }
      case 'read_rc_security': {
        const dashboard = await this.deps.enterpriseReleaseCenterService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.latestSecurityVerification
            ? `Security verification ${dashboard.latestSecurityVerification.status}, ${dashboard.latestSecurityVerification.criticalCount} critical finding(s).`
            : 'No security verification run yet.',
          data: { securityVerification: dashboard.latestSecurityVerification },
        };
      }
      case 'read_rc_configuration': {
        const dashboard = await this.deps.enterpriseReleaseCenterService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.latestConfigurationReview
            ? `Configuration review: ${dashboard.latestConfigurationReview.missingConfigCount} missing, ${dashboard.latestConfigurationReview.warningCount} warning(s).`
            : 'No configuration review run yet.',
          data: { configurationReview: dashboard.latestConfigurationReview },
        };
      }
      case 'read_rc_release_report': {
        const report = await this.deps.enterpriseReleaseCenterService.getLatestReleaseReport(
          scope.companyId,
        );
        const checklist = await this.deps.enterpriseReleaseCenterService.listReleaseChecklist(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: report
            ? `Release report ${report.reportKey}: ${report.overallStatus}, score ${report.readinessScore ?? '—'}.`
            : 'No release candidate report generated yet.',
          data: { report, checklist },
        };
      }
      case 'read_pl_dashboard': {
        const dashboard = await this.deps.enterpriseProductionLaunchService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: {
            productionReadiness: dashboard.productionReadiness,
            overallProductionStatus: dashboard.overallProductionStatus,
            openAlertCount: dashboard.openAlertCount,
          },
        };
      }
      case 'read_pl_environment': {
        const dashboard = await this.deps.enterpriseProductionLaunchService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.latestEnvironmentReview
            ? `Environment review ${dashboard.latestEnvironmentReview.status}, ${dashboard.latestEnvironmentReview.missingConfigCount} missing config(s).`
            : 'No environment review run yet.',
          data: {
            environmentReview: dashboard.latestEnvironmentReview,
            domainSecurityReview: dashboard.latestDomainSecurityReview,
          },
        };
      }
      case 'read_pl_providers': {
        const runs = await this.deps.enterpriseProductionLaunchService.listLiveIntegrationRuns(
          scope.companyId,
        );
        const latest = runs[0]
          ? await this.deps.enterpriseProductionLaunchService.getLiveIntegrationRunDetail(
              scope.companyId,
              runs[0].id,
            )
          : null;
        return {
          toolKey,
          success: true,
          summary: `${runs.length} verification run(s), latest ${latest?.status ?? 'none'}.`,
          data: { runs, latestResults: latest?.results ?? [] },
        };
      }
      case 'read_pl_deployment': {
        const runs = await this.deps.enterpriseProductionLaunchService.listDeploymentRuns(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${runs.length} deployment run(s), latest ${runs[0]?.status ?? 'none'}.`,
          data: { deploymentRuns: runs },
        };
      }
      case 'read_pl_golive_wizard': {
        const wizards = await this.deps.enterpriseProductionLaunchService.listGoLiveWizards(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${wizards.length} go-live wizard(s), latest ${wizards[0]?.status ?? 'none'}.`,
          data: { goLiveWizards: wizards },
        };
      }
      case 'read_pl_commercial': {
        const dashboard = await this.deps.enterpriseProductionLaunchService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.latestCommercialReview
            ? `Commercial readiness ${dashboard.latestCommercialReview.status}.`
            : 'No commercial readiness review yet.',
          data: {
            commercialReview: dashboard.latestCommercialReview,
            mobileReview: dashboard.latestMobileReview,
          },
        };
      }
      case 'read_rlm_dashboard': {
        const dashboard = await this.deps.enterpriseReleaseManagementService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: {
            releaseReadiness: dashboard.releaseReadiness,
            overallReleaseStatus: dashboard.overallReleaseStatus,
            openAlertCount: dashboard.openAlertCount,
          },
        };
      }
      case 'read_rlm_mobile_readiness': {
        const dashboard = await this.deps.enterpriseReleaseManagementService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: dashboard.latestMobileReview
            ? `Mobile packaging ${dashboard.latestMobileReview.status}, iOS ${dashboard.latestMobileReview.iosReady ? 'ready' : 'not ready'}, Android ${dashboard.latestMobileReview.androidReady ? 'ready' : 'not ready'}.`
            : 'No mobile packaging review run yet.',
          data: {
            mobileReview: dashboard.latestMobileReview,
            appStoreReadiness: dashboard.appStoreReadiness,
          },
        };
      }
      case 'read_rlm_documentation': {
        const dashboard = await this.deps.enterpriseReleaseManagementService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.documentationArtifacts.length} documentation artifact(s), ${dashboard.releaseReadiness.documentationCompleteness}% complete.`,
          data: { documentationArtifacts: dashboard.documentationArtifacts },
        };
      }
      case 'read_rlm_launch_checklist': {
        const dashboard = await this.deps.enterpriseReleaseManagementService.getDashboard(
          scope.companyId,
        );
        return {
          toolKey,
          success: true,
          summary: `${dashboard.launchChecklist.length} checklist item(s), ${dashboard.releaseReadiness.pendingChecklistCount} pending.`,
          data: {
            launchChecklist: dashboard.launchChecklist,
            versionRecord: dashboard.versionRecord,
          },
        };
      }
      default:
        throw new AgentRuntimeError('UNSUPPORTED_TOOL', `Read tool not supported: ${toolKey}`);
    }
  }

  private planMutatingTasks(
    request: string,
    resolved: ResolvedAgent,
    toolResults: AgentToolExecutionResult[],
    pageContext?: RunAgentRequest['pageContext'],
  ): PlannedTask[] {
    const tasks: PlannedTask[] = [];
    const lower = request.toLowerCase();
    const enabled = new Set(resolved.enabledToolKeys);

    if (
      enabled.has('send_whatsapp_draft') &&
      /whatsapp|message|send.*(customer|update)/i.test(request)
    ) {
      const customerData = toolResults.find((result) => result.toolKey === 'read_customers')?.data;
      const customers =
        (customerData?.customers as Array<{ id: string; name: string }> | undefined) ?? [];
      const matchedCustomer =
        customers.find((customer) => lower.includes(customer.name.toLowerCase())) ??
        (pageContext?.customerId
          ? customers.find((customer) => customer.id === pageContext.customerId)
          : undefined);

      if (matchedCustomer || pageContext?.customerId) {
        tasks.push({
          taskType: 'send_whatsapp_draft',
          preview: `Draft WhatsApp message${matchedCustomer ? ` for ${matchedCustomer.name}` : ''}`,
          payload: {
            customerId: matchedCustomer?.id ?? pageContext?.customerId,
            messageContent: extractQuotedText(request) ?? request,
          },
        });
      }
    }

    if (enabled.has('create_customer_note') && /add note|log note|customer note/i.test(request)) {
      const customerId = pageContext?.customerId;
      if (customerId) {
        tasks.push({
          taskType: 'create_customer_note',
          preview: 'Create CRM activity note for customer',
          payload: {
            customerId,
            content: extractQuotedText(request) ?? request,
          },
        });
      }
    }

    if (enabled.has('update_job_status') && /update job|mark job|set job.*status/i.test(request)) {
      const jobId = pageContext?.jobId;
      const statusMatch = request.match(/\b(scheduled|in_progress|completed|cancelled|new)\b/i);
      if (jobId && statusMatch) {
        tasks.push({
          taskType: 'update_job_status',
          preview: `Update job status to ${statusMatch[1]}`,
          payload: { jobId, status: statusMatch[1]!.toLowerCase() },
        });
      }
    }

    if (
      enabled.has('create_candidate') &&
      /create candidate|add candidate|new applicant/i.test(request)
    ) {
      tasks.push({
        taskType: 'create_candidate',
        preview: 'Create recruiting candidate profile',
        payload: {
          name: extractNameFromRequest(request) ?? 'New candidate',
          roleTitle: extractRoleFromRequest(request),
          notes: request,
        },
      });
    }

    if (
      enabled.has('update_candidate_status') &&
      /move.*(screening|interview|offered|rejected)|set status/i.test(request)
    ) {
      const statusMatch = request.match(/\b(screening|interview|offered|rejected|new)\b/i);
      if (statusMatch) {
        tasks.push({
          taskType: 'update_candidate_status',
          preview: `Update candidate status to ${statusMatch[1]}`,
          payload: {
            status: statusMatch[1]!.toLowerCase(),
            candidateName: extractNameFromRequest(request),
          },
        });
      }
    }

    if (
      enabled.has('draft_job_ad') &&
      /draft.*(job ad|advert|posting)|write.*job ad/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_job_ad',
        preview: 'Draft job advert for review',
        payload: {
          roleTitle: extractRoleFromRequest(request) ?? 'Open role',
          content: request,
        },
      });
    }

    if (
      enabled.has('draft_interview_questions') &&
      /interview question|questions for/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_interview_questions',
        preview: 'Draft interview questions for review',
        payload: {
          roleTitle: extractRoleFromRequest(request) ?? 'Open role',
          content: request,
        },
      });
    }

    if (
      enabled.has('store_memory') &&
      /remember|save.*rule|business rule|always create/i.test(request)
    ) {
      tasks.push({
        taskType: 'store_memory',
        preview: 'Save business rule to company memory',
        payload: {
          information: extractQuotedText(request) ?? request,
          category: 'business_rule',
        },
      });
    }

    if (
      enabled.has('draft_hiring_recommendation') &&
      /hiring recommendation|recommend hire|should we hire/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_hiring_recommendation',
        preview: 'Draft hiring recommendation for review',
        payload: {
          content: request,
          roleTitle: extractRoleFromRequest(request),
        },
      });
    }

    if (
      enabled.has('draft_recruitment_action') &&
      /recruitment action|recruit|staffing action|workforce action/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_recruitment_action',
        preview: 'Draft recruitment action for review',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_candidate_communication') &&
      /candidate communication|email candidate|message candidate|contact candidate/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_candidate_communication',
        preview: 'Draft candidate communication for review',
        payload: {
          content: extractQuotedText(request) ?? request,
          candidateName: extractNameFromRequest(request),
        },
      });
    }

    if (
      enabled.has('draft_interview_request') &&
      /interview request|schedule interview|invite to interview/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_interview_request',
        preview: 'Draft interview request for review',
        payload: {
          content: request,
          candidateName: extractNameFromRequest(request),
          roleTitle: extractRoleFromRequest(request),
        },
      });
    }

    if (
      enabled.has('draft_training_plan') &&
      /training plan|training recommendation|skill development|who needs training/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_training_plan',
        preview: 'Draft training plan for review',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_purchase_order') &&
      /purchase order|draft po|order stock|reorder|procurement/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_purchase_order',
        preview: 'Draft purchase order for review',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_executive_action') &&
      /executive action|strategic action|business decision|approve plan|leadership action/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_executive_action',
        preview: 'Draft executive action for review',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_finance_action') &&
      /finance action|budget adjustment|collection plan|pricing change|expense reduction|cash flow plan|finance recommendation/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_finance_action',
        preview: 'Draft finance action for review',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_workflow') &&
      /workflow|automation|trigger|action step|workflow builder/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_workflow',
        preview: 'Draft workflow for review',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_integration_action') &&
      /integration action|sync integration|rotate credential|webhook replay|developer api key|integration hub/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_integration_action',
        preview: 'Draft integration action for review',
        payload: {
          content: request,
          provider: pageContext?.integrationProvider ?? null,
        },
      });
    }

    if (
      enabled.has('draft_customer_request') &&
      /customer request|reschedule appointment|cancel appointment|quote clarification|approve quote|portal request/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_customer_request',
        preview: 'Draft customer portal request for review',
        payload: {
          content: request,
          customerId: pageContext?.customerId ?? null,
        },
      });
    }

    if (
      enabled.has('draft_mobile_request') &&
      /mobile request|inventory request|overtime request|schedule change|workforce request|stock request|field request/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_mobile_request',
        preview: 'Draft mobile workforce request for review',
        payload: {
          content: request,
          jobId: pageContext?.jobId ?? null,
        },
      });
    }

    if (
      enabled.has('draft_quality_action') &&
      /quality action|coaching recommendation|retraining recommendation|warning recommendation|labour recovery|material recovery/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_quality_action',
        preview: 'Draft quality action for review',
        payload: { content: request, jobId: pageContext?.jobId ?? null },
      });
    }

    if (
      enabled.has('draft_quality_review') &&
      /quality review|comeback review|root cause review|quality investigation/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_quality_review',
        preview: 'Draft quality review for approval',
        payload: { content: request, jobId: pageContext?.jobId ?? null },
      });
    }

    if (
      enabled.has('draft_payroll_recommendation') &&
      /payroll recommendation|labour recovery payroll|wage deduction recommendation/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_payroll_recommendation',
        preview: 'Draft payroll recommendation for review (no automatic deduction)',
        payload: { content: request, jobId: pageContext?.jobId ?? null },
      });
    }

    if (
      enabled.has('draft_customer_reply') &&
      /draft reply|customer reply|suggested reply|respond to customer|reply to customer/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_customer_reply',
        preview: 'Draft customer reply for approval (no automatic sending)',
        payload: {
          content: request,
          customerId: pageContext?.customerId ?? null,
        },
      });
    }

    if (
      enabled.has('draft_follow_up') &&
      /draft follow.?up|follow.?up recommendation|schedule follow.?up|customer follow.?up/i.test(
        request,
      ) &&
      !/call follow.?up|from the call/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_follow_up',
        preview: 'Draft communication follow-up for approval',
        payload: {
          content: request,
          customerId: pageContext?.customerId ?? null,
        },
      });
    }

    if (
      enabled.has('draft_maintenance_action') &&
      /maintenance action|maintenance work order|service schedule|preventative maintenance/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_maintenance_action',
        preview: 'Draft maintenance action for approval (no automatic scheduling)',
        payload: { content: request, jobId: pageContext?.jobId ?? null },
      });
    }

    if (
      enabled.has('draft_asset_replacement') &&
      /asset replacement|replace asset|retire asset|equipment replacement/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_asset_replacement',
        preview: 'Draft asset replacement recommendation for approval',
        payload: { content: request, jobId: pageContext?.jobId ?? null },
      });
    }

    if (
      enabled.has('draft_prompt_update') &&
      /prompt update|update prompt|publish prompt|prompt template|system prompt/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_prompt_update',
        preview: 'Draft prompt update for approval (no automatic publishing)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_provider_configuration') &&
      /provider configuration|configure provider|switch provider|model routing|ai provider/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_provider_configuration',
        preview: 'Draft AI provider configuration for approval (no automatic changes)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_dispatch_action') &&
      /dispatch action|reassign technician|dispatch recommendation|emergency dispatch|assign job/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_dispatch_action',
        preview: 'Draft dispatch action for approval (no automatic assignment)',
        payload: { content: request, jobId: pageContext?.jobId ?? null },
      });
    }

    if (
      enabled.has('draft_callback_action') &&
      /callback action|schedule callback|customer callback|return call|missed call callback/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_callback_action',
        preview: 'Draft callback action for approval (no automatic customer contact)',
        payload: { content: request, customerId: pageContext?.customerId ?? null },
      });
    }

    if (
      enabled.has('draft_fleet_action') &&
      /fleet action|fleet recommendation|maintenance planning|route optimization|fleet balancing|technician allocation/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_fleet_action',
        preview: 'Draft fleet action for approval (no automatic maintenance or reassignment)',
        payload: { content: request, vehicleId: pageContext?.vehicleId ?? null },
      });
    }

    if (
      enabled.has('draft_vehicle_replacement') &&
      /vehicle replacement|replace vehicle|retire vehicle|fleet renewal/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_vehicle_replacement',
        preview: 'Draft vehicle replacement for approval (no automatic replacement)',
        payload: { content: request, vehicleId: pageContext?.vehicleId ?? null },
      });
    }

    if (
      enabled.has('draft_business_action') &&
      /business action|communication action|whatsapp action|follow-up action|draft reply workflow/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_business_action',
        preview: 'Draft business communication action for approval (no automatic messaging)',
        payload: { content: request, customerId: pageContext?.customerId ?? null },
      });
    }

    if (
      enabled.has('draft_security_action') &&
      /security action|security recommendation|permission review|session revocation|integration lockdown|privacy request/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_security_action',
        preview: 'Draft security recommendation for approval (no automatic enforcement)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_integration_repair') &&
      /integration repair|reconnect integration|fix integration|sync issue|integration failure|repair connector/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_integration_repair',
        preview:
          'Draft integration repair for approval (no automatic reconnect or credential change)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_strategic_report') &&
      /strategic report|executive summary|performance report|company analysis|business intelligence report|kpi report/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_strategic_report',
        preview: 'Draft strategic business report for approval (no automatic distribution)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_workflow_improvement') &&
      /workflow improvement|optimize workflow|fix automation|bottleneck|automation recommendation|improve process/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_workflow_improvement',
        preview: 'Draft workflow improvement for approval (no automatic publishing or execution)',
        payload: { content: request, workflowId: pageContext?.workflowId ?? null },
      });
    }

    if (
      enabled.has('draft_decision_report') &&
      /decision report|scenario comparison|what.?if|simulation outcome|optimization plan|executive recommendation|operational strategy/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_decision_report',
        preview:
          'Draft decision intelligence report for approval (no automatic operational changes)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_knowledge_report') &&
      /knowledge report|organizational memory|relationship analysis|documentation gap|knowledge summary|historical context/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_knowledge_report',
        preview:
          'Draft knowledge intelligence report for approval (no automatic knowledge modification)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_executive_briefing') &&
      /executive briefing|mission control|operational summary|incident briefing|alert summary|department coordination|command center report/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_executive_briefing',
        preview:
          'Draft executive operations briefing for approval (no automatic operational changes)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_evolution_report') &&
      /evolution report|business evolution|learning progress|optimization history|improvement history|continuous learning/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_evolution_report',
        preview: 'Draft business evolution report for approval (no automatic learning deployment)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_optimization_plan') &&
      /optimization plan|optimize|improve efficiency|reduce cost|bottleneck fix|process improvement|automation improvement/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_optimization_plan',
        preview: 'Draft optimization plan for approval (no automatic business changes)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_developer_guide') &&
      /developer guide|api guide|authentication guide|sdk guide|api documentation|integration documentation/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_developer_guide',
        preview:
          'Draft developer guide for approval (no automatic credential or extension changes)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_integration_guide') &&
      /integration guide|webhook example|sdk example|connect to titan|api integration|webhook setup/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_integration_guide',
        preview: 'Draft integration guide for approval (no automatic integration deployment)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_saas_onboarding_guide') &&
      /onboarding guide|tenant onboarding|saas onboarding|getting started guide|setup guide/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_saas_onboarding_guide',
        preview: 'Draft SaaS onboarding guide for approval (no automatic tenant provisioning)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_tenant_report') &&
      /tenant report|usage report|tenant health|tenant analytics|platform report/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_tenant_report',
        preview: 'Draft tenant report for approval (no automatic tenant changes)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_plan_recommendation') &&
      /plan recommendation|upgrade plan|downgrade plan|subscription recommendation|pricing recommendation/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_plan_recommendation',
        preview: 'Draft plan recommendation for approval (no automatic subscription changes)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_recovery_plan') &&
      /recovery plan|disaster recovery|restore plan|backup recovery/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_recovery_plan',
        preview: 'Draft recovery plan for approval (no automatic backup restore)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_maintenance_plan') &&
      /maintenance plan|planned downtime|maintenance window/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_maintenance_plan',
        preview: 'Draft maintenance plan for approval (no automatic execution)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_operational_report') &&
      /operational report|ops report|production report|status report/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_operational_report',
        preview: 'Draft operational report for review',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_incident_summary') &&
      /incident summary|explain incident|postmortem|root cause summary/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_incident_summary',
        preview: 'Draft incident summary for review',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_scaling_recommendation') &&
      /scaling recommendation|scale up|scale out|horizontal scaling|queue scaling/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_scaling_recommendation',
        preview: 'Draft scaling recommendation for approval (no automatic infrastructure changes)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_mobile_report') &&
      /mobile report|field report|technician report|site report/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_mobile_report',
        preview: 'Draft mobile field report for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_mobile_quotation') &&
      /mobile quot|field quot|draft quot/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_mobile_quotation',
        preview: 'Draft mobile quotation for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_mobile_maintenance_note') &&
      /maintenance note|service note|repair note/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_mobile_maintenance_note',
        preview: 'Draft mobile maintenance note for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_mobile_troubleshooting_guide') &&
      /troubleshoot|troubleshooting|diagnose|fix guide/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_mobile_troubleshooting_guide',
        preview: 'Draft troubleshooting guide for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_communications_reply') &&
      /draft reply|reply to customer|respond to/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_communications_reply',
        preview: 'Draft communications reply for approval (no automatic send)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_communications_sms') &&
      /draft sms|send sms|text message/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_communications_sms',
        preview: 'Draft SMS message for approval (no automatic send)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_communications_whatsapp') &&
      /draft whatsapp|whatsapp message/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_communications_whatsapp',
        preview: 'Draft WhatsApp message for approval (no automatic send)',
        payload: { content: request },
      });
    }

    if (enabled.has('draft_communications_email') && /draft email|send email/i.test(request)) {
      tasks.push({
        taskType: 'draft_communications_email',
        preview: 'Draft email for approval (no automatic send)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_cx_support_request') &&
      /support request|help request|complaint|escalate/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_cx_support_request',
        preview: 'Draft customer support request for approval',
        payload: { content: request, customerId: pageContext?.customerId },
      });
    }

    if (
      enabled.has('draft_cx_appointment_request') &&
      /book appointment|schedule appointment|reschedule|emergency call/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_cx_appointment_request',
        preview: 'Draft appointment booking request for approval',
        payload: { content: request, customerId: pageContext?.customerId },
      });
    }

    if (
      enabled.has('draft_cx_document_request') &&
      /document request|upload document|download invoice|certificate|warranty/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_cx_document_request',
        preview: 'Draft document request for approval',
        payload: { content: request, customerId: pageContext?.customerId },
      });
    }

    if (
      enabled.has('draft_asset_maintenance_plan') &&
      /maintenance plan|preventive maintenance|service schedule/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_asset_maintenance_plan',
        preview: 'Draft asset maintenance plan for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_asset_report') &&
      /asset report|lifecycle report|analytics report/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_asset_report',
        preview: 'Draft asset report for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_asset_work_order') &&
      /work order|inspection request|maintenance job|emergency job/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_asset_work_order',
        preview: 'Draft asset work order for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_workforce_onboarding_plan') &&
      /onboarding plan|onboard new|new hire checklist/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_workforce_onboarding_plan',
        preview: 'Draft workforce onboarding plan for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_workforce_development_plan') &&
      /development plan|career development|growth plan/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_workforce_development_plan',
        preview: 'Draft workforce development plan for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_workforce_performance_report') &&
      /performance report|technician performance|team performance/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_workforce_performance_report',
        preview: 'Draft workforce performance report for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_workforce_hr_communication') &&
      /hr communication|employee communication|hr letter/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_workforce_hr_communication',
        preview: 'Draft HR communication for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_workforce_payroll_exception_summary') &&
      /payroll exception|payroll error|payroll issue/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_workforce_payroll_exception_summary',
        preview: 'Draft payroll exception summary for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_workforce_offboarding_checklist') &&
      /offboarding|exit checklist|termination checklist/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_workforce_offboarding_checklist',
        preview: 'Draft offboarding checklist for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_workforce_training_recommendation') &&
      /training recommendation|skill gap|training plan/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_workforce_training_recommendation',
        preview: 'Draft training recommendation for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_workforce_technician_match') &&
      /technician match|assign technician|recommend technician|best technician/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_workforce_technician_match',
        preview: 'Draft technician-job match recommendation for approval',
        payload: { content: request, jobId: pageContext?.jobId },
      });
    }

    if (
      enabled.has('draft_legal_contract_summary') &&
      /contract summary|summarize contract|summarise contract/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_legal_contract_summary',
        preview: 'Draft contract summary for human review (not legal advice)',
        payload: { content: request, contractId: pageContext?.contractId },
      });
    }

    if (
      enabled.has('draft_legal_policy_document') &&
      /policy document|draft policy|write policy/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_legal_policy_document',
        preview: 'Draft policy document for approval (not legal advice)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_legal_compliance_report') &&
      /compliance report|compliance summary|compliance gap/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_legal_compliance_report',
        preview: 'Draft compliance report for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_legal_risk_report') &&
      /risk report|risk summary|risk assessment report/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_legal_risk_report',
        preview: 'Draft risk report for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_legal_matter_summary') &&
      /legal matter summary|matter summary|dispute summary|claim summary/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_legal_matter_summary',
        preview: 'Draft legal matter summary for approval',
        payload: { content: request, matterId: pageContext?.matterId },
      });
    }

    if (
      enabled.has('draft_legal_customer_notice') &&
      /customer notice|notice to customer|customer legal notice/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_legal_customer_notice',
        preview: 'Draft customer legal notice for approval (never sends automatically)',
        payload: { content: request, customerId: pageContext?.customerId },
      });
    }

    if (
      enabled.has('draft_legal_supplier_notice') &&
      /supplier notice|notice to supplier|supplier legal notice/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_legal_supplier_notice',
        preview: 'Draft supplier legal notice for approval (never sends automatically)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_legal_internal_communication') &&
      /internal legal|legal communication|legal memo|legal briefing/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_legal_internal_communication',
        preview: 'Draft internal legal communication for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_fp_cash_flow_report') &&
      /cash flow report|cash-flow report|cash position report/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_fp_cash_flow_report',
        preview: 'Draft cash-flow report for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_fp_budget_commentary') &&
      /budget commentary|budget variance|budget analysis/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_fp_budget_commentary',
        preview: 'Draft budget commentary for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_fp_forecast_commentary') &&
      /forecast commentary|forecast analysis|rolling forecast/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_fp_forecast_commentary',
        preview: 'Draft forecast commentary for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_fp_profitability_report') &&
      /profitability report|margin report|profit analysis/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_fp_profitability_report',
        preview: 'Draft profitability report for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_fp_payment_plan_proposal') &&
      /payment plan|installment plan|payment arrangement/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_fp_payment_plan_proposal',
        preview: 'Draft payment-plan proposal for approval',
        payload: { content: request, customerId: pageContext?.customerId },
      });
    }

    if (
      enabled.has('draft_fp_supplier_payment_recommendation') &&
      /supplier payment|pay supplier|payment priorit/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_fp_supplier_payment_recommendation',
        preview: 'Draft supplier payment recommendation for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_fp_executive_financial_summary') &&
      /executive financial|financial summary|financial briefing/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_fp_executive_financial_summary',
        preview: 'Draft executive financial summary for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_fp_variance_analysis') &&
      /variance analysis|budget vs actual|forecast variance/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_fp_variance_analysis',
        preview: 'Draft variance analysis for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_si_lead_reply') &&
      /lead reply|reply to lead|respond to lead/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_si_lead_reply',
        preview: 'Draft lead reply for approval (never sends automatically)',
        payload: { content: request, leadId: pageContext?.leadId },
      });
    }

    if (
      enabled.has('draft_si_follow_up') &&
      /follow.?up|follow up with|sales follow/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_si_follow_up',
        preview: 'Draft sales follow-up for approval',
        payload: { content: request, customerId: pageContext?.customerId },
      });
    }

    if (
      enabled.has('draft_si_proposal') &&
      /sales proposal|draft proposal|write proposal/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_si_proposal',
        preview: 'Draft sales proposal for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_si_quote_commentary') &&
      /quote commentary|quote summary|quote analysis/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_si_quote_commentary',
        preview: 'Draft quote commentary for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_si_renewal_message') &&
      /renewal message|renewal notice|contract renewal/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_si_renewal_message',
        preview: 'Draft renewal message for approval (never sends automatically)',
        payload: { content: request, customerId: pageContext?.customerId },
      });
    }

    if (
      enabled.has('draft_si_account_plan') &&
      /account plan|strategic account|account strategy/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_si_account_plan',
        preview: 'Draft account plan for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_si_sales_report') &&
      /sales report|pipeline report|revenue report/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_si_sales_report',
        preview: 'Draft sales report for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_si_tender_response') &&
      /tender response|bid response|tender submission/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_si_tender_response',
        preview: 'Draft tender response for approval (never submits automatically)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_si_executive_revenue_summary') &&
      /executive revenue|revenue summary|revenue briefing/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_si_executive_revenue_summary',
        preview: 'Draft executive revenue summary for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_mi_strategy') &&
      /marketing strategy|brand strategy|channel strategy/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_mi_strategy',
        preview: 'Draft marketing strategy for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_mi_campaign_plan') &&
      /campaign plan|marketing campaign plan|plan campaign/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_mi_campaign_plan',
        preview: 'Draft campaign plan for approval (never publishes automatically)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_mi_social_post') &&
      /social post|draft post|instagram post|facebook post|linkedin post/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_mi_social_post',
        preview: 'Draft social post for approval (never publishes automatically)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_mi_email_campaign') &&
      /email campaign|newsletter|marketing email/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_mi_email_campaign',
        preview: 'Draft email campaign for approval (never sends automatically)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_mi_sms_campaign') &&
      /sms campaign|text message campaign/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_mi_sms_campaign',
        preview: 'Draft SMS campaign for approval (never sends automatically)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_mi_whatsapp_campaign') &&
      /whatsapp campaign|whatsapp marketing/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_mi_whatsapp_campaign',
        preview: 'Draft WhatsApp campaign for approval (never sends automatically)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_mi_ad_copy') &&
      /ad copy|advertising copy|google ad|meta ad|paid ad/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_mi_ad_copy',
        preview: 'Draft ad copy for approval (never activates ads automatically)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_mi_video_script') &&
      /video script|short.?form video|reel script/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_mi_video_script',
        preview: 'Draft video script for approval',
        payload: { content: request },
      });
    }

    if (enabled.has('draft_mi_landing_page') && /landing page|campaign page copy/i.test(request)) {
      tasks.push({
        taskType: 'draft_mi_landing_page',
        preview: 'Draft landing page copy for approval (never publishes automatically)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_mi_blog_content') &&
      /blog (post|article|content)|write blog/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_mi_blog_content',
        preview: 'Draft blog content for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_mi_review_response') &&
      /review response|respond to review|reply to review/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_mi_review_response',
        preview: 'Draft review response for approval (never posts publicly without approval)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_mi_campaign_report') &&
      /campaign report|marketing report|channel report/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_mi_campaign_report',
        preview: 'Draft campaign report for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_mi_executive_marketing_summary') &&
      /executive marketing|marketing summary|marketing briefing/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_mi_executive_marketing_summary',
        preview: 'Draft executive marketing summary for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_sd_quality_report') &&
      /quality report|qa report|quality assurance report/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_sd_quality_report',
        preview: 'Draft quality report for approval',
        payload: { content: request, jobId: pageContext?.jobId },
      });
    }

    if (
      enabled.has('draft_sd_corrective_action') &&
      /corrective action|corrective plan|capa/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_sd_corrective_action',
        preview: 'Draft corrective action for approval',
        payload: { content: request, jobId: pageContext?.jobId },
      });
    }

    if (
      enabled.has('draft_sd_customer_summary') &&
      /customer summary|service summary for customer/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_sd_customer_summary',
        preview: 'Draft customer service summary for approval',
        payload: {
          content: request,
          customerId: pageContext?.customerId,
          jobId: pageContext?.jobId,
        },
      });
    }

    if (
      enabled.has('draft_sd_sla_report') &&
      /sla report|sla compliance|sla breach/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_sd_sla_report',
        preview: 'Draft SLA report for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_sd_inspection_summary') &&
      /inspection summary|inspection report/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_sd_inspection_summary',
        preview: 'Draft inspection summary for approval',
        payload: { content: request, jobId: pageContext?.jobId },
      });
    }

    if (
      enabled.has('draft_sd_warranty_report') &&
      /warranty report|warranty analysis/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_sd_warranty_report',
        preview: 'Draft warranty report for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_sd_callback_analysis') &&
      /callback analysis|rework analysis|repeat visit/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_sd_callback_analysis',
        preview: 'Draft callback analysis for approval',
        payload: { content: request, jobId: pageContext?.jobId },
      });
    }

    if (
      enabled.has('draft_sd_continuous_improvement_plan') &&
      /continuous improvement|improvement plan|ci plan/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_sd_continuous_improvement_plan',
        preview: 'Draft continuous improvement plan for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_sd_executive_service_summary') &&
      /executive service|service delivery summary|operations summary/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_sd_executive_service_summary',
        preview: 'Draft executive service summary for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_ito_incident_report') &&
      /incident report|incident update|update incident/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_ito_incident_report',
        preview: 'Draft IT incident report for approval',
        payload: { content: request },
      });
    }

    if (enabled.has('draft_ito_rca_report') && /root cause|rca report|rca summary/i.test(request)) {
      tasks.push({
        taskType: 'draft_ito_rca_report',
        preview: 'Draft root cause analysis report for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_ito_fix') &&
      /fix plan|repair plan|safe repair|remediation plan/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_ito_fix',
        preview: 'Draft IT fix plan for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_ito_health_summary') &&
      /health summary|platform health report/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_ito_health_summary',
        preview: 'Draft platform health summary for approval',
        payload: { content: request },
      });
    }

    if (enabled.has('draft_ito_change_plan') && /change plan|change request plan/i.test(request)) {
      tasks.push({
        taskType: 'draft_ito_change_plan',
        preview: 'Draft IT change plan for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_bev_experiment_plan') &&
      /experiment plan|controlled experiment|test plan/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_bev_experiment_plan',
        preview: 'Draft controlled experiment plan for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_bev_improvement_plan') &&
      /improvement plan|optimization plan|process improvement/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_bev_improvement_plan',
        preview: 'Draft business improvement plan for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_bev_executive_summary') &&
      /executive evolution|evolution summary|business evolution summary/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_bev_executive_summary',
        preview: 'Draft executive evolution summary for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_bev_lessons_learned') &&
      /lessons learned|validated lesson/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_bev_lessons_learned',
        preview: 'Draft lessons learned report for approval',
        payload: { content: request },
      });
    }

    if (enabled.has('draft_bev_hypothesis') && /hypothesis|testable hypothesis/i.test(request)) {
      tasks.push({
        taskType: 'draft_bev_hypothesis',
        preview: 'Draft business hypothesis for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_ab_implementation_plan') &&
      /implementation plan|build plan|feature plan/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_ab_implementation_plan',
        preview: 'Draft feature implementation plan for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_ab_requirements_spec') &&
      /requirements spec|requirements specification|functional requirements/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_ab_requirements_spec',
        preview: 'Draft requirements specification for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_ab_architecture_impact_report') &&
      /architecture impact|impact analysis|architecture review/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_ab_architecture_impact_report',
        preview: 'Draft architecture impact report for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_ab_code_generation_plan') &&
      /code generation plan|code plan|generation plan/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_ab_code_generation_plan',
        preview: 'Draft code generation plan for approval',
        payload: { content: request },
      });
    }

    if (enabled.has('draft_ab_test_plan') && /test plan|testing plan|qa plan/i.test(request)) {
      tasks.push({
        taskType: 'draft_ab_test_plan',
        preview: 'Draft test plan for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_ab_deployment_plan') &&
      /deployment plan|release plan|deploy plan/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_ab_deployment_plan',
        preview: 'Draft deployment plan for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_ab_documentation_update') &&
      /documentation update|update docs|api documentation/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_ab_documentation_update',
        preview: 'Draft documentation update for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_ab_feature_changelog') &&
      /feature changelog|changelog entry|release notes/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_ab_feature_changelog',
        preview: 'Draft feature changelog for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_ab_rollback_plan') &&
      /rollback plan|roll back|revert plan/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_ab_rollback_plan',
        preview: 'Draft rollback plan for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_ip_job_template') &&
      /job template|installation template|maintenance template/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_ip_job_template',
        preview: 'Draft industry job template for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_ip_compliance_document') &&
      /compliance document|compliance report|regulatory document/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_ip_compliance_document',
        preview: 'Draft compliance document for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_ip_industry_report') &&
      /industry report|trade report|kpi report/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_ip_industry_report',
        preview: 'Draft industry report for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_ip_workflow') &&
      /industry workflow|trade workflow|pack workflow/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_ip_workflow',
        preview: 'Draft industry workflow for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_ip_checklist') &&
      /checklist|inspection checklist|safety checklist/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_ip_checklist',
        preview: 'Draft industry checklist for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_ip_certificate_template') &&
      /certificate template|compliance certificate/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_ip_certificate_template',
        preview: 'Draft certificate template for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_ip_quote_template') &&
      /quote template|industry quote|pricing template/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_ip_quote_template',
        preview: 'Draft quote template for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_ip_knowledge_article') &&
      /knowledge article|trade standard|best practice|procedure/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_ip_knowledge_article',
        preview: 'Draft trade knowledge article for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_ip_improvement_plan') &&
      /improvement plan|industry improvement|pack improvement/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_ip_improvement_plan',
        preview: 'Draft industry improvement plan for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_pdp_integration_guide') &&
      /integration guide|public api guide|developer guide/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_pdp_integration_guide',
        preview: 'Draft public API integration guide for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_pdp_webhook_config') &&
      /webhook config|webhook subscription|webhook setup/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_pdp_webhook_config',
        preview: 'Draft webhook configuration for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_pdp_api_example') &&
      /api example|request example|curl example|rest example/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_pdp_api_example',
        preview: 'Draft API example for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_pdp_sdk_example') &&
      /sdk example|typescript example|python example|client example/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_pdp_sdk_example',
        preview: 'Draft SDK example for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_pdp_diagnostic_report') &&
      /diagnostic|integration issue|webhook failure|api error|troubleshoot/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_pdp_diagnostic_report',
        preview: 'Draft integration diagnostic report for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_sm_subscription_report') &&
      /subscription report|tenant report|saas report/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_sm_subscription_report',
        preview: 'Draft subscription report for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_sm_billing_summary') &&
      /billing summary|payment summary|invoice summary/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_sm_billing_summary',
        preview: 'Draft billing summary for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_sm_usage_report') &&
      /usage report|usage summary|limit report/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_sm_usage_report',
        preview: 'Draft usage report for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_sm_renewal_forecast') &&
      /renewal forecast|renewal due|upcoming renewal/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_sm_renewal_forecast',
        preview: 'Draft renewal forecast for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_sm_plan_recommendation') &&
      /plan recommendation|upgrade plan|downgrade plan|change plan/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_sm_plan_recommendation',
        preview: 'Draft plan recommendation for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_vr_call_summary') &&
      /call summary|summarize call|summarise call/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_vr_call_summary',
        preview: 'Draft call summary for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_vr_follow_up_tasks') &&
      /follow.?up task|follow up task|action items/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_vr_follow_up_tasks',
        preview: 'Draft follow-up tasks for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_vr_crm_note') &&
      /crm note|customer note|note for customer/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_vr_crm_note',
        preview: 'Draft CRM note for approval',
        payload: { content: request },
      });
    }

    if (enabled.has('draft_vr_job_note') && /job note|work order note/i.test(request)) {
      tasks.push({
        taskType: 'draft_vr_job_note',
        preview: 'Draft job note for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_vr_callback_request') &&
      /callback request|call back|return call/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_vr_callback_request',
        preview: 'Draft callback request for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_vr_lead_creation') &&
      /create lead|new lead|lead from call/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_vr_lead_creation',
        preview: 'Draft lead creation for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_vr_appointment_booking') &&
      /book appointment|schedule appointment|appointment booking/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_vr_appointment_booking',
        preview: 'Draft appointment booking for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_vr_routing_recommendation') &&
      /routing recommendation|route call|transfer recommendation/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_vr_routing_recommendation',
        preview: 'Draft routing recommendation for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_dip_extraction_correction') &&
      /extraction correction|correct extraction|fix extraction/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_dip_extraction_correction',
        preview: 'Draft extraction correction for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_dip_document_summary') &&
      /document summary|summarize document|summarise document/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_dip_document_summary',
        preview: 'Draft document summary for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_dip_workflow_action') &&
      /workflow action|draft supplier invoice|draft inventory receipt|draft asset update|draft warranty/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_dip_workflow_action',
        preview: 'Draft workflow action for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_dip_compliance_suggestion') &&
      /compliance suggestion|compliance recommendation|expiry alert|renewal reminder/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_dip_compliance_suggestion',
        preview: 'Draft compliance suggestion for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_bc_recovery_plan') &&
      /recovery plan|disaster recovery|dr plan/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_bc_recovery_plan',
        preview: 'Draft recovery plan for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_bc_verification_report') &&
      /verification report|backup verification|verify backup/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_bc_verification_report',
        preview: 'Draft verification report for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_bc_continuity_improvement') &&
      /continuity improvement|business continuity improvement|improve backup/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_bc_continuity_improvement',
        preview: 'Draft continuity improvement for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_bc_recovery_test_schedule') &&
      /recovery test|recovery drill|drill schedule|disaster recovery test/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_bc_recovery_test_schedule',
        preview: 'Draft recovery test schedule for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_bc_restore_request') &&
      /restore request|point.in.time restore|tenant restore|module restore/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_bc_restore_request',
        preview: 'Draft restore request for owner approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_gs_search_report') &&
      /search report|global search report|search intelligence report/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_gs_search_report',
        preview: 'Draft search report for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_gs_activity_summary') &&
      /activity summary|activity feed summary|summarize activity/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_gs_activity_summary',
        preview: 'Draft activity summary for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_gs_related_record_recommendation') &&
      /related record|linked record|relationship recommendation/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_gs_related_record_recommendation',
        preview: 'Draft related record recommendation for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_dm_mapping_suggestion') &&
      /mapping suggestion|field mapping|map fields|auto.?map/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_dm_mapping_suggestion',
        preview: 'Draft mapping suggestion for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_dm_validation_correction') &&
      /validation correction|fix validation|correct validation/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_dm_validation_correction',
        preview: 'Draft validation correction for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_dm_migration_report') &&
      /migration report|import report|export report/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_dm_migration_report',
        preview: 'Draft migration report for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_dm_cleanup_recommendation') &&
      /cleanup recommendation|post.?migration cleanup|data cleanup/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_dm_cleanup_recommendation',
        preview: 'Draft cleanup recommendation for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_nc_template') &&
      /notification template|draft template|message template/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_nc_template',
        preview: 'Draft notification template for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_nc_escalation_rule') &&
      /escalation rule|escalation policy|escalate to/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_nc_escalation_rule',
        preview: 'Draft escalation rule for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_nc_delivery_report') &&
      /delivery report|notification report|delivery summary/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_nc_delivery_report',
        preview: 'Draft delivery report for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_nc_improvement_recommendation') &&
      /improvement recommendation|notification improvement|optimize notifications/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_nc_improvement_recommendation',
        preview: 'Draft improvement recommendation for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_ph_incident_report') &&
      /incident report|post.?incident|incident summary/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_ph_incident_report',
        preview: 'Draft incident report for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_ph_optimization_recommendation') &&
      /optimization|performance recommendation|slow api|optimize platform/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_ph_optimization_recommendation',
        preview: 'Draft optimization recommendation for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_ph_capacity_forecast') &&
      /capacity forecast|capacity planning|usage forecast/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_ph_capacity_forecast',
        preview: 'Draft capacity forecast for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_ph_diagnostic_summary') &&
      /diagnostic summary|diagnostics report|health check summary/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_ph_diagnostic_summary',
        preview: 'Draft diagnostic summary for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_lnc_readiness_report') &&
      /readiness report|launch readiness|go-live readiness/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_lnc_readiness_report',
        preview: 'Draft launch readiness report for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_lnc_deployment_plan') &&
      /deployment plan|go-live plan|production deployment plan/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_lnc_deployment_plan',
        preview: 'Draft deployment plan for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_lnc_rollout_checklist') &&
      /rollout checklist|launch checklist|go-live checklist/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_lnc_rollout_checklist',
        preview: 'Draft rollout checklist for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_lnc_rollback_recommendation') &&
      /rollback recommendation|rollback plan|recovery recommendation/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_lnc_rollback_recommendation',
        preview: 'Draft rollback recommendation for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_rc_release_notes') &&
      /release notes|changelog|what.?s new/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_rc_release_notes',
        preview: 'Draft release notes for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_rc_optimization_plan') &&
      /optimization plan|performance plan|optimize/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_rc_optimization_plan',
        preview: 'Draft optimization plan for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_rc_deployment_recommendation') &&
      /deployment recommendation|release recommendation|go-live recommendation/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_rc_deployment_recommendation',
        preview: 'Draft deployment recommendation for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_pl_deployment_plan') &&
      /deployment plan|production deployment plan|go-live plan/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_pl_deployment_plan',
        preview: 'Draft production deployment plan for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_pl_launch_report') &&
      /launch report|production launch report|go-live report/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_pl_launch_report',
        preview: 'Draft production launch report for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_pl_post_launch_checklist') &&
      /post-launch checklist|post launch checklist|after launch checklist/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_pl_post_launch_checklist',
        preview: 'Draft post-launch checklist for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_rlm_release_notes') &&
      /release notes|v1\.0\.0 notes|version notes/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_rlm_release_notes',
        preview: 'Draft TITAN v1.0.0 release notes for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_rlm_user_documentation') &&
      /user guide|user documentation|end user documentation/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_rlm_user_documentation',
        preview: 'Draft user documentation for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_rlm_admin_documentation') &&
      /administrator guide|admin documentation|administrator documentation/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_rlm_admin_documentation',
        preview: 'Draft administrator documentation for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_rlm_post_launch_recommendations') &&
      /post-launch recommendations|post launch recommendations|after launch recommendations/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_rlm_post_launch_recommendations',
        preview: 'Draft post-launch recommendations for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_call_summary') &&
      /call summary|summarize call|summarise call/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_call_summary',
        preview: 'Draft call summary for review',
        payload: { content: request },
      });
    }

    if (enabled.has('draft_follow_up_task') && /follow.?up task|follow up task/i.test(request)) {
      tasks.push({
        taskType: 'draft_follow_up_task',
        preview: 'Draft follow-up task for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_appointment_confirmation') &&
      /appointment confirmation|confirm appointment/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_appointment_confirmation',
        preview: 'Draft appointment confirmation for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_customer_update') &&
      /customer update|status update|update customer/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_customer_update',
        preview: 'Draft customer update for approval',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_knowledge_article') &&
      /knowledge article|document article|write sop|create documentation|knowledge base article|publish article/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_knowledge_article',
        preview: 'Draft knowledge article for review',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_business_report') &&
      /business report|bi report|executive report|cross-module report|analytics report|dashboard report/i.test(
        request,
      )
    ) {
      tasks.push({
        taskType: 'draft_business_report',
        preview: 'Draft business report for review',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_sales_follow_up') &&
      /follow.?up|contact customer|reach out|sales follow/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_sales_follow_up',
        preview: 'Draft sales follow-up for review',
        payload: {
          customerId: pageContext?.customerId ?? null,
          content: extractQuotedText(request) ?? request,
        },
      });
    }

    if (
      enabled.has('draft_quote_recommendation') &&
      /quote recommendation|prepare quote|pricing recommendation|quote assist/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_quote_recommendation',
        preview: 'Draft quote preparation recommendation for review',
        payload: {
          customerId: pageContext?.customerId ?? null,
          content: request,
        },
      });
    }

    if (
      enabled.has('draft_marketing_campaign') &&
      /marketing campaign|campaign idea|launch campaign/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_marketing_campaign',
        preview: 'Draft marketing campaign for review',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_marketing_content') &&
      /marketing content|campaign message|brand message|content idea/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_marketing_content',
        preview: 'Draft marketing content for review',
        payload: {
          customerId: pageContext?.customerId ?? null,
          content: extractQuotedText(request) ?? request,
        },
      });
    }

    if (
      enabled.has('draft_lead_follow_up') &&
      /lead follow.?up|follow up lead|contact lead|lead reminder/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_lead_follow_up',
        preview: 'Draft lead follow-up for review',
        payload: {
          customerId: pageContext?.customerId ?? null,
          content: extractQuotedText(request) ?? request,
        },
      });
    }

    if (
      enabled.has('draft_lead_handoff') &&
      /hand.?off|handoff|sales handoff|transfer to sales|create opportunity/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_lead_handoff',
        preview: 'Draft sales handoff recommendation for review',
        payload: {
          customerId: pageContext?.customerId ?? null,
          content: request,
        },
      });
    }

    if (
      enabled.has('draft_follow_up_from_call') &&
      /follow.?up.*call|call follow.?up|after the call|from the call/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_follow_up_from_call',
        preview: 'Draft follow-up from voice call for review',
        payload: {
          customerId: pageContext?.customerId ?? null,
          content: extractQuotedText(request) ?? request,
        },
      });
    }

    if (
      enabled.has('draft_appointment_request_from_call') &&
      /appointment.*call|book.*appointment|schedule.*call|caller.*appointment/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_appointment_request_from_call',
        preview: 'Draft appointment request from call for review',
        payload: {
          customerId: pageContext?.customerId ?? null,
          content: request,
        },
      });
    }

    if (
      enabled.has('draft_lead_from_call') &&
      /lead.*call|new caller|new enquiry|caller.*lead/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_lead_from_call',
        preview: 'Draft lead from voice call for review',
        payload: {
          customerId: pageContext?.customerId ?? null,
          content: extractQuotedText(request) ?? request,
        },
      });
    }

    if (
      enabled.has('draft_customer_note_from_call') &&
      /note.*call|customer note.*call|log.*call|record.*call/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_customer_note_from_call',
        preview: 'Draft customer note from voice call for review',
        payload: {
          customerId: pageContext?.customerId ?? null,
          content: extractQuotedText(request) ?? request,
        },
      });
    }

    if (
      enabled.has('draft_customer_response') &&
      /customer response|reply to customer|support response|answer customer/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_customer_response',
        preview: 'Draft customer support response for review',
        payload: {
          customerId: pageContext?.customerId ?? null,
          content: extractQuotedText(request) ?? request,
        },
      });
    }

    if (
      enabled.has('draft_appointment_update') &&
      /appointment update|schedule update|booking update|reschedule/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_appointment_update',
        preview: 'Draft appointment update for customer review',
        payload: {
          customerId: pageContext?.customerId ?? null,
          content: request,
        },
      });
    }

    if (
      enabled.has('draft_invoice_explanation') &&
      /invoice explanation|explain invoice|payment question|bill question/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_invoice_explanation',
        preview: 'Draft invoice explanation for customer review',
        payload: {
          customerId: pageContext?.customerId ?? null,
          content: request,
        },
      });
    }

    if (
      enabled.has('draft_service_information_response') &&
      /service information|service question|repair status|job update/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_service_information_response',
        preview: 'Draft service information response for customer review',
        payload: {
          customerId: pageContext?.customerId ?? null,
          content: extractQuotedText(request) ?? request,
        },
      });
    }

    return tasks;
  }

  private async executeTask(
    scope: TenantScope,
    task: typeof agentTasks.$inferSelect,
  ): Promise<Record<string, unknown>> {
    const payload = task.payload as Record<string, unknown>;

    switch (task.taskType) {
      case 'create_customer_note': {
        const customerId = String(payload.customerId ?? '');
        const content = String(payload.content ?? task.preview);
        await this.deps.crmService.addActivity(scope, customerId, { content });
        return { customerId, content };
      }
      case 'update_job_status': {
        const jobId = String(payload.jobId ?? '');
        const status = String(payload.status ?? '') as
          'new' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
        const job = await this.deps.jobsService.updateJob(scope.companyId, jobId, { status });
        return { jobId: job.id, status: job.status };
      }
      case 'send_whatsapp_draft': {
        const message = await this.deps.whatsappService.sendMessage(scope, {
          customerId: String(payload.customerId ?? ''),
          messageContent: String(payload.messageContent ?? task.preview),
          asDraft: true,
        });
        return { messageId: message.id, customerId: message.customerId };
      }
      case 'create_candidate': {
        const candidate = await this.deps.recruitingService.createCandidate(scope.companyId, {
          name: String(payload.name ?? 'New candidate'),
          roleTitle: payload.roleTitle ? String(payload.roleTitle) : null,
          notes: payload.notes ? String(payload.notes) : null,
        });
        return { candidateId: candidate.id, name: candidate.name };
      }
      case 'update_candidate_status': {
        const candidates = await this.deps.recruitingService.listCandidates(scope.companyId);
        const candidateName = String(payload.candidateName ?? '').toLowerCase();
        const candidate =
          candidates.find((entry) => entry.name.toLowerCase().includes(candidateName)) ??
          candidates[0];

        if (!candidate) {
          throw new AgentRuntimeError('NOT_FOUND', 'No candidate found to update');
        }

        const updated = await this.deps.recruitingService.updateCandidate(
          scope.companyId,
          candidate.id,
          {
            status: payload.status as 'new' | 'screening' | 'interview' | 'offered' | 'rejected',
          },
        );
        return { candidateId: updated.id, status: updated.status };
      }
      case 'draft_job_ad':
      case 'draft_interview_questions':
      case 'draft_hiring_recommendation':
      case 'draft_sales_follow_up':
      case 'draft_quote_recommendation':
      case 'draft_marketing_campaign':
      case 'draft_marketing_content':
      case 'draft_lead_follow_up':
      case 'draft_lead_handoff':
      case 'draft_follow_up_from_call':
      case 'draft_appointment_request_from_call':
      case 'draft_lead_from_call':
      case 'draft_customer_note_from_call':
      case 'draft_customer_response':
      case 'draft_appointment_update':
      case 'draft_invoice_explanation':
      case 'draft_service_information_response':
      case 'draft_recruitment_action':
      case 'draft_candidate_communication':
      case 'draft_interview_request':
      case 'draft_training_plan':
      case 'draft_purchase_order':
      case 'draft_executive_action':
      case 'draft_finance_action':
      case 'draft_knowledge_article':
      case 'draft_business_report':
      case 'draft_workflow':
      case 'draft_integration_action':
      case 'draft_customer_request':
      case 'draft_mobile_request':
      case 'draft_quality_action':
      case 'draft_quality_review':
      case 'draft_payroll_recommendation':
      case 'draft_customer_reply':
      case 'draft_follow_up':
      case 'draft_maintenance_action':
      case 'draft_asset_replacement':
      case 'draft_prompt_update':
      case 'draft_provider_configuration':
      case 'draft_dispatch_action':
      case 'draft_callback_action':
      case 'draft_fleet_action':
      case 'draft_vehicle_replacement':
      case 'draft_business_action':
      case 'draft_security_action':
      case 'draft_integration_repair':
      case 'draft_strategic_report':
      case 'draft_workflow_improvement':
      case 'draft_decision_report':
      case 'draft_knowledge_report':
      case 'draft_executive_briefing':
      case 'draft_evolution_report':
      case 'draft_optimization_plan':
      case 'draft_developer_guide':
      case 'draft_integration_guide':
      case 'draft_saas_onboarding_guide':
      case 'draft_tenant_report':
      case 'draft_plan_recommendation':
      case 'draft_recovery_plan':
      case 'draft_maintenance_plan':
      case 'draft_operational_report':
      case 'draft_incident_summary':
      case 'draft_scaling_recommendation':
      case 'draft_workforce_onboarding_plan':
      case 'draft_workforce_development_plan':
      case 'draft_workforce_performance_report':
      case 'draft_workforce_hr_communication':
      case 'draft_workforce_payroll_exception_summary':
      case 'draft_workforce_offboarding_checklist':
      case 'draft_workforce_training_recommendation':
      case 'draft_workforce_technician_match':
      case 'draft_legal_contract_summary':
      case 'draft_legal_policy_document':
      case 'draft_legal_compliance_report':
      case 'draft_legal_risk_report':
      case 'draft_legal_matter_summary':
      case 'draft_legal_customer_notice':
      case 'draft_legal_supplier_notice':
      case 'draft_legal_internal_communication':
      case 'draft_fp_cash_flow_report':
      case 'draft_fp_budget_commentary':
      case 'draft_fp_forecast_commentary':
      case 'draft_fp_profitability_report':
      case 'draft_fp_payment_plan_proposal':
      case 'draft_fp_supplier_payment_recommendation':
      case 'draft_fp_executive_financial_summary':
      case 'draft_fp_variance_analysis':
      case 'draft_si_lead_reply':
      case 'draft_si_follow_up':
      case 'draft_si_proposal':
      case 'draft_si_quote_commentary':
      case 'draft_si_renewal_message':
      case 'draft_si_account_plan':
      case 'draft_si_sales_report':
      case 'draft_si_tender_response':
      case 'draft_si_executive_revenue_summary':
      case 'draft_mi_strategy':
      case 'draft_mi_campaign_plan':
      case 'draft_mi_social_post':
      case 'draft_mi_email_campaign':
      case 'draft_mi_sms_campaign':
      case 'draft_mi_whatsapp_campaign':
      case 'draft_mi_ad_copy':
      case 'draft_mi_video_script':
      case 'draft_mi_landing_page':
      case 'draft_mi_blog_content':
      case 'draft_mi_review_response':
      case 'draft_mi_campaign_report':
      case 'draft_mi_executive_marketing_summary':
      case 'draft_sd_quality_report':
      case 'draft_sd_corrective_action':
      case 'draft_sd_customer_summary':
      case 'draft_sd_sla_report':
      case 'draft_sd_inspection_summary':
      case 'draft_sd_warranty_report':
      case 'draft_sd_callback_analysis':
      case 'draft_sd_continuous_improvement_plan':
      case 'draft_sd_executive_service_summary':
      case 'draft_ito_fix':
      case 'draft_ito_postmortem':
      case 'draft_ito_release_notes':
      case 'draft_ito_infrastructure_report':
      case 'draft_ito_health_summary':
      case 'draft_ito_incident_report':
      case 'draft_ito_change_plan':
      case 'draft_ito_runbook':
      case 'draft_ito_rca_report':
      case 'draft_bev_experiment_plan':
      case 'draft_bev_improvement_plan':
      case 'draft_bev_maturity_assessment':
      case 'draft_bev_benefit_report':
      case 'draft_bev_lessons_learned':
      case 'draft_bev_executive_summary':
      case 'draft_bev_hypothesis':
      case 'draft_bev_process_report':
      case 'draft_bev_agent_improvement':
      case 'draft_ab_implementation_plan':
      case 'draft_ab_requirements_spec':
      case 'draft_ab_architecture_impact_report':
      case 'draft_ab_code_generation_plan':
      case 'draft_ab_test_plan':
      case 'draft_ab_deployment_plan':
      case 'draft_ab_documentation_update':
      case 'draft_ab_feature_changelog':
      case 'draft_ab_rollback_plan':
      case 'draft_ip_job_template':
      case 'draft_ip_compliance_document':
      case 'draft_ip_industry_report':
      case 'draft_ip_workflow':
      case 'draft_ip_checklist':
      case 'draft_ip_certificate_template':
      case 'draft_ip_quote_template':
      case 'draft_ip_knowledge_article':
      case 'draft_ip_improvement_plan':
      case 'draft_pdp_integration_guide':
      case 'draft_pdp_webhook_config':
      case 'draft_pdp_api_example':
      case 'draft_pdp_sdk_example':
      case 'draft_pdp_diagnostic_report':
      case 'draft_sm_subscription_report':
      case 'draft_sm_billing_summary':
      case 'draft_sm_usage_report':
      case 'draft_sm_renewal_forecast':
      case 'draft_sm_plan_recommendation':
      case 'draft_vr_call_summary':
      case 'draft_vr_follow_up_tasks':
      case 'draft_vr_crm_note':
      case 'draft_vr_job_note':
      case 'draft_vr_callback_request':
      case 'draft_vr_lead_creation':
      case 'draft_vr_appointment_booking':
      case 'draft_vr_routing_recommendation':
      case 'draft_dip_extraction_correction':
      case 'draft_dip_document_summary':
      case 'draft_dip_workflow_action':
      case 'draft_dip_compliance_suggestion':
      case 'draft_dip_supplier_invoice':
      case 'draft_dip_inventory_receipt':
      case 'draft_dip_compliance_record':
      case 'draft_dip_asset_update':
      case 'draft_dip_warranty_registration':
      case 'draft_dip_follow_up_task':
      case 'draft_bc_recovery_plan':
      case 'draft_bc_verification_report':
      case 'draft_bc_continuity_improvement':
      case 'draft_bc_recovery_test_schedule':
      case 'draft_bc_restore_request':
      case 'draft_gs_search_report':
      case 'draft_gs_activity_summary':
      case 'draft_gs_related_record_recommendation':
      case 'draft_dm_mapping_suggestion':
      case 'draft_dm_validation_correction':
      case 'draft_dm_migration_report':
      case 'draft_dm_cleanup_recommendation':
      case 'draft_nc_template':
      case 'draft_nc_escalation_rule':
      case 'draft_nc_delivery_report':
      case 'draft_nc_improvement_recommendation':
      case 'draft_ph_incident_report':
      case 'draft_ph_optimization_recommendation':
      case 'draft_ph_capacity_forecast':
      case 'draft_ph_diagnostic_summary':
      case 'draft_lnc_readiness_report':
      case 'draft_lnc_deployment_plan':
      case 'draft_lnc_rollout_checklist':
      case 'draft_lnc_rollback_recommendation':
      case 'draft_rc_release_notes':
      case 'draft_rc_optimization_plan':
      case 'draft_rc_deployment_recommendation':
      case 'draft_pl_deployment_plan':
      case 'draft_pl_launch_report':
      case 'draft_pl_post_launch_checklist':
      case 'draft_rlm_release_notes':
      case 'draft_rlm_user_documentation':
      case 'draft_rlm_admin_documentation':
      case 'draft_rlm_post_launch_recommendations':
        return {
          saved: false,
          draftType: task.taskType,
          roleTitle: payload.roleTitle ?? null,
          customerId: payload.customerId ?? null,
          jobId: payload.jobId ?? null,
          vehicleId: payload.vehicleId ?? null,
          contractId: payload.contractId ?? null,
          matterId: payload.matterId ?? null,
          leadId: payload.leadId ?? null,
          content: payload.content ?? task.preview,
        };
      case 'store_memory': {
        const memory = await this.deps.memoryService.createMemory(scope, {
          information: String(payload.information ?? task.preview),
          category: (payload.category as 'business_rule' | undefined) ?? 'business_rule',
          importance: typeof payload.importance === 'number' ? payload.importance : 4,
        });
        return { memoryId: memory.id, information: memory.information };
      }
      default:
        throw new AgentRuntimeError('UNSUPPORTED_TASK', `Unsupported task type: ${task.taskType}`);
    }
  }

  private async buildAgentContext(
    companyId: string,
    baseContext: AuraGenerateContext,
    resolved: ResolvedAgent,
    userPermissions: string[],
    pageContext?: RunAgentRequest['pageContext'],
  ): Promise<AuraGenerateContext> {
    let context = baseContext;

    const load = async (
      permissions: string[],
      loader: () => Promise<Partial<AuraGenerateContext>>,
    ) => {
      if (hasAnyPermission(userPermissions, permissions)) {
        context = { ...context, ...(await loader()) };
      }
    };

    if (
      resolved.agentKey === 'executive' ||
      resolved.agentKey === 'operations' ||
      resolved.agentKey === 'finance'
    ) {
      await load(['customers:read', 'customers:write'], async () => ({
        crm: await this.deps.crmService.buildAuraContext(companyId, pageContext?.customerId),
      }));
      await load(['jobs:read', 'jobs:write'], async () => ({
        jobs: await this.deps.jobsService.buildAuraContext(companyId, pageContext?.jobId),
      }));
      await load(['dispatch:read', 'dispatch:write'], async () => ({
        scheduling: await this.deps.schedulingService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'executive' || resolved.agentKey === 'finance') {
      await load(['finance:read', 'finance:write'], async () => ({
        finance: await this.deps.financeService.buildAuraContext(companyId),
      }));
      await load(['finance:read', 'finance:write'], async () => ({
        financeIntelligence: await this.deps.financeIntelligenceService.buildAuraContext(companyId),
      }));
      await load(['integrations:read', 'integrations:manage'], async () => {
        const xeroAccounting = await this.deps.xeroSyncService.buildAuraContext(companyId);
        const integrationApiManagement =
          await this.deps.integrationApiManagementService.buildAuraContext(companyId);
        return {
          integrationApiManagement,
          ...(xeroAccounting ? { xeroAccounting } : {}),
        };
      });
    }

    if (resolved.agentKey === 'executive' || resolved.agentKey === 'operations') {
      await load(['fleet:read', 'fleet:write'], async () => ({
        fleet: await this.deps.fleetService.buildAuraContext(companyId, pageContext?.vehicleId),
      }));
      await load(['fleet_intelligence:read', 'fleet:read', 'integrations:read'], async () => ({
        fleetIntelligence:
          await this.deps.fleetIntelligenceService.buildFleetIntelligenceAuraContext(companyId),
      }));
      await load(
        ['personal_communications:read', 'communications_intelligence:read', 'communications:read'],
        async () => ({
          personalCommunications:
            await this.deps.personalCommunicationsIntelligenceService.buildPersonalCommunicationsAuraContext(
              companyId,
            ),
        }),
      );
      await load(['security:read', 'settings:manage'], async () => ({
        security: await this.deps.enterpriseSecurityService.buildSecurityAuraContext(companyId),
      }));
      await load(['inventory:read', 'inventory:write'], async () => ({
        inventory: await this.deps.inventoryService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'executive') {
      await load(['executive:read', 'executive:write', 'intelligence:read'], async () => ({
        executive: await this.deps.executiveService.buildAuraContext(companyId),
      }));
      await load(['sales:read', 'sales:write'], async () => ({
        sales: await this.deps.salesService.buildAuraContext(companyId),
      }));
      await load(['marketing:read', 'marketing:write'], async () => ({
        marketing: await this.deps.marketingService.buildAuraContext(companyId),
      }));
      await load(['workforce:read', 'workforce:write', 'recruiting:read'], async () => ({
        workforce: await this.deps.workforceService.buildAuraContext(companyId),
      }));
      await load(['procurement:read', 'procurement:write'], async () => ({
        procurement: await this.deps.procurementService.buildAuraContext(companyId),
      }));
      await load(['bi:read', 'bi:write', 'intelligence:read'], async () => ({
        businessIntelligence:
          await this.deps.businessIntelligenceService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'finance') {
      await load(['analytics:read'], async () => ({
        analytics: await this.deps.analyticsService.buildAuraContext(companyId, {
          period: 'monthly',
        }),
      }));
      await load(['procurement:read', 'procurement:write'], async () => ({
        procurement: await this.deps.procurementService.buildAuraContext(companyId),
      }));
    }

    if (
      resolved.agentKey === 'customer_support' ||
      resolved.agentKey === 'operations' ||
      resolved.agentKey === 'recruiting'
    ) {
      await load(['knowledge:read', 'knowledge:write'], async () => ({
        knowledge: await this.deps.knowledgeService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'recruiting') {
      await load(['recruiting:read', 'recruiting:write'], async () => ({
        recruiting: await this.deps.recruitingService.buildAuraContext(companyId),
      }));
      await load(['workforce:read', 'workforce:write', 'recruiting:read'], async () => ({
        workforce: await this.deps.workforceService.buildAuraContext(companyId),
      }));
      await load(['analytics:read'], async () => ({
        analytics: await this.deps.analyticsService.buildAuraContext(companyId, {
          period: 'monthly',
        }),
      }));
      await load(['dispatch:read', 'dispatch:write'], async () => ({
        scheduling: await this.deps.schedulingService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'sales') {
      await load(['customers:read', 'customers:write'], async () => ({
        crm: await this.deps.crmService.buildAuraContext(companyId, pageContext?.customerId),
      }));
      await load(['finance:read', 'finance:write'], async () => ({
        finance: await this.deps.financeService.buildAuraContext(companyId),
      }));
      await load(['sales:read', 'sales:write'], async () => ({
        sales: await this.deps.salesService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'marketing') {
      await load(['customers:read', 'customers:write'], async () => ({
        crm: await this.deps.crmService.buildAuraContext(companyId, pageContext?.customerId),
      }));
      await load(['marketing:read', 'marketing:write'], async () => ({
        marketing: await this.deps.marketingService.buildAuraContext(companyId),
      }));
      await load(['sales:read', 'sales:write'], async () => ({
        sales: await this.deps.salesService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'lead_generation') {
      await load(['customers:read', 'customers:write'], async () => ({
        crm: await this.deps.crmService.buildAuraContext(companyId, pageContext?.customerId),
      }));
      await load(['leads:read', 'leads:write'], async () => ({
        leads: await this.deps.leadsService.buildAuraContext(companyId),
      }));
      await load(['sales:read', 'sales:write'], async () => ({
        sales: await this.deps.salesService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'voice_receptionist') {
      await load(['customers:read', 'customers:write'], async () => ({
        crm: await this.deps.crmService.buildAuraContext(companyId, pageContext?.customerId),
      }));
      await load(['voice:read', 'voice:write'], async () => ({
        voice: await this.deps.voiceService.buildAuraContext(companyId),
      }));
      await load(['jobs:read', 'jobs:write'], async () => ({
        jobs: await this.deps.jobsService.buildAuraContext(companyId, pageContext?.jobId),
      }));
      await load(['dispatch:read', 'dispatch:write'], async () => ({
        scheduling: await this.deps.schedulingService.buildAuraContext(companyId),
      }));
      await load(['leads:read', 'leads:write'], async () => ({
        leads: await this.deps.leadsService.buildAuraContext(companyId),
      }));
      await load(['sales:read', 'sales:write'], async () => ({
        sales: await this.deps.salesService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'voice_reception') {
      await load(['customers:read', 'customers:write'], async () => ({
        crm: await this.deps.crmService.buildAuraContext(companyId, pageContext?.customerId),
      }));
      await load(['voice:read', 'voice:write', 'voice_reception:read'], async () => ({
        voice: await this.deps.voiceService.buildAuraContext(companyId),
      }));
      await load(['jobs:read', 'jobs:write'], async () => ({
        jobs: await this.deps.jobsService.buildAuraContext(companyId, pageContext?.jobId),
      }));
      await load(['dispatch:read', 'dispatch:write'], async () => ({
        scheduling: await this.deps.schedulingService.buildAuraContext(companyId),
      }));
      await load(['leads:read', 'leads:write'], async () => ({
        leads: await this.deps.leadsService.buildAuraContext(companyId),
      }));
      await load(['knowledge:read', 'knowledge:write'], async () => ({
        knowledge: await this.deps.knowledgeService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'document_intelligence') {
      await load(['documents:read', 'documents:write', 'document_ai:read'], async () => ({
        documentAi: await this.deps.enterpriseDocumentAiService.buildAuraContext(companyId),
      }));
      await load(['jobs:read', 'jobs:write'], async () => ({
        jobs: await this.deps.jobsService.buildAuraContext(companyId, pageContext?.jobId),
      }));
      await load(['customers:read', 'customers:write'], async () => ({
        crm: await this.deps.crmService.buildAuraContext(companyId, pageContext?.customerId),
      }));
      await load(['finance:read', 'finance:write'], async () => ({
        finance: await this.deps.financeService.buildAuraContext(companyId),
      }));
      await load(['knowledge:read', 'knowledge:write'], async () => ({
        knowledge: await this.deps.knowledgeService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'business_continuity') {
      await load(['business_continuity:read', 'ops:read'], async () => ({
        businessContinuity:
          await this.deps.enterpriseBusinessContinuityService.buildAuraContext(companyId),
      }));
      await load(['security:read'], async () => ({
        security: await this.deps.enterpriseSecurityService.buildSecurityAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'search_intelligence') {
      await load(['search:read', 'intelligence:read'], async () => ({
        searchIntelligence:
          await this.deps.enterpriseGlobalSearchService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'migration_intelligence') {
      await load(['data_migration:read', 'integrations:read'], async () => ({
        migrationIntelligence:
          await this.deps.enterpriseDataMigrationService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'notification_intelligence') {
      await load(['notifications:read', 'integrations:read'], async () => ({
        notificationIntelligence:
          await this.deps.enterpriseNotificationsService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'platform_health') {
      await load(['platform_health:read', 'integrations:read'], async () => ({
        platformHealth: await this.deps.enterprisePlatformHealthService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'launch_readiness') {
      await load(['launch_center:read', 'ops:read'], async () => ({
        launchReadiness: await this.deps.enterpriseLaunchCenterService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'release_candidate') {
      await load(['release_center:read', 'ops:read'], async () => ({
        releaseCandidate:
          await this.deps.enterpriseReleaseCenterService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'production_launch') {
      await load(['production_launch:read', 'ops:read'], async () => ({
        productionLaunch:
          await this.deps.enterpriseProductionLaunchService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'release_manager') {
      await load(['release_manager:read', 'ops:read'], async () => ({
        releaseManagement:
          await this.deps.enterpriseReleaseManagementService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'procurement') {
      await load(['procurement:read', 'procurement:write'], async () => ({
        procurement: await this.deps.procurementService.buildAuraContext(companyId),
      }));
      await load(['inventory:read', 'inventory:write'], async () => ({
        inventory: await this.deps.inventoryService.buildAuraContext(companyId),
      }));
      await load(['jobs:read', 'jobs:write'], async () => ({
        jobs: await this.deps.jobsService.buildAuraContext(companyId, pageContext?.jobId),
      }));
    }

    if (resolved.agentKey === 'integration') {
      await load(['integrations:read', 'integrations:manage'], async () => ({
        integrationPlatform:
          await this.deps.integrationPlatformService.buildIntegrationAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'business_intelligence') {
      await load(['bi:read', 'analytics:read', 'intelligence:read'], async () => ({
        enterpriseAnalytics:
          await this.deps.enterpriseAnalyticsService.buildAnalyticsAuraContext(companyId),
        businessIntelligence:
          await this.deps.businessIntelligenceService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'automation') {
      await load(['automation:read', 'automation:write'], async () => ({
        enterpriseAutomationStudio:
          await this.deps.enterpriseAutomationStudioService.buildAutomationAuraContext(companyId),
        automation: await this.deps.automationService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'decision_intelligence') {
      await load(['executive:read', 'executive:write', 'intelligence:read'], async () => ({
        enterpriseDigitalTwin:
          await this.deps.enterpriseDigitalTwinService.buildDigitalTwinAuraContext(companyId),
        executive: await this.deps.executiveService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'knowledge') {
      await load(['knowledge:read', 'knowledge:write', 'intelligence:read'], async () => ({
        enterpriseKnowledgeGraph:
          await this.deps.enterpriseKnowledgeGraphService.buildKnowledgeGraphAuraContext(companyId),
        knowledge: await this.deps.knowledgeService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'executive_operations') {
      await load(['executive:read', 'executive:write', 'intelligence:read'], async () => ({
        enterpriseMissionControl:
          await this.deps.enterpriseMissionControlService.buildMissionControlAuraContext(companyId),
        executive: await this.deps.executiveService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'evolution') {
      await load(['intelligence:read', 'executive:read', 'ai_orchestration:read'], async () => ({
        enterpriseEvolution:
          await this.deps.enterpriseEvolutionService.buildEvolutionAuraContext(companyId),
        executive: await this.deps.executiveService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'developer') {
      await load(['integrations:read', 'integrations:manage'], async () => ({
        enterpriseDeveloperPlatform:
          await this.deps.enterpriseDeveloperPlatformService.buildDeveloperAuraContext(companyId),
        integrationApiManagement:
          await this.deps.integrationApiManagementService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'saas') {
      await load(['saas:read', 'saas:manage', 'platform:read'], async () => ({
        enterpriseSaasPlatform:
          await this.deps.enterpriseSaasPlatformService.buildSaasAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'security') {
      await load(['security:read', 'security:write', 'settings:manage'], async () => ({
        security: await this.deps.enterpriseSecurityService.buildSecurityAuraContext(companyId),
      }));
      await load(['integrations:read', 'integrations:manage'], async () => ({
        integrationApiManagement:
          await this.deps.integrationApiManagementService.buildAuraContext(companyId),
      }));
      await load(['orchestration:read'], async () => ({
        orchestration: await this.deps.orchestrationService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'customer_support') {
      await load(['customers:read', 'customers:write'], async () => ({
        crm: await this.deps.crmService.buildAuraContext(companyId, pageContext?.customerId),
      }));
      await load(['customer_support:read', 'customer_support:write'], async () => ({
        customerSupport: await this.deps.customerSupportService.buildAuraContext(companyId),
      }));
      await load(['jobs:read', 'jobs:write'], async () => ({
        jobs: await this.deps.jobsService.buildAuraContext(companyId, pageContext?.jobId),
      }));
      await load(['finance:read', 'finance:write'], async () => ({
        finance: await this.deps.financeService.buildAuraContext(companyId),
      }));
      await load(['voice:read', 'voice:write'], async () => ({
        voice: await this.deps.voiceService.buildAuraContext(companyId),
      }));
    }

    if (resolved.enabledToolKeys.includes('send_whatsapp_draft')) {
      await load(['communications:write', 'integrations:manage'], async () => ({
        whatsapp: await this.deps.whatsappService.buildAuraContext(
          companyId,
          pageContext?.customerId,
        ),
      }));
    }

    await load(['intelligence:read', 'agents:read'], async () => ({
      intelligence: await this.deps.intelligenceService.buildAuraContext(companyId),
    }));

    await load(['intelligence:read'], async () => ({
      memory: await this.deps.memoryService.buildAuraContext(companyId),
    }));

    await load(['analytics:read', 'analytics:write'], async () => ({
      analytics: await this.deps.analyticsService.buildAuraContext(companyId, {
        period: 'monthly',
      }),
    }));

    await load(['orchestration:read', 'orchestration:write', 'agents:read'], async () => ({
      orchestration: await this.deps.orchestrationService.buildAuraContext(companyId),
    }));

    if (
      resolved.agentKey === 'executive' ||
      resolved.agentKey === 'finance' ||
      resolved.agentKey === 'operations'
    ) {
      const recommendations = await this.deps.recommendationsService.getRecommendations(companyId);
      context = {
        ...context,
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

    return context;
  }

  private buildAgentSystemPrompt(
    resolved: ResolvedAgent,
    toolResults: AgentToolExecutionResult[],
    plannedTasks: PlannedTask[],
  ): string {
    const registry = getAgentRegistryEntry(resolved.agentKey);
    const toolLines = toolResults
      .map((result) => `- ${result.toolKey}: ${result.summary}`)
      .join('\n');
    const taskLines = plannedTasks.map((task) => `- ${task.taskType}: ${task.preview}`).join('\n');

    const agentGuidance: Record<AgentKey, string> = {
      executive:
        'Provide business health analysis, strategic recommendations, risk detection, and performance overview across finance, operations, sales, workforce, and procurement. Draft executive actions for review. Never make financial decisions, change prices, spend money, or execute business changes without approval.',
      operations:
        'Analyze technician workload, detect schedule conflicts, recommend job priorities, and check fleet availability. Use technician performance analytics for workload insights. Never reassign jobs without approval.',
      finance:
        'Analyze cash flow, profitability, receivables, expenses, budgets, forecasts, and financial risks. Use finance intelligence tools and analytics data. Draft finance actions for review. Never modify financial records, send payment reminders, process payments, or make accounting changes without approval.',
      recruiting:
        'Analyze workforce capacity, candidate pipeline, skill gaps, technician performance, and staffing needs. Draft job adverts, interview requests, candidate communications, hiring recommendations, and training plans. Never hire, reject, or contact candidates without approval.',
      sales:
        'Analyze sales opportunities, recommend follow-ups, assist with quote preparation, and track pipeline performance. Use customer, quote, and job history only. Never send messages or modify records without approval.',
      marketing:
        'Analyze customer segments, recommend campaigns, assess engagement, and draft marketing content. Use only real CRM, job, and communication data. Never publish, send, or execute marketing actions without approval.',
      lead_generation:
        'Identify and score leads, analyze acquisition sources, recommend qualification actions, and prepare sales handoffs. Use only real lead, CRM, job, quote, and communication data. Never contact leads, create opportunities, or modify records without approval.',
      voice_receptionist:
        'Handle customer enquiries from voice sessions, qualify callers, assist with appointment recommendations, and draft follow-up actions. Use only real call history, CRM, scheduling, and job data. Never make calls, send messages, or execute bookings without approval.',
      customer_support:
        'Answer customer questions, provide job and invoice updates, and draft support responses using authorised customer data only. Escalate when human help is needed. Never send messages, make promises, issue refunds, or modify records without approval.',
      procurement:
        'Analyze stock levels, supplier performance, purchase orders, and inventory risks. Recommend procurement actions and draft purchase orders for review. Never place orders, spend money, or modify stock without approval.',
      security:
        'Monitor security health, review permissions and audit logs, detect anomalies, and recommend security improvements from real tenant activity. Draft security actions for approval. Never lock users, delete data, remove permissions, or disable integrations automatically.',
      integration:
        'Monitor integration health, detect failures, analyze sync issues, and draft integration repairs from real connector and sync data. Never reconnect services, change credentials, or perform destructive actions without approval.',
      business_intelligence:
        'Analyze company performance, explain KPI trends, detect anomalies, and draft strategic reports from real analytics and business intelligence data. Never make autonomous business decisions or execute changes without approval.',
      automation:
        'Analyze workflows, detect bottlenecks, review execution history, and draft workflow improvements from real automation data. Never publish, activate, or execute workflows without approval.',
      decision_intelligence:
        'Analyze business scenarios, compare operational strategies, explain simulation outcomes, detect bottlenecks, and draft decision reports from real digital twin data. Never make autonomous operational changes or execute scenarios without approval.',
      knowledge:
        'Search organizational memory, analyze knowledge graph relationships, explain historical context, and draft knowledge reports from real indexed data. Never autonomously publish, modify, or delete knowledge content without approval.',
      executive_operations:
        'Monitor enterprise operations across all modules, analyze incidents, prioritize alerts, explain operational health, and draft executive briefings from real mission control data. Never autonomously execute command actions, escalate incidents, or modify operational records without approval.',
      evolution:
        'Analyze business evolution, detect patterns, explain optimization opportunities, monitor learning quality, and draft evolution reports from real tenant learning data. Never autonomously deploy optimizations, apply learning, or modify business records without approval.',
      developer:
        'Explain APIs, generate SDK examples, draft integration guides, analyze API usage, recommend extension architecture, and generate webhook examples from real tenant developer platform data. Never autonomously publish extensions, create credentials, or modify API access without approval.',
      saas: 'Explain subscription plans, analyze tenant usage, recommend upgrades, draft onboarding guides and tenant reports, and explain feature availability from real SaaS platform data. Never autonomously provision tenants, modify subscriptions, or change billing without approval.',
      production_operations:
        'Monitor platform health, analyze performance, explain operational incidents, analyze AI provider resilience, identify readiness risks, and draft recovery, maintenance, and scaling plans from real production readiness data. Never autonomously restart services, restore backups, execute migrations, or modify production infrastructure without approval.',
      mobile_field:
        'Assist technicians and dispatchers with job guidance, offline sync health, fleet tracking, troubleshooting, equipment lookup, and field intelligence from real mobile platform data. Draft reports, quotations, and maintenance notes for approval. Never autonomously modifies jobs, devices, sync queues, or production settings without approval.',
      communications:
        'Analyze unified communication history across voice, WhatsApp, SMS, email, and chat channels. Draft replies, call summaries, appointment confirmations, and customer updates from real tenant data. Never autonomously sends communications without approval.',
      customer_experience:
        'Assist customers and staff with portal dashboard insights, appointment bookings, document access, technician tracking, reviews, loyalty, and engagement preferences from real tenant data. Draft support requests, appointment requests, and document requests for approval. Never autonomously books appointments, submits reviews, or sends communications without approval.',
      asset_intelligence:
        'Analyze asset registry, IoT telemetry, maintenance history, and alerts from real tenant data. Assess failure risk and draft maintenance plans, reports, and work orders for approval. Never autonomously decommissions assets, orders parts, dispatches technicians, or alters IoT thresholds without approval.',
      workforce_intelligence:
        'Analyze workforce registry, timesheets, leave, skills, certifications, capacity, and technician performance from real tenant data. Draft onboarding plans, development plans, performance reports, payroll exception summaries, and technician match recommendations for approval. Never autonomously hires, rejects, terminates, suspends, changes pay, submits payroll, or revokes access.',
      legal_compliance:
        'Analyze contracts, policies, obligations, compliance records, risks, controls, legal matters, and insurance from real tenant data. Draft contract summaries, policy documents, compliance reports, risk reports, legal matter summaries, and notices for human review only. All outputs are AI-generated, not legal advice, and require professional verification. Never autonomously approves contracts, signs agreements, terminates contracts, provides final legal advice, files legal documents, admits liability, settles disputes, sends legal notices, deletes records, or makes regulatory determinations.',
      financial_planning:
        'Analyze budgets, forecasts, cash flow, treasury, receivables, payables, profitability, and working capital from real tenant data. Draft cash-flow reports, budget/forecast commentary, profitability reports, payment-plan proposals, and executive financial summaries for approval. Clearly distinguish actuals, forecasts, assumptions, and simulations. Never autonomously transfers funds, submits payments, changes bank details, approves budgets, issues refunds, writes off debt, creates accounting entries, or contacts customers or suppliers without approval.',
      sales_intelligence:
        'Analyze leads, opportunities, pipeline, forecasts, accounts, renewals, and customer growth from real tenant data. Draft lead replies, follow-ups, proposals, quote commentary, renewal messages, account plans, and executive revenue summaries for approval. Clearly distinguish actual revenue, pipeline, forecasts, and simulations. Never autonomously contacts leads or customers, approves discounts, approves quotes, rejects leads, changes ownership, submits tenders, promises unavailable capacity, or alters commission records.',
      marketing_intelligence:
        'Analyze marketing strategies, campaigns, audiences, content, advertising, attribution, and ROI from real tenant data. Draft campaign plans, social posts, emails, ad copy, and executive marketing summaries for approval. All generated content is AI-generated and requires human review before publication. Never autonomously publishes content, sends marketing messages, activates advertisements, increases spending, modifies production websites, responds publicly to reviews, overrides consent, or creates fake engagement.',
      service_delivery:
        'Analyze jobs, inspections, SLA compliance, quality records, warranties, and callbacks from real tenant data. Draft quality reports, corrective actions, inspection summaries, and executive service summaries for approval. Never autonomously closes jobs, approves quality, signs inspections, accepts customer work, changes financial records, or alters warranty claims.',
      it_operations:
        'Analyze platform health, incidents, bug detections, deployments, and monitoring signals from real tenant data. Draft incident updates, RCA summaries, and repair plans for approval. Never autonomously executes repairs, deploys changes, resolves incidents, or runs safe repairs without explicit approval.',
      business_evolution:
        'Analyze observations, patterns, hypotheses, experiments, and outcomes from real tenant data. Draft experiment plans, improvement plans, hypotheses, and executive evolution summaries for approval. Never autonomously runs experiments, changes production systems, modifies permissions, billing, or customer-facing content.',
      app_builder:
        'Analyze natural-language feature requests, requirements, architecture impact, development workspaces, tests, previews, and deployments from real tenant data. Draft implementation plans, requirements specs, test plans, and deployment plans for owner approval. Never autonomously generates code, deploys changes, modifies schemas, alters RBAC, billing, finance, payroll, security, or production integrations.',
      industry_intelligence:
        'Analyze installed industry packs, templates, compliance frameworks, equipment catalogs, and certificates from real tenant data. Draft job templates, compliance documents, reports, workflows, and checklists for approval. Recommend improvements only. Never autonomously modifies legal compliance, issues certificates without completed work, or makes regulatory determinations.',
      developer_platform:
        'Analyze public API documentation, scopes, webhooks, SDK packages, delivery history, and usage from real tenant data. Draft integration guides, webhook configurations, API examples, SDK examples, and diagnostic reports for approval. Never exposes secrets, API keys, OAuth credentials, or tenant PII. Never autonomously creates credentials, webhook endpoints, or deploys integrations.',
      saas_management:
        'Analyze subscription plans, billing records, usage metrics, licenses, and tenant health from real SaaS platform data. Draft subscription reports, billing summaries, usage reports, renewal forecasts, and plan recommendations for approval. Never autonomously charges customers, modifies subscriptions, processes payments, or changes plans without authorization.',
      voice_reception:
        'Analyze call history, live calls, routing configuration, schedules, CRM, and approved knowledge from real tenant data. Draft call summaries, follow-up tasks, CRM notes, job notes, callback requests, leads, appointment bookings, and routing recommendations for approval. Answer only from approved knowledge — never invent answers. Never autonomously books appointments, creates leads, routes calls, or modifies critical records without authorization.',
      document_intelligence:
        'Analyze documents, OCR results, classifications, extractions, review queue, and processing health from real tenant data. Draft extraction corrections, document summaries, workflow actions, and compliance suggestions for approval. Never approves extractions, modifies business records, or creates operational entries without human authorization.',
      business_continuity:
        'Analyze backup status, restore history, recovery plans, verification reports, and continuity analytics from real tenant data. Draft recovery plans, verification reports, continuity improvements, and recovery test schedules for approval. Never executes restores, modifies production data, or runs recovery actions without explicit owner authorization.',
      search_intelligence:
        'Analyze global search indexes, timelines, activity feeds, relationships, and search analytics from real tenant data respecting RBAC. Draft search reports, activity summaries, and related record recommendations for approval. Never modifies business records or exposes data the user is not authorized to access.',
      migration_intelligence:
        'Analyze import jobs, validation results, field mappings, exports, migration history, and analytics from real tenant data. Draft mapping suggestions, validation corrections, migration reports, and cleanup recommendations for approval. Never executes imports, rollbacks, or destructive changes without explicit human authorization.',
      notification_intelligence:
        'Analyze notifications, alerts, escalations, delivery jobs, templates, rules, and analytics from real tenant data. Draft templates, escalation rules, delivery reports, and improvement recommendations for approval. Never sends notifications without a legitimate originating system event or explicit human authorization.',
      platform_health:
        'Analyze platform health metrics, diagnostics, incidents, performance insights, and capacity data from real tenant telemetry. Draft incident reports, optimization recommendations, capacity forecasts, and diagnostic summaries for approval. Never restarts services, modifies infrastructure, or auto-closes incidents.',
      launch_readiness:
        'Analyze launch readiness scans, acceptance test results, go-live wizards, deployment validations, and rollback plans from real platform data. Draft readiness reports, deployment plans, rollout checklists, and rollback recommendations for approval. Never deploys, approves production releases, or initiates rollback automatically.',
      release_candidate:
        'Analyze integration validation, workflow validation, performance snapshots, security verification, configuration reviews, and release candidate reports from real platform data. Draft release notes, optimization plans, and deployment recommendations for approval. Never deploys production automatically or applies destructive optimizations.',
      production_launch:
        'Analyze production environment configuration, live provider connectivity, domain and security reviews, deployment pipeline status, commercial readiness, mobile production readiness, and go-live wizard progress from real platform data. Draft deployment plans, launch reports, and post-launch checklists for approval. Never deploys production automatically.',
      release_manager:
        'Analyze release readiness, mobile packaging reviews, app store checklists, branding verification, documentation completeness, UX recommendations, and final launch checklist from real platform data. Draft release notes, user documentation, administrator documentation, and post-launch recommendations for approval. Never publishes applications automatically.',
    };

    return (
      `You are ${resolved.agentName}, an operational AURA agent for TITAN.\n` +
      `Agent focus: ${registry?.description ?? 'Business assistance'}\n` +
      `Focus areas: ${registry?.focusAreas.join(', ') ?? 'General'}\n\n` +
      `Agent guidance: ${agentGuidance[resolved.agentKey]}\n\n` +
      `Rules:\n` +
      `- Never execute mutating actions automatically.\n` +
      `- All write actions require explicit user approval via task cards.\n` +
      `- Use only the business data and tool results provided.\n` +
      `- If data is missing, say so clearly.\n\n` +
      (toolLines ? `Tool activity:\n${toolLines}\n\n` : '') +
      (taskLines ? `Pending approval tasks prepared:\n${taskLines}\n\n` : '') +
      `Respond helpfully to the user's request using the loaded context.`
    );
  }

  private async getTaskForAction(companyId: string, taskId: string) {
    const task = await this.deps.db.query.agentTasks.findFirst({
      where: and(eq(agentTasks.id, taskId), eq(agentTasks.companyId, companyId)),
    });

    if (!task) {
      throw new AgentRuntimeError('NOT_FOUND', 'Agent task not found');
    }

    return task;
  }

  private async toRunSummary(
    row: typeof agentRuns.$inferSelect & {
      user?: typeof users.$inferSelect;
      agentProfile?: typeof agentProfiles.$inferSelect | null;
      tasks?: (typeof agentTasks.$inferSelect)[];
    },
  ): Promise<AgentRunSummary> {
    const registry = getAgentRegistryEntry(row.agentKey);

    return {
      id: row.id,
      agentProfileId: row.agentProfileId,
      agentKey: row.agentKey,
      agentName: row.agentProfile?.name ?? registry?.name ?? row.agentKey,
      userId: row.userId,
      userName: row.user ? `${row.user.firstName} ${row.user.lastName}`.trim() : 'Unknown',
      request: row.request,
      response: row.response,
      toolsUsed: row.toolsUsed ?? [],
      status: row.status,
      errorMessage: row.errorMessage,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      taskCount: row.tasks?.length ?? 0,
    };
  }

  private async toTaskSummary(
    row: typeof agentTasks.$inferSelect & {
      user?: typeof users.$inferSelect;
      approvedBy?: typeof users.$inferSelect | null;
      agentProfile?: typeof agentProfiles.$inferSelect | null;
    },
  ): Promise<AgentTaskSummary> {
    const registry = getAgentRegistryEntry(row.agentKey);

    return {
      id: row.id,
      agentRunId: row.agentRunId,
      agentProfileId: row.agentProfileId,
      agentKey: row.agentKey,
      agentName: row.agentProfile?.name ?? registry?.name ?? row.agentKey,
      userId: row.userId,
      userName: row.user ? `${row.user.firstName} ${row.user.lastName}`.trim() : 'Unknown',
      taskType: row.taskType,
      status: row.status,
      approvalRequired: row.approvalRequired,
      preview: row.preview,
      payload: (row.payload as Record<string, unknown>) ?? {},
      result: (row.result as Record<string, unknown> | null) ?? null,
      approvedByUserId: row.approvedByUserId,
      approvedByName: row.approvedBy
        ? `${row.approvedBy.firstName} ${row.approvedBy.lastName}`.trim()
        : null,
      executedAt: row.executedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function detectAgentKey(request: string): AgentKey {
  const lower = request.toLowerCase();

  if (
    /invoice|payment|owe|revenue|finance|xero|unpaid|balance|cash|budget|operating profit|gross profit|growth planner|on track/.test(
      lower,
    )
  ) {
    return 'finance';
  }

  if (/technician|schedule|fleet|dispatch|available|cartrack|gps|workload|conflict/.test(lower)) {
    return 'operations';
  }

  if (
    /candidate|interview|hire|recruit|job ad|applicant|screening|workforce|staffing|skill gap|training plan|technician capacity|need another technician/.test(
      lower,
    )
  ) {
    return 'recruiting';
  }

  if (/sales|quote|pipeline|opportunity|follow.?up|prospect|upsell|revenue growth/.test(lower)) {
    return 'sales';
  }

  if (/marketing|campaign|segment|retention|brand|content idea|audience/.test(lower)) {
    return 'marketing';
  }

  if (
    /lead generation|acquisition|qualify lead|lead score|lead pipeline|prospect|new lead/.test(
      lower,
    )
  ) {
    return 'lead_generation';
  }

  if (
    /voice|receptionist|phone call|caller|incoming call|call summary|call history|enquiry/.test(
      lower,
    )
  ) {
    return 'voice_receptionist';
  }

  if (
    /customer support|support ticket|customer question|unresolved issue|help this customer|customer needs/.test(
      lower,
    )
  ) {
    return 'customer_support';
  }

  if (
    /how is my business|business health|executive summary|strategic recommendation|what needs my attention|losing money|business performing/.test(
      lower,
    )
  ) {
    return 'executive';
  }

  if (
    /procurement|purchase order|reorder|low stock|supplier|inventory risk|stock level|what should we purchase/.test(
      lower,
    )
  ) {
    return 'procurement';
  }

  return 'executive';
}

function extractQuotedText(request: string): string | null {
  const match = request.match(/"([^"]+)"/);
  return match?.[1] ?? null;
}

function extractNameFromRequest(request: string): string | null {
  const match = request.match(/(?:candidate|applicant|named?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  return match?.[1] ?? null;
}

function extractRoleFromRequest(request: string): string | null {
  const match = request.match(/(?:for|role|position)\s+([a-z0-9\s/-]{3,40})/i);
  return match?.[1]?.trim() ?? null;
}
