import type {
  IntegrationSyncTrigger,
  XeroImportActivity,
  XeroImportCheckpoint,
  XeroImportEntityCounts,
  XeroImportJobProgress,
  XeroImportStage,
  XeroImportSyncResult,
} from '@titan/shared';
import {
  deriveXeroImportJobUiStatus,
  sumXeroImportProcessedCounts,
} from '@titan/shared';
import { XERO_PAGE_SIZE } from '../lib/xero.client.js';
import {
  buildXeroImportSyncMessage,
  emptyImportCounts,
  summarizeCounts,
  type XeroImportJobState,
} from './xero-import-job.shared.js';

/** Per-batch wall-clock budget — each scheduler tick processes within this window. */
export const XERO_IMPORT_BATCH_BUDGET_MS = 45_000;
/** Running import jobs with no heartbeat longer than this are marked stalled (not total duration). */
export const XERO_IMPORT_STALL_THRESHOLD_MS = 15 * 60_000;
/** Pending import jobs never picked up by a worker are abandoned after this window. */
export const XERO_IMPORT_PENDING_STALE_MS = 30 * 60_000;
/** Worker lease duration — prevents two workers on the same tenant import. */
export const XERO_IMPORT_LEASE_MS = 2 * 60_000;
/** @deprecated Use XERO_IMPORT_STALL_THRESHOLD_MS — kept for legacy imports/tests. */
export const XERO_IMPORT_STALE_JOB_MS = XERO_IMPORT_STALL_THRESHOLD_MS;
/** Max entity pages processed per batch tick. */
export const XERO_IMPORT_MAX_PAGES_PER_BATCH = 5;

export const XERO_IMPORT_STAGES: XeroImportStage[] = [
  'contacts',
  'invoices',
  'payments',
  'bank_transactions',
];

export function createInitialImportJobState(options?: {
  idempotencyKey?: string;
  trigger?: IntegrationSyncTrigger;
  checkpoint?: Partial<XeroImportCheckpoint>;
}): XeroImportJobState {
  return {
    checkpoint: {
      stage: options?.checkpoint?.stage ?? 'contacts',
      contactsPage: options?.checkpoint?.contactsPage ?? 1,
      invoicesPage: options?.checkpoint?.invoicesPage ?? 1,
      paymentsPage: options?.checkpoint?.paymentsPage ?? 1,
      bankTransactionsPage: options?.checkpoint?.bankTransactionsPage ?? 1,
    },
    completedStages: [],
    contacts: emptyImportCounts(),
    invoices: emptyImportCounts(),
    payments: emptyImportCounts(),
    bankTransactions: emptyImportCounts(),
    failedStage: null,
    stageError: null,
    idempotencyKey: options?.idempotencyKey,
    trigger: options?.trigger,
  };
}

export function importJobStateToSummary(state: XeroImportJobState): Record<string, unknown> {
  return {
    checkpoint: state.checkpoint,
    currentStage: state.checkpoint.stage,
    completedStages: state.completedStages,
    contacts: summarizeCounts(state.contacts),
    invoices: summarizeCounts(state.invoices),
    payments: summarizeCounts(state.payments),
    bankTransactions: summarizeCounts(state.bankTransactions),
    failedStage: state.failedStage,
    stageError: state.stageError,
    idempotencyKey: state.idempotencyKey,
    trigger: state.trigger,
    heartbeatAt: state.heartbeatAt ?? null,
    nextRetryAt: state.nextRetryAt ?? null,
    activity: state.activity ?? null,
    processingLeaseOwner: state.processingLeaseOwner ?? null,
    processingLeaseExpiresAt: state.processingLeaseExpiresAt ?? null,
    resumedFromAbandoned: state.resumedFromAbandoned ?? false,
    abandoned: state.abandoned ?? false,
    abandonedAt: state.abandonedAt ?? null,
    abandonReason: state.abandonReason ?? null,
  };
}

