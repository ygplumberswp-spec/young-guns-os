export type XeroSyncScope =
  'organisation' | 'customers' | 'quotes' | 'invoices' | 'payments' | 'import';

export type XeroSyncEntityStatus = 'pending' | 'synced' | 'failed' | 'out_of_sync';

export type XeroSyncEntityType =
  | 'customer'
  | 'quote'
  | 'invoice'
  | 'payment'
  | 'bank_transaction'
  | 'bill'
  | 'credit_note'
  | 'account'
  | 'tracking_category'
  | 'attachment';

export type XeroEntitySyncStats = {
  syncedCount: number;
  failedCount: number;
  pendingCount: number;
  outOfSyncCount: number;
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
};

export type XeroImportEntityCounts = {
  createdCount: number;
  updatedCount: number;
  pulledCount: number;
  failedCount: number;
  skippedCount: number;
};

/**
 * Import stages in dependency order. Reference data (accounts, tracking) lands first so line
 * items resolve to real account meaning; attachments land last once their parents exist.
 */
export type XeroImportStage =
  | 'accounts'
  | 'tracking_categories'
  | 'contacts'
  | 'quotes'
  | 'invoices'
  | 'bills'
  | 'credit_notes'
  | 'payments'
  | 'bank_transactions'
  | 'attachments';

export const XERO_IMPORT_STAGE_LABELS: Record<XeroImportStage, string> = {
  accounts: 'Chart of accounts',
  tracking_categories: 'Tracking categories',
  contacts: 'Contacts',
  quotes: 'Quotes',
  invoices: 'Invoices',
  bills: 'Bills',
  credit_notes: 'Credit notes',
  payments: 'Payments',
  bank_transactions: 'Bank transactions',
  attachments: 'Attachments',
};

export type XeroImportSyncResult = {
  success: boolean;
  message: string;
  syncedAt: string | null;
  accounts: XeroImportEntityCounts;
  trackingCategories: XeroImportEntityCounts;
  contacts: XeroImportEntityCounts;
  quotes: XeroImportEntityCounts;
  invoices: XeroImportEntityCounts;
  bills: XeroImportEntityCounts;
  creditNotes: XeroImportEntityCounts;
  payments: XeroImportEntityCounts;
  bankTransactions: XeroImportEntityCounts;
  attachments: XeroImportEntityCounts;
  failedStage?: XeroImportStage | null;
  completedStages?: XeroImportStage[];
  syncJobId?: string;
};

export type XeroImportJobStatus =
  | 'queued'
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed';

/** UI-facing import status — extends DB job status with recovery/rate-limit states. */
export type XeroImportJobDisplayStatus =
  | XeroImportJobStatus
  | 'resuming'
  | 'retrying'
  | 'partial'
  | 'waiting';

export type XeroImportActivity =
  | 'processing'
  | 'waiting_next_batch'
  | 'rate_limited'
  | 'stalled';

export const XERO_IMPORT_UI_STATUS_LABELS: Record<XeroImportJobDisplayStatus, string> = {
  queued: 'Queued',
  pending: 'Queued',
  running: 'Running',
  completed: 'Synced',
  failed: 'Failed',
  resuming: 'Resuming',
  retrying: 'Retrying',
  partial: 'Partial',
  waiting: 'Waiting for next batch',
};

export type XeroImportCheckpoint = {
  stage: XeroImportStage;
  contactsPage: number;
  quotesPage: number;
  invoicesPage: number;
  billsPage: number;
  creditNotesPage: number;
  paymentsPage: number;
  bankTransactionsPage: number;
  /** Cursor into the parent records whose attachments still need fetching. */
  attachmentsOffset: number;
  /**
   * Modified-since watermark applied to this run. Null means a complete historical pull with no
   * date floor. Set only for incremental runs, from the previous successful run's start time.
   */
  modifiedSince: string | null;
};

