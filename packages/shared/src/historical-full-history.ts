/**
 * MAIN MASTER LIST ADDENDUM — FULL HISTORY
 *
 * Young Guns initial migration must pull ALL available historical data from the
 * earliest record each authorised source exposes through the present date.
 * No arbitrary recent-date cutoff. After a clean full-history import, sync
 * switches to incremental. Gaps the provider cannot expose are reported, never
 * fabricated or silently omitted.
 */

export type HistoricalSyncMode = 'FULL_HISTORY' | 'INCREMENTAL';

export type HistoricalMigrationEntityKey =
  | 'accounts'
  | 'tracking_categories'
  | 'contacts'
  | 'quotes'
  | 'invoices'
  | 'bills'
  | 'credit_notes'
  | 'payments'
  | 'bank_transactions'
  | 'attachments'
  | 'customer'
  | 'lead'
  | 'supplier'
  | 'contact'
  | 'property'
  | 'asset'
  | 'job'
  | 'quote'
  | 'invoice'
  | 'payment'
  | 'inventory'
  | 'price_book'
  | 'document'
  | 'other';

export type HistoricalProviderLimitation = {
  provider: string;
  entityType: string;
  /** What the provider cannot expose (history window, record type, field, etc.). */
  unavailable: string;
  /** How the gap must be closed — never silent omit / fabricate. */
  remediation: 'alternate_source' | 'manual_import' | 'provider_capability' | 'not_applicable';
  detail: string;
};

export type HistoricalMigrationEntityCounts = {
  /** Records the source returned / file rows discovered for this entity. */
  discoveredCount: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  skippedCount: number;
  failedCount: number;
};

export type HistoricalMigrationEntityReport = HistoricalMigrationEntityCounts & {
  entityType: string;
  /** Earliest source-record date imported for this entity (ISO date or datetime). */
  oldestRecordDate: string | null;
  /** Newest source-record date imported for this entity. */
  newestRecordDate: string | null;
};

export type HistoricalMigrationReport = {
  /** FULL_HISTORY until every authorised stage finishes cleanly; then INCREMENTAL. */
  syncMode: HistoricalSyncMode;
  /** True when this run applied no modified-since / recent-date floor. */
  noDateFloorApplied: boolean;
  /** Policy reminder — always true for Young Guns initial migration. */
  arbitraryDateCutoffForbidden: true;
  oldestRecordDateImported: string | null;
  newestRecordDateImported: string | null;
  totalRecordsDiscovered: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  skippedCount: number;
  failedCount: number;
  entities: HistoricalMigrationEntityReport[];
  /** Explicit gaps — never omit silently, never fabricate the missing data. */
  providerLimitations: HistoricalProviderLimitation[];
  /** Human-readable summary for the Owner migration report. */
  summary: string;
};

/** Hard policy for Young Guns initial historical migration. */
export const YOUNG_GUNS_FULL_HISTORY_POLICY = {
  syncMode: 'FULL_HISTORY' as const satisfies HistoricalSyncMode,
  noArbitraryDateCutoff: true,
  requireCompletePagination: true,
  requireCompleteHistoricalDateRanges: true,
  requireResumableCheckpoints: true,
  requireIdempotentUpserts: true,
  requireDuplicatePrevention: true,
  requireOriginalIdentityAndProvenance: true,
  /** After every authorised stage finishes a clean full-history pull. */
  postInitialSyncMode: 'INCREMENTAL' as const satisfies HistoricalSyncMode,
} as const;

/**
 * Xero / file-source limitations that must appear on every Young Guns full-history
 * report. These are capability facts — not invented records.
 */
