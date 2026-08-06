import type {
  IntegrationSyncTrigger,
  XeroImportActivity,
  XeroImportCheckpoint,
  XeroImportEntityCounts,
  XeroImportStage,
} from '@titan/shared';

/** Per-stage counters keyed by the state field that holds them. */
export type XeroImportStageCountsKey =
  | 'accounts'
  | 'trackingCategories'
  | 'contacts'
  | 'quotes'
  | 'invoices'
  | 'bills'
  | 'creditNotes'
  | 'payments'
  | 'bankTransactions'
  | 'attachments';

export const XERO_IMPORT_STAGE_COUNT_KEYS: Record<XeroImportStage, XeroImportStageCountsKey> = {
  accounts: 'accounts',
  tracking_categories: 'trackingCategories',
  contacts: 'contacts',
  quotes: 'quotes',
  invoices: 'invoices',
  bills: 'bills',
  credit_notes: 'creditNotes',
  payments: 'payments',
  bank_transactions: 'bankTransactions',
  attachments: 'attachments',
};

export const XERO_IMPORT_COUNT_KEYS: XeroImportStageCountsKey[] = Object.values(
  XERO_IMPORT_STAGE_COUNT_KEYS,
);

export type XeroImportStageCounts = Record<XeroImportStageCountsKey, XeroImportEntityCounts>;

/**
 * Xero error codes no amount of retrying can clear — the grant itself is wrong or missing a scope,
 * so the tenant has to be reconnected before the stage can succeed. Retrying one of these is not a
 * recovery attempt, it is the same rejection on a timer.
 */
export const XERO_OWNER_ACTION_ERROR_CODES: ReadonlySet<string> = new Set([
  'AUTH_FAILED',
  'CONFIG_ERROR',
]);

export function requiresOwnerActionToRetry(stageErrorCode: string | null | undefined): boolean {
  return stageErrorCode != null && XERO_OWNER_ACTION_ERROR_CODES.has(stageErrorCode);
}

export type XeroImportJobState = XeroImportStageCounts & {
  checkpoint: XeroImportCheckpoint;
  completedStages: XeroImportStage[];
  failedStage: XeroImportStage | null;
  stageError: string | null;
  /** The Xero error code behind `stageError`, so a retry can tell recoverable from not. */
  stageErrorCode?: string | null;
  /** Failures from stages a resume moved past. Still missing, so still counted against the run. */
  carriedFailureCount?: number;
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

export function emptyStageCounts(): XeroImportStageCounts {
  return XERO_IMPORT_COUNT_KEYS.reduce((acc, key) => {
    acc[key] = emptyImportCounts();
    return acc;
  }, {} as XeroImportStageCounts);
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

function sumField(
  counts: Partial<XeroImportStageCounts>,
  field: keyof XeroImportEntityCounts,
): number {
  return XERO_IMPORT_COUNT_KEYS.reduce((total, key) => total + (counts[key]?.[field] ?? 0), 0);
}

/** Stage counts in the order they are reported to the Owner. */
const MESSAGE_STAGES: Array<{ key: XeroImportStageCountsKey; label: string }> = [
  { key: 'accounts', label: 'accounts' },
  { key: 'trackingCategories', label: 'tracking categories' },
  { key: 'contacts', label: 'contacts' },
  { key: 'quotes', label: 'quotes' },
  { key: 'invoices', label: 'invoices' },
  { key: 'bills', label: 'bills' },
  { key: 'creditNotes', label: 'credit notes' },
  { key: 'payments', label: 'payments' },
  { key: 'bankTransactions', label: 'bank transactions' },
  { key: 'attachments', label: 'attachments' },
];

export function buildXeroImportSyncMessage(
  input: Partial<XeroImportStageCounts> & {
    success: boolean;
    failedStage?: XeroImportStage | null;
    stageError?: string | null;
    carriedFailureCount?: number;
  },
): string {
  const createdTotal = sumField(input, 'createdCount');
  const updatedTotal = sumField(input, 'updatedCount');
  const failedTotal = sumField(input, 'failedCount');
  const skippedTotal = sumField(input, 'skippedCount');

  const summary = MESSAGE_STAGES.filter(({ key }) => {
    const counts = input[key];
    return (
      counts &&
      (counts.createdCount > 0 ||
        counts.updatedCount > 0 ||
        counts.failedCount > 0 ||
        counts.skippedCount > 0)
    );
  })
    .map(({ key, label }) => {
      const counts = input[key]!;
      return `${label} ${counts.createdCount} new / ${counts.updatedCount} updated`;
    })
    .join(', ');

  const detailSummary = summary || 'no records returned by Xero';
  const skippedNote =
    skippedTotal > 0 ? ` ${skippedTotal} record(s) skipped — each has a sync log row.` : '';
  const carriedTotal = input.carriedFailureCount ?? 0;
  const carriedNote =
    carriedTotal > 0
      ? ` ${carriedTotal} record(s) failed in stages this run resumed past and were not retried, so their history is still incomplete.`
      : '';

  if (input.success) {
    return carriedTotal > 0
      ? `Xero sync finished the stages it resumed with.${carriedNote} ${detailSummary}.${skippedNote}`
      : `Xero sync complete. ${detailSummary}.${skippedNote}`;
  }

  if (input.failedStage) {
    const detail = input.stageError ? ` ${input.stageError}` : '';
    return `Xero sync failed during ${input.failedStage}.${detail} ${detailSummary}. Imported ${createdTotal} new and updated ${updatedTotal} existing records.${skippedNote}${carriedNote} Last sync was not updated.`;
  }

  return `Xero sync finished with ${failedTotal} failed record(s). ${detailSummary}. Imported ${createdTotal} new and updated ${updatedTotal} existing records.${skippedNote}${carriedNote}`;
}
