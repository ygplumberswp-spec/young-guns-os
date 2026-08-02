import { relations } from 'drizzle-orm';
import { auraConversations } from './aura-conversations';
import { analyticsSnapshots, reportDefinitions, reportRuns } from './analytics';
import {
  agentOrchestrationApprovals,
  agentOrchestrationLogs,
  agentOrchestrationRunSteps,
  agentOrchestrationRuns,
  agentOrchestrationSteps,
  agentOrchestrationTriggers,
  agentOrchestrations,
} from './agent-orchestration';
import {
  mobileActionLogs,
  mobilePendingActions,
  mobileSyncQueue,
  mobileSyncState,
  notificationPreferences,
  notifications,
} from './mobile';
import { auraMemory } from './aura-memory';
import { auraMessages } from './aura-messages';
import { companies } from './companies';
import { customerActivities } from './customer-activities';
import { customers } from './customers';
import { jobs } from './jobs';
import { cxCustomerProperties } from './enterprise-customer-experience';
import { invoiceLineItems, invoices } from './invoices';
import { inventoryItems } from './inventory-items';
import { inventoryLocations } from './inventory-locations';
import { inventoryStockLevels } from './inventory-stock-levels';
import { inventoryStockMovements } from './inventory-stock-movements';
import { jobMaterialLines } from './job-execution';
import { integrationConnections } from './integration-connections';
import { integrationVehicleMappings } from './integration-vehicle-mappings';
import { gpsPositions } from './gps-positions';
import { communications } from './communications';
import { documentCategories } from './document-categories';
import { documents } from './documents';
import { agentExecutions } from './agent-executions';
import { agentProfilePermissions } from './agent-profile-permissions';
import { agentProfileTools } from './agent-profile-tools';
import { agentProfiles } from './agent-profiles';
import { messageTemplates } from './message-templates';
import { workflowActions } from './workflow-actions';
import { workflowConditions } from './workflow-conditions';
import { workflowExecutions } from './workflow-executions';
import { workflowRuns } from './workflow-runs';
import { workflowStepResults } from './workflow-step-results';
import { workflowSteps } from './workflow-steps';
import { automationQueueJobs } from './automation-queue-jobs';
import { workflowTriggers } from './workflow-triggers';
import { workflows } from './workflows';
import { workflowTemplates } from './workflow-templates';
import { workflowSchedules } from './workflow-schedules';
import { workflowWebhooks } from './workflow-webhooks';
import { workflowAuditLogs } from './workflow-audit-logs';
import {
  n8nAuditEvents,
  n8nCallbackReceipts,
  n8nConnections,
  n8nExecutions,
  n8nWorkflowRegistrations,
} from './n8n-orchestration';
import { portalUserPermissions } from './portal-user-permissions';
import { portalSessions } from './portal-sessions';
import { portalUsers } from './portal-users';
import { portalUserInvites } from './portal-user-invites';
import { portalCustomerRequests } from './portal-customer-requests';
import {
  mobileCompanyAnnouncements,
  mobileJobDocumentation,
  mobileJobInventoryUsage,
  mobileSyncConflicts,
  mobileTimeEntries,
  mobileWorkforceRequests,
} from './mobile-workforce';
import {
  qualityActions,
  qualityComebacks,
  qualityCostEntries,
  qualityRootCauseAnalyses,
  qualitySupplierDefects,
  qualityWarrantyClaims,
} from './quality-assurance';
import {
  commIntelCallIntelligence,
  commIntelConversationInsights,
  commIntelDraftActions,
  commIntelEmailThreads,
  commIntelRecordings,
  commIntelSmsRecords,
} from './communications-intelligence';
import {
  assetCalibrations,
  assetEquipment,
  assetInspections,
  assetLifecycleEvents,
  assetMaintenanceActions,
  assetMaintenanceCosts,
  assetMaintenanceRecords,
  assetMaintenanceSchedules,
} from './asset-equipment';
import {
  aiConfigurationActions,
  aiFailoverEvents,
  aiFeedbackRecords,
  aiMemorySyncRecords,
  aiModels,
  aiPromptTemplates,
  aiPromptVersions,
  aiProviders,
  aiQualityEvaluations,
  aiRoutingRules,
  aiUsageRecords,
} from './ai-orchestration';
import {
  dispatchActions,
  dispatchCallbackRequests,
  dispatchEmergencyAssessments,
  dispatchRecommendations,
  dispatchReceptionistSummaries,
  dispatchRoutingRecommendations,
} from './dispatch-intelligence';
import {
  fleetActions,
  fleetDriverBehaviourEvents,
  fleetMonthlyReports,
  fleetOperatingCosts,
  fleetRecommendations,
} from './fleet-intelligence';
import {
  personalCommAccounts,
  personalCommActions,
  personalCommClassificationCorrections,
  personalCommConversations,
  personalCommDocumentAnalyses,
  personalCommFollowUps,
  personalCommLeadSignals,
  personalCommMediaAnalyses,
  personalCommMediaItems,
  personalCommPrivacySettings,
  personalCommVoiceAnalyses,
} from './personal-communications-intelligence';
import {
  securityActions,
  securityAuditLogs,
  securityPermissionGrants,
  securityTenantPolicies,
  securityTrustedDevices,
  securityPrivacyRequests,
  securityRiskAlerts,
} from './enterprise-security';
import { paymentReceipts, payments } from './payments';
import { integrationSyncJobs } from './integration-sync-jobs';
import { integrationWebhookEndpoints } from './integration-webhook-endpoints';
import { integrationWebhookEvents } from './integration-webhook-events';
import {
  developerApiKeys,
  integrationApiUsage,
  integrationCredentialMetadata,
  integrationHealthSnapshots,
  integrationRecommendations,
  integrationRegistrySettings,
  integrationRequestLogs,
  integrationWebhookDeliveries,
} from './integration-api-management';
import { xeroCustomerMappings } from './xero-customer-mappings';
import { xeroQuoteMappings } from './xero-quote-mappings';
import { xeroInvoiceMappings } from './xero-invoice-mappings';
import { xeroPaymentMappings } from './xero-payment-mappings';
import { xeroSyncLogs } from './xero-sync-logs';
import { whatsappConnections } from './whatsapp-connections';
import { whatsappMessages } from './whatsapp-messages';
import { whatsappTemplates } from './whatsapp-templates';
import { agentRuns } from './agent-runs';
import { agentTasks } from './agent-tasks';
import { recruitingCandidates } from './recruiting-candidates';
import { recruitingApplications } from './recruiting-applications';
import {
  salesActivities,
  salesOpportunities,
  salesPipelineStages,
  salesRecommendations,
} from './sales';
import {
  marketingActivities,
  marketingCampaigns,
  marketingRecommendations,
  marketingSegments,
} from './marketing';
import {
  leadActivities,
  leadConversions,
  leadRecommendations,
  leadScores,
  leadSources,
  leadStatusHistory,
  leads,
} from './leads';
import { voiceConversations, voiceFollowUps, voiceOutcomes, voiceSessions } from './voice';
import {
  customerSupportConversations,
  customerSupportEscalations,
  customerSupportFeedback,
  customerSupportMessages,
} from './customer-support';
import {
  candidateActivities,
  certifications,
  employeeSkills,
  trainingRecords,
  workforceRecommendations,
} from './workforce';
import {
  procurementRecommendations,
  purchaseOrderItems,
  purchaseOrders,
  supplierActivities,
  supplierProducts,
  suppliers,
} from './procurement';
import {
  businessHealthSnapshots,
  executiveAlerts,
  executiveRecommendations,
  executiveReports,
} from './executive';
import {
  financeBudgetLines,
  financeBudgets,
  financeForecastSnapshots,
  financeRecommendations,
} from './finance-intelligence';
import {
  companyPolicies,
  knowledgeArticles,
  knowledgeCategories,
  knowledgeRecommendations,
  knowledgeVersions,
  sopDocuments,
  trainingCourses,
  knowledgeTrainingRecords,
} from './knowledge-learning';
import {
  biReportTemplates,
  businessDashboards,
  businessInsights,
  businessKpiSnapshots,
  businessKpis,
  businessReports,
  dashboardWidgets,
  predictiveForecasts,
} from './business-intelligence';
import {
  companyFinanceSettings,
  quoteAcceptances,
  quoteLineItems,
  quotes,
} from './quotes';
import { vehicles } from './vehicles';
import { roles } from './roles';
import { sessions } from './sessions';
import { userInvites } from './user-invites';
import { draftWorkspace } from './draft-workspace';
import { users } from './users';

