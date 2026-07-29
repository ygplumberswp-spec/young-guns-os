import { useEffect, useMemo, useState } from 'react';
import { StatCard } from '@titan/ui';
import { formatMoney } from '@titan/shared';
import { hasAnyPermission } from '@titan/auth/browser';
import { ApiClientError } from '../../lib/api-client';
import { fetchCrmStats } from '../../lib/crm-api';
import { fetchFinanceStats } from '../../lib/finance-api';
import { fetchJobsStats } from '../../lib/jobs-api';
import { useAuth } from '../../lib/auth-context';
import { DASHBOARD_METRICS } from './constants';

export function DashboardStats() {
  const { accessToken, user } = useAuth();
  const [customerCount, setCustomerCount] = useState<number | null>(null);
  const [activeJobCount, setActiveJobCount] = useState<number | null>(null);
  const [openQuoteCount, setOpenQuoteCount] = useState<number | null>(null);
  const [revenueMtdCents, setRevenueMtdCents] = useState<number | null>(null);
  const [revenueCurrency, setRevenueCurrency] = useState('USD');

  const canViewCustomers = useMemo(
    () => (user ? hasAnyPermission(user.permissions, ['customers:read', 'customers:write']) : false),
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

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      if (!accessToken) {
        return;
      }

      const tasks: Promise<void>[] = [];

      if (canViewCustomers) {
        tasks.push(
          fetchCrmStats(accessToken)
            .then((stats) => {
              if (!cancelled) setCustomerCount(stats.customerCount);
            })
            .catch((err) => {
              if (!cancelled && err instanceof ApiClientError) setCustomerCount(0);
            }),
        );
      }

      if (canViewJobs) {
        tasks.push(
          fetchJobsStats(accessToken)
            .then((stats) => {
              if (!cancelled) setActiveJobCount(stats.activeCount);
            })
            .catch((err) => {
              if (!cancelled && err instanceof ApiClientError) setActiveJobCount(0);
            }),
        );
      }

      if (canViewFinance) {
        tasks.push(
          fetchFinanceStats(accessToken)
            .then((stats) => {
              if (!cancelled) {
                setOpenQuoteCount(stats.openQuoteCount);
                setRevenueMtdCents(stats.revenueMtdCents);
                setRevenueCurrency(stats.currency);
              }
            })
            .catch((err) => {
              if (!cancelled && err instanceof ApiClientError) {
                setOpenQuoteCount(0);
                setRevenueMtdCents(0);
              }
            }),
        );
      }

      await Promise.all(tasks);
    }

    void loadStats();

    return () => {
      cancelled = true;
    };
  }, [accessToken, canViewCustomers, canViewFinance, canViewJobs]);

  const metrics = DASHBOARD_METRICS.map((metric) => {
    if (metric.id === 'customers') {
      return {
        ...metric,
        value: customerCount === null ? '0' : String(customerCount),
        hint: canViewCustomers ? 'Live count from CRM' : metric.hint,
      };
    }

    if (metric.id === 'active-jobs') {
      return {
        ...metric,
        value: activeJobCount === null ? '0' : String(activeJobCount),
        hint: canViewJobs ? 'New, scheduled, and in progress' : metric.hint,
      };
    }

    if (metric.id === 'open-quotes') {
      return {
        ...metric,
        value: openQuoteCount === null ? '0' : String(openQuoteCount),
        hint: canViewFinance ? 'Draft and sent quotes' : metric.hint,
      };
    }

    if (metric.id === 'revenue') {
      return {
        ...metric,
        value:
          revenueMtdCents === null
            ? formatMoney(0, revenueCurrency)
            : formatMoney(revenueMtdCents, revenueCurrency),
        hint: canViewFinance ? 'Payments received this month' : metric.hint,
      };
    }

    return metric;
  });

  return (
    <section className="dashboard-stats" aria-label="Business metrics">
      {metrics.map((metric) => (
        <StatCard
          key={metric.id}
          label={metric.label}
          value={metric.value}
          hint={metric.hint}
        />
      ))}
    </section>
  );
}
