/**
 * IndexedDB-backed offline queue for technician mobile actions.
 * Minimizes stored PII: jobId + action payloads only; cleared after sync/session expiry.
 */

import { resolveApiBase } from './runtime-env';
import {
  offlineFlushQueueStatusForResult,
  tallyOfflineFlushResults,
} from './mobile-offline-completion.js';

export type OfflineQueueStatus = 'offline' | 'pending' | 'synced' | 'failed';

export type OfflineQueuedAction = {
  id: string;
  clientActionId: string;
  actionType:
    | 'transition'
    | 'note'
    | 'time_entry'
    | 'material_line'
    | 'checklist_update'
    | 'evidence_upload';
  jobId: string;
  payload: Record<string, unknown>;
  status: OfflineQueueStatus;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
};

const DB_NAME = 'titan-mobile-offline';
const STORE = 'actions';
const WORKSPACE_STORE = 'workspaces';
const SESSION_STORE = 'session';
const DB_VERSION = 3;
const MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24h session hygiene
const SESSION_KEY = 'staff';

export type CachedStaffSession = {
  id: typeof SESSION_KEY;
  user: Record<string, unknown>;
  accessToken: string;
  expiresAt: string;
  cachedAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('clientActionId', 'clientActionId', { unique: true });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('jobId', 'jobId', { unique: false });
      }
      if (!db.objectStoreNames.contains(WORKSPACE_STORE)) {
        db.createObjectStore(WORKSPACE_STORE, { keyPath: 'jobId' });
      }
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function newOfflineClientActionId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function enqueueOfflineAction(
  input: Omit<OfflineQueuedAction, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'errorMessage'>,
): Promise<OfflineQueuedAction> {
  const db = await openDb();
  const now = new Date().toISOString();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);

  // Upsert by clientActionId so retries never mint a second queue row (or duplicate upload).
  const existing = await new Promise<OfflineQueuedAction | undefined>((resolve, reject) => {
    const req = store.index('clientActionId').get(input.clientActionId);
    req.onsuccess = () => resolve(req.result as OfflineQueuedAction | undefined);
    req.onerror = () => reject(req.error);
  });

  const row: OfflineQueuedAction = existing
    ? {
        ...existing,
        ...input,
        id: existing.id,
        status: existing.status === 'synced' ? 'synced' : navigator.onLine ? 'pending' : 'offline',
        errorMessage: null,
        createdAt: existing.createdAt,
        updatedAt: now,
      }
    : {
        ...input,
        id: crypto.randomUUID(),
        status: navigator.onLine ? 'pending' : 'offline',
        createdAt: now,
        updatedAt: now,
      };

  store.put(row);
  await txDone(tx);
  db.close();
  return row;
}

