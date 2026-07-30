const prefetched = new Set<string>();

const routeLoaders: Record<string, () => Promise<unknown>> = {
  '/': () => import('../pages/dashboard/DashboardPage'),
  '/crm': () => import('../pages/crm/CustomerListPage'),
  '/jobs': () => import('../pages/jobs/JobListPage'),
  '/scheduling': () => import('../pages/scheduling/SchedulingPage'),
  '/finance/quotes': () => import('../pages/finance/QuoteListPage'),
  '/finance/invoices': () => import('../pages/finance/InvoiceListPage'),
  '/finance/payments': () => import('../pages/finance/PaymentListPage'),
  '/leads': () => import('../pages/sales-intelligence/SalesIntelligencePage'),
  '/marketing': () => import('../pages/marketing-intelligence/MarketingIntelligencePage'),
  '/integrations': () => import('../pages/integrations/IntegrationsDashboardPage'),
  '/mission-control': () => import('../pages/mission-control/MissionControlPage'),
  '/security': () => import('../pages/enterprise-security/EnterpriseSecurityPage'),
  '/settings/company': () => import('../pages/settings/CompanySettingsPage'),
  '/aura': () => import('../pages/aura/AuraPage'),
};

export function prefetchOwnerRoute(href: string): void {
  const loader = routeLoaders[href];
  if (!loader || prefetched.has(href)) {
    return;
  }

  prefetched.add(href);
  void loader();
}
