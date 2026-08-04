import { Suspense } from 'react';
import { Route, Switch } from 'wouter';
import { AuthProvider } from './lib/auth-context';
import { PreloadCoordinator } from './components/PreloadCoordinator';
import { CompanyLocaleProvider } from './lib/company-locale-context';
import { ProtectedRoute } from './components/ProtectedRoute';
import { OwnerStaffRoute, TechnicianRoute } from './components/StaffExperienceRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PortalRouteShell } from './components/PortalRouteShell';
import { AppLayout } from './layouts/AppLayout';
import { PageRouteSuspense } from './components/PageRouteSuspense';
import { TitanNotificationsProvider } from './components/ux';
import { TitanNavigationHistoryProvider } from './hooks/useTitanNavigationHistory';
import * as OwnerPages from './routes/owner-pages';
import { LoginPage } from './pages/auth/LoginPage';
import { SignupPage } from './pages/auth/SignupPage';
import { AcceptInvitePage } from './pages/auth/AcceptInvitePage';
import {
  MfaChallengePage,
  PasswordRecoveryPage,
  SessionExpiredPage,
} from './pages/auth/AuthStatusPages';
import { PortalGuestRoute, PortalProtectedRoute } from './components/PortalProtectedRoute';
import { LegacyPortalRedirect } from './components/LegacyPortalRedirect';
import { PortalLayout } from './layouts/PortalLayout';
import { PortalLoginPage } from './pages/portal/PortalLoginPage';
import { PortalAcceptInvitePage } from './pages/portal/PortalAcceptInvitePage';
import { PortalDashboardPage } from './pages/portal/PortalDashboardPage';
import { PortalJobsPage } from './pages/portal/PortalJobsPage';
import { PortalJobDetailPage } from './pages/portal/PortalJobDetailPage';
import { PortalQuotesPage } from './pages/portal/PortalQuotesPage';
import { PortalQuoteDetailPage } from './pages/portal/PortalQuoteDetailPage';
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
import { PortalNotFoundPage } from './pages/portal/PortalNotFoundPage';
import { PortalHomeshieldPage } from './pages/portal/PortalHomeshieldPage';
import { MobileLayout } from './layouts/MobileLayout';
import { MobileDashboardPage } from './pages/mobile/MobileDashboardPage';
import { MobileJobsPage } from './pages/mobile/MobileJobsPage';
import { MobileJobDetailPage } from './pages/mobile/MobileJobDetailPage';
import { MobileRoutePage } from './pages/mobile/MobileRoutePage';
import { MobileInventoryPage } from './pages/mobile/MobileInventoryPage';
import { MobileTimePage } from './pages/mobile/MobileTimePage';
import { MobileNotificationsPage } from './pages/mobile/MobileNotificationsPage';
import { MobileSyncPage } from './pages/mobile/MobileSyncPage';
import { MobileSchedulePage } from './pages/mobile/MobileSchedulePage';
import { MobilePerformancePage } from './pages/mobile/MobilePerformancePage';
import { DevErrorBoundaryTestPage } from './pages/dev/DevErrorBoundaryTestPage';

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <TitanNotificationsProvider>
          <TitanNavigationHistoryProvider>
          <PreloadCoordinator />
          <Switch>
          <Route path="/auth/login" component={LoginPage} />
          <Route path="/auth/signup" component={SignupPage} />
          <Route path="/auth/accept-invite" component={AcceptInvitePage} />
          <Route path="/auth/recovery" component={PasswordRecoveryPage} />
          <Route path="/auth/mfa" component={MfaChallengePage} />
          <Route path="/auth/session-expired" component={SessionExpiredPage} />
          {import.meta.env.DEV ? (
            <Route path="/dev/error-boundary-test" component={DevErrorBoundaryTestPage} />
          ) : null}
          {/* Legacy `/portal/*` alias → canonical `/my/*` (POR-007). */}
          <Route path="/portal/accept-invite" component={LegacyPortalRedirect} />
          <Route path="/portal/login" component={LegacyPortalRedirect} />
          <Route path="/portal/:rest*" component={LegacyPortalRedirect} />
          <Route path="/portal" component={LegacyPortalRedirect} />
          <Route path="/my/accept-invite">
            <PortalRouteShell>
              <PortalAcceptInvitePage />
            </PortalRouteShell>
          </Route>
          <Route path="/my/login">
            <PortalRouteShell>
              <PortalGuestRoute>
                <PortalLoginPage />
              </PortalGuestRoute>
            </PortalRouteShell>
          </Route>
          <Route path="/my" nest>
            <PortalRouteShell>
              <PortalProtectedRoute>
                <PortalLayout>
                  {/* Nested paths are relative to `/my` (Wouter nest base). */}
                  <Switch>
                    <Route path="/jobs/:jobId" component={PortalJobDetailPage} />
                    <Route path="/jobs" component={PortalJobsPage} />
                    <Route path="/quotes/:quoteId" component={PortalQuoteDetailPage} />
                    <Route path="/quotes" component={PortalQuotesPage} />
                    <Route path="/finance" component={PortalFinancePage} />
                    <Route path="/appointments" component={PortalAppointmentsPage} />
                    <Route path="/communications" component={PortalCommunicationsPage} />
                    <Route path="/knowledge" component={PortalKnowledgePage} />
                    <Route path="/notifications" component={PortalNotificationsPage} />
                    <Route path="/documents" component={PortalDocumentsPage} />
                    <Route path="/profile" component={PortalProfilePage} />
                    <Route path="/feedback" component={PortalFeedbackPage} />
                    <Route path="/loyalty" component={PortalLoyaltyPage} />
                    <Route path="/assets" component={PortalAssetsPage} />
                    <Route path="/" component={PortalDashboardPage} />
                    <Route path="/homeshield" component={PortalHomeshieldPage} />
                    <Route path="/:rest*" component={PortalNotFoundPage} />
                  </Switch>
                </PortalLayout>
              </PortalProtectedRoute>
            </PortalRouteShell>
          </Route>
          <Route path="/mobile" nest>
            <ProtectedRoute>
              <TechnicianRoute>
                <MobileLayout>
                  {/* Nested paths are relative to `/mobile` (Wouter nest base). */}
                  <Switch>
                    <Route path="/jobs/:jobId" component={MobileJobDetailPage} />
                    <Route path="/jobs" component={MobileJobsPage} />
                    <Route path="/route" component={MobileRoutePage} />
                    <Route path="/inventory" component={MobileInventoryPage} />
                    <Route path="/time" component={MobileTimePage} />
                    <Route path="/performance" component={MobilePerformancePage} />
                    <Route path="/notifications" component={MobileNotificationsPage} />
                    <Route path="/schedule" component={MobileSchedulePage} />
                    <Route path="/sync" component={MobileSyncPage} />
                    <Route path="/" component={MobileDashboardPage} />
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
                    <Suspense fallback={<PageRouteSuspense />}>
                      <Switch>
                        <Route path="/leads/new" component={OwnerPages.LeadCreatePage} />
                        <Route path="/leads/:id" component={OwnerPages.LeadDetailPage} />
                        <Route path="/leads" component={OwnerPages.LeadListPage} />
                        <Route path="/marketing" component={OwnerPages.MarketingIntelligencePage} />
                        <Route path="/platform" component={OwnerPages.PlatformPage} />
                        <Route path="/operations" component={OwnerPages.OperationsPage} />
                        <Route
                          path="/mobile-platform/dispatcher"
                          component={OwnerPages.MobileDispatcherPage}
                        />
                        <Route path="/mobile-platform" component={OwnerPages.MobilePlatformPage} />
                        <Route
                          path="/communications-hub"
                          component={OwnerPages.CommunicationsHubPage}
                        />
                        <Route path="/email-centre" component={OwnerPages.EmailCentrePage} />
                        <Route
                          path="/communication-timeline"
                          component={OwnerPages.CommunicationTimelinePage}
                        />
                        <Route
                          path="/customer-experience"
                          component={OwnerPages.CustomerExperiencePage}
                        />
                        <Route
                          path="/asset-intelligence"
                          component={OwnerPages.AssetIntelligencePage}
                        />
                        <Route
                          path="/workforce-intelligence"
                          component={OwnerPages.WorkforceIntelligencePage}
                        />
                        <Route
                          path="/legal-compliance"
                          component={OwnerPages.LegalCompliancePage}
                        />
                        <Route
                          path="/financial-planning"
                          component={OwnerPages.FinancialPlanningPage}
                        />
                        <Route
                          path="/sales-intelligence"
                          component={OwnerPages.SalesIntelligencePage}
                        />
                        <Route
                          path="/marketing-intelligence"
                          component={OwnerPages.MarketingIntelligencePage}
                        />
                        <Route
                          path="/service-delivery"
                          component={OwnerPages.ServiceDeliveryPage}
                        />
                        <Route path="/it-operations" component={OwnerPages.ItOperationsPage} />
                        <Route
                          path="/business-evolution"
                          component={OwnerPages.BusinessEvolutionPage}
                        />
                        <Route path="/app-builder" component={OwnerPages.AppBuilderPage} />
                        <Route path="/industry-packs" component={OwnerPages.IndustryPacksPage} />
                        <Route
                          path="/workforce/manager"
                          component={OwnerPages.ManagerWorkspacePage}
                        />
                        <Route
                          path="/workforce/self-service"
                          component={OwnerPages.SelfServicePage}
                        />
                        <Route path="/developers" component={OwnerPages.DevelopersPage} />
                        <Route path="/developer" component={OwnerPages.DeveloperPortalPage} />
                        <Route path="/saas-management" component={OwnerPages.SaasManagementPage} />
                        <Route path="/voice-reception" component={OwnerPages.VoiceReceptionPage} />
                        <Route
                          path="/voice-ai-receptionist"
                          component={OwnerPages.VoiceAiReceptionistPage}
                        />
                        <Route
                          path="/call-intelligence"
                          component={OwnerPages.CallIntelligencePage}
                        />
                        <Route
                          path="/sales-intelligence-agent"
                          component={OwnerPages.SalesIntelligenceAgentPage}
                        />
                        <Route
                          path="/sales-followup-intelligence"
                          component={OwnerPages.SalesFollowupIntelligencePage}
                        />
                        <Route
                          path="/sales-analytics-intelligence"
                          component={OwnerPages.SalesAnalyticsIntelligencePage}
                        />
                        <Route
                          path="/customer-360-intelligence"
                          component={OwnerPages.Customer360IntelligencePage}
                        />
                        <Route
                          path="/property-intelligence"
                          component={OwnerPages.PropertyIntelligencePage}
                        />
                        <Route
                          path="/document-intelligence"
                          component={OwnerPages.DocumentIntelligencePage}
                        />
                        <Route
                          path="/compliance-intelligence"
                          component={OwnerPages.ComplianceIntelligencePage}
                        />
                        <Route
                          path="/executive-command-centre"
                          component={OwnerPages.ExecutiveCommandCentrePage}
                        />
                        <Route
                          path="/smart-notifications"
                          component={OwnerPages.SmartNotificationsPage}
                        />
                        <Route
                          path="/market-intelligence"
                          component={OwnerPages.MarketIntelligencePage}
                        />
                        <Route
                          path="/security-monitoring"
                          component={OwnerPages.SecurityMonitoringPage}
                        />
                        <Route
                          path="/industry-templates"
                          component={OwnerPages.IndustryTemplatesPage}
                        />
                        <Route path="/document-ai" component={OwnerPages.DocumentAiPage} />
                        <Route
                          path="/business-continuity"
                          component={OwnerPages.BusinessContinuityPage}
                        />
                        <Route path="/global-search" component={OwnerPages.GlobalSearchPage} />
                        <Route path="/data-migration" component={OwnerPages.DataMigrationPage} />
                        <Route path="/notifications" component={OwnerPages.NotificationsPage} />
                        <Route path="/platform-health" component={OwnerPages.PlatformHealthPage} />
                        <Route path="/launch-center" component={OwnerPages.LaunchCenterPage} />
                        <Route path="/release-center" component={OwnerPages.ReleaseCenterPage} />
                        <Route path="/go-live" component={OwnerPages.GoLivePage} />
                        <Route path="/release" component={OwnerPages.ReleasePage} />
                        <Route path="/settings" component={OwnerPages.SettingsIndexPage} />
                        <Route path="/settings/billing" component={OwnerPages.OwnerBillingPage} />
                        <Route
                          path="/settings/documents-records"
                          component={OwnerPages.DocumentsRecordsSettingsPage}
                        />
                        <Route
                          path="/settings/notifications"
                          component={OwnerPages.NotificationsSettingsPage}
                        />
                        <Route
                          path="/settings/advanced/data-protection"
                          component={OwnerPages.DataProtectionSettingsPage}
                        />
                        <Route path="/drafts" component={OwnerPages.DraftsPage} />
                        <Route path="/evolution" component={OwnerPages.EvolutionPage} />
                        <Route path="/mission-control" component={OwnerPages.MissionControlPage} />
                        <Route path="/knowledge" component={OwnerPages.KnowledgeGraphPage} />
                        <Route path="/digital-twin" component={OwnerPages.DigitalTwinPage} />
                        <Route
                          path="/automation-studio"
                          component={OwnerPages.AutomationStudioPage}
                        />
                        <Route path="/automation/new" component={OwnerPages.WorkflowCreatePage} />
                        <Route
                          path="/automation/executions"
                          component={OwnerPages.ExecutionListPage}
                        />
                        <Route path="/automation/n8n" component={OwnerPages.N8nOrchestrationPage} />
                        <Route path="/automation/:id" component={OwnerPages.WorkflowDetailPage} />
                        <Route path="/automation" component={OwnerPages.WorkflowListPage} />
                        <Route
                          path="/enterprise-modules"
                          component={OwnerPages.EnterpriseModulesPage}
                        />
                        <Route path="/documents/new" component={OwnerPages.DocumentCreatePage} />
                        <Route
                          path="/documents/categories/new"
                          component={OwnerPages.CategoryCreatePage}
                        />
                        <Route
                          path="/documents/categories"
                          component={OwnerPages.CategoryListPage}
                        />
                        <Route
                          path="/documents/job-packs/:id"
                          component={OwnerPages.JobPackDetailPage}
                        />
                        <Route
                          path="/documents/job-packs"
                          component={OwnerPages.JobPackListPage}
                        />
                        <Route
                          path="/documents/completion-reports/:id"
                          component={OwnerPages.CompletionReportDetailPage}
                        />
                        <Route
                          path="/documents/completion-reports"
                          component={OwnerPages.CompletionReportListPage}
                        />
                        <Route path="/documents/:id" component={OwnerPages.DocumentDetailPage} />
                        <Route path="/documents" component={OwnerPages.DocumentListPage} />
                        <Route
                          path="/communications/messages/new"
                          component={OwnerPages.MessageCreatePage}
                        />
                        <Route
                          path="/communications/messages"
                          component={OwnerPages.MessageListPage}
                        />
                        <Route
                          path="/communications/templates/new"
                          component={OwnerPages.TemplateCreatePage}
                        />
                        <Route
                          path="/communications/templates"
                          component={OwnerPages.TemplateListPage}
                        />
                        <Route path="/fleet/new" component={OwnerPages.VehicleCreatePage} />
                        <Route path="/fleet/:id" component={OwnerPages.VehicleDetailPage} />
                        <Route path="/fleet" component={OwnerPages.VehicleListPage} />
                        <Route
                          path="/inventory/products/new"
                          component={OwnerPages.ProductCreatePage}
                        />
                        <Route path="/inventory/products" component={OwnerPages.ProductListPage} />
                        <Route path="/inventory/stock" component={OwnerPages.StockOverviewPage} />
                        <Route
                          path="/inventory/movements"
                          component={OwnerPages.StockMovementsPage}
                        />
                        <Route
                          path="/procurement/purchase-orders/new"
                          component={OwnerPages.PurchaseOrderCreatePage}
                        />
                        <Route
                          path="/procurement/purchase-orders/:id"
                          component={OwnerPages.PurchaseOrderDetailPage}
                        />
                        <Route
                          path="/procurement/suppliers/:id"
                          component={OwnerPages.SupplierDetailPage}
                        />
                        <Route path="/procurement/suppliers" component={OwnerPages.SupplierListPage} />
                        <Route
                          path="/procurement/parts-requests"
                          component={OwnerPages.PartsRequestsPage}
                        />
                        <Route path="/procurement" component={OwnerPages.PurchaseOrderListPage} />
                        <Route path="/finance/quotes/new" component={OwnerPages.QuoteCreatePage} />
                        <Route path="/finance/quotes/:id/edit" component={OwnerPages.QuoteEditPage} />
                        <Route path="/finance/quotes/:id" component={OwnerPages.QuoteDetailPage} />
                        <Route path="/finance/quotes" component={OwnerPages.QuoteListPage} />
                        <Route path="/finance/boq/new" component={OwnerPages.BoqCreatePage} />
                        <Route path="/finance/boq/:id" component={OwnerPages.BoqDetailPage} />
                        <Route path="/finance/boq" component={OwnerPages.BoqListPage} />
                        <Route
                          path="/finance/invoices/new"
                          component={OwnerPages.InvoiceCreatePage}
                        />
                        <Route
                          path="/finance/invoices/:id"
                          component={OwnerPages.InvoiceDetailPage}
                        />
                        <Route path="/finance/invoices" component={OwnerPages.InvoiceListPage} />
                        <Route
                          path="/finance/payments/new"
                          component={OwnerPages.PaymentCreatePage}
                        />
                        <Route
                          path="/finance/payments/:id"
                          component={OwnerPages.PaymentDetailPage}
                        />
                        <Route path="/finance/payments" component={OwnerPages.PaymentListPage} />
                        <Route path="/scheduling" component={OwnerPages.SchedulingPage} />
                        <Route
                          path="/workforce/day-timeline"
                          component={OwnerPages.BusinessDayTimelinePage}
                        />
                        <Route path="/jobs/new" component={OwnerPages.JobCreatePage} />
                        <Route path="/jobs/:id" component={OwnerPages.JobDetailPage} />
                        <Route path="/jobs" component={OwnerPages.JobListPage} />
                        <Route path="/drafts" component={OwnerPages.DraftsPage} />
                        <Route path="/crm/new" component={OwnerPages.CustomerCreatePage} />
                        <Route
                          path="/crm/duplicates"
                          component={OwnerPages.CustomerDuplicateMergePage}
                        />
                        <Route path="/crm/:id" component={OwnerPages.CustomerDetailPage} />
                        <Route path="/crm" component={OwnerPages.CustomerListPage} />
                        <Route
                          path="/aura/capabilities/create"
                          component={OwnerPages.CapabilityBuilderPage}
                        />
                        <Route
                          path="/aura/agents/new"
                          component={OwnerPages.AgentProfileCreatePage}
                        />
                        <Route
                          path="/aura/agents/executions"
                          component={OwnerPages.AgentExecutionListPage}
                        />
                        <Route
                          path="/aura/agents/:id"
                          component={OwnerPages.AgentProfileDetailPage}
                        />
                        <Route path="/aura/agents" component={OwnerPages.AgentDashboardPage} />
                        <Route path="/aura/business-rules" component={OwnerPages.BusinessRulesPage} />
                        <Route path="/aura/todays-plan" component={OwnerPages.TodaysPlanPage} />
                        <Route
                          path="/aura/command-centre"
                          component={OwnerPages.AuraCommandCentrePage}
                        />
                        <Route
                          path="/aura-agent-network"
                          component={OwnerPages.AuraAgentNetworkPage}
                        />
                        <Route
                          path="/aura/evolution"
                          component={OwnerPages.AuraEvolutionPage}
                        />
                        <Route path="/aura" component={OwnerPages.AuraPage} />
                        <Route path="/analytics" component={OwnerPages.AnalyticsPage} />
                        <Route path="/quality" component={OwnerPages.QualityPage} />
                        <Route
                          path="/communications-intelligence"
                          component={OwnerPages.CommunicationsIntelligencePage}
                        />
                        <Route path="/asset-equipment" component={OwnerPages.AssetEquipmentPage} />
                        <Route
                          path="/ai-orchestration"
                          component={OwnerPages.AiOrchestrationPage}
                        />
                        <Route
                          path="/dispatch-intelligence"
                          component={OwnerPages.DispatchIntelligencePage}
                        />
                        <Route
                          path="/technician-intelligence"
                          component={OwnerPages.TechnicianIntelligencePage}
                        />
                        <Route
                          path="/payroll-timesheet-intelligence"
                          component={OwnerPages.PayrollTimesheetIntelligencePage}
                        />
                        <Route
                          path="/workflow-automation"
                          component={OwnerPages.WorkflowAutomationPage}
                        />
                        <Route
                          path="/recurring-maintenance"
                          component={OwnerPages.RecurringMaintenancePage}
                        />
                        <Route
                          path="/homeshield-experience"
                          component={OwnerPages.HomeshieldExperiencePage}
                        />
                        <Route
                          path="/customer-engagement-intelligence"
                          component={OwnerPages.CustomerEngagementIntelligencePage}
                        />
                        <Route
                          path="/fleet-intelligence"
                          component={OwnerPages.FleetIntelligencePage}
                        />
                        <Route
                          path="/vehicle-intelligence"
                          component={OwnerPages.VehicleIntelligencePage}
                        />
                        <Route
                          path="/fleet-ai-recommendations"
                          component={OwnerPages.FleetAiRecommendationsPage}
                        />
                        <Route
                          path="/driver-intelligence"
                          component={OwnerPages.DriverIntelligencePage}
                        />
                        <Route path="/security" component={OwnerPages.EnterpriseSecurityPage} />
                        <Route
                          path="/personal-communications-intelligence"
                          component={OwnerPages.PersonalCommunicationsIntelligencePage}
                        />
                        <Route
                          path="/personal-whatsapp-intelligence"
                          component={OwnerPages.PersonalWhatsappIntelligencePage}
                        />
                        <Route
                          path="/personal-whatsapp-connection"
                          component={OwnerPages.PersonalWhatsappConnectionPage}
                        />
                        <Route
                          path="/communication-aura-intelligence"
                          component={OwnerPages.CommunicationAuraIntelligencePage}
                        />
                        <Route
                          path="/communication-aura-intelligence"
                          component={OwnerPages.CommunicationAuraIntelligencePage}
                        />
                        <Route
                          path="/marketing-agent"
                          component={OwnerPages.MarketingAgentPage}
                        />
                        <Route
                          path="/finance-aura-agent"
                          component={OwnerPages.FinanceAuraAgentPage}
                        />
                        <Route
                          path="/finance-cashflow-profit"
                          component={OwnerPages.FinanceCashflowProfitPage}
                        />
                        <Route
                          path="/finance-reporting-forecast"
                          component={OwnerPages.FinanceReportingForecastPage}
                        />
                        <Route
                          path="/inventory-intelligence"
                          component={OwnerPages.InventoryIntelligencePage}
                        />
                        <Route
                          path="/hr-employee-intelligence"
                          component={OwnerPages.HrEmployeeIntelligencePage}
                        />
                        <Route
                          path="/recruitment-performance-intelligence"
                          component={OwnerPages.RecruitmentPerformanceIntelligencePage}
                        />
                        <Route
                          path="/procurement-intelligence"
                          component={OwnerPages.ProcurementIntelligencePage}
                        />
                          <Route
                          path="/stock-forecasting"
                          component={OwnerPages.StockForecastingPage}
                        />
                        <Route
                          path="/social-media-integrations"
                          component={OwnerPages.SocialMediaIntegrationsPage}
                        />
                        <Route
                          path="/content-reputation-intelligence"
                          component={OwnerPages.ContentReputationIntelligencePage}
                        />
                        <Route path="/recruiting" component={OwnerPages.RecruitingPage} />
                        <Route
                          path="/integrations/cartrack"
                          component={OwnerPages.CartrackSettingsPage}
                        />
                        <Route
                          path="/integrations/google-maps"
                          component={OwnerPages.GoogleMapsSettingsPage}
                        />
                        <Route
                          path="/integrations/google-calendar"
                          component={OwnerPages.GoogleCalendarSettingsPage}
                        />
                        <Route path="/integrations/xero" component={OwnerPages.XeroSettingsPage} />
                        <Route
                          path="/integrations/xero/write-approvals"
                          component={OwnerPages.XeroWriteApprovalsPage}
                        />
                        <Route
                          path="/integrations/email"
                          component={OwnerPages.EmailSettingsPage}
                        />
                        <Route
                          path="/integrations/resend"
                          component={OwnerPages.ResendSettingsPage}
                        />
                        <Route path="/integrations/yoco" component={OwnerPages.YocoSettingsPage} />
                        <Route
                          path="/integrations/whatsapp"
                          component={OwnerPages.WhatsappSettingsPage}
                        />
                        <Route
                          path="/integrations/sync-jobs"
                          component={OwnerPages.SyncJobListPage}
                        />
                        <Route
                          path="/integrations/webhooks"
                          component={OwnerPages.WebhookFoundationPage}
                        />
                        <Route
                          path="/integrations"
                          component={OwnerPages.IntegrationsDashboardPage}
                        />
                        <Route
                          path="/settings/cartrack"
                          component={OwnerPages.CartrackSettingsPage}
                        />
                        <Route path="/settings/portal" component={OwnerPages.PortalSettingsPage} />
                        <Route
                          path="/settings/company"
                          component={OwnerPages.CompanySettingsPage}
                        />
                        <Route path="/settings/about" component={OwnerPages.AboutSettingsPage} />
                        <Route path="/settings/team" component={OwnerPages.TeamSettingsPage} />
                        <Route
                          path="/settings/dashboard"
                          component={OwnerPages.DashboardSettingsPage}
                        />
                        <Route path="/settings/security" component={OwnerPages.SecuritySettingsPage} />
                        <Route path="/" component={OwnerPages.DashboardPage} />
                        <Route path="/:rest*" component={OwnerPages.NotFoundPage} />
                      </Switch>
                    </Suspense>
                  </AppLayout>
                </CompanyLocaleProvider>
              </OwnerStaffRoute>
            </ProtectedRoute>
          </Route>
        </Switch>
          </TitanNavigationHistoryProvider>
        </TitanNotificationsProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
