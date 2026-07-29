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
  automationService: AutomationService;
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

    if (!this.deps.provider) {
      throw new AgentRuntimeError(
        'PROVIDER_NOT_CONFIGURED',
        'AURA AI provider is not configured. Set AURA_OPENAI_API_KEY in the server environment.',
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
      const toolResults = await this.executeReadTools(scope, resolved, userPermissions, input.pageContext);
      const toolsUsed = toolResults.map((result) => result.toolKey);
      const plannedTasks = this.planMutatingTasks(request, resolved, toolResults, input.pageContext);

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
      const assistantMessage = await this.deps.provider.generate({
        messages: [
          { role: 'system', content: agentPrompt },
          { role: 'user', content: request },
        ],
        context,
      });

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
            eq(agentTasks.status, status as typeof agentTasks.$inferSelect['status']),
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
      enabledToolKeys: enabledToolKeys.filter((toolKey) => this.canUseTool(toolKey, userPermissions)),
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
        const tracking = await this.deps.integrationsService.buildFleetTrackingContext(scope.companyId);
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
      case 'read_analytics_dashboard': {
        const dashboard = await this.deps.analyticsService.getDashboard(scope.companyId, { period: 'monthly' });
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
        const technicians = await this.deps.analyticsService.getTechnicianPerformance(scope.companyId, {
          period: 'monthly',
        });
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
        let targetLead = activeLeads.find((row) => row.customerId === pageContext?.customerId) ?? null;

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

        const result = await this.deps.leadsService.analyzeLeadScore(scope.companyId, targetLead.id);
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
        const calls = await this.deps.communicationsIntelligenceService.getCallHistory(scope.companyId);
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

        const summary = await this.deps.voiceService.summarizeCall(scope.companyId, targetSession.id);
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
        const conversations = await this.deps.customerSupportService.listConversations(scope.companyId);
        const target =
          conversations.find((row) => row.customerId === pageContext?.customerId) ?? conversations[0];

        if (!target) {
          return {
            toolKey,
            success: true,
            summary: 'No support conversations available.',
            data: { conversations: [] },
          };
        }

        const messages = await this.deps.customerSupportService.listMessages(scope.companyId, target.id);
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

        const status = await this.deps.customerSupportService.getCustomerJobStatus(scope.companyId, customerId);
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
        const staffingInsights = await this.deps.workforceService.getStaffingInsights(scope.companyId);
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
        const stockIntelligence = await this.deps.procurementService.getStockIntelligence(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${stockIntelligence.length} stock intelligence signal(s) identified.`,
          data: { stockIntelligence: stockIntelligence.slice(0, 20) },
        };
      }
      case 'read_supplier_insights': {
        const supplierInsights = await this.deps.procurementService.getSupplierInsights(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${supplierInsights.length} supplier insight(s) available.`,
          data: { supplierInsights },
        };
      }
      case 'read_purchase_orders': {
        const purchaseOrders = await this.deps.procurementService.listPurchaseOrders(scope.companyId);
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
        const recommendations = await this.deps.executiveService.listRecommendations(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${recommendations.length} strategic recommendation(s) loaded.`,
          data: { recommendations: recommendations.slice(0, 20) },
        };
      }
      case 'read_cashflow_context': {
        const cashFlow = await this.deps.financeIntelligenceService.getCashFlowIntelligence(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: cashFlow.summary,
          data: { cashFlow },
        };
      }
      case 'read_profitability_context': {
        const profitability = await this.deps.financeIntelligenceService.getProfitabilityIntelligence(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: profitability.summary,
          data: { profitability },
        };
      }
      case 'read_receivables_context': {
        const receivables = await this.deps.financeIntelligenceService.getReceivablesIntelligence(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: receivables.summary,
          data: { receivables },
        };
      }
      case 'read_expense_context': {
        const expenses = await this.deps.financeIntelligenceService.getExpenseIntelligence(scope.companyId);
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
          this.deps.financeIntelligenceService
            .listBudgets(scope.companyId)
            .then(async (rows) => {
              const active = rows.find((row) => row.status === 'active') ?? rows[0];
              if (!active) return null;
              return this.deps.financeIntelligenceService.getBudgetVariance(scope.companyId, active.id);
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
        const forecast = await this.deps.financeIntelligenceService.getFinanceForecast(scope.companyId, 'monthly');
        return {
          toolKey,
          success: true,
          summary: forecast.summary,
          data: { forecast },
        };
      }
      case 'read_knowledge_base': {
        const context = await this.deps.knowledgeService.buildAuraContext(scope.companyId);
        const articles = await this.deps.knowledgeService.listArticles(scope.companyId, userPermissions);
        return {
          toolKey,
          success: true,
          summary: context.summary,
          data: { context, articles: articles.slice(0, 15) },
        };
      }
      case 'search_knowledge': {
        const articles = await this.deps.knowledgeService.listArticles(scope.companyId, userPermissions);
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
        const policies = await this.deps.knowledgeService.listPolicies(scope.companyId, userPermissions);
        const policy = policies[0]
          ? await this.deps.knowledgeService.getPolicy(scope.companyId, policies[0].id, userPermissions)
          : null;
        return {
          toolKey,
          success: true,
          summary: policy ? `Policy loaded: ${policy.title}` : `${policies.length} policy document(s) available.`,
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
        const forecasts = await this.deps.businessIntelligenceService.listForecasts(scope.companyId);
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
        const validation = await this.deps.workflowStudioService.validateWorkflow(scope.companyId, workflowId);
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
        const simulation = await this.deps.workflowStudioService.simulateWorkflow(scope, workflowId, {});
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
        const registry = await this.deps.integrationApiManagementService.listRegistry(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${registry.length} integration(s) in registry.`,
          data: { registry: registry.slice(0, 20) },
        };
      }
      case 'read_api_health': {
        const health = await this.deps.integrationApiManagementService.getApiHealth(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${health.length} integration health snapshot(s).`,
          data: { health },
        };
      }
      case 'read_sync_status': {
        const sync = await this.deps.integrationApiManagementService.getSyncManagerStatus(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${sync.syncJobs.length} sync job(s), ${sync.scheduledSyncs.filter((row) => row.enabled).length} scheduled.`,
          data: { sync },
        };
      }
      case 'read_webhook_status': {
        const deliveries = await this.deps.integrationApiManagementService.listWebhookDeliveries(scope.companyId, 20);
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
          throw new AgentRuntimeError('VALIDATION_ERROR', 'integrationProvider in page context is required');
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
            : validation.checks.filter((check) => !check.passed).map((check) => check.message).join('; '),
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
          throw new AgentRuntimeError('VALIDATION_ERROR', 'knowledgeQuery in page context is required');
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
        const dashboard = await this.deps.qualityAssuranceService.getExecutiveDashboard(scope.companyId);
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
          ? comebacks.find((item) => item.originalJobId === pageContext.jobId || item.comebackJobId === pageContext.jobId)?.id
          : comebacks[0]?.id;
        const analysis = comebackId
          ? await this.deps.qualityAssuranceService.getRootCauseAnalysis(scope.companyId, comebackId)
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
        const intelligence = await this.deps.qualityAssuranceService.getSupplierIntelligence(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${intelligence.totalDefectCount} supplier defect(s), ${intelligence.recurringDefectCount} recurring.`,
          data: intelligence,
        };
      }
      case 'read_customer_communications': {
        const customerId = pageContext?.customerId;
        const timeline = await this.deps.communicationsIntelligenceService.buildTimeline(scope.companyId, {
          customerId,
          limit: 30,
        });
        return {
          toolKey,
          success: true,
          summary: `${timeline.length} communication event(s)${customerId ? ' for customer' : ''}.`,
          data: { timeline },
        };
      }
      case 'read_conversation_summary': {
        const insights = await this.deps.communicationsIntelligenceService.listConversationInsights(scope.companyId);
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
        const threads = await this.deps.communicationsIntelligenceService.listEmailThreads(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${threads.length} email thread(s).`,
          data: { threads: threads.slice(0, 20) },
        };
      }
      case 'read_sms_history': {
        const records = await this.deps.communicationsIntelligenceService.listSmsRecords(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${records.length} SMS record(s).`,
          data: { records: records.slice(0, 20) },
        };
      }
      case 'read_asset_register': {
        const assets = await this.deps.assetEquipmentIntelligenceService.listAssets(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${assets.length} asset(s) in register.`,
          data: { assets: assets.slice(0, 20) },
        };
      }
      case 'read_asset_history': {
        const history = await this.deps.assetEquipmentIntelligenceService.listLifecycleHistory(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${history.length} lifecycle event(s).`,
          data: { history: history.slice(0, 20) },
        };
      }
      case 'read_maintenance_schedule': {
        const schedules = await this.deps.assetEquipmentIntelligenceService.listMaintenanceSchedules(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${schedules.length} maintenance schedule(s).`,
          data: { schedules: schedules.slice(0, 20) },
        };
      }
      case 'read_asset_performance': {
        const analytics = await this.deps.assetEquipmentIntelligenceService.getPerformanceAnalytics(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${analytics.totalAssets} asset(s), ${analytics.totalMaintenanceCostCents} maintenance cost (cents).`,
          data: analytics,
        };
      }
      case 'read_inspection_history': {
        const inspections = await this.deps.assetEquipmentIntelligenceService.listInspections(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${inspections.length} inspection record(s).`,
          data: { inspections: inspections.slice(0, 20) },
        };
      }
      case 'read_calibration_status': {
        const calibrations = await this.deps.assetEquipmentIntelligenceService.listCalibrations(scope.companyId);
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
        const costAnalytics = await this.deps.aiOrchestrationService.getCostAnalytics(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${costAnalytics.totalTokens} tokens, ${costAnalytics.totalCostCents} cost (cents).`,
          data: costAnalytics,
        };
      }
      case 'read_ai_quality': {
        const qualityAnalytics = await this.deps.aiOrchestrationService.getQualityAnalytics(scope.companyId);
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
        const dashboard = await this.deps.dispatchIntelligenceService.getOperationsDashboard(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard,
        };
      }
      case 'read_call_queue': {
        const callQueue = await this.deps.dispatchIntelligenceService.getCallQueueAnalytics(scope.companyId);
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
        const recommendations = await this.deps.dispatchIntelligenceService.listRecommendations(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${recommendations.length} dispatch recommendation(s).`,
          data: { recommendations: recommendations.slice(0, 20) },
        };
      }
      case 'read_callback_queue': {
        const callbacks = await this.deps.dispatchIntelligenceService.listCallbackRequests(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${callbacks.length} callback request(s).`,
          data: { callbacks: callbacks.slice(0, 20) },
        };
      }
      case 'read_emergency_dispatch': {
        const assessments = await this.deps.dispatchIntelligenceService.listEmergencyAssessments(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${assessments.length} emergency assessment(s).`,
          data: { assessments: assessments.slice(0, 20) },
        };
      }
      case 'read_fleet_dashboard': {
        const dashboard = await this.deps.fleetIntelligenceService.getExecutiveDashboard(scope.companyId);
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
        const reports = await this.deps.fleetIntelligenceService.listMonthlyReports(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${reports.length} monthly report(s).`,
          data: { reports: reports.slice(0, 12) },
        };
      }
      case 'read_driver_behaviour': {
        const events = await this.deps.fleetIntelligenceService.listDriverBehaviourEvents(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${events.length} driver behaviour event(s).`,
          data: { events: events.slice(0, 50) },
        };
      }
      case 'read_vehicle_utilization': {
        const utilization = await this.deps.fleetIntelligenceService.getVehicleUtilization(scope.companyId);
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
        const dashboard = await this.deps.personalCommunicationsIntelligenceService.getExecutiveDashboard(
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
          await this.deps.personalCommunicationsIntelligenceService.listBusinessConversations(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${conversations.length} business conversation(s).`,
          data: { conversations: conversations.slice(0, 20) },
        };
      }
      case 'read_voice_note_summary': {
        const analyses = await this.deps.personalCommunicationsIntelligenceService.listVoiceAnalyses(scope.companyId);
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
          data: { mediaAnalyses: mediaAnalyses.slice(0, 20), documentAnalyses: documentAnalyses.slice(0, 20) },
        };
      }
      case 'read_follow_up_queue': {
        const followUps = await this.deps.personalCommunicationsIntelligenceService.listFollowUpQueue(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${followUps.length} follow-up item(s).`,
          data: { followUps: followUps.slice(0, 20) },
        };
      }
      case 'read_communication_classification': {
        const conversations =
          await this.deps.personalCommunicationsIntelligenceService.listBusinessConversations(scope.companyId);
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
        const dashboard = await this.deps.enterpriseSecurityService.getExecutiveDashboard(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard,
        };
      }
      case 'read_audit_logs': {
        const auditLogs = await this.deps.enterpriseSecurityService.listAuditLogs(scope.companyId, 50);
        return {
          toolKey,
          success: true,
          summary: `${auditLogs.length} audit log event(s).`,
          data: { auditLogs },
        };
      }
      case 'read_active_sessions': {
        const sessions = await this.deps.enterpriseSecurityService.listActiveSessions(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${sessions.length} active session(s).`,
          data: { sessions: sessions.slice(0, 30) },
        };
      }
      case 'read_risk_alerts': {
        const riskAlerts = await this.deps.enterpriseSecurityService.listRiskAlerts(scope.companyId, false);
        return {
          toolKey,
          success: true,
          summary: `${riskAlerts.length} unresolved risk alert(s).`,
          data: { riskAlerts },
        };
      }
      case 'read_login_events': {
        const loginEvents = await this.deps.enterpriseSecurityService.listLoginEvents(scope.companyId, 50);
        return {
          toolKey,
          success: true,
          summary: `${loginEvents.length} login event(s).`,
          data: { loginEvents },
        };
      }
      case 'read_integration_platform_dashboard': {
        const dashboard = await this.deps.integrationPlatformService.getExecutiveDashboard(scope.companyId);
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
        const dashboard = await this.deps.enterpriseAnalyticsService.getExecutiveDashboard(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard,
        };
      }
      case 'read_data_warehouse': {
        const warehouse = await this.deps.enterpriseAnalyticsService.getWarehouseSummary(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${warehouse.modules.length} module(s), ${warehouse.snapshots.length} snapshot(s), ${warehouse.lineage.length} lineage record(s).`,
          data: warehouse,
        };
      }
      case 'read_analytics_governance': {
        const governance = await this.deps.enterpriseAnalyticsService.getGovernanceSummary(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${governance.datasetPermissions.length} dataset permission(s), ${governance.retentionPolicies.length} retention policy(ies).`,
          data: governance,
        };
      }
      case 'read_automation_studio_dashboard': {
        const dashboard = await this.deps.enterpriseAutomationStudioService.getExecutiveDashboard(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: dashboard.summary,
          data: dashboard,
        };
      }
      case 'read_automation_monitoring': {
        const monitoring = await this.deps.enterpriseAutomationStudioService.getMonitoringSummary(scope.companyId);
        return {
          toolKey,
          success: true,
          summary: `${monitoring.runningCount} running, ${monitoring.failedCount} failed, queue depth ${monitoring.queueDepth}.`,
          data: monitoring,
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

    if (enabled.has('send_whatsapp_draft') && /whatsapp|message|send.*(customer|update)/i.test(request)) {
      const customerData = toolResults.find((result) => result.toolKey === 'read_customers')?.data;
      const customers = (customerData?.customers as Array<{ id: string; name: string }> | undefined) ?? [];
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

    if (enabled.has('create_candidate') && /create candidate|add candidate|new applicant/i.test(request)) {
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
          payload: { status: statusMatch[1]!.toLowerCase(), candidateName: extractNameFromRequest(request) },
        });
      }
    }

    if (enabled.has('draft_job_ad') && /draft.*(job ad|advert|posting)|write.*job ad/i.test(request)) {
      tasks.push({
        taskType: 'draft_job_ad',
        preview: 'Draft job advert for review',
        payload: {
          roleTitle: extractRoleFromRequest(request) ?? 'Open role',
          content: request,
        },
      });
    }

    if (enabled.has('draft_interview_questions') && /interview question|questions for/i.test(request)) {
      tasks.push({
        taskType: 'draft_interview_questions',
        preview: 'Draft interview questions for review',
        payload: {
          roleTitle: extractRoleFromRequest(request) ?? 'Open role',
          content: request,
        },
      });
    }

    if (enabled.has('store_memory') && /remember|save.*rule|business rule|always create/i.test(request)) {
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
      /executive action|strategic action|business decision|approve plan|leadership action/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_executive_action',
        preview: 'Draft executive action for review',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_finance_action') &&
      /finance action|budget adjustment|collection plan|pricing change|expense reduction|cash flow plan|finance recommendation/i.test(request)
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
      /integration action|sync integration|rotate credential|webhook replay|developer api key|integration hub/i.test(request)
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
      /customer request|reschedule appointment|cancel appointment|quote clarification|approve quote|portal request/i.test(request)
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
      /mobile request|inventory request|overtime request|schedule change|workforce request|stock request|field request/i.test(request)
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
      /quality action|coaching recommendation|retraining recommendation|warning recommendation|labour recovery|material recovery/i.test(request)
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
      /draft reply|customer reply|suggested reply|respond to customer|reply to customer/i.test(request)
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
      /draft follow.?up|follow.?up recommendation|schedule follow.?up|customer follow.?up/i.test(request) &&
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
      /maintenance action|maintenance work order|service schedule|preventative maintenance/i.test(request)
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
      /provider configuration|configure provider|switch provider|model routing|ai provider/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_provider_configuration',
        preview: 'Draft AI provider configuration for approval (no automatic changes)',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_dispatch_action') &&
      /dispatch action|reassign technician|dispatch recommendation|emergency dispatch|assign job/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_dispatch_action',
        preview: 'Draft dispatch action for approval (no automatic assignment)',
        payload: { content: request, jobId: pageContext?.jobId ?? null },
      });
    }

    if (
      enabled.has('draft_callback_action') &&
      /callback action|schedule callback|customer callback|return call|missed call callback/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_callback_action',
        preview: 'Draft callback action for approval (no automatic customer contact)',
        payload: { content: request, customerId: pageContext?.customerId ?? null },
      });
    }

    if (
      enabled.has('draft_fleet_action') &&
      /fleet action|fleet recommendation|maintenance planning|route optimization|fleet balancing|technician allocation/i.test(request)
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
      /business action|communication action|whatsapp action|follow-up action|draft reply workflow/i.test(request)
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
        preview: 'Draft integration repair for approval (no automatic reconnect or credential change)',
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
      enabled.has('draft_knowledge_article') &&
      /knowledge article|document article|write sop|create documentation|knowledge base article|publish article/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_knowledge_article',
        preview: 'Draft knowledge article for review',
        payload: { content: request },
      });
    }

    if (
      enabled.has('draft_business_report') &&
      /business report|bi report|executive report|cross-module report|analytics report|dashboard report/i.test(request)
    ) {
      tasks.push({
        taskType: 'draft_business_report',
        preview: 'Draft business report for review',
        payload: { content: request },
      });
    }

    if (enabled.has('draft_sales_follow_up') && /follow.?up|contact customer|reach out|sales follow/i.test(request)) {
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

    if (enabled.has('draft_marketing_campaign') && /marketing campaign|campaign idea|launch campaign/i.test(request)) {
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

    if (enabled.has('draft_lead_follow_up') && /lead follow.?up|follow up lead|contact lead|lead reminder/i.test(request)) {
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

    if (enabled.has('draft_follow_up_from_call') && /follow.?up.*call|call follow.?up|after the call|from the call/i.test(request)) {
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

    if (enabled.has('draft_lead_from_call') && /lead.*call|new caller|new enquiry|caller.*lead/i.test(request)) {
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

    if (enabled.has('draft_customer_response') && /customer response|reply to customer|support response|answer customer/i.test(request)) {
      tasks.push({
        taskType: 'draft_customer_response',
        preview: 'Draft customer support response for review',
        payload: {
          customerId: pageContext?.customerId ?? null,
          content: extractQuotedText(request) ?? request,
        },
      });
    }

    if (enabled.has('draft_appointment_update') && /appointment update|schedule update|booking update|reschedule/i.test(request)) {
      tasks.push({
        taskType: 'draft_appointment_update',
        preview: 'Draft appointment update for customer review',
        payload: {
          customerId: pageContext?.customerId ?? null,
          content: request,
        },
      });
    }

    if (enabled.has('draft_invoice_explanation') && /invoice explanation|explain invoice|payment question|bill question/i.test(request)) {
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
          | 'new'
          | 'scheduled'
          | 'in_progress'
          | 'completed'
          | 'cancelled';
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
          candidates.find((entry) => entry.name.toLowerCase().includes(candidateName)) ?? candidates[0];

        if (!candidate) {
          throw new AgentRuntimeError('NOT_FOUND', 'No candidate found to update');
        }

        const updated = await this.deps.recruitingService.updateCandidate(scope.companyId, candidate.id, {
          status: payload.status as 'new' | 'screening' | 'interview' | 'offered' | 'rejected',
        });
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
        return {
          saved: false,
          draftType: task.taskType,
          roleTitle: payload.roleTitle ?? null,
          customerId: payload.customerId ?? null,
          jobId: payload.jobId ?? null,
          vehicleId: payload.vehicleId ?? null,
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

    const load = async (permissions: string[], loader: () => Promise<Partial<AuraGenerateContext>>) => {
      if (hasAnyPermission(userPermissions, permissions)) {
        context = { ...context, ...(await loader()) };
      }
    };

    if (resolved.agentKey === 'executive' || resolved.agentKey === 'operations' || resolved.agentKey === 'finance') {
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
        fleetIntelligence: await this.deps.fleetIntelligenceService.buildFleetIntelligenceAuraContext(companyId),
      }));
      await load(['personal_communications:read', 'communications_intelligence:read', 'communications:read'], async () => ({
        personalCommunications:
          await this.deps.personalCommunicationsIntelligenceService.buildPersonalCommunicationsAuraContext(companyId),
      }));
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
        businessIntelligence: await this.deps.businessIntelligenceService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'finance') {
      await load(['analytics:read'], async () => ({
        analytics: await this.deps.analyticsService.buildAuraContext(companyId, { period: 'monthly' }),
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
        analytics: await this.deps.analyticsService.buildAuraContext(companyId, { period: 'monthly' }),
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
        integrationPlatform: await this.deps.integrationPlatformService.buildIntegrationAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'business_intelligence') {
      await load(['bi:read', 'analytics:read', 'intelligence:read'], async () => ({
        enterpriseAnalytics: await this.deps.enterpriseAnalyticsService.buildAnalyticsAuraContext(companyId),
        businessIntelligence: await this.deps.businessIntelligenceService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'automation') {
      await load(['automation:read', 'automation:write'], async () => ({
        enterpriseAutomationStudio:
          await this.deps.enterpriseAutomationStudioService.buildAutomationAuraContext(companyId),
        automation: await this.deps.automationService.buildAuraContext(companyId),
      }));
    }

    if (resolved.agentKey === 'security') {
      await load(['security:read', 'security:write', 'settings:manage'], async () => ({
        security: await this.deps.enterpriseSecurityService.buildSecurityAuraContext(companyId),
      }));
      await load(['integrations:read', 'integrations:manage'], async () => ({
        integrationApiManagement: await this.deps.integrationApiManagementService.buildAuraContext(companyId),
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
        whatsapp: await this.deps.whatsappService.buildAuraContext(companyId, pageContext?.customerId),
      }));
    }

    await load(['intelligence:read', 'agents:read'], async () => ({
      intelligence: await this.deps.intelligenceService.buildAuraContext(companyId),
    }));

    await load(['intelligence:read'], async () => ({
      memory: await this.deps.memoryService.buildAuraContext(companyId),
    }));

    await load(['analytics:read', 'analytics:write'], async () => ({
      analytics: await this.deps.analyticsService.buildAuraContext(companyId, { period: 'monthly' }),
    }));

    await load(['orchestration:read', 'orchestration:write', 'agents:read'], async () => ({
      orchestration: await this.deps.orchestrationService.buildAuraContext(companyId),
    }));

    if (resolved.agentKey === 'executive' || resolved.agentKey === 'finance' || resolved.agentKey === 'operations') {
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
    const toolLines = toolResults.map((result) => `- ${result.toolKey}: ${result.summary}`).join('\n');
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
      tasks?: typeof agentTasks.$inferSelect[];
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

  if (/invoice|payment|owe|revenue|finance|xero|unpaid|balance/.test(lower)) {
    return 'finance';
  }

  if (/technician|schedule|fleet|dispatch|available|cartrack|gps|workload|conflict/.test(lower)) {
    return 'operations';
  }

  if (/candidate|interview|hire|recruit|job ad|applicant|screening|workforce|staffing|skill gap|training plan|technician capacity|need another technician/.test(lower)) {
    return 'recruiting';
  }

  if (/sales|quote|pipeline|opportunity|follow.?up|prospect|upsell|revenue growth/.test(lower)) {
    return 'sales';
  }

  if (/marketing|campaign|segment|retention|brand|content idea|audience/.test(lower)) {
    return 'marketing';
  }

  if (/lead generation|acquisition|qualify lead|lead score|lead pipeline|prospect|new lead/.test(lower)) {
    return 'lead_generation';
  }

  if (/voice|receptionist|phone call|caller|incoming call|call summary|call history|enquiry/.test(lower)) {
    return 'voice_receptionist';
  }

  if (/customer support|support ticket|customer question|unresolved issue|help this customer|customer needs/.test(lower)) {
    return 'customer_support';
  }

  if (/how is my business|business health|executive summary|strategic recommendation|what needs my attention|losing money|business performing/.test(lower)) {
    return 'executive';
  }

  if (/procurement|purchase order|reorder|low stock|supplier|inventory risk|stock level|what should we purchase/.test(lower)) {
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
