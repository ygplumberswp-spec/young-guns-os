import type { ExecutiveTeamMember } from '@titan/shared';
import { EmptyState, Panel } from '@titan/ui';
import { StatusBadge } from '../../components/ux';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';

type TeamTodayPanelProps = {
  members: ExecutiveTeamMember[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

const STATUS_LABELS: Record<ExecutiveTeamMember['status'], string> = {
  working: 'Working',
  available: 'Available',
  travelling: 'Travelling',
  on_site: 'On site',
  off_duty: 'Off duty',
  leave: 'Unavailable',
};

function statusTone(status: ExecutiveTeamMember['status']): 'info' | 'success' | 'warning' | 'neutral' {
  if (status === 'on_site' || status === 'working') return 'info';
  if (status === 'available') return 'success';
  if (status === 'travelling') return 'warning';
  return 'neutral';
}

export function TeamTodayPanel({
  members,
  isLoading = false,
  error = null,
  onRetry,
}: TeamTodayPanelProps) {
  return (
    <Panel title="Team today" description="Field team status — no payroll or HR data">
      {isLoading ? (
        <DashboardSectionSkeleton rows={4} />
      ) : error ? (
        <EmptyState
          title="Unable to load team status"
          description={error}
          action={
            onRetry ? (
              <button type="button" className="exec-dashboard-retry" onClick={onRetry}>
                Retry
              </button>
            ) : undefined
          }
        />
      ) : members.length === 0 ? (
        <EmptyState
          title="No team members on the roster"
          description="Active team members will appear here when assigned to today's jobs."
        />
      ) : (
        <ul className="exec-team-today">
          {members.map((member) => (
            <li key={member.userId} className="exec-team-today__row">
              <div>
                <strong>{member.name}</strong>
                <p className="exec-team-today__task">
                  {member.currentTask ? `Now: ${member.currentTask}` : 'No active task'}
                  {member.nextTask ? ` · Next: ${member.nextTask}` : ''}
                </p>
              </div>
              <div className="exec-team-today__status">
                <StatusBadge tone={statusTone(member.status)} label={STATUS_LABELS[member.status]} />
                {member.isLate ? <StatusBadge tone="warning" label="Late" /> : null}
                {member.missingCheckIn ? (
                  <StatusBadge tone="warning" label="Missing check-in" />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
