import { Link } from 'wouter';
import type { AttentionRequiredSummary } from '@titan/shared';
import { Button, EmptyState, Panel } from '@titan/ui';
import { useCompanyLocale } from '../../lib/company-locale-context';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';

type AttentionRequiredPanelProps = {
  data: AttentionRequiredSummary | null;
  isLoading?: boolean;
  error?: string | null;
};

const PRIORITY_LABELS = {
  critical: 'Critical',
  attention: 'Attention',
  opportunity: 'Opportunity',
  informational: 'Info',
} as const;

export function AttentionRequiredPanel({
  data,
  isLoading = false,
  error = null,
}: AttentionRequiredPanelProps) {
  const { formatMoney } = useCompanyLocale();
  const items = data?.items ?? [];

  return (
    <Panel
      title="Attention Required"
      description={
        data
          ? `${data.criticalCount} critical · ${data.attentionCount} need attention · ${data.opportunityCount} opportunities`
          : 'Sorted by urgency and financial impact'
      }
      headerAction={<Link href="/finance/invoices?filter=overdue">View finance</Link>}
    >
      <div className="exec-attention">
        {isLoading ? (
          <DashboardSectionSkeleton rows={4} />
        ) : error ? (
          <EmptyState title="Attention list unavailable" description={error} />
        ) : items.length === 0 ? (
          <EmptyState
            title="Nothing needs attention"
            description="Overdue invoices, unassigned jobs and follow-ups will appear here."
            action={
              <Link href="/jobs">
                <Button size="sm" variant="secondary">
                  View jobs
                </Button>
              </Link>
            }
          />
        ) : (
          <ul className="exec-attention__list">
            {items.slice(0, 8).map((item) => (
              <li key={item.id} className={`exec-attention__row is-${item.priority}`}>
                <Link href={item.href} className="exec-attention__link">
                  <span className="exec-attention__main">
                    <strong>{item.title}</strong>
                    {item.customerName ? <em>{item.customerName}</em> : null}
                    <span className="exec-attention__reason">{item.reason}</span>
                  </span>
                  <span className="exec-attention__meta">
                    <span className={`exec-attention__priority is-${item.priority}`}>
                      {PRIORITY_LABELS[item.priority]}
                    </span>
                    {item.amountCents != null ? (
                      <span className="exec-attention__amount">
                        {formatMoney(item.amountCents, item.currency)}
                      </span>
                    ) : null}
                    {item.ageLabel ? (
                      <span className="exec-attention__age">{item.ageLabel}</span>
                    ) : null}
                    <span className="exec-attention__action">{item.recommendedAction}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
