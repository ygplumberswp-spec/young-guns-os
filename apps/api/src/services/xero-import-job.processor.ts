import type {
  IntegrationSyncTrigger,
  XeroImportCheckpoint,
  XeroImportEntityCounts,
  XeroImportJobProgress,
  XeroImportStage,
  XeroImportSyncResult,
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
/** Background import jobs idle longer than this are marked abandoned. */
export const XERO_IMPORT_STALE_JOB_MS = 30 * 60_000;
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
  };
}

export function buildImportJobProgress(
  jobId: string,
  status: XeroImportJobProgress['status'],
  state: XeroImportJobState,
  syncedAt: string | null,
  message: string | null,
): XeroImportJobProgress {
  return {
    jobId,
    status,
    currentStage: state.failedStage ? state.failedStage : state.checkpoint.stage,
    completedStages: state.completedStages,
    contacts: state.contacts,
    invoices: state.invoices,
    payments: state.payments,
    bankTransactions: state.bankTransactions,
    failedStage: state.failedStage,
    message,
    syncedAt,
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
