import { Link } from 'wouter';
import { Button, EmptyState, Panel } from '@titan/ui';
import type { CustomerValueMetricBucket, CustomerValueMetrics } from '@titan/shared';
import {
  CUSTOMER_VALUE_NO_VERIFIED_DATA_MESSAGE,
  CUSTOMER_VALUE_UPDATING_FROM_XERO_MESSAGE,
  CUSTOMER_VALUE_VERIFIED_FILTER_KEYS,
} from '@titan/shared';
import { useCompanyLocale } from '../../lib/company-locale-context';
import { fetchCustomerValueMetrics } from '../../lib/customer-value-api-client';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';

type CustomerValueMetricsPanelProps = {
  compact?: boolean;
};

type PanelViewState = 'loading' | 'updating' | 'ready' | 'empty' | 'error';

function resolveCustomerValueErrorMessage(error: string | null): string {
  if (!error) {
    return 'Customer value metrics could not be loaded. Try again in a moment.';
  }

  const lower = error.toLowerCase();
  if (lower.includes('forbidden') || lower.includes('permission')) {
    return 'You do not have permission to view customer value metrics.';
  }
  if (
    lower.includes('xero') ||
    lower.includes('sync') ||
    lower.includes('import') ||
    lower.includes('customer_value_unavailable')
  ) {
    return error;
  }
  if (
    lower.includes('unexpected error') ||
    lower.includes('internal_error') ||
    lower.includes('request failed') ||
    lower.includes('unable to load')
  ) {
    return 'Customer value metrics are temporarily unavailable. Try again shortly.';
  }

  return error;
}

function isXeroSyncPending(error: string | null): boolean {
  if (!error) return false;
  const lower = error.toLowerCase();
  return (
    lower.includes('xero') ||
    lower.includes('sync') ||
    lower.includes('import') ||
    lower.includes('updating customer value')
  );
}

function resolvePanelViewState(input: {
  isLoading: boolean;
  error: string | null;
  metrics: CustomerValueMetrics | undefined;
}): PanelViewState {
  const { isLoading, error, metrics } = input;

  if (isLoading && metrics === undefined) {
    return 'loading';
  }
  if (error && metrics === undefined) {
    if (isXeroSyncPending(error)) {
      return 'updating';
    }
    return 'error';
  }
  if (!metrics) {
    return 'empty';
  }
  if (metrics.xeroImportInProgress || metrics.dataCompleteness === 'partial') {
    return 'updating';
  }
  if ((metrics.totals.qualifyingCustomers ?? 0) === 0) {
    return 'empty';
  }
  return 'ready';
}

function MetricCardSkeleton() {
  return (
    <article className="dashboard-metric-card dashboard-metric-card--skeleton" aria-hidden="true">
      <span className="dashboard-metric-skeleton dashboard-metric-skeleton--label" />
      <span className="dashboard-metric-skeleton dashboard-metric-skeleton--value" />
      <span className="dashboard-metric-skeleton dashboard-metric-skeleton--hint" />
    </article>
  );
}

function MetricsSkeletonGrid({ compact }: { compact: boolean }) {
  const skeletonCount = compact ? 3 : CUSTOMER_VALUE_VERIFIED_FILTER_KEYS.length;

  return (
    <div className={compact ? 'dashboard-metrics dashboard-metrics--compact' : 'dashboard-metrics'}>
      {Array.from({ length: skeletonCount }, (_, index) => (
        <MetricCardSkeleton key={index} />
      ))}
    </div>
  );
}

function MetricCard({
  bucket,
  formatMoney,
}: {
  bucket: CustomerValueMetricBucket;
  formatMoney: (cents: number) => string;
}) {
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
  const viewState = resolvePanelViewState({
    isLoading: metricsQuery.isLoading,
    error: metricsQuery.error,
    metrics,
  });

  const verifiedBuckets =
    metrics?.buckets.filter((bucket) =>
      (CUSTOMER_VALUE_VERIFIED_FILTER_KEYS as readonly string[]).includes(bucket.filterKey),
    ) ?? [];

  const panelDescription =
    viewState === 'ready'
      ? 'Verified invoiced customers — click a metric to filter the CRM list.'
      : viewState === 'updating'
        ? CUSTOMER_VALUE_UPDATING_FROM_XERO_MESSAGE
        : undefined;

  return (
    <Panel title="Customer value" description={panelDescription}>
      {viewState === 'loading' ? <MetricsSkeletonGrid compact={compact} /> : null}

      {viewState === 'error' ? (
        <EmptyState
          title="Customer value unavailable"
          description={resolveCustomerValueErrorMessage(metricsQuery.error)}
          action={
            <Button size="sm" variant="secondary" onClick={() => void metricsQuery.refetch()}>
              Retry
            </Button>
          }
        />
      ) : null}

      {viewState === 'empty' ? (
        <EmptyState
          title={CUSTOMER_VALUE_NO_VERIFIED_DATA_MESSAGE}
          description="Customer value metrics appear once verified invoice evidence exists in TITAN."
        />
      ) : null}

      {viewState === 'ready' ? (
        <div className={compact ? 'dashboard-metrics dashboard-metrics--compact' : 'dashboard-metrics'}>
          {verifiedBuckets.map((bucket) => (
            <MetricCard key={bucket.filterKey} bucket={bucket} formatMoney={formatMoney} />
          ))}
        </div>
      ) : null}
    </Panel>
  );
}
