import type { ExecutivePrioritiesSummary } from '@titan/shared';
import { Link } from 'wouter';
import { Button, Panel } from '@titan/ui';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';

type PrioritiesSummaryPanelProps = {
  priorities: ExecutivePrioritiesSummary | null;
  isLoading?: boolean;
};

export function PrioritiesSummaryPanel({
  priorities,
  isLoading = false,
}: PrioritiesSummaryPanelProps) {
  return (
    <Panel title="Today&apos;s priorities" description="Summary only — details live in Today&apos;s Plan">
      {isLoading || !priorities ? (
        <DashboardSectionSkeleton rows={2} />
      ) : (
        <>
          <p className="exec-priorities-summary">{priorities.summaryLine}</p>
          <Link href="/aura/todays-plan">
            <Button size="sm" variant="secondary">
              Open Today&apos;s Plan
            </Button>
          </Link>
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
    </Panel>
  );
}