export const companiesRelations = relations(companies, ({ many }) => ({
  roles: many(roles),
  users: many(users),
  sessions: many(sessions),
  auraConversations: many(auraConversations),
  auraMemory: many(auraMemory),
  reportDefinitions: many(reportDefinitions),
  reportRuns: many(reportRuns),
  analyticsSnapshots: many(analyticsSnapshots),
  notifications: many(notifications),
  notificationPreferences: many(notificationPreferences),
  mobileSyncStates: many(mobileSyncState),
  mobileSyncQueue: many(mobileSyncQueue),
  mobilePendingActions: many(mobilePendingActions),
  mobileActionLogs: many(mobileActionLogs),
  agentOrchestrations: many(agentOrchestrations),
  agentOrchestrationRuns: many(agentOrchestrationRuns),
  userInvites: many(userInvites),
  draftWorkspace: many(draftWorkspace),
  customers: many(customers),
  customerActivities: many(customerActivities),
  jobs: many(jobs),
  quotes: many(quotes),
  invoices: many(invoices),
  payments: many(payments),
  inventoryLocations: many(inventoryLocations),
  inventoryItems: many(inventoryItems),
  inventoryStockLevels: many(inventoryStockLevels),
  vehicles: many(vehicles),
  integrationConnections: many(integrationConnections),
  integrationVehicleMappings: many(integrationVehicleMappings),
  gpsPositions: many(gpsPositions),
  messageTemplates: many(messageTemplates),
  communications: many(communications),
  documentCategories: many(documentCategories),
  documents: many(documents),
  workflows: many(workflows),
  workflowTriggers: many(workflowTriggers),
  workflowActions: many(workflowActions),
  workflowExecutions: many(workflowExecutions),
  workflowConditions: many(workflowConditions),
  workflowRuns: many(workflowRuns),
  automationQueueJobs: many(automationQueueJobs),
  agentProfiles: many(agentProfiles),
  agentProfilePermissions: many(agentProfilePermissions),
  agentProfileTools: many(agentProfileTools),
  agentExecutions: many(agentExecutions),
  portalUsers: many(portalUsers),
  portalSessions: many(portalSessions),
  portalUserPermissions: many(portalUserPermissions),
  portalCustomerRequests: many(portalCustomerRequests),
  mobileWorkforceRequests: many(mobileWorkforceRequests),
  mobileTimeEntries: many(mobileTimeEntries),
  mobileJobInventoryUsage: many(mobileJobInventoryUsage),
  mobileJobDocumentation: many(mobileJobDocumentation),
  mobileSyncConflicts: many(mobileSyncConflicts),
  mobileCompanyAnnouncements: many(mobileCompanyAnnouncements),
  qualityComebacks: many(qualityComebacks),
  qualityWarrantyClaims: many(qualityWarrantyClaims),
  qualitySupplierDefects: many(qualitySupplierDefects),
  qualityActions: many(qualityActions),
  commIntelRecordings: many(commIntelRecordings),
  commIntelCallIntelligence: many(commIntelCallIntelligence),
  commIntelConversationInsights: many(commIntelConversationInsights),
  commIntelEmailThreads: many(commIntelEmailThreads),
  commIntelSmsRecords: many(commIntelSmsRecords),
  commIntelDraftActions: many(commIntelDraftActions),
  assetEquipment: many(assetEquipment),
  assetLifecycleEvents: many(assetLifecycleEvents),
  assetMaintenanceSchedules: many(assetMaintenanceSchedules),
  assetMaintenanceRecords: many(assetMaintenanceRecords),
  assetInspections: many(assetInspections),
  assetCalibrations: many(assetCalibrations),
  assetMaintenanceCosts: many(assetMaintenanceCosts),
  assetMaintenanceActions: many(assetMaintenanceActions),
  aiProviders: many(aiProviders),
  aiModels: many(aiModels),
  aiRoutingRules: many(aiRoutingRules),
  aiPromptTemplates: many(aiPromptTemplates),
  aiPromptVersions: many(aiPromptVersions),
  aiConfigurationActions: many(aiConfigurationActions),
  aiUsageRecords: many(aiUsageRecords),
  aiQualityEvaluations: many(aiQualityEvaluations),
  aiFeedbackRecords: many(aiFeedbackRecords),
  aiFailoverEvents: many(aiFailoverEvents),
  aiMemorySyncRecords: many(aiMemorySyncRecords),
  dispatchReceptionistSummaries: many(dispatchReceptionistSummaries),
  dispatchRoutingRecommendations: many(dispatchRoutingRecommendations),
  dispatchCallbackRequests: many(dispatchCallbackRequests),
  dispatchEmergencyAssessments: many(dispatchEmergencyAssessments),
  dispatchRecommendations: many(dispatchRecommendations),
  dispatchActions: many(dispatchActions),
  fleetMonthlyReports: many(fleetMonthlyReports),
  fleetDriverBehaviourEvents: many(fleetDriverBehaviourEvents),
  fleetOperatingCosts: many(fleetOperatingCosts),
  fleetRecommendations: many(fleetRecommendations),
  fleetActions: many(fleetActions),
  personalCommAccounts: many(personalCommAccounts),
  personalCommConversations: many(personalCommConversations),
  personalCommClassificationCorrections: many(personalCommClassificationCorrections),
  personalCommMediaItems: many(personalCommMediaItems),
  personalCommVoiceAnalyses: many(personalCommVoiceAnalyses),
  personalCommMediaAnalyses: many(personalCommMediaAnalyses),
  personalCommDocumentAnalyses: many(personalCommDocumentAnalyses),
  personalCommLeadSignals: many(personalCommLeadSignals),
  personalCommFollowUps: many(personalCommFollowUps),
  personalCommPrivacySettings: many(personalCommPrivacySettings),
  personalCommActions: many(personalCommActions),
  securityTenantPolicies: many(securityTenantPolicies),
  securityAuditLogs: many(securityAuditLogs),
  securityActions: many(securityActions),
  securityRiskAlerts: many(securityRiskAlerts),
  securityTrustedDevices: many(securityTrustedDevices),
  securityPrivacyRequests: many(securityPrivacyRequests),
  integrationSyncJobs: many(integrationSyncJobs),
  integrationWebhookEndpoints: many(integrationWebhookEndpoints),
  integrationWebhookEvents: many(integrationWebhookEvents),
  integrationRegistrySettings: many(integrationRegistrySettings),
  integrationCredentialMetadata: many(integrationCredentialMetadata),
  integrationApiUsage: many(integrationApiUsage),
  integrationHealthSnapshots: many(integrationHealthSnapshots),
  integrationRequestLogs: many(integrationRequestLogs),
  integrationWebhookDeliveries: many(integrationWebhookDeliveries),
  integrationRecommendations: many(integrationRecommendations),
  developerApiKeys: many(developerApiKeys),
  xeroCustomerMappings: many(xeroCustomerMappings),
  xeroQuoteMappings: many(xeroQuoteMappings),
  xeroInvoiceMappings: many(xeroInvoiceMappings),
  xeroPaymentMappings: many(xeroPaymentMappings),
  xeroSyncLogs: many(xeroSyncLogs),
  whatsappConnections: many(whatsappConnections),
  whatsappTemplates: many(whatsappTemplates),
  whatsappMessages: many(whatsappMessages),
  agentRuns: many(agentRuns),
  agentTasks: many(agentTasks),
  recruitingCandidates: many(recruitingCandidates),
  recruitingApplications: many(recruitingApplications),
  salesPipelineStages: many(salesPipelineStages),
  salesOpportunities: many(salesOpportunities),
  salesActivities: many(salesActivities),
  salesRecommendations: many(salesRecommendations),
  marketingSegments: many(marketingSegments),
  marketingCampaigns: many(marketingCampaigns),
  marketingActivities: many(marketingActivities),
  marketingRecommendations: many(marketingRecommendations),
  leadSources: many(leadSources),
  leads: many(leads),
  leadActivities: many(leadActivities),
  leadScores: many(leadScores),
  leadRecommendations: many(leadRecommendations),
  voiceSessions: many(voiceSessions),
  voiceConversations: many(voiceConversations),
  voiceOutcomes: many(voiceOutcomes),
  voiceFollowUps: many(voiceFollowUps),
  customerSupportConversations: many(customerSupportConversations),
  customerSupportMessages: many(customerSupportMessages),
  customerSupportEscalations: many(customerSupportEscalations),
  customerSupportFeedback: many(customerSupportFeedback),
  candidateActivities: many(candidateActivities),
  employeeSkills: many(employeeSkills),
  certifications: many(certifications),
  trainingRecords: many(trainingRecords),
  workforceRecommendations: many(workforceRecommendations),
  suppliers: many(suppliers),
  supplierProducts: many(supplierProducts),
  purchaseOrders: many(purchaseOrders),
  purchaseOrderItems: many(purchaseOrderItems),
  supplierActivities: many(supplierActivities),
  procurementRecommendations: many(procurementRecommendations),
  businessHealthSnapshots: many(businessHealthSnapshots),
  executiveAlerts: many(executiveAlerts),
  executiveRecommendations: many(executiveRecommendations),
  executiveReports: many(executiveReports),
  financeBudgets: many(financeBudgets),
  financeBudgetLines: many(financeBudgetLines),
  financeRecommendations: many(financeRecommendations),
  financeForecastSnapshots: many(financeForecastSnapshots),
  knowledgeCategories: many(knowledgeCategories),
  knowledgeArticles: many(knowledgeArticles),
  knowledgeVersions: many(knowledgeVersions),
  sopDocuments: many(sopDocuments),
  trainingCourses: many(trainingCourses),
  knowledgeTrainingRecords: many(knowledgeTrainingRecords),
  companyPolicies: many(companyPolicies),
  knowledgeRecommendations: many(knowledgeRecommendations),
  businessKpis: many(businessKpis),
  businessKpiSnapshots: many(businessKpiSnapshots),
  businessDashboards: many(businessDashboards),
  dashboardWidgets: many(dashboardWidgets),
  biReportTemplates: many(biReportTemplates),
  businessReports: many(businessReports),
  businessInsights: many(businessInsights),
  predictiveForecasts: many(predictiveForecasts),
}));

export const rolesRelations = relations(roles, ({ one, many }) => ({
  company: one(companies, {
    fields: [roles.companyId],
    references: [companies.id],
  }),
  users: many(users),
  userInvites: many(userInvites),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  draftWorkspaceOwned: many(draftWorkspace, { relationName: 'draftWorkspaceOwner' }),
  company: one(companies, {
    fields: [users.companyId],
    references: [companies.id],
  }),
  role: one(roles, {
    fields: [users.roleId],
    references: [roles.id],
  }),
  sessions: many(sessions),
  auraConversations: many(auraConversations),
  sentInvites: many(userInvites),
  customerActivities: many(customerActivities),
  assignedJobs: many(jobs),
  assignedVehicles: many(vehicles),
  authoredCommunications: many(communications),
  uploadedDocuments: many(documents),
  createdWorkflows: many(workflows),
  createdAgentProfiles: many(agentProfiles),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  company: one(companies, {
    fields: [customers.companyId],
    references: [companies.id],
  }),
  activities: many(customerActivities),
  jobs: many(jobs),
  quotes: many(quotes),
  invoices: many(invoices),
  communications: many(communications),
  whatsappMessages: many(whatsappMessages),
  documents: many(documents),
  portalUsers: many(portalUsers),
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  company: one(companies, {
    fields: [jobs.companyId],
    references: [companies.id],
  }),
  customer: one(customers, {
    fields: [jobs.customerId],
    references: [customers.id],
  }),
  property: one(cxCustomerProperties, {
    fields: [jobs.propertyId],
    references: [cxCustomerProperties.id],
  }),
  assignedUser: one(users, {
    fields: [jobs.assignedUserId],
    references: [users.id],
  }),
  parentJob: one(jobs, {
    fields: [jobs.parentJobId],
    references: [jobs.id],
    relationName: 'jobParent',
  }),
  childJobs: many(jobs, { relationName: 'jobParent' }),
  originalComebacks: many(qualityComebacks, { relationName: 'originalComebackJob' }),
  linkedComebacks: many(qualityComebacks, { relationName: 'comebackJobLink' }),
  quotes: many(quotes),
  invoices: many(invoices),
  documents: many(documents),
}));

export const quotesRelations = relations(quotes, ({ one, many }) => ({
  company: one(companies, {
    fields: [quotes.companyId],
    references: [companies.id],
  }),
  customer: one(customers, {
    fields: [quotes.customerId],
    references: [customers.id],
  }),
  job: one(jobs, {
    fields: [quotes.jobId],
    references: [jobs.id],
  }),
  property: one(cxCustomerProperties, {
    fields: [quotes.propertyId],
    references: [cxCustomerProperties.id],
  }),
  lead: one(leads, {
    fields: [quotes.leadId],
    references: [leads.id],
  }),
  estimator: one(users, {
    fields: [quotes.estimatorUserId],
    references: [users.id],
  }),
  lineItems: many(quoteLineItems),
  acceptances: many(quoteAcceptances),
  invoices: many(invoices),
}));

export const quoteLineItemsRelations = relations(quoteLineItems, ({ one }) => ({
  quote: one(quotes, {
    fields: [quoteLineItems.quoteId],
    references: [quotes.id],
  }),
  company: one(companies, {
    fields: [quoteLineItems.companyId],
    references: [companies.id],
  }),
}));

export const quoteAcceptancesRelations = relations(quoteAcceptances, ({ one }) => ({
  quote: one(quotes, {
    fields: [quoteAcceptances.quoteId],
    references: [quotes.id],
  }),
  customer: one(customers, {
    fields: [quoteAcceptances.customerId],
    references: [customers.id],
  }),
  company: one(companies, {
    fields: [quoteAcceptances.companyId],
    references: [companies.id],
  }),
}));

export const companyFinanceSettingsRelations = relations(companyFinanceSettings, ({ one }) => ({
  company: one(companies, {
    fields: [companyFinanceSettings.companyId],
    references: [companies.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  company: one(companies, {
    fields: [invoices.companyId],
    references: [companies.id],
  }),
  customer: one(customers, {
    fields: [invoices.customerId],
    references: [customers.id],
  }),
  job: one(jobs, {
    fields: [invoices.jobId],
    references: [jobs.id],
  }),
  quote: one(quotes, {
    fields: [invoices.quoteId],
    references: [quotes.id],
  }),
  property: one(cxCustomerProperties, {
    fields: [invoices.propertyId],
    references: [cxCustomerProperties.id],
  }),
  lineItems: many(invoiceLineItems),
  payments: many(payments),
}));

export const invoiceLineItemsRelations = relations(invoiceLineItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceLineItems.invoiceId],
    references: [invoices.id],
  }),
  company: one(companies, {
    fields: [invoiceLineItems.companyId],
    references: [companies.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  company: one(companies, {
    fields: [payments.companyId],
    references: [companies.id],
  }),
  invoice: one(invoices, {
    fields: [payments.invoiceId],
    references: [invoices.id],
  }),
  receipt: one(paymentReceipts, {
    fields: [payments.id],
    references: [paymentReceipts.paymentId],
  }),
}));

export const paymentReceiptsRelations = relations(paymentReceipts, ({ one }) => ({
  payment: one(payments, {
    fields: [paymentReceipts.paymentId],
    references: [payments.id],
  }),
  invoice: one(invoices, {
    fields: [paymentReceipts.invoiceId],
    references: [invoices.id],
  }),
  company: one(companies, {
    fields: [paymentReceipts.companyId],
    references: [companies.id],
  }),
}));

export const inventoryLocationsRelations = relations(inventoryLocations, ({ one, many }) => ({
  company: one(companies, {
    fields: [inventoryLocations.companyId],
    references: [companies.id],
  }),
  vehicle: one(vehicles, {
    fields: [inventoryLocations.vehicleId],
    references: [vehicles.id],
  }),
  stockLevels: many(inventoryStockLevels),
}));

export const jobMaterialLinesRelations = relations(jobMaterialLines, ({ one }) => ({
  company: one(companies, {
    fields: [jobMaterialLines.companyId],
    references: [companies.id],
  }),
  job: one(jobs, {
    fields: [jobMaterialLines.jobId],
    references: [jobs.id],
  }),
  inventoryItem: one(inventoryItems, {
    fields: [jobMaterialLines.inventoryItemId],
    references: [inventoryItems.id],
  }),
  location: one(inventoryLocations, {
    fields: [jobMaterialLines.locationId],
    references: [inventoryLocations.id],
  }),
  recordedBy: one(users, {
    fields: [jobMaterialLines.recordedByUserId],
    references: [users.id],
  }),
  approvedBy: one(users, {
    fields: [jobMaterialLines.approvedByUserId],
    references: [users.id],
  }),
}));

export const inventoryStockMovementsRelations = relations(inventoryStockMovements, ({ one }) => ({
  company: one(companies, {
    fields: [inventoryStockMovements.companyId],
    references: [companies.id],
  }),
  item: one(inventoryItems, {
    fields: [inventoryStockMovements.itemId],
    references: [inventoryItems.id],
  }),
  location: one(inventoryLocations, {
    fields: [inventoryStockMovements.locationId],
    references: [inventoryLocations.id],
  }),
  job: one(jobs, {
    fields: [inventoryStockMovements.jobId],
    references: [jobs.id],
  }),
  purchaseOrder: one(purchaseOrders, {
    fields: [inventoryStockMovements.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
  purchaseOrderItem: one(purchaseOrderItems, {
    fields: [inventoryStockMovements.purchaseOrderItemId],
    references: [purchaseOrderItems.id],
  }),
  recordedByUser: one(users, {
    fields: [inventoryStockMovements.recordedByUserId],
    references: [users.id],
  }),
}));

export const inventoryItemsRelations = relations(inventoryItems, ({ one, many }) => ({
  company: one(companies, {
    fields: [inventoryItems.companyId],
    references: [companies.id],
  }),
  stockLevels: many(inventoryStockLevels),
}));

export const inventoryStockLevelsRelations = relations(inventoryStockLevels, ({ one }) => ({
  company: one(companies, {
    fields: [inventoryStockLevels.companyId],
    references: [companies.id],
  }),
  item: one(inventoryItems, {
    fields: [inventoryStockLevels.itemId],
    references: [inventoryItems.id],
  }),
  location: one(inventoryLocations, {
    fields: [inventoryStockLevels.locationId],
    references: [inventoryLocations.id],
  }),
}));

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  company: one(companies, {
    fields: [vehicles.companyId],
    references: [companies.id],
  }),
  assignedUser: one(users, {
    fields: [vehicles.assignedUserId],
    references: [users.id],
  }),
  integrationMappings: many(integrationVehicleMappings),
  gpsPositions: many(gpsPositions),
  fleetDriverBehaviourEvents: many(fleetDriverBehaviourEvents),
  fleetOperatingCosts: many(fleetOperatingCosts),
  fleetRecommendations: many(fleetRecommendations),
  fleetActions: many(fleetActions),
}));

export const integrationConnectionsRelations = relations(
  integrationConnections,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [integrationConnections.companyId],
      references: [companies.id],
    }),
    vehicleMappings: many(integrationVehicleMappings),
    gpsPositions: many(gpsPositions),
    syncJobs: many(integrationSyncJobs),
  }),
);

