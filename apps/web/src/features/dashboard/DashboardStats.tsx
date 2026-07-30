import { useMemo } from 'react';
import { LoadingState, StatCard } from '@titan/ui';
import { hasAnyPermission } from '@titan/auth/browser';
import { fetchCrmStats } from '../../lib/crm-api';
import { fetchFinanceStats } from '../../lib/finance-api';
import { fetchJobsStats } from '../../lib/jobs-api';
import { useAuth } from '../../lib/auth-context';
import { useCompanyLocale } from '../../lib/company-locale-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import { DASHBOARD_METRICS } from './constants';

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

  const crmStats = useCachedQuery({
    queryKey: 'crm/stats',
    accessToken,
    enabled: Boolean(accessToken && canViewCustomers),
    staleTimeMs: 60_000,
    fetcher: async () => fetchCrmStats(accessToken!),
  });

  const jobsStats = useCachedQuery({
    queryKey: 'jobs/stats',
    accessToken,
    enabled: Boolean(accessToken && canViewJobs),
    staleTimeMs: 60_000,
    fetcher: async () => fetchJobsStats(accessToken!),
  });

  const financeStats = useCachedQuery({
    queryKey: 'finance/stats',
    accessToken,
    enabled: Boolean(accessToken && canViewFinance),
    staleTimeMs: 60_000,
    fetcher: async () => fetchFinanceStats(accessToken!),
  });

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
            <StatCard label={metric.label} value={metric.value} hint={metric.hint} />
          )}
        </div>
      ))}
    </section>
  );
}
