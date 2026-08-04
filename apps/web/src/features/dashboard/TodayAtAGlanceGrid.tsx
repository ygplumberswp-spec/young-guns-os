import { Link } from 'wouter';
import type {
  ExecutiveDashboardSummary,
  ExecutiveSectionKey,
  ExecutiveTodayAtAGlance,
} from '@titan/shared';
import { StatCard } from '@titan/ui';
import { SummaryCardGrid } from '../../components/ux';
import { useCompanyLocale } from '../../lib/company-locale-context';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';
import { DashboardSourceMeta } from './DashboardSourceMeta';
import { resolveSectionHonesty } from './dashboard-honesty';

type TodayAtAGlanceGridProps = {
  data: ExecutiveTodayAtAGlance | null;
  sections?: ExecutiveDashboardSummary['sections'] | null;
  generatedAt?: string | null;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

export function TodayAtAGlanceGrid({
  data,
  sections = null,
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

  // Each KPI reports its own source. A section that failed shows an em dash, never a zero
  // that would read as a real business figure.
  const card = (
    sectionKey: ExecutiveSectionKey,
    config: { id: string; label: string; value: string; hint: string; href: string },
  ) => {
    const status = sections?.[sectionKey] ?? null;
    const honesty = resolveSectionHonesty(status, null);
    const down = sections ? honesty.state === 'unavailable' : false;
    return {
      ...config,
      value: down ? '—' : config.value,
      hint: down ? (honesty.note ?? 'Source unavailable.') : config.hint,
    };
  };

  const cards = [
    card('todayAtAGlance', {
      id: 'jobs',
      label: 'Jobs Today',
      value: String(data.jobs.scheduled + data.jobs.inProgress + data.jobs.completed),
      hint: `${data.jobs.scheduled} scheduled · ${data.jobs.inProgress} in progress · ${data.jobs.completed} done · ${data.jobs.delayed} delayed`,
      href: data.jobs.href,
    }),
    card('team', {
      id: 'team',
      label: 'Team Status',
      value: String(data.team.onSite + data.team.travelling + data.team.available),
      hint: `${data.team.available} available · ${data.team.travelling} travelling · ${data.team.onSite} on site · ${data.team.offDuty} off duty`,
      href: '/scheduling',
    }),
    card('money', {
      id: 'money',
      label: 'Money Today',
      value: formatMoney(data.money.paymentsTodayCents, data.money.currency),
      hint: `${formatMoney(data.money.invoicedTodayCents, data.money.currency)} invoiced · ${formatMoney(data.money.outstandingCents, data.money.currency)} outstanding · ${data.money.draftCount} drafts`,
      href: '/finance/invoices',
    }),
    card('customerActivity', {
      id: 'customers',
      label: 'Customer Activity',
      value: String(data.customerActivity.leads + data.customerActivity.followUps),
      hint: `${data.customerActivity.leads} leads · ${data.customerActivity.followUps} follow-ups · ${data.customerActivity.messages} messages · ${data.customerActivity.returning} returning`,
      href: '/crm',
    }),
  ];

  const degraded = sections
    ? (Object.values(sections).filter((entry) => entry.state !== 'live').length ?? 0)
    : 0;

  return (
    <section className="exec-dashboard-section exec-dashboard-kpi" aria-label="Key Metrics">
      <SummaryCardGrid columns={4} className="exec-dashboard-glance">
        {cards.map((entry) => (
          <Link key={entry.id} href={entry.href} className="exec-dashboard-glance__link">
            <StatCard label={entry.label} value={entry.value} hint={entry.hint} />
          </Link>
        ))}
      </SummaryCardGrid>
      <DashboardSourceMeta
        source="Jobs · Scheduling · Finance · CRM (executive summary)"
        updatedAt={generatedAt}
        state={degraded > 0 ? 'partial' : 'live'}
        note={
          degraded > 0
            ? `${degraded} of ${Object.keys(sections ?? {}).length} sections are not fully live — each card states its own status.`
            : null
        }
        href="/reports"
        linkLabel="Open reports"
      />
    </section>
  );
}
