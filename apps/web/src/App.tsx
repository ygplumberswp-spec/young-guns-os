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
import * as OwnerPages from './routes/owner-pages';
import { LoginPage } from './pages/auth/LoginPage';
import { SignupPage } from './pages/auth/SignupPage';
import { AcceptInvitePage } from './pages/auth/AcceptInvitePage';
import { PortalGuestRoute, PortalProtectedRoute } from './components/PortalProtectedRoute';
import { PortalLayout } from './layouts/PortalLayout';
import { PortalLoginPage } from './pages/portal/PortalLoginPage';
import { PortalAcceptInvitePage } from './pages/portal/PortalAcceptInvitePage';
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
import { DevErrorBoundaryTestPage } from './pages/dev/DevErrorBoundaryTestPage';

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <PreloadCoordinator />
        <Switch>
          <Route path="/auth/login" component={LoginPage} />
          <Route path="/auth/signup" component={SignupPage} />
          <Route path="/auth/accept-invite" component={AcceptInvitePage} />
          {import.meta.env.DEV ? (
            <Route path="/dev/error-boundary-test" component={DevErrorBoundaryTestPage} />
          ) : null}
          <Route path="/portal/accept-invite">
            <PortalRouteShell>
              <PortalAcceptInvitePage />
            </PortalRouteShell>
          </Route>
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
                    <Suspense fallback={<PageRouteSuspense />}>
                      <Switch>
                      <Route path="/leads" component={OwnerPages.SalesIntelligencePage} />
                      <Route path="/marketing" component={OwnerPages.MarketingIntelligencePage} />
                      <Route path="/platform" component={OwnerPages.PlatformPage} />
                      <Route path="/operations" component={OwnerPages.OperationsPage} />
                      <Route path="/mobile-platform/dispatcher" component={OwnerPages.MobileDispatcherPage} />
                      <Route path="/mobile-platform" component={OwnerPages.MobilePlatformPage} />
                      <Route path="/communications-hub" component={OwnerPages.CommunicationsHubPage} />
                      <Route path="/customer-experience" component={OwnerPages.CustomerExperiencePage} />
                      <Route path="/asset-intelligence" component={OwnerPages.AssetIntelligencePage} />
                      <Route path="/workforce-intelligence" component={OwnerPages.WorkforceIntelligencePage} />
                      <Route path="/legal-compliance" component={OwnerPages.LegalCompliancePage} />
                      <Route path="/financial-planning" component={OwnerPages.FinancialPlanningPage} />
                      <Route path="/sales-intelligence" component={OwnerPages.SalesIntelligencePage} />
                      <Route path="/marketing-intelligence" component={OwnerPages.MarketingIntelligencePage} />
                      <Route path="/service-delivery" component={OwnerPages.ServiceDeliveryPage} />
                      <Route path="/it-operations" component={OwnerPages.ItOperationsPage} />
                      <Route path="/business-evolution" component={OwnerPages.BusinessEvolutionPage} />
                      <Route path="/app-builder" component={OwnerPages.AppBuilderPage} />
                      <Route path="/industry-packs" component={OwnerPages.IndustryPacksPage} />
                      <Route path="/workforce/manager" component={OwnerPages.ManagerWorkspacePage} />
                      <Route path="/workforce/self-service" component={OwnerPages.SelfServicePage} />
                      <Route path="/developers" component={OwnerPages.DevelopersPage} />
                      <Route path="/developer" component={OwnerPages.DeveloperPortalPage} />
                      <Route path="/saas-management" component={OwnerPages.SaasManagementPage} />
                      <Route path="/voice-reception" component={OwnerPages.VoiceReceptionPage} />
                      <Route path="/document-ai" component={OwnerPages.DocumentAiPage} />
                      <Route path="/business-continuity" component={OwnerPages.BusinessContinuityPage} />
                      <Route path="/global-search" component={OwnerPages.GlobalSearchPage} />
                      <Route path="/data-migration" component={OwnerPages.DataMigrationPage} />
                      <Route path="/notifications" component={OwnerPages.NotificationsPage} />
                      <Route path="/platform-health" component={OwnerPages.PlatformHealthPage} />
                      <Route path="/launch-center" component={OwnerPages.LaunchCenterPage} />
                      <Route path="/release-center" component={OwnerPages.ReleaseCenterPage} />
                      <Route path="/go-live" component={OwnerPages.GoLivePage} />
                      <Route path="/release" component={OwnerPages.ReleasePage} />
                      <Route path="/settings/billing" component={OwnerPages.OwnerBillingPage} />
                      <Route path="/evolution" component={OwnerPages.EvolutionPage} />
                      <Route path="/mission-control" component={OwnerPages.MissionControlPage} />
                      <Route path="/knowledge" component={OwnerPages.KnowledgeGraphPage} />
                      <Route path="/digital-twin" component={OwnerPages.DigitalTwinPage} />
                      <Route path="/automation-studio" component={OwnerPages.AutomationStudioPage} />
                      <Route path="/automation/new" component={OwnerPages.WorkflowCreatePage} />
                      <Route path="/automation/executions" component={OwnerPages.ExecutionListPage} />
                      <Route path="/automation/:id" component={OwnerPages.WorkflowDetailPage} />
                      <Route path="/automation" component={OwnerPages.WorkflowListPage} />
                      <Route path="/documents/new" component={OwnerPages.DocumentCreatePage} />
                      <Route path="/documents/categories/new" component={OwnerPages.CategoryCreatePage} />
                      <Route path="/documents/categories" component={OwnerPages.CategoryListPage} />
                      <Route path="/documents/:id" component={OwnerPages.DocumentDetailPage} />
                      <Route path="/documents" component={OwnerPages.DocumentListPage} />
                      <Route path="/communications/messages/new" component={OwnerPages.MessageCreatePage} />
                      <Route path="/communications/messages" component={OwnerPages.MessageListPage} />
                      <Route path="/communications/templates/new" component={OwnerPages.TemplateCreatePage} />
                      <Route path="/communications/templates" component={OwnerPages.TemplateListPage} />
                      <Route path="/fleet/new" component={OwnerPages.VehicleCreatePage} />
                      <Route path="/fleet/:id" component={OwnerPages.VehicleDetailPage} />
                      <Route path="/fleet" component={OwnerPages.VehicleListPage} />
                      <Route path="/inventory/products/new" component={OwnerPages.ProductCreatePage} />
                      <Route path="/inventory/products" component={OwnerPages.ProductListPage} />
                      <Route path="/inventory/stock" component={OwnerPages.StockOverviewPage} />
                      <Route path="/finance/quotes/new" component={OwnerPages.QuoteCreatePage} />
                      <Route path="/finance/quotes" component={OwnerPages.QuoteListPage} />
                      <Route path="/finance/invoices/new" component={OwnerPages.InvoiceCreatePage} />
                      <Route path="/finance/invoices" component={OwnerPages.InvoiceListPage} />
                      <Route path="/finance/payments/new" component={OwnerPages.PaymentCreatePage} />
                      <Route path="/finance/payments" component={OwnerPages.PaymentListPage} />
                      <Route path="/scheduling" component={OwnerPages.SchedulingPage} />
                      <Route path="/jobs/new" component={OwnerPages.JobCreatePage} />
                      <Route path="/jobs/:id" component={OwnerPages.JobDetailPage} />
                      <Route path="/jobs" component={OwnerPages.JobListPage} />
                      <Route path="/crm/new" component={OwnerPages.CustomerCreatePage} />
                      <Route path="/crm/:id" component={OwnerPages.CustomerDetailPage} />
                      <Route path="/crm" component={OwnerPages.CustomerListPage} />
                      <Route path="/aura/capabilities/create" component={OwnerPages.CapabilityBuilderPage} />
                      <Route path="/aura/agents/new" component={OwnerPages.AgentProfileCreatePage} />
                      <Route path="/aura/agents/executions" component={OwnerPages.AgentExecutionListPage} />
                      <Route path="/aura/agents/:id" component={OwnerPages.AgentProfileDetailPage} />
                      <Route path="/aura/agents" component={OwnerPages.AgentDashboardPage} />
                      <Route path="/aura" component={OwnerPages.AuraPage} />
                      <Route path="/analytics" component={OwnerPages.AnalyticsPage} />
                      <Route path="/quality" component={OwnerPages.QualityPage} />
                      <Route
                        path="/communications-intelligence"
                        component={OwnerPages.CommunicationsIntelligencePage}
                      />
                      <Route path="/asset-equipment" component={OwnerPages.AssetEquipmentPage} />
                      <Route path="/ai-orchestration" component={OwnerPages.AiOrchestrationPage} />
                      <Route path="/dispatch-intelligence" component={OwnerPages.DispatchIntelligencePage} />
                      <Route path="/fleet-intelligence" component={OwnerPages.FleetIntelligencePage} />
                      <Route path="/security" component={OwnerPages.EnterpriseSecurityPage} />
                      <Route
                        path="/personal-communications-intelligence"
                        component={OwnerPages.PersonalCommunicationsIntelligencePage}
                      />
                      <Route path="/recruiting" component={OwnerPages.RecruitingPage} />
                      <Route path="/integrations/cartrack" component={OwnerPages.CartrackSettingsPage} />
                      <Route path="/integrations/xero" component={OwnerPages.XeroSettingsPage} />
                      <Route path="/integrations/email" component={OwnerPages.EmailSettingsPage} />
                      <Route path="/integrations/yoco" component={OwnerPages.YocoSettingsPage} />
                      <Route path="/integrations/whatsapp" component={OwnerPages.WhatsappSettingsPage} />
                      <Route path="/integrations/sync-jobs" component={OwnerPages.SyncJobListPage} />
                      <Route path="/integrations/webhooks" component={OwnerPages.WebhookFoundationPage} />
                      <Route path="/integrations" component={OwnerPages.IntegrationsDashboardPage} />
                      <Route path="/settings/cartrack" component={OwnerPages.CartrackSettingsPage} />
                      <Route path="/settings/portal" component={OwnerPages.PortalSettingsPage} />
                      <Route path="/settings/company" component={OwnerPages.CompanySettingsPage} />
                      <Route path="/settings/about" component={OwnerPages.AboutSettingsPage} />
                      <Route path="/settings/team" component={OwnerPages.TeamSettingsPage} />
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
      </AuthProvider>
    </ErrorBoundary>
  );
}