export type XeroImportJobProgress = {
  jobId: string;
  status: XeroImportJobStatus;
  uiStatus: XeroImportJobDisplayStatus;
  uiStatusLabel: string;
  currentStage: XeroImportStage | null;
  completedStages: XeroImportStage[];
  checkpoint: XeroImportCheckpoint;
  accounts: XeroImportEntityCounts;
  trackingCategories: XeroImportEntityCounts;
  contacts: XeroImportEntityCounts;
  quotes: XeroImportEntityCounts;
  invoices: XeroImportEntityCounts;
  bills: XeroImportEntityCounts;
  creditNotes: XeroImportEntityCounts;
  payments: XeroImportEntityCounts;
  bankTransactions: XeroImportEntityCounts;
  attachments: XeroImportEntityCounts;
  failedStage: XeroImportStage | null;
  message: string | null;
  syncedAt: string | null;
  heartbeatAt: string | null;
  nextRetryAt: string | null;
  activity: XeroImportActivity | null;
  processedCount: number;
};

export function deriveXeroImportJobUiStatus(input: {
  jobStatus: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  activity?: XeroImportActivity | null;
  nextRetryAt?: string | null;
  hasPartialProgress?: boolean;
  resumedFromAbandoned?: boolean;
}): { uiStatus: XeroImportJobDisplayStatus; uiStatusLabel: string } {
  const now = Date.now();
  const retryPending =
    input.nextRetryAt != null && new Date(input.nextRetryAt).getTime() > now;

  if (input.jobStatus === 'completed') {
    return { uiStatus: 'completed', uiStatusLabel: XERO_IMPORT_UI_STATUS_LABELS.completed };
  }

  if (input.jobStatus === 'failed') {
    if (input.hasPartialProgress) {
      return { uiStatus: 'partial', uiStatusLabel: XERO_IMPORT_UI_STATUS_LABELS.partial };
    }
    return { uiStatus: 'failed', uiStatusLabel: XERO_IMPORT_UI_STATUS_LABELS.failed };
  }

  if (input.resumedFromAbandoned && (input.jobStatus === 'pending' || input.jobStatus === 'running')) {
    return { uiStatus: 'resuming', uiStatusLabel: XERO_IMPORT_UI_STATUS_LABELS.resuming };
  }

  if (input.activity === 'rate_limited' || (retryPending && input.jobStatus === 'running')) {
    return { uiStatus: 'retrying', uiStatusLabel: XERO_IMPORT_UI_STATUS_LABELS.retrying };
  }

  if (input.activity === 'waiting_next_batch' || input.jobStatus === 'pending') {
    return { uiStatus: 'waiting', uiStatusLabel: XERO_IMPORT_UI_STATUS_LABELS.waiting };
  }

  if (input.jobStatus === 'running' && input.hasPartialProgress) {
    return { uiStatus: 'partial', uiStatusLabel: XERO_IMPORT_UI_STATUS_LABELS.partial };
  }

  if (input.jobStatus === 'running') {
    return { uiStatus: 'running', uiStatusLabel: XERO_IMPORT_UI_STATUS_LABELS.running };
  }

  return { uiStatus: 'queued', uiStatusLabel: XERO_IMPORT_UI_STATUS_LABELS.queued };
}

export function sumXeroImportProcessedCounts(input: {
  accounts?: XeroImportEntityCounts;
  trackingCategories?: XeroImportEntityCounts;
  contacts: XeroImportEntityCounts;
  quotes?: XeroImportEntityCounts;
  invoices: XeroImportEntityCounts;
  bills?: XeroImportEntityCounts;
  creditNotes?: XeroImportEntityCounts;
  payments: XeroImportEntityCounts;
  bankTransactions: XeroImportEntityCounts;
  attachments?: XeroImportEntityCounts;
}): number {
  return (
    (input.accounts?.pulledCount ?? 0) +
    (input.trackingCategories?.pulledCount ?? 0) +
    input.contacts.pulledCount +
    (input.quotes?.pulledCount ?? 0) +
    input.invoices.pulledCount +
    (input.bills?.pulledCount ?? 0) +
    (input.creditNotes?.pulledCount ?? 0) +
    input.payments.pulledCount +
    input.bankTransactions.pulledCount +
    (input.attachments?.pulledCount ?? 0)
  );
}

