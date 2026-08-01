import { Button } from '@titan/ui';

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
  variant?: 'destructive' | 'default';
  mode?: 'confirm' | 'alert';
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  pending = false,
  variant = 'destructive',
  mode = 'confirm',
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="ux-confirm-backdrop"
      role="presentation"
      onClick={pending ? undefined : onCancel}
    >
      <div
        className="ux-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ux-confirm-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="ux-confirm-dialog-title" className="ux-confirm-dialog__title">
          {title}
        </h2>
        <p className="ux-confirm-dialog__body">{message}</p>
        <div className="ux-confirm-dialog__actions">
          {mode === 'confirm' ? (
            <Button
              variant="ghost"
              type="button"
              className="ux-confirm-dialog__cancel"
              disabled={pending}
              onClick={onCancel}
            >
              {cancelLabel}
            </Button>
          ) : null}
          <Button
            variant={variant === 'destructive' ? 'secondary' : 'primary'}
            type="button"
            className="ux-confirm-dialog__confirm"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
