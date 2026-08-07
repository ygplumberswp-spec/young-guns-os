import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { Panel, PageHeader, StatCard } from '@titan/ui';
import type { GrowthPlannerPlan } from '@titan/shared';
import { canViewGrowthPlanner, formatMoney } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchGrowthPlannerPlan } from '../../lib/growth-planner-api';
import { useAuth } from '../../lib/auth-context';
import { FinanceNav } from '../../features/finance/FinanceNav';

function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="growth-planner__metrics">{children}</div>;
}

export function GrowthPlannerPage() {
  const { accessToken, user } = useAuth();
  const canView = useMemo(
    () =>
      user
        ? canViewGrowthPlanner({
            roleName: user.roleName,
            permissions: user.permissions,
          })
        : false,
    [user],
  );

  const [plan, setPlan] = useState<GrowthPlannerPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !canView) return;
    let cancelled = false;
    setError(null);
    void fetchGrowthPlannerPlan(accessToken)
      .then((data) => {
        if (!cancelled) setPlan(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError
              ? err.message
              : 'Unable to load growth planner',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  if (!canView) {
    return (
      <div className="growth-planner">
        <FinanceNav />
        <PageHeader
          title="Growth Planner"
          description="What must happen operationally to hit this month’s target."
        />
        <p className="form-error">Growth planner is not available for your role.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="growth-planner">
        <FinanceNav />
        <PageHeader
          title="Growth Planner"
          description="What must happen operationally to hit this month’s target."
        />
        <p className="form-error">{error}</p>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="growth-planner">
        <FinanceNav />
        <PageHeader
          title="Growth Planner"
          description="What must happen operationally to hit this month’s target."
        />
        <p className="page-muted">Loading growth planner…</p>
      </div>
    );
  }

  const currency = plan.currency;

  if (!plan.configured) {
    return (
      <div className="growth-planner">
        <FinanceNav />
        <PageHeader
          title="Growth Planner"
          description="What must happen operationally to hit this month’s target."
        />
        <Panel title="Growth plan not configured">
          <p>
            Set a revenue target for this month in Budget Control before Growth Planner can
            estimate jobs, quotes, and capacity.
          </p>
          <div className="growth-planner__links">
            <Link href="/finance/budget-control">Open Budget Control</Link>
            <Link href="/finance/owner-command">Financial Command</Link>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="growth-planner">
      <FinanceNav />
      <PageHeader
        title="Growth Planner"
        description="Planning estimates from FIN-004 targets and FIN-002 performance — not accounting truth."
      />

      <Panel title="Growth Status">
        <p>
          <strong>{plan.status.replace(/_/g, ' ')}</strong>
          <span className="page-muted"> — {plan.qualityNote}</span>
        </p>
        <p className="page-muted">Biggest gap: {plan.biggestGap.replace(/_/g, ' ')}</p>
        <ul className="growth-planner__drivers">
          {plan.statusDrivers.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </Panel>

      <Panel title="Monthly Goal">
        <MetricGrid>
          <StatCard
            label="Revenue target"
            value={
              plan.goal.revenueTargetCents == null
                ? '—'
                : formatMoney(plan.goal.revenueTargetCents, currency)
            }
          />
          <StatCard
            label="Actual"
            value={formatMoney(plan.goal.actualRevenueCents, currency)}
          />
          <StatCard
            label="Remaining"
            value={
              plan.goal.remainingCents == null
                ? '—'
                : formatMoney(plan.goal.remainingCents, currency)
            }
          />
          <StatCard
            label="% Achieved"
            value={
              plan.goal.percentAchieved == null ? '—' : `${plan.goal.percentAchieved}%`
            }
          />
          <StatCard
            label="Working days remaining"
            value={String(plan.goal.workingDaysRemaining)}
          />
        </MetricGrid>
      </Panel>

      <Panel title="Required Output">
        <MetricGrid>
          <StatCard
            label="Average ticket"
            value={
              plan.requiredOutput.averageTicketCents == null
                ? 'Unavailable'
                : formatMoney(plan.requiredOutput.averageTicketCents, currency)
            }
          />
          <StatCard
            label="Jobs required"
            value={
              plan.requiredOutput.jobsRequired == null
                ? '—'
                : String(plan.requiredOutput.jobsRequired)
            }
          />
          <StatCard
            label="Jobs / day"
            value={
              plan.requiredOutput.jobsPerDayRequired == null
                ? '—'
                : String(plan.requiredOutput.jobsPerDayRequired)
            }
          />
          <StatCard
            label="Jobs / week"
            value={
              plan.requiredOutput.jobsPerWeekRequired == null
                ? '—'
                : String(plan.requiredOutput.jobsPerWeekRequired)
            }
          />
        </MetricGrid>
        {plan.requiredOutput.scenarios.length > 0 ? (
          <>
            <h3 className="growth-planner__subhead">Average ticket scenarios</h3>
            <ul className="jobs-list">
              {plan.requiredOutput.scenarios.map((s) => (
                <li key={s.averageTicketCents} className="jobs-list__item">
                  <div>
                    At {formatMoney(s.averageTicketCents, currency)} average
                  </div>
                  <div>{s.jobsRequired == null ? '—' : `${s.jobsRequired} jobs`}</div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Panel>

      <Panel title="Pipeline Requirement">
        <MetricGrid>
          <StatCard
            label="Quotes required"
            value={
              plan.pipeline.quotesRequired == null
                ? 'Unavailable'
                : String(plan.pipeline.quotesRequired)
            }
          />
          <StatCard
            label="Open quotes awaiting approval"
            value={String(plan.pipeline.openQuotesAwaitingApproval)}
          />
          <StatCard
            label="Follow-ups due"
            value={String(plan.pipeline.followUpsDue)}
          />
          <StatCard
            label="Leads required"
            value={
              plan.pipeline.leadsRequired == null
                ? 'Unavailable'
                : String(plan.pipeline.leadsRequired)
            }
          />
        </MetricGrid>
        {plan.pipeline.leadsNote ? (
          <p className="page-muted">{plan.pipeline.leadsNote}</p>
        ) : null}
        {!plan.pipeline.quotesAvailable ? (
          <p className="page-muted">
            Quote requirement unavailable — insufficient conversion history (sample{' '}
            {plan.pipeline.quoteSampleSize}).
          </p>
        ) : (
          <p className="page-muted">
            Quote acceptance {plan.pipeline.quoteAcceptanceRatePercent}% from{' '}
            {plan.pipeline.quoteSampleSize} sent quotes.
          </p>
        )}
      </Panel>

      <Panel title="Capacity">
        <MetricGrid>
          <StatCard
            label="Required jobs/day"
            value={
              plan.capacity.requiredJobsPerDay == null
                ? '—'
                : String(plan.capacity.requiredJobsPerDay)
            }
          />
          <StatCard
            label="Known capacity/day"
            value={
              plan.capacity.knownCapacityPerDay == null
                ? 'Unknown'
                : String(plan.capacity.knownCapacityPerDay)
            }
          />
          <StatCard
            label="Gap"
            value={
              plan.capacity.gapJobsPerDay == null
                ? '—'
                : String(plan.capacity.gapJobsPerDay)
            }
          />
          <StatCard label="Capacity state" value={plan.capacity.state.replace(/_/g, ' ')} />
          <StatCard
            label="Active technicians"
            value={String(plan.capacity.activeTechnicianCount)}
          />
          <StatCard
            label="Scheduled jobs"
            value={String(plan.capacity.scheduledJobCount)}
          />
        </MetricGrid>
        <p className="page-muted">{plan.capacity.capacityNote}</p>
      </Panel>

      <Panel title="Profit Guardrails">
        <MetricGrid>
          <StatCard
            label="Gross margin"
            value={
              plan.guardrails.grossMarginActualPct == null
                ? '—'
                : `${plan.guardrails.grossMarginActualPct}%`
            }
          />
          <StatCard
            label="Margin status"
            value={plan.guardrails.marginStatus.replace(/_/g, ' ')}
          />
          <StatCard
            label="Operating profit"
            value={formatMoney(plan.guardrails.operatingProfitActualCents, currency)}
          />
          <StatCard
            label="Overhead status"
            value={plan.guardrails.overheadStatus.replace(/_/g, ' ')}
          />
        </MetricGrid>
        {plan.guardrails.financiallyAtRisk ? (
          <p className="page-muted">
            Revenue pace alone is not enough — margin/overhead/operating profit keep this plan
            financially at risk.
          </p>
        ) : null}
      </Panel>

      <Panel title="Action Plan">
        <ul className="growth-planner__drivers">
          {plan.actionPlan.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {plan.levers.length > 0 ? (
          <>
            <h3 className="growth-planner__subhead">Revenue levers</h3>
            <ul className="jobs-list">
              {plan.levers.map((lever) => (
                <li key={lever.key} className="jobs-list__item">
                  <div>
                    <strong>{lever.label}</strong>
                    <span className="page-muted"> — {lever.detail}</span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Panel>

      <Panel title="Assumptions & Data Quality">
        <p>
          <strong>{plan.dataQuality}</strong>
        </p>
        <ul className="growth-planner__drivers">
          {plan.assumptions.map((a) => (
            <li key={a.key}>{a.statement}</li>
          ))}
        </ul>
        <p className="page-muted">AURA seed: {plan.auraSummary.narrativeSeed}</p>
        <div className="growth-planner__links">
          <Link href="/finance/budget-control">Budget Control</Link>
          <Link href="/finance/operating-profit">Operating Profit</Link>
          <Link href="/finance/profit-analytics">Profit Analytics</Link>
        </div>
      </Panel>
    </div>
  );
}
