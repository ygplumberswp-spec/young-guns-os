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
  emptyStageCounts,
  summarizeCounts,
  XERO_IMPORT_COUNT_KEYS,
  XERO_IMPORT_STAGE_COUNT_KEYS,
  type XeroImportJobState,
  type XeroImportStageCountsKey,
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

/**
 * Dependency order. Reference data first so line items resolve to real accounts and tracking;
 * attachments last so their parent records already exist to link against.
 */
export const XERO_IMPORT_STAGES: XeroImportStage[] = [
  'accounts',
  'tracking_categories',
  'contacts',
  'quotes',
  'invoices',
  'bills',
  'credit_notes',
  'payments',
  'bank_transactions',
  'attachments',
];

/** Stages Xero returns in one unpaged response. */
export const XERO_UNPAGED_STAGES: ReadonlySet<XeroImportStage> = new Set<XeroImportStage>([
  'accounts',
  'tracking_categories',
]);

export function createInitialImportJobState(options?: {
  idempotencyKey?: string;
  trigger?: IntegrationSyncTrigger;
  checkpoint?: Partial<XeroImportCheckpoint>;
  /** Null (default) means a complete historical pull with no date floor. */
  modifiedSince?: string | null;
}): XeroImportJobState {
  return {
    ...emptyStageCounts(),
    checkpoint: {
      stage: options?.checkpoint?.stage ?? XERO_IMPORT_STAGES[0]!,
      contactsPage: options?.checkpoint?.contactsPage ?? 1,
      quotesPage: options?.checkpoint?.quotesPage ?? 1,
      invoicesPage: options?.checkpoint?.invoicesPage ?? 1,
      billsPage: options?.checkpoint?.billsPage ?? 1,
      creditNotesPage: options?.checkpoint?.creditNotesPage ?? 1,
      paymentsPage: options?.checkpoint?.paymentsPage ?? 1,
      bankTransactionsPage: options?.checkpoint?.bankTransactionsPage ?? 1,
      attachmentsOffset: options?.checkpoint?.attachmentsOffset ?? 0,
      modifiedSince: options?.checkpoint?.modifiedSince ?? options?.modifiedSince ?? null,
    },
    completedStages: [],
    failedStage: null,
    stageError: null,
    stageErrorCode: null,
    idempotencyKey: options?.idempotencyKey,
    trigger: options?.trigger,
  };
}