export const integrationVehicleMappingsRelations = relations(
  integrationVehicleMappings,
  ({ one }) => ({
    company: one(companies, {
      fields: [integrationVehicleMappings.companyId],
      references: [companies.id],
    }),
    connection: one(integrationConnections, {
      fields: [integrationVehicleMappings.integrationConnectionId],
      references: [integrationConnections.id],
    }),
    vehicle: one(vehicles, {
      fields: [integrationVehicleMappings.vehicleId],
      references: [vehicles.id],
    }),
  }),
);

export const gpsPositionsRelations = relations(gpsPositions, ({ one }) => ({
  company: one(companies, {
    fields: [gpsPositions.companyId],
    references: [companies.id],
  }),
  vehicle: one(vehicles, {
    fields: [gpsPositions.vehicleId],
    references: [vehicles.id],
  }),
  connection: one(integrationConnections, {
    fields: [gpsPositions.integrationConnectionId],
    references: [integrationConnections.id],
  }),
}));

export const messageTemplatesRelations = relations(messageTemplates, ({ one, many }) => ({
  company: one(companies, {
    fields: [messageTemplates.companyId],
    references: [companies.id],
  }),
  communications: many(communications),
}));

export const communicationsRelations = relations(communications, ({ one }) => ({
  company: one(companies, {
    fields: [communications.companyId],
    references: [companies.id],
  }),
  customer: one(customers, {
    fields: [communications.customerId],
    references: [customers.id],
  }),
  job: one(jobs, {
    fields: [communications.jobId],
    references: [jobs.id],
  }),
  author: one(users, {
    fields: [communications.authorUserId],
    references: [users.id],
  }),
  template: one(messageTemplates, {
    fields: [communications.templateId],
    references: [messageTemplates.id],
  }),
}));

export const documentCategoriesRelations = relations(documentCategories, ({ one, many }) => ({
  company: one(companies, {
    fields: [documentCategories.companyId],
    references: [companies.id],
  }),
  documents: many(documents),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  company: one(companies, {
    fields: [documents.companyId],
    references: [companies.id],
  }),
  category: one(documentCategories, {
    fields: [documents.categoryId],
    references: [documentCategories.id],
  }),
  customer: one(customers, {
    fields: [documents.customerId],
    references: [customers.id],
  }),
  job: one(jobs, {
    fields: [documents.jobId],
    references: [jobs.id],
  }),
  uploadedBy: one(users, {
    fields: [documents.uploadedByUserId],
    references: [users.id],
  }),
}));

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  company: one(companies, {
    fields: [workflows.companyId],
    references: [companies.id],
  }),
  createdBy: one(users, {
    fields: [workflows.createdByUserId],
    references: [users.id],
  }),
  owner: one(users, {
    fields: [workflows.ownerUserId],
    references: [users.id],
    relationName: 'workflowOwner',
  }),
  updatedBy: one(users, {
    fields: [workflows.updatedByUserId],
    references: [users.id],
    relationName: 'workflowUpdatedBy',
  }),
  approvedBy: one(users, {
    fields: [workflows.approvedByUserId],
    references: [users.id],
    relationName: 'workflowApprovedBy',
  }),
  triggers: many(workflowTriggers),
  actions: many(workflowActions),
  executions: many(workflowExecutions),
  conditions: many(workflowConditions),
  runs: many(workflowRuns),
  schedules: many(workflowSchedules),
  webhooks: many(workflowWebhooks),
  auditLogs: many(workflowAuditLogs),
}));

export const workflowTriggersRelations = relations(workflowTriggers, ({ one }) => ({
  company: one(companies, {
    fields: [workflowTriggers.companyId],
    references: [companies.id],
  }),
  workflow: one(workflows, {
    fields: [workflowTriggers.workflowId],
    references: [workflows.id],
  }),
}));

export const workflowActionsRelations = relations(workflowActions, ({ one }) => ({
  company: one(companies, {
    fields: [workflowActions.companyId],
    references: [companies.id],
  }),
  workflow: one(workflows, {
    fields: [workflowActions.workflowId],
    references: [workflows.id],
  }),
}));

export const workflowExecutionsRelations = relations(workflowExecutions, ({ one, many }) => ({
  company: one(companies, {
    fields: [workflowExecutions.companyId],
    references: [companies.id],
  }),
  workflow: one(workflows, {
    fields: [workflowExecutions.workflowId],
    references: [workflows.id],
  }),
  runs: many(workflowRuns),
}));

export const workflowConditionsRelations = relations(workflowConditions, ({ one }) => ({
  company: one(companies, {
    fields: [workflowConditions.companyId],
    references: [companies.id],
  }),
  workflow: one(workflows, {
    fields: [workflowConditions.workflowId],
    references: [workflows.id],
  }),
}));

export const workflowRunsRelations = relations(workflowRuns, ({ one, many }) => ({
  company: one(companies, {
    fields: [workflowRuns.companyId],
    references: [companies.id],
  }),
  workflow: one(workflows, {
    fields: [workflowRuns.workflowId],
    references: [workflows.id],
  }),
  workflowExecution: one(workflowExecutions, {
    fields: [workflowRuns.workflowExecutionId],
    references: [workflowExecutions.id],
  }),
  steps: many(workflowSteps),
}));

export const workflowStepsRelations = relations(workflowSteps, ({ one, many }) => ({
  company: one(companies, {
    fields: [workflowSteps.companyId],
    references: [companies.id],
  }),
  workflowRun: one(workflowRuns, {
    fields: [workflowSteps.workflowRunId],
    references: [workflowRuns.id],
  }),
  workflowAction: one(workflowActions, {
    fields: [workflowSteps.workflowActionId],
    references: [workflowActions.id],
  }),
  results: many(workflowStepResults),
}));

export const workflowStepResultsRelations = relations(workflowStepResults, ({ one }) => ({
  company: one(companies, {
    fields: [workflowStepResults.companyId],
    references: [companies.id],
  }),
  workflowStep: one(workflowSteps, {
    fields: [workflowStepResults.workflowStepId],
    references: [workflowSteps.id],
  }),
  approvedBy: one(users, {
    fields: [workflowStepResults.approvedByUserId],
    references: [users.id],
  }),
}));

export const workflowTemplatesRelations = relations(workflowTemplates, ({ one }) => ({
  company: one(companies, {
    fields: [workflowTemplates.companyId],
    references: [companies.id],
  }),
  createdBy: one(users, {
    fields: [workflowTemplates.createdByUserId],
    references: [users.id],
  }),
}));

export const workflowSchedulesRelations = relations(workflowSchedules, ({ one }) => ({
  company: one(companies, {
    fields: [workflowSchedules.companyId],
    references: [companies.id],
  }),
  workflow: one(workflows, {
    fields: [workflowSchedules.workflowId],
    references: [workflows.id],
  }),
  createdBy: one(users, {
    fields: [workflowSchedules.createdByUserId],
    references: [users.id],
  }),
}));

export const workflowWebhooksRelations = relations(workflowWebhooks, ({ one }) => ({
  company: one(companies, {
    fields: [workflowWebhooks.companyId],
    references: [companies.id],
  }),
  workflow: one(workflows, {
    fields: [workflowWebhooks.workflowId],
    references: [workflows.id],
  }),
}));

export const workflowAuditLogsRelations = relations(workflowAuditLogs, ({ one }) => ({
  company: one(companies, {
    fields: [workflowAuditLogs.companyId],
    references: [companies.id],
  }),
  workflow: one(workflows, {
    fields: [workflowAuditLogs.workflowId],
    references: [workflows.id],
  }),
  workflowRun: one(workflowRuns, {
    fields: [workflowAuditLogs.workflowRunId],
    references: [workflowRuns.id],
  }),
  user: one(users, {
    fields: [workflowAuditLogs.userId],
    references: [users.id],
  }),
}));

export const automationQueueJobsRelations = relations(automationQueueJobs, ({ one }) => ({
  company: one(companies, {
    fields: [automationQueueJobs.companyId],
    references: [companies.id],
  }),
}));

export const agentProfilesRelations = relations(agentProfiles, ({ one, many }) => ({
  company: one(companies, {
    fields: [agentProfiles.companyId],
    references: [companies.id],
  }),
  createdBy: one(users, {
    fields: [agentProfiles.createdByUserId],
    references: [users.id],
  }),
  permissions: many(agentProfilePermissions),
  tools: many(agentProfileTools),
  executions: many(agentExecutions),
}));

export const agentProfilePermissionsRelations = relations(agentProfilePermissions, ({ one }) => ({
  company: one(companies, {
    fields: [agentProfilePermissions.companyId],
    references: [companies.id],
  }),
  agentProfile: one(agentProfiles, {
    fields: [agentProfilePermissions.agentProfileId],
    references: [agentProfiles.id],
  }),
}));

export const agentProfileToolsRelations = relations(agentProfileTools, ({ one }) => ({
  company: one(companies, {
    fields: [agentProfileTools.companyId],
    references: [companies.id],
  }),
  agentProfile: one(agentProfiles, {
    fields: [agentProfileTools.agentProfileId],
    references: [agentProfiles.id],
  }),
}));

export const agentExecutionsRelations = relations(agentExecutions, ({ one }) => ({
  company: one(companies, {
    fields: [agentExecutions.companyId],
    references: [companies.id],
  }),
  agentProfile: one(agentProfiles, {
    fields: [agentExecutions.agentProfileId],
    references: [agentProfiles.id],
  }),
}));

export const portalUsersRelations = relations(portalUsers, ({ one, many }) => ({
  company: one(companies, {
    fields: [portalUsers.companyId],
    references: [companies.id],
  }),
  customer: one(customers, {
    fields: [portalUsers.customerId],
    references: [customers.id],
  }),
  permissions: many(portalUserPermissions),
  sessions: many(portalSessions),
  customerRequests: many(portalCustomerRequests),
}));

export const portalUserInvitesRelations = relations(portalUserInvites, ({ one }) => ({
  company: one(companies, {
    fields: [portalUserInvites.companyId],
    references: [companies.id],
  }),
  customer: one(customers, {
    fields: [portalUserInvites.customerId],
    references: [customers.id],
  }),
  invitedBy: one(users, {
    fields: [portalUserInvites.invitedByUserId],
    references: [users.id],
  }),
}));

export const portalSessionsRelations = relations(portalSessions, ({ one }) => ({
  portalUser: one(portalUsers, {
    fields: [portalSessions.portalUserId],
    references: [portalUsers.id],
  }),
  company: one(companies, {
    fields: [portalSessions.companyId],
    references: [companies.id],
  }),
  customer: one(customers, {
    fields: [portalSessions.customerId],
    references: [customers.id],
  }),
}));

export const portalCustomerRequestsRelations = relations(portalCustomerRequests, ({ one }) => ({
  company: one(companies, {
    fields: [portalCustomerRequests.companyId],
    references: [companies.id],
  }),
  customer: one(customers, {
    fields: [portalCustomerRequests.customerId],
    references: [customers.id],
  }),
  portalUser: one(portalUsers, {
    fields: [portalCustomerRequests.portalUserId],
    references: [portalUsers.id],
  }),
}));

export const portalUserPermissionsRelations = relations(portalUserPermissions, ({ one }) => ({
  company: one(companies, {
    fields: [portalUserPermissions.companyId],
    references: [companies.id],
  }),
  portalUser: one(portalUsers, {
    fields: [portalUserPermissions.portalUserId],
    references: [portalUsers.id],
  }),
}));

export const integrationSyncJobsRelations = relations(integrationSyncJobs, ({ one }) => ({
  company: one(companies, {
    fields: [integrationSyncJobs.companyId],
    references: [companies.id],
  }),
  connection: one(integrationConnections, {
    fields: [integrationSyncJobs.integrationConnectionId],
    references: [integrationConnections.id],
  }),
}));

