import { Link } from 'wouter';
import type {
  BusinessHeartbeatSummary,
  ExecutiveSectionStatus,
} from '@titan/shared';
import { Panel } from '@titan/ui';
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

export function BusinessHeartbeatPanel({
  data,
  section = null,
  generatedAt = null,
  isLoading = false,
  error = null,
}: BusinessHeartbeatPanelProps) {
  const honesty = resolveSectionHonesty(section, error);
  const metrics = data?.metrics ?? [];

  return (
    <Panel
      title="Business Heartbeat"
      description="Live business pulse — jobs, cash and pipeline"
      className="exec-heartbeat-panel"
    >
      <div className="exec-heartbeat">
        {isLoading ? (
          <DashboardSectionSkeleton rows={2} />
        ) : (
          <div className="exec-heartbeat__grid">
            {metrics.map((metric) => {
              const content = (
                <>
                  <span className="exec-heartbeat__label">{metric.label}</span>
                  <span className="exec-heartbeat__value">
                    {metric.unavailable ? '—' : metric.value}
                  </span>
                  {metric.comparisonLabel ? (
                    <span className="exec-heartbeat__comparison">
                      {TREND_GLYPH[metric.trend] ? `${TREND_GLYPH[metric.trend]} ` : ''}
                      {metric.comparisonLabel}
                    </span>
                  ) : null}
                  {metric.estimate ? (
                    <span className="exec-heartbeat__estimate">Estimate</span>
                  ) : null}
                  <span className="exec-heartbeat__freshness">{metric.freshness}</span>
                </>
              );

              return metric.href && !metric.unavailable ? (
                <Link key={metric.key} href={metric.href} className="exec-heartbeat__card">
                  {content}
                </Link>
              ) : (
                <div key={metric.key} className="exec-heartbeat__card is-static">
                  {content}
                </div>
              );
            })}
          </div>
        )}
        <DashboardSourceMeta
          source={section?.source ?? 'Jobs · Finance · CRM'}
          updatedAt={section?.updatedAt ?? generatedAt}
          state={honesty.state}
          note={data?.freshness ?? honesty.note}
          href="/finance-cashflow-profit"
          linkLabel="Open finance"
        />
      </div>
    </Panel>
  );
}
