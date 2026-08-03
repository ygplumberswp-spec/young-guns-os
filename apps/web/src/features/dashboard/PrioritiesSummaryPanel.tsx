import type { ExecutivePrioritiesSummary } from '@titan/shared';
import { Link } from 'wouter';
import { Button, EmptyState, Panel } from '@titan/ui';
import { StatusBadge } from '../../components/ux';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';
import { DashboardSourceMeta } from './DashboardSourceMeta';

type PrioritiesSummaryPanelProps = {
  priorities: ExecutivePrioritiesSummary | null;
  generatedAt?: string | null;
  isLoading?: boolean;
};

function approvalLabel(state: 'awaiting_owner' | 'not_required'): string {
  return state === 'awaiting_owner' ? 'Awaiting owner approval' : 'No approval required';
}

export function PrioritiesSummaryPanel({
  priorities,
  generatedAt = null,
  isLoading = false,
}: PrioritiesSummaryPanelProps) {
  return (
    <Panel title="Today&apos;s Priorities" description="From Today&apos;s Plan — real M8 items only">
      <div className="exec-priorities">
        {isLoading || !priorities ? (
          <DashboardSectionSkeleton rows={3} />
        ) : (priorities.items?.length ?? 0) === 0 &&
          priorities.criticalIssues.length === 0 ? (
          <EmptyState
            title="All Clear For Today"
            description={priorities.summaryLine}
            action={
              <Link href="/aura/todays-plan">
                <Button size="sm" variant="secondary">
                  Open Today&apos;s Plan
                </Button>
              </Link>
            }
          />
        ) : (
          <>
            <div className="exec-priorities__summary-row">
              <p className="exec-priorities-summary">{priorities.summaryLine}</p>
              <Link href="/aura/todays-plan">
                <Button size="sm" variant="secondary">
                  Open Today&apos;s Plan
                </Button>
              </Link>
            </div>

            {(priorities.items?.length ?? 0) > 0 ? (
              <ul className="exec-priorities-items">
                {(priorities.items ?? []).map((item) => (
                  <li key={item.id} className="exec-priorities-items__card">
                    <div className="exec-priorities-items__head">
                      <StatusBadge
                        tone={item.priority === 'high' ? 'warning' : 'neutral'}
                        label={item.priority === 'high' ? 'High priority' : 'Normal priority'}
                      />
                      <StatusBadge
                        tone={item.approvalState === 'awaiting_owner' ? 'warning' : 'success'}
                        label={approvalLabel(item.approvalState)}
                      />
                    </div>
                    <Link href={item.href}>
                      <strong>{item.reason}</strong>
                    </Link>
                    <p className="exec-priorities-items__action">
                      <span>Suggested action</span>
                      {item.suggestedAction}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}

            {priorities.criticalIssues.length > 0 ? (
              <ul className="exec-priorities-critical">
                {priorities.criticalIssues.map((issue) => (
                  <li key={issue.id}>
                    <Link href={issue.href}>
                      <strong>{issue.title}</strong>
                    </Link>
                    <span>{issue.description}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
        <DashboardSourceMeta
          source="Today&apos;s Plan · Automation runs · Invoices"
          updatedAt={generatedAt}
          state={priorities ? 'live' : 'unavailable'}
          href="/aura/todays-plan"
          linkLabel="Open Today&apos;s Plan"
        />
      </div>
    </Panel>
  );
}
