import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { createAuraProvider, isAuraProviderConfigured } from '@titan/aura';
import { closeDb, createDb } from '@titan/db';
import { loadAuraEnvConfig, loadEnv } from './config.js';
import { attachDbQueryDiagnostics, createDbDiagnosticsMiddleware } from './lib/db-diagnostics.js';
import { resolveCompanyMediaStoragePath } from './lib/company-media-storage.js';
import { createErrorHandler, notFoundHandler } from './middleware/error-handler.js';
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
import { createJobsRouter } from './routes/jobs.js';
import { createSchedulingRouter } from './routes/scheduling.js';
import { CrmService } from './services/crm.service.js';
import { JobsService } from './services/jobs.service.js';
import { SchedulingService } from './services/scheduling.service.js';
import { FinanceService } from './services/finance.service.js';
import { createFinanceRouter } from './routes/finance.js';
import { InventoryService } from './services/inventory.service.js';
import { createInventoryRouter } from './routes/inventory.js';
import { FleetService } from './services/fleet.service.js';
import { createFleetRouter } from './routes/fleet.js';
import { IntegrationsService } from './services/integrations.service.js';
import { IntegrationHubService } from './services/integration-hub.service.js';
import { IntegrationApiManagementService } from './services/integration-api-management.service.js';
import { BusinessIntegrationsService } from './services/business-integrations.service.js';
import { XeroSyncService } from './services/xero-sync.service.js';
import { WhatsappService } from './services/whatsapp.service.js';
import { createIntegrationsRouter } from './routes/integrations.js';
import { createWhatsappRouter } from './routes/whatsapp.js';
import { createWhatsappWebhookRouter } from './routes/whatsapp-webhook.js';
import { CommunicationsService } from './services/communications.service.js';
import { createCommunicationsRouter } from './routes/communications.js';
import { DocumentsService } from './services/documents.service.js';
import { createDocumentsRouter } from './routes/documents.js';
import { AutomationService } from './services/automation.service.js';
import { WorkflowEngineService } from './services/workflow-engine.service.js';
import { MemoryService } from './services/memory.service.js';
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
import { createEnterpriseUnifiedCommunicationsRouter } from './routes/enterprise-unified-communications.js';
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
import { AgentsService } from './services/agents.service.js';
import { AgentRuntimeService } from './services/agent-runtime.service.js';
import { AgentOrchestrationService } from './services/agent-orchestration.service.js';
import { AgentOrchestrationEngineService } from './services/agent-orchestration-engine.service.js';
import { SalesService } from './services/sales.service.js';
import { MarketingService } from './services/marketing.service.js';
import { LeadsService } from './services/leads.service.js';
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
import { MobileWorkforceService } from './services/mobile-workforce.service.js';
import { QualityAssuranceService } from './services/quality-assurance.service.js';
import { CommunicationsIntelligenceService } from './services/communications-intelligence.service.js';
import { AssetEquipmentIntelligenceService } from './services/asset-equipment-intelligence.service.js';
import { AiOrchestrationService } from './services/ai-orchestration.service.js';
import { DispatchIntelligenceService } from './services/dispatch-intelligence.service.js';
import { FleetIntelligenceService } from './services/fleet-intelligence.service.js';
import { PersonalCommunicationsIntelligenceService } from './services/personal-communications-intelligence.service.js';
import { EnterpriseSecurityService } from './services/enterprise-security.service.js';
import { ConnectorEngineService } from './services/connector-engine.service.js';
import { IntegrationPlatformService } from './services/integration-platform.service.js';
import { EnterpriseAnalyticsService } from './services/enterprise-analytics.service.js';
import { createQualityRouter } from './routes/quality.js';
import { createCommunicationsIntelligenceRouter } from './routes/communications-intelligence.js';
import { createAssetEquipmentRouter } from './routes/asset-equipment.js';
import { createAiOrchestrationRouter } from './routes/ai-orchestration.js';
import { createDispatchIntelligenceRouter } from './routes/dispatch-intelligence.js';
import { createFleetIntelligenceRouter } from './routes/fleet-intelligence.js';
import { createPersonalCommunicationsIntelligenceRouter } from './routes/personal-communications-intelligence.js';
import { createEnterpriseSecurityRouter } from './routes/enterprise-security.js';
import { createIntegrationPlatformRouter } from './routes/integration-platform.js';
import { createEnterpriseAnalyticsRouter } from './routes/enterprise-analytics.js';
import { createPortalAuthRouter } from './routes/portal-auth.js';
import { createPortalRouter } from './routes/portal.js';

const env = loadEnv();
const auraConfig = loadAuraEnvConfig();
const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
});

const dbDiagnosticsEnabled = env.NODE_ENV !== 'production';
if (dbDiagnosticsEnabled) {
  attachDbQueryDiagnostics();
}