export type XeroEnqueueImportResult = {
  jobId: string;
  status: 'queued' | 'running';
  message: string;
};

/**
 * Every financial value surfaced from Xero-derived data carries this. It is the difference
 * between a figure and an evidence-backed figure, and it is what stops a partial import being
 * presented as a complete answer.
 */
export type XeroEvidenceClassification =
  /** Read directly from an imported Xero record. Authoritative. */
  | 'xero_fact'
  /** From TITAN's own jobs, customers, timesheets, properties. */
  | 'titan_operational_fact'
  /** Derived by TITAN from the above; the calculation and inputs must be stated. */
  | 'calculated'
  /** AURA's suggestion. Never a fact, never auto-executed. */
  | 'recommendation';

export type XeroEvidenceCoverage = 'complete' | 'partial' | 'unavailable';

export type XeroFinancialAttribution = {
  source: 'xero' | 'titan' | 'xero+titan';
  /** Real record IDs supporting the value — Xero GUIDs and/or TITAN ids. */
  sourceRecordIds: string[];
  /** The sync timestamp this value reflects. Null when nothing has ever synced. */
  asAt: string | null;
  coverage: XeroEvidenceCoverage;
  /** Why the coverage is what it is. Required — a bare 'partial' is not an answer. */
  coverageRationale: string;
  classification: XeroEvidenceClassification;
  /** Records behind the figure, so a count can be checked rather than trusted. */
  recordCount: number;
  /** Earliest/latest source record dates covered, when any records exist. */
  dateRange: { from: string; to: string } | null;
  /** How the value was obtained, e.g. 'sum of Xero ACCREC invoice totals'. */
  method: string;
};

/** A figure that may legitimately be absent. Never coerce a missing amount to zero. */
export type XeroAttributedAmount = {
  amountCents: number | null;
  currency: string;
  attribution: XeroFinancialAttribution;
};

export const XERO_EVIDENCE_CLASSIFICATION_LABELS: Record<XeroEvidenceClassification, string> = {
  xero_fact: 'Xero fact',
  titan_operational_fact: 'TITAN operational fact',
  calculated: 'Calculated',
  recommendation: 'Recommendation',
};

export type XeroEntityCoverageRow = {
  entity: XeroImportStage;
  /** Records TITAN currently holds for this entity. */
  importedCount: number;
  lastSyncedAt: string | null;
  /** Records this entity failed to import, each with a log row. */
  failedCount: number;
  skippedCount: number;
  /** What actually happened to this stage, before it is flattened to a coverage claim. */
  coverageState: XeroStageCoverageState;
  coverage: XeroEvidenceCoverage;
  coverageRationale: string;
};

/**
 * Whole-history coverage. Drives the honest "what can this answer actually cover" statement on
 * Finance, Customer 360 and AURA.
 */
export type XeroHistoryCoverage = {
  connected: boolean;
  /** Null when a full historical pull has never completed. */
  fullHistorySyncedAt: string | null;
  /** True when the last completed run applied no date floor. */
  noDateFloorApplied: boolean;
  lastIncrementalSyncAt: string | null;
  stale: boolean;
  staleRationale: string | null;
  entities: XeroEntityCoverageRow[];
  overallCoverage: XeroEvidenceCoverage;
  overallRationale: string;
};

/**
 * Rules AURA must obey when answering a financial question from imported Xero history. These
 * travel with the context so a confident answer over a partial import cannot be produced by
 * accident.
 */
