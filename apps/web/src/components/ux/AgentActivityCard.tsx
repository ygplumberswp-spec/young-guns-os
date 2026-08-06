import { fetchBackgroundWorkStatus } from '../../lib/background-work-api-client';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { BackgroundWorkStatusPanel } from '../../features/shared/BackgroundWorkStatusPanel';
import { StatusBadge } from './StatusBadge';

type AgentActivityCardProps = {
  title?: string;
  compact?: boolean;
  limit?: number;
};

/** Real background-work / agent activity only — no fabricated events. */
export function AgentActivityCard({
  title = 'Agent activity',
  compact = true,
  limit = 5,
}: AgentActivityCardProps) {
  const { accessToken } = useAuth();

  const { data, isLoading, error } = useStaffCachedQuery({
    queryKey: 'background-work/status',
    enabled: Boolean(accessToken),
    fetcher: async () => fetchBackgroundWorkStatus(accessToken!),
  });

  const items = (data?.items ?? []).slice(0, limit);

  if (isLoading && !data) {
    return (
      <div className="ux-agent-activity">
        <div className="ux-agent-activity__header">
          <h3 className="ux-agent-activity__title">{title}</h3>
          <StatusBadge label="Loading" tone="info" />
        </div>
        <p className="page-muted">Loading live agent activity…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ux-agent-activity">
        <div className="ux-agent-activity__header">
          <h3 className="ux-agent-activity__title">{title}</h3>
          <StatusBadge label="Unavailable" tone="warning" />
        </div>
        <p className="page-muted">Unable to load activity right now.</p>
      </div>
    );
  }

  return (
    <div className="ux-agent-activity">
      <BackgroundWorkStatusPanel items={items} compact={compact} title={title} />
    </div>
  );
}
