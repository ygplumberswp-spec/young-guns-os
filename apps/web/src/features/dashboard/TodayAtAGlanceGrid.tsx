import { Link } from 'wouter';
import type { ExecutiveTodayAtAGlance } from '@titan/shared';
import { StatCard } from '@titan/ui';
import { SummaryCardGrid } from '../../components/ux';
import { useCompanyLocale } from '../../lib/company-locale-context';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';

type TodayAtAGlanceGridProps = {
  data: ExecutiveTodayAtAGlance | null;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

function formatCount(value: number | null | undefined, unavailableLabel = '—'): string {
  if (value == null) return unavailableLabel;
  return String(value);
}

function formatMoneyValue(
  cents: number | null | undefined,
  formatMoney: (cents: number, currency: string) => string,
  currency: string,
): string {
  if (cents == null) return '—';
  return formatMoney(cents, currency);
}

export function TodayAtAGlanceGrid({
  data,
  isLoading = false,
  error = null,
  onRetry,
}: TodayAtAGlanceGridProps) {
  const { formatMoney } = useCompanyLocale();

  if (isLoading && !data) {
    return (
      <section className="exec-dashboard-section">
        <h2 className="exec-dashboard-section__title">Today at a glance</h2>
        <DashboardSectionSkeleton rows={4} />
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="exec-dashboard-section">
        <h2 className="exec-dashboard-section__title">Today at a glance</h2>
        <div className="exec-dashboard-section__error">
          <p>{error}</p>
          {onRetry ? (
            <button type="button" className="exec-dashboard-retry" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  if (!data) return null;

  const { jobs, team, money, customerActivity } = data;
  const moneyUnavailable = money.syncState !== 'ready';

  const cards = [
    {
      id: 'jobs',
      label: 'Jobs Today',
      value: formatCount(jobs.scheduled + jobs.inProgress + jobs.completed),
      hint: `${jobs.scheduled} scheduled · ${jobs.assigned} assigned · ${jobs.travelling} travelling · ${jobs.onSite} on site · ${jobs.unassigned} unassigned · ${jobs.delayed} delayed`,
      href: jobs.href,
    },
    {
      id: 'team',
      label: 'Team Status',
      value: formatCount(team.working + team.onSite + team.travelling),
      hint: `${team.working} working · ${team.available} available · ${team.travelling} travelling · ${team.onSite} on site · ${team.late} late · ${team.missingCheckIn} missing check-in`,
      href: '/scheduling',
    },
    {
      id: 'money',
      label: 'Money Today',
      value: moneyUnavailable
        ? '—'
        : formatMoneyValue(money.paymentsTodayCents, formatMoney, money.currency),
      hint: moneyUnavailable
        ? 'Finance totals temporarily unavailable'
        : `${formatMoneyValue(money.invoicedTodayCents, formatMoney, money.currency)} invoiced · ${formatMoneyValue(money.outstandingCents, formatMoney, money.currency)} outstanding · ${formatMoneyValue(money.overdueCents, formatMoney, money.currency)} overdue · ${money.dueThisWeekCount ?? '—'} due this week · ${formatMoneyValue(money.depositsTodayCents, formatMoney, money.currency)} deposits · ${money.partialPaymentsTodayCount ?? 0} partial payments · ${money.jobsPaidInFullTodayCount ?? 0} paid in full`,
      href: '/finance/invoices',
    },
    {
      id: 'customers',
      label: 'Customer Activity',
      value: formatCount(
        (customerActivity.newLeads ?? 0) + (customerActivity.followUpsDue ?? 0),
      ),
      hint: `${formatCount(customerActivity.newLeads)} new leads · ${formatCount(customerActivity.followUpsDue)} follow-ups · ${formatCount(customerActivity.unreadMessages)} messages · ${formatCount(customerActivity.returningCustomers)} returning · ${formatCount(customerActivity.complaintsEscalations)} escalations`,
      href: '/leads',
    },
  ];

  return (
    <section className="exec-dashboard-section">
      <h2 className="exec-dashboard-section__title">Today at a glance</h2>
      <SummaryCardGrid columns={4} className="exec-dashboard-glance">
        {cards.map((card) => (
          <Link key={card.id} href={card.href} className="exec-dashboard-glance__link">
            <StatCard label={card.label} value={card.value} hint={card.hint} />
          </Link>
        ))}
      </SummaryCardGrid>
    </section>
  );
}
