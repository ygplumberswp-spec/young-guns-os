import type { BackgroundWorkItemSummary } from '@titan/shared';
import { BACKGROUND_WORK_UI_STATE_LABELS } from '@titan/shared';

type BackgroundWorkStatusPanelProps = {
  items: BackgroundWorkItemSummary[];
  compact?: boolean;
  title?: string;
};

function stateModifier(state: BackgroundWorkItemSummary['uiState']): string {
  switch (state) {
    case 'up_to_date':
      return 'success';
    case 'updating':
    case 'waiting':
      return 'info';
    case 'partially_completed':
    case 'retry_scheduled':
      return 'warning';
    case 'failed':
    case 'reconnect_required':
      return 'warning';
    case 'provider_unavailable':
      return 'muted';
    default:
      return 'neutral';
  }
}

export function BackgroundWorkStatusPanel({
  items,
  compact = false,
  title = 'Background work',
}: BackgroundWorkStatusPanelProps) {
  if (items.length === 0) {
    return (
      <div className={compact ? 'background-work-panel background-work-panel--compact' : 'background-work-panel'}>
        <div className="background-work-panel__header">
          <strong>{title}</strong>
          <span className="status-pill status-pill--success">
            {BACKGROUND_WORK_UI_STATE_LABELS.up_to_date}
          </span>
        </div>
        <p className="page-muted">No active background jobs.</p>
      </div>
    );
  }

  return (
    <div className={compact ? 'background-work-panel background-work-panel--compact' : 'background-work-panel'}>
      <div className="background-work-panel__header">
        <strong>{title}</strong>
      </div>
      <ul className="integrations-list">
        {items.map((item) => (
          <li key={item.id} className="background-work-panel__item">
            <div className="background-work-panel__row">
              <span>{item.label}</span>
              <span className={`status-pill status-pill--${stateModifier(item.uiState)}`}>
                {item.uiStateLabel}
              </span>
            </div>
            {item.checkpoint?.stage ? (
              <p className="page-muted">
                Stage: {item.checkpoint.stage}
                {item.checkpoint.completedStages?.length
                  ? ` · completed: ${item.checkpoint.completedStages.join(', ')}`
                  : ''}
              </p>
            ) : null}
            {item.message ? <p className="form-error">{item.message}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