export function parseImportJobState(
  summary: Record<string, unknown> | null | undefined,
): XeroImportJobState {
  const checkpoint = (summary?.checkpoint ?? {}) as Partial<XeroImportCheckpoint>;
  return {
    checkpoint: {
      stage: checkpoint.stage ?? 'contacts',
      contactsPage: checkpoint.contactsPage ?? 1,
      invoicesPage: checkpoint.invoicesPage ?? 1,
      paymentsPage: checkpoint.paymentsPage ?? 1,
      bankTransactionsPage: checkpoint.bankTransactionsPage ?? 1,
    },
    completedStages: Array.isArray(summary?.completedStages)
      ? (summary.completedStages as XeroImportStage[])
      : [],
    contacts: parseCounts(summary?.contacts),
    invoices: parseCounts(summary?.invoices),
    payments: parseCounts(summary?.payments),
    bankTransactions: parseCounts(summary?.bankTransactions),
    failedStage: (summary?.failedStage as XeroImportStage | null | undefined) ?? null,
    stageError: typeof summary?.stageError === 'string' ? summary.stageError : null,
    idempotencyKey:
      typeof summary?.idempotencyKey === 'string' ? summary.idempotencyKey : undefined,
    trigger: summary?.trigger as IntegrationSyncTrigger | undefined,
    heartbeatAt: typeof summary?.heartbeatAt === 'string' ? summary.heartbeatAt : null,
    nextRetryAt: typeof summary?.nextRetryAt === 'string' ? summary.nextRetryAt : null,
    activity: (summary?.activity as XeroImportActivity | null | undefined) ?? null,
    processingLeaseOwner:
      typeof summary?.processingLeaseOwner === 'string' ? summary.processingLeaseOwner : null,
    processingLeaseExpiresAt:
      typeof summary?.processingLeaseExpiresAt === 'string'
        ? summary.processingLeaseExpiresAt
        : null,
    resumedFromAbandoned: summary?.resumedFromAbandoned === true,
    abandoned: summary?.abandoned === true,
    abandonedAt: typeof summary?.abandonedAt === 'string' ? summary.abandonedAt : null,
    abandonReason: typeof summary?.abandonReason === 'string' ? summary.abandonReason : null,
  };
}

export function buildImportJobProgress(
  jobId: string,
  status: XeroImportJobProgress['status'],
  state: XeroImportJobState,
  syncedAt: string | null,
  message: string | null,
  jobStatus: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled',
): XeroImportJobProgress {
  const processedCount = sumXeroImportProcessedCounts(state);
  const hasPartialProgress =
    processedCount > 0 ||
    state.completedStages.length > 0 ||
    state.abandoned === true;
  const { uiStatus, uiStatusLabel } = deriveXeroImportJobUiStatus({
    jobStatus,
    activity: state.activity,
    nextRetryAt: state.nextRetryAt,
    hasPartialProgress,
    resumedFromAbandoned: state.resumedFromAbandoned,
  });

  return {
    jobId,
    status,
    uiStatus,
    uiStatusLabel,
    currentStage: state.failedStage ? state.failedStage : state.checkpoint.stage,
    completedStages: state.completedStages,
    checkpoint: state.checkpoint,
    contacts: state.contacts,
    invoices: state.invoices,
    payments: state.payments,
    bankTransactions: state.bankTransactions,
    failedStage: state.failedStage,
    message,
    syncedAt,
    heartbeatAt: state.heartbeatAt ?? null,
    nextRetryAt: state.nextRetryAt ?? null,
    activity: state.activity ?? null,
    processedCount,
  };
}

