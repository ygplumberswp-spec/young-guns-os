import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildDraftKey,
  DEFAULT_DRAFT_DEBOUNCE_MS,
  type DraftRecordType,
} from '@titan/shared';
import { ApiClientError } from '../lib/api-client';
import { upsertDraft } from '../lib/drafts-api';
import { useTitanNotify } from '../components/ux/TitanNotifications';

export type DraftAutosaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

type UseDraftAutosaveOptions = {
  accessToken: string | null;
  userId: string | undefined;
  recordType: DraftRecordType;
  recordId?: string | null;
  enabled?: boolean;
  debounceMs?: number;
  getPayload: () => Record<string, unknown>;
  getMeta?: () => {
    title?: string | null;
    customerLabel?: string | null;
    completionPct?: number | null;
  };
  onDraftSaved?: (draftId: string) => void;
};

export function useDraftAutosave({
  accessToken,
  userId,
  recordType,
  recordId,
  enabled = true,
  debounceMs = DEFAULT_DRAFT_DEBOUNCE_MS,
  getPayload,
  getMeta,
  onDraftSaved,
}: UseDraftAutosaveOptions) {
  const { notify } = useTitanNotify();
  const [status, setStatus] = useState<DraftAutosaveStatus>('idle');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const payloadRef = useRef(getPayload);
  const metaRef = useRef(getMeta);
  payloadRef.current = getPayload;
  metaRef.current = getMeta;

  const draftKey =
    userId != null
      ? buildDraftKey({ userId, recordType, recordId: recordId ?? null })
      : null;

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (!accessToken || !userId || !draftKey || !enabled) return false;

    setStatus('saving');
    try {
      const meta = metaRef.current?.() ?? {};
      const draft = await upsertDraft(accessToken, {
        recordType,
        recordId: recordId ?? null,
        draftKey,
        title: meta.title,
        customerLabel: meta.customerLabel,
        completionPct: meta.completionPct,
        payload: payloadRef.current(),
      });
      setDraftId(draft.id);
      setLastSavedAt(draft.lastEditedAt);
      setStatus('saved');
      notify({
        variant: 'draft_saved',
        message: meta.title ? `Draft saved — ${meta.title}` : 'Draft saved',
        dedupeKey: `draft-${draftKey}`,
      });
      onDraftSaved?.(draft.id);
      return true;
    } catch (err) {
      setStatus('failed');
      notify({
        variant: 'failed',
        message:
          err instanceof ApiClientError ? err.message : 'Draft save failed — will retry on next edit',
        dedupeKey: `draft-fail-${draftKey}`,
      });
      return false;
    }
  }, [
    accessToken,
    draftKey,
    enabled,
    notify,
    onDraftSaved,
    recordId,
    recordType,
    userId,
  ]);

  const scheduleSave = useCallback(() => {
    if (!enabled || !accessToken || !userId) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void saveNow();
    }, debounceMs);
  }, [accessToken, debounceMs, enabled, saveNow, userId]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return {
    status,
    draftId,
    draftKey,
    lastSavedAt,
    scheduleSave,
    saveNow,
    statusLabel:
      status === 'saving'
        ? 'Saving…'
        : status === 'saved'
          ? 'Draft saved'
          : status === 'failed'
            ? 'Save failed'
            : null,
  };
}
