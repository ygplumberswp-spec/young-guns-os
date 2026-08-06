import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Button } from '@titan/ui';

type UseUnsavedChangesGuardOptions = {
  isDirty: boolean;
  isSaved: boolean;
  onSaveDraft?: () => Promise<boolean>;
  onDiscard?: () => void;
};

type GuardModalState = {
  open: boolean;
  pendingAction: (() => void) | null;
};

export function useUnsavedChangesGuard({
  isDirty,
  isSaved,
  onSaveDraft,
  onDiscard,
}: UseUnsavedChangesGuardOptions) {
  const [modal, setModal] = useState<GuardModalState>({ open: false, pendingAction: null });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isDirty || isSaved) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, isSaved]);

  const guardNavigation = useCallback(
    (action: () => void) => {
      if (!isDirty || isSaved) {
        action();
        return;
      }
      setModal({ open: true, pendingAction: action });
    },
    [isDirty, isSaved],
  );

  const closeModal = useCallback(() => {
    setModal({ open: false, pendingAction: null });
  }, []);

  const stay = useCallback(() => {
    closeModal();
  }, [closeModal]);

  const discardAndLeave = useCallback(() => {
    onDiscard?.();
    const action = modal.pendingAction;
    closeModal();
    action?.();
  }, [closeModal, modal.pendingAction, onDiscard]);

  const saveDraftAndLeave = useCallback(async () => {
    if (!onSaveDraft) {
      discardAndLeave();
      return;
    }
    setIsSaving(true);
    try {
      const ok = await onSaveDraft();
      if (!ok) return;
      const action = modal.pendingAction;
      closeModal();
      action?.();
    } finally {
      setIsSaving(false);
    }
  }, [closeModal, discardAndLeave, modal.pendingAction, onSaveDraft]);

  const modalNode: ReactNode = modal.open ? (
    <div className="ux-guard-backdrop" role="presentation" onClick={stay}>
      <div
        className="ux-guard-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="unsaved-changes-title" className="ux-guard-modal__title">
          Unsaved changes
        </h2>
        <p className="ux-guard-modal__body">
          You have unsaved edits. Save a draft, stay on this page, or discard your latest changes.
        </p>
        <div className="ux-guard-modal__actions">
          <Button variant="secondary" type="button" onClick={stay}>
            Stay
          </Button>
          {onSaveDraft ? (
            <Button type="button" disabled={isSaving} onClick={() => void saveDraftAndLeave()}>
              {isSaving ? 'Saving…' : 'Save draft and leave'}
            </Button>
          ) : null}
          <Button variant="secondary" type="button" onClick={discardAndLeave}>
            Discard latest unsaved
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  return {
    guardNavigation,
    unsavedChangesModal: modalNode,
    hasUnsavedChanges: isDirty && !isSaved,
  };
}
