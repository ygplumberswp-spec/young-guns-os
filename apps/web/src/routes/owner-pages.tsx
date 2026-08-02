import { lazy, type ComponentType } from 'react';

function lazyNamed<T extends Record<string, ComponentType<any>>>(
  loader: () => Promise<T>,
  exportName: keyof T & string,
) {
  return lazy(() =>
    loader().then((module) => ({ default: module[exportName] as ComponentType<any> })),
  );
}

export const DashboardPage = lazyNamed(
  () => import('../pages/dashboard/DashboardPage'),
  'DashboardPage',
);
export const AuraPage = lazyNamed(() => import('../pages/aura/AuraPage'), 'AuraPage');
export const TodaysPlanPage = lazyNamed(
  () => import('../pages/aura/TodaysPlanPage'),
  'TodaysPlanPage',
);
export const BusinessRulesPage = lazyNamed(
  () => import('../pages/aura/BusinessRulesPage'),
  'BusinessRulesPage',
);
export const SettingsIndexPage = lazyNamed(
  () => import('../pages/settings/SettingsIndexPage'),
  'SettingsIndexPage',
);
export const CompanySettingsPage = lazyNamed(
  () => import('../pages/settings/CompanySettingsPage'),
  'CompanySettingsPage',
);
export const AboutSettingsPage = lazyNamed(
  () => import('../pages/settings/AboutSettingsPage'),
  'AboutSettingsPage',
);
export const TeamSettingsPage = lazyNamed(
  () => import('../pages/settings/TeamSettingsPage'),
  'TeamSettingsPage',
);
export const DashboardSettingsPage = lazyNamed(
  () => import('../pages/settings/DashboardSettingsPage'),
  'DashboardSettingsPage',
);
export const CustomerListPage = lazyNamed(
  () => import('../pages/crm/CustomerListPage'),
  'CustomerListPage',
);
export const CustomerCreatePage = lazyNamed(
  () => import('../pages/crm/CustomerCreatePage'),
  'CustomerCreatePage',
);
export const CustomerDetailPage = lazyNamed(
  () => import('../pages/crm/CustomerDetailPage'),
  'CustomerDetailPage',
);
export const CustomerDuplicateMergePage = lazyNamed(
  () => import('../pages/crm/CustomerDuplicateMergePage'),
  'CustomerDuplicateMergePage',
);
export const DraftsPage = lazyNamed(
  () => import('../pages/drafts/DraftsPage'),
  'DraftsPage',
);
export const JobListPage = lazyNamed(() => import('../pages/jobs/JobListPage'), 'JobListPage');
export const JobCreatePage = lazyNamed(
  () => import('../pages/jobs/JobCreatePage'),
  'JobCreatePage',
);
export const JobDetailPage = lazyNamed(
  () => import('../pages/jobs/JobDetailPage'),
  'JobDetailPage',
);
export const SchedulingPage = lazyNamed(
  () => import('../pages/scheduling/SchedulingPage'),
  'SchedulingPage',
);
export const BusinessDayTimelinePage = lazyNamed(
  () => import('../pages/workforce/BusinessDayTimelinePage'),
  'BusinessDayTimelinePage',
);
export const QuoteListPage = lazyNamed(
  () => import('../pages/finance/QuoteListPage'),
  'QuoteListPage',
);
export const QuoteCreatePage = lazyNamed(
  () => import('../pages/finance/QuoteCreatePage'),
  'QuoteCreatePage',
);
export const QuoteDetailPage = lazyNamed(
  () => import('../pages/finance/QuoteDetailPage'),
  'QuoteDetailPage',
);
export const QuoteEditPage = lazyNamed(
  () => import('../pages/finance/QuoteEditPage'),
  'QuoteEditPage',
);
export const BoqListPage = lazyNamed(() => import('../pages/finance/BoqListPage'), 'BoqListPage');
export const BoqCreatePage = lazyNamed(
  () => import('../pages/finance/BoqCreatePage'),
  'BoqCreatePage',
);
export const BoqDetailPage = lazyNamed(
  () => import('../pages/finance/BoqDetailPage'),
  'BoqDetailPage',
);
export const InvoiceListPage = lazyNamed(
  () => import('../pages/finance/InvoiceListPage'),
  'InvoiceListPage',
);
export const InvoiceCreatePage = lazyNamed(
  () => import('../pages/finance/InvoiceCreatePage'),
  'InvoiceCreatePage',
);
export const InvoiceDetailPage = lazyNamed(
  () => import('../pages/finance/InvoiceDetailPage'),
  'InvoiceDetailPage',
);
export const PaymentListPage = lazyNamed(
  () => import('../pages/finance/PaymentListPage'),
  'PaymentListPage',
);
export const PaymentCreatePage = lazyNamed(
  () => import('../pages/finance/PaymentCreatePage'),
  'PaymentCreatePage',
);
export const PaymentDetailPage = lazyNamed(
  () => import('../pages/finance/PaymentDetailPage'),
  'PaymentDetailPage',
);
export const ProductListPage = lazyNamed(
  () => import('../pages/inventory/ProductListPage'),
  'ProductListPage',
);
export const ProductCreatePage = lazyNamed(
  () => import('../pages/inventory/ProductCreatePage'),
  'ProductCreatePage',
);
export const StockOverviewPage = lazyNamed(
  () => import('../pages/inventory/StockOverviewPage'),
  'StockOverviewPage',
);
export const StockMovementsPage = lazyNamed(
  () => import('../pages/inventory/StockMovementsPage'),
  'StockMovementsPage',
);
export const SupplierListPage = lazyNamed(
  () => import('../pages/procurement/SupplierListPage'),
  'SupplierListPage',
);
export const SupplierDetailPage = lazyNamed(
  () => import('../pages/procurement/SupplierDetailPage'),
  'SupplierDetailPage',
);
export const PurchaseOrderListPage = lazyNamed(
  () => import('../pages/procurement/PurchaseOrderListPage'),
  'PurchaseOrderListPage',
);
export const PurchaseOrderCreatePage = lazyNamed(
  () => import('../pages/procurement/PurchaseOrderCreatePage'),
  'PurchaseOrderCreatePage',
);
export const PurchaseOrderDetailPage = lazyNamed(
  () => import('../pages/procurement/PurchaseOrderDetailPage'),
  'PurchaseOrderDetailPage',
);
export const PartsRequestsPage = lazyNamed(
  () => import('../pages/procurement/PartsRequestsPage'),
  'PartsRequestsPage',
);
export const VehicleListPage = lazyNamed(
  () => import('../pages/fleet/VehicleListPage'),
  'VehicleListPage',
);
export const VehicleCreatePage = lazyNamed(
  () => import('../pages/fleet/VehicleCreatePage'),
  'VehicleCreatePage',
);
export const VehicleDetailPage = lazyNamed(
  () => import('../pages/fleet/VehicleDetailPage'),
  'VehicleDetailPage',
);
export const MessageListPage = lazyNamed(
  () => import('../pages/communications/MessageListPage'),
  'MessageListPage',
);
export const MessageCreatePage = lazyNamed(
  () => import('../pages/communications/MessageCreatePage'),
  'MessageCreatePage',
);
export const TemplateListPage = lazyNamed(
  () => import('../pages/communications/TemplateListPage'),
  'TemplateListPage',
);
export const TemplateCreatePage = lazyNamed(
  () => import('../pages/communications/TemplateCreatePage'),
  'TemplateCreatePage',
);
export const DocumentListPage = lazyNamed(
  () => import('../pages/documents/DocumentListPage'),
  'DocumentListPage',
);
export const DocumentCreatePage = lazyNamed(
  () => import('../pages/documents/DocumentCreatePage'),
  'DocumentCreatePage',
);
export const DocumentDetailPage = lazyNamed(
  () => import('../pages/documents/DocumentDetailPage'),
  'DocumentDetailPage',
);
export const JobPackListPage = lazyNamed(
  () => import('../pages/documents/JobPackListPage'),
  'JobPackListPage',
);
export const JobPackDetailPage = lazyNamed(
  () => import('../pages/documents/JobPackDetailPage'),
  'JobPackDetailPage',
);
export const CategoryListPage = lazyNamed(
  () => import('../pages/documents/CategoryListPage'),
  'CategoryListPage',
);
export const CategoryCreatePage = lazyNamed(
  () => import('../pages/documents/CategoryCreatePage'),
  'CategoryCreatePage',
);
export const WorkflowListPage = lazyNamed(
  () => import('../pages/automation/WorkflowListPage'),
  'WorkflowListPage',
);
export const N8nOrchestrationPage = lazyNamed(
  () => import('../pages/automation/N8nOrchestrationPage'),
  'N8nOrchestrationPage',
);
export const EnterpriseModulesPage = lazyNamed(
  () => import('../pages/enterprise/EnterpriseModulesPage'),
  'EnterpriseModulesPage',
);
export const WorkflowCreatePage = lazyNamed(
  () => import('../pages/automation/WorkflowCreatePage'),
  'WorkflowCreatePage',
);
export const WorkflowDetailPage = lazyNamed(
  () => import('../pages/automation/WorkflowDetailPage'),
  'WorkflowDetailPage',
);
export const ExecutionListPage = lazyNamed(
  () => import('../pages/automation/ExecutionListPage'),
  'ExecutionListPage',
);
export const AutomationStudioPage = lazyNamed(
  () => import('../pages/automation-studio/AutomationStudioPage'),
  'AutomationStudioPage',
);
export const DigitalTwinPage = lazyNamed(
  () => import('../pages/digital-twin/DigitalTwinPage'),
  'DigitalTwinPage',
);
export const KnowledgeGraphPage = lazyNamed(
  () => import('../pages/knowledge/KnowledgeGraphPage'),
  'KnowledgeGraphPage',
);
export const MissionControlPage = lazyNamed(
  () => import('../pages/mission-control/MissionControlPage'),
  'MissionControlPage',
);
export const EvolutionPage = lazyNamed(
  () => import('../pages/evolution/EvolutionPage'),
  'EvolutionPage',
);
export const DevelopersPage = lazyNamed(
  () => import('../pages/developers/DevelopersPage'),
  'DevelopersPage',
);
export const DeveloperPortalPage = lazyNamed(
  () => import('../pages/developer/DeveloperPortalPage'),
  'DeveloperPortalPage',
);
export const SaasManagementPage = lazyNamed(
  () => import('../pages/saas-management/SaasManagementPage'),
  'SaasManagementPage',
);
export const VoiceReceptionPage = lazyNamed(
  () => import('../pages/voice-reception/VoiceReceptionPage'),
  'VoiceReceptionPage',
);
export const DocumentAiPage = lazyNamed(
  () => import('../pages/document-ai/DocumentAiPage'),
  'DocumentAiPage',
);
export const BusinessContinuityPage = lazyNamed(
  () => import('../pages/business-continuity/BusinessContinuityPage'),
  'BusinessContinuityPage',
);
export const GlobalSearchPage = lazyNamed(
  () => import('../pages/global-search/GlobalSearchPage'),
  'GlobalSearchPage',
);
export const DataMigrationPage = lazyNamed(
  () => import('../pages/data-migration/DataMigrationPage'),
  'DataMigrationPage',
);
export const NotificationsPage = lazyNamed(
  () => import('../pages/notifications/NotificationsPage'),
  'NotificationsPage',
);
export const PlatformHealthPage = lazyNamed(
  () => import('../pages/platform-health/PlatformHealthPage'),
  'PlatformHealthPage',
);
export const LaunchCenterPage = lazyNamed(
  () => import('../pages/launch-center/LaunchCenterPage'),
  'LaunchCenterPage',
);
export const ReleaseCenterPage = lazyNamed(
  () => import('../pages/release-center/ReleaseCenterPage'),
  'ReleaseCenterPage',
);
export const GoLivePage = lazyNamed(() => import('../pages/go-live/GoLivePage'), 'GoLivePage');
export const ReleasePage = lazyNamed(() => import('../pages/release/ReleasePage'), 'ReleasePage');
export const OwnerBillingPage = lazyNamed(
  () => import('../pages/settings/OwnerBillingPage'),
  'OwnerBillingPage',
);
export const PlatformPage = lazyNamed(
  () => import('../pages/platform/PlatformPage'),
  'PlatformPage',
);
export const OperationsPage = lazyNamed(
  () => import('../pages/operations/OperationsPage'),
  'OperationsPage',
);
export const MobilePlatformPage = lazyNamed(
  () => import('../pages/mobile-platform/MobilePlatformPage'),
  'MobilePlatformPage',
);
export const MobileDispatcherPage = lazyNamed(
  () => import('../pages/mobile-platform/MobileDispatcherPage'),
  'MobileDispatcherPage',
);
export const CommunicationsHubPage = lazyNamed(
  () => import('../pages/communications-hub/CommunicationsHubPage'),
  'CommunicationsHubPage',
);
export const CustomerExperiencePage = lazyNamed(
  () => import('../pages/customer-experience/CustomerExperiencePage'),
  'CustomerExperiencePage',
);
export const AssetIntelligencePage = lazyNamed(
  () => import('../pages/asset-intelligence/AssetIntelligencePage'),
  'AssetIntelligencePage',
);
export const WorkforceIntelligencePage = lazyNamed(
  () => import('../pages/workforce-intelligence/WorkforceIntelligencePage'),
  'WorkforceIntelligencePage',
);
export const LegalCompliancePage = lazyNamed(
  () => import('../pages/legal-compliance/LegalCompliancePage'),
  'LegalCompliancePage',
);
export const FinancialPlanningPage = lazyNamed(
  () => import('../pages/financial-planning/FinancialPlanningPage'),
  'FinancialPlanningPage',
);
export const SalesIntelligencePage = lazyNamed(
  () => import('../pages/sales-intelligence/SalesIntelligencePage'),
  'SalesIntelligencePage',
);
export const LeadListPage = lazyNamed(
  () => import('../pages/leads/LeadListPage'),
  'LeadListPage',
);
export const LeadCreatePage = lazyNamed(
  () => import('../pages/leads/LeadCreatePage'),
  'LeadCreatePage',
);
export const LeadDetailPage = lazyNamed(
  () => import('../pages/leads/LeadDetailPage'),
  'LeadDetailPage',
);
export const MarketingIntelligencePage = lazyNamed(
  () => import('../pages/marketing-intelligence/MarketingIntelligencePage'),
  'MarketingIntelligencePage',
);
export const ServiceDeliveryPage = lazyNamed(
  () => import('../pages/service-delivery/ServiceDeliveryPage'),
  'ServiceDeliveryPage',
);
export const ItOperationsPage = lazyNamed(
  () => import('../pages/it-operations/ItOperationsPage'),
  'ItOperationsPage',
);
export const BusinessEvolutionPage = lazyNamed(
  () => import('../pages/business-evolution/BusinessEvolutionPage'),
  'BusinessEvolutionPage',
);
export const AppBuilderPage = lazyNamed(
  () => import('../pages/app-builder/AppBuilderPage'),
  'AppBuilderPage',
);
export const IndustryPacksPage = lazyNamed(
  () => import('../pages/industry-packs/IndustryPacksPage'),
  'IndustryPacksPage',
);
export const ManagerWorkspacePage = lazyNamed(
  () => import('../pages/workforce-intelligence/ManagerWorkspacePage'),
  'ManagerWorkspacePage',
);
export const SelfServicePage = lazyNamed(
  () => import('../pages/workforce-intelligence/SelfServicePage'),
  'SelfServicePage',
);
export const AgentDashboardPage = lazyNamed(
  () => import('../pages/agents/AgentDashboardPage'),
  'AgentDashboardPage',
);
export const CapabilityBuilderPage = lazyNamed(
  () => import('../pages/agents/CapabilityBuilderPage'),
  'CapabilityBuilderPage',
);
export const AgentProfileCreatePage = lazyNamed(
  () => import('../pages/agents/AgentProfileCreatePage'),
  'AgentProfileCreatePage',
);
export const AgentProfileDetailPage = lazyNamed(
  () => import('../pages/agents/AgentProfileDetailPage'),
  'AgentProfileDetailPage',
);
export const AgentExecutionListPage = lazyNamed(
  () => import('../pages/agents/AgentExecutionListPage'),
  'AgentExecutionListPage',
);
export const IntegrationsDashboardPage = lazyNamed(
  () => import('../pages/integrations/IntegrationsDashboardPage'),
  'IntegrationsDashboardPage',
);
export const SyncJobListPage = lazyNamed(
  () => import('../pages/integrations/SyncJobListPage'),
  'SyncJobListPage',
);
export const WebhookFoundationPage = lazyNamed(
  () => import('../pages/integrations/WebhookFoundationPage'),
  'WebhookFoundationPage',
);
export const XeroSettingsPage = lazyNamed(
  () => import('../pages/integrations/XeroSettingsPage'),
  'XeroSettingsPage',
);
export const XeroWriteApprovalsPage = lazyNamed(
  () => import('../pages/integrations/XeroWriteApprovalsPage'),
  'XeroWriteApprovalsPage',
);
export const EmailSettingsPage = lazyNamed(
  () => import('../pages/integrations/EmailSettingsPage'),
  'EmailSettingsPage',
);
export const YocoSettingsPage = lazyNamed(
  () => import('../pages/integrations/YocoSettingsPage'),
  'YocoSettingsPage',
);
export const WhatsappSettingsPage = lazyNamed(
  () => import('../pages/integrations/WhatsappSettingsPage'),
  'WhatsappSettingsPage',
);
export const RecruitingPage = lazyNamed(
  () => import('../pages/recruiting/RecruitingPage'),
  'RecruitingPage',
);
export const AnalyticsPage = lazyNamed(
  () => import('../pages/analytics/AnalyticsPage'),
  'AnalyticsPage',
);
export const QualityPage = lazyNamed(() => import('../pages/quality/QualityPage'), 'QualityPage');
export const CommunicationsIntelligencePage = lazyNamed(
  () => import('../pages/communications-intelligence/CommunicationsIntelligencePage'),
  'CommunicationsIntelligencePage',
);
export const AssetEquipmentPage = lazyNamed(
  () => import('../pages/asset-equipment/AssetEquipmentPage'),
  'AssetEquipmentPage',
);
export const AiOrchestrationPage = lazyNamed(
  () => import('../pages/ai-orchestration/AiOrchestrationPage'),
  'AiOrchestrationPage',
);
export const DispatchIntelligencePage = lazyNamed(
  () => import('../pages/dispatch-intelligence/DispatchIntelligencePage'),
  'DispatchIntelligencePage',
);
export const FleetIntelligencePage = lazyNamed(
  () => import('../pages/fleet-intelligence/FleetIntelligencePage'),
  'FleetIntelligencePage',
);
export const EnterpriseSecurityPage = lazyNamed(
  () => import('../pages/enterprise-security/EnterpriseSecurityPage'),
  'EnterpriseSecurityPage',
);
export const PersonalCommunicationsIntelligencePage = lazyNamed(
  () =>
    import('../pages/personal-communications-intelligence/PersonalCommunicationsIntelligencePage'),
  'PersonalCommunicationsIntelligencePage',
);
export const NotFoundPage = lazyNamed(() => import('../pages/NotFoundPage'), 'NotFoundPage');
export const CartrackSettingsPage = lazyNamed(
  () => import('../pages/settings/CartrackSettingsPage'),
  'CartrackSettingsPage',
);
export const GoogleMapsSettingsPage = lazyNamed(
  () => import('../pages/integrations/GoogleMapsSettingsPage'),
  'GoogleMapsSettingsPage',
);
export const PortalSettingsPage = lazyNamed(
  () => import('../pages/settings/PortalSettingsPage'),
  'PortalSettingsPage',
);
export const SecuritySettingsPage = lazyNamed(
  () => import('../pages/settings/SecuritySettingsPage'),
  'SecuritySettingsPage',
);
export const DocumentsRecordsSettingsPage = lazyNamed(
  () => import('../pages/settings/DocumentsRecordsSettingsPage'),
  'DocumentsRecordsSettingsPage',
);
export const NotificationsSettingsPage = lazyNamed(
  () => import('../pages/settings/NotificationsSettingsPage'),
  'NotificationsSettingsPage',
);
export const DataProtectionSettingsPage = lazyNamed(
  () => import('../pages/settings/DataProtectionSettingsPage'),
  'DataProtectionSettingsPage',
);
