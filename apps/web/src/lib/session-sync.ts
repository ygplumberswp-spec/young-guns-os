import {
  CROSS_TAB_REFRESH_LOCK_MS,
  STAFF_SESSION_SYNC_CHANNEL,
  type StaffSessionSyncEvent,
} from '@titan/shared';

const REFRESH_LOCK_KEY = 'titan_refresh_lock';
const REFRESH_RESULT_KEY = 'titan_refresh_result';

type RefreshLock = { id: string; ts: number };
type RefreshResult = { ts: number; accessToken: string; expiresIn: number };

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') {
    return null;
  }
  if (!channel) {
    channel = new BroadcastChannel(STAFF_SESSION_SYNC_CHANNEL);
  }
  return channel;
}

export function publishStaffSessionEvent(event: StaffSessionSyncEvent): void {
  getChannel()?.postMessage(event);
}

export function subscribeStaffSessionEvents(
  handler: (event: StaffSessionSyncEvent) => void,
): () => void {
  const bus = getChannel();
  if (!bus) {
    return () => undefined;
  }

  const listener = (message: MessageEvent<StaffSessionSyncEvent>) => {
    if (message.data?.type) {
      handler(message.data);
    }
  };

  bus.addEventListener('message', listener);
  return () => bus.removeEventListener('message', listener);
}

/** Cross-tab refresh dedupe — one tab refreshes; others wait for the result. */
export async function withCrossTabRefreshLock<T>(
  refresh: () => Promise<T | null>,
): Promise<T | null> {
  if (typeof localStorage === 'undefined') {
    return refresh();
  }

  const lockId = crypto.randomUUID();
  const now = Date.now();
  const existingRaw = localStorage.getItem(REFRESH_LOCK_KEY);

  if (existingRaw) {
    try {
      const existing = JSON.parse(existingRaw) as RefreshLock;
      if (now - existing.ts < CROSS_TAB_REFRESH_LOCK_MS && existing.id !== lockId) {
        return waitForCrossTabRefreshResult<T>();
      }
    } catch {
      // Ignore corrupt lock payload.
    }
  }

  localStorage.setItem(REFRESH_LOCK_KEY, JSON.stringify({ id: lockId, ts: now } satisfies RefreshLock));

  try {
    const result = await refresh();
    if (result && typeof result === 'object' && 'accessToken' in result && 'expiresIn' in result) {
      const payload = result as { accessToken: string; expiresIn: number };
      localStorage.setItem(
        REFRESH_RESULT_KEY,
        JSON.stringify({ ts: now, accessToken: payload.accessToken, expiresIn: payload.expiresIn }),
      );
      publishStaffSessionEvent({
        type: 'refresh',
        accessToken: payload.accessToken,
        expiresIn: payload.expiresIn,
      });
    }
    return result;
  } finally {
    const current = localStorage.getItem(REFRESH_LOCK_KEY);
    if (current) {
      try {
        const parsed = JSON.parse(current) as RefreshLock;
        if (parsed.id === lockId) {
          localStorage.removeItem(REFRESH_LOCK_KEY);
        }
      } catch {
        localStorage.removeItem(REFRESH_LOCK_KEY);
      }
    }
  }
}

async function waitForCrossTabRefreshResult<T>(timeoutMs = CROSS_TAB_REFRESH_LOCK_MS): Promise<T | null> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(REFRESH_RESULT_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as RefreshResult;
          if (Date.now() - parsed.ts < CROSS_TAB_REFRESH_LOCK_MS) {
            return {
              accessToken: parsed.accessToken,
              expiresIn: parsed.expiresIn,
            } as T;
          }
        } catch {
          // Keep waiting.
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return null;
}

export function decodeAccessTokenExpiryMs(accessToken: string): number | null {
  const parts = accessToken.split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: number;
    };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}
