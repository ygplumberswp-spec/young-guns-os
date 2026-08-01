import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_NOTIFY_DEDUPE_MS } from '@titan/shared';

export type TitanNotifyVariant =
  | 'saved'
  | 'draft_saved'
  | 'approved'
  | 'declined'
  | 'archived'
  | 'deleted'
  | 'failed'
  | 'sync_pending'
  | 'sync_completed'
  | 'approval_required';

export type TitanToast = {
  id: string;
  variant: TitanNotifyVariant;
  message: string;
  dedupeKey?: string;
  undo?: () => void | Promise<void>;
};

type NotifyInput = {
  variant: TitanNotifyVariant;
  message: string;
  dedupeKey?: string;
  undo?: () => void | Promise<void>;
  durationMs?: number;
};

type TitanNotifyContextValue = {
  notify: (input: NotifyInput) => string;
  dismiss: (id: string) => void;
};

const TitanNotifyContext = createContext<TitanNotifyContextValue | null>(null);

const VARIANT_LABEL: Record<TitanNotifyVariant, string> = {
  saved: 'Saved',
  draft_saved: 'Draft saved',
  approved: 'Approved',
  declined: 'Declined',
  archived: 'Archived',
  deleted: 'Deleted',
  failed: 'Failed',
  sync_pending: 'Sync pending',
  sync_completed: 'Sync completed',
  approval_required: 'Approval required',
};

function toastId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Dedupe helper exported for tests. */
export function shouldDedupeNotify(
  existing: TitanToast[],
  dedupeKey: string | undefined,
  windowMs: number,
  now: number,
  recentKeys: Map<string, number>,
): boolean {
  if (!dedupeKey) return false;
  const last = recentKeys.get(dedupeKey);
  if (last != null && now - last < windowMs) return true;
  return existing.some((toast) => toast.dedupeKey === dedupeKey);
}

export function TitanNotificationsProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<TitanToast[]>([]);
  const recentKeysRef = useRef(new Map<string, number>());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (input: NotifyInput): string => {
      const now = Date.now();
      if (
        shouldDedupeNotify(
          toasts,
          input.dedupeKey,
          DEFAULT_NOTIFY_DEDUPE_MS,
          now,
          recentKeysRef.current,
        )
      ) {
        return '';
      }

      if (input.dedupeKey) {
        recentKeysRef.current.set(input.dedupeKey, now);
      }

      const id = toastId();
      const toast: TitanToast = {
        id,
        variant: input.variant,
        message: input.message,
        dedupeKey: input.dedupeKey,
        undo: input.undo,
      };

      setToasts((prev) => [...prev.slice(-4), toast]);

      const duration = input.durationMs ?? (input.undo ? 8000 : 5000);
      const timer = setTimeout(() => dismiss(id), duration);
      timersRef.current.set(id, timer);

      return id;
    },
    [dismiss, toasts],
  );

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <TitanNotifyContext.Provider value={value}>
      {children}
      <div className="ux-toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`ux-toast ux-toast--${toast.variant}`}
            role="status"
          >
            <div className="ux-toast__body">
              <span className="ux-toast__label">{VARIANT_LABEL[toast.variant]}</span>
              <span className="ux-toast__message">{toast.message}</span>
            </div>
            <div className="ux-toast__actions">
              {toast.undo ? (
                <button
                  type="button"
                  className="ux-toast__undo"
                  onClick={() => {
                    void toast.undo?.();
                    dismiss(toast.id);
                  }}
                >
                  Undo
                </button>
              ) : null}
              <button
                type="button"
                className="ux-toast__dismiss"
                aria-label="Dismiss notification"
                onClick={() => dismiss(toast.id)}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </TitanNotifyContext.Provider>
  );
}

export function useTitanNotify(): TitanNotifyContextValue {
  const ctx = useContext(TitanNotifyContext);
  if (!ctx) {
    throw new Error('useTitanNotify must be used within TitanNotificationsProvider');
  }
  return ctx;
}