export const YOUNG_GUNS_KNOWN_PROVIDER_LIMITATIONS: HistoricalProviderLimitation[] = [
  {
    provider: 'XERO',
    entityType: 'quotes',
    unavailable:
      'UI incremental quote refresh (refreshQuotesIncrementalFromXero) uses a small page budget and is not a historical import path.',
    remediation: 'not_applicable',
    detail:
      'Full-history quote import uses the resumable import pipeline with complete pagination and no date floor. Do not treat the finance-screen refresh as the migration.',
  },
  {
    provider: 'XERO',
    entityType: 'jobs',
    unavailable: 'Xero does not expose field-service job cards / Job 360 operational history.',
    remediation: 'alternate_source',
    detail:
      'Import jobs from CSV/XLSX/legacy export or manual upload. Prefer Xero for commercial quotes/invoices/payments when both exist.',
  },
  {
    provider: 'XERO',
    entityType: 'inventory',
    unavailable: 'Xero inventory/stock quantities are not part of the authorised Xero import stages.',
    remediation: 'alternate_source',
    detail:
      'Physical stock must come from inventory CSV/XLSX migration (Enterprise Data Migration). Labour/service lines are rejected from stock.',
  },
  {
    provider: 'XERO',
    entityType: 'asset',
    unavailable: 'Xero does not expose asset/equipment registry records used by Job 360.',
    remediation: 'alternate_source',
    detail: 'Import equipment via Enterprise Data Migration asset entity or manual registry entry.',
  },
  {
    provider: 'XERO',
    entityType: 'document',
    unavailable:
      'Only attachments linked to imported Xero parents are pulled; standalone legacy PDFs/photos are not inventable from Xero.',
    remediation: 'manual_import',
    detail:
      'Upload unmatched documents through historical document match (human review for low confidence).',
  },
];

export type HistoricalRecordDateBounds = {
  oldestRecordDate: string | null;
  newestRecordDate: string | null;
};

export function emptyHistoricalRecordDateBounds(): HistoricalRecordDateBounds {
  return { oldestRecordDate: null, newestRecordDate: null };
}

/** Narrow a source date/datetime into the running oldest/newest window. */
export function observeHistoricalRecordDate(
  bounds: HistoricalRecordDateBounds,
  value: string | Date | null | undefined,
): HistoricalRecordDateBounds {
  if (value == null) return bounds;
  const iso =
    value instanceof Date
      ? (Number.isNaN(value.getTime()) ? null : value.toISOString())
      : value.trim() || null;
  if (!iso) return bounds;

  const next = { ...bounds };
  if (!next.oldestRecordDate || iso < next.oldestRecordDate) {
    next.oldestRecordDate = iso;
  }
  if (!next.newestRecordDate || iso > next.newestRecordDate) {
    next.newestRecordDate = iso;
  }
  return next;
}

export function mergeHistoricalRecordDateBounds(
  ...parts: Array<HistoricalRecordDateBounds | null | undefined>
): HistoricalRecordDateBounds {
  let merged = emptyHistoricalRecordDateBounds();
  for (const part of parts) {
    if (!part) continue;
    merged = observeHistoricalRecordDate(merged, part.oldestRecordDate);
    merged = observeHistoricalRecordDate(merged, part.newestRecordDate);
  }
  return merged;
}

export function emptyHistoricalMigrationEntityCounts(): HistoricalMigrationEntityCounts {
  return {
    discoveredCount: 0,
    createdCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    skippedCount: 0,
    failedCount: 0,
  };
}

/**
 * Discoverable total from upsert counters. Prefer an explicit discoveredCount when the
 * source page size is known; otherwise sum outcomes.
 */
export function resolveHistoricalDiscoveredCount(input: {
  discoveredCount?: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount?: number;
  skippedCount: number;
  failedCount: number;
  /** Successful pulls (created+updated+unchanged). Used when discovered is omitted. */
  pulledCount?: number;
}): number {
  if (typeof input.discoveredCount === 'number' && Number.isFinite(input.discoveredCount)) {
    return Math.max(0, input.discoveredCount);
  }
  const unchanged = input.unchangedCount ?? 0;
  if (typeof input.pulledCount === 'number' && Number.isFinite(input.pulledCount)) {
    return Math.max(0, input.pulledCount + input.skippedCount + input.failedCount);
  }
  return Math.max(
    0,
    input.createdCount +
      input.updatedCount +
      unchanged +
      input.skippedCount +
      input.failedCount,
  );
}

export function resolveHistoricalSyncMode(input: {
  /** Null modified-since / no date floor on this run. */
  noDateFloorApplied: boolean;
  /** Every authorised stage already has a trustworthy full-history claim. */
  everyStageFullySynced?: boolean;
  /** Force full history (Young Guns initial migration). */
  forceFullHistory?: boolean;
}): HistoricalSyncMode {
  if (input.forceFullHistory || input.noDateFloorApplied || !input.everyStageFullySynced) {
    return 'FULL_HISTORY';
  }
  return 'INCREMENTAL';
}

