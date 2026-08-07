import { Link } from 'wouter';
import type { AuraExecutiveSummary } from '@titan/shared';
import { DASHBOARD_LIST_LIMITS } from '@titan/shared';
import { Button, EmptyState, Panel } from '@titan/ui';
import { DashboardDetailsDisclosure } from './DashboardDetailsDisclosure';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';
import { DashboardSourceMeta } from './DashboardSourceMeta';

type AuraExecutiveRecommendationsPanelProps = {
  data: AuraExecutiveSummary | null;
  isLoading?: boolean;
  error?: string | null;
};

const CONFIDENCE_LABELS = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
} as const;

export function AuraExecutiveRecommendationsPanel({
  data,
  isLoading = false,
  error = null,
}: AuraExecutiveRecommendationsPanelProps) {
  const recommendations = data?.recommendations ?? [];

  return (
    <Panel
      title="AURA Executive"
      description="Evidence-backed recommendations — Draft → Approve → Execute"
      headerAction={<Link href="/aura/todays-plan">Today&apos;s Plan</Link>}
    >
      <div className="exec-aura-recommendations">
        {isLoading ? (
          <DashboardSectionSkeleton rows={3} />
        ) : error ? (
          <EmptyState title="Recommendations unavailable" description={error} />
        ) : recommendations.length === 0 ? (
          <EmptyState
            title="No recommendations right now"
            description="AURA surfaces actions when real data indicates follow-up, assignment or review."
          />
        ) : (
          <ul className="exec-aura-recommendations__list">
            {recommendations.slice(0, DASHBOARD_LIST_LIMITS.auraRecommendations).map((rec) => (
              <li key={rec.id} className="exec-aura-recommendations__row">
                <div className="exec-aura-recommendations__content">
                  <strong>{rec.title}</strong>
                  <p className="exec-aura-recommendations__reason">{rec.reason}</p>
                  <p className="exec-aura-recommendations__impact">{rec.businessImpact}</p>
                  <p className="exec-aura-recommendations__meta">
                    <span>{CONFIDENCE_LABELS[rec.confidence]}</span>
                  </p>
                </div>
                <div className="exec-aura-recommendations__actions">
                  <Link href={rec.href}>
                    <Button size="sm" variant="secondary">
                      Open item
                    </Button>
                  </Link>
                  {rec.draftActionAvailable ? (
                    <span className="exec-aura-recommendations__draft">Draft action available</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {data?.freshness ? (
          <p className="exec-aura-recommendations__freshness">{data.freshness}</p>
        ) : null}
        <DashboardDetailsDisclosure>
          <DashboardSourceMeta
            source="AURA · Jobs · CRM · Finance"
            updatedAt={null}
            state="live"
            href="/aura/todays-plan"
            linkLabel="Open AURA"
            note={
              recommendations.length > 0
                ? recommendations.map((rec) => `${rec.title}: ${rec.source}`).join(' · ')
                : null
            }
          />
        </DashboardDetailsDisclosure>
      </div>
    </Panel>
  );
}