export function buildImportSyncResult(
  state: XeroImportJobState,
  syncJobId: string,
  syncedAt: string | null,
): XeroImportSyncResult {
  const totalFailed =
    state.contacts.failedCount +
    state.invoices.failedCount +
    state.payments.failedCount +
    state.bankTransactions.failedCount;
  const success = state.failedStage == null && totalFailed === 0;

  return {
    success,
    message: buildXeroImportSyncMessage({
      success,
      contacts: state.contacts,
      invoices: state.invoices,
      payments: state.payments,
      bankTransactions: state.bankTransactions,
      failedStage: state.failedStage,
      stageError: state.stageError,
    }),
    syncedAt,
    contacts: state.contacts,
    invoices: state.invoices,
    payments: state.payments,
    bankTransactions: state.bankTransactions,
    failedStage: state.failedStage,
    completedStages: state.completedStages,
    syncJobId,
  };
}

export function isStageComplete(
  _stage: XeroImportStage,
  _checkpoint: XeroImportCheckpoint,
  lastBatchSize: number,
): boolean {
  if (lastBatchSize === 0) {
    return true;
  }

  return lastBatchSize < XERO_PAGE_SIZE;
}

export function advanceToNextStage(state: XeroImportJobState): boolean {
  const currentIndex = XERO_IMPORT_STAGES.indexOf(state.checkpoint.stage);
  const completedStage = state.checkpoint.stage;

  if (!state.completedStages.includes(completedStage)) {
    state.completedStages.push(completedStage);
  }

  if (currentIndex < 0 || currentIndex >= XERO_IMPORT_STAGES.length - 1) {
    return false;
  }

  state.checkpoint.stage = XERO_IMPORT_STAGES[currentIndex + 1]!;
  return true;
}

export function generateImportLeaseOwner(): string {
  return `worker-${process.pid}-${Date.now().toString(36)}`;
}

export function isImportLeaseHeldByOther(
  state: XeroImportJobState,
  owner: string,
  nowMs: number = Date.now(),
): boolean {
  if (!state.processingLeaseOwner || state.processingLeaseOwner === owner) {
    return false;
  }

  if (!state.processingLeaseExpiresAt) {
    return true;
  }

  return new Date(state.processingLeaseExpiresAt).getTime() > nowMs;
}

export function acquireImportLease(
  state: XeroImportJobState,
  owner: string,
  leaseMs: number,
  nowMs: number = Date.now(),
): void {
  state.processingLeaseOwner = owner;
  state.processingLeaseExpiresAt = new Date(nowMs + leaseMs).toISOString();
}

export function releaseImportLease(state: XeroImportJobState, owner: string): void {
  if (state.processingLeaseOwner !== owner) {
    return;
  }

  state.processingLeaseOwner = null;
  state.processingLeaseExpiresAt = null;
}

export function touchImportHeartbeat(
  state: XeroImportJobState,
  activity: XeroImportActivity = 'processing',
  nowMs: number = Date.now(),
): void {
  state.heartbeatAt = new Date(nowMs).toISOString();
  state.activity = activity;
}

export function hasRecoverableImportCheckpoint(state: XeroImportJobState): boolean {
  const processed =
    state.contacts.pulledCount +
    state.invoices.pulledCount +
    state.payments.pulledCount +
    state.bankTransactions.pulledCount;

  return (
    processed > 0 ||
    state.completedStages.length > 0 ||
    state.abandoned === true ||
    state.checkpoint.contactsPage > 1 ||
    state.checkpoint.invoicesPage > 1 ||
    state.checkpoint.paymentsPage > 1 ||
    state.checkpoint.bankTransactionsPage > 1 ||
    state.checkpoint.stage !== 'contacts'
  );
}

function parseCounts(value: unknown): XeroImportEntityCounts {
  if (!value || typeof value !== 'object') {
    return emptyImportCounts();
  }

  const record = value as Record<string, unknown>;
  return {
    createdCount: Number(record.createdCount ?? 0),
    updatedCount: Number(record.updatedCount ?? 0),
    pulledCount: Number(record.pulledCount ?? 0),
    failedCount: Number(record.failedCount ?? 0),
    skippedCount: Number(record.skippedCount ?? 0),
  };
}
