import { useEffect, useMemo } from 'react';
import { Link } from 'wouter';
import { LoadingState, StatCard } from '@titan/ui';
import { hasAnyPermission } from '@titan/auth/browser';
import { fetchCrmStats } from '../../lib/crm-api';
import { fetchFinanceStats } from '../../lib/finance-api';
import { fetchJobsStats } from '../../lib/jobs-api';
import { fetchInventoryStats } from '../../lib/inventory-api';
import { fetchFleetStats } from '../../lib/fleet-api';
import { fetchLeadStats } from '../../lib/leads-api';
import { useAuth } from '../../lib/auth-context';
import { useCompanyLocale } from '../../lib/company-locale-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { useStaffPreloadContext } from '../../lib/preload-coordinator';
import { scheduleDashboardBackgroundPrep } from '../../lib/route-prefetch-registry';
import { DASHBOARD_METRICS } from './constants';
import { DashboardMetricIcon } from './DashboardMetricIcon';
import { DashboardWelcome } from './DashboardWelcome';

export function DashboardStats() {
  const { accessToken, user } = useAuth();
  const { formatMoney, currency: companyCurrency } = useCompanyLocale();

  const canViewCustomers = useMemo(
    () =>
      user ? hasAnyPermission(user.permissions, ['customers:read', 'customers:write']) : false,
    [user],
  );
  const canViewJobs = useMemo(
    () => (user ? hasAnyPermission(user.permissions, ['jobs:read', 'jobs:write']) : false),
    [user],
  );
  const canViewFinance = useMemo(
    () => (user ? hasAnyPermission(user.permissions, ['finance:read', 'finance:write']) : false),
    [user],
  );
  const canViewInventory = useMemo(
    () =>
      user ? hasAnyPermission(user.permissions, ['inventory:read', 'inventory:write']) : false,
    [user],
  );
  const canViewFleet = useMemo(
    () => (user ? hasAnyPermission(user.permissions, ['fleet:read', 'fleet:write']) : false),
    [user],
  );
  const canViewLeads = useMemo(
    () => (user ? hasAnyPermission(user.permissions, ['leads:read', 'leads:write']) : false),
    [user],
  );

  const crmStats = useStaffCachedQuery({
    queryKey: 'crm/stats',
    enabled: Boolean(accessToken && canViewCustomers),
    fetcher: async () => fetchCrmStats(accessToken!),
  });
  const jobsStats = useStaffCachedQuery({
    queryKey: 'jobs/stats',
    enabled: Boolean(accessToken && canViewJobs),
    fetcher: async () => fetchJobsStats(accessToken!),
  });
  const financeStats = useStaffCachedQuery({
    queryKey: 'finance/stats',
    enabled: Boolean(accessToken && canViewFinance),
    fetcher: async () => fetchFinanceStats(accessToken!),
  });
  const inventoryStats = useStaffCachedQuery({
    queryKey: 'inventory/stats',
    enabled: Boolean(accessToken && canViewInventory),
    fetcher: async () => fetchInventoryStats(accessToken!),
  });
  const fleetStats = useStaffCachedQuery({
    queryKey: 'fleet/stats',
    enabled: Boolean(accessToken && canViewFleet),
    fetcher: async () => fetchFleetStats(accessToken!),
  });
  const leadStats = useStaffCachedQuery({
    queryKey: 'leads/stats',
    enabled: Boolean(accessToken && canViewLeads),
    fetcher: async () => fetchLeadStats(accessToken!),
  });

  const preloadContext = useStaffPreloadContext();
  const metricsReady =
    (!canViewCustomers || crmStats.data !== undefined) &&
    (!canViewJobs || jobsStats.data !== undefined) &&
    (!canViewFinance || financeStats.data !== undefined);

  useEffect(() => {
    if (!preloadContext || preloadContext.kind !== 'staff' || !metricsReady) {
      return;
    }
    scheduleDashboardBackgroundPrep(preloadContext);
  }, [preloadContext, metricsReady]);

  const isLoading =
    (canViewCustomers && crmStats.isLoading && !crmStats.data) ||
    (canViewJobs && jobsStats.isLoading && !jobsStats.data) ||
    (canViewFinance && financeStats.isLoading && !financeStats.data);

  const customerCount = crmStats.data?.customerCount ?? 0;
  const activeJobs = jobsStats.data?.activeCount ?? 0;
  const jobsToday = jobsStats.data?.todayScheduledCount ?? 0;
  const openQuotes = financeStats.data?.openQuoteCount ?? 0;
  const revenue = financeStats.data?.revenueMtdCents ?? 0;
  const outstanding = financeStats.data?.outstandingCents ?? 0;
  const overdueInvoices = financeStats.data?.overdueInvoiceCount ?? 0;
  const stockAlerts = inventoryStats.data?.lowStockCount ?? 0;
  const fleetInUse = fleetStats.data?.inUseCount ?? 0;
  const activeLeads = leadStats.data?.activeLeadCount ?? 0;

  const hasAnyData =
    customerCount > 0 ||
    activeJobs > 0 ||
    jobsToday > 0 ||
    openQuotes > 0 ||
    revenue > 0 ||
    outstanding > 0 ||
    overdueInvoices > 0 ||
    stockAlerts > 0 ||
    fleetInUse > 0 ||
    activeLeads > 0;

  const summaryLine = hasAnyData
    ? `${jobsToday} job(s) today · ${activeJobs} active · ${formatMoney(outstanding, financeStats.data?.currency ?? companyCurrency)} outstanding`
    : null;

  const metrics = DASHBOARD_METRICS.map((metric) => {
    if (metric.id === 'customers') {
      return {
        ...metric,
        value: canViewCustomers ? String(customerCount) : '—',
        hint: canViewCustomers ? metric.hint : 'No CRM permission',
        loading: canViewCustomers && crmStats.isLoading && !crmStats.data,
        visible: true,
      };
    }
    if (metric.id === 'active-jobs') {
      return {
        ...metric,
        value: canViewJobs ? String(activeJobs) : '—',
        hint: canViewJobs ? metric.hint : 'No jobs permission',
        loading: canViewJobs && jobsStats.isLoading && !jobsStats.data,
        visible: true,
      };
    }
    if (metric.id === 'jobs-today') {
      return {
        ...metric,
        value: canViewJobs ? String(jobsToday) : '—',
        hint: canViewJobs ? metric.hint : 'No jobs permission',
        loading: canViewJobs && jobsStats.isLoading && !jobsStats.data,
        visible: canViewJobs,
      };
    }
    if (metric.id === 'open-quotes') {
      return {
        ...metric,
        value: canViewFinance ? String(openQuotes) : '—',
        hint: canViewFinance ? metric.hint : 'No finance permission',
        loading: canViewFinance && financeStats.isLoading && !financeStats.data,
        visible: canViewFinance,
      };
    }
    if (metric.id === 'revenue') {
      return {
        ...metric,
        value: canViewFinance
          ? formatMoney(revenue, financeStats.data?.currency ?? companyCurrency)
          : '—',
        hint: canViewFinance ? metric.hint : 'No finance permission',
        loading: canViewFinance && financeStats.isLoading && !financeStats.data,
        visible: canViewFinance,
      };
    }
    if (metric.id === 'outstanding') {
      return {
        ...metric,
        value: canViewFinance
          ? formatMoney(outstanding, financeStats.data?.currency ?? companyCurrency)
          : '—',
        hint: canViewFinance ? metric.hint : 'No finance permission',
        loading: canViewFinance && financeStats.isLoading && !financeStats.data,
        visible: canViewFinance,
      };
    }
    if (metric.id === 'overdue-invoices') {
      return {
        ...metric,
        value: canViewFinance ? String(overdueInvoices) : '—',
        hint: canViewFinance ? metric.hint : 'No finance permission',
        loading: canViewFinance && financeStats.isLoading && !financeStats.data,
        visible: canViewFinance,
      };
    }
    if (metric.id === 'stock-alerts') {
      return {
        ...metric,
        value: canViewInventory ? String(stockAlerts) : '—',
        hint: canViewInventory ? metric.hint : 'No inventory permission',
        loading: canViewInventory && inventoryStats.isLoading && !inventoryStats.data,
        visible: canViewInventory,
      };
    }
    if (metric.id === 'fleet') {
      return {
        ...metric,
        value: canViewFleet ? String(fleetInUse) : '—',
        hint: canViewFleet ? metric.hint : 'No fleet permission',
        loading: canViewFleet && fleetStats.isLoading && !fleetStats.data,
        visible: canViewFleet,
      };
    }
    if (metric.id === 'leads') {
      return {
        ...metric,
        value: canViewLeads ? String(activeLeads) : '—',
        hint: canViewLeads ? metric.hint : 'No leads permission',
        loading: canViewLeads && leadStats.isLoading && !leadStats.data,
        visible: canViewLeads,
      };
    }
    return { ...metric, loading: false, visible: false };
  }).filter((metric) => metric.visible);

  return (
    <>
      <DashboardWelcome
        isLoading={isLoading}
        hasAnyData={hasAnyData}
        summaryLine={summaryLine}
      />
      <section className="dashboard-stats" aria-label="Business metrics">
        {metrics.map((metric) => (
          <div key={metric.id} className="dashboard-stat-card">
            {metric.loading ? (
              <LoadingState label={`Loading ${metric.label.toLowerCase()}…`} />
            ) : metric.href ? (
              <Link href={metric.href} className="dashboard-stat-card__link">
                <StatCard
                  label={metric.label}
                  value={metric.value}
                  hint={metric.hint}
                  icon={<DashboardMetricIcon metricId={metric.id} />}
                />
              </Link>
            ) : (
              <StatCard
                label={metric.label}
                value={metric.value}
                hint={metric.hint}
                icon={<DashboardMetricIcon metricId={metric.id} />}
              />
            )}
          </div>
        ))}
      </section>
    </>
  );
}