export function importJobStateToSummary(state: XeroImportJobState): Record<string, unknown> {
  const counts = XERO_IMPORT_COUNT_KEYS.reduce<Record<string, Record<string, number>>>(
    (acc, key) => {
      acc[key] = summarizeCounts(state[key]);
      return acc;
    },
    {},
  );

  return {
    ...counts,
    checkpoint: state.checkpoint,
    currentStage: state.checkpoint.stage,
    completedStages: state.completedStages,
    failedStage: state.failedStage,
    stageError: state.stageError,
    stageErrorCode: state.stageErrorCode ?? null,
    carriedFailureCount: state.carriedFailureCount ?? 0,
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
  const counts = XERO_IMPORT_COUNT_KEYS.reduce((acc, key) => {
    acc[key] = parseCounts(summary?.[key]);
    return acc;
  }, {} as Record<XeroImportStageCountsKey, XeroImportEntityCounts>);

  return {
    ...counts,
    checkpoint: {
      // Jobs written before the historical-sync stages default to the first stage rather than
      // silently resuming mid-pipeline against a checkpoint that no longer exists.
      stage: checkpoint.stage ?? XERO_IMPORT_STAGES[0]!,
      contactsPage: checkpoint.contactsPage ?? 1,
      quotesPage: checkpoint.quotesPage ?? 1,
      invoicesPage: checkpoint.invoicesPage ?? 1,
      billsPage: checkpoint.billsPage ?? 1,
      creditNotesPage: checkpoint.creditNotesPage ?? 1,
      paymentsPage: checkpoint.paymentsPage ?? 1,
      bankTransactionsPage: checkpoint.bankTransactionsPage ?? 1,
      attachmentsOffset: checkpoint.attachmentsOffset ?? 0,
      modifiedSince:
        typeof checkpoint.modifiedSince === 'string' ? checkpoint.modifiedSince : null,
    },
    completedStages: Array.isArray(summary?.completedStages)
      ? (summary.completedStages as XeroImportStage[])
      : [],
    failedStage: (summary?.failedStage as XeroImportStage | null | undefined) ?? null,
    stageError: typeof summary?.stageError === 'string' ? summary.stageError : null,
    stageErrorCode: typeof summary?.stageErrorCode === 'string' ? summary.stageErrorCode : null,
    carriedFailureCount: Number.isFinite(Number(summary?.carriedFailureCount))
      ? Number(summary?.carriedFailureCount)
      : 0,
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
    accounts: state.accounts,
    trackingCategories: state.trackingCategories,
    contacts: state.contacts,
    quotes: state.quotes,
    invoices: state.invoices,
    bills: state.bills,
    creditNotes: state.creditNotes,
    payments: state.payments,
    bankTransactions: state.bankTransactions,
    attachments: state.attachments,
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
  const totalFailed = sumImportFailureCounts(state);
  const success = state.failedStage == null && totalFailed === 0;

  return {
    success,
    message: buildXeroImportSyncMessage({
      success,
      accounts: state.accounts,
      trackingCategories: state.trackingCategories,
      contacts: state.contacts,
      quotes: state.quotes,
      invoices: state.invoices,
      bills: state.bills,
      creditNotes: state.creditNotes,
      payments: state.payments,
      bankTransactions: state.bankTransactions,
      attachments: state.attachments,
      failedStage: state.failedStage,
      stageError: state.stageError,
      carriedFailureCount: state.carriedFailureCount ?? 0,
    }),
    syncedAt,
    accounts: state.accounts,
    trackingCategories: state.trackingCategories,
    contacts: state.contacts,
    quotes: state.quotes,
    invoices: state.invoices,
    bills: state.bills,
    creditNotes: state.creditNotes,
    payments: state.payments,
    bankTransactions: state.bankTransactions,
    attachments: state.attachments,
    failedStage: state.failedStage,
    completedStages: state.completedStages,
    syncJobId,
  };
}

/**
 * A paged stage is done only when Xero returns a short page. Unpaged stages (accounts, tracking)
 * complete after their single response, and attachments signal completion explicitly.
 */
export function isStageComplete(
  stage: XeroImportStage,
  _checkpoint: XeroImportCheckpoint,
  lastBatchSize: number,
): boolean {
  if (XERO_UNPAGED_STAGES.has(stage)) {
    return true;
  }

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

export function getStageCounts(
  state: XeroImportJobState,
  stage: XeroImportStage,
): XeroImportEntityCounts {
  return state[XERO_IMPORT_STAGE_COUNT_KEYS[stage]];
}

/**
 * Drop per-record failure tallies from stages already finished before the resume checkpoint, so a
 * resumed run does not re-report failures it will not retry. The total is carried instead of
 * discarded: those records are still missing, so the resumed run cannot claim a clean sync.
 */
export function clearStaleStageFailuresOnResume(state: XeroImportJobState): void {
  const currentIndex = XERO_IMPORT_STAGES.indexOf(state.checkpoint.stage);
  if (currentIndex <= 0) {
    return;
  }

  for (let index = 0; index < currentIndex; index += 1) {
    const counts = getStageCounts(state, XERO_IMPORT_STAGES[index]!);
    state.carriedFailureCount = (state.carriedFailureCount ?? 0) + counts.failedCount;
    counts.failedCount = 0;
  }
}

export function sumImportFailureCounts(state: XeroImportJobState): number {
  return XERO_IMPORT_COUNT_KEYS.reduce((total, key) => total + state[key].failedCount, 0);
}

export function sumImportSkippedCounts(state: XeroImportJobState): number {
  return XERO_IMPORT_COUNT_KEYS.reduce((total, key) => total + state[key].skippedCount, 0);
}

export function hasRecoverableImportCheckpoint(state: XeroImportJobState): boolean {
  const processed = XERO_IMPORT_COUNT_KEYS.reduce(
    (total, key) => total + state[key].pulledCount,
    0,
  );

  return (
    processed > 0 ||
    state.completedStages.length > 0 ||
    state.abandoned === true ||
    state.checkpoint.contactsPage > 1 ||
    state.checkpoint.quotesPage > 1 ||
    state.checkpoint.invoicesPage > 1 ||
    state.checkpoint.billsPage > 1 ||
    state.checkpoint.creditNotesPage > 1 ||
    state.checkpoint.paymentsPage > 1 ||
    state.checkpoint.bankTransactionsPage > 1 ||
    state.checkpoint.attachmentsOffset > 0 ||
    state.checkpoint.stage !== XERO_IMPORT_STAGES[0]
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
