import type { DraftAutosaveStatus } from '../../hooks/useDraftAutosave';

type AutosaveIndicatorProps = {
  status: DraftAutosaveStatus;
  className?: string;
};

const LABELS: Record<DraftAutosaveStatus, string | null> = {
  idle: null,
  saving: 'Saving…',
  saved: 'Draft saved',
  failed: 'Save failed',
};

export function AutosaveIndicator({ status, className }: AutosaveIndicatorProps) {
  const label = LABELS[status];
  if (!label) return null;

  return (
    <p
      className={className ?? 'titan-autosave-indicator'}
      data-status={status}
      aria-live="polite"
    >
      {label}
    </p>
  );
}
