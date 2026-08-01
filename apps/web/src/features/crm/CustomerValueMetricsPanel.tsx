import { Link } from 'wouter';
import { Button, EmptyState, LoadingState, Panel } from '@titan/ui';
import type { CustomerValueMetricBucket } from '@titan/shared';
import {
  CUSTOMER_VALUE_NO_VERIFIED_DATA_MESSAGE,
  CUSTOMER_VALUE_UPDATING_FROM_XERO_MESSAGE,
  CUSTOMER_VALUE_VERIFIED_FILTER_KEYS,
  CUSTOMER_VALUE_XERO_IMPORT_PARTIAL_MESSAGE,
} from '@titan/shared';
import { useCompanyLocale } from '../../lib/company-locale-context';
import { fetchCustomerValueMetrics } from '../../lib/customer-value-api-client';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';

type CustomerValueMetricsPanelProps = {
  compact?: boolean;
};

function resolveCustomerValueErrorMessage(error: string | null): string {
  if (!error) return CUSTOMER_VALUE_UPDATING_FROM_XERO_MESSAGE;
  const lower = error.toLowerCase();
  if (
    lower.includes('unexpected error') ||
    lower.includes('internal_error') ||
    lower.includes('request failed') ||
    lower.includes('unable to load')
  ) {
    return CUSTOMER_VALUE_UPDATING_FROM_XERO_MESSAGE;
  }
  if (lower.includes('forbidden') || lower.includes('permission')) {
    return 'You do not have permission to view customer value metrics.';
  }
  return CUSTOMER_VALUE_UPDATING_FROM_XERO_MESSAGE;
}

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
  const isUpdating =
    metrics?.xeroImportInProgress ||
    metrics?.dataCompleteness === 'partial' ||
    (metricsQuery.error !== null && metrics === undefined);

  const verifiedBuckets =
    metrics?.buckets.filter((bucket) =>
      (CUSTOMER_VALUE_VERIFIED_FILTER_KEYS as readonly string[]).includes(bucket.filterKey),
    ) ?? [];

  const hasVerifiedData = (metrics?.totals.qualifyingCustomers ?? 0) > 0;

  return (
    <Panel
      title="Customer value"
      description={
        isUpdating
          ? CUSTOMER_VALUE_UPDATING_FROM_XERO_MESSAGE
          : hasVerifiedData
            ? 'Verified invoiced customers — click a metric to filter the CRM list.'
            : CUSTOMER_VALUE_NO_VERIFIED_DATA_MESSAGE
      }
    >
      {metricsQuery.isLoading && metrics === undefined ? (
        <LoadingState label="Loading customer value metrics…" />
      ) : metricsQuery.error && metrics === undefined ? (
        <EmptyState
          title={CUSTOMER_VALUE_UPDATING_FROM_XERO_MESSAGE}
          description={resolveCustomerValueErrorMessage(metricsQuery.error)}
          action={
            <Button size="sm" variant="secondary" onClick={() => void metricsQuery.refetch()}>
              Retry
            </Button>
          }
        />
      ) : !metrics ? (
        <EmptyState
          title={CUSTOMER_VALUE_NO_VERIFIED_DATA_MESSAGE}
          description="Customer value metrics appear once verified invoice evidence exists in TITAN."
        />
      ) : !hasVerifiedData ? (
        <EmptyState
          title={CUSTOMER_VALUE_NO_VERIFIED_DATA_MESSAGE}
          description={
            isUpdating
              ? CUSTOMER_VALUE_XERO_IMPORT_PARTIAL_MESSAGE
              : 'Xero contacts without invoice evidence are not counted as customers.'
          }
        />
      ) : (
        <>
          {isUpdating ? (
            <p className="page-muted" role="status">
              {CUSTOMER_VALUE_UPDATING_FROM_XERO_MESSAGE}
            </p>
          ) : null}
          <div className={compact ? 'dashboard-metrics dashboard-metrics--compact' : 'dashboard-metrics'}>
            {verifiedBuckets.map((bucket) => (
              <MetricCard key={bucket.filterKey} bucket={bucket} formatMoney={formatMoney} />
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
