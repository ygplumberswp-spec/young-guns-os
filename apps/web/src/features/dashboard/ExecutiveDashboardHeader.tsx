import { Link } from 'wouter';
import type { Dash001DashboardExtensions, ExecutiveHeaderCounts } from '@titan/shared';
import { Button } from '@titan/ui';
import { buildGreetingSalutation } from '../../lib/intelligence-api';
import { QuickActionsDropdown } from './QuickActionsDropdown';

type ExecutiveDashboardHeaderProps = {
  firstName?: string | null;
  counts: ExecutiveHeaderCounts | null;
  headerExtended?: Dash001DashboardExtensions['headerExtended'] | null;
  isLoading?: boolean;
};

function formatHeaderSummary(counts: ExecutiveHeaderCounts): string {
  if (counts.businessSummary) return counts.businessSummary;
  return `${counts.jobsToday} jobs today · ${counts.prioritiesToday} priorities · ${counts.teamWorking} team working · ${counts.approvalsWaiting} approvals waiting`;
}

export function ExecutiveDashboardHeader({
  firstName,
  counts,
  headerExtended = null,
  isLoading = false,
}: ExecutiveDashboardHeaderProps) {
  const priorityCount = counts?.priorityCount ?? counts?.prioritiesToday ?? 0;
  const urgentCount = counts?.urgentAlertCount ?? 0;

  return (
    <header className="exec-dashboard-header">
      <div className="exec-dashboard-header__main">
        <div className="exec-dashboard-header__title-row">
          <h1 className="exec-dashboard-header__greeting">{buildGreetingSalutation(firstName)}</h1>
          {headerExtended?.greetingDate ? (
            <span className="exec-dashboard-header__date">{headerExtended.greetingDate}</span>
          ) : null}
        </div>
        {headerExtended?.companyName ? (
          <p className="exec-dashboard-header__company">{headerExtended.companyName}</p>
        ) : null}
        <p className="exec-dashboard-header__summary">
          {isLoading || !counts ? 'Loading live counts…' : formatHeaderSummary(counts)}
        </p>
        {!isLoading && counts ? (
          <div className="exec-dashboard-header__badges">
            {priorityCount > 0 ? (
              <span className="exec-dashboard-header__badge">{priorityCount} priorities</span>
            ) : null}
            {urgentCount > 0 ? (
              <span className="exec-dashboard-header__badge is-urgent">
                {urgentCount} urgent
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="exec-dashboard-header__actions">
        <Link href="/aura/todays-plan">
          <Button variant="secondary" size="sm">
            Open Today&apos;s Plan
          </Button>
        </Link>
        <QuickActionsDropdown />
      </div>
    </header>
  );
}
