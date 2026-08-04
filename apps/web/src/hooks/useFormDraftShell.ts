import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DraftRecordType } from '@titan/shared';
import { useDraftAutosave } from './useDraftAutosave';
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';
import { registerDirtyForm, unregisterDirtyForm } from '../lib/live-updates/dirty-form-registry';

type UseFormDraftShellOptions = {
  accessToken: string | null;
  userId: string | undefined;
  recordType: DraftRecordType;
  recordId?: string | null;
  enabled?: boolean;
  getPayload: () => Record<string, unknown>;
  getMeta?: () => {
    title?: string | null;
    customerLabel?: string | null;
    completionPct?: number | null;
  };
};

export function useFormDraftShell(options: UseFormDraftShellOptions) {
  const [isDirty, setIsDirty] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const markDirty = useCallback(() => {
    setIsDirty(true);
    setIsSaved(false);
  }, []);

  const autosave = useDraftAutosave({
    ...options,
    onDraftSaved: () => setIsSaved(true),
  });

  const guard = useUnsavedChangesGuard({
    isDirty,
    isSaved,
    onSaveDraft: autosave.saveNow,
    onDiscard: () => setIsDirty(false),
  });

  const touchField = useCallback(() => {
    markDirty();
    autosave.scheduleSave();
  }, [autosave, markDirty]);

  const dirtyFormId = useMemo(
    () => `${options.recordType}:${options.recordId ?? 'new'}`,
    [options.recordId, options.recordType],
  );

  useEffect(() => {
    if (isDirty) registerDirtyForm(dirtyFormId);
    else unregisterDirtyForm(dirtyFormId);
    return () => unregisterDirtyForm(dirtyFormId);
  }, [dirtyFormId, isDirty]);

  return {
    isDirty,
    isSaved,
    markDirty,
    touchField,
    autosave,
    guard,
    markSubmitted: () => {
      setIsDirty(false);
      setIsSaved(true);
    },
  };
}
