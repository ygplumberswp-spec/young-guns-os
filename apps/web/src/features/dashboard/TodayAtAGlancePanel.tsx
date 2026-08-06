import { Link } from 'wouter';
import type { ExecutiveDashboardSummary, FleetTrackingContext } from '@titan/shared';
import { Button, Panel } from '@titan/ui';
import { useCompanyLocale } from '../../lib/company-locale-context';
import { DashboardDetailsDisclosure } from './DashboardDetailsDisclosure';
import { DashboardFreshnessFooter } from './DashboardFreshnessFooter';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';
import { DashboardSourceMeta } from './DashboardSourceMeta';
import { isSectionCountable } from './dashboard-honesty';

type TodayAtAGlancePanelProps = {
  summary: ExecutiveDashboardSummary | null;
  tracking: FleetTrackingContext | null;
  fleetError?: string | null;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

/** A vehicle counts as moving only on a real recorded road speed. */
const MOVING_SPEED_KMH = 3;

type GlanceMetric = {
  id: string;
  label: string;
  value: string;
  hint: string | null;
};

export function TodayAtAGlancePanel({
  summary,
  tracking,
  fleetError = null,
  isLoading = false,
  error = null,
  onRetry,
}: TodayAtAGlancePanelProps) {
  const { formatMoney } = useCompanyLocale();
  const glance = summary?.todayAtAGlance ?? null;
  const outstanding = summary?.outstandingInvoices ?? null;
  const sections = summary?.sections ?? null;

  // A section that did not resolve shows an em dash. A zero here would read as a real
  // business figure, and "no jobs today" is a very different statement from "we could
  // not read the jobs table".
  const jobsReadable = isSectionCountable(sections?.todayAtAGlance);
  const moneyReadable = isSectionCountable(sections?.outstandingInvoices);
  const teamReadable = isSectionCountable(sections?.team);

  const jobsToday = glance
    ? glance.jobs.scheduled + glance.jobs.inProgress + glance.jobs.completed
    : null;

  const movingVehicles = tracking
    ? tracking.latestPositions.filter(
        (position) =>
          typeof position.speedKmh === 'number' && position.speedKmh >= MOVING_SPEED_KMH,
      ).length
    : null;

  const metrics: GlanceMetric[] = [
    {
      id: 'jobs-today',
      label: 'Jobs today',
      value: jobsReadable && glance ? String(jobsToday) : '—',
      hint: jobsReadable && glance ? `${glance.jobs.scheduled} scheduled` : 'Jobs source unavailable',
    },
    {
      id: 'completed-today',
      label: 'Completed today',
      value: jobsReadable && glance ? String(glance.jobs.completed) : '—',
      hint: jobsReadable && glance && glance.jobs.delayed > 0 ? `${glance.jobs.delayed} delayed` : null,
    },
    {
      id: 'active-jobs',
      label: 'Active jobs',
      value: jobsReadable && glance ? String(glance.jobs.inProgress) : '—',
      hint:
        jobsReadable && glance
          ? glance.jobs.inProgress === 0
            ? 'None in progress'
            : 'In progress now'
          : null,
    },
    {
      id: 'outstanding',
      label: 'Outstanding',
      value:
        moneyReadable && outstanding
          ? formatMoney(outstanding.outstandingCents, outstanding.currency)
          : '—',
      hint:
        moneyReadable && outstanding
          ? `${outstanding.invoiceCount} open · ${outstanding.overdueCount} overdue`
          : 'Open AR unavailable',
    },
    {
      id: 'technicians',
      label: 'Technicians working',
      value: teamReadable && summary ? String(summary.header.teamWorking) : '—',
      hint: teamReadable ? null : 'Team source unavailable',
    },
    {
      id: 'vehicles-moving',
      label: 'Vehicles moving',
      value: movingVehicles == null ? '—' : String(movingVehicles),
      hint:
        movingVehicles == null
          ? (fleetError ?? 'Cartrack position feed unavailable')
          : tracking && tracking.latestPositions.length > 0
            ? `of ${tracking.latestPositions.length} tracked`
            : 'No stored positions',
    },
  ];

  const degraded = sections
    ? Object.values(sections).filter((entry) => entry.state !== 'live').length
    : 0;

  return (
    <Panel
      title="Today At A Glance"
      description="Executive snapshot — live values only"
      headerAction={<Link href="/reports">View all</Link>}
    >
      {isLoading && !glance ? (
        <DashboardSectionSkeleton rows={4} />
      ) : error && !glance ? (
        <div className="exec-dashboard-section__error">
          <p>{error}</p>
          {onRetry ? (
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="exec-glance-grid">
          {metrics.map((metric) => (
            <li key={metric.id} className="exec-glance-grid__item">
              <span className="exec-glance-grid__label">{metric.label}</span>
              <strong className="exec-glance-grid__value">{metric.value}</strong>
              {metric.hint ? (
                <em className="exec-glance-grid__hint">{metric.hint}</em>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <DashboardFreshnessFooter
        updatedAt={summary?.generatedAt ?? null}
        state={!glance ? 'unavailable' : degraded > 0 ? 'partial' : 'live'}
      />
      <DashboardDetailsDisclosure>
        <DashboardSourceMeta
          source="Jobs · Finance · Team · Cartrack positions"
          updatedAt={summary?.generatedAt ?? null}
          state={!glance ? 'unavailable' : degraded > 0 ? 'partial' : 'live'}
          href="/reports"
          linkLabel="Open reports"
          note={
            degraded > 0
              ? `${degraded} source(s) are not fully live — figures they feed show a dash rather than a zero.`
              : null
          }
        />
      </DashboardDetailsDisclosure>
    </Panel>
  );
}