export function buildHistoricalMigrationEntityReport(input: {
  entityType: string;
  createdCount: number;
  updatedCount: number;
  unchangedCount?: number;
  skippedCount: number;
  failedCount: number;
  pulledCount?: number;
  discoveredCount?: number;
  oldestRecordDate?: string | null;
  newestRecordDate?: string | null;
}): HistoricalMigrationEntityReport {
  const unchangedCount = input.unchangedCount ?? 0;
  const discoveredCount = resolveHistoricalDiscoveredCount({
    discoveredCount: input.discoveredCount,
    createdCount: input.createdCount,
    updatedCount: input.updatedCount,
    unchangedCount,
    skippedCount: input.skippedCount,
    failedCount: input.failedCount,
    pulledCount: input.pulledCount,
  });

  return {
    entityType: input.entityType,
    discoveredCount,
    createdCount: input.createdCount,
    updatedCount: input.updatedCount,
    unchangedCount,
    skippedCount: input.skippedCount,
    failedCount: input.failedCount,
    oldestRecordDate: input.oldestRecordDate ?? null,
    newestRecordDate: input.newestRecordDate ?? null,
  };
}

export function buildHistoricalMigrationReport(input: {
  syncMode: HistoricalSyncMode;
  noDateFloorApplied: boolean;
  entities: HistoricalMigrationEntityReport[];
  providerLimitations?: HistoricalProviderLimitation[];
  /** Extra limitations for this run (API errors, missing scopes, empty capability). */
  runLimitations?: HistoricalProviderLimitation[];
  includeKnownYoungGunsLimitations?: boolean;
}): HistoricalMigrationReport {
  const known =
    input.includeKnownYoungGunsLimitations === false
      ? []
      : YOUNG_GUNS_KNOWN_PROVIDER_LIMITATIONS;
  const providerLimitations = [
    ...known,
    ...(input.providerLimitations ?? []),
    ...(input.runLimitations ?? []),
  ];

  const totals = input.entities.reduce(
    (acc, entity) => {
      acc.totalRecordsDiscovered += entity.discoveredCount;
      acc.createdCount += entity.createdCount;
      acc.updatedCount += entity.updatedCount;
      acc.unchangedCount += entity.unchangedCount;
      acc.skippedCount += entity.skippedCount;
      acc.failedCount += entity.failedCount;
      return acc;
    },
    {
      totalRecordsDiscovered: 0,
      createdCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      skippedCount: 0,
      failedCount: 0,
    },
  );

  const bounds = mergeHistoricalRecordDateBounds(
    ...input.entities.map((entity) => ({
      oldestRecordDate: entity.oldestRecordDate,
      newestRecordDate: entity.newestRecordDate,
    })),
  );

  const modeLabel =
    input.syncMode === 'FULL_HISTORY'
      ? 'Full-history import (no date floor)'
      : 'Incremental sync (post full-history)';

  const dateLabel =
    bounds.oldestRecordDate && bounds.newestRecordDate
      ? `Source dates ${bounds.oldestRecordDate.slice(0, 10)} → ${bounds.newestRecordDate.slice(0, 10)}.`
      : 'Source date range unavailable for one or more entities (reported per entity / limitation).';

  const gapLabel =
    providerLimitations.length > 0
      ? ` ${providerLimitations.length} provider limitation(s) documented — unavailable history was not fabricated.`
      : '';

  return {
    syncMode: input.syncMode,
    noDateFloorApplied: input.noDateFloorApplied,
    arbitraryDateCutoffForbidden: true,
    oldestRecordDateImported: bounds.oldestRecordDate,
    newestRecordDateImported: bounds.newestRecordDate,
    ...totals,
    entities: input.entities,
    providerLimitations,
    summary: `${modeLabel}. Discovered ${totals.totalRecordsDiscovered}: ${totals.createdCount} created / ${totals.updatedCount} updated / ${totals.unchangedCount} unchanged / ${totals.skippedCount} skipped / ${totals.failedCount} failed. ${dateLabel}${gapLabel}`,
  };
}

/** Extract a plausible source record date from a DM / CSV row. */
export function extractHistoricalSourceDateFromRow(
  row: Record<string, string | null | undefined>,
): string | null {
  const keys = [
    'issuedAt',
    'issueDate',
    'paidAt',
    'paymentDate',
    'date',
    'transactionDate',
    'scheduledAt',
    'createdAt',
    'installationDate',
    'dueDate',
  ];
  for (const key of keys) {
    const raw = row[key];
    if (raw == null) continue;
    const trimmed = String(raw).trim();
    if (!trimmed) continue;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
    // Allow plain YYYY-MM-DD without timezone shift surprises for report display.
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return `${trimmed}T00:00:00.000Z`;
    }
  }
  return null;
}

