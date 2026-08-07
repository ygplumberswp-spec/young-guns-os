import {
  DISPATCHER_STATUS_FLOW,
  formatDispatcherStatusLabel,
  type DispatcherStatusStep,
} from '@titan/shared';

type DispatcherStatusFlowProps = {
  current: DispatcherStatusStep;
  compact?: boolean;
};

export function DispatcherStatusFlow({ current, compact = false }: DispatcherStatusFlowProps) {
  const currentIndex = DISPATCHER_STATUS_FLOW.indexOf(current);

  return (
    <ol
      className="dispatcher-status-flow"
      aria-label={`Technician status: ${formatDispatcherStatusLabel(current)}`}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: compact ? '0.25rem' : '0.35rem',
        listStyle: 'none',
        margin: 0,
        padding: 0,
      }}
    >
      {DISPATCHER_STATUS_FLOW.map((step, index) => {
        const active = step === current;
        const passed = index < currentIndex;
        return (
          <li key={step}>
            <span
              className={`status-pill ${
                active
                  ? 'status-pill--connected'
                  : passed
                    ? 'status-pill--pending'
                    : 'status-pill--disabled'
              }`}
              style={{ fontSize: compact ? '0.7rem' : undefined }}
            >
              {formatDispatcherStatusLabel(step)}
            </span>
            {index < DISPATCHER_STATUS_FLOW.length - 1 ? (
              <span className="page-muted" aria-hidden="true" style={{ marginLeft: '0.25rem' }}>
                →
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