export async function listOfflineActions(jobId?: string): Promise<OfflineQueuedAction[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const store = tx.objectStore(STORE);
  const req = jobId ? store.index('jobId').getAll(jobId) : store.getAll();
  const rows = await new Promise<OfflineQueuedAction[]>((resolve, reject) => {
    req.onsuccess = () => resolve((req.result as OfflineQueuedAction[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  db.close();
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function updateOfflineAction(
  id: string,
  patch: Partial<Pick<OfflineQueuedAction, 'status' | 'errorMessage' | 'updatedAt'>>,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const existing = await new Promise<OfflineQueuedAction | undefined>((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as OfflineQueuedAction | undefined);
    req.onerror = () => reject(req.error);
  });
  if (existing) {
    store.put({
      ...existing,
      ...patch,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    });
  }
  await txDone(tx);
  db.close();
}

export async function clearSyncedAndExpiredActions(): Promise<number> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const all = await new Promise<OfflineQueuedAction[]>((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as OfflineQueuedAction[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  const cutoff = Date.now() - MAX_AGE_MS;
  let removed = 0;
  for (const row of all) {
    const expired = new Date(row.createdAt).getTime() < cutoff;
    if (row.status === 'synced' || expired) {
      store.delete(row.id);
      removed += 1;
    }
  }
  await txDone(tx);
  db.close();
  return removed;
}

/** Wipe all locally cached technician offline actions, job snapshots, and session (logout / expiry). */
export async function clearAllMobileOfflineData(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  const stores = [STORE, WORKSPACE_STORE, SESSION_STORE].filter((name) =>
    db.objectStoreNames.contains(name),
  );
  const tx = db.transaction(stores, 'readwrite');
  for (const name of stores) {
    tx.objectStore(name).clear();
  }
  await txDone(tx);
  db.close();
}

export async function cacheStaffSessionForOffline(input: {
  user: Record<string, unknown>;
  accessToken: string;
  /** Absolute expiry — default 55 minutes from now (short-lived access token window). */
  expiresAt?: string;
}): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(SESSION_STORE, 'readwrite');
  const row: CachedStaffSession = {
    id: SESSION_KEY,
    user: input.user,
    accessToken: input.accessToken,
    expiresAt: input.expiresAt ?? new Date(Date.now() + 55 * 60 * 1000).toISOString(),
    cachedAt: new Date().toISOString(),
  };
  tx.objectStore(SESSION_STORE).put(row);
  await txDone(tx);
  db.close();
}

export async function readCachedStaffSession(): Promise<CachedStaffSession | null> {
  const db = await openDb();
  const tx = db.transaction(SESSION_STORE, 'readonly');
  const row = await new Promise<CachedStaffSession | undefined>((resolve, reject) => {
    const req = tx.objectStore(SESSION_STORE).get(SESSION_KEY);
    req.onsuccess = () => resolve(req.result as CachedStaffSession | undefined);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  db.close();
  if (!row) return null;
  if (Date.now() >= new Date(row.expiresAt).getTime()) {
    await clearAllMobileOfflineData();
    return null;
  }
  return row;
}

export async function cacheMobileWorkspaceSnapshot(
  jobId: string,
  workspace: Record<string, unknown>,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(WORKSPACE_STORE, 'readwrite');
  tx.objectStore(WORKSPACE_STORE).put({
    jobId,
    workspace,
    cachedAt: new Date().toISOString(),
  });
  await txDone(tx);
  db.close();
}

export async function readCachedMobileWorkspace(
  jobId: string,
): Promise<{ workspace: Record<string, unknown>; cachedAt: string } | null> {
  const db = await openDb();
  const tx = db.transaction(WORKSPACE_STORE, 'readonly');
  const row = await new Promise<{ workspace: Record<string, unknown>; cachedAt: string } | undefined>(
    (resolve, reject) => {
      const req = tx.objectStore(WORKSPACE_STORE).get(jobId);
      req.onsuccess = () => resolve(req.result as { workspace: Record<string, unknown>; cachedAt: string } | undefined);
      req.onerror = () => reject(req.error);
    },
  );
  await txDone(tx);
  db.close();
  if (!row) return null;
  if (Date.now() - new Date(row.cachedAt).getTime() > MAX_AGE_MS) {
    return null;
  }
  return row;
}

export function hasUnsyncedEvidence(actions: OfflineQueuedAction[], jobId: string): boolean {
  return actions.some(
    (a) =>
      a.jobId === jobId &&
      a.actionType === 'evidence_upload' &&
      (a.status === 'pending' || a.status === 'offline' || a.status === 'failed'),
  );
}

export async function flushOfflineQueue(accessToken: string): Promise<{
  synced: number;
  failed: number;
  duplicate: number;
}> {
  const pending = (await listOfflineActions()).filter((a) =>
    ['pending', 'offline', 'failed'].includes(a.status),
  );
  if (pending.length === 0) {
    return { synced: 0, failed: 0, duplicate: 0 };
  }

  const body = {
    actions: pending.map((a) => ({
      clientActionId: a.clientActionId,
      actionType: a.actionType,
      jobId: a.jobId,
      payload: a.payload,
    })),
  };

  const res = await fetch(`${resolveApiBase()}/mobile/technician/workforce/offline/flush`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    for (const action of pending) {
      await updateOfflineAction(action.id, {
        status: 'failed',
        errorMessage: `Flush failed (${res.status})`,
      });
    }
    return { synced: 0, failed: pending.length, duplicate: 0 };
  }

  const json = (await res.json()) as {
    data?: {
      results?: Array<{ clientActionId: string; status: 'synced' | 'failed' | 'duplicate'; error?: string }>;
    };
  };
  const results = json.data?.results ?? [];
  const tally = tallyOfflineFlushResults(
    pending.map((action) => action.clientActionId),
    results,
  );

  for (const action of pending) {
    const result = results.find((r) => r.clientActionId === action.clientActionId);
    if (!result) {
      await updateOfflineAction(action.id, { status: 'failed', errorMessage: 'No server result' });
      continue;
    }
    const queueStatus = offlineFlushQueueStatusForResult(result.status);
    await updateOfflineAction(action.id, {
      status: queueStatus,
      errorMessage: queueStatus === 'failed' ? (result.error ?? 'Action failed') : null,
    });
  }

  await clearSyncedAndExpiredActions();
  return { synced: tally.synced, failed: tally.failed, duplicate: tally.duplicate };
}
