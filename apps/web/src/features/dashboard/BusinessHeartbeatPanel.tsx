import { Link } from 'wouter';
import type {
  BusinessHeartbeatMetric,
  BusinessHeartbeatSummary,
  ExecutiveSectionStatus,
} from '@titan/shared';
import { Panel } from '@titan/ui';
import { DashboardDetailsDisclosure } from './DashboardDetailsDisclosure';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';
import { DashboardSourceMeta } from './DashboardSourceMeta';
import { resolveSectionHonesty } from './dashboard-honesty';

type BusinessHeartbeatPanelProps = {
  data: BusinessHeartbeatSummary | null;
  section?: ExecutiveSectionStatus | null;
  generatedAt?: string | null;
  isLoading?: boolean;
  error?: string | null;
};

const TREND_GLYPH: Record<string, string> = {
  up: '↑',
  down: '↓',
  flat: '→',
  unknown: '',
};

function HeartbeatCard({ metric }: { metric: BusinessHeartbeatMetric }) {
  const content = (
    <>
      <span className="exec-heartbeat__label">{metric.label}</span>
      <span className="exec-heartbeat__value">{metric.value}</span>
      {metric.comparisonLabel ? (
        <span className="exec-heartbeat__comparison">
          {TREND_GLYPH[metric.trend] ? `${TREND_GLYPH[metric.trend]} ` : ''}
          {metric.comparisonLabel}
        </span>
      ) : null}
      {metric.estimate ? <span className="exec-heartbeat__estimate">Estimate</span> : null}
    </>
  );

  if (metric.href && !metric.unavailable) {
    return (
      <Link href={metric.href} className="exec-heartbeat__card exec-heartbeat__card--primary">
        {content}
      </Link>
    );
  }

  return (
    <div className="exec-heartbeat__card exec-heartbeat__card--primary is-static">
      {content}
    </div>
  );
}

function SecondaryCard({ metric }: { metric: BusinessHeartbeatMetric }) {
  const content = (
    <>
      <span className="exec-heartbeat__label">{metric.label}</span>
      <span className="exec-heartbeat__value exec-heartbeat__value--secondary">{metric.value}</span>
    </>
  );

  if (metric.href && !metric.unavailable) {
    return (
      <Link href={metric.href} className="exec-heartbeat__card exec-heartbeat__card--secondary">
        {content}
      </Link>
    );
  }

  return (
    <div className="exec-heartbeat__card exec-heartbeat__card--secondary is-static">
      {content}
    </div>
  );
}

export function BusinessHeartbeatPanel({
  data,
  section = null,
  generatedAt = null,
  isLoading = false,
  error = null,
}: BusinessHeartbeatPanelProps) {
  const honesty = resolveSectionHonesty(section, error);
  const primary = data?.primaryMetrics ?? [];
  const secondary = data?.secondaryMetrics ?? [];

  return (
    <Panel title="Business Heartbeat" description="Jobs, cash and pipeline at a glance">
      <div className="exec-heartbeat">
        {isLoading ? (
          <DashboardSectionSkeleton rows={2} />
        ) : (
          <>
            <div className="exec-heartbeat__primary-grid">
              {primary.map((metric) => (
                <HeartbeatCard key={metric.key} metric={metric} />
              ))}
            </div>
            {secondary.length > 0 ? (
              <div className="exec-heartbeat__secondary-band">
                <p className="exec-heartbeat__secondary-title">Pipeline</p>
                <div className="exec-heartbeat__secondary-grid">
                  {secondary.map((metric) => (
                    <SecondaryCard key={metric.key} metric={metric} />
                  ))}
                </div>
              </div>
            ) : null}
            {data?.freshness === 'Some earlier records are still being imported' ? (
              <p className="exec-heartbeat__import-note">
                Some earlier financial records are still being imported.
              </p>
            ) : null}
          </>
        )}
        <DashboardDetailsDisclosure>
          <DashboardSourceMeta
            source={section?.source ?? 'Jobs · Finance · CRM'}
            updatedAt={section?.updatedAt ?? generatedAt}
            state={honesty.state === 'partial' ? 'live' : honesty.state}
            note={
              honesty.state === 'partial'
                ? 'Some earlier financial records are still being imported.'
                : honesty.note
            }
            href="/finance/owner-command"
            linkLabel="Open Financial Command"
          />
        </DashboardDetailsDisclosure>
      </div>
    </Panel>
  );
}