export const integrationWebhookEndpointsRelations = relations(
  integrationWebhookEndpoints,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [integrationWebhookEndpoints.companyId],
      references: [companies.id],
    }),
    events: many(integrationWebhookEvents),
    deliveries: many(integrationWebhookDeliveries),
  }),
);

export const integrationWebhookEventsRelations = relations(integrationWebhookEvents, ({ one }) => ({
  company: one(companies, {
    fields: [integrationWebhookEvents.companyId],
    references: [companies.id],
  }),
  endpoint: one(integrationWebhookEndpoints, {
    fields: [integrationWebhookEvents.webhookEndpointId],
    references: [integrationWebhookEndpoints.id],
  }),
}));

export const integrationRegistrySettingsRelations = relations(
  integrationRegistrySettings,
  ({ one }) => ({
    company: one(companies, {
      fields: [integrationRegistrySettings.companyId],
      references: [companies.id],
    }),
  }),
);

export const integrationCredentialMetadataRelations = relations(
  integrationCredentialMetadata,
  ({ one }) => ({
    company: one(companies, {
      fields: [integrationCredentialMetadata.companyId],
      references: [companies.id],
    }),
    connection: one(integrationConnections, {
      fields: [integrationCredentialMetadata.connectionId],
      references: [integrationConnections.id],
    }),
  }),
);

export const integrationApiUsageRelations = relations(integrationApiUsage, ({ one }) => ({
  company: one(companies, {
    fields: [integrationApiUsage.companyId],
    references: [companies.id],
  }),
}));

export const integrationHealthSnapshotsRelations = relations(
  integrationHealthSnapshots,
  ({ one }) => ({
    company: one(companies, {
      fields: [integrationHealthSnapshots.companyId],
      references: [companies.id],
    }),
  }),
);

export const integrationRequestLogsRelations = relations(integrationRequestLogs, ({ one }) => ({
  company: one(companies, {
    fields: [integrationRequestLogs.companyId],
    references: [companies.id],
  }),
}));

export const integrationWebhookDeliveriesRelations = relations(
  integrationWebhookDeliveries,
  ({ one }) => ({
    company: one(companies, {
      fields: [integrationWebhookDeliveries.companyId],
      references: [companies.id],
    }),
    endpoint: one(integrationWebhookEndpoints, {
      fields: [integrationWebhookDeliveries.webhookEndpointId],
      references: [integrationWebhookEndpoints.id],
    }),
  }),
);

export const integrationRecommendationsRelations = relations(
  integrationRecommendations,
  ({ one }) => ({
    company: one(companies, {
      fields: [integrationRecommendations.companyId],
      references: [companies.id],
    }),
  }),
);

export const developerApiKeysRelations = relations(developerApiKeys, ({ one }) => ({
  company: one(companies, {
    fields: [developerApiKeys.companyId],
    references: [companies.id],
  }),
  createdBy: one(users, {
    fields: [developerApiKeys.createdByUserId],
    references: [users.id],
  }),
}));

export const xeroCustomerMappingsRelations = relations(xeroCustomerMappings, ({ one }) => ({
  company: one(companies, {
    fields: [xeroCustomerMappings.companyId],
    references: [companies.id],
  }),
  connection: one(integrationConnections, {
    fields: [xeroCustomerMappings.integrationConnectionId],
    references: [integrationConnections.id],
  }),
  customer: one(customers, {
    fields: [xeroCustomerMappings.customerId],
    references: [customers.id],
  }),
}));

export const xeroQuoteMappingsRelations = relations(xeroQuoteMappings, ({ one }) => ({
  company: one(companies, {
    fields: [xeroQuoteMappings.companyId],
    references: [companies.id],
  }),
  connection: one(integrationConnections, {
    fields: [xeroQuoteMappings.integrationConnectionId],
    references: [integrationConnections.id],
  }),
  quote: one(quotes, {
    fields: [xeroQuoteMappings.quoteId],
    references: [quotes.id],
  }),
}));

export const xeroInvoiceMappingsRelations = relations(xeroInvoiceMappings, ({ one }) => ({
  company: one(companies, {
    fields: [xeroInvoiceMappings.companyId],
    references: [companies.id],
  }),
  connection: one(integrationConnections, {
    fields: [xeroInvoiceMappings.integrationConnectionId],
    references: [integrationConnections.id],
  }),
  invoice: one(invoices, {
    fields: [xeroInvoiceMappings.invoiceId],
    references: [invoices.id],
  }),
}));

export const xeroPaymentMappingsRelations = relations(xeroPaymentMappings, ({ one }) => ({
  company: one(companies, {
    fields: [xeroPaymentMappings.companyId],
    references: [companies.id],
  }),
  connection: one(integrationConnections, {
    fields: [xeroPaymentMappings.integrationConnectionId],
    references: [integrationConnections.id],
  }),
  payment: one(payments, {
    fields: [xeroPaymentMappings.paymentId],
    references: [payments.id],
  }),
}));

export const xeroSyncLogsRelations = relations(xeroSyncLogs, ({ one }) => ({
  company: one(companies, {
    fields: [xeroSyncLogs.companyId],
    references: [companies.id],
  }),
  connection: one(integrationConnections, {
    fields: [xeroSyncLogs.integrationConnectionId],
    references: [integrationConnections.id],
  }),
  syncJob: one(integrationSyncJobs, {
    fields: [xeroSyncLogs.syncJobId],
    references: [integrationSyncJobs.id],
  }),
}));

export const customerActivitiesRelations = relations(customerActivities, ({ one }) => ({
  company: one(companies, {
    fields: [customerActivities.companyId],
    references: [companies.id],
  }),
  customer: one(customers, {
    fields: [customerActivities.customerId],
    references: [customers.id],
  }),
  author: one(users, {
    fields: [customerActivities.userId],
    references: [users.id],
  }),
}));

export const userInvitesRelations = relations(userInvites, ({ one }) => ({
  company: one(companies, {
    fields: [userInvites.companyId],
    references: [companies.id],
  }),
  role: one(roles, {
    fields: [userInvites.roleId],
    references: [roles.id],
  }),
  invitedBy: one(users, {
    fields: [userInvites.invitedByUserId],
    references: [users.id],
  }),
}));