const db = createDb(env.DATABASE_URL);
const authService = new AuthService(db, {
  jwtSecret: env.JWT_SECRET,
});

const auraProvider = isAuraProviderConfigured(auraConfig) ? createAuraProvider(auraConfig) : null;

if (auraProvider) {
  logger.info(
    { provider: auraProvider.name, model: auraConfig.openaiModel },
    'AURA provider ready',
  );
} else {
  logger.warn('AURA provider not configured — set AURA_OPENAI_API_KEY to enable AI responses');
}

const companyService = new CompanyService(db);
const companyMediaStoragePath = resolveCompanyMediaStoragePath(process.env.COMPANY_MEDIA_STORAGE_PATH);
const companyMediaService = new CompanyMediaService(companyMediaStoragePath);
const teamService = new TeamService(db, env.APP_URL);
const enterpriseSaasPlatformService = new EnterpriseSaasPlatformService({
  db,
  teamService,
});
const crmService = new CrmService(db);
const jobsService = new JobsService(db);
const schedulingService = new SchedulingService(db);
const financeService = new FinanceService(db);
const inventoryService = new InventoryService(db);
const fleetService = new FleetService(db);
const integrationHubService = new IntegrationHubService(db);
const businessIntegrationsService = BusinessIntegrationsService.create({
  db,
  encryptionKey: env.INTEGRATIONS_ENCRYPTION_KEY,
  hubService: integrationHubService,
});
const xeroSyncService = XeroSyncService.create({
  db,
  encryptionKey: env.INTEGRATIONS_ENCRYPTION_KEY,
  hubService: integrationHubService,
});
const integrationsService = IntegrationsService.create({
  db,
  encryptionKey: env.INTEGRATIONS_ENCRYPTION_KEY,
  hubService: integrationHubService,
});
const apiPublicUrl = env.API_PUBLIC_URL ?? `http://localhost:${env.PORT}`;
const whatsappService = WhatsappService.create({
  db,
  encryptionKey: env.INTEGRATIONS_ENCRYPTION_KEY,
  apiPublicUrl,
  hubService: integrationHubService,
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
const communicationsService = new CommunicationsService(db);
const documentsService = new DocumentsService(db);
const automationService = new AutomationService(db);
const agentOrchestrationService = new AgentOrchestrationService(db);
const salesService = new SalesService(db);
const marketingService = new MarketingService(db);
const leadsService = new LeadsService(db);
const voiceService = new VoiceService(db);
const customerSupportService = new CustomerSupportService(db);
const workflowEngineService = new WorkflowEngineService({
  db,
  crmService,
  jobsService,
  whatsappService,
  communicationsService,
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
const intelligenceService = new IntelligenceService({
  db,
  financeService,
  schedulingService,
  inventoryService,
  automationService,
});
const recommendationsService = new RecommendationsService(intelligenceService);
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
const notificationService = new NotificationService(db);
const mobileSyncService = new MobileSyncService(db);
const technicianWorkflowService = new TechnicianWorkflowService(
  db,
  jobsService,
  notificationService,
  mobileSyncService,
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
const mobileWorkforceService = new MobileWorkforceService(
  db,
  mobileService,
  mobileSyncService,
  jobsService,
  inventoryService,
  integrationsService,
  notificationService,
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
const enterpriseUnifiedCommunicationsService = new EnterpriseUnifiedCommunicationsService({
  db,
  enterpriseSaasPlatformService,
  communicationsIntelligenceService,
  voiceService,
  whatsappService,
  integrationsService,
  integrationHubService,
});
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
const stopAutomationWorkers = startAutomationWorkers({
  workflowEngine: workflowEngineService,
  orchestrationEngine: agentOrchestrationEngineService,
});
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

app.use(
  pinoHttp({
    logger,
  }),
);

app.use(
  cors({
    origin: env.APP_URL,
    credentials: true,
  }),
);

app.use(express.json());
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

app.use('/api/v1', createHealthRouter(env.DATABASE_URL));
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
    teamService,
    db,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/jobs',
  createJobsRouter({
    jobsService,
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
  '/api/v1/inventory',
  createInventoryRouter({
    inventoryService,
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
    xeroSyncService,
    integrationHubService,
    integrationApiManagementService,
    whatsappService,
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
  '/api/v1/webhooks/whatsapp',
  createWhatsappWebhookRouter({
    whatsappService,
    db,
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
    recommendationsService,
    teamService,
    portalAuthService,
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

app.listen(env.PORT, env.HOST, () => {
  logger.info(
    { port: env.PORT, host: env.HOST, companyMediaStoragePath },
    'TITAN API started',
  );
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down TITAN API');
  stopAutomationWorkers();
  await closeDb();
  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

export { app };
