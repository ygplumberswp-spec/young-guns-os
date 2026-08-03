import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { createAuraProvider, isAuraProviderConfigured } from '@titan/aura';
import {
  closeDb,
  createDb,
  preferIpv4DnsOrder,
  probeDbConnection,
  summarizeDatabaseUrl,
} from '@titan/db';
import {
  loadAuraEnvConfig,
  loadEnv,
  resolveGmailOAuthConfig,
  resolveXeroOAuthConfig,
} from './config.js';

import { attachDbQueryDiagnostics, createDbDiagnosticsMiddleware } from './lib/db-diagnostics.js';
import { resolveCompanyMediaStoragePath } from './lib/company-media-storage.js';
import { resolveJobEvidenceStoragePath } from './lib/job-evidence-storage.js';
import { JobEvidenceStorageService } from './services/job-evidence-storage.service.js';
import { createErrorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestContextMiddleware } from './middleware/request-context.js';
import { configureRbacAudit } from './middleware/rbac.js';
import { securityHeadersMiddleware } from './middleware/security-headers.js';
import { parseCorsOriginAllowlist } from './lib/public-url.js';
import { createAuthRouter } from './routes/auth.js';
import { createAuraRouter } from './routes/aura.js';
import { createCompanyRouter } from './routes/company.js';
import { createTeamRouter } from './routes/team.js';
import { createHealthRouter } from './routes/health.js';
import { AuthService } from './services/auth.service.js';
import { AuraService } from './services/aura.service.js';
import { CompanyService } from './services/company.service.js';
import { CompanyMediaService } from './services/company-media.service.js';
import { TeamService } from './services/team.service.js';
import { createCrmRouter } from './routes/crm.js';
import { createDashboardRouter } from './routes/dashboard.js';
import { createCustomersRouter } from './routes/customers.js';
import { createSupplierPriceIntelligenceRouter } from './routes/supplier-price-intelligence.js';
import { createMarketingEligibilityRouter } from './routes/marketing-eligibility.js';
import { createJobsRouter } from './routes/jobs.js';
import { createSchedulingRouter } from './routes/scheduling.js';
import { CrmService } from './services/crm.service.js';
import { CustomerDuplicateMergeService } from './services/customer-duplicate-merge.service.js';
import { CustomerValueClassificationService } from './services/customer-value-classification.service.js';
import { DashboardExecutiveService } from './services/dashboard-executive.service.js';
import { SupplierPriceIntelligenceService } from './services/supplier-price-intelligence.service.js';
import { MarketingEligibilityService } from './services/marketing-eligibility.service.js';
import { JobsService } from './services/jobs.service.js';
import { JobCostingService } from './services/job-costing.service.js';
import { JobDocumentPackService } from './services/job-document-pack.service.js';
import { CompletionReportService } from './services/completion-report.service.js';
import { SchedulingService } from './services/scheduling.service.js';
import { FinanceService } from './services/finance.service.js';
import { createFinanceRouter } from './routes/finance.js';
import { createBoqRouter } from './routes/boq.js';
import { createDraftsRouter } from './routes/drafts.js';
import { createJobDocumentPackRouter } from './routes/job-document-packs.js';
import { createCompletionReportRouter } from './routes/completion-reports.js';
import { BoqService } from './services/boq.service.js';
import { DraftAutosaveService } from './services/draft-autosave.service.js';
import { InventoryService } from './services/inventory.service.js';
import { StockMovementsService } from './services/stock-movements.service.js';
import { createInventoryRouter } from './routes/inventory.js';
import { FleetService } from './services/fleet.service.js';
import { createFleetRouter } from './routes/fleet.js';
import { IntegrationsService } from './services/integrations.service.js';
import { IntegrationHubService } from './services/integration-hub.service.js';
import { IntegrationApiManagementService } from './services/integration-api-management.service.js';
import { BusinessIntegrationsService } from './services/business-integrations.service.js';
import { XeroOAuthService } from './services/xero-oauth.service.js';
import { XeroSyncService } from './services/xero-sync.service.js';
import { XeroWriteApprovalGate } from './services/xero-write-approval-gate.service.js';
import { XeroMappingConflictService } from './services/xero-mapping-conflict.service.js';
import { XeroWriteApprovalWorkflowService } from './services/xero-write-approval-workflow.service.js';
import { XeroTwoWayVerifyService } from './services/xero-two-way-verify.service.js';
import { WhatsappService } from './services/whatsapp.service.js';
import { WhatsappContactEnrichmentService } from './services/whatsapp-contact-enrichment.service.js';
import { createIntegrationsRouter } from './routes/integrations.js';
import { createGoogleMapsRouter } from './routes/google-maps.js';
import { GoogleMapsService } from './services/google-maps.service.js';
import { createWhatsappRouter } from './routes/whatsapp.js';
import { createWhatsappEnrichmentRouter } from './routes/whatsapp-enrichment.js';
import { createWhatsappWebhookRouter } from './routes/whatsapp-webhook.js';
import { createResendWebhookRouter } from './routes/resend-webhook.js';
import { ResendEmailService } from './services/resend-email.service.js';
import { CommunicationsService } from './services/communications.service.js';
import { createCommunicationsRouter } from './routes/communications.js';
import { DocumentsService } from './services/documents.service.js';
import { createDocumentsRouter } from './routes/documents.js';
import { AutomationService } from './services/automation.service.js';
import { N8nOrchestrationService } from './services/n8n-orchestration.service.js';
import { WorkflowEngineService } from './services/workflow-engine.service.js';
import { MemoryService } from './services/memory.service.js';
import { CompanyDayPlanService } from './services/company-day-plan.service.js';
import { CompanyDayPlanFollowUpsService } from './services/company-day-plan-follow-ups.service.js';
import { CompanyBusinessRulesService } from './services/company-business-rules.service.js';
import { IntelligenceService } from './services/intelligence.service.js';
import { RecommendationsService } from './services/recommendations.service.js';
import { createIntelligenceRouter } from './routes/intelligence.js';
import { AnalyticsService } from './services/analytics.service.js';
import { createAnalyticsRouter } from './routes/analytics.js';
import { createMobileRouter } from './routes/mobile.js';
import { MobileService } from './services/mobile.service.js';
import { NotificationService } from './services/notification.service.js';
import { MobileSyncService } from './services/mobile-sync.service.js';
import { TechnicianWorkflowService } from './services/technician-workflow.service.js';
import { JobExecutionService } from './services/job-execution.service.js';
import { WorkflowStudioService } from './services/workflow-studio.service.js';
import { EnterpriseAutomationStudioService } from './services/enterprise-automation-studio.service.js';
import { EnterpriseDigitalTwinService } from './services/enterprise-digital-twin.service.js';
import { EnterpriseKnowledgeGraphService } from './services/enterprise-knowledge-graph.service.js';
import { EnterpriseMissionControlService } from './services/enterprise-mission-control.service.js';
import { EnterpriseEvolutionService } from './services/enterprise-evolution.service.js';
import { EnterpriseDeveloperPlatformService } from './services/enterprise-developer-platform.service.js';
import { EnterpriseSaasPlatformService } from './services/enterprise-saas-platform.service.js';
import { EnterpriseProductionReadinessService } from './services/enterprise-production-readiness.service.js';
import { createEnterpriseProductionReadinessRouter } from './routes/enterprise-production-readiness.js';
import { EnterpriseMobilePlatformService } from './services/enterprise-mobile-platform.service.js';
import { createEnterpriseMobilePlatformRouter } from './routes/enterprise-mobile-platform.js';
import { EnterpriseUnifiedCommunicationsService } from './services/enterprise-unified-communications.service.js';
import { DispatchCommunicationService } from './services/dispatch-communication.service.js';
import { createEnterpriseUnifiedCommunicationsRouter } from './routes/enterprise-unified-communications.js';
import { CommunicationsPlatformService } from './services/communications-platform.service.js';
import { createCommunicationsPlatformRouter } from './routes/communications-platform.js';
import { EmailCentreService } from './services/email-centre.service.js';
import { createEmailCentreRouter } from './routes/email-centre.js';
import { GmailOAuthService } from './services/gmail-oauth.service.js';
import { EnterpriseCustomerExperienceService } from './services/enterprise-customer-experience.service.js';
import { createEnterpriseCustomerExperienceRouter } from './routes/enterprise-customer-experience.js';
import { EnterpriseAssetLifecycleService } from './services/enterprise-asset-lifecycle.service.js';
import { createEnterpriseAssetLifecycleRouter } from './routes/enterprise-asset-lifecycle.js';
import { EnterpriseWorkforceIntelligenceService } from './services/enterprise-workforce-intelligence.service.js';
import { createEnterpriseWorkforceIntelligenceRouter } from './routes/enterprise-workforce-intelligence.js';
import { EnterpriseLegalComplianceService } from './services/enterprise-legal-compliance.service.js';
import { createEnterpriseLegalComplianceRouter } from './routes/enterprise-legal-compliance.js';
import { EnterpriseFinancialPlanningService } from './services/enterprise-financial-planning.service.js';
import { createEnterpriseFinancialPlanningRouter } from './routes/enterprise-financial-planning.js';
import { EnterpriseSalesIntelligenceService } from './services/enterprise-sales-intelligence.service.js';
import { createEnterpriseSalesIntelligenceRouter } from './routes/enterprise-sales-intelligence.js';
import { EnterpriseMarketingIntelligenceService } from './services/enterprise-marketing-intelligence.service.js';
import { createEnterpriseMarketingIntelligenceRouter } from './routes/enterprise-marketing-intelligence.js';
import { EnterpriseServiceDeliveryService } from './services/enterprise-service-delivery.service.js';
import { createEnterpriseServiceDeliveryRouter } from './routes/enterprise-service-delivery.js';
import { EnterpriseItOperationsService } from './services/enterprise-it-operations.service.js';
import { createEnterpriseItOperationsRouter } from './routes/enterprise-it-operations.js';
import { EnterpriseBusinessEvolutionService } from './services/enterprise-business-evolution.service.js';
import { createEnterpriseBusinessEvolutionRouter } from './routes/enterprise-business-evolution.js';
import { EnterpriseAppBuilderService } from './services/enterprise-app-builder.service.js';
import { createEnterpriseAppBuilderRouter } from './routes/enterprise-app-builder.js';
import { EnterpriseIndustryPackService } from './services/enterprise-industry-packs.service.js';
import { createEnterpriseIndustryPacksRouter } from './routes/enterprise-industry-packs.js';
import { EnterprisePublicDeveloperPlatformService } from './services/enterprise-public-developer-platform.service.js';
import { createEnterprisePublicDeveloperPlatformRouter } from './routes/enterprise-public-developer-platform.js';
import { EnterpriseSaasManagementService } from './services/enterprise-saas-management.service.js';
import { createEnterpriseSaasManagementRouter } from './routes/enterprise-saas-management.js';
import { EnterpriseVoiceReceptionService } from './services/enterprise-voice-reception.service.js';
import { createEnterpriseVoiceReceptionRouter } from './routes/enterprise-voice-reception.js';
import { VoiceAiReceptionistService } from './services/voice-ai-receptionist.service.js';
import { CallIntelligenceService } from './services/call-intelligence.service.js';
import { createVoiceAiReceptionistRouter } from './routes/voice-ai-receptionist.js';
import { createCallIntelligenceRouter } from './routes/call-intelligence.js';
import { EnterpriseDocumentAiService } from './services/enterprise-document-ai.service.js';
import { createEnterpriseDocumentAiRouter } from './routes/enterprise-document-ai.js';
import { EnterpriseBusinessContinuityService } from './services/enterprise-business-continuity.service.js';
import { EnterpriseGlobalSearchService } from './services/enterprise-global-search.service.js';
import { EnterpriseDataMigrationService } from './services/enterprise-data-migration.service.js';
import { EnterpriseNotificationsService } from './services/enterprise-notifications.service.js';
import { EnterprisePlatformHealthService } from './services/enterprise-platform-health.service.js';
import { EnterpriseLaunchCenterService } from './services/enterprise-launch-center.service.js';
import { EnterpriseReleaseCenterService } from './services/enterprise-release-center.service.js';
import { EnterpriseProductionLaunchService } from './services/enterprise-production-launch.service.js';
import { EnterpriseReleaseManagementService } from './services/enterprise-release-management.service.js';
import { createEnterpriseReleaseManagementRouter } from './routes/enterprise-release-management.js';
import { createEnterpriseBusinessContinuityRouter } from './routes/enterprise-business-continuity.js';
import { createEnterpriseGlobalSearchRouter } from './routes/enterprise-global-search.js';
import { createEnterpriseDataMigrationRouter } from './routes/enterprise-data-migration.js';
import { createEnterpriseNotificationsRouter } from './routes/enterprise-notifications.js';
import { createEnterprisePlatformHealthRouter } from './routes/enterprise-platform-health.js';
import { createEnterpriseLaunchCenterRouter } from './routes/enterprise-launch-center.js';
import { createEnterpriseReleaseCenterRouter } from './routes/enterprise-release-center.js';
import { createEnterpriseProductionLaunchRouter } from './routes/enterprise-production-launch.js';
import { AiOperationsService } from './services/ai-operations.service.js';
import { AiProviderResilienceService } from './services/ai-provider-resilience.service.js';
import { AiMemorySyncService } from './services/ai-memory-sync.service.js';
import { AiComparisonService } from './services/ai-comparison.service.js';
import { AiUnifiedGatewayService } from './services/ai-unified-gateway.service.js';
import { createAutomationRouter } from './routes/automation.js';
import {
  createN8nCallbackRouter,
  createN8nOrchestrationRouter,
} from './routes/n8n-orchestration.js';
import { createEnterpriseAutomationStudioRouter } from './routes/enterprise-automation-studio.js';
import { createEnterpriseDigitalTwinRouter } from './routes/enterprise-digital-twin.js';
import { createEnterpriseKnowledgeGraphRouter } from './routes/enterprise-knowledge-graph.js';
import { createEnterpriseMissionControlRouter } from './routes/enterprise-mission-control.js';
import { createEnterpriseEvolutionRouter } from './routes/enterprise-evolution.js';
import { createEnterpriseDeveloperPlatformRouter } from './routes/enterprise-developer-platform.js';
import { createEnterpriseSaasPlatformRouter } from './routes/enterprise-saas-platform.js';
import { createAgentOrchestrationRouter } from './routes/agent-orchestration.js';
import { createSalesRouter } from './routes/sales.js';
import { createMarketingRouter } from './routes/marketing.js';
import { createLeadsRouter } from './routes/leads.js';
import { createVoiceRouter } from './routes/voice.js';
import { createCustomerSupportRouter } from './routes/customer-support.js';
import { bindAutomationEventEmitter } from './lib/automation-events.js';
import { startAutomationWorkers } from './workers/automation.worker.js';
import { startIntegrationSyncScheduler } from './workers/integration-sync.scheduler.js';
import { AgentsService } from './services/agents.service.js';
import { AgentRuntimeService } from './services/agent-runtime.service.js';
import { AgentOrchestrationService } from './services/agent-orchestration.service.js';
import { AgentOrchestrationEngineService } from './services/agent-orchestration-engine.service.js';
import { SalesService } from './services/sales.service.js';
import { MarketingService } from './services/marketing.service.js';
import { LeadsService } from './services/leads.service.js';
import { LeadConversionService } from './services/lead-conversion.service.js';
import { VoiceService } from './services/voice.service.js';
import { CustomerSupportService } from './services/customer-support.service.js';
import { WorkforceService } from './services/workforce.service.js';
import { ProcurementService } from './services/procurement.service.js';
import { ExecutiveService } from './services/executive.service.js';
import { FinanceIntelligenceService } from './services/finance-intelligence.service.js';
import { KnowledgeService } from './services/knowledge.service.js';
import { RecruitingService } from './services/recruiting.service.js';
import { createAgentsRouter } from './routes/agents.js';
import { TenantCapabilityBuilderService } from './services/tenant-capability-builder.service.js';
import { createTenantCapabilitiesRouter } from './routes/tenant-capabilities.js';
import { createRecruitingRouter } from './routes/recruiting.js';
import { createWorkforceRouter } from './routes/workforce.js';
import { createProcurementRouter } from './routes/procurement.js';
import { createExecutiveRouter } from './routes/executive.js';
import { createFinanceIntelligenceRouter } from './routes/finance-intelligence.js';
import { createKnowledgeRouter } from './routes/knowledge.js';
import { BusinessIntelligenceService } from './services/business-intelligence.service.js';
import { createBusinessIntelligenceRouter } from './routes/business-intelligence.js';
import { PortalAuthService } from './services/portal-auth.service.js';
import { PortalService } from './services/portal.service.js';
import { PortalExperienceService } from './services/portal-experience.service.js';
import { PortalExpansionService } from './services/portal-expansion.service.js';
import { MobileWorkforceService } from './services/mobile-workforce.service.js';
import { QualityAssuranceService } from './services/quality-assurance.service.js';
import { CommunicationsIntelligenceService } from './services/communications-intelligence.service.js';
import { AssetEquipmentIntelligenceService } from './services/asset-equipment-intelligence.service.js';
import { AiOrchestrationService } from './services/ai-orchestration.service.js';
import { DispatchIntelligenceService } from './services/dispatch-intelligence.service.js';
import { OpsIntelligenceService } from './services/ops-intelligence.service.js';
import { FleetIntelligenceService } from './services/fleet-intelligence.service.js';
import { PersonalCommunicationsIntelligenceService } from './services/personal-communications-intelligence.service.js';
import { PersonalWhatsappIntelligenceService } from './services/personal-whatsapp-intelligence.service.js';
import { PersonalWhatsappConnectionService } from './services/personal-whatsapp-connection.service.js';
import { CommunicationAuraIntelligenceService } from './services/communication-aura-intelligence.service.js';
import { AuraCommandCentreService } from './services/aura-command-centre.service.js';
import { AuraAgentNetworkService } from './services/aura-agent-network.service.js';
import { AuraEvolutionService } from './services/aura-evolution.service.js';
import { MarketingAgentService } from './services/marketing-agent.service.js';
import { SocialMediaIntegrationsService } from './services/social-media-integrations.service.js';
import { ContentReputationIntelligenceService } from './services/content-reputation-intelligence.service.js';
import { FinanceAuraAgentService } from './services/finance-aura-agent.service.js';
import { SalesIntelligenceAgentService } from './services/sales-intelligence-agent.service.js';
import { FinanceReportingForecastService } from './services/finance-reporting-forecast.service.js';
import { FinanceCashflowProfitService } from './services/finance-cashflow-profit.service.js';
import { InventoryIntelligenceService } from './services/inventory-intelligence.service.js';
import { VehicleIntelligenceService } from './services/vehicle-intelligence.service.js';
import { FleetAiRecommendationsService } from './services/fleet-ai-recommendations.service.js';
import { DriverIntelligenceService } from './services/driver-intelligence.service.js';
import { HrEmployeeIntelligenceService } from './services/hr-employee-intelligence.service.js';
import { RecruitmentPerformanceIntelligenceService } from './services/recruitment-performance-intelligence.service.js';
import { ProcurementIntelligenceService } from './services/procurement-intelligence.service.js';
import { StockForecastingService } from './services/stock-forecasting.service.js';
import { PayrollTimesheetIntelligenceService } from './services/payroll-timesheet-intelligence.service.js';
import { TechnicianIntelligenceService } from './services/technician-intelligence.service.js';
import { WorkflowAutomationService } from './services/workflow-automation.service.js';
import { RecurringMaintenanceService } from './services/recurring-maintenance.service.js';
import { HomeshieldExperienceService } from './services/homeshield-experience.service.js';
import { CustomerEngagementIntelligenceService } from './services/customer-engagement-intelligence.service.js';
import { EnterpriseSecurityService } from './services/enterprise-security.service.js';
import { ConnectorEngineService } from './services/connector-engine.service.js';
import { IntegrationPlatformService } from './services/integration-platform.service.js';
import { IntegrationSyncOrchestratorService } from './services/integration-sync-orchestrator.service.js';
import { TenantDomainEventBus } from './services/tenant-domain-event-bus.service.js';
import { BackgroundWorkQueueService } from './services/background-work-queue.service.js';
import { BackgroundWorkOrchestratorService } from './services/background-work-orchestrator.service.js';
import { bindTenantDomainEventBus } from './lib/tenant-domain-event-publisher.js';
import { createBackgroundWorkRouter } from './routes/background-work.js';
import { EnterpriseAnalyticsService } from './services/enterprise-analytics.service.js';
import { createQualityRouter } from './routes/quality.js';
import { createCommunicationsIntelligenceRouter } from './routes/communications-intelligence.js';
import { createAssetEquipmentRouter } from './routes/asset-equipment.js';
import { createAiOrchestrationRouter } from './routes/ai-orchestration.js';
import { createDispatchIntelligenceRouter } from './routes/dispatch-intelligence.js';
import { createOpsIntelligenceRouter } from './routes/ops-intelligence.js';
import { createFleetIntelligenceRouter } from './routes/fleet-intelligence.js';
import { createPersonalCommunicationsIntelligenceRouter } from './routes/personal-communications-intelligence.js';
import { createPersonalWhatsappIntelligenceRouter } from './routes/personal-whatsapp-intelligence.js';
import { createPersonalWhatsappConnectionRouter } from './routes/personal-whatsapp-connection.js';
import { createCommunicationAuraIntelligenceRouter } from './routes/communication-aura-intelligence.js';
import { createAuraCommandCentreRouter } from './routes/aura-command-centre.js';
import { createAuraAgentNetworkRouter } from './routes/aura-agent-network.js';
import { createAuraEvolutionRouter } from './routes/aura-evolution.js';
import { createMarketingAgentRouter } from './routes/marketing-agent.js';
import { createSocialMediaIntegrationsRouter } from './routes/social-media-integrations.js';
import { createContentReputationIntelligenceRouter } from './routes/content-reputation-intelligence.js';
import { createFinanceAuraAgentRouter } from './routes/finance-aura-agent.js';
import { createSalesIntelligenceAgentRouter } from './routes/sales-intelligence-agent.js';
import { createFinanceReportingForecastRouter } from './routes/finance-reporting-forecast.js';
import { createFinanceCashflowProfitRouter } from './routes/finance-cashflow-profit.js';
import { createInventoryIntelligenceRouter } from './routes/inventory-intelligence.js';
import { createVehicleIntelligenceRouter } from './routes/vehicle-intelligence.js';
import { createFleetAiRecommendationsRouter } from './routes/fleet-ai-recommendations.js';
import { createDriverIntelligenceRouter } from './routes/driver-intelligence.js';
import { createHrEmployeeIntelligenceRouter } from './routes/hr-employee-intelligence.js';
import { createRecruitmentPerformanceIntelligenceRouter } from './routes/recruitment-performance-intelligence.js';
import { createProcurementIntelligenceRouter } from './routes/procurement-intelligence.js';
import { createStockForecastingRouter } from './routes/stock-forecasting.js';
import { createPayrollTimesheetIntelligenceRouter } from './routes/payroll-timesheet-intelligence.js';
import { createTechnicianIntelligenceRouter } from './routes/technician-intelligence.js';
import { createWorkflowAutomationRouter } from './routes/workflow-automation.js';
import { createRecurringMaintenanceRouter } from './routes/recurring-maintenance.js';
import { createHomeshieldExperienceRouter } from './routes/homeshield-experience.js';
import { createCustomerEngagementIntelligenceRouter } from './routes/customer-engagement-intelligence.js';
import { createEnterpriseSecurityRouter } from './routes/enterprise-security.js';
import { createIntegrationPlatformRouter } from './routes/integration-platform.js';
import { createEnterpriseAnalyticsRouter } from './routes/enterprise-analytics.js';
import { createPortalAuthRouter } from './routes/portal-auth.js';
import { createPortalRouter } from './routes/portal.js';
import { createPortalExpansionRouter } from './routes/portal-expansion.js';
import type { Env } from './config.js';

