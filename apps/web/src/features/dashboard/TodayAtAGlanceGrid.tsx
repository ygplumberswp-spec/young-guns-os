import { Link } from 'wouter';
import type { ExecutiveTodayAtAGlance } from '@titan/shared';
import { StatCard } from '@titan/ui';
import { SummaryCardGrid } from '../../components/ux';
import { useCompanyLocale } from '../../lib/company-locale-context';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';
import { DashboardSourceMeta } from './DashboardSourceMeta';

type TodayAtAGlanceGridProps = {
  data: ExecutiveTodayAtAGlance | null;
  generatedAt?: string | null;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

export function TodayAtAGlanceGrid({
  data,
  generatedAt = null,
  isLoading = false,
  error = null,
  onRetry,
}: TodayAtAGlanceGridProps) {
  const { formatMoney } = useCompanyLocale();

  if (isLoading && !data) {
    return (
      <section className="exec-dashboard-section exec-dashboard-kpi" aria-label="Key Metrics">
        <DashboardSectionSkeleton rows={4} />
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="exec-dashboard-section exec-dashboard-kpi" aria-label="Key Metrics">
        <div className="exec-dashboard-section__error">
          <p>{error}</p>
          {onRetry ? (
            <button type="button" className="exec-dashboard-retry" onClick={onRetry}>
              Retry
            </button>
          ) : null}
          <DashboardSourceMeta
            source="Dashboard executive summary"
            updatedAt={generatedAt}
            state="unavailable"
            href="/jobs"
            linkLabel="Open jobs"
          />
        </div>
      </section>
    );
  }

  if (!data) return null;

  const cards = [
    {
      id: 'jobs',
      label: 'Jobs Today',
      value: String(data.jobs.scheduled + data.jobs.inProgress + data.jobs.completed),
      hint: `${data.jobs.scheduled} scheduled · ${data.jobs.inProgress} in progress · ${data.jobs.completed} done · ${data.jobs.delayed} delayed`,
      href: data.jobs.href,
    },
    {
      id: 'team',
      label: 'Team Status',
      value: String(data.team.onSite + data.team.travelling + data.team.available),
      hint: `${data.team.available} available · ${data.team.travelling} travelling · ${data.team.onSite} on site · ${data.team.offDuty} off duty`,
      href: '/scheduling',
    },
    {
      id: 'money',
      label: 'Money Today',
      value: formatMoney(data.money.paymentsTodayCents, data.money.currency),
      hint: `${formatMoney(data.money.invoicedTodayCents, data.money.currency)} invoiced · ${formatMoney(data.money.outstandingCents, data.money.currency)} outstanding · ${data.money.draftCount} drafts`,
      href: '/finance/invoices',
    },
    {
      id: 'customers',
      label: 'Customer Activity',
      value: String(data.customerActivity.leads + data.customerActivity.followUps),
      hint: `${data.customerActivity.leads} leads · ${data.customerActivity.followUps} follow-ups · ${data.customerActivity.messages} messages · ${data.customerActivity.returning} returning`,
      href: '/crm',
    },
  ];

  return (
    <section className="exec-dashboard-section exec-dashboard-kpi" aria-label="Key Metrics">
      <SummaryCardGrid columns={4} className="exec-dashboard-glance">
        {cards.map((card) => (
          <Link key={card.id} href={card.href} className="exec-dashboard-glance__link">
            <StatCard label={card.label} value={card.value} hint={card.hint} />
          </Link>
        ))}
      </SummaryCardGrid>
      <DashboardSourceMeta
        source="Jobs · Scheduling · Finance · CRM (executive summary)"
        updatedAt={generatedAt}
        href="/reports"
        linkLabel="Open reports"
      />
    </section>
  );
}
