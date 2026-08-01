import { Link } from 'wouter';
import type {
  MissionControlModuleSnapshot,
  MissionControlRecommendationSummary,
} from '@titan/shared';
import { Button, Panel } from '@titan/ui';
import { AI_NAME } from '@titan/shared';
import {
  COMPANY_HEALTH_FOCUS_AREAS,
  businessImpactForStatus,
  findAreaRecommendation,
  resolveFocusAreaSnapshot,
} from './company-health-areas';
import { formatStatus } from './utils';

type CompanyHealthAreasGridProps = {
  snapshots: MissionControlModuleSnapshot[];
  recommendations: MissionControlRecommendationSummary[];
};

export function CompanyHealthAreasGrid({
  snapshots,
  recommendations,
}: CompanyHealthAreasGridProps) {
  return (
    <div className="company-health-areas" role="list">
      {COMPANY_HEALTH_FOCUS_AREAS.map((area) => {
        const snapshot = resolveFocusAreaSnapshot(area, snapshots);
        const status = snapshot?.status ?? 'unknown';
        const condition = snapshot?.summary ?? 'No live signal yet — check connected modules.';
        const recommendation = findAreaRecommendation(area, recommendations);
        const manageHref =
          typeof snapshot?.metrics.manageHref === 'string'
            ? snapshot.metrics.manageHref
            : area.manageHref;

        return (
          <Panel key={area.id} title={area.label} className="company-health-area">
            <div className="company-health-area__header">
              <span className={`status-pill status-pill--${status}`}>
                {formatStatus(status)}
              </span>
            </div>

            <dl className="company-health-area__details">
              <div>
                <dt>Current condition</dt>
                <dd>{condition}</dd>
              </div>
              <div>
                <dt>Business impact</dt>
                <dd>{businessImpactForStatus(status, area.impactHint)}</dd>
              </div>
              <div>
                <dt>What {AI_NAME} is doing</dt>
                <dd>
                  {recommendation
                    ? recommendation.recommendation
                    : status === 'healthy'
                      ? 'Monitoring signals and will surface actions if conditions change.'
                      : 'Reviewing alerts and preparing owner recommendations.'}
                </dd>
              </div>
            </dl>

            <div className="company-health-area__actions">
              <Link href={manageHref}>
                <Button variant="secondary" size="sm">
                  Review &amp; approve
                </Button>
              </Link>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
