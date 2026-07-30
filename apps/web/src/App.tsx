import { Route, Switch } from 'wouter';
import { AuthProvider } from './lib/auth-context';
import { CompanyLocaleProvider } from './lib/company-locale-context';
import { ProtectedRoute } from './components/ProtectedRoute';
import { OwnerStaffRoute, TechnicianRoute } from './components/StaffExperienceRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PortalRouteShell } from './components/PortalRouteShell';
import { AppLayout } from './layouts/AppLayout';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { AuraPage } from './pages/aura/AuraPage';
import { CompanySettingsPage } from './pages/settings/CompanySettingsPage';
import { AboutSettingsPage } from './pages/settings/AboutSettingsPage';
import { TeamSettingsPage } from './pages/settings/TeamSettingsPage';
import { LoginPage } from './pages/auth/LoginPage';
import { SignupPage } from './pages/auth/SignupPage';
import { AcceptInvitePage } from './pages/auth/AcceptInvitePage';
import { CustomerListPage } from './pages/crm/CustomerListPage';
import { CustomerCreatePage } from './pages/crm/CustomerCreatePage';
import { CustomerDetailPage } from './pages/crm/CustomerDetailPage';
import { JobListPage } from './pages/jobs/JobListPage';
import { JobCreatePage } from './pages/jobs/JobCreatePage';
import { JobDetailPage } from './pages/jobs/JobDetailPage';
import { SchedulingPage } from './pages/scheduling/SchedulingPage';
import { QuoteListPage } from './pages/finance/QuoteListPage';
import { QuoteCreatePage } from './pages/finance/QuoteCreatePage';
import { InvoiceListPage } from './pages/finance/InvoiceListPage';
import { InvoiceCreatePage } from './pages/finance/InvoiceCreatePage';
import { PaymentListPage } from './pages/finance/PaymentListPage';
import { PaymentCreatePage } from './pages/finance/PaymentCreatePage';
import { ProductListPage } from './pages/inventory/ProductListPage';
import { ProductCreatePage } from './pages/inventory/ProductCreatePage';
import { StockOverviewPage } from './pages/inventory/StockOverviewPage';
import { VehicleListPage } from './pages/fleet/VehicleListPage';
import { VehicleCreatePage } from './pages/fleet/VehicleCreatePage';
import { VehicleDetailPage } from './pages/fleet/VehicleDetailPage';
import { CartrackSettingsPage } from './pages/settings/CartrackSettingsPage';
import { MessageListPage } from './pages/communications/MessageListPage';
import { MessageCreatePage } from './pages/communications/MessageCreatePage';
import { TemplateListPage } from './pages/communications/TemplateListPage';
import { TemplateCreatePage } from './pages/communications/TemplateCreatePage';
import { DocumentListPage } from './pages/documents/DocumentListPage';
import { DocumentCreatePage } from './pages/documents/DocumentCreatePage';
import { DocumentDetailPage } from './pages/documents/DocumentDetailPage';
import { CategoryListPage } from './pages/documents/CategoryListPage';
import { CategoryCreatePage } from './pages/documents/CategoryCreatePage';
import { WorkflowListPage } from './pages/automation/WorkflowListPage';
import { WorkflowCreatePage } from './pages/automation/WorkflowCreatePage';
import { WorkflowDetailPage } from './pages/automation/WorkflowDetailPage';
import { ExecutionListPage } from './pages/automation/ExecutionListPage';
import { AutomationStudioPage } from './pages/automation-studio/AutomationStudioPage';
import { DigitalTwinPage } from './pages/digital-twin/DigitalTwinPage';
import { KnowledgeGraphPage } from './pages/knowledge/KnowledgeGraphPage';
import { MissionControlPage } from './pages/mission-control/MissionControlPage';
import { EvolutionPage } from './pages/evolution/EvolutionPage';
import { DevelopersPage } from './pages/developers/DevelopersPage';
import { DeveloperPortalPage } from './pages/developer/DeveloperPortalPage';
import { SaasManagementPage } from './pages/saas-management/SaasManagementPage';
import { VoiceReceptionPage } from './pages/voice-reception/VoiceReceptionPage';
import { DocumentAiPage } from './pages/document-ai/DocumentAiPage';
import { BusinessContinuityPage } from './pages/business-continuity/BusinessContinuityPage';
import { GlobalSearchPage } from './pages/global-search/GlobalSearchPage';
import { DataMigrationPage } from './pages/data-migration/DataMigrationPage';
import { NotificationsPage } from './pages/notifications/NotificationsPage';
import { PlatformHealthPage } from './pages/platform-health/PlatformHealthPage';
import { LaunchCenterPage } from './pages/launch-center/LaunchCenterPage';
import { ReleaseCenterPage } from './pages/release-center/ReleaseCenterPage';
import { GoLivePage } from './pages/go-live/GoLivePage';
import { ReleasePage } from './pages/release/ReleasePage';
import { OwnerBillingPage } from './pages/settings/OwnerBillingPage';
import { PlatformPage } from './pages/platform/PlatformPage';
import { OperationsPage } from './pages/operations/OperationsPage';
import { MobilePlatformPage } from './pages/mobile-platform/MobilePlatformPage';
import { MobileDispatcherPage } from './pages/mobile-platform/MobileDispatcherPage';
import { CommunicationsHubPage } from './pages/communications-hub/CommunicationsHubPage';
import { CustomerExperiencePage } from './pages/customer-experience/CustomerExperiencePage';
import { AssetIntelligencePage } from './pages/asset-intelligence/AssetIntelligencePage';
import { WorkforceIntelligencePage } from './pages/workforce-intelligence/WorkforceIntelligencePage';
import { LegalCompliancePage } from './pages/legal-compliance/LegalCompliancePage';
import { FinancialPlanningPage } from './pages/financial-planning/FinancialPlanningPage';
import { SalesIntelligencePage } from './pages/sales-intelligence/SalesIntelligencePage';
import { MarketingIntelligencePage } from './pages/marketing-intelligence/MarketingIntelligencePage';
import { ServiceDeliveryPage } from './pages/service-delivery/ServiceDeliveryPage';
import { ItOperationsPage } from './pages/it-operations/ItOperationsPage';
import { BusinessEvolutionPage } from './pages/business-evolution/BusinessEvolutionPage';
import { AppBuilderPage } from './pages/app-builder/AppBuilderPage';
import { IndustryPacksPage } from './pages/industry-packs/IndustryPacksPage';
import { ManagerWorkspacePage } from './pages/workforce-intelligence/ManagerWorkspacePage';
import { SelfServicePage } from './pages/workforce-intelligence/SelfServicePage';
import { AgentDashboardPage } from './pages/agents/AgentDashboardPage';
import { AgentProfileCreatePage } from './pages/agents/AgentProfileCreatePage';
import { AgentProfileDetailPage } from './pages/agents/AgentProfileDetailPage';
import { AgentExecutionListPage } from './pages/agents/AgentExecutionListPage';
import { PortalGuestRoute, PortalProtectedRoute } from './components/PortalProtectedRoute';
import { PortalLayout } from './layouts/PortalLayout';
import { PortalLoginPage } from './pages/portal/PortalLoginPage';
import { PortalDashboardPage } from './pages/portal/PortalDashboardPage';
import { PortalJobsPage } from './pages/portal/PortalJobsPage';
import { PortalQuotesPage } from './pages/portal/PortalQuotesPage';
import { PortalFinancePage } from './pages/portal/PortalFinancePage';
import { PortalAppointmentsPage } from './pages/portal/PortalAppointmentsPage';
import { PortalCommunicationsPage } from './pages/portal/PortalCommunicationsPage';
import { PortalKnowledgePage } from './pages/portal/PortalKnowledgePage';
import { PortalNotificationsPage } from './pages/portal/PortalNotificationsPage';
import { PortalDocumentsPage } from './pages/portal/PortalDocumentsPage';
import { PortalProfilePage } from './pages/portal/PortalProfilePage';
import { PortalFeedbackPage } from './pages/portal/PortalFeedbackPage';
import { PortalLoyaltyPage } from './pages/portal/PortalLoyaltyPage';
import { PortalAssetsPage } from './pages/portal/PortalAssetsPage';
import { MobileLayout } from './layouts/MobileLayout';
import { MobileDashboardPage } from './pages/mobile/MobileDashboardPage';
import { MobileJobsPage } from './pages/mobile/MobileJobsPage';
import { MobileJobDetailPage } from './pages/mobile/MobileJobDetailPage';
import { MobileRoutePage } from './pages/mobile/MobileRoutePage';
import { MobileInventoryPage } from './pages/mobile/MobileInventoryPage';
import { MobileTimePage } from './pages/mobile/MobileTimePage';
import { MobileNotificationsPage } from './pages/mobile/MobileNotificationsPage';
import { MobileSyncPage } from './pages/mobile/MobileSyncPage';
import { PortalSettingsPage } from './pages/settings/PortalSettingsPage';
import { IntegrationsDashboardPage } from './pages/integrations/IntegrationsDashboardPage';
import { SyncJobListPage } from './pages/integrations/SyncJobListPage';
import { WebhookFoundationPage } from './pages/integrations/WebhookFoundationPage';
import { XeroSettingsPage } from './pages/integrations/XeroSettingsPage';
import { EmailSettingsPage } from './pages/integrations/EmailSettingsPage';
import { YocoSettingsPage } from './pages/integrations/YocoSettingsPage';
import { WhatsappSettingsPage } from './pages/integrations/WhatsappSettingsPage';
import { RecruitingPage } from './pages/recruiting/RecruitingPage';
import { AnalyticsPage } from './pages/analytics/AnalyticsPage';
import { QualityPage } from './pages/quality/QualityPage';
import { CommunicationsIntelligencePage } from './pages/communications-intelligence/CommunicationsIntelligencePage';
import { AssetEquipmentPage } from './pages/asset-equipment/AssetEquipmentPage';
import { AiOrchestrationPage } from './pages/ai-orchestration/AiOrchestrationPage';
import { DispatchIntelligencePage } from './pages/dispatch-intelligence/DispatchIntelligencePage';
import { FleetIntelligencePage } from './pages/fleet-intelligence/FleetIntelligencePage';
import { EnterpriseSecurityPage } from './pages/enterprise-security/EnterpriseSecurityPage';
import { PersonalCommunicationsIntelligencePage } from './pages/personal-communications-intelligence/PersonalCommunicationsIntelligencePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { DevErrorBoundaryTestPage } from './pages/dev/DevErrorBoundaryTestPage';

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Switch>
          <Route path="/auth/login" component={LoginPage} />
          <Route path="/auth/signup" component={SignupPage} />
          <Route path="/auth/accept-invite" component={AcceptInvitePage} />
          {import.meta.env.DEV ? (
            <Route path="/dev/error-boundary-test" component={DevErrorBoundaryTestPage} />
          ) : null}
          <Route path="/portal/login">
            <PortalRouteShell>
              <PortalGuestRoute>
                <PortalLoginPage />
              </PortalGuestRoute>
            </PortalRouteShell>
          </Route>
          <Route path="/portal" nest>
            <PortalRouteShell>
              <PortalProtectedRoute>
                <PortalLayout>
                  <Switch>
                    <Route path="/portal/jobs" component={PortalJobsPage} />
                    <Route path="/portal/quotes" component={PortalQuotesPage} />
                    <Route path="/portal/finance" component={PortalFinancePage} />
                    <Route path="/portal/appointments" component={PortalAppointmentsPage} />
                    <Route path="/portal/communications" component={PortalCommunicationsPage} />
                    <Route path="/portal/knowledge" component={PortalKnowledgePage} />
                    <Route path="/portal/notifications" component={PortalNotificationsPage} />
                    <Route path="/portal/documents" component={PortalDocumentsPage} />
                    <Route path="/portal/profile" component={PortalProfilePage} />
                    <Route path="/portal/feedback" component={PortalFeedbackPage} />
                    <Route path="/portal/loyalty" component={PortalLoyaltyPage} />
                    <Route path="/portal/assets" component={PortalAssetsPage} />
                    <Route path="/portal" component={PortalDashboardPage} />
                  </Switch>
                </PortalLayout>
              </PortalProtectedRoute>
            </PortalRouteShell>
          </Route>
          <Route path="/mobile" nest>
            <ProtectedRoute>
              <TechnicianRoute>
                <MobileLayout>
                  <Switch>
                    <Route path="/mobile/jobs/:jobId" component={MobileJobDetailPage} />
                    <Route path="/mobile/jobs" component={MobileJobsPage} />
                    <Route path="/mobile/route" component={MobileRoutePage} />
                    <Route path="/mobile/inventory" component={MobileInventoryPage} />
                    <Route path="/mobile/time" component={MobileTimePage} />
                    <Route path="/mobile/notifications" component={MobileNotificationsPage} />
                    <Route path="/mobile/sync" component={MobileSyncPage} />
                    <Route path="/mobile" component={MobileDashboardPage} />
                  </Switch>
                </MobileLayout>
              </TechnicianRoute>
            </ProtectedRoute>
          </Route>
          <Route path="/" nest>
            <ProtectedRoute>
              <OwnerStaffRoute>
                <CompanyLocaleProvider>
                  <AppLayout>
                    <Switch>
                      <Route path="/leads" component={SalesIntelligencePage} />
                      <Route path="/marketing" component={MarketingIntelligencePage} />
                      <Route path="/platform" component={PlatformPage} />
                      <Route path="/operations" component={OperationsPage} />
                      <Route path="/mobile-platform/dispatcher" component={MobileDispatcherPage} />
                      <Route path="/mobile-platform" component={MobilePlatformPage} />
                      <Route path="/communications-hub" component={CommunicationsHubPage} />
                      <Route path="/customer-experience" component={CustomerExperiencePage} />
                      <Route path="/asset-intelligence" component={AssetIntelligencePage} />
                      <Route path="/workforce-intelligence" component={WorkforceIntelligencePage} />
                      <Route path="/legal-compliance" component={LegalCompliancePage} />
                      <Route path="/financial-planning" component={FinancialPlanningPage} />
                      <Route path="/sales-intelligence" component={SalesIntelligencePage} />
                      <Route path="/marketing-intelligence" component={MarketingIntelligencePage} />
                      <Route path="/service-delivery" component={ServiceDeliveryPage} />
                      <Route path="/it-operations" component={ItOperationsPage} />
                      <Route path="/business-evolution" component={BusinessEvolutionPage} />
                      <Route path="/app-builder" component={AppBuilderPage} />
                      <Route path="/industry-packs" component={IndustryPacksPage} />
                      <Route path="/workforce/manager" component={ManagerWorkspacePage} />
                      <Route path="/workforce/self-service" component={SelfServicePage} />
                      <Route path="/developers" component={DevelopersPage} />
                      <Route path="/developer" component={DeveloperPortalPage} />
                      <Route path="/saas-management" component={SaasManagementPage} />
                      <Route path="/voice-reception" component={VoiceReceptionPage} />
                      <Route path="/document-ai" component={DocumentAiPage} />
                      <Route path="/business-continuity" component={BusinessContinuityPage} />
                      <Route path="/global-search" component={GlobalSearchPage} />
                      <Route path="/data-migration" component={DataMigrationPage} />
                      <Route path="/notifications" component={NotificationsPage} />
                      <Route path="/platform-health" component={PlatformHealthPage} />
                      <Route path="/launch-center" component={LaunchCenterPage} />
                      <Route path="/release-center" component={ReleaseCenterPage} />
                      <Route path="/go-live" component={GoLivePage} />
                      <Route path="/release" component={ReleasePage} />
                      <Route path="/settings/billing" component={OwnerBillingPage} />
                      <Route path="/evolution" component={EvolutionPage} />
                      <Route path="/mission-control" component={MissionControlPage} />
                      <Route path="/knowledge" component={KnowledgeGraphPage} />
                      <Route path="/digital-twin" component={DigitalTwinPage} />
                      <Route path="/automation-studio" component={AutomationStudioPage} />
                      <Route path="/automation/new" component={WorkflowCreatePage} />
                      <Route path="/automation/executions" component={ExecutionListPage} />
                      <Route path="/automation/:id" component={WorkflowDetailPage} />
                      <Route path="/automation" component={WorkflowListPage} />
                      <Route path="/documents/new" component={DocumentCreatePage} />
                      <Route path="/documents/categories/new" component={CategoryCreatePage} />
                      <Route path="/documents/categories" component={CategoryListPage} />
                      <Route path="/documents/:id" component={DocumentDetailPage} />
                      <Route path="/documents" component={DocumentListPage} />
                      <Route path="/communications/messages/new" component={MessageCreatePage} />
                      <Route path="/communications/messages" component={MessageListPage} />
                      <Route path="/communications/templates/new" component={TemplateCreatePage} />
                      <Route path="/communications/templates" component={TemplateListPage} />
                      <Route path="/fleet/new" component={VehicleCreatePage} />
                      <Route path="/fleet/:id" component={VehicleDetailPage} />
                      <Route path="/fleet" component={VehicleListPage} />
                      <Route path="/inventory/products/new" component={ProductCreatePage} />
                      <Route path="/inventory/products" component={ProductListPage} />
                      <Route path="/inventory/stock" component={StockOverviewPage} />
                      <Route path="/finance/quotes/new" component={QuoteCreatePage} />
                      <Route path="/finance/quotes" component={QuoteListPage} />
                      <Route path="/finance/invoices/new" component={InvoiceCreatePage} />
                      <Route path="/finance/invoices" component={InvoiceListPage} />
                      <Route path="/finance/payments/new" component={PaymentCreatePage} />
                      <Route path="/finance/payments" component={PaymentListPage} />
                      <Route path="/scheduling" component={SchedulingPage} />
                      <Route path="/jobs/new" component={JobCreatePage} />
                      <Route path="/jobs/:id" component={JobDetailPage} />
                      <Route path="/jobs" component={JobListPage} />
                      <Route path="/crm/new" component={CustomerCreatePage} />
                      <Route path="/crm/:id" component={CustomerDetailPage} />
                      <Route path="/crm" component={CustomerListPage} />
                      <Route path="/aura/agents/new" component={AgentProfileCreatePage} />
                      <Route path="/aura/agents/executions" component={AgentExecutionListPage} />
                      <Route path="/aura/agents/:id" component={AgentProfileDetailPage} />
                      <Route path="/aura/agents" component={AgentDashboardPage} />
                      <Route path="/aura" component={AuraPage} />
                      <Route path="/analytics" component={AnalyticsPage} />
                      <Route path="/quality" component={QualityPage} />
                      <Route
                        path="/communications-intelligence"
                        component={CommunicationsIntelligencePage}
                      />
                      <Route path="/asset-equipment" component={AssetEquipmentPage} />
                      <Route path="/ai-orchestration" component={AiOrchestrationPage} />
                      <Route path="/dispatch-intelligence" component={DispatchIntelligencePage} />
                      <Route path="/fleet-intelligence" component={FleetIntelligencePage} />
                      <Route path="/security" component={EnterpriseSecurityPage} />
                      <Route
                        path="/personal-communications-intelligence"
                        component={PersonalCommunicationsIntelligencePage}
                      />
                      <Route path="/recruiting" component={RecruitingPage} />
                      <Route path="/integrations/cartrack" component={CartrackSettingsPage} />
                      <Route path="/integrations/xero" component={XeroSettingsPage} />
                      <Route path="/integrations/email" component={EmailSettingsPage} />
                      <Route path="/integrations/yoco" component={YocoSettingsPage} />
                      <Route path="/integrations/whatsapp" component={WhatsappSettingsPage} />
                      <Route path="/integrations/sync-jobs" component={SyncJobListPage} />
                      <Route path="/integrations/webhooks" component={WebhookFoundationPage} />
                      <Route path="/integrations" component={IntegrationsDashboardPage} />
                      <Route path="/settings/cartrack" component={CartrackSettingsPage} />
                      <Route path="/settings/portal" component={PortalSettingsPage} />
                      <Route path="/settings/company" component={CompanySettingsPage} />
                      <Route path="/settings/about" component={AboutSettingsPage} />
                      <Route path="/settings/team" component={TeamSettingsPage} />
                      <Route path="/" component={DashboardPage} />
                      <Route path="/:rest*" component={NotFoundPage} />
                    </Switch>
                  </AppLayout>
                </CompanyLocaleProvider>
              </OwnerStaffRoute>
            </ProtectedRoute>
          </Route>
        </Switch>
      </AuthProvider>
    </ErrorBoundary>
  );
}
