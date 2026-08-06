import { Link } from 'wouter';
import type { ExecutiveSectionStatus, SalesOpportunitiesSummary } from '@titan/shared';
import { EmptyState, Panel } from '@titan/ui';
import { useCompanyLocale } from '../../lib/company-locale-context';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';
import { DashboardSourceMeta } from './DashboardSourceMeta';
import { resolveSectionHonesty } from './dashboard-honesty';

type SalesOpportunitiesPanelProps = {
  data: SalesOpportunitiesSummary | null;
  section?: ExecutiveSectionStatus | null;
  generatedAt?: string | null;
  isLoading?: boolean;
  error?: string | null;
};

export function SalesOpportunitiesPanel({
  data,
  section = null,
  generatedAt = null,
  isLoading = false,
  error = null,
}: SalesOpportunitiesPanelProps) {
  const { formatMoney } = useCompanyLocale();
  const honesty = resolveSectionHonesty(section, error);
  const items = data?.items ?? [];

  return (
    <Panel
      title="Sales & Opportunities"
      description="Leads, quotes and follow-ups"
      headerAction={<Link href="/crm/leads">View CRM</Link>}
    >
      <div className="exec-sales-opportunities">
        {isLoading ? (
          <DashboardSectionSkeleton rows={3} />
        ) : (
          <>
            <div className="exec-sales-opportunities__counts">
              <span>{data?.newLeads ?? 0} new leads</span>
              <span>{data?.quotesAwaitingApproval ?? 0} quotes awaiting</span>
              <span>{data?.followUpsDue ?? 0} follow-ups due</span>
            </div>
            {items.length === 0 ? (
              <EmptyState
                title="No active opportunities"
                description="New leads and quote follow-ups will appear here."
                action={
                  <Link href="/finance/quotes">
                    <span className="exec-source-meta__link">View quotes</span>
                  </Link>
                }
              />
            ) : (
              <ul className="exec-sales-opportunities__list">
                {items.slice(0, 6).map((item) => (
                  <li key={item.id} className="exec-sales-opportunities__row">
                    <Link href={item.href} className="exec-sales-opportunities__link">
                      <span className="exec-sales-opportunities__title">{item.title}</span>
                      {item.customerName ? (
                        <span className="exec-sales-opportunities__customer">{item.customerName}</span>
                      ) : null}
                      {item.amountCents != null ? (
                        <span className="exec-sales-opportunities__amount">
                          {formatMoney(item.amountCents, item.currency)}
                        </span>
                      ) : null}
                      {item.ageLabel ? (
                        <span className="exec-sales-opportunities__age">{item.ageLabel}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <DashboardSourceMeta
          source={section?.source ?? 'CRM · Quotes'}
          updatedAt={section?.updatedAt ?? generatedAt}
          state={honesty.state}
          note={honesty.note}
          href="/crm/leads"
          linkLabel="Open CRM"
        />
      </div>
    </Panel>
  );
}
