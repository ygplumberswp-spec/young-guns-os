/**
 * Pure duplicate-completion guards extracted from gated completion and offline flush.
 * Keeps idempotent replay and snapshot rejection testable without a live database.
 */

export function shouldReplayGatedCompletionByClientActionId(
  existingWorkflowEvent: { id: string } | null | undefined,
): boolean {
  return existingWorkflowEvent != null;
}

export function shouldRejectDuplicateCompletionSnapshot(input: {
  existingSnapshot: { createdAt: Date } | null | undefined;
  reopenAt: Date | null | undefined;
}): boolean {
  if (!input.existingSnapshot) {
    return false;
  }
  if (
    input.reopenAt != null &&
    input.reopenAt.getTime() > input.existingSnapshot.createdAt.getTime()
  ) {
    return false;
  }
  return true;
}

export function classifyOfflineFlushByExistingLog(
  existingLog: { id: string } | null | undefined,
): 'duplicate' | 'apply' {
  return existingLog ? 'duplicate' : 'apply';
}