function bootLog(message: string, extra?: Record<string, unknown>): void {
  const suffix = extra ? ` ${JSON.stringify(extra)}` : '';
  // console.* survives Railway log drains even when pino has not started (env crash path).
  console.log(`[titan-api] ${message}${suffix}`);
}

bootLog('process starting', {
  NODE_ENV: process.env.NODE_ENV ?? '(unset)',
  APP_ENV: process.env.APP_ENV ?? '(unset)',
  TITAN_ENV: process.env.TITAN_ENV ?? '(unset)',
  PORT: process.env.PORT ?? '(unset→default 3000)',
  HOST: process.env.HOST ?? '(unset→default 0.0.0.0)',
  READY_REQUIRE_REDIS: process.env.READY_REQUIRE_REDIS ?? '(unset)',
  hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
  hasJwtSecret: Boolean(process.env.JWT_SECRET),
  hasRefreshSecret: Boolean(process.env.JWT_REFRESH_SECRET),
  hasIntegrationsKey: Boolean(process.env.INTEGRATIONS_ENCRYPTION_KEY),
  hasAppUrl: Boolean(process.env.APP_URL),
  hasApiPublicUrl: Boolean(process.env.API_PUBLIC_URL),
  hasRedisUrl: Boolean(process.env.REDIS_URL),
  hasGoogleClientId: Boolean(process.env.GOOGLE_CLIENT_ID?.trim()),
  hasGoogleClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim()),
  hasGoogleRedirectUri: Boolean(process.env.GOOGLE_REDIRECT_URI?.trim()),
});

