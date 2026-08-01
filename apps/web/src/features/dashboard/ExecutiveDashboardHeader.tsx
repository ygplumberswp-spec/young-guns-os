import { Link } from 'wouter';
import type { ExecutiveHeaderCounts } from '@titan/shared';
import { Button } from '@titan/ui';
import { buildGreetingSalutation } from '../../lib/intelligence-api';
import { QuickActionsDropdown } from './QuickActionsDropdown';

type ExecutiveDashboardHeaderProps = {
  firstName?: string | null;
  counts: ExecutiveHeaderCounts | null;
  isLoading?: boolean;
};

function formatHeaderSummary(counts: ExecutiveHeaderCounts): string {
  return `${counts.jobsToday} jobs today · ${counts.prioritiesToday} priorities · ${counts.teamWorking} team working · ${counts.approvalsWaiting} approvals waiting`;
}

export function ExecutiveDashboardHeader({
  firstName,
  counts,
  isLoading = false,
}: ExecutiveDashboardHeaderProps) {
  return (
    <header className="exec-dashboard-header">
      <div className="exec-dashboard-header__main">
        <h1 className="exec-dashboard-header__greeting">{buildGreetingSalutation(firstName)}</h1>
        <p className="exec-dashboard-header__summary">
          {isLoading || !counts ? 'Loading live counts…' : formatHeaderSummary(counts)}
        </p>
      </div>
      <div className="exec-dashboard-header__actions">
        <Link href="/aura/todays-plan">
          <Button variant="secondary" size="sm">
            Open Today&apos;s Plan
          </Button>
        </Link>
        <QuickActionsDropdown />
        <Link href="/aura">
          <Button size="sm">Ask AURA</Button>
        </Link>
      </div>
    </header>
  );
}
