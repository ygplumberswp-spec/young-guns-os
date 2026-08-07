import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { Panel, PageHeader, StatCard } from '@titan/ui';
import type {
  BudgetControlDashboard,
  BudgetControlMetricCompare,
} from '@titan/shared';
import {
  BUDGET_OVERHEAD_CATEGORIES,
  canViewBudgetControl,
  canWriteBudgetControl,
  formatMoney,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  fetchBudgetControlDashboard,
  upsertBudgetControlPlan,
} from '../../lib/budget-control-api';
import { useAuth } from '../../lib/auth-context';
import { FinanceNav } from '../../features/finance/FinanceNav';

function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="budget-control__metrics">{children}</div>;
}

function centsToRandInput(cents: number | null | undefined): string {
  if (cents == null) return '';
  return (cents / 100).toFixed(2);
}

function randInputToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function CompareRow({
  compare,
  currency,
}: {
  compare: BudgetControlMetricCompare;
  currency: string;
}) {
  return (
    <li className="jobs-list__item">
      <div>
        <strong>{compare.label}</strong>
        <span className="page-muted">
          {' '}
          — actual {formatMoney(compare.actualCents ?? 0, currency)}
          {compare.configured
            ? ` · target ${formatMoney(compare.targetCents ?? 0, currency)}`
            : ' · no target configured'}
          {compare.percentAchieved != null ? ` · ${compare.percentAchieved}% achieved` : ''}
        </span>
      </div>
      <div>
        {compare.differenceCents == null
          ? '—'
          : formatMoney(compare.differenceCents, currency)}
      </div>
    </li>
  );
}