let env: Env;
try {
  env = loadEnv();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[titan-api] FATAL: environment validation failed\n${message}`);
  process.exit(1);
}

bootLog('environment validated', {
  NODE_ENV: env.NODE_ENV,
  APP_ENV: env.APP_ENV ?? '(unset)',
  TITAN_ENV: env.TITAN_ENV ?? '(unset)',
  PORT: env.PORT,
  HOST: env.HOST,
  readyRequireRedis: env.runtime.readyRequireRedis,
  providersEnabled: env.runtime.providersEnabled,
  workersEnabled: env.runtime.workersEnabled,
});

const auraConfig = loadAuraEnvConfig();
const logger = pino({
  level: env.LOG_LEVEL ?? (env.NODE_ENV === 'production' ? 'info' : 'debug'),
});

const dbDiagnosticsEnabled = env.NODE_ENV !== 'production';
if (dbDiagnosticsEnabled) {
  attachDbQueryDiagnostics();
}

// Railway cannot reach Supabase direct IPv6 endpoints; prefer A records first.
preferIpv4DnsOrder();
const databaseEndpoint = summarizeDatabaseUrl(env.DATABASE_URL);
bootLog('database endpoint', {
  host: databaseEndpoint.host,
  port: databaseEndpoint.port,
  database: databaseEndpoint.database,
  sslmode: databaseEndpoint.sslmode ?? '(unset)',
  isSupabaseDirect: databaseEndpoint.isSupabaseDirect,
  isSupabasePooler: databaseEndpoint.isSupabasePooler,
  isPrivateHost: databaseEndpoint.isPrivateHost,
});
if (databaseEndpoint.isSupabaseDirect) {
  bootLog(
    'WARNING: DATABASE_URL points at Supabase direct host (IPv6). Railway readiness will fail — use the pooler connection string instead.',
    {
      host: databaseEndpoint.host,
    },
  );
}

const db = createDb(env.DATABASE_URL);
configureRbacAudit(db);

const authService = new AuthService(db, {
  jwtSecret: env.JWT_SECRET,
});

const auraProvider =
  env.runtime.providersEnabled && isAuraProviderConfigured(auraConfig)
    ? createAuraProvider(auraConfig)
    : null;

if (auraProvider) {
  logger.info(
    { provider: auraProvider.name, model: auraConfig.openaiModel },
    'AURA provider ready',
  );
} else if (!env.runtime.providersEnabled) {
  logger.info('AURA provider gated off — PROVIDERS_ENABLED=false');
} else {
  logger.warn('AURA provider not configured — set AURA_OPENAI_API_KEY to enable AI responses');
}

const companyService = new CompanyService(db);
const payrollTimesheetIntelligenceService = new PayrollTimesheetIntelligenceService(db);
let companyMediaStoragePath: string;
let jobEvidenceStoragePath: string;
try {
  companyMediaStoragePath = resolveCompanyMediaStoragePath(
    process.env.COMPANY_MEDIA_STORAGE_PATH,
  );
  jobEvidenceStoragePath = resolveJobEvidenceStoragePath(process.env.JOB_EVIDENCE_STORAGE_PATH);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[titan-api] FATAL: storage path initialization failed\n${message}`);
  process.exit(1);
}
bootLog('storage paths ready', {
  companyMediaStoragePath,
  jobEvidenceStoragePath,
  companyMediaEnvSet: Boolean(process.env.COMPANY_MEDIA_STORAGE_PATH?.trim()),
  jobEvidenceEnvSet: Boolean(process.env.JOB_EVIDENCE_STORAGE_PATH?.trim()),
});
logger.info(
  {
    companyMediaStoragePath,
    jobEvidenceStoragePath,
  },
  'Filesystem storage roots resolved',
);
const companyMediaService = new CompanyMediaService(companyMediaStoragePath);
const jobEvidenceStorageService = new JobEvidenceStorageService(jobEvidenceStoragePath);
const teamService = new TeamService(db, env.APP_URL);
const enterpriseSaasPlatformService = new EnterpriseSaasPlatformService({
  db,
  teamService,
});
const crmService = new CrmService(db);
const customerDuplicateMergeService = new CustomerDuplicateMergeService(db);
const customerValueClassificationService = new CustomerValueClassificationService(db);
const supplierPriceIntelligenceService = new SupplierPriceIntelligenceService(db);
const marketingEligibilityService = new MarketingEligibilityService(db);
const jobsService = new JobsService(db);
const googleMapsService = GoogleMapsService.create({
  db,
  encryptionKey: env.INTEGRATIONS_ENCRYPTION_KEY,
});
const schedulingService = new SchedulingService(db, googleMapsService);
const financeService = new FinanceService(db);
const boqService = new BoqService(db, financeService);
const draftAutosaveService = new DraftAutosaveService(db);
const inventoryService = new InventoryService(db);
const stockMovementsService = new StockMovementsService(db);
const fleetService = new FleetService(db);
const integrationHubService = new IntegrationHubService(db);
const n8nOrchestrationService = new N8nOrchestrationService(db, env.INTEGRATIONS_ENCRYPTION_KEY);
integrationHubService.setN8nStatusProvider(n8nOrchestrationService);
const apiPublicUrl = env.API_PUBLIC_URL ?? `http://localhost:${env.PORT}`;
const xeroOAuthConfig = resolveXeroOAuthConfig(env, apiPublicUrl);
const xeroOAuthService = XeroOAuthService.create({
  db,
  encryptionKey: env.INTEGRATIONS_ENCRYPTION_KEY,
  appUrl: env.APP_URL,
  oauthConfig: xeroOAuthConfig,
});
const gmailOAuthConfig = resolveGmailOAuthConfig(env, apiPublicUrl);
bootLog('gmail oauth resolved', {
  oauthConfigured: gmailOAuthConfig.configured,
  hasClientId: Boolean(env.GOOGLE_CLIENT_ID?.trim()),
  hasClientSecret: Boolean(env.GOOGLE_CLIENT_SECRET),
  hasRedirectUri: Boolean(env.GOOGLE_REDIRECT_URI?.trim()),
});
const gmailOAuthService = GmailOAuthService.create({
  db,
  encryptionKey: env.INTEGRATIONS_ENCRYPTION_KEY,
  appUrl: env.APP_URL,
  oauthConfig: gmailOAuthConfig,
});
integrationHubService.setGmailOAuthConfiguredProvider(() => gmailOAuthService.isAppConfigured());
const businessIntegrationsService = BusinessIntegrationsService.create({
  db,
  encryptionKey: env.INTEGRATIONS_ENCRYPTION_KEY,
  hubService: integrationHubService,
  xeroOAuthService,
  apiPublicUrl,
  emailSendingEnabled: env.runtime.emailSendingEnabled,
});
const resendEmailService = ResendEmailService.create({
  db,
  encryptionKey: env.INTEGRATIONS_ENCRYPTION_KEY,
  hubService: integrationHubService,
  emailSendingEnabled: env.runtime.emailSendingEnabled,
  webhooksEnabled: env.runtime.webhooksEnabled,
});
const xeroWriteApprovalGate = new XeroWriteApprovalGate(db);
const xeroMappingConflictService = new XeroMappingConflictService(db);
const xeroSyncService = XeroSyncService.create({
  db,
  encryptionKey: env.INTEGRATIONS_ENCRYPTION_KEY,
  hubService: integrationHubService,
  xeroOAuthService,
  writeApprovalGate: xeroWriteApprovalGate,
  mappingConflictService: xeroMappingConflictService,
});
const xeroWriteApprovalWorkflowService = new XeroWriteApprovalWorkflowService(
  db,
  xeroWriteApprovalGate,
  xeroSyncService,
);
const integrationsService = IntegrationsService.create({
  db,
  encryptionKey: env.INTEGRATIONS_ENCRYPTION_KEY,
  hubService: integrationHubService,
});
const whatsappService = WhatsappService.create({
  db,
  encryptionKey: env.INTEGRATIONS_ENCRYPTION_KEY,
  apiPublicUrl,
  hubService: integrationHubService,
  runtime: {
    whatsappEnabled: env.runtime.whatsappEnabled,
    webhooksEnabled: env.runtime.webhooksEnabled,
    outboundMessagesEnabled: env.runtime.outboundMessagesEnabled,
  },
});
const whatsappContactEnrichmentService = WhatsappContactEnrichmentService.create({
  db,
  whatsappService,
});
const integrationApiManagementService = new IntegrationApiManagementService({
  db,
  hubService: integrationHubService,
  integrationsService,
  businessIntegrationsService,
  xeroSyncService,
});
const connectorEngineService = new ConnectorEngineService(db);
const integrationPlatformService = new IntegrationPlatformService({
  db,
  connectorEngine: connectorEngineService,
  hubService: integrationHubService,
  apiManagementService: integrationApiManagementService,
});
const integrationSyncOrchestratorService = new IntegrationSyncOrchestratorService({
  db,
  runtime: env.runtime,
  connectorEngine: connectorEngineService,
  xeroSyncService,
  xeroOAuthService,
  integrationsService,
  businessIntegrationsService,
});
integrationPlatformService.setSyncOrchestrator(integrationSyncOrchestratorService);
xeroOAuthService.setOnConnectedHook(({ companyId, userId }) => {
  void integrationSyncOrchestratorService
    .onProviderConnected({
      companyId,
      provider: 'xero',
      userId,
    })
    .catch((error) => {
      console.error('[index] Xero auto-sync initial hook failed', error);
    });
});
const tenantDomainEventBus = new TenantDomainEventBus(db);
bindTenantDomainEventBus(tenantDomainEventBus);
const backgroundWorkQueueService = new BackgroundWorkQueueService(db);
const xeroTwoWayVerifyService = new XeroTwoWayVerifyService(db, backgroundWorkQueueService);
const backgroundWorkOrchestratorService = new BackgroundWorkOrchestratorService({
  integrationSyncOrchestrator: integrationSyncOrchestratorService,
  backgroundWorkQueue: backgroundWorkQueueService,
  domainEventBus: tenantDomainEventBus,
  xeroSyncService,
  customerValueClassificationService,
  xeroTwoWayVerifyService,
});
backgroundWorkOrchestratorService.registerDomainEventHandlers();
xeroSyncService.setImportJobSettledHandler((input) =>
  backgroundWorkOrchestratorService.handleXeroImportJobSettled(input),
);
integrationsService.setOnCartrackConnectedHook(({ companyId }) => {
  void integrationSyncOrchestratorService
    .onProviderConnected({
      companyId,
      provider: 'cartrack',
    })
    .catch((error) => {
      console.error('[index] Cartrack auto-sync initial hook failed', error);
    });
});
const communicationsService = new CommunicationsService(db, resendEmailService);
const documentsService = new DocumentsService(db);
const automationService = new AutomationService(db);
const agentOrchestrationService = new AgentOrchestrationService(db);
const salesService = new SalesService(db);
const marketingService = new MarketingService(db);
const leadsService = new LeadsService(db);
const voiceService = new VoiceService(db);
const customerSupportService = new CustomerSupportService(db);
const notificationService = new NotificationService(db);
const workflowEngineService = new WorkflowEngineService({
  db,
  crmService,
  jobsService,
  whatsappService,
  communicationsService,
  notificationService,
});
const workflowAutomationService = new WorkflowAutomationService({
  db,
  automationService,
  workflowEngineService,
});
const workflowStudioService = new WorkflowStudioService({
  db,
  automationService,
  workflowEngineService,
});
const enterpriseAutomationStudioService = new EnterpriseAutomationStudioService({
  db,
  automationService,
  workflowStudioService,
  workflowEngineService,
});
const agentsService = new AgentsService(db);
const tenantCapabilityBuilderService = new TenantCapabilityBuilderService(db);
const recruitingService = new RecruitingService(db);
const memoryService = new MemoryService(db);
const businessRulesService = new CompanyBusinessRulesService(db);
const dayPlanService = new CompanyDayPlanService(db, businessRulesService);
const intelligenceService = new IntelligenceService({
  db,
  financeService,
  schedulingService,
  inventoryService,
  automationService,
});
const recommendationsService = new RecommendationsService(intelligenceService);
const dayPlanFollowUpsService = new CompanyDayPlanFollowUpsService(
  db,
  intelligenceService,
  recommendationsService,
  dayPlanService,
);
const dashboardExecutiveService = new DashboardExecutiveService({
  db,
  jobsService,
  schedulingService,
  financeService,
  intelligenceService,
  dayPlanService,
  xeroSyncService,
});
const analyticsService = new AnalyticsService(db, financeService, fleetService, inventoryService);
const workforceService = new WorkforceService({
  db,
  recruitingService,
  analyticsService,
  schedulingService,
});
const procurementService = new ProcurementService({
  db,
  inventoryService,
  stockMovementsService,
});
const executiveService = new ExecutiveService({
  db,
  intelligenceService,
  analyticsService,
  salesService,
  marketingService,
  workforceService,
  procurementService,
});
const enterpriseDigitalTwinService = new EnterpriseDigitalTwinService({
  db,
  jobsService,
  schedulingService,
  fleetService,
  inventoryService,
  financeService,
  workforceService,
  procurementService,
  executiveService,
});
const financeIntelligenceService = new FinanceIntelligenceService({
  db,
  financeService,
  analyticsService,
  procurementService,
});
const knowledgeService = new KnowledgeService({ db });
const enterpriseKnowledgeGraphService = new EnterpriseKnowledgeGraphService({
  db,
  knowledgeService,
});
const businessIntelligenceService = new BusinessIntelligenceService({
  db,
  analyticsService,
  financeIntelligenceService,
  executiveService,
  salesService,
  marketingService,
  procurementService,
  workforceService,
  fleetService,
  inventoryService,
  leadsService,
  customerSupportService,
  automationService,
});
const enterpriseAnalyticsService = new EnterpriseAnalyticsService({
  db,
  businessIntelligenceService,
});
const leadConversionService = new LeadConversionService(db, notificationService, (companyId, leadId) =>
  leadsService.getLead(companyId, leadId),
);
const mobileSyncService = new MobileSyncService(db);
const jobExecutionService = new JobExecutionService(db, stockMovementsService);
const jobCostingService = new JobCostingService(db);
const jobDocumentPackService = new JobDocumentPackService(db);
const technicianWorkflowService = new TechnicianWorkflowService(
  db,
  jobsService,
  notificationService,
  mobileSyncService,
  jobExecutionService,
);
const mobileService = new MobileService(
  db,
  intelligenceService,
  recommendationsService,
  analyticsService,
  jobsService,
  schedulingService,
  fleetService,
  notificationService,
);
const portalExperienceService = new PortalExperienceService(db, mobileService, notificationService);
const portalExpansionService = new PortalExpansionService(db);
const mobileWorkforceService = new MobileWorkforceService(
  db,
  mobileService,
  mobileSyncService,
  jobsService,
  inventoryService,
  integrationsService,
  notificationService,
  jobExecutionService,
  jobEvidenceStorageService,
  technicianWorkflowService,
);
const qualityAssuranceService = new QualityAssuranceService(
  db,
  jobsService,
  financeService,
  notificationService,
);
const communicationsIntelligenceService = new CommunicationsIntelligenceService(
  db,
  communicationsService,
  voiceService,
  whatsappService,
  customerSupportService,
  notificationService,
);
const assetEquipmentIntelligenceService = new AssetEquipmentIntelligenceService(
  db,
  fleetService,
  notificationService,
);
const aiOrchestrationService = new AiOrchestrationService(db, notificationService, {
  encryptionKey: env.INTEGRATIONS_ENCRYPTION_KEY,
  auraConfig,
  isAuraConfigured: isAuraProviderConfigured(auraConfig),
});
const aiOperationsService = new AiOperationsService({
  db,
  enterpriseSaasPlatformService,
});
const aiMemorySyncService = new AiMemorySyncService({
  db,
  memoryService,
  enterpriseKnowledgeGraphService,
});
const aiProviderResilienceService = new AiProviderResilienceService({
  db,
  aiOrchestrationService,
  aiOperationsService,
  aiMemorySyncService,
  auraConfig,
  encryptionKey: env.INTEGRATIONS_ENCRYPTION_KEY,
  envProvider: auraProvider,
});
const aiComparisonService = new AiComparisonService({
  db,
  aiProviderResilienceService,
});
const aiUnifiedGatewayService = new AiUnifiedGatewayService({
  aiOrchestrationService,
  aiOperationsService,
  aiProviderResilienceService,
  aiMemorySyncService,
  aiComparisonService,
});
const dispatchIntelligenceService = new DispatchIntelligenceService(
  db,
  notificationService,
  communicationsIntelligenceService,
  schedulingService,
  qualityAssuranceService,
);
const opsIntelligenceService = new OpsIntelligenceService(
  db,
  googleMapsService,
  integrationsService,
  notificationService,
);
const fleetIntelligenceService = new FleetIntelligenceService(
  db,
  fleetService,
  integrationsService,
  assetEquipmentIntelligenceService,
  schedulingService,
  notificationService,
);
const personalCommunicationsIntelligenceService = new PersonalCommunicationsIntelligenceService(
  db,
  whatsappService,
  communicationsIntelligenceService,
  aiOrchestrationService,
  notificationService,
);
const personalWhatsappIntelligenceService = new PersonalWhatsappIntelligenceService(db);
const personalWhatsappConnectionService = new PersonalWhatsappConnectionService(
  db,
  env.INTEGRATIONS_ENCRYPTION_KEY,
);
const communicationAuraIntelligenceService = new CommunicationAuraIntelligenceService(db);
const auraCommandCentreService = new AuraCommandCentreService({ db });
const auraAgentNetworkService = new AuraAgentNetworkService({ db });
const auraEvolutionService = new AuraEvolutionService({ db });
const marketingAgentService = new MarketingAgentService(db);
const financeAuraAgentService = new FinanceAuraAgentService(db);
const salesIntelligenceAgentService = new SalesIntelligenceAgentService(db);
const financeReportingForecastService = new FinanceReportingForecastService(db);
const financeCashflowProfitService = new FinanceCashflowProfitService(db);
const procurementIntelligenceService = new ProcurementIntelligenceService({
  db,
  procurementService,
});
const socialMediaIntegrationsService = new SocialMediaIntegrationsService(
  db,
  env.INTEGRATIONS_ENCRYPTION_KEY,
);
const contentReputationIntelligenceService = new ContentReputationIntelligenceService(db);
const inventoryIntelligenceService = new InventoryIntelligenceService(db);
const stockForecastingService = new StockForecastingService({
  db,
  procurementService,
});
const vehicleIntelligenceService = new VehicleIntelligenceService(db);
const fleetAiRecommendationsService = new FleetAiRecommendationsService(db);
const driverIntelligenceService = new DriverIntelligenceService(db, fleetIntelligenceService);
const hrEmployeeIntelligenceService = new HrEmployeeIntelligenceService(db);
const recruitmentPerformanceIntelligenceService = new RecruitmentPerformanceIntelligenceService(db);
const technicianIntelligenceService = new TechnicianIntelligenceService(db);
const enterpriseSecurityService = new EnterpriseSecurityService(
  db,
  env.INTEGRATIONS_ENCRYPTION_KEY ?? env.JWT_SECRET,
  logger.child({ module: 'enterprise-security' }),
);
const enterpriseMissionControlService = new EnterpriseMissionControlService({
  db,
  executiveService,
  enterpriseDigitalTwinService,
  enterpriseKnowledgeGraphService,
  enterpriseAutomationStudioService,
  enterpriseSecurityService,
  integrationPlatformService,
  jobsService,
  schedulingService,
  fleetService,
  inventoryService,
  financeService,
  crmService,
  salesService,
  leadsService,
  marketingService,
  aiOperationsService,
  tenantCapabilityBuilderService,
});
const enterpriseProductionReadinessService = new EnterpriseProductionReadinessService({
  db,
  databaseUrl: env.DATABASE_URL,
  jwtSecret: env.JWT_SECRET,
  encryptionKey: env.INTEGRATIONS_ENCRYPTION_KEY,
  enterpriseSaasPlatformService,
  enterpriseMissionControlService,
  aiOrchestrationService,
  aiProviderResilienceService,
});
const enterpriseMobilePlatformService = new EnterpriseMobilePlatformService({
  db,
  enterpriseSaasPlatformService,
  mobileSyncService,
  mobileWorkforceService,
  integrationsService,
  dispatchIntelligenceService,
});
const communicationsPlatformService = CommunicationsPlatformService.create({
  db,
  encryptionKey: env.INTEGRATIONS_ENCRYPTION_KEY,
  gmailOAuthService,
  whatsappService,
});
whatsappService.setInboundHooks({
  indexInboundMessage: (input) =>
    communicationsPlatformService.indexBusinessWhatsappInbound(input),
  recordInboundEnrichment: (input) =>
    whatsappContactEnrichmentService.recordInboundOpportunity(input).then(() => undefined),
});
const enterpriseUnifiedCommunicationsService = new EnterpriseUnifiedCommunicationsService({
  db,
  enterpriseSaasPlatformService,
  communicationsIntelligenceService,
  voiceService,
  whatsappService,
  integrationsService,
  integrationHubService,
  gmailOAuthService,
});
const emailCentreService = EmailCentreService.create({
  db,
  communicationsPlatformService,
  enterpriseUnifiedCommunicationsService,
});
const completionReportService = new CompletionReportService(db, emailCentreService);
const dispatchCommunicationService = new DispatchCommunicationService(
  db,
  enterpriseUnifiedCommunicationsService,
);
const enterpriseCustomerExperienceService = new EnterpriseCustomerExperienceService({
  db,
  enterpriseSaasPlatformService,
  portalExperienceService,
  enterpriseUnifiedCommunicationsService,
  integrationsService,
});
const enterpriseAssetLifecycleService = new EnterpriseAssetLifecycleService({
  db,
  enterpriseSaasPlatformService,
  assetEquipmentIntelligenceService,
  enterpriseDigitalTwinService,
});
const recurringMaintenanceService = new RecurringMaintenanceService({
  db,
  enterpriseAssetLifecycleService,
  emailCentreService,
});
const homeshieldExperienceService = new HomeshieldExperienceService(db);
const customerEngagementIntelligenceService = new CustomerEngagementIntelligenceService(db);
const enterpriseWorkforceIntelligenceService = new EnterpriseWorkforceIntelligenceService({
  db,
  enterpriseSaasPlatformService,
  workforceService,
  recruitingService,
  schedulingService,
  mobileWorkforceService,
  analyticsService,
});
const enterpriseLegalComplianceService = new EnterpriseLegalComplianceService({
  db,
  enterpriseSaasPlatformService,
  documentsService,
  financeService,
  procurementService,
});
const enterpriseFinancialPlanningService = new EnterpriseFinancialPlanningService({
  db,
  enterpriseSaasPlatformService,
  financeService,
  financeIntelligenceService,
  analyticsService,
  procurementService,
});
const enterpriseSalesIntelligenceService = new EnterpriseSalesIntelligenceService({
  db,
  enterpriseSaasPlatformService,
  crmService,
  salesService,
  leadsService,
  marketingService,
  financeService,
  analyticsService,
});
const enterpriseMarketingIntelligenceService = new EnterpriseMarketingIntelligenceService({
  db,
  enterpriseSaasPlatformService,
  marketingService,
  crmService,
  leadsService,
  financeService,
  analyticsService,
});
const enterpriseServiceDeliveryService = new EnterpriseServiceDeliveryService({
  db,
  enterpriseSaasPlatformService,
  jobsService,
  qualityAssuranceService,
  dispatchIntelligenceService,
  schedulingService,
  financeService,
  analyticsService,
  crmService,
});
const enterpriseItOperationsService = new EnterpriseItOperationsService({
  db,
  enterpriseSaasPlatformService,
  enterpriseProductionReadinessService,
  enterpriseMissionControlService,
  enterpriseSecurityService,
  aiProviderResilienceService,
  aiOperationsService,
  integrationPlatformService,
  analyticsService,
});
const enterpriseEvolutionService = new EnterpriseEvolutionService({
  db,
  enterpriseMissionControlService,
  enterpriseDigitalTwinService,
  enterpriseKnowledgeGraphService,
  enterpriseAutomationStudioService,
  executiveService,
  intelligenceService,
  recommendationsService,
  aiOrchestrationService,
  memoryService,
  jobsService,
  schedulingService,
  fleetService,
  inventoryService,
  financeService,
});
const enterpriseBusinessEvolutionService = new EnterpriseBusinessEvolutionService({
  db,
  enterpriseSaasPlatformService,
  enterpriseEvolutionService,
  enterpriseMissionControlService,
  enterpriseKnowledgeGraphService,
  enterpriseDigitalTwinService,
  enterpriseAutomationStudioService,
  enterpriseItOperationsService,
  enterpriseFinancialPlanningService,
  enterpriseWorkforceIntelligenceService,
  enterpriseCustomerExperienceService,
  enterpriseServiceDeliveryService,
  jobsService,
  financeService,
  leadsService,
  marketingService,
  analyticsService,
  aiOrchestrationService,
});
const enterpriseDeveloperPlatformService = new EnterpriseDeveloperPlatformService({
  db,
  integrationApiManagementService,
  integrationPlatformService,
  integrationHubService,
  connectorEngineService,
  apiPublicUrl,
});
const enterpriseAppBuilderService = new EnterpriseAppBuilderService({
  db,
  enterpriseSaasPlatformService,
  enterpriseDeveloperPlatformService,
  enterpriseMissionControlService,
  enterpriseItOperationsService,
  enterpriseBusinessEvolutionService,
  enterpriseProductionReadinessService,
  enterpriseAutomationStudioService,
});
const enterpriseIndustryPackService = new EnterpriseIndustryPackService({
  db,
  enterpriseSaasPlatformService,
  enterpriseMissionControlService,
  enterpriseLegalComplianceService,
  enterpriseAppBuilderService,
  enterpriseServiceDeliveryService,
  enterpriseAssetLifecycleService,
  jobsService,
  financeService,
});
const enterprisePublicDeveloperPlatformService = new EnterprisePublicDeveloperPlatformService({
  db,
  enterpriseSaasPlatformService,
  enterpriseMissionControlService,
  enterpriseItOperationsService,
  enterpriseDeveloperPlatformService,
  integrationApiManagementService,
  integrationPlatformService,
  integrationHubService,
});
const enterpriseSaasManagementService = new EnterpriseSaasManagementService({
  db,
  enterpriseSaasPlatformService,
  enterpriseMissionControlService,
  financeService,
  aiOperationsService,
});
const voiceAiReceptionistService = new VoiceAiReceptionistService(db);
const callIntelligenceService = new CallIntelligenceService(db);
const enterpriseVoiceReceptionService = new EnterpriseVoiceReceptionService({
  db,
  voiceService,
  communicationsIntelligenceService,
  enterpriseUnifiedCommunicationsService,
  crmService,
  schedulingService,
  jobsService,
  leadsService,
  enterpriseKnowledgeGraphService,
  enterpriseMissionControlService,
});
const enterpriseDocumentAiService = new EnterpriseDocumentAiService({
  db,
  documentsService,
  crmService,
  jobsService,
  financeService,
  inventoryService,
  procurementService,
  enterpriseKnowledgeGraphService,
  enterpriseMissionControlService,
});
const enterpriseBusinessContinuityService = new EnterpriseBusinessContinuityService({
  db,
  enterpriseProductionReadinessService,
  enterpriseItOperationsService,
  enterpriseSecurityService,
  enterpriseMissionControlService,
});
const enterpriseGlobalSearchService = new EnterpriseGlobalSearchService({
  db,
  crmService,
  jobsService,
  financeService,
  leadsService,
  inventoryService,
  fleetService,
  procurementService,
  documentsService,
  enterpriseDocumentAiService,
  enterpriseKnowledgeGraphService,
  enterpriseMissionControlService,
});
const enterpriseDataMigrationService = new EnterpriseDataMigrationService({
  db,
  crmService,
  leadsService,
  financeService,
  jobsService,
  inventoryService,
  procurementService,
  fleetService,
  enterpriseMissionControlService,
});
const enterpriseNotificationsService = new EnterpriseNotificationsService({
  db,
  notificationService,
  enterpriseMissionControlService,
});
const enterprisePlatformHealthService = new EnterprisePlatformHealthService({
  db,
  databaseUrl: env.DATABASE_URL,
  jwtSecret: env.JWT_SECRET,
  enterpriseItOperationsService,
  enterpriseProductionReadinessService,
  enterpriseMissionControlService,
  integrationPlatformService,
  aiProviderResilienceService,
  enterpriseSaasPlatformService,
});
const enterpriseLaunchCenterService = new EnterpriseLaunchCenterService({
  db,
  databaseUrl: env.DATABASE_URL,
  jwtSecret: env.JWT_SECRET,
  enterpriseProductionReadinessService,
  enterprisePlatformHealthService,
  enterpriseSecurityService,
  enterpriseBusinessContinuityService,
  integrationPlatformService,
  aiProviderResilienceService,
  enterpriseNotificationsService,
  enterpriseDocumentAiService,
  enterpriseSaasPlatformService,
  enterpriseMissionControlService,
});
const enterpriseReleaseCenterService = new EnterpriseReleaseCenterService({
  db,
  databaseUrl: env.DATABASE_URL,
  jwtSecret: env.JWT_SECRET,
  encryptionKey: env.INTEGRATIONS_ENCRYPTION_KEY,
  enterpriseLaunchCenterService,
  enterprisePlatformHealthService,
  enterpriseSecurityService,
  enterpriseMissionControlService,
  integrationPlatformService,
  aiProviderResilienceService,
  enterpriseDocumentAiService,
  enterpriseKnowledgeGraphService,
  enterpriseSaasPlatformService,
  enterpriseIndustryPackService,
  enterpriseBusinessContinuityService,
  enterpriseVoiceReceptionService,
  enterpriseProductionReadinessService,
  enterpriseGlobalSearchService,
});
const enterpriseProductionLaunchService = new EnterpriseProductionLaunchService({
  db,
  databaseUrl: env.DATABASE_URL,
  jwtSecret: env.JWT_SECRET,
  jwtRefreshSecret: env.JWT_REFRESH_SECRET,
  encryptionKey: env.INTEGRATIONS_ENCRYPTION_KEY,
  appUrl: env.APP_URL,
  apiPublicUrl: env.API_PUBLIC_URL,
  redisUrl: env.REDIS_URL,
  nodeEnv: env.NODE_ENV,
  enterpriseMissionControlService,
  enterpriseSecurityService,
  integrationPlatformService,
  aiProviderResilienceService,
  enterpriseProductionReadinessService,
  enterpriseSaasManagementService,
  enterpriseMobilePlatformService,
  enterpriseReleaseCenterService,
});
const enterpriseReleaseManagementService = new EnterpriseReleaseManagementService({
  db,
  enterpriseMissionControlService,
  enterpriseMobilePlatformService,
  enterpriseProductionLaunchService,
  enterpriseReleaseCenterService,
});
const agentRuntimeService = new AgentRuntimeService({
  db,
  provider: auraProvider,
  config: auraConfig,
  agentsService,
  crmService,
  jobsService,
  schedulingService,
  financeService,
  inventoryService,
  fleetService,
  integrationsService,
  xeroSyncService,
  whatsappService,
  recruitingService,
  intelligenceService,
  recommendationsService,
  memoryService,
  analyticsService,
  mobileService,
  orchestrationService: agentOrchestrationService,
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
  workflowStudioService,
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
  connectorEngineService,
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
  aiProviderResilienceService,
  automationService,
});
const agentOrchestrationEngineService = new AgentOrchestrationEngineService({
  db,
  orchestrationService: agentOrchestrationService,
  agentRuntimeService,
});
bindAutomationEventEmitter(async (event) => {
  await workflowEngineService.emit(event);
  await agentOrchestrationEngineService.emit(event);
});
const runtimeMode = (process.env.TITAN_RUNTIME_MODE || 'api').toLowerCase();
const isWorkerProcess = runtimeMode === 'worker' || runtimeMode === 'scheduler';

