import { Button, Panel } from '@titan/ui';
import type { SchedulingConflict, SchedulingConflictSuggestion } from '@titan/shared';

type ConflictWarningModalProps = {
  open: boolean;
  conflicts: SchedulingConflict[];
  suggestions: SchedulingConflictSuggestion[];
  onCancel: () => void;
  onProceed?: () => void;
  canOverride?: boolean;
};

export function ConflictWarningModal({
  open,
  conflicts,
  suggestions,
  onCancel,
  onProceed,
  canOverride = false,
}: ConflictWarningModalProps) {
  if (!open) return null;

  return (
    <div className="cal-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="cal-conflict-title">
      <Panel title="Scheduling conflicts detected" className="cal-modal">
        <h3 id="cal-conflict-title" className="visually-hidden">
          Scheduling conflicts
        </h3>
        <ul className="cal-modal__list">
          {conflicts.map((conflict, index) => (
            <li key={`${conflict.type}-${index}`}>{conflict.message}</li>
          ))}
        </ul>

        {suggestions.length > 0 ? (
          <>
            <p className="cal-modal__hint">Suggested alternatives:</p>
            <ul className="cal-modal__list">
              {suggestions.map((suggestion, index) => (
                <li key={`${suggestion.kind}-${index}`}>
                  {suggestion.label} — {new Date(suggestion.scheduledAt).toLocaleString()}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <div className="cal-modal__actions">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          {canOverride && onProceed ? (
            <Button variant="secondary" onClick={onProceed}>
              Override (Owner/Admin)
            </Button>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
