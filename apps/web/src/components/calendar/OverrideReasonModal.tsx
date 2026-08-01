import { FormEvent, useState } from 'react';
import { Button, Input, Panel } from '@titan/ui';

type OverrideReasonModalProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  isSaving?: boolean;
};

export function OverrideReasonModal({
  open,
  onCancel,
  onConfirm,
  isSaving = false,
}: OverrideReasonModalProps) {
  const [reason, setReason] = useState('');

  if (!open) return null;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) return;
    onConfirm(reason.trim());
  }

  return (
    <div className="cal-modal-backdrop" role="dialog" aria-modal="true">
      <Panel title="Override scheduling conflict" className="cal-modal">
        <p className="page-muted">
          Owner/Admin override requires a reason. This is recorded in the scheduling audit log.
        </p>
        <form onSubmit={handleSubmit}>
          <Input
            label="Override reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
          />
          <div className="cal-modal__actions">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || !reason.trim()}>
              {isSaving ? 'Saving…' : 'Confirm override'}
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