const backgroundRuntimeAllowed =
  env.runtime.startInProcessAutomationWorkers || env.runtime.schedulersEnabled;
if (isWorkerProcess && !backgroundRuntimeAllowed) {
  logger.error(
    { runtimeMode },
    'Worker/scheduler process refused: enable WORKERS_ENABLED, SCHEDULERS_ENABLED, or AUTOMATIONS_ENABLED',
  );
  process.exit(2);
}

const stopAutomationWorkers =
  env.runtime.startInProcessAutomationWorkers && (isWorkerProcess || runtimeMode === 'api')
    ? startAutomationWorkers({
        workflowEngine: workflowEngineService,
        orchestrationEngine: agentOrchestrationEngineService,
      })
    : () => {
        /* workers/schedulers/automations disabled by runtime flags */
      };

const stopIntegrationSyncScheduler =
  env.runtime.schedulersEnabled && (isWorkerProcess || runtimeMode === 'scheduler' || runtimeMode === 'api')
    ? startIntegrationSyncScheduler(backgroundWorkOrchestratorService)
    : () => {
        /* integration sync scheduler disabled by runtime flags */
      };

if (!env.runtime.startInProcessAutomationWorkers && runtimeMode === 'api') {
  logger.info(
    {
      workersEnabled: env.runtime.workersEnabled,
      schedulersEnabled: env.runtime.schedulersEnabled,
      automationsEnabled: env.runtime.automationsEnabled,
    },
    'In-process automation workers not started (runtime flags)',
  );
}
const portalAuthService = new PortalAuthService(db, { jwtSecret: env.JWT_SECRET });
const portalService = new PortalService(db, env.APP_URL);

