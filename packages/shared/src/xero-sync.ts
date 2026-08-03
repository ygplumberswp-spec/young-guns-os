export type XeroSyncScope =
  'organisation' | 'customers' | 'quotes' | 'invoices' | 'payments' | 'import';

export type XeroSyncEntityStatus = 'pending' | 'synced' | 'failed' | 'out_of_sync';

export type XeroSyncEntityType = 'customer' | 'quote' | 'invoice' | 'payment' | 'bank_transaction';

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

export type XeroImportStage = 'contacts' | 'invoices' | 'payments' | 'bank_transactions';

export type XeroImportSyncResult = {
  success: boolean;
  message: string;
  syncedAt: string | null;
  contacts: XeroImportEntityCounts;
  invoices: XeroImportEntityCounts;
  payments: XeroImportEntityCounts;
  bankTransactions: XeroImportEntityCounts;
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
  invoicesPage: number;
  paymentsPage: number;
  bankTransactionsPage: number;
};

export type XeroImportJobProgress = {
  jobId: string;
  status: XeroImportJobStatus;
  uiStatus: XeroImportJobDisplayStatus;
  uiStatusLabel: string;
  currentStage: XeroImportStage | null;
  completedStages: XeroImportStage[];
  checkpoint: XeroImportCheckpoint;
  contacts: XeroImportEntityCounts;
  invoices: XeroImportEntityCounts;
  payments: XeroImportEntityCounts;
  bankTransactions: XeroImportEntityCounts;
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
  contacts: XeroImportEntityCounts;
  invoices: XeroImportEntityCounts;
  payments: XeroImportEntityCounts;
  bankTransactions: XeroImportEntityCounts;
}): number {
  return (
    input.contacts.pulledCount +
    input.invoices.pulledCount +
    input.payments.pulledCount +
    input.bankTransactions.pulledCount
  );
}

export type XeroEnqueueImportResult = {
  jobId: string;
  status: 'queued' | 'running';
  message: string;
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
  outstandingAmountCents: number;
  unpaidInvoiceCount: number;
  customersWithOutstandingCount: number;
  currency: string;
  importJob?: XeroImportJobProgress | null;
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
