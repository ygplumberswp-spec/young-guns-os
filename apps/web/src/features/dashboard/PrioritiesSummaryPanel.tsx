import type {
  ExecutivePriorityItem,
  ExecutivePrioritiesSummary,
  ExecutiveSectionStatus,
} from '@titan/shared';
import { Link } from 'wouter';
import { Button, EmptyState, Panel } from '@titan/ui';
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

type PriorityLevel = { key: 'high' | 'medium' | 'low'; label: string };

/**
 * Today's Plan records two priority levels, `high` and `normal`. The amber middle band is
 * therefore driven by a different real field — an item the Owner still has to approve is
 * genuinely more pressing than one that is simply on the list. Nothing here invents a
 * level the plan does not hold.
 */
function priorityLevel(item: ExecutivePriorityItem): PriorityLevel {
  if (item.priority === 'high') return { key: 'high', label: 'High' };
  if (item.approvalState === 'awaiting_owner') return { key: 'medium', label: 'Needs approval' };
  return { key: 'low', label: 'Normal' };
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
  const items = priorities?.items ?? [];
  const criticalIssues = priorities?.criticalIssues ?? [];

  return (
    <Panel
      title="Today&apos;s Priorities"
      description="From Today&apos;s Plan"
      headerAction={<Link href="/aura/todays-plan">View all</Link>}
    >
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
        ) : items.length === 0 && criticalIssues.length === 0 ? (
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
            <ul className="exec-priorities-list">
              {criticalIssues.map((issue) => (
                <li key={issue.id} className="exec-priorities-list__row is-high">
                  <Link href={issue.href} className="exec-priorities-list__link">
                    <span className="exec-priorities-list__text">
                      <strong>{issue.title}</strong>
                      <em>{issue.description}</em>
                    </span>
                    <span className="exec-priorities-list__level is-high">Critical</span>
                  </Link>
                </li>
              ))}
              {items.map((item) => {
                const level = priorityLevel(item);
                return (
                  <li key={item.id} className={`exec-priorities-list__row is-${level.key}`}>
                    <Link href={item.href} className="exec-priorities-list__link">
                      <span className="exec-priorities-list__text">
                        <strong>{item.reason}</strong>
                        {item.suggestedAction && item.suggestedAction !== item.reason ? (
                          <em>{item.suggestedAction}</em>
                        ) : null}
                      </span>
                      <span className={`exec-priorities-list__level is-${level.key}`}>
                        {level.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="exec-priorities-summary">{priorities.summaryLine}</p>
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
