import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { createAuraProvider, isAuraProviderConfigured } from '@titan/aura';
import { createDb } from '@titan/db';
import { loadAuraEnvConfig, loadEnv } from './config.js';
import { createErrorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createAuthRouter } from './routes/auth.js';
import { createAuraRouter } from './routes/aura.js';
import { createCompanyRouter } from './routes/company.js';
import { createTeamRouter } from './routes/team.js';
import { createHealthRouter } from './routes/health.js';
import { AuthService } from './services/auth.service.js';
import { AuraService } from './services/aura.service.js';
import { CompanyService } from './services/company.service.js';
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
import { createAutomationRouter } from './routes/automation.js';
import { createEnterpriseAutomationStudioRouter } from './routes/enterprise-automation-studio.js';
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

const db = createDb(env.DATABASE_URL);
const authService = new AuthService(db, {
  jwtSecret: env.JWT_SECRET,
});

const auraProvider = isAuraProviderConfigured(auraConfig)
  ? createAuraProvider(auraConfig)
  : null;

if (auraProvider) {
  logger.info({ provider: auraProvider.name, model: auraConfig.openaiModel }, 'AURA provider ready');
} else {
  logger.warn('AURA provider not configured — set AURA_OPENAI_API_KEY to enable AI responses');
}

const companyService = new CompanyService(db);
const teamService = new TeamService(db, env.APP_URL);
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
const financeIntelligenceService = new FinanceIntelligenceService({
  db,
  financeService,
  analyticsService,
  procurementService,
});
const knowledgeService = new KnowledgeService({ db });
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
);
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
startAutomationWorkers({
  workflowEngine: workflowEngineService,
  orchestrationEngine: agentOrchestrationEngineService,
});
const portalAuthService = new PortalAuthService(db, { jwtSecret: env.JWT_SECRET });
const portalService = new PortalService(db);

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
    enterpriseSecurityService,
  }),
);
app.use(
  '/api/v1/aura',
  createAuraRouter({
    auraService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/company',
  createCompanyRouter({
    companyService,
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
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/jobs',
  createJobsRouter({
    jobsService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/scheduling',
  createSchedulingRouter({
    schedulingService,
    teamService,
    jwtSecret: env.JWT_SECRET,
    authService,
  }),
);
app.use(
  '/api/v1/finance',
  createFinanceRouter({
    financeService,
    teamService,
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
    teamService,
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
    teamService,
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
  logger.info({ port: env.PORT, host: env.HOST }, 'TITAN API started');
});

export { app };
