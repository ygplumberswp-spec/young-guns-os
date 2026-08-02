import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildDraftKey,
  DEFAULT_DRAFT_DEBOUNCE_MS,
  sanitizeDraftPayload,
  type DraftRecordType,
} from '@titan/shared';
import { upsertDraft } from '../lib/drafts-api';

export type DraftAutosaveStatus = 'idle' | 'saving' | 'saved' | 'failed' | 'offline';

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
  const [status, setStatus] = useState<DraftAutosaveStatus>('idle');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const payloadRef = useRef(getPayload);
  const metaRef = useRef(getMeta);
  payloadRef.current = getPayload;
  metaRef.current = getMeta;

  const draftKey =
    userId != null ? buildDraftKey({ userId, recordType, recordId: recordId ?? null }) : null;

  useEffect(() => {
    function handleOnline() {
      setStatus((prev) => (prev === 'offline' ? 'idle' : prev));
    }
    function handleOffline() {
      setStatus('offline');
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setStatus('offline');
    }
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (!accessToken || !userId || !draftKey || !enabled) return false;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setStatus('offline');
      return false;
    }

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
        payload: sanitizeDraftPayload(payloadRef.current()),
      });
      setDraftId(draft.id);
      setLastSavedAt(draft.lastEditedAt);
      setStatus('saved');
      onDraftSaved?.(draft.id);
      return true;
    } catch {
      setStatus('failed');
      return false;
    }
  }, [accessToken, draftKey, enabled, onDraftSaved, recordId, recordType, userId]);

  const scheduleSave = useCallback(() => {
    if (!enabled || !accessToken || !userId) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setStatus('offline');
      return;
    }
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

  const statusLabel =
    status === 'saving'
      ? 'Saving…'
      : status === 'saved'
        ? lastSavedAt
          ? `Draft saved · ${new Date(lastSavedAt).toLocaleTimeString()}`
          : 'Draft saved'
        : status === 'failed'
          ? 'Save failed'
          : status === 'offline'
            ? 'Offline — draft not saved'
            : null;

  return {
    status,
    draftId,
    draftKey,
    lastSavedAt,
    scheduleSave,
    saveNow,
    statusLabel,
  };
}
