import type {
  IntegrationSyncTrigger,
  XeroImportActivity,
  XeroImportCheckpoint,
  XeroImportEntityCounts,
  XeroImportStage,
} from '@titan/shared';

export type XeroImportJobState = {
  checkpoint: XeroImportCheckpoint;
  completedStages: XeroImportStage[];
  contacts: XeroImportEntityCounts;
  invoices: XeroImportEntityCounts;
  payments: XeroImportEntityCounts;
  bankTransactions: XeroImportEntityCounts;
  failedStage: XeroImportStage | null;
  stageError: string | null;
  idempotencyKey?: string;
  trigger?: IntegrationSyncTrigger;
  heartbeatAt?: string | null;
  nextRetryAt?: string | null;
  activity?: XeroImportActivity | null;
  processingLeaseOwner?: string | null;
  processingLeaseExpiresAt?: string | null;
  resumedFromAbandoned?: boolean;
  abandoned?: boolean;
  abandonedAt?: string | null;
  abandonReason?: string | null;
};

export function emptyImportCounts(): XeroImportEntityCounts {
  return {
    createdCount: 0,
    updatedCount: 0,
    pulledCount: 0,
    failedCount: 0,
    skippedCount: 0,
  };
}

export function summarizeCounts(counts: XeroImportEntityCounts): Record<string, number> {
  return {
    createdCount: counts.createdCount,
    updatedCount: counts.updatedCount,
    pulledCount: counts.pulledCount,
    failedCount: counts.failedCount,
    skippedCount: counts.skippedCount,
  };
}

export function buildXeroImportSyncMessage(input: {
  success: boolean;
  contacts: XeroImportEntityCounts;
  invoices: XeroImportEntityCounts;
  payments: XeroImportEntityCounts;
  bankTransactions: XeroImportEntityCounts;
  failedStage?: XeroImportStage | null;
  stageError?: string | null;
}): string {
  const createdTotal =
    input.contacts.createdCount +
    input.invoices.createdCount +
    input.payments.createdCount +
    input.bankTransactions.createdCount;
  const updatedTotal =
    input.contacts.updatedCount +
    input.invoices.updatedCount +
    input.payments.updatedCount +
    input.bankTransactions.updatedCount;
  const failedTotal =
    input.contacts.failedCount +
    input.invoices.failedCount +
    input.payments.failedCount +
    input.bankTransactions.failedCount;

  const summary = `Contacts ${input.contacts.createdCount} new / ${input.contacts.updatedCount} updated, invoices ${input.invoices.createdCount} new / ${input.invoices.updatedCount} updated, payments ${input.payments.createdCount} new / ${input.payments.updatedCount} updated, bank transactions ${input.bankTransactions.createdCount} new / ${input.bankTransactions.updatedCount} updated`;

  if (input.success) {
    return `Xero sync complete. ${summary}.`;
  }

  if (input.failedStage) {
    const detail = input.stageError ? ` ${input.stageError}` : '';
    return `Xero sync failed during ${input.failedStage}.${detail} ${summary}. Imported ${createdTotal} new and updated ${updatedTotal} existing records. Last sync was not updated.`;
  }

  return `Xero sync finished with ${failedTotal} failed record(s). ${summary}. Imported ${createdTotal} new and updated ${updatedTotal} existing records.`;
}
