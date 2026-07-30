import { useEffect, useMemo } from 'react';
import { LoadingState, StatCard } from '@titan/ui';
import { hasAnyPermission } from '@titan/auth/browser';
import { fetchCrmStats } from '../../lib/crm-api';
import { fetchFinanceStats } from '../../lib/finance-api';
import { fetchJobsStats } from '../../lib/jobs-api';
import { useAuth } from '../../lib/auth-context';
import { useCompanyLocale } from '../../lib/company-locale-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { useStaffPreloadContext } from '../../lib/preload-coordinator';
import { scheduleDashboardBackgroundPrep } from '../../lib/route-prefetch-registry';
import { DASHBOARD_METRICS } from './constants';
import { DashboardMetricIcon } from './DashboardMetricIcon';

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

  const metrics = DASHBOARD_METRICS.map((metric) => {
    if (metric.id === 'customers') {
      return {
        ...metric,
        value:
          crmStats.isLoading && crmStats.data === undefined
            ? '…'
            : String(crmStats.data?.customerCount ?? 0),
        hint: canViewCustomers ? 'Live count from CRM' : metric.hint,
        loading: crmStats.isLoading && !crmStats.data,
      };
    }

    if (metric.id === 'active-jobs') {
      return {
        ...metric,
        value:
          jobsStats.isLoading && jobsStats.data === undefined
            ? '…'
            : String(jobsStats.data?.activeCount ?? 0),
        hint: canViewJobs ? 'New, scheduled, and in progress' : metric.hint,
        loading: jobsStats.isLoading && !jobsStats.data,
      };
    }

    if (metric.id === 'open-quotes') {
      return {
        ...metric,
        value:
          financeStats.isLoading && financeStats.data === undefined
            ? '…'
            : String(financeStats.data?.openQuoteCount ?? 0),
        hint: canViewFinance ? 'Draft and sent quotes' : metric.hint,
        loading: financeStats.isLoading && !financeStats.data,
      };
    }

    if (metric.id === 'revenue') {
      const revenueCurrency = financeStats.data?.currency ?? companyCurrency;
      return {
        ...metric,
        value:
          financeStats.isLoading && financeStats.data === undefined
            ? '…'
            : formatMoney(financeStats.data?.revenueMtdCents ?? 0, revenueCurrency),
        hint: canViewFinance ? 'Payments received this month' : metric.hint,
        loading: financeStats.isLoading && !financeStats.data,
      };
    }

    return { ...metric, loading: false };
  });

  return (
    <section className="dashboard-stats" aria-label="Business metrics">
      {metrics.map((metric) => (
        <div key={metric.id} className="dashboard-stat-card">
          {metric.loading ? (
            <LoadingState label={`Loading ${metric.label.toLowerCase()}…`} />
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
  );
}
