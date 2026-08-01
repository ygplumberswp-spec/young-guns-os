import { useState } from 'react';
import { Button } from '@titan/ui';

type TypedDeleteDialogProps = {
  open: boolean;
  title: string;
  message: string;
  count: number;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Owner-only permanent delete — requires typing DELETE. */
export function TypedDeleteDialog({
  open,
  title,
  message,
  count,
  pending = false,
  onConfirm,
  onCancel,
}: TypedDeleteDialogProps) {
  const [typed, setTyped] = useState('');

  if (!open) return null;

  const canConfirm = typed === 'DELETE';

  return (
    <div className="ux-confirm-backdrop" role="presentation" onClick={pending ? undefined : onCancel}>
      <div
        className="ux-confirm-dialog"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="ux-confirm-dialog__title">{title}</h2>
        <p className="ux-confirm-dialog__body">
          {message}
          {'\n\n'}
          Permanently delete {count} record{count === 1 ? '' : 's'}? Type DELETE to confirm.
        </p>
        <label className="titan-input-group">
          <span className="titan-input-label">Type DELETE to confirm</span>
          <input
            className="titan-input"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className="ux-confirm-dialog__actions">
          <Button variant="ghost" type="button" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            type="button"
            disabled={!canConfirm || pending}
            onClick={() => {
              onConfirm();
              setTyped('');
            }}
          >
            {pending ? 'Deleting…' : 'Delete permanently'}
          </Button>
        </div>
      </div>
    </div>
  );
}
