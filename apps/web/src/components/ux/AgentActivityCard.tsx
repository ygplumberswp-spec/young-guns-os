type AgentActivityItem = {
  id: string;
  agentName: string;
  action: string;
  occurredAt: string;
};

type AgentActivityCardProps = {
  title?: string;
  activities: AgentActivityItem[];
};

export function AgentActivityCard({ title = 'Recent agent activity', activities }: AgentActivityCardProps) {
  return (
    <article className="ux-agent-activity-card">
      <h3 className="ux-agent-activity-card__title">{title}</h3>
      {activities.length === 0 ? (
        <p className="ux-agent-activity-card__empty">No agent activity recorded yet.</p>
      ) : (
        <ul style={{ margin: '0.5rem 0 0', padding: 0, listStyle: 'none' }}>
          {activities.map((activity) => (
            <li key={activity.id} style={{ padding: '0.375rem 0', borderTop: '1px solid var(--titan-border-subtle)' }}>
              <strong>{activity.agentName}</strong>
              <span className="ux-agent-activity-card__meta"> — {activity.action}</span>
              <div className="ux-agent-activity-card__meta">
                {new Date(activity.occurredAt).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export type { AgentActivityItem };