export function buildAuraEvidenceGuidance(coverage: XeroHistoryCoverage): string[] {
  const guidance = [
    'Cite the real records behind every financial figure: record type, Xero ID, date and amount.',
    'If a figure cannot be cited, say it cannot be answered and why. Never estimate a financial figure and present it as fact.',
    'Label every part of an answer as one of: Xero fact, TITAN operational fact, calculated, or recommendation. Never blend them into one confident sentence.',
    'Never propose or perform a write to Xero. A write-back may only be proposed as a recommendation and requires Owner approval.',
  ];

  if (!coverage.connected) {
    guidance.push(
      'Xero is not connected. Refuse all questions about historical financial fact and say Xero must be connected and imported first.',
    );
    return guidance;
  }

  if (coverage.overallCoverage !== 'complete') {
    guidance.push(
      `Xero history is ${coverage.overallCoverage}: ${coverage.overallRationale} Scope every answer to what is covered and state the gap.`,
    );
  }

  if (coverage.stale && coverage.staleRationale) {
    guidance.push(
      `Xero data is stale: ${coverage.staleRationale} Present figures as "as at" the last sync, not as current.`,
    );
  }

  const missing = coverage.entities.filter((entity) => entity.coverage === 'unavailable');

  if (missing.length > 0) {
    guidance.push(
      `No history imported for: ${missing.map((entity) => entity.entity).join(', ')}. Refuse questions that depend on these entities.`,
    );
  }

  return guidance;
}

export function buildUnavailableAttribution(
  reason: string,
  method: string,
): XeroFinancialAttribution {
  return {
    source: 'xero',
    sourceRecordIds: [],
    asAt: null,
    coverage: 'unavailable',
    coverageRationale: reason,
    classification: 'xero_fact',
    recordCount: 0,
    dateRange: null,
    method,
  };
}

/**
 * What actually happened to one entity stage. Kept separate from the coverage claim so a stage
 * that imported nothing while records failed cannot be flattened into the same answer as a stage
 * Xero simply had no records for.
 */
export type XeroStageCoverageState =
  /** No run has ever recorded evidence for this stage. */
  | 'not_started'
  /** Nothing was imported and records failed. */
  | 'failed'
  /** A run recorded evidence for this stage and then stopped before finishing it. */
  | 'interrupted'
  /** Some records are held, but records failed, were skipped, or history is not fully pulled. */
  | 'partial'
  /** The stage itself finished successfully over the whole history. */
  | 'complete';

/**
 * Whether a stage that finished with failed records may still claim complete coverage. `strict`
 * (the default everywhere) never allows it. `allow_documented_partial` exists only so a tenant
 * that has accepted a known, permanently unreachable slice can be configured to do so, and it
 * still carries the failure count in the rationale.
 */
export type XeroPartialHistoryPolicy = 'strict' | 'allow_documented_partial';

export type XeroStageCoverageEvidence = {
  importedCount: number;
  failedCount: number;
  skippedCount: number;
  /** True only when a no-date-floor run finished this stage with nothing failed. */
  fullHistorySynced: boolean;
  /** Defaults to whether any count or full-history timestamp exists. */
  everSynced?: boolean;
  /** True when a run touched this stage and did not finish it (cancelled, stalled, budget). */
  interrupted?: boolean;
  partialHistoryPolicy?: XeroPartialHistoryPolicy;
};

/**
 * The single place a stage's coverage claim is decided.
 *
 * `complete` requires the stage itself to have finished successfully with nothing failed — an
 * imported count of zero alongside failures is never complete, and a stale `fullHistorySyncedAt`
 * on its own proves nothing.
 */
