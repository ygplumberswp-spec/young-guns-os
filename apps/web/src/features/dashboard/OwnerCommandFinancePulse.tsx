import { useMemo } from 'react';
import { Link } from 'wouter';
import {
  canViewGrowthPlanner,
  canViewOwnerFinancialCommand,
  formatMoney,
} from '@titan/shared';
import { Panel } from '@titan/ui';
import { useAuth } from '../../lib/auth-context';
import { fetchGrowthPlannerPlan } from '../../lib/growth-planner-api';
import { fetchOwnerFinancialCommandDashboard } from '../../lib/owner-financial-command-api';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';

/**
 * OWNER-001 — light FIN-001 + GROWTH-001 composition for the Owner Command Centre.
 * Consumes existing APIs only; does not invent accounting truth.
 */
export function OwnerCommandFinancePulse() {
  const { accessToken, user } = useAuth();
  const canViewFinance = useMemo(
    () =>
      user
        ? canViewOwnerFinancialCommand({
            roleName: user.roleName,
            permissions: user.permissions,
          })
        : false,
    [user],
  );
  const canViewGrowth = useMemo(
    () =>
      user
        ? canViewGrowthPlanner({
            roleName: user.roleName,
            permissions: user.permissions,
          })
        : false,
    [user],
  );

  const finQuery = useStaffCachedQuery({
    queryKey: 'finance/owner-command?period=month',
    enabled: Boolean(accessToken && canViewFinance),
    fetcher: async () => fetchOwnerFinancialCommandDashboard(accessToken!, 'month'),
  });

  const growthQuery = useStaffCachedQuery({
    queryKey: 'finance/growth-planner',
    enabled: Boolean(accessToken && canViewGrowth),
    fetcher: async () => fetchGrowthPlannerPlan(accessToken!),
  });

  if (!canViewFinance && !canViewGrowth) {
    return null;
  }

  const fin = finQuery.data;
  const growth = growthQuery.data;
  const currency = fin?.currency ?? growth?.currency ?? 'ZAR';
  const loading =
    (canViewFinance && finQuery.isLoading && !fin) ||
    (canViewGrowth && growthQuery.isLoading && !growth);

  const growthStatus = !growth
    ? null
    : !growth.configured
      ? 'NOT CONFIGURED'
      : growth.status.replace(/_/g, ' ');

  const growthTone = !growth
    ? 'unknown'
    : !growth.configured
      ? 'unknown'
      : growth.status === 'ON_TRACK'
        ? 'ok'
        : growth.status === 'AT_RISK'
          ? 'warn'
          : growth.status === 'OFF_TRACK'
            ? 'danger'
            : 'unknown';

  return (
    <Panel
      title="Financial Command Pulse"
      description="FIN-001 truth + GROWTH-001 planning status — not a second finance engine"
      className="owner-finance-pulse-panel"
    >
      <div className="owner-finance-pulse">
        {loading ? (
          <DashboardSectionSkeleton rows={2} />
        ) : (
          <>
            <div className="owner-finance-pulse__grid">
              <PulseMetric
                label="Invoiced revenue"
                value={
                  fin
                    ? formatMoney(fin.heartbeat.invoicedRevenueCents, currency)
                    : 'Unavailable'
                }
                href="/finance/owner-command"
              />
              <PulseMetric
                label="Cash collected"
                value={
                  fin
                    ? formatMoney(fin.heartbeat.customerCashCollectedCents, currency)
                    : 'Unavailable'
                }
                href="/finance/cash-control"
              />
              <PulseMetric
                label="Known gross profit"
                value={
                  fin?.heartbeat.knownGrossProfitCents == null
                    ? 'Unavailable'
                    : formatMoney(fin.heartbeat.knownGrossProfitCents, currency)
                }
                href="/finance/owner-command"
              />
              <PulseMetric
                label="Operating profit"
                value={
                  growth
                    ? formatMoney(growth.guardrails.operatingProfitActualCents, currency)
                    : 'Unavailable'
                }
                href="/finance/operating-profit"
              />
              <PulseMetric
                label="Outstanding debtors"
                value={
                  fin
                    ? formatMoney(fin.receivables.totalOutstandingCents, currency)
                    : 'Unavailable'
                }
                href="/finance/invoices?filter=outstanding"
              />
              <PulseMetric
                label="Overdue debtors"
                value={
                  fin
                    ? formatMoney(fin.receivables.overdueCents, currency)
                    : 'Unavailable'
                }
                href="/finance/invoices?filter=overdue"
                tone={fin && fin.receivables.overdueCents > 0 ? 'warn' : undefined}
              />
            </div>

            <div className="owner-finance-pulse__growth">
              <div className="owner-finance-pulse__growth-main">
                <span className="owner-finance-pulse__growth-label">Growth status</span>
                <span
                  className={`owner-finance-pulse__status owner-finance-pulse__status--${growthTone}`}
                >
                  {growthStatus ?? 'Unavailable'}
                </span>
              </div>
              <div className="owner-finance-pulse__growth-metrics">
                <PulseChip
                  label="Target progress"
                  value={
                    growth?.goal.percentAchieved == null
                      ? '—'
                      : `${growth.goal.percentAchieved}%`
                  }
                />
                <PulseChip
                  label="Remaining"
                  value={
                    growth?.goal.remainingCents == null
                      ? growth && !growth.configured
                        ? 'Not configured'
                        : '—'
                      : formatMoney(growth.goal.remainingCents, currency)
                  }
                />
                <PulseChip
                  label="Jobs required"
                  value={
                    growth?.requiredOutput.jobsRequired == null
                      ? '—'
                      : String(growth.requiredOutput.jobsRequired)
                  }
                />
                <PulseChip
                  label="Margin"
                  value={
                    growth
                      ? growth.guardrails.marginStatus.replace(/_/g, ' ')
                      : '—'
                  }
                  tone={
                    growth?.guardrails.marginStatus === 'BELOW_TARGET' ? 'warn' : undefined
                  }
                />
              </div>
            </div>

            <div className="owner-finance-pulse__links">
              <Link href="/finance/owner-command">Financial Command</Link>
              <Link href="/finance/cash-control">Cash Control</Link>
              <Link href="/finance/budget-control">Budget vs Actual</Link>
              <Link href="/finance/growth-planner">Growth Planner</Link>
              <Link href="/finance/operating-profit">Operating Profit</Link>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

function PulseMetric({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: string;
  href: string;
  tone?: 'warn';
}) {
  return (
    <Link
      href={href}
      className={`owner-finance-pulse__metric${tone === 'warn' ? ' is-warn' : ''}`}
    >
      <span className="owner-finance-pulse__metric-label">{label}</span>
      <span className="owner-finance-pulse__metric-value">{value}</span>
    </Link>
  );
}

function PulseChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'warn';
}) {
  return (
    <div className={`owner-finance-pulse__chip${tone === 'warn' ? ' is-warn' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