export function BudgetControlPage() {
  const { accessToken, user } = useAuth();
  const canView = useMemo(
    () =>
      user
        ? canViewBudgetControl({
            roleName: user.roleName,
            permissions: user.permissions,
          })
        : false,
    [user],
  );
  const canWrite = useMemo(
    () =>
      user
        ? canWriteBudgetControl({
            roleName: user.roleName,
            permissions: user.permissions,
          })
        : false,
    [user],
  );

  const [month, setMonth] = useState<string>('');
  const [dashboard, setDashboard] = useState<BudgetControlDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [revenueTarget, setRevenueTarget] = useState('');
  const [marginTarget, setMarginTarget] = useState('');
  const [gpTarget, setGpTarget] = useState('');
  const [overheadBudget, setOverheadBudget] = useState('');
  const [opTarget, setOpTarget] = useState('');
  const [cashTarget, setCashTarget] = useState('');
  const [categoryBudgets, setCategoryBudgets] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!accessToken || !canView) return;
    let cancelled = false;
    setError(null);
    void fetchBudgetControlDashboard(accessToken, month || undefined)
      .then((data) => {
        if (cancelled) return;
        setDashboard(data);
        if (!month) setMonth(data.plan.planMonth.slice(0, 7));
        setRevenueTarget(centsToRandInput(data.plan.revenueTargetCents));
        setMarginTarget(
          data.plan.grossMarginTargetPct == null
            ? ''
            : String(data.plan.grossMarginTargetPct),
        );
        setGpTarget(centsToRandInput(data.plan.grossProfitTargetCents));
        setOverheadBudget(centsToRandInput(data.plan.overheadBudgetCents));
        setOpTarget(centsToRandInput(data.plan.operatingProfitTargetCents));
        setCashTarget(centsToRandInput(data.plan.cashCollectionTargetCents));
        const map: Record<string, string> = {};
        for (const line of data.plan.overheadLines) {
          map[line.category] = centsToRandInput(line.budgetCents);
        }
        setCategoryBudgets(map);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError
              ? err.message
              : 'Unable to load budget control',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView, month]);

  async function onSavePlan() {
    if (!accessToken || !canWrite || !dashboard) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const overheadLines = Object.entries(categoryBudgets)
        .map(([category, value]) => ({
          category,
          budgetCents: randInputToCents(value) ?? 0,
        }))
        .filter((l) => l.budgetCents > 0);

      await upsertBudgetControlPlan(accessToken, dashboard.plan.planMonth.slice(0, 7), {
        revenueTargetCents: randInputToCents(revenueTarget),
        grossMarginTargetPct: marginTarget.trim() ? Number(marginTarget) : null,
        grossProfitTargetCents: randInputToCents(gpTarget),
        overheadBudgetCents: randInputToCents(overheadBudget),
        operatingProfitTargetCents: randInputToCents(opTarget),
        cashCollectionTargetCents: randInputToCents(cashTarget),
        overheadLines,
      });
      const refreshed = await fetchBudgetControlDashboard(
        accessToken,
        dashboard.plan.planMonth.slice(0, 7),
      );
      setDashboard(refreshed);
      setSaveMessage('Monthly plan saved. Actual financial truth was not changed.');
    } catch (err) {
      setSaveMessage(
        err instanceof ApiClientError ? err.message : 'Unable to save monthly plan',
      );
    } finally {
      setSaving(false);
    }
  }

  if (!canView) {
    return (
      <div className="budget-control">
        <FinanceNav />
        <PageHeader
          title="Budget, Targets & Forecast"
          description="Monthly financial plan versus known actuals."
        />
        <p className="form-error">Budget control is not available for your role.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="budget-control">
        <FinanceNav />
        <PageHeader
          title="Budget, Targets & Forecast"
          description="Monthly financial plan versus known actuals."
        />
        <p className="form-error">{error}</p>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="budget-control">
        <FinanceNav />
        <PageHeader
          title="Budget, Targets & Forecast"
          description="Monthly financial plan versus known actuals."
        />
        <p className="page-muted">Loading budget control…</p>
      </div>
    );
  }

  const currency = dashboard.actuals.currency;
  const months = dashboard.availableMonths;

  return (
    <div className="budget-control">
      <FinanceNav />
      <PageHeader
        title="Budget, Targets & Forecast"
        description="Plan targets separately from JPE/CASH/FIN-003 actuals. Forecast is a run-rate estimate — never actual."
      />

      <div className="budget-control__periods" role="tablist" aria-label="Month">
        {months.map((m) => {
          const key = m.slice(0, 7);
          const active = (month || dashboard.plan.planMonth.slice(0, 7)) === key;
          return (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={active}
              className={`ux-compact-tabs__tab${active ? ' ux-compact-tabs__tab--active' : ''}`}
              onClick={() => setMonth(key)}
            >
              {key}
            </button>
          );
        })}
      </div>

      <Panel title="Data Quality">
        <p>
          <strong>{dashboard.actuals.completeness}</strong>
          <span className="page-muted">
            {' '}
            — {dashboard.actuals.completenessReasons.join(', ').replace(/_/g, ' ') ||
              'Actual source quality from FIN-003.'}
          </span>
        </p>
        <div className="budget-control__links">
          <Link href="/finance/operating-profit">Operating profit</Link>
          <Link href="/finance/owner-command">Financial Command</Link>
          <Link href="/finance/cash-control">Cash Control</Link>
        </div>
      </Panel>

      <Panel title="Monthly Plan">
        {dashboard.plan.isEmpty ? (
          <p className="page-muted">No plan configured for this month yet.</p>
        ) : (
          <p className="page-muted">Editing saved plan for {dashboard.plan.planMonth}.</p>
        )}
        <div className="budget-control__form">
          <label>
            Revenue target (R)
            <input
              value={revenueTarget}
              onChange={(e) => setRevenueTarget(e.target.value)}
              disabled={!canWrite}
              inputMode="decimal"
            />
          </label>
          <label>
            Gross margin target (%)
            <input
              value={marginTarget}
              onChange={(e) => setMarginTarget(e.target.value)}
              disabled={!canWrite}
              inputMode="decimal"
            />
          </label>
          <label>
            Gross profit target (R)
            <input
              value={gpTarget}
              onChange={(e) => setGpTarget(e.target.value)}
              disabled={!canWrite}
              inputMode="decimal"
            />
          </label>
          <label>
            Overhead budget (R)
            <input
              value={overheadBudget}
              onChange={(e) => setOverheadBudget(e.target.value)}
              disabled={!canWrite}
              inputMode="decimal"
            />
          </label>
          <label>
            Operating profit target (R)
            <input
              value={opTarget}
              onChange={(e) => setOpTarget(e.target.value)}
              disabled={!canWrite}
              inputMode="decimal"
            />
          </label>
          <label>
            Cash collection target (R)
            <input
              value={cashTarget}
              onChange={(e) => setCashTarget(e.target.value)}
              disabled={!canWrite}
              inputMode="decimal"
            />
          </label>
        </div>
        {canWrite ? (
          <button
            type="button"
            className="ux-compact-tabs__tab"
            disabled={saving}
            onClick={() => void onSavePlan()}
          >
            {saving ? 'Saving…' : 'Save monthly plan'}
          </button>
        ) : (
          <p className="page-muted">Read-only — finance write required to edit targets.</p>
        )}
        {saveMessage ? <p className="page-muted">{saveMessage}</p> : null}
      </Panel>

      <Panel title="Actual vs Target">
        <ul className="jobs-list">
          <CompareRow compare={dashboard.compares.revenue} currency={currency} />
          <CompareRow compare={dashboard.compares.grossProfit} currency={currency} />
          <li className="jobs-list__item">
            <div>
              <strong>{dashboard.compares.grossMargin.label}</strong>
              <span className="page-muted">
                {' '}
                — actual{' '}
                {dashboard.compares.grossMargin.actualPct == null
                  ? '—'
                  : `${dashboard.compares.grossMargin.actualPct}%`}
                {dashboard.compares.grossMargin.configured
                  ? ` · target ${dashboard.compares.grossMargin.targetPct}%`
                  : ' · no target'}
              </span>
            </div>
            <div>
              {dashboard.compares.grossMargin.differencePct == null
                ? '—'
                : `${dashboard.compares.grossMargin.differencePct} pts`}
            </div>
          </li>
          <CompareRow compare={dashboard.compares.overhead} currency={currency} />
          <CompareRow compare={dashboard.compares.operatingProfit} currency={currency} />
          <CompareRow compare={dashboard.compares.cashCollected} currency={currency} />
        </ul>
      </Panel>

      <Panel title="Forecast">
        <p className="page-muted">
          <strong>{dashboard.forecast.label}</strong> — {dashboard.forecast.confidenceNote}
        </p>
        <MetricGrid>
          <StatCard
            label="Projected month-end revenue"
            value={
              dashboard.forecast.projectedRevenueCents == null
                ? '—'
                : formatMoney(dashboard.forecast.projectedRevenueCents, currency)
            }
          />
          <StatCard
            label="Projected GP"
            value={
              dashboard.forecast.projectedGrossProfitCents == null
                ? '—'
                : formatMoney(dashboard.forecast.projectedGrossProfitCents, currency)
            }
          />
          <StatCard
            label="Projected overhead"
            value={
              dashboard.forecast.projectedOverheadCents == null
                ? '—'
                : formatMoney(dashboard.forecast.projectedOverheadCents, currency)
            }
          />
          <StatCard
            label="Projected operating profit"
            value={
              dashboard.forecast.projectedOperatingProfitCents == null
                ? '—'
                : formatMoney(dashboard.forecast.projectedOperatingProfitCents, currency)
            }
          />
        </MetricGrid>
        <p className="page-muted">
          Confidence: {dashboard.forecast.confidence} · elapsed {dashboard.forecast.elapsedDays}/
          {dashboard.forecast.totalDaysInMonth} days · method {dashboard.forecast.method}
        </p>
      </Panel>

      <Panel title="Overhead Budget">
        <div className="budget-control__form">
          {BUDGET_OVERHEAD_CATEGORIES.filter((c) =>
            ['rent', 'wages', 'software', 'marketing', 'bank_fee', 'fuel', 'equipment', 'other'].includes(
              c,
            ),
          ).map((cat) => (
            <label key={cat}>
              {cat} budget (R)
              <input
                value={categoryBudgets[cat] ?? ''}
                onChange={(e) =>
                  setCategoryBudgets((prev) => ({ ...prev, [cat]: e.target.value }))
                }
                disabled={!canWrite}
                inputMode="decimal"
              />
            </label>
          ))}
        </div>
        {dashboard.overheadSpend.length === 0 ? (
          <p className="page-muted">No overhead budget lines or actual overhead in this month.</p>
        ) : (
          <ul className="jobs-list">
            {dashboard.overheadSpend.map((row) => (
              <li key={row.category} className="jobs-list__item">
                <div>
                  <strong>{row.category}</strong>
                  <span className="page-muted">
                    {' '}
                    — budget {formatMoney(row.budgetCents, currency)} · actual{' '}
                    {formatMoney(row.actualCents, currency)} · remaining{' '}
                    {formatMoney(row.remainingCents, currency)}
                    {row.percentUsed != null ? ` · ${row.percentUsed}% used` : ''}
                    {row.overspent ? ' · OVERSPEND' : ''}
                    {` · ${row.dataQuality}`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Needs Attention">
        {dashboard.alerts.length === 0 ? (
          <p className="page-muted">No budget exceptions for this month.</p>
        ) : (
          <ul className="jobs-list">
            {dashboard.alerts.map((alert) => (
              <li key={`${alert.kind}-${alert.label}`} className="jobs-list__item">
                <div>
                  <strong>{alert.kind.replace(/_/g, ' ')}</strong>
                  <span className="page-muted"> — {alert.label}</span>
                </div>
                <div>
                  {alert.amountCents != null ? formatMoney(alert.amountCents, currency) : '—'}
                  {' · '}
                  <Link href={alert.href} className="jobs-link">
                    Open
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