export function resolveStageCoverageState(evidence: XeroStageCoverageEvidence): {
  state: XeroStageCoverageState;
  coverage: XeroEvidenceCoverage;
  rationale: string;
} {
  const importedCount = Math.max(0, evidence.importedCount);
  const failedCount = Math.max(0, evidence.failedCount);
  const skippedCount = Math.max(0, evidence.skippedCount);
  const everSynced =
    evidence.everSynced ??
    (importedCount > 0 || failedCount > 0 || skippedCount > 0 || evidence.fullHistorySynced);
  const logNote = 'Each failed or skipped record has a sync log row with its Xero ID and reason.';
  const counted = `${importedCount} imported, ${failedCount} failed, ${skippedCount} skipped`;

  if (!everSynced) {
    return {
      state: 'not_started',
      coverage: 'unavailable',
      rationale: 'No import has recorded any evidence for this entity, so nothing is covered.',
    };
  }

  if (importedCount === 0 && failedCount > 0) {
    return {
      state: 'failed',
      coverage: 'unavailable',
      rationale: `Nothing was imported and ${failedCount} record(s) failed (${counted}), so this entity has no usable history. ${logNote}`,
    };
  }

  if (evidence.interrupted) {
    return {
      state: 'interrupted',
      coverage: importedCount > 0 ? 'partial' : 'unavailable',
      rationale: `The last import of this entity stopped before finishing (${counted}), so it covers only what had been imported when it stopped.`,
    };
  }

  if (
    failedCount > 0 &&
    evidence.fullHistorySynced &&
    importedCount > 0 &&
    evidence.partialHistoryPolicy === 'allow_documented_partial'
  ) {
    return {
      state: 'complete',
      coverage: 'complete',
      rationale: `Full history imported with a configured, documented partial result: ${counted}. ${logNote}`,
    };
  }

  if (failedCount > 0 || skippedCount > 0) {
    return {
      state: 'partial',
      coverage: 'partial',
      rationale: `${failedCount} record(s) failed and ${skippedCount} were skipped during import (${counted}). ${logNote}`,
    };
  }

  if (!evidence.fullHistorySynced) {
    return {
      state: importedCount > 0 ? 'partial' : 'not_started',
      coverage: importedCount > 0 ? 'partial' : 'unavailable',
      rationale:
        importedCount > 0
          ? `A complete historical import has not finished for this entity (${counted}), so it covers only what has been imported so far.`
          : 'No complete historical import has finished for this entity and nothing has been imported.',
    };
  }

  if (importedCount === 0) {
    return {
      state: 'complete',
      coverage: 'unavailable',
      rationale:
        'A complete historical import finished for this entity and Xero returned no records, so there is nothing to answer from.',
    };
  }

  return {
    state: 'complete',
    coverage: 'complete',
    rationale: `Full Xero history imported for this entity with no failed or skipped records (${counted}).`,
  };
}

/**
 * Coverage for a figure. `partial` whenever any record failed or was skipped, or history has
 * never been fully pulled — a confident answer over a partial import is a defect.
 */
export function resolveEvidenceCoverage(input: {
  recordCount: number;
  failedCount: number;
  skippedCount: number;
  fullHistorySynced: boolean;
}): { coverage: XeroEvidenceCoverage; rationale: string } {
  if (!input.fullHistorySynced) {
    return {
      coverage: input.recordCount > 0 ? 'partial' : 'unavailable',
      rationale:
        'A complete historical Xero import has not finished, so this covers only what has been imported so far.',
    };
  }

  if (input.failedCount > 0 || input.skippedCount > 0) {
    return {
      coverage: 'partial',
      rationale: `${input.failedCount} record(s) failed and ${input.skippedCount} were skipped during import; each has a sync log row with its Xero ID and reason.`,
    };
  }

  if (input.recordCount === 0) {
    return {
      coverage: 'unavailable',
      rationale: 'No matching Xero records exist for this scope.',
    };
  }

  return {
    coverage: 'complete',
    rationale: 'Full Xero history imported with no failed or skipped records for this scope.',
  };
}