export function buildDmHistoricalMigrationReport(input: {
  entityType: string;
  sourceProvider: string;
  results: Array<{
    outcome: 'imported' | 'failed' | 'skipped' | 'duplicate_pending';
    /** linked existing without rewrite → unchanged; otherwise created (default for imported). */
    mutation?: 'created' | 'updated' | 'unchanged' | null;
    sourceData?: Record<string, string>;
  }>;
  linkedRowNumbers?: Iterable<number>;
  executable: boolean;
  unsupportedMessage?: string | null;
}): HistoricalMigrationReport {
  const linked = new Set(input.linkedRowNumbers ?? []);
  let createdCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let bounds = emptyHistoricalRecordDateBounds();

  input.results.forEach((result, index) => {
    const rowNumber = index + 1;
    if (result.sourceData) {
      bounds = observeHistoricalRecordDate(
        bounds,
        extractHistoricalSourceDateFromRow(result.sourceData),
      );
    }

    if (result.outcome === 'failed') {
      failedCount += 1;
      return;
    }
    if (result.outcome === 'skipped' || result.outcome === 'duplicate_pending') {
      skippedCount += 1;
      return;
    }

    const mutation =
      result.mutation ??
      (linked.has(rowNumber) ? 'unchanged' : 'created');
    if (mutation === 'updated') updatedCount += 1;
    else if (mutation === 'unchanged') unchangedCount += 1;
    else createdCount += 1;
  });

  const runLimitations: HistoricalProviderLimitation[] = [];
  if (!input.executable) {
    runLimitations.push({
      provider: input.sourceProvider,
      entityType: input.entityType,
      unavailable: input.unsupportedMessage ?? 'No safe canonical commit path for this entity yet.',
      remediation: 'manual_import',
      detail: 'Reported as unavailable — not fabricated into canonical tables.',
    });
  }

  const entity = buildHistoricalMigrationEntityReport({
    entityType: input.entityType,
    createdCount,
    updatedCount,
    unchangedCount,
    skippedCount,
    failedCount,
    discoveredCount: input.results.length,
    oldestRecordDate: bounds.oldestRecordDate,
    newestRecordDate: bounds.newestRecordDate,
  });

  return buildHistoricalMigrationReport({
    syncMode: 'FULL_HISTORY',
    noDateFloorApplied: true,
    entities: [entity],
    runLimitations,
    includeKnownYoungGunsLimitations: true,
  });
}

export function buildXeroHistoricalMigrationReport(input: {
  noDateFloorApplied: boolean;
  everyStageFullySynced?: boolean;
  forceFullHistory?: boolean;
  stageCounts: Array<{
    entityType: string;
    createdCount: number;
    updatedCount: number;
    unchangedCount?: number;
    skippedCount: number;
    failedCount: number;
    pulledCount?: number;
    oldestRecordDate?: string | null;
    newestRecordDate?: string | null;
  }>;
  runLimitations?: HistoricalProviderLimitation[];
  carriedFailureCount?: number;
}): HistoricalMigrationReport {
  const syncMode = resolveHistoricalSyncMode({
    noDateFloorApplied: input.noDateFloorApplied,
    everyStageFullySynced: input.everyStageFullySynced,
    forceFullHistory: input.forceFullHistory,
  });

  const runLimitations = [...(input.runLimitations ?? [])];
  if ((input.carriedFailureCount ?? 0) > 0) {
    runLimitations.push({
      provider: 'XERO',
      entityType: 'import',
      unavailable: `${input.carriedFailureCount} record(s) failed in stages this run resumed past and were not re-pulled.`,
      remediation: 'provider_capability',
      detail:
        'Resumed checkpoints preserve progress but carried failures remain missing until a clean full-history re-pull or targeted repair.',
    });
  }

  return buildHistoricalMigrationReport({
    syncMode,
    noDateFloorApplied: input.noDateFloorApplied,
    entities: input.stageCounts.map((stage) => buildHistoricalMigrationEntityReport(stage)),
    runLimitations,
    includeKnownYoungGunsLimitations: true,
  });
}