const auraService = new AuraService({
  db,
  provider: auraProvider,
  config: auraConfig,
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
  communicationsService,
  documentsService,
  automationService,
  agentsService,
  recruitingService,
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
  teamService,
  intelligenceService,
  recommendationsService,
  memoryService,
  businessRulesService,
  dayPlanService,
  analyticsService,
  mobileService,
  orchestrationService: agentOrchestrationService,
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
  aiProviderResilienceService,
  tenantCapabilityBuilderService,
});

const app: Express = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(securityHeadersMiddleware());
app.use(requestContextMiddleware());

app.use(
  pinoHttp({
    logger,
    customProps: (req) => ({
      correlationId: req.correlationId,
    }),
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        'res.headers["set-cookie"]',
      ],
      remove: true,
    },
  }),
);

const corsOrigins = parseCorsOriginAllowlist(env.APP_URL, env.CORS_ORIGINS);
app.use(
  cors({
    origin(origin, callback) {
      // Non-browser clients omit Origin; allow those. Browsers must match APP_URL / CORS_ORIGINS.
      if (!origin || corsOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  }),
);

// 15mb accommodates base64-encoded job evidence uploads (documents capped at 10MB binary, ~37% base64 overhead).
app.use(
  express.json({
    limit: '15mb',
    verify: (req, _res, buf) => {
      (req as { rawBody?: string }).rawBody = buf.toString('utf8');
    },
  }),
);
app.use(cookieParser());

if (dbDiagnosticsEnabled) {
  app.use(createDbDiagnosticsMiddleware(true));
}

app.get('/', (_req, res) => {
  res.json({
    data: {
      service: 'TITAN API',
      version: env.NODE_ENV,
      docs: '/api/v1/health',
    },
  });
});

app.use(
  '/api/v1',
  createHealthRouter({
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    runtime: env.runtime,
    log: logger,
  }),
);
bootLog('health endpoints registered', {
  live: '/api/v1/health/live',
  ready: '/api/v1/health/ready',
  health: '/api/v1/health',
  readyRequireRedis: env.runtime.readyRequireRedis,
  redisConfigured: Boolean(env.REDIS_URL),
});

// Non-blocking startup probe so Railway logs show DB reachability before the first healthcheck.
void probeDbConnection(env.DATABASE_URL).then((probe) => {
  if (probe.ok) {
    bootLog('database probe ok', {
      host: probe.endpoint.host,
      port: probe.endpoint.port,
      isSupabasePooler: probe.endpoint.isSupabasePooler,
    });
    return;
  }
  bootLog('database probe failed', {
    code: probe.code,
    message: probe.message,
    host: probe.endpoint.host,
    port: probe.endpoint.port,
    sslmode: probe.endpoint.sslmode,
    isSupabaseDirect: probe.endpoint.isSupabaseDirect,
    isSupabasePooler: probe.endpoint.isSupabasePooler,
  });
});
app.use(
  '/api/v1/auth',
  createAuthRouter({
    authService,
    jwtSecret: env.JWT_SECRET,
    isProduction: env.NODE_ENV === 'production',
    logger,
    enterpriseSecurityService,
  }),
);
app.use(
  '/api/v1/aura',
  createAuraRouter({
    auraService,
    db,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/company',
  createCompanyRouter({
    companyService,
    companyMediaService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/team',
  createTeamRouter({
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/crm',
  createCrmRouter({
    crmService,
    customerDuplicateMergeService,
    customerValueClassificationService,
    teamService,
    db,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/customers',
  createCustomersRouter({
    customerValueClassificationService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/dashboard',
  createDashboardRouter({
    dashboardExecutiveService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/supplier-price-intelligence',
  createSupplierPriceIntelligenceRouter({
    supplierPriceIntelligenceService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/marketing-eligibility',
  createMarketingEligibilityRouter({
    marketingEligibilityService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/jobs',
  createJobsRouter({
    jobsService,
    jobExecutionService,
    jobCostingService,
    mobileWorkforceService,
    teamService,
    db,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/scheduling',
  createSchedulingRouter({
    schedulingService,
    teamService,
    db,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/finance',
  createFinanceRouter({
    financeService,
    teamService,
    db,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/boq',
  createBoqRouter({
    boqService,
    teamService,
    db,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/drafts',
  createDraftsRouter({
    draftAutosaveService,
    teamService,
    db,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/job-document-packs',
  createJobDocumentPackRouter({
    jobDocumentPackService,
    teamService,
    db,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/completion-reports',
  createCompletionReportRouter({
    completionReportService,
    teamService,
    db,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/inventory',
  createInventoryRouter({
    inventoryService,
    stockMovementsService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/fleet',
  createFleetRouter({
    fleetService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/integrations',
  createIntegrationsRouter({
    integrationsService,
    businessIntegrationsService,
    resendEmailService,
    xeroSyncService,
    xeroWriteApprovalWorkflowService,
    integrationHubService,
    integrationApiManagementService,
    whatsappService,
    xeroOAuthService,
    teamService,
    appUrl: env.APP_URL,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/integrations',
  createGoogleMapsRouter({
    googleMapsService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/whatsapp',
  createWhatsappRouter({
    whatsappService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/whatsapp/enrichment',
  createWhatsappEnrichmentRouter({
    enrichmentService: whatsappContactEnrichmentService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/webhooks/whatsapp',
  createWhatsappWebhookRouter({
    whatsappService,
    db,
    appSecret: env.WHATSAPP_APP_SECRET,
  }),
);
app.use(
  '/api/v1/webhooks/resend',
  createResendWebhookRouter({
    resendEmailService,
  }),
);
app.use(
  '/api/v1/communications',
  createCommunicationsRouter({
    communicationsService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/communications-platform',
  createCommunicationsPlatformRouter({
    communicationsPlatformService,
    gmailOAuthService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
    appUrl: env.APP_URL,
  }),
);
app.use(
  '/api/v1/email-centre',
  createEmailCentreRouter({
    emailCentreService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/documents',
  createDocumentsRouter({
    documentsService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/automation',
  createAutomationRouter({
    automationService,
    workflowEngineService,
    workflowStudioService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/automation/n8n',
  createN8nOrchestrationRouter({
    n8nOrchestrationService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
// Public HMAC callbacks — dedicated path outside /automation auth middleware.
app.use(
  '/api/v1/n8n-callbacks',
  createN8nCallbackRouter({
    n8nOrchestrationService,
  }),
);
app.use(
  '/api/v1/automation-studio',
  createEnterpriseAutomationStudioRouter({
    enterpriseAutomationStudioService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/digital-twin',
  createEnterpriseDigitalTwinRouter({
    enterpriseDigitalTwinService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/knowledge-graph',
  createEnterpriseKnowledgeGraphRouter({
    enterpriseKnowledgeGraphService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/mission-control',
  createEnterpriseMissionControlRouter({
    enterpriseMissionControlService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/evolution',
  createEnterpriseEvolutionRouter({
    enterpriseEvolutionService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/developer-platform',
  createEnterpriseDeveloperPlatformRouter({
    enterpriseDeveloperPlatformService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/platform',
  createEnterpriseSaasPlatformRouter({
    enterpriseSaasPlatformService,
    aiOperationsService,
    aiProviderResilienceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/agent-orchestration',
  createAgentOrchestrationRouter({
    orchestrationService: agentOrchestrationService,
    orchestrationEngine: agentOrchestrationEngineService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/sales',
  createSalesRouter({
    salesService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/marketing',
  createMarketingRouter({
    marketingService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/leads',
  createLeadsRouter({
    leadsService,
    leadConversionService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/voice',
  createVoiceRouter({
    voiceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/customer-support',
  createCustomerSupportRouter({
    customerSupportService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/workforce',
  createWorkforceRouter({
    workforceService,
    recruitingService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/procurement',
  createProcurementRouter({
    procurementService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/executive',
  createExecutiveRouter({
    executiveService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/finance-intelligence',
  createFinanceIntelligenceRouter({
    financeIntelligenceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/knowledge',
  createKnowledgeRouter({
    knowledgeService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/business-intelligence',
  createBusinessIntelligenceRouter({
    businessIntelligenceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/intelligence',
  createIntelligenceRouter({
    intelligenceService,
    recommendationsService,
    memoryService,
    businessRulesService,
    dayPlanService,
    dayPlanFollowUpsService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/mobile',
  createMobileRouter({
    mobileService,
    notificationService,
    mobileSyncService,
    technicianWorkflowService,
    mobileWorkforceService,
    jobExecutionService,
    recommendationsService,
    teamService,
    portalAuthService,
    db,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/analytics',
  createAnalyticsRouter({
    analyticsService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/agents',
  createAgentsRouter({
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
    businessIntelligenceService,
    workflowStudioService,
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
    connectorEngineService,
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
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/tenant-capabilities',
  createTenantCapabilitiesRouter({
    tenantCapabilityBuilderService,
    db,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/quality',
  createQualityRouter({
    qualityAssuranceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/communications-intelligence',
  createCommunicationsIntelligenceRouter({
    communicationsIntelligenceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/asset-equipment',
  createAssetEquipmentRouter({
    assetEquipmentIntelligenceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/ai-orchestration',
  createAiOrchestrationRouter({
    aiOrchestrationService,
    aiUnifiedGatewayService,
    aiMemorySyncService,
    aiComparisonService,
    aiProviderResilienceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/operations',
  createEnterpriseProductionReadinessRouter({
    enterpriseProductionReadinessService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/enterprise-mobile',
  createEnterpriseMobilePlatformRouter({
    enterpriseMobilePlatformService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/enterprise-communications',
  createEnterpriseUnifiedCommunicationsRouter({
    enterpriseUnifiedCommunicationsService,
    dispatchCommunicationService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/enterprise-customer-experience',
  createEnterpriseCustomerExperienceRouter({
    enterpriseCustomerExperienceService,
    portalExperienceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
    portalAuthService,
  }),
);
app.use(
  '/api/v1/enterprise-asset-lifecycle',
  createEnterpriseAssetLifecycleRouter({
    enterpriseAssetLifecycleService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
    portalAuthService,
  }),
);
app.use(
  '/api/v1/enterprise-workforce',
  createEnterpriseWorkforceIntelligenceRouter({
    enterpriseWorkforceIntelligenceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
    portalAuthService,
  }),
);
app.use(
  '/api/v1/enterprise-legal-compliance',
  createEnterpriseLegalComplianceRouter({
    enterpriseLegalComplianceService,
    jwtSecret: env.JWT_SECRET,
    authService,
    portalAuthService,
  }),
);
app.use(
  '/api/v1/enterprise-financial-planning',
  createEnterpriseFinancialPlanningRouter({
    enterpriseFinancialPlanningService,
    jwtSecret: env.JWT_SECRET,
    authService,
    portalAuthService,
  }),
);
app.use(
  '/api/v1/enterprise-sales-intelligence',
  createEnterpriseSalesIntelligenceRouter({
    enterpriseSalesIntelligenceService,
    jwtSecret: env.JWT_SECRET,
    authService,
    portalAuthService,
  }),
);
app.use(
  '/api/v1/enterprise-marketing-intelligence',
  createEnterpriseMarketingIntelligenceRouter({
    enterpriseMarketingIntelligenceService,
    jwtSecret: env.JWT_SECRET,
    authService,
    portalAuthService,
  }),
);
app.use(
  '/api/v1/enterprise-service-delivery',
  createEnterpriseServiceDeliveryRouter({
    enterpriseServiceDeliveryService,
    jwtSecret: env.JWT_SECRET,
    authService,
    portalAuthService,
  }),
);
app.use(
  '/api/v1/enterprise-it-operations',
  createEnterpriseItOperationsRouter({
    enterpriseItOperationsService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/enterprise-business-evolution',
  createEnterpriseBusinessEvolutionRouter({
    enterpriseBusinessEvolutionService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/enterprise-app-builder',
  createEnterpriseAppBuilderRouter({
    enterpriseAppBuilderService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/enterprise-industry-packs',
  createEnterpriseIndustryPacksRouter({
    enterpriseIndustryPackService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/enterprise-public-developer',
  createEnterprisePublicDeveloperPlatformRouter({
    enterprisePublicDeveloperPlatformService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/enterprise-saas-management',
  createEnterpriseSaasManagementRouter({
    enterpriseSaasManagementService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/voice-ai-receptionist',
  createVoiceAiReceptionistRouter({
    voiceAiReceptionistService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);

app.use(
  '/api/v1/call-intelligence',
  createCallIntelligenceRouter({
    callIntelligenceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/enterprise-voice-reception',
  createEnterpriseVoiceReceptionRouter({
    enterpriseVoiceReceptionService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/enterprise-document-ai',
  createEnterpriseDocumentAiRouter({
    enterpriseDocumentAiService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/enterprise-business-continuity',
  createEnterpriseBusinessContinuityRouter({
    enterpriseBusinessContinuityService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/enterprise-global-search',
  createEnterpriseGlobalSearchRouter({
    enterpriseGlobalSearchService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/enterprise-data-migration',
  createEnterpriseDataMigrationRouter({
    enterpriseDataMigrationService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/enterprise-notifications',
  createEnterpriseNotificationsRouter({
    enterpriseNotificationsService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/enterprise-platform-health',
  createEnterprisePlatformHealthRouter({
    enterprisePlatformHealthService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/enterprise-launch-center',
  createEnterpriseLaunchCenterRouter({
    enterpriseLaunchCenterService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/enterprise-release-center',
  createEnterpriseReleaseCenterRouter({
    enterpriseReleaseCenterService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/enterprise-production-launch',
  createEnterpriseProductionLaunchRouter({
    enterpriseProductionLaunchService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/enterprise-release-management',
  createEnterpriseReleaseManagementRouter({
    enterpriseReleaseManagementService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/dispatch-intelligence',
  createDispatchIntelligenceRouter({
    dispatchIntelligenceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/ops-intelligence',
  createOpsIntelligenceRouter({
    opsIntelligenceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/fleet-intelligence',
  createFleetIntelligenceRouter({
    fleetIntelligenceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/personal-communications-intelligence',
  createPersonalCommunicationsIntelligenceRouter({
    personalCommunicationsIntelligenceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/personal-whatsapp-intelligence',
  createPersonalWhatsappIntelligenceRouter({
    personalWhatsappIntelligenceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/personal-whatsapp-connection',
  createPersonalWhatsappConnectionRouter({
    personalWhatsappConnectionService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/communication-aura-intelligence',
  createCommunicationAuraIntelligenceRouter({
    communicationAuraIntelligenceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/aura-command-centre',
  createAuraCommandCentreRouter({
    auraCommandCentreService,
    jwtSecret: env.JWT_SECRET,
    authService,
    db,
  }),
);
app.use(
  '/api/v1/aura-agent-network',
  createAuraAgentNetworkRouter({
    auraAgentNetworkService,
    jwtSecret: env.JWT_SECRET,
    authService,
    db,
  }),
);
app.use(
  '/api/v1/aura-evolution',
  createAuraEvolutionRouter({
    auraEvolutionService,
    jwtSecret: env.JWT_SECRET,
    authService,
    db,
  }),
);
app.use(
  '/api/v1/marketing-agent',
  createMarketingAgentRouter({
    marketingAgentService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/finance-aura-agent',
  createFinanceAuraAgentRouter({
    financeAuraAgentService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);

app.use(
  '/api/v1/sales-intelligence-agent',
  createSalesIntelligenceAgentRouter({
    salesIntelligenceAgentService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/finance-reporting-forecast',
  createFinanceReportingForecastRouter({
    financeReportingForecastService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);

app.use(
  '/api/v1/finance-cashflow-profit',
  createFinanceCashflowProfitRouter({
    financeCashflowProfitService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/inventory-intelligence',
  createInventoryIntelligenceRouter({
    inventoryIntelligenceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/hr-employee-intelligence',
  createHrEmployeeIntelligenceRouter({
    hrEmployeeIntelligenceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);

app.use(
  '/api/v1/recruitment-performance-intelligence',
  createRecruitmentPerformanceIntelligenceRouter({
    recruitmentPerformanceIntelligenceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);

app.use(
  '/api/v1/payroll-timesheet-intelligence',
  createPayrollTimesheetIntelligenceRouter({
    payrollTimesheetIntelligenceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/procurement-intelligence',
  createProcurementIntelligenceRouter({
    procurementIntelligenceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/stock-forecasting',
  createStockForecastingRouter({
    stockForecastingService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/vehicle-intelligence',
  createVehicleIntelligenceRouter({
    vehicleIntelligenceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/fleet-ai-recommendations',
  createFleetAiRecommendationsRouter({
    fleetAiRecommendationsService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);

app.use(
  '/api/v1/driver-intelligence',
  createDriverIntelligenceRouter({
    driverIntelligenceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/social-media-integrations',
  createSocialMediaIntegrationsRouter({
    socialMediaIntegrationsService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/content-reputation-intelligence',
  createContentReputationIntelligenceRouter({
    contentReputationIntelligenceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/technician-intelligence',
  createTechnicianIntelligenceRouter({
    technicianIntelligenceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
    db,
  }),
);

app.use(
  '/api/v1/workflow-automation',
  createWorkflowAutomationRouter({
    workflowAutomationService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
    db,
  }),
);
app.use(
  '/api/v1/recurring-maintenance',
  createRecurringMaintenanceRouter({
    recurringMaintenanceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
    db,
  }),
);
app.use(
  '/api/v1/homeshield-experience',
  createHomeshieldExperienceRouter({
    homeshieldExperienceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
    portalAuthService,
  }),
);

app.use(
  '/api/v1/customer-engagement-intelligence',
  createCustomerEngagementIntelligenceRouter({
    customerEngagementIntelligenceService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);

app.use(
  '/api/v1/enterprise-security',
  createEnterpriseSecurityRouter({
    enterpriseSecurityService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/integration-platform',
  createIntegrationPlatformRouter({
    integrationPlatformService,
    connectorEngineService,
    businessIntegrationsService,
    xeroSyncService,
    integrationSyncOrchestratorService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/background-work',
  createBackgroundWorkRouter({
    backgroundWorkOrchestrator: backgroundWorkOrchestratorService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/enterprise-analytics',
  createEnterpriseAnalyticsRouter({
    enterpriseAnalyticsService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/recruiting',
  createRecruitingRouter({
    recruitingService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/portal/auth',
  createPortalAuthRouter({
    portalAuthService,
    jwtSecret: env.JWT_SECRET,
    isProduction: env.NODE_ENV === 'production',
  }),
);
app.use(
  '/api/v1/portal/expansion',
  createPortalExpansionRouter({
    portalExpansionService,
    portalAuthService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);

app.use(
  '/api/v1/portal',
  createPortalRouter({
    portalService,
    portalExperienceService,
    notificationService,
    portalAuthService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);

app.use(notFoundHandler());
app.use(createErrorHandler(logger));

type HttpServer = ReturnType<typeof app.listen> | null;
let server: HttpServer = null;

if (!isWorkerProcess) {
  bootLog('binding HTTP server', { host: env.HOST, port: env.PORT });
  server = app.listen(env.PORT, env.HOST, () => {
    bootLog('Server listening...', {
      host: env.HOST,
      port: env.PORT,
      environment: env.APP_ENV ?? env.TITAN_ENV ?? env.NODE_ENV,
      healthReady: '/api/v1/health/ready',
    });
    logger.info(
      {
        port: env.PORT,
        host: env.HOST,
        nodeEnv: env.NODE_ENV,
        appEnv: env.APP_ENV,
        titanEnv: env.TITAN_ENV,
        runtimeMode,
        providersEnabled: env.runtime.providersEnabled,
        workersEnabled: env.runtime.startInProcessAutomationWorkers,
        readyRequireRedis: env.runtime.readyRequireRedis,
        companyMediaStoragePath,
      },
      'TITAN API started — Server listening...',
    );
  });
  server.on('error', (error) => {
    console.error('[titan-api] FATAL: HTTP server error', error);
    process.exit(1);
  });
} else {
  logger.info(
    {
      runtimeMode,
      providersEnabled: env.runtime.providersEnabled,
      workersEnabled: env.runtime.startInProcessAutomationWorkers,
    },
    'TITAN worker/scheduler started (HTTP disabled)',
  );
}

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal, runtimeMode }, 'Shutting down TITAN process');
  stopAutomationWorkers();
  stopIntegrationSyncScheduler();
  if (server) {
    await new Promise<void>((resolve) => {
      server?.close(() => resolve());
      setTimeout(resolve, 10_000).unref?.();
    });
  }
  await closeDb();
  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

export { app };