export type XeroCustomerFinancialRecord = {
  recordType: 'invoice' | 'quote' | 'payment' | 'credit_note';
  /** The Xero GUID. Present on every imported record so it can be drilled back to source. */
  xeroId: string | null;
  titanId: string;
  reference: string | null;
  status: string | null;
  amountCents: number;
  amountPaidCents: number | null;
  amountDueCents: number | null;
  currency: string;
  issuedAt: string | null;
  dueAt: string | null;
  /** Real links only — never inferred. */
  jobId: string | null;
};

/**
 * Complete financial relationship for one customer, composed from imported Xero records. Read
 * from source rather than recalculated into a stored balance that could drift from Xero.
 */
export type XeroCustomerFinancialHistory = {
  customerId: string;
  currency: string;
  invoices: XeroCustomerFinancialRecord[];
  quotes: XeroCustomerFinancialRecord[];
  payments: XeroCustomerFinancialRecord[];
  creditNotes: XeroCustomerFinancialRecord[];
  lifetimeRevenue: XeroAttributedAmount;
  outstandingBalance: XeroAttributedAmount;
  overdueExposure: XeroAttributedAmount;
  /** Null when there is not enough real history to say anything honest. */
  averageDaysToPay: { value: number | null; attribution: XeroFinancialAttribution };
  coverage: XeroHistoryCoverage;
};

export type XeroFinancePipelineSummary = {
  lastSyncAt: string | null;
  lastError: string | null;
  status: string | null;
  contactsImported: number;
  quotesImported: number;
  invoicesImported: number;
  paymentsImported: number;
  bankTransactionsImported: number;
  failedCount: number;
  /** True when a future scheduled job can attach to this pipeline. */
  scheduledJobsReady: boolean;
};

export type XeroSyncStatusResponse = {
  connected: boolean;
  organisationName: string | null;
  baseCurrency: string | null;
  /** Connection-level last successful sync/import timestamp. */
  lastSyncAt: string | null;
  lastError: string | null;
  customers: XeroEntitySyncStats;
  quotes: XeroEntitySyncStats;
  invoices: XeroEntitySyncStats;
  payments: XeroEntitySyncStats;
  bankTransactions?: XeroEntitySyncStats;
  outstandingAmountCents: number;
  unpaidInvoiceCount: number;
  customersWithOutstandingCount: number;
  currency: string;
  importJob?: XeroImportJobProgress | null;
  financePipeline?: XeroFinancePipelineSummary | null;
};

export type XeroEntitySyncResult = {
  scope: XeroSyncScope;
  createdCount: number;
  updatedCount: number;
  pulledCount: number;
  failedCount: number;
  skippedCount: number;
  syncedAt: string;
  syncJobId?: string;
};

export type XeroSyncLogSummary = {
  id: string;
  entityType: XeroSyncEntityType;
  entityId: string | null;
  xeroEntityId: string | null;
  action: 'push' | 'pull' | 'update' | 'link';
  status: 'success' | 'failed';
  message: string | null;
  syncJobId: string | null;
  createdAt: string;
};

export type XeroAccountingAuraContext = {
  connected: boolean;
  organisationName: string | null;
  baseCurrency: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  importStatus: string | null;
  /** What the imported history actually covers, so answers can be scoped honestly. */
  historyCoverage?: XeroHistoryCoverage;
  /** Instructions AURA must follow when answering from this context. */
  evidenceGuidance?: string[];
  syncedCustomerCount: number;
  syncedInvoiceCount: number;
  syncedQuoteCount: number;
  syncedPaymentCount: number;
  outstandingAmountCents: number;
  unpaidInvoiceCount: number;
  customersWithOutstandingCount: number;
  currency: string;
  unpaidInvoices: Array<{
    invoiceNumber: string;
    customerName: string;
    amountCents: number;
    amountPaidCents: number;
    amountDueCents: number;
    status: string;
    dueDate: string | null;
  }>;
  customersOwing: Array<{
    customerName: string;
    outstandingAmountCents: number;
    unpaidInvoiceCount: number;
  }>;
};
