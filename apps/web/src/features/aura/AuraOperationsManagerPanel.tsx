import { Link } from 'wouter';
import type { AuraOperationsSummary } from '@titan/shared';
import { formatAuraOperationsMetric } from '@titan/shared';
import { Button, LoadingState } from '@titan/ui';

type AuraOperationsManagerPanelProps = {
  summary: AuraOperationsSummary | null;
  isLoading: boolean;
  error: string | null;
  compact?: boolean;
};

function formatMoney(cents: number | null, currency: string): string {
  if (cents === null) {
    return '—';
  }
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="aura-operations__metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function AuraOperationsManagerPanel({
  summary,
  isLoading,
  error,
  compact = false,
}: AuraOperationsManagerPanelProps) {
  if (isLoading && !summary) {
    return <LoadingState label="Loading operations summary…" />;
  }

  if (error) {
    return (
      <div className="aura-operations aura-operations--error">
        <p className="aura-operations__error">{error}</p>
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  const { morning, endOfDay, recommendations } = summary;

  return (
    <section className={`aura-operations${compact ? ' aura-operations--compact' : ''}`}>
      <header className="aura-operations__header">
        <div>
          <h2 className="aura-operations__title">Operations Manager</h2>
          <p className="page-muted aura-operations__subtitle">
            Morning and end-of-day summaries from live tenant APIs — no synthetic counts.
          </p>
        </div>
        {!compact ? (
          <Link href="/mission-control">
            <Button variant="secondary">Mission Control</Button>
          </Link>
        ) : null}
      </header>

      <div className="aura-operations__grid">
        <article className="aura-operations__panel">
          <h3 className="aura-operations__panel-title">Morning summary</h3>
          <dl className="aura-operations__metrics">
            <MetricCell label="Jobs today" value={formatAuraOperationsMetric(morning.jobsToday)} />
            <MetricCell
              label="Unassigned"
              value={formatAuraOperationsMetric(morning.unassignedWork)}
            />
            <MetricCell
              label="Team working"
              value={formatAuraOperationsMetric(morning.attendance.working)}
            />
            <MetricCell label="Late" value={formatAuraOperationsMetric(morning.attendance.late)} />
            <MetricCell
              label="Missing check-in"
              value={formatAuraOperationsMetric(morning.attendance.missingCheckIn)}
            />
            <MetricCell label="Delays" value={formatAuraOperationsMetric(morning.delays)} />
            <MetricCell
              label="Cash due"
              value={formatMoney(morning.cashDueCents, morning.overdueDebtors.currency)}
            />
            <MetricCell
              label="Overdue debtors"
              value={
                morning.overdueDebtors.count === null
                  ? '—'
                  : `${morning.overdueDebtors.count} · ${formatMoney(morning.overdueDebtors.amountCents, morning.overdueDebtors.currency)}`
              }
            />
            <MetricCell
              label="Bills due"
              value={
                !morning.billsDue.available
                  ? morning.billsDue.count === null && morning.billsDue.amountCents === null
                    ? 'PO data unavailable'
                    : `${formatAuraOperationsMetric(morning.billsDue.count)} · ${formatMoney(morning.billsDue.amountCents, morning.billsDue.currency)}`
                  : formatMoney(morning.billsDue.amountCents, morning.billsDue.currency)
              }
            />
            <MetricCell
              label="Lead follow-ups"
              value={formatAuraOperationsMetric(morning.leadFollowUps)}
            />
            <MetricCell
              label="Quote follow-ups"
              value={formatAuraOperationsMetric(morning.quoteFollowUps)}
            />
            <MetricCell
              label="Stock blockers"
              value={formatAuraOperationsMetric(morning.stockBlockers)}
            />
            <MetricCell
              label="Fleet alerts"
              value={formatAuraOperationsMetric(morning.fleetAlerts)}
            />
            <MetricCell
              label="Missing documents"
              value={formatAuraOperationsMetric(morning.missingDocuments)}
            />
            <MetricCell label="Approvals" value={formatAuraOperationsMetric(morning.approvals)} />
          </dl>

          {morning.topOwnerActions.length > 0 ? (
            <div className="aura-operations__actions">
              <p className="aura-operations__actions-title">Top Owner actions</p>
              <ul>
                {morning.topOwnerActions.map((action) => (
                  <li key={action.id}>
                    <Link href={action.href}>
                      <span className={`status-pill status-pill--${action.priority === 'critical' ? 'critical' : action.priority === 'high' ? 'warning' : 'neutral'}`}>
                        {action.priority}
                      </span>
                      {action.title} ({action.count})
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </article>

        <article className="aura-operations__panel">
          <h3 className="aura-operations__panel-title">End-of-day summary</h3>
          <dl className="aura-operations__metrics">
            <MetricCell
              label="Jobs completed"
              value={formatAuraOperationsMetric(endOfDay.jobsCompleted)}
            />
            <MetricCell
              label="Carried over"
              value={formatAuraOperationsMetric(endOfDay.jobsCarriedOver)}
            />
            <MetricCell
              label="Invoiced revenue"
              value={formatMoney(endOfDay.invoicedRevenueCents, endOfDay.currency)}
            />
            <MetricCell
              label="Cash received"
              value={formatMoney(endOfDay.cashReceivedCents, endOfDay.currency)}
            />
            <MetricCell
              label="Overdue (current)"
              value={
                endOfDay.overdueChanges.currentCount === null
                  ? '—'
                  : `${endOfDay.overdueChanges.currentCount} · ${formatMoney(endOfDay.overdueChanges.currentAmountCents, endOfDay.currency)}`
              }
            />
            <MetricCell
              label="Hours worked"
              value={
                endOfDay.hoursWorked === null
                  ? '—'
                  : `${endOfDay.hoursWorked}h${endOfDay.overtimeHours != null ? ` (+${endOfDay.overtimeHours}h OT)` : ''}`
              }
            />
            <MetricCell
              label="Missing close-out"
              value={formatAuraOperationsMetric(endOfDay.missingCloseOut)}
            />
          </dl>
          <p className="page-muted aura-operations__note">{endOfDay.overdueChanges.note}</p>

          {endOfDay.tomorrowRisks.length > 0 ? (
            <div className="aura-operations__risks">
              <p className="aura-operations__actions-title">Tomorrow&apos;s risks</p>
              <ul>
                {endOfDay.tomorrowRisks.map((risk) => (
                  <li key={risk.id}>
                    {risk.href ? (
                      <Link href={risk.href}>
                        <strong>{risk.title}</strong>
                        <span className="page-muted"> — {risk.description}</span>
                      </Link>
                    ) : (
                      <>
                        <strong>{risk.title}</strong>
                        <span className="page-muted"> — {risk.description}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </article>
      </div>

      {recommendations.length > 0 ? (
        <div className="aura-operations__recommendations">
          <h3 className="aura-operations__panel-title">Recommendations</h3>
          <ul className="aura-operations__rec-list">
            {recommendations.map((rec) => (
              <li key={rec.id} className="aura-operations__rec-card">
                <div className="aura-operations__rec-head">
                  <strong>{rec.impact}</strong>
                  <span
                    className={`status-pill status-pill--${rec.priority === 'critical' ? 'critical' : rec.priority === 'high' ? 'warning' : 'neutral'}`}
                  >
                    {rec.approvalRequired ? 'Approval required' : 'Draft only'}
                  </span>
                </div>
                <p className="page-muted">{rec.reason}</p>
                <p>{rec.proposedAction}</p>
                <p className="aura-operations__rec-sources page-muted">
                  Sources:{' '}
                  {rec.sourceRecords.map((source) => source.source).join(', ')}
                </p>
                {rec.href ? (
                  <Link href={rec.href}>
                    <Button variant="secondary" className="aura-operations__rec-link">
                      Review
                    </Button>
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
