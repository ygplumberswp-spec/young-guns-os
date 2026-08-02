import { Link } from 'wouter';
import type { ReportBreakdown, ReportMetric } from '@titan/shared';
import { EmptyState, Panel } from '@titan/ui';
import {
  formatReportMetricValue,
  isMetricUnavailable,
} from './format-metric-value';

type ReportingMetricCardProps = {
  metric: ReportMetric;
};

export function ReportingMetricCard({ metric }: ReportingMetricCardProps) {
  const unavailable = isMetricUnavailable(metric.value);

  return (
    <article className="analytics-report-metric" data-metric-id={metric.id}>
      <div className="analytics-report-metric__header">
        <h3 className="analytics-report-metric__label">{metric.label}</h3>
        {metric.drillDownHref && !unavailable ? (
          <Link href={metric.drillDownHref} className="analytics-report-metric__drill">
            View records
          </Link>
        ) : null}
      </div>
      <p
        className={
          unavailable
            ? 'analytics-report-metric__value analytics-report-metric__value--empty'
            : 'analytics-report-metric__value'
        }
        title={unavailable && metric.value.kind === 'unavailable' ? metric.value.reason : undefined}
      >
        {formatReportMetricValue(metric.value)}
      </p>
      {unavailable && metric.value.kind === 'unavailable' ? (
        <p className="analytics-report-metric__empty">{metric.value.reason}</p>
      ) : null}
      <p className="analytics-report-metric__definition">{metric.definition}</p>
      <p className="analytics-report-metric__meta">
        Source: {metric.source} · Updated{' '}
        {new Date(metric.lastUpdatedAt).toLocaleString()}
      </p>
    </article>
  );
}

type ReportingBreakdownPanelProps = {
  breakdown: ReportBreakdown;
};

export function ReportingBreakdownPanel({ breakdown }: ReportingBreakdownPanelProps) {
  const hasRows = breakdown.rows.some((row) => row.value > 0);

  return (
    <Panel title={breakdown.title}>
      <p className="page-muted analytics-report-breakdown__definition">{breakdown.definition}</p>
      <p className="analytics-report-metric__meta">
        Source: {breakdown.source} · Updated{' '}
        {new Date(breakdown.lastUpdatedAt).toLocaleString()}
      </p>
      {!hasRows ? (
        <EmptyState title="No data in period" description={breakdown.emptyMessage} />
      ) : (
        <ul className="analytics-report-breakdown__list">
          {breakdown.rows.map((row) => (
            <li key={`${breakdown.id}-${row.label}`}>
              <div>
                <strong>{row.label}</strong>
                {row.displayValue ? (
                  <span className="page-muted"> · {row.displayValue}</span>
                ) : null}
              </div>
              <div className="analytics-report-breakdown__value-row">
                <span>{row.value}</span>
                {row.href ? (
                  <Link href={row.href} className="analytics-report-metric__drill">
                    Drill down
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

type ReportingSectionViewProps = {
  metrics: ReportMetric[];
  breakdowns: ReportBreakdown[];
};

export function ReportingSectionView({ metrics, breakdowns }: ReportingSectionViewProps) {
  return (
    <>
      <section className="analytics-report-metrics" aria-label="Report metrics">
        {metrics.map((metric) => (
          <ReportingMetricCard key={metric.id} metric={metric} />
        ))}
      </section>
      {breakdowns.length > 0 ? (
        <div className="analytics-page__grid">
          {breakdowns.map((breakdown) => (
            <ReportingBreakdownPanel key={breakdown.id} breakdown={breakdown} />
          ))}
        </div>
      ) : null}
    </>
  );
}
