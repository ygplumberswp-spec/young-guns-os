export type InlineSaveState = 'idle' | 'saving' | 'saved' | 'failed';

type InlineSaveIndicatorProps = {
  state: InlineSaveState;
  className?: string;
};

const LABELS: Record<InlineSaveState, string | null> = {
  idle: null,
  saving: 'Saving…',
  saved: 'Saved',
  failed: 'Save failed',
};

/** Compact inline save feedback for status changes. */
export function InlineSaveIndicator({ state, className }: InlineSaveIndicatorProps) {
  const label = LABELS[state];
  if (!label) return null;

  return (
    <span
      className={className ?? 'ux-inline-save'}
      data-state={state}
      aria-live="polite"
    >
      {label}
    </span>
  );
}
