import { PageHeader } from '@titan/ui';

type DashboardWelcomeProps = {
  isLoading?: boolean;
  hasAnyData?: boolean;
  summaryLine?: string | null;
};

/** UX-012 — never claim “all metrics at zero” when live stats show work. */
export function DashboardWelcome({
  isLoading = false,
  hasAnyData = false,
  summaryLine = null,
}: DashboardWelcomeProps) {
  let status: string;
  if (isLoading) {
    status = 'Loading live metrics…';
  } else if (hasAnyData) {
    status = summaryLine?.trim() || 'Live metrics loaded from TITAN records';
  } else {
    status = 'No operational data yet — metrics will populate as you add customers, jobs and finance';
  }

  return (
    <div className="dashboard-header">
      <PageHeader title="Dashboard" description="Overview of your business activity" />
      <span className="dashboard-header__status">{status}</span>
    </div>
  );
}
