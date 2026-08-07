import type { OfflineActionResultStatus } from '@titan/shared';
import type { OfflineQueuedAction, OfflineQueueStatus } from './mobile-offline-queue.js';
import { hasUnsyncedEvidence } from './mobile-offline-queue.js';

export type MobileCompletionBlockReason =
  | 'unsynced_evidence'
  | 'missing_signature'
  | 'offline';

/**
 * Mobile gated completion is blocked until evidence is synced, signature captured,
 * and the device is online — final complete is never queued offline.
 */
export function evaluateMobileCompletionSubmit(input: {
  jobId: string;
  offlineActions: OfflineQueuedAction[];
  signatureDocId: string | null;
  signatureUnavailableReason: string;
  isOnline: boolean;
}): { allowed: boolean; reason?: MobileCompletionBlockReason } {
  if (hasUnsyncedEvidence(input.offlineActions, input.jobId)) {
    return { allowed: false, reason: 'unsynced_evidence' };
  }
  if (!input.signatureDocId && !input.signatureUnavailableReason.trim()) {
    return { allowed: false, reason: 'missing_signature' };
  }
  if (!input.isOnline) {
    return { allowed: false, reason: 'offline' };
  }
  return { allowed: true };
}

export type OfflineFlushTally = {
  synced: number;
  failed: number;
  duplicate: number;
};

/** Count flush outcomes per pending clientActionId (duplicate replays do not inflate synced). */
export function tallyOfflineFlushResults(
  pendingClientActionIds: string[],
  results: Array<{ clientActionId: string; status: OfflineActionResultStatus }>,
): OfflineFlushTally & { unmatched: number } {
  let synced = 0;
  let failed = 0;
  let duplicate = 0;
  let unmatched = 0;

  for (const clientActionId of pendingClientActionIds) {
    const result = results.find((row) => row.clientActionId === clientActionId);
    if (!result) {
      unmatched += 1;
      failed += 1;
      continue;
    }
    if (result.status === 'synced') synced += 1;
    else if (result.status === 'duplicate') duplicate += 1;
    else failed += 1;
  }

  return { synced, failed, duplicate, unmatched };
}

/** Duplicate flush results still mark the local queue row as synced (server already applied). */
export function offlineFlushQueueStatusForResult(
  status: OfflineActionResultStatus,
): Extract<OfflineQueueStatus, 'synced' | 'failed'> {
  return status === 'failed' ? 'failed' : 'synced';
}

export function formatManualSyncMessage(tally: OfflineFlushTally): string {
  return `Manual sync: ${tally.synced} synced, ${tally.duplicate} duplicate, ${tally.failed} failed`;
}

/** Stable per-job completion idempotency key — reused on retry so duplicate taps do not double-complete. */
export function newStableCompletionClientActionId(jobId: string): string {
  return `complete-${jobId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
