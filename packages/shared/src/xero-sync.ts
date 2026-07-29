export type XeroSyncScope = 'organisation' | 'customers' | 'quotes' | 'invoices' | 'payments';

export type XeroSyncEntityStatus = 'pending' | 'synced' | 'failed' | 'out_of_sync';

export type XeroSyncEntityType = 'customer' | 'quote' | 'invoice' | 'payment';

export type XeroEntitySyncStats = {
  syncedCount: number;
  failedCount: number;
  pendingCount: number;
  outOfSyncCount: number;
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
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