export const auraConversationsRelations = relations(auraConversations, ({ one, many }) => ({
  company: one(companies, {
    fields: [auraConversations.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [auraConversations.userId],
    references: [users.id],
  }),
  messages: many(auraMessages),
}));

export const auraMessagesRelations = relations(auraMessages, ({ one }) => ({
  conversation: one(auraConversations, {
    fields: [auraMessages.conversationId],
    references: [auraConversations.id],
  }),
}));

export const auraMemoryRelations = relations(auraMemory, ({ one }) => ({
  company: one(companies, {
    fields: [auraMemory.companyId],
    references: [companies.id],
  }),
  createdBy: one(users, {
    fields: [auraMemory.createdByUserId],
    references: [users.id],
  }),
}));

export const reportDefinitionsRelations = relations(reportDefinitions, ({ one, many }) => ({
  company: one(companies, {
    fields: [reportDefinitions.companyId],
    references: [companies.id],
  }),
  createdBy: one(users, {
    fields: [reportDefinitions.createdByUserId],
    references: [users.id],
  }),
  runs: many(reportRuns),
}));

export const reportRunsRelations = relations(reportRuns, ({ one }) => ({
  company: one(companies, {
    fields: [reportRuns.companyId],
    references: [companies.id],
  }),
  reportDefinition: one(reportDefinitions, {
    fields: [reportRuns.reportDefinitionId],
    references: [reportDefinitions.id],
  }),
  generatedBy: one(users, {
    fields: [reportRuns.generatedByUserId],
    references: [users.id],
  }),
}));

export const analyticsSnapshotsRelations = relations(analyticsSnapshots, ({ one }) => ({
  company: one(companies, {
    fields: [analyticsSnapshots.companyId],
    references: [companies.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  company: one(companies, {
    fields: [notifications.companyId],
    references: [companies.id],
  }),
  recipientUser: one(users, {
    fields: [notifications.recipientUserId],
    references: [users.id],
  }),
  recipientPortalUser: one(portalUsers, {
    fields: [notifications.recipientPortalUserId],
    references: [portalUsers.id],
  }),
}));

export const notificationPreferencesRelations = relations(notificationPreferences, ({ one }) => ({
  company: one(companies, {
    fields: [notificationPreferences.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [notificationPreferences.userId],
    references: [users.id],
  }),
  portalUser: one(portalUsers, {
    fields: [notificationPreferences.portalUserId],
    references: [portalUsers.id],
  }),
}));

export const mobileSyncStateRelations = relations(mobileSyncState, ({ one }) => ({
  company: one(companies, {
    fields: [mobileSyncState.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [mobileSyncState.userId],
    references: [users.id],
  }),
  portalUser: one(portalUsers, {
    fields: [mobileSyncState.portalUserId],
    references: [portalUsers.id],
  }),
}));

export const mobileSyncQueueRelations = relations(mobileSyncQueue, ({ one }) => ({
  company: one(companies, {
    fields: [mobileSyncQueue.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [mobileSyncQueue.userId],
    references: [users.id],
  }),
  portalUser: one(portalUsers, {
    fields: [mobileSyncQueue.portalUserId],
    references: [portalUsers.id],
  }),
}));

export const mobilePendingActionsRelations = relations(mobilePendingActions, ({ one }) => ({
  company: one(companies, {
    fields: [mobilePendingActions.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [mobilePendingActions.userId],
    references: [users.id],
  }),
}));

export const mobileActionLogsRelations = relations(mobileActionLogs, ({ one }) => ({
  company: one(companies, {
    fields: [mobileActionLogs.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [mobileActionLogs.userId],
    references: [users.id],
  }),
  portalUser: one(portalUsers, {
    fields: [mobileActionLogs.portalUserId],
    references: [portalUsers.id],
  }),
}));

export const agentOrchestrationsRelations = relations(agentOrchestrations, ({ one, many }) => ({
  company: one(companies, {
    fields: [agentOrchestrations.companyId],
    references: [companies.id],
  }),
  createdBy: one(users, {
    fields: [agentOrchestrations.createdByUserId],
    references: [users.id],
  }),
  steps: many(agentOrchestrationSteps),
  triggers: many(agentOrchestrationTriggers),
  runs: many(agentOrchestrationRuns),
}));

export const agentOrchestrationStepsRelations = relations(agentOrchestrationSteps, ({ one }) => ({
  company: one(companies, {
    fields: [agentOrchestrationSteps.companyId],
    references: [companies.id],
  }),
  orchestration: one(agentOrchestrations, {
    fields: [agentOrchestrationSteps.orchestrationId],
    references: [agentOrchestrations.id],
  }),
}));

export const agentOrchestrationTriggersRelations = relations(
  agentOrchestrationTriggers,
  ({ one }) => ({
    company: one(companies, {
      fields: [agentOrchestrationTriggers.companyId],
      references: [companies.id],
    }),
    orchestration: one(agentOrchestrations, {
      fields: [agentOrchestrationTriggers.orchestrationId],
      references: [agentOrchestrations.id],
    }),
  }),
);

export const agentOrchestrationRunsRelations = relations(
  agentOrchestrationRuns,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [agentOrchestrationRuns.companyId],
      references: [companies.id],
    }),
    orchestration: one(agentOrchestrations, {
      fields: [agentOrchestrationRuns.orchestrationId],
      references: [agentOrchestrations.id],
    }),
    initiatedBy: one(users, {
      fields: [agentOrchestrationRuns.initiatedByUserId],
      references: [users.id],
    }),
    steps: many(agentOrchestrationRunSteps),
    logs: many(agentOrchestrationLogs),
    approvals: many(agentOrchestrationApprovals),
  }),
);

export const agentOrchestrationRunStepsRelations = relations(
  agentOrchestrationRunSteps,
  ({ one }) => ({
    company: one(companies, {
      fields: [agentOrchestrationRunSteps.companyId],
      references: [companies.id],
    }),
    run: one(agentOrchestrationRuns, {
      fields: [agentOrchestrationRunSteps.runId],
      references: [agentOrchestrationRuns.id],
    }),
    definitionStep: one(agentOrchestrationSteps, {
      fields: [agentOrchestrationRunSteps.definitionStepId],
      references: [agentOrchestrationSteps.id],
    }),
  }),
);

export const agentOrchestrationApprovalsRelations = relations(
  agentOrchestrationApprovals,
  ({ one }) => ({
    company: one(companies, {
      fields: [agentOrchestrationApprovals.companyId],
      references: [companies.id],
    }),
    run: one(agentOrchestrationRuns, {
      fields: [agentOrchestrationApprovals.runId],
      references: [agentOrchestrationRuns.id],
    }),
    runStep: one(agentOrchestrationRunSteps, {
      fields: [agentOrchestrationApprovals.runStepId],
      references: [agentOrchestrationRunSteps.id],
    }),
  }),
);

export const agentOrchestrationLogsRelations = relations(agentOrchestrationLogs, ({ one }) => ({
  company: one(companies, {
    fields: [agentOrchestrationLogs.companyId],
    references: [companies.id],
  }),
  run: one(agentOrchestrationRuns, {
    fields: [agentOrchestrationLogs.runId],
    references: [agentOrchestrationRuns.id],
  }),
  runStep: one(agentOrchestrationRunSteps, {
    fields: [agentOrchestrationLogs.runStepId],
    references: [agentOrchestrationRunSteps.id],
  }),
}));


export const draftWorkspaceRelations = relations(draftWorkspace, ({ one }) => ({
  company: one(companies, {
    fields: [draftWorkspace.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [draftWorkspace.userId],
    references: [users.id],
    relationName: 'draftWorkspaceOwner',
  }),
  lastEditedBy: one(users, {
    fields: [draftWorkspace.lastEditedByUserId],
    references: [users.id],
    relationName: 'draftWorkspaceLastEditor',
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
  company: one(companies, {
    fields: [sessions.companyId],
    references: [companies.id],
  }),
}));

export const whatsappConnectionsRelations = relations(whatsappConnections, ({ one }) => ({
  company: one(companies, {
    fields: [whatsappConnections.companyId],
    references: [companies.id],
  }),
}));

export const whatsappTemplatesRelations = relations(whatsappTemplates, ({ one, many }) => ({
  company: one(companies, {
    fields: [whatsappTemplates.companyId],
    references: [companies.id],
  }),
  messages: many(whatsappMessages),
}));

export const whatsappMessagesRelations = relations(whatsappMessages, ({ one }) => ({
  company: one(companies, {
    fields: [whatsappMessages.companyId],
    references: [companies.id],
  }),
  customer: one(customers, {
    fields: [whatsappMessages.customerId],
    references: [customers.id],
  }),
  template: one(whatsappTemplates, {
    fields: [whatsappMessages.templateId],
    references: [whatsappTemplates.id],
  }),
  approvedBy: one(users, {
    fields: [whatsappMessages.approvedByUserId],
    references: [users.id],
  }),
}));

export const agentRunsRelations = relations(agentRuns, ({ one, many }) => ({
  company: one(companies, {
    fields: [agentRuns.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [agentRuns.userId],
    references: [users.id],
  }),
  agentProfile: one(agentProfiles, {
    fields: [agentRuns.agentProfileId],
    references: [agentProfiles.id],
  }),
  tasks: many(agentTasks),
}));

export const agentTasksRelations = relations(agentTasks, ({ one }) => ({
  company: one(companies, {
    fields: [agentTasks.companyId],
    references: [companies.id],
  }),
  agentRun: one(agentRuns, {
    fields: [agentTasks.agentRunId],
    references: [agentRuns.id],
  }),
  agentProfile: one(agentProfiles, {
    fields: [agentTasks.agentProfileId],
    references: [agentProfiles.id],
  }),
  user: one(users, {
    fields: [agentTasks.userId],
    references: [users.id],
  }),
  approvedBy: one(users, {
    fields: [agentTasks.approvedByUserId],
    references: [users.id],
  }),
}));

export const recruitingCandidatesRelations = relations(recruitingCandidates, ({ one, many }) => ({
  company: one(companies, {
    fields: [recruitingCandidates.companyId],
    references: [companies.id],
  }),
  applications: many(recruitingApplications),
  activities: many(candidateActivities),
}));

export const recruitingApplicationsRelations = relations(recruitingApplications, ({ one }) => ({
  company: one(companies, {
    fields: [recruitingApplications.companyId],
    references: [companies.id],
  }),
  candidate: one(recruitingCandidates, {
    fields: [recruitingApplications.candidateId],
    references: [recruitingCandidates.id],
  }),
}));

export const salesPipelineStagesRelations = relations(salesPipelineStages, ({ one, many }) => ({
  company: one(companies, {
    fields: [salesPipelineStages.companyId],
    references: [companies.id],
  }),
  opportunities: many(salesOpportunities),
}));

export const salesOpportunitiesRelations = relations(salesOpportunities, ({ one, many }) => ({
  company: one(companies, {
    fields: [salesOpportunities.companyId],
    references: [companies.id],
  }),
  customer: one(customers, {
    fields: [salesOpportunities.customerId],
    references: [customers.id],
  }),
  stage: one(salesPipelineStages, {
    fields: [salesOpportunities.stageId],
    references: [salesPipelineStages.id],
  }),
  quote: one(quotes, {
    fields: [salesOpportunities.quoteId],
    references: [quotes.id],
  }),
  job: one(jobs, {
    fields: [salesOpportunities.jobId],
    references: [jobs.id],
  }),
  assignedUser: one(users, {
    fields: [salesOpportunities.assignedUserId],
    references: [users.id],
  }),
  createdBy: one(users, {
    fields: [salesOpportunities.createdByUserId],
    references: [users.id],
  }),
  activities: many(salesActivities),
}));

export const salesActivitiesRelations = relations(salesActivities, ({ one }) => ({
  company: one(companies, {
    fields: [salesActivities.companyId],
    references: [companies.id],
  }),
  opportunity: one(salesOpportunities, {
    fields: [salesActivities.opportunityId],
    references: [salesOpportunities.id],
  }),
  customer: one(customers, {
    fields: [salesActivities.customerId],
    references: [customers.id],
  }),
  author: one(users, {
    fields: [salesActivities.authorUserId],
    references: [users.id],
  }),
}));

export const salesRecommendationsRelations = relations(salesRecommendations, ({ one }) => ({
  company: one(companies, {
    fields: [salesRecommendations.companyId],
    references: [companies.id],
  }),
  customer: one(customers, {
    fields: [salesRecommendations.customerId],
    references: [customers.id],
  }),
}));

export const marketingSegmentsRelations = relations(marketingSegments, ({ one }) => ({
  company: one(companies, {
    fields: [marketingSegments.companyId],
    references: [companies.id],
  }),
  createdBy: one(users, {
    fields: [marketingSegments.createdByUserId],
    references: [users.id],
  }),
}));

export const marketingCampaignsRelations = relations(marketingCampaigns, ({ one, many }) => ({
  company: one(companies, {
    fields: [marketingCampaigns.companyId],
    references: [companies.id],
  }),
  createdBy: one(users, {
    fields: [marketingCampaigns.createdByUserId],
    references: [users.id],
  }),
  activities: many(marketingActivities),
}));

export const marketingActivitiesRelations = relations(marketingActivities, ({ one }) => ({
  company: one(companies, {
    fields: [marketingActivities.companyId],
    references: [companies.id],
  }),
  campaign: one(marketingCampaigns, {
    fields: [marketingActivities.campaignId],
    references: [marketingCampaigns.id],
  }),
  customer: one(customers, {
    fields: [marketingActivities.customerId],
    references: [customers.id],
  }),
  author: one(users, {
    fields: [marketingActivities.authorUserId],
    references: [users.id],
  }),
}));

export const marketingRecommendationsRelations = relations(marketingRecommendations, ({ one }) => ({
  company: one(companies, {
    fields: [marketingRecommendations.companyId],
    references: [companies.id],
  }),
  customer: one(customers, {
    fields: [marketingRecommendations.customerId],
    references: [customers.id],
  }),
}));

export const leadSourcesRelations = relations(leadSources, ({ one, many }) => ({
  company: one(companies, {
    fields: [leadSources.companyId],
    references: [companies.id],
  }),
  leads: many(leads),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
  company: one(companies, {
    fields: [leads.companyId],
    references: [companies.id],
  }),
  customer: one(customers, {
    fields: [leads.customerId],
    references: [customers.id],
  }),
  source: one(leadSources, {
    fields: [leads.sourceId],
    references: [leadSources.id],
  }),
  assignedUser: one(users, {
    fields: [leads.assignedUserId],
    references: [users.id],
  }),
  createdBy: one(users, {
    fields: [leads.createdByUserId],
    references: [users.id],
  }),
  activities: many(leadActivities),
  scores: many(leadScores),
  recommendations: many(leadRecommendations),
  statusHistory: many(leadStatusHistory),
  conversions: many(leadConversions),
  property: one(cxCustomerProperties, {
    fields: [leads.propertyId],
    references: [cxCustomerProperties.id],
  }),
  job: one(jobs, {
    fields: [leads.jobId],
    references: [jobs.id],
  }),
}));

export const leadStatusHistoryRelations = relations(leadStatusHistory, ({ one }) => ({
  company: one(companies, {
    fields: [leadStatusHistory.companyId],
    references: [companies.id],
  }),
  lead: one(leads, {
    fields: [leadStatusHistory.leadId],
    references: [leads.id],
  }),
  actor: one(users, {
    fields: [leadStatusHistory.actorUserId],
    references: [users.id],
  }),
}));

export const leadConversionsRelations = relations(leadConversions, ({ one }) => ({
  company: one(companies, {
    fields: [leadConversions.companyId],
    references: [companies.id],
  }),
  lead: one(leads, {
    fields: [leadConversions.leadId],
    references: [leads.id],
  }),
  customer: one(customers, {
    fields: [leadConversions.customerId],
    references: [customers.id],
  }),
  property: one(cxCustomerProperties, {
    fields: [leadConversions.propertyId],
    references: [cxCustomerProperties.id],
  }),
  job: one(jobs, {
    fields: [leadConversions.jobId],
    references: [jobs.id],
  }),
  convertedBy: one(users, {
    fields: [leadConversions.convertedByUserId],
    references: [users.id],
  }),
}));

export const leadActivitiesRelations = relations(leadActivities, ({ one }) => ({
  company: one(companies, {
    fields: [leadActivities.companyId],
    references: [companies.id],
  }),
  lead: one(leads, {
    fields: [leadActivities.leadId],
    references: [leads.id],
  }),
  author: one(users, {
    fields: [leadActivities.authorUserId],
    references: [users.id],
  }),
}));

export const leadScoresRelations = relations(leadScores, ({ one }) => ({
  company: one(companies, {
    fields: [leadScores.companyId],
    references: [companies.id],
  }),
  lead: one(leads, {
    fields: [leadScores.leadId],
    references: [leads.id],
  }),
}));

export const leadRecommendationsRelations = relations(leadRecommendations, ({ one }) => ({
  company: one(companies, {
    fields: [leadRecommendations.companyId],
    references: [companies.id],
  }),
  lead: one(leads, {
    fields: [leadRecommendations.leadId],
    references: [leads.id],
  }),
}));

export const voiceSessionsRelations = relations(voiceSessions, ({ one, many }) => ({
  company: one(companies, {
    fields: [voiceSessions.companyId],
    references: [companies.id],
  }),
  customer: one(customers, {
    fields: [voiceSessions.customerId],
    references: [customers.id],
  }),
  agentProfile: one(agentProfiles, {
    fields: [voiceSessions.agentProfileId],
    references: [agentProfiles.id],
  }),
  createdBy: one(users, {
    fields: [voiceSessions.createdByUserId],
    references: [users.id],
  }),
  conversations: many(voiceConversations),
  outcomes: many(voiceOutcomes),
  followUps: many(voiceFollowUps),
}));

export const voiceConversationsRelations = relations(voiceConversations, ({ one }) => ({
  company: one(companies, {
    fields: [voiceConversations.companyId],
    references: [companies.id],
  }),
  session: one(voiceSessions, {
    fields: [voiceConversations.sessionId],
    references: [voiceSessions.id],
  }),
}));

export const voiceOutcomesRelations = relations(voiceOutcomes, ({ one }) => ({
  company: one(companies, {
    fields: [voiceOutcomes.companyId],
    references: [companies.id],
  }),
  session: one(voiceSessions, {
    fields: [voiceOutcomes.sessionId],
    references: [voiceSessions.id],
  }),
}));

export const voiceFollowUpsRelations = relations(voiceFollowUps, ({ one }) => ({
  company: one(companies, {
    fields: [voiceFollowUps.companyId],
    references: [companies.id],
  }),
  session: one(voiceSessions, {
    fields: [voiceFollowUps.sessionId],
    references: [voiceSessions.id],
  }),
  customer: one(customers, {
    fields: [voiceFollowUps.customerId],
    references: [customers.id],
  }),
}));

export const customerSupportConversationsRelations = relations(
  customerSupportConversations,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [customerSupportConversations.companyId],
      references: [companies.id],
    }),
    customer: one(customers, {
      fields: [customerSupportConversations.customerId],
      references: [customers.id],
    }),
    portalUser: one(portalUsers, {
      fields: [customerSupportConversations.portalUserId],
      references: [portalUsers.id],
    }),
    assignedUser: one(users, {
      fields: [customerSupportConversations.assignedUserId],
      references: [users.id],
    }),
    createdBy: one(users, {
      fields: [customerSupportConversations.createdByUserId],
      references: [users.id],
    }),
    messages: many(customerSupportMessages),
    escalations: many(customerSupportEscalations),
    feedback: many(customerSupportFeedback),
  }),
);

export const customerSupportMessagesRelations = relations(customerSupportMessages, ({ one }) => ({
  company: one(companies, {
    fields: [customerSupportMessages.companyId],
    references: [companies.id],
  }),
  conversation: one(customerSupportConversations, {
    fields: [customerSupportMessages.conversationId],
    references: [customerSupportConversations.id],
  }),
  author: one(users, {
    fields: [customerSupportMessages.authorUserId],
    references: [users.id],
  }),
}));

export const customerSupportEscalationsRelations = relations(
  customerSupportEscalations,
  ({ one }) => ({
    company: one(companies, {
      fields: [customerSupportEscalations.companyId],
      references: [companies.id],
    }),
    conversation: one(customerSupportConversations, {
      fields: [customerSupportEscalations.conversationId],
      references: [customerSupportConversations.id],
    }),
    customer: one(customers, {
      fields: [customerSupportEscalations.customerId],
      references: [customers.id],
    }),
    assignedUser: one(users, {
      fields: [customerSupportEscalations.assignedUserId],
      references: [users.id],
    }),
  }),
);

export const customerSupportFeedbackRelations = relations(customerSupportFeedback, ({ one }) => ({
  company: one(companies, {
    fields: [customerSupportFeedback.companyId],
    references: [companies.id],
  }),
  conversation: one(customerSupportConversations, {
    fields: [customerSupportFeedback.conversationId],
    references: [customerSupportConversations.id],
  }),
  customer: one(customers, {
    fields: [customerSupportFeedback.customerId],
    references: [customers.id],
  }),
}));

export const candidateActivitiesRelations = relations(candidateActivities, ({ one }) => ({
  company: one(companies, {
    fields: [candidateActivities.companyId],
    references: [companies.id],
  }),
  candidate: one(recruitingCandidates, {
    fields: [candidateActivities.candidateId],
    references: [recruitingCandidates.id],
  }),
  author: one(users, {
    fields: [candidateActivities.authorUserId],
    references: [users.id],
  }),
}));

export const employeeSkillsRelations = relations(employeeSkills, ({ one }) => ({
  company: one(companies, {
    fields: [employeeSkills.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [employeeSkills.userId],
    references: [users.id],
  }),
}));

export const certificationsRelations = relations(certifications, ({ one }) => ({
  company: one(companies, {
    fields: [certifications.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [certifications.userId],
    references: [users.id],
  }),
}));

export const trainingRecordsRelations = relations(trainingRecords, ({ one }) => ({
  company: one(companies, {
    fields: [trainingRecords.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [trainingRecords.userId],
    references: [users.id],
  }),
}));

export const workforceRecommendationsRelations = relations(workforceRecommendations, ({ one }) => ({
  company: one(companies, {
    fields: [workforceRecommendations.companyId],
    references: [companies.id],
  }),
}));

export const suppliersRelations = relations(suppliers, ({ one, many }) => ({
  company: one(companies, {
    fields: [suppliers.companyId],
    references: [companies.id],
  }),
  products: many(supplierProducts),
  purchaseOrders: many(purchaseOrders),
  activities: many(supplierActivities),
}));

export const supplierProductsRelations = relations(supplierProducts, ({ one }) => ({
  company: one(companies, {
    fields: [supplierProducts.companyId],
    references: [companies.id],
  }),
  supplier: one(suppliers, {
    fields: [supplierProducts.supplierId],
    references: [suppliers.id],
  }),
  inventoryItem: one(inventoryItems, {
    fields: [supplierProducts.inventoryItemId],
    references: [inventoryItems.id],
  }),
}));

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  company: one(companies, {
    fields: [purchaseOrders.companyId],
    references: [companies.id],
  }),
  supplier: one(suppliers, {
    fields: [purchaseOrders.supplierId],
    references: [suppliers.id],
  }),
  createdBy: one(users, {
    fields: [purchaseOrders.createdByUserId],
    references: [users.id],
  }),
  approvedBy: one(users, {
    fields: [purchaseOrders.approvedByUserId],
    references: [users.id],
  }),
  job: one(jobs, {
    fields: [purchaseOrders.jobId],
    references: [jobs.id],
  }),
  destinationLocation: one(inventoryLocations, {
    fields: [purchaseOrders.destinationLocationId],
    references: [inventoryLocations.id],
  }),
  items: many(purchaseOrderItems),
}));

export const purchaseOrderItemsRelations = relations(purchaseOrderItems, ({ one }) => ({
  company: one(companies, {
    fields: [purchaseOrderItems.companyId],
    references: [companies.id],
  }),
  purchaseOrder: one(purchaseOrders, {
    fields: [purchaseOrderItems.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
  inventoryItem: one(inventoryItems, {
    fields: [purchaseOrderItems.inventoryItemId],
    references: [inventoryItems.id],
  }),
}));

export const supplierActivitiesRelations = relations(supplierActivities, ({ one }) => ({
  company: one(companies, {
    fields: [supplierActivities.companyId],
    references: [companies.id],
  }),
  supplier: one(suppliers, {
    fields: [supplierActivities.supplierId],
    references: [suppliers.id],
  }),
  author: one(users, {
    fields: [supplierActivities.authorUserId],
    references: [users.id],
  }),
}));

export const procurementRecommendationsRelations = relations(
  procurementRecommendations,
  ({ one }) => ({
    company: one(companies, {
      fields: [procurementRecommendations.companyId],
      references: [companies.id],
    }),
  }),
);

export const businessHealthSnapshotsRelations = relations(businessHealthSnapshots, ({ one }) => ({
  company: one(companies, {
    fields: [businessHealthSnapshots.companyId],
    references: [companies.id],
  }),
}));

export const executiveAlertsRelations = relations(executiveAlerts, ({ one }) => ({
  company: one(companies, {
    fields: [executiveAlerts.companyId],
    references: [companies.id],
  }),
}));

export const executiveRecommendationsRelations = relations(executiveRecommendations, ({ one }) => ({
  company: one(companies, {
    fields: [executiveRecommendations.companyId],
    references: [companies.id],
  }),
}));

export const executiveReportsRelations = relations(executiveReports, ({ one }) => ({
  company: one(companies, {
    fields: [executiveReports.companyId],
    references: [companies.id],
  }),
}));

export const financeBudgetsRelations = relations(financeBudgets, ({ one, many }) => ({
  company: one(companies, {
    fields: [financeBudgets.companyId],
    references: [companies.id],
  }),
  lines: many(financeBudgetLines),
}));

export const financeBudgetLinesRelations = relations(financeBudgetLines, ({ one }) => ({
  company: one(companies, {
    fields: [financeBudgetLines.companyId],
    references: [companies.id],
  }),
  budget: one(financeBudgets, {
    fields: [financeBudgetLines.budgetId],
    references: [financeBudgets.id],
  }),
}));

export const financeRecommendationsRelations = relations(financeRecommendations, ({ one }) => ({
  company: one(companies, {
    fields: [financeRecommendations.companyId],
    references: [companies.id],
  }),
}));

export const financeForecastSnapshotsRelations = relations(financeForecastSnapshots, ({ one }) => ({
  company: one(companies, {
    fields: [financeForecastSnapshots.companyId],
    references: [companies.id],
  }),
}));

export const knowledgeCategoriesRelations = relations(knowledgeCategories, ({ one, many }) => ({
  company: one(companies, {
    fields: [knowledgeCategories.companyId],
    references: [companies.id],
  }),
  articles: many(knowledgeArticles),
  sops: many(sopDocuments),
  courses: many(trainingCourses),
  policies: many(companyPolicies),
}));

export const knowledgeArticlesRelations = relations(knowledgeArticles, ({ one }) => ({
  company: one(companies, {
    fields: [knowledgeArticles.companyId],
    references: [companies.id],
  }),
  category: one(knowledgeCategories, {
    fields: [knowledgeArticles.categoryId],
    references: [knowledgeCategories.id],
  }),
  createdBy: one(users, {
    fields: [knowledgeArticles.createdByUserId],
    references: [users.id],
  }),
  approvedBy: one(users, {
    fields: [knowledgeArticles.approvedByUserId],
    references: [users.id],
  }),
}));

export const knowledgeVersionsRelations = relations(knowledgeVersions, ({ one }) => ({
  company: one(companies, {
    fields: [knowledgeVersions.companyId],
    references: [companies.id],
  }),
  createdBy: one(users, {
    fields: [knowledgeVersions.createdByUserId],
    references: [users.id],
  }),
}));

export const sopDocumentsRelations = relations(sopDocuments, ({ one }) => ({
  company: one(companies, {
    fields: [sopDocuments.companyId],
    references: [companies.id],
  }),
  category: one(knowledgeCategories, {
    fields: [sopDocuments.categoryId],
    references: [knowledgeCategories.id],
  }),
  createdBy: one(users, {
    fields: [sopDocuments.createdByUserId],
    references: [users.id],
  }),
  approvedBy: one(users, {
    fields: [sopDocuments.approvedByUserId],
    references: [users.id],
  }),
}));

export const trainingCoursesRelations = relations(trainingCourses, ({ one, many }) => ({
  company: one(companies, {
    fields: [trainingCourses.companyId],
    references: [companies.id],
  }),
  category: one(knowledgeCategories, {
    fields: [trainingCourses.categoryId],
    references: [knowledgeCategories.id],
  }),
  createdBy: one(users, {
    fields: [trainingCourses.createdByUserId],
    references: [users.id],
  }),
  records: many(knowledgeTrainingRecords),
}));

export const knowledgeTrainingRecordsRelations = relations(knowledgeTrainingRecords, ({ one }) => ({
  company: one(companies, {
    fields: [knowledgeTrainingRecords.companyId],
    references: [companies.id],
  }),
  course: one(trainingCourses, {
    fields: [knowledgeTrainingRecords.courseId],
    references: [trainingCourses.id],
  }),
  user: one(users, {
    fields: [knowledgeTrainingRecords.userId],
    references: [users.id],
  }),
}));

export const companyPoliciesRelations = relations(companyPolicies, ({ one }) => ({
  company: one(companies, {
    fields: [companyPolicies.companyId],
    references: [companies.id],
  }),
  category: one(knowledgeCategories, {
    fields: [companyPolicies.categoryId],
    references: [knowledgeCategories.id],
  }),
  createdBy: one(users, {
    fields: [companyPolicies.createdByUserId],
    references: [users.id],
  }),
  approvedBy: one(users, {
    fields: [companyPolicies.approvedByUserId],
    references: [users.id],
  }),
}));

export const knowledgeRecommendationsRelations = relations(knowledgeRecommendations, ({ one }) => ({
  company: one(companies, {
    fields: [knowledgeRecommendations.companyId],
    references: [companies.id],
  }),
}));

export const businessKpisRelations = relations(businessKpis, ({ one, many }) => ({
  company: one(companies, {
    fields: [businessKpis.companyId],
    references: [companies.id],
  }),
  snapshots: many(businessKpiSnapshots),
}));

export const businessKpiSnapshotsRelations = relations(businessKpiSnapshots, ({ one }) => ({
  company: one(companies, {
    fields: [businessKpiSnapshots.companyId],
    references: [companies.id],
  }),
  kpi: one(businessKpis, {
    fields: [businessKpiSnapshots.kpiId],
    references: [businessKpis.id],
  }),
}));

export const businessDashboardsRelations = relations(businessDashboards, ({ one, many }) => ({
  company: one(companies, {
    fields: [businessDashboards.companyId],
    references: [companies.id],
  }),
  createdBy: one(users, {
    fields: [businessDashboards.createdByUserId],
    references: [users.id],
  }),
  widgets: many(dashboardWidgets),
}));

export const dashboardWidgetsRelations = relations(dashboardWidgets, ({ one }) => ({
  company: one(companies, {
    fields: [dashboardWidgets.companyId],
    references: [companies.id],
  }),
  dashboard: one(businessDashboards, {
    fields: [dashboardWidgets.dashboardId],
    references: [businessDashboards.id],
  }),
}));

export const biReportTemplatesRelations = relations(biReportTemplates, ({ one, many }) => ({
  company: one(companies, {
    fields: [biReportTemplates.companyId],
    references: [companies.id],
  }),
  reports: many(businessReports),
}));

export const businessReportsRelations = relations(businessReports, ({ one }) => ({
  company: one(companies, {
    fields: [businessReports.companyId],
    references: [companies.id],
  }),
  template: one(biReportTemplates, {
    fields: [businessReports.templateId],
    references: [biReportTemplates.id],
  }),
  createdBy: one(users, {
    fields: [businessReports.createdByUserId],
    references: [users.id],
  }),
}));

export const businessInsightsRelations = relations(businessInsights, ({ one }) => ({
  company: one(companies, {
    fields: [businessInsights.companyId],
    references: [companies.id],
  }),
}));

export const predictiveForecastsRelations = relations(predictiveForecasts, ({ one }) => ({
  company: one(companies, {
    fields: [predictiveForecasts.companyId],
    references: [companies.id],
  }),
}));

export const mobileWorkforceRequestsRelations = relations(mobileWorkforceRequests, ({ one }) => ({
  company: one(companies, {
    fields: [mobileWorkforceRequests.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [mobileWorkforceRequests.userId],
    references: [users.id],
  }),
}));

export const mobileTimeEntriesRelations = relations(mobileTimeEntries, ({ one }) => ({
  company: one(companies, {
    fields: [mobileTimeEntries.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [mobileTimeEntries.userId],
    references: [users.id],
  }),
  job: one(jobs, {
    fields: [mobileTimeEntries.jobId],
    references: [jobs.id],
  }),
}));

export const mobileJobInventoryUsageRelations = relations(mobileJobInventoryUsage, ({ one }) => ({
  company: one(companies, {
    fields: [mobileJobInventoryUsage.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [mobileJobInventoryUsage.userId],
    references: [users.id],
  }),
  job: one(jobs, {
    fields: [mobileJobInventoryUsage.jobId],
    references: [jobs.id],
  }),
  inventoryItem: one(inventoryItems, {
    fields: [mobileJobInventoryUsage.inventoryItemId],
    references: [inventoryItems.id],
  }),
}));

export const mobileJobDocumentationRelations = relations(mobileJobDocumentation, ({ one }) => ({
  company: one(companies, {
    fields: [mobileJobDocumentation.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [mobileJobDocumentation.userId],
    references: [users.id],
  }),
  job: one(jobs, {
    fields: [mobileJobDocumentation.jobId],
    references: [jobs.id],
  }),
}));

export const mobileSyncConflictsRelations = relations(mobileSyncConflicts, ({ one }) => ({
  company: one(companies, {
    fields: [mobileSyncConflicts.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [mobileSyncConflicts.userId],
    references: [users.id],
  }),
  queueItem: one(mobileSyncQueue, {
    fields: [mobileSyncConflicts.queueItemId],
    references: [mobileSyncQueue.id],
  }),
}));

export const mobileCompanyAnnouncementsRelations = relations(
  mobileCompanyAnnouncements,
  ({ one }) => ({
    company: one(companies, {
      fields: [mobileCompanyAnnouncements.companyId],
      references: [companies.id],
    }),
    createdBy: one(users, {
      fields: [mobileCompanyAnnouncements.createdByUserId],
      references: [users.id],
    }),
  }),
);

export const qualityComebacksRelations = relations(qualityComebacks, ({ one }) => ({
  company: one(companies, {
    fields: [qualityComebacks.companyId],
    references: [companies.id],
  }),
  originalJob: one(jobs, {
    fields: [qualityComebacks.originalJobId],
    references: [jobs.id],
    relationName: 'originalComebackJob',
  }),
  comebackJob: one(jobs, {
    fields: [qualityComebacks.comebackJobId],
    references: [jobs.id],
    relationName: 'comebackJobLink',
  }),
  customer: one(customers, {
    fields: [qualityComebacks.customerId],
    references: [customers.id],
  }),
  originalTechnician: one(users, {
    fields: [qualityComebacks.originalTechnicianId],
    references: [users.id],
    relationName: 'originalTechnician',
  }),
  currentTechnician: one(users, {
    fields: [qualityComebacks.currentTechnicianId],
    references: [users.id],
    relationName: 'currentTechnician',
  }),
  createdBy: one(users, {
    fields: [qualityComebacks.createdByUserId],
    references: [users.id],
    relationName: 'comebackCreatedBy',
  }),
}));

export const qualityRootCauseAnalysesRelations = relations(qualityRootCauseAnalyses, ({ one }) => ({
  company: one(companies, {
    fields: [qualityRootCauseAnalyses.companyId],
    references: [companies.id],
  }),
  comeback: one(qualityComebacks, {
    fields: [qualityRootCauseAnalyses.comebackId],
    references: [qualityComebacks.id],
  }),
}));

export const qualityCostEntriesRelations = relations(qualityCostEntries, ({ one }) => ({
  company: one(companies, {
    fields: [qualityCostEntries.companyId],
    references: [companies.id],
  }),
  comeback: one(qualityComebacks, {
    fields: [qualityCostEntries.comebackId],
    references: [qualityComebacks.id],
  }),
}));

export const qualityWarrantyClaimsRelations = relations(qualityWarrantyClaims, ({ one }) => ({
  company: one(companies, {
    fields: [qualityWarrantyClaims.companyId],
    references: [companies.id],
  }),
  comeback: one(qualityComebacks, {
    fields: [qualityWarrantyClaims.comebackId],
    references: [qualityComebacks.id],
  }),
  job: one(jobs, {
    fields: [qualityWarrantyClaims.jobId],
    references: [jobs.id],
  }),
  customer: one(customers, {
    fields: [qualityWarrantyClaims.customerId],
    references: [customers.id],
  }),
}));

export const qualitySupplierDefectsRelations = relations(qualitySupplierDefects, ({ one }) => ({
  company: one(companies, {
    fields: [qualitySupplierDefects.companyId],
    references: [companies.id],
  }),
  supplier: one(suppliers, {
    fields: [qualitySupplierDefects.supplierId],
    references: [suppliers.id],
  }),
  inventoryItem: one(inventoryItems, {
    fields: [qualitySupplierDefects.inventoryItemId],
    references: [inventoryItems.id],
  }),
  comeback: one(qualityComebacks, {
    fields: [qualitySupplierDefects.comebackId],
    references: [qualityComebacks.id],
  }),
  warrantyClaim: one(qualityWarrantyClaims, {
    fields: [qualitySupplierDefects.warrantyClaimId],
    references: [qualityWarrantyClaims.id],
  }),
}));

export const qualityActionsRelations = relations(qualityActions, ({ one }) => ({
  company: one(companies, {
    fields: [qualityActions.companyId],
    references: [companies.id],
  }),
  technician: one(users, {
    fields: [qualityActions.technicianId],
    references: [users.id],
    relationName: 'qualityActionTechnician',
  }),
  comeback: one(qualityComebacks, {
    fields: [qualityActions.comebackId],
    references: [qualityComebacks.id],
  }),
  createdBy: one(users, {
    fields: [qualityActions.createdByUserId],
    references: [users.id],
    relationName: 'qualityActionCreatedBy',
  }),
}));

export const commIntelRecordingsRelations = relations(commIntelRecordings, ({ one }) => ({
  company: one(companies, {
    fields: [commIntelRecordings.companyId],
    references: [companies.id],
  }),
  voiceSession: one(voiceSessions, {
    fields: [commIntelRecordings.voiceSessionId],
    references: [voiceSessions.id],
  }),
}));

export const commIntelCallIntelligenceRelations = relations(
  commIntelCallIntelligence,
  ({ one }) => ({
    company: one(companies, {
      fields: [commIntelCallIntelligence.companyId],
      references: [companies.id],
    }),
    voiceSession: one(voiceSessions, {
      fields: [commIntelCallIntelligence.voiceSessionId],
      references: [voiceSessions.id],
    }),
    customer: one(customers, {
      fields: [commIntelCallIntelligence.customerId],
      references: [customers.id],
    }),
    assignedStaff: one(users, {
      fields: [commIntelCallIntelligence.assignedStaffId],
      references: [users.id],
      relationName: 'commIntelAssignedStaff',
    }),
    recording: one(commIntelRecordings, {
      fields: [commIntelCallIntelligence.recordingId],
      references: [commIntelRecordings.id],
    }),
  }),
);

export const commIntelConversationInsightsRelations = relations(
  commIntelConversationInsights,
  ({ one }) => ({
    company: one(companies, {
      fields: [commIntelConversationInsights.companyId],
      references: [companies.id],
    }),
    customer: one(customers, {
      fields: [commIntelConversationInsights.customerId],
      references: [customers.id],
    }),
  }),
);

export const commIntelEmailThreadsRelations = relations(commIntelEmailThreads, ({ one }) => ({
  company: one(companies, {
    fields: [commIntelEmailThreads.companyId],
    references: [companies.id],
  }),
  customer: one(customers, {
    fields: [commIntelEmailThreads.customerId],
    references: [customers.id],
  }),
}));

export const commIntelSmsRecordsRelations = relations(commIntelSmsRecords, ({ one }) => ({
  company: one(companies, {
    fields: [commIntelSmsRecords.companyId],
    references: [companies.id],
  }),
  customer: one(customers, {
    fields: [commIntelSmsRecords.customerId],
    references: [customers.id],
  }),
}));

export const commIntelDraftActionsRelations = relations(commIntelDraftActions, ({ one }) => ({
  company: one(companies, {
    fields: [commIntelDraftActions.companyId],
    references: [companies.id],
  }),
  customer: one(customers, {
    fields: [commIntelDraftActions.customerId],
    references: [customers.id],
  }),
  createdBy: one(users, {
    fields: [commIntelDraftActions.createdByUserId],
    references: [users.id],
    relationName: 'commIntelDraftCreatedBy',
  }),
}));

export const assetEquipmentRelations = relations(assetEquipment, ({ one }) => ({
  company: one(companies, { fields: [assetEquipment.companyId], references: [companies.id] }),
  vehicle: one(vehicles, { fields: [assetEquipment.vehicleId], references: [vehicles.id] }),
  supplier: one(suppliers, { fields: [assetEquipment.supplierId], references: [suppliers.id] }),
  assignedTechnician: one(users, {
    fields: [assetEquipment.assignedTechnicianId],
    references: [users.id],
    relationName: 'assetAssignedTechnician',
  }),
  createdBy: one(users, {
    fields: [assetEquipment.createdByUserId],
    references: [users.id],
    relationName: 'assetCreatedBy',
  }),
}));

export const assetLifecycleEventsRelations = relations(assetLifecycleEvents, ({ one }) => ({
  company: one(companies, { fields: [assetLifecycleEvents.companyId], references: [companies.id] }),
  asset: one(assetEquipment, {
    fields: [assetLifecycleEvents.assetId],
    references: [assetEquipment.id],
  }),
  createdBy: one(users, {
    fields: [assetLifecycleEvents.createdByUserId],
    references: [users.id],
    relationName: 'assetLifecycleCreatedBy',
  }),
}));

export const assetMaintenanceSchedulesRelations = relations(
  assetMaintenanceSchedules,
  ({ one }) => ({
    company: one(companies, {
      fields: [assetMaintenanceSchedules.companyId],
      references: [companies.id],
    }),
    asset: one(assetEquipment, {
      fields: [assetMaintenanceSchedules.assetId],
      references: [assetEquipment.id],
    }),
  }),
);

export const assetMaintenanceRecordsRelations = relations(assetMaintenanceRecords, ({ one }) => ({
  company: one(companies, {
    fields: [assetMaintenanceRecords.companyId],
    references: [companies.id],
  }),
  asset: one(assetEquipment, {
    fields: [assetMaintenanceRecords.assetId],
    references: [assetEquipment.id],
  }),
  assignedTechnician: one(users, {
    fields: [assetMaintenanceRecords.assignedTechnicianId],
    references: [users.id],
    relationName: 'assetMaintenanceTechnician',
  }),
  job: one(jobs, { fields: [assetMaintenanceRecords.jobId], references: [jobs.id] }),
  createdBy: one(users, {
    fields: [assetMaintenanceRecords.createdByUserId],
    references: [users.id],
    relationName: 'assetMaintenanceCreatedBy',
  }),
}));

export const assetInspectionsRelations = relations(assetInspections, ({ one }) => ({
  company: one(companies, { fields: [assetInspections.companyId], references: [companies.id] }),
  asset: one(assetEquipment, {
    fields: [assetInspections.assetId],
    references: [assetEquipment.id],
  }),
  inspector: one(users, {
    fields: [assetInspections.inspectorUserId],
    references: [users.id],
    relationName: 'assetInspector',
  }),
}));

export const assetCalibrationsRelations = relations(assetCalibrations, ({ one }) => ({
  company: one(companies, { fields: [assetCalibrations.companyId], references: [companies.id] }),
  asset: one(assetEquipment, {
    fields: [assetCalibrations.assetId],
    references: [assetEquipment.id],
  }),
}));

export const assetMaintenanceCostsRelations = relations(assetMaintenanceCosts, ({ one }) => ({
  company: one(companies, {
    fields: [assetMaintenanceCosts.companyId],
    references: [companies.id],
  }),
  asset: one(assetEquipment, {
    fields: [assetMaintenanceCosts.assetId],
    references: [assetEquipment.id],
  }),
  maintenanceRecord: one(assetMaintenanceRecords, {
    fields: [assetMaintenanceCosts.maintenanceRecordId],
    references: [assetMaintenanceRecords.id],
  }),
}));

export const assetMaintenanceActionsRelations = relations(assetMaintenanceActions, ({ one }) => ({
  company: one(companies, {
    fields: [assetMaintenanceActions.companyId],
    references: [companies.id],
  }),
  asset: one(assetEquipment, {
    fields: [assetMaintenanceActions.assetId],
    references: [assetEquipment.id],
  }),
  createdBy: one(users, {
    fields: [assetMaintenanceActions.createdByUserId],
    references: [users.id],
    relationName: 'assetActionCreatedBy',
  }),
}));

export const aiProvidersRelations = relations(aiProviders, ({ one, many }) => ({
  company: one(companies, { fields: [aiProviders.companyId], references: [companies.id] }),
  createdBy: one(users, { fields: [aiProviders.createdByUserId], references: [users.id] }),
  models: many(aiModels),
}));

export const aiModelsRelations = relations(aiModels, ({ one }) => ({
  company: one(companies, { fields: [aiModels.companyId], references: [companies.id] }),
  provider: one(aiProviders, { fields: [aiModels.providerId], references: [aiProviders.id] }),
}));

export const aiRoutingRulesRelations = relations(aiRoutingRules, ({ one }) => ({
  company: one(companies, { fields: [aiRoutingRules.companyId], references: [companies.id] }),
  primaryProvider: one(aiProviders, {
    fields: [aiRoutingRules.primaryProviderId],
    references: [aiProviders.id],
  }),
  primaryModel: one(aiModels, {
    fields: [aiRoutingRules.primaryModelId],
    references: [aiModels.id],
  }),
}));

export const aiPromptTemplatesRelations = relations(aiPromptTemplates, ({ one, many }) => ({
  company: one(companies, { fields: [aiPromptTemplates.companyId], references: [companies.id] }),
  versions: many(aiPromptVersions),
}));

export const aiPromptVersionsRelations = relations(aiPromptVersions, ({ one }) => ({
  company: one(companies, { fields: [aiPromptVersions.companyId], references: [companies.id] }),
  template: one(aiPromptTemplates, {
    fields: [aiPromptVersions.templateId],
    references: [aiPromptTemplates.id],
  }),
  createdBy: one(users, { fields: [aiPromptVersions.createdByUserId], references: [users.id] }),
  approvedBy: one(users, { fields: [aiPromptVersions.approvedByUserId], references: [users.id] }),
}));

export const aiConfigurationActionsRelations = relations(aiConfigurationActions, ({ one }) => ({
  company: one(companies, {
    fields: [aiConfigurationActions.companyId],
    references: [companies.id],
  }),
  createdBy: one(users, {
    fields: [aiConfigurationActions.createdByUserId],
    references: [users.id],
  }),
}));

export const aiUsageRecordsRelations = relations(aiUsageRecords, ({ one }) => ({
  company: one(companies, { fields: [aiUsageRecords.companyId], references: [companies.id] }),
  provider: one(aiProviders, { fields: [aiUsageRecords.providerId], references: [aiProviders.id] }),
  model: one(aiModels, { fields: [aiUsageRecords.modelId], references: [aiModels.id] }),
  user: one(users, { fields: [aiUsageRecords.userId], references: [users.id] }),
}));

export const aiQualityEvaluationsRelations = relations(aiQualityEvaluations, ({ one }) => ({
  company: one(companies, { fields: [aiQualityEvaluations.companyId], references: [companies.id] }),
  provider: one(aiProviders, {
    fields: [aiQualityEvaluations.providerId],
    references: [aiProviders.id],
  }),
  model: one(aiModels, { fields: [aiQualityEvaluations.modelId], references: [aiModels.id] }),
}));

export const aiFeedbackRecordsRelations = relations(aiFeedbackRecords, ({ one }) => ({
  company: one(companies, { fields: [aiFeedbackRecords.companyId], references: [companies.id] }),
  user: one(users, { fields: [aiFeedbackRecords.userId], references: [users.id] }),
  provider: one(aiProviders, {
    fields: [aiFeedbackRecords.providerId],
    references: [aiProviders.id],
  }),
  model: one(aiModels, { fields: [aiFeedbackRecords.modelId], references: [aiModels.id] }),
}));

export const aiFailoverEventsRelations = relations(aiFailoverEvents, ({ one }) => ({
  company: one(companies, { fields: [aiFailoverEvents.companyId], references: [companies.id] }),
  fromProvider: one(aiProviders, {
    fields: [aiFailoverEvents.fromProviderId],
    references: [aiProviders.id],
    relationName: 'failoverFromProvider',
  }),
  toProvider: one(aiProviders, {
    fields: [aiFailoverEvents.toProviderId],
    references: [aiProviders.id],
    relationName: 'failoverToProvider',
  }),
}));

export const aiMemorySyncRecordsRelations = relations(aiMemorySyncRecords, ({ one }) => ({
  company: one(companies, { fields: [aiMemorySyncRecords.companyId], references: [companies.id] }),
  provider: one(aiProviders, {
    fields: [aiMemorySyncRecords.providerId],
    references: [aiProviders.id],
  }),
}));

export const dispatchReceptionistSummariesRelations = relations(
  dispatchReceptionistSummaries,
  ({ one }) => ({
    company: one(companies, {
      fields: [dispatchReceptionistSummaries.companyId],
      references: [companies.id],
    }),
    customer: one(customers, {
      fields: [dispatchReceptionistSummaries.customerId],
      references: [customers.id],
    }),
    createdBy: one(users, {
      fields: [dispatchReceptionistSummaries.createdByUserId],
      references: [users.id],
    }),
  }),
);

export const dispatchRoutingRecommendationsRelations = relations(
  dispatchRoutingRecommendations,
  ({ one }) => ({
    company: one(companies, {
      fields: [dispatchRoutingRecommendations.companyId],
      references: [companies.id],
    }),
    createdBy: one(users, {
      fields: [dispatchRoutingRecommendations.createdByUserId],
      references: [users.id],
    }),
  }),
);

export const dispatchCallbackRequestsRelations = relations(dispatchCallbackRequests, ({ one }) => ({
  company: one(companies, {
    fields: [dispatchCallbackRequests.companyId],
    references: [companies.id],
  }),
  customer: one(customers, {
    fields: [dispatchCallbackRequests.customerId],
    references: [customers.id],
  }),
  createdBy: one(users, {
    fields: [dispatchCallbackRequests.createdByUserId],
    references: [users.id],
  }),
}));

export const dispatchEmergencyAssessmentsRelations = relations(
  dispatchEmergencyAssessments,
  ({ one }) => ({
    company: one(companies, {
      fields: [dispatchEmergencyAssessments.companyId],
      references: [companies.id],
    }),
    job: one(jobs, { fields: [dispatchEmergencyAssessments.jobId], references: [jobs.id] }),
    createdBy: one(users, {
      fields: [dispatchEmergencyAssessments.createdByUserId],
      references: [users.id],
    }),
  }),
);

export const dispatchRecommendationsRelations = relations(dispatchRecommendations, ({ one }) => ({
  company: one(companies, {
    fields: [dispatchRecommendations.companyId],
    references: [companies.id],
  }),
  technician: one(users, {
    fields: [dispatchRecommendations.technicianId],
    references: [users.id],
  }),
  job: one(jobs, { fields: [dispatchRecommendations.jobId], references: [jobs.id] }),
}));

export const dispatchActionsRelations = relations(dispatchActions, ({ one }) => ({
  company: one(companies, { fields: [dispatchActions.companyId], references: [companies.id] }),
  technician: one(users, { fields: [dispatchActions.technicianId], references: [users.id] }),
  job: one(jobs, { fields: [dispatchActions.jobId], references: [jobs.id] }),
  callbackRequest: one(dispatchCallbackRequests, {
    fields: [dispatchActions.callbackRequestId],
    references: [dispatchCallbackRequests.id],
  }),
  createdBy: one(users, { fields: [dispatchActions.createdByUserId], references: [users.id] }),
}));

export const fleetMonthlyReportsRelations = relations(fleetMonthlyReports, ({ one }) => ({
  company: one(companies, { fields: [fleetMonthlyReports.companyId], references: [companies.id] }),
}));

export const fleetDriverBehaviourEventsRelations = relations(
  fleetDriverBehaviourEvents,
  ({ one }) => ({
    company: one(companies, {
      fields: [fleetDriverBehaviourEvents.companyId],
      references: [companies.id],
    }),
    vehicle: one(vehicles, {
      fields: [fleetDriverBehaviourEvents.vehicleId],
      references: [vehicles.id],
    }),
  }),
);

export const fleetOperatingCostsRelations = relations(fleetOperatingCosts, ({ one }) => ({
  company: one(companies, { fields: [fleetOperatingCosts.companyId], references: [companies.id] }),
  vehicle: one(vehicles, { fields: [fleetOperatingCosts.vehicleId], references: [vehicles.id] }),
  createdBy: one(users, { fields: [fleetOperatingCosts.createdByUserId], references: [users.id] }),
}));

export const fleetRecommendationsRelations = relations(fleetRecommendations, ({ one }) => ({
  company: one(companies, { fields: [fleetRecommendations.companyId], references: [companies.id] }),
  vehicle: one(vehicles, { fields: [fleetRecommendations.vehicleId], references: [vehicles.id] }),
}));

export const fleetActionsRelations = relations(fleetActions, ({ one }) => ({
  company: one(companies, { fields: [fleetActions.companyId], references: [companies.id] }),
  vehicle: one(vehicles, { fields: [fleetActions.vehicleId], references: [vehicles.id] }),
  createdBy: one(users, { fields: [fleetActions.createdByUserId], references: [users.id] }),
}));

export const personalCommAccountsRelations = relations(personalCommAccounts, ({ one, many }) => ({
  company: one(companies, { fields: [personalCommAccounts.companyId], references: [companies.id] }),
  whatsappConnection: one(whatsappConnections, {
    fields: [personalCommAccounts.whatsappConnectionId],
    references: [whatsappConnections.id],
  }),
  conversations: many(personalCommConversations),
}));

export const personalCommConversationsRelations = relations(
  personalCommConversations,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [personalCommConversations.companyId],
      references: [companies.id],
    }),
    account: one(personalCommAccounts, {
      fields: [personalCommConversations.accountId],
      references: [personalCommAccounts.id],
    }),
    customer: one(customers, {
      fields: [personalCommConversations.customerId],
      references: [customers.id],
    }),
    mediaItems: many(personalCommMediaItems),
    leadSignals: many(personalCommLeadSignals),
    followUps: many(personalCommFollowUps),
    actions: many(personalCommActions),
  }),
);

export const personalCommMediaItemsRelations = relations(personalCommMediaItems, ({ one }) => ({
  company: one(companies, {
    fields: [personalCommMediaItems.companyId],
    references: [companies.id],
  }),
  conversation: one(personalCommConversations, {
    fields: [personalCommMediaItems.conversationId],
    references: [personalCommConversations.id],
  }),
  whatsappMessage: one(whatsappMessages, {
    fields: [personalCommMediaItems.whatsappMessageId],
    references: [whatsappMessages.id],
  }),
}));

export const personalCommActionsRelations = relations(personalCommActions, ({ one }) => ({
  company: one(companies, { fields: [personalCommActions.companyId], references: [companies.id] }),
  conversation: one(personalCommConversations, {
    fields: [personalCommActions.conversationId],
    references: [personalCommConversations.id],
  }),
  createdBy: one(users, { fields: [personalCommActions.createdByUserId], references: [users.id] }),
}));

export const securityAuditLogsRelations = relations(securityAuditLogs, ({ one }) => ({
  company: one(companies, { fields: [securityAuditLogs.companyId], references: [companies.id] }),
  user: one(users, { fields: [securityAuditLogs.userId], references: [users.id] }),
}));

export const securityPermissionGrantsRelations = relations(securityPermissionGrants, ({ one }) => ({
  company: one(companies, {
    fields: [securityPermissionGrants.companyId],
    references: [companies.id],
  }),
  grantedTo: one(users, {
    fields: [securityPermissionGrants.grantedToUserId],
    references: [users.id],
  }),
  grantedBy: one(users, {
    fields: [securityPermissionGrants.grantedByUserId],
    references: [users.id],
  }),
}));

export const securityActionsRelations = relations(securityActions, ({ one }) => ({
  company: one(companies, { fields: [securityActions.companyId], references: [companies.id] }),
  createdBy: one(users, { fields: [securityActions.createdByUserId], references: [users.id] }),
}));

export const n8nConnectionsRelations = relations(n8nConnections, ({ one }) => ({
  company: one(companies, {
    fields: [n8nConnections.companyId],
    references: [companies.id],
  }),
}));

export const n8nWorkflowRegistrationsRelations = relations(
  n8nWorkflowRegistrations,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [n8nWorkflowRegistrations.companyId],
      references: [companies.id],
    }),
    nativeWorkflow: one(workflows, {
      fields: [n8nWorkflowRegistrations.nativeWorkflowId],
      references: [workflows.id],
    }),
    owner: one(users, {
      fields: [n8nWorkflowRegistrations.ownerUserId],
      references: [users.id],
    }),
    createdBy: one(users, {
      fields: [n8nWorkflowRegistrations.createdByUserId],
      references: [users.id],
    }),
    executions: many(n8nExecutions),
  }),
);

export const n8nExecutionsRelations = relations(n8nExecutions, ({ one }) => ({
  company: one(companies, {
    fields: [n8nExecutions.companyId],
    references: [companies.id],
  }),
  workflowRegistration: one(n8nWorkflowRegistrations, {
    fields: [n8nExecutions.workflowRegistrationId],
    references: [n8nWorkflowRegistrations.id],
  }),
  approvedBy: one(users, {
    fields: [n8nExecutions.approvedByUserId],
    references: [users.id],
  }),
  createdBy: one(users, {
    fields: [n8nExecutions.createdByUserId],
    references: [users.id],
  }),
}));

export const n8nCallbackReceiptsRelations = relations(n8nCallbackReceipts, ({ one }) => ({
  company: one(companies, {
    fields: [n8nCallbackReceipts.companyId],
    references: [companies.id],
  }),
  execution: one(n8nExecutions, {
    fields: [n8nCallbackReceipts.executionId],
    references: [n8nExecutions.id],
  }),
}));

export const n8nAuditEventsRelations = relations(n8nAuditEvents, ({ one }) => ({
  company: one(companies, {
    fields: [n8nAuditEvents.companyId],
    references: [companies.id],
  }),
  actor: one(users, {
    fields: [n8nAuditEvents.actorUserId],
    references: [users.id],
  }),
}));
