import { Link } from 'wouter';
import type { ExecutiveSectionStatus, TeamPerformanceSummary } from '@titan/shared';
import { EmptyState, Panel } from '@titan/ui';
import { DashboardDetailsDisclosure } from './DashboardDetailsDisclosure';
import { DashboardFreshnessFooter } from './DashboardFreshnessFooter';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';
import { DashboardSourceMeta } from './DashboardSourceMeta';
import { resolveSectionHonesty } from './dashboard-honesty';

type TeamPerformancePanelProps = {
  data: TeamPerformanceSummary | null;
  section?: ExecutiveSectionStatus | null;
  generatedAt?: string | null;
  isLoading?: boolean;
  error?: string | null;
};

export function TeamPerformancePanel({
  data,
  section = null,
  generatedAt = null,
  isLoading = false,
  error = null,
}: TeamPerformancePanelProps) {
  const honesty = resolveSectionHonesty(section, error);
  const members = data?.members ?? [];

  return (
    <Panel
      title="Team Performance"
      description="Operational productivity today"
      headerAction={<Link href="/team">View team</Link>}
    >
      <div className="exec-team-performance">
        {isLoading ? (
          <DashboardSectionSkeleton rows={3} />
        ) : (
          <>
            <div className="exec-team-performance__stats">
              <div className="exec-team-performance__stat">
                <span className="exec-team-performance__stat-label">Working today</span>
                <span className="exec-team-performance__stat-value">
                  {data?.techniciansWorkingToday ?? '—'}
                </span>
              </div>
              <div className="exec-team-performance__stat">
                <span className="exec-team-performance__stat-label">Jobs assigned</span>
                <span className="exec-team-performance__stat-value">{data?.jobsAssigned ?? '—'}</span>
              </div>
              <div className="exec-team-performance__stat">
                <span className="exec-team-performance__stat-label">Completed</span>
                <span className="exec-team-performance__stat-value">{data?.jobsCompleted ?? '—'}</span>
              </div>
              {(data?.unassignedJobs ?? 0) > 0 ? (
                <div className="exec-team-performance__stat is-warn">
                  <span className="exec-team-performance__stat-label">Unassigned</span>
                  <span className="exec-team-performance__stat-value">{data!.unassignedJobs}</span>
                </div>
              ) : null}
            </div>
            {members.length === 0 ? (
              <EmptyState
                title="No team activity recorded"
                description="Technician status will appear when jobs are assigned and time is logged."
                action={
                  <Link href="/scheduling">
                    <span className="exec-source-meta__link">Open scheduling</span>
                  </Link>
                }
              />
            ) : (
              <ul className="exec-team-performance__list">
                {members.map((member) => (
                  <li
                    key={member.userId}
                    className={`exec-team-performance__row${member.isDelayed ? ' is-delayed' : ''}`}
                  >
                    <Link href={member.href} className="exec-team-performance__link">
                      <span className="exec-team-performance__name">{member.name}</span>
                      <span className="exec-team-performance__status">{member.statusLabel}</span>
                      <span className="exec-team-performance__jobs">
                        {member.jobsAssigned} assigned
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <DashboardFreshnessFooter
          updatedAt={section?.updatedAt ?? generatedAt}
          state={honesty.state}
          label={data?.freshness ?? undefined}
        />
        <DashboardDetailsDisclosure>
          <DashboardSourceMeta
            source={section?.source ?? 'Team · Jobs'}
            updatedAt={section?.updatedAt ?? generatedAt}
            state={honesty.state}
            note={data?.freshness ?? honesty.note}
            href="/team"
            linkLabel="Open team"
          />
        </DashboardDetailsDisclosure>
      </div>
    </Panel>
  );
}
