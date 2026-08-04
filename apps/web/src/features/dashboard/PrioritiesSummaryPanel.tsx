import type { ExecutivePrioritiesSummary, ExecutiveSectionStatus } from '@titan/shared';
import { Link } from 'wouter';
import { Button, EmptyState, Panel } from '@titan/ui';
import { StatusBadge } from '../../components/ux';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';
import { DashboardSourceMeta } from './DashboardSourceMeta';
import { resolveSectionHonesty } from './dashboard-honesty';

type PrioritiesSummaryPanelProps = {
  priorities: ExecutivePrioritiesSummary | null;
  section?: ExecutiveSectionStatus | null;
  generatedAt?: string | null;
  isLoading?: boolean;
  error?: string | null;
};

function approvalLabel(state: 'awaiting_owner' | 'not_required'): string {
  return state === 'awaiting_owner' ? 'Awaiting owner approval' : 'No approval required';
}

export function PrioritiesSummaryPanel({
  priorities,
  section = null,
  generatedAt = null,
  isLoading = false,
  error = null,
}: PrioritiesSummaryPanelProps) {
  const honesty = resolveSectionHonesty(section, error);
  // Previously a null payload span the skeleton forever; an unreachable source is now stated.
  const sourceDown = honesty.state === 'unavailable';

  return (
    <Panel title="Today&apos;s Priorities" description="From Today&apos;s Plan — real M8 items only">
      <div className="exec-priorities">
        {isLoading ? (
          <DashboardSectionSkeleton rows={3} />
        ) : sourceDown || !priorities ? (
          <EmptyState
            title="Priorities Unavailable"
            description={
              honesty.note ??
              'Today’s Plan could not be reached. This is not the same as having no priorities.'
            }
            action={
              <Link href="/aura/todays-plan">
                <Button size="sm" variant="secondary">
                  Open Today&apos;s Plan
                </Button>
              </Link>
            }
          />
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
          source={section?.source ?? 'Today’s Plan · Automation runs · Invoices'}
          updatedAt={section?.updatedAt ?? generatedAt}
          state={honesty.state}
          note={honesty.note}
          href="/aura/todays-plan"
          linkLabel="Open Today’s Plan"
        />
      </div>
    </Panel>
  );
}
