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

export type XeroImportJobStatus = 'queued' | 'pending' | 'running' | 'completed' | 'failed';

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
  currentStage: XeroImportStage | null;
  completedStages: XeroImportStage[];
  contacts: XeroImportEntityCounts;
  invoices: XeroImportEntityCounts;
  payments: XeroImportEntityCounts;
  bankTransactions: XeroImportEntityCounts;
  failedStage: XeroImportStage | null;
  message: string | null;
  syncedAt: string | null;
};

export type XeroEnqueueImportResult = {
  jobId: string;
  status: 'queued' | 'running';
  message: string;
};

export type XeroSyncStatusResponse = {
  connected: boolean;
  organisationName: string | null;
  baseCurrency: string | null;
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
