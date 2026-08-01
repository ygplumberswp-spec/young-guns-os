import { Link } from 'wouter';
import { EmptyState, LoadingState, Panel } from '@titan/ui';
import type { CustomerValueMetricBucket } from '@titan/shared';
import { useCompanyLocale } from '../../lib/company-locale-context';
import { fetchCustomerValueMetrics } from '../../lib/customer-value-api-client';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';

type CustomerValueMetricsPanelProps = {
  compact?: boolean;
};

function MetricCard({ bucket, formatMoney }: { bucket: CustomerValueMetricBucket; formatMoney: (cents: number) => string }) {
  return (
    <Link href={`/crm?classification=${encodeURIComponent(bucket.filterKey)}`} className="dashboard-metric-link">
      <article className="dashboard-metric-card">
        <span className="dashboard-metric-label">{bucket.label}</span>
        <strong className="dashboard-metric-value">{bucket.count}</strong>
        <span className="dashboard-metric-hint">{formatMoney(bucket.valueCents)}</span>
      </article>
    </Link>
  );
}

export function CustomerValueMetricsPanel({ compact = false }: CustomerValueMetricsPanelProps) {
  const { accessToken } = useAuth();
  const { formatMoney } = useCompanyLocale();

  const metricsQuery = useStaffCachedQuery({
    queryKey: 'customers/value-metrics',
    enabled: Boolean(accessToken),
    fetcher: async () => fetchCustomerValueMetrics(accessToken!),
  });

  const metrics = metricsQuery.data;

  return (
    <Panel
      title="Customer value"
      description={
        metrics?.xeroImportInProgress
          ? 'Counts may be partial while Xero background import is running.'
          : 'Invoiced vs paid customers — click a metric to filter the CRM list.'
      }
    >
      {metricsQuery.isLoading && metrics === undefined ? (
        <LoadingState label="Loading customer value metrics…" />
      ) : metricsQuery.error && metrics === undefined ? (
        <EmptyState
          title="Customer value metrics unavailable"
          description={metricsQuery.error.message || 'Try again shortly.'}
        />
      ) : !metrics || metrics.totals.customerRecords === 0 ? (
        <EmptyState
          title="No customer records yet"
          description="Customer value metrics appear once CRM contacts exist."
        />
      ) : (
        <>
          {metrics.dataCompleteness === 'partial' ? (
            <p className="page-muted" role="status">
              Partial data — Xero import in progress. Cash received never includes unpaid invoices.
            </p>
          ) : null}
          <div className={compact ? 'dashboard-metrics dashboard-metrics--compact' : 'dashboard-metrics'}>
            {metrics.buckets.map((bucket) => (
              <MetricCard key={bucket.filterKey} bucket={bucket} formatMoney={formatMoney} />
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
