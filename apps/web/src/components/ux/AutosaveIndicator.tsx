import type { DraftAutosaveStatus } from '../../hooks/useDraftAutosave';

type AutosaveIndicatorProps = {
  status: DraftAutosaveStatus;
  lastSavedAt?: string | null;
  className?: string;
};

const LABELS: Record<DraftAutosaveStatus, string | null> = {
  idle: null,
  saving: 'Saving…',
  saved: 'Draft saved',
  failed: 'Save failed — draft was not persisted',
  offline: 'Offline — draft not saved',
};

export function AutosaveIndicator({ status, lastSavedAt, className }: AutosaveIndicatorProps) {
  const label = LABELS[status];
  if (!label) return null;

  const timestamp =
    status === 'saved' && lastSavedAt
      ? ` · ${new Date(lastSavedAt).toLocaleTimeString()}`
      : '';

  return (
    <p
      className={className ?? 'titan-autosave-indicator'}
      data-status={status}
      aria-live="polite"
    >
      {label}
      {timestamp}
    </p>
  );
}
