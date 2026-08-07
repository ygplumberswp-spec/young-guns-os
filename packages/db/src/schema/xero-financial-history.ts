import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { integrationConnections } from './integration-connections';
import { integrationSyncJobs } from './integration-sync-jobs';

/**
 * Read-only Xero financial history.
 *
 * These tables are an operations/search layer over Xero's ledger — never a second ledger. Xero
 * remains the accounting source of truth: nothing here recomputes a balance, and every row keeps
 * its Xero GUID plus provenance so it can be traced back to the record it came from.
 */

/** Chart of accounts — lets imported line items resolve to real account meaning. */
export const xeroAccounts = pgTable(
  'xero_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    integrationConnectionId: uuid('integration_connection_id')
      .notNull()
      .references(() => integrationConnections.id, { onDelete: 'cascade' }),
    xeroAccountId: text('xero_account_id').notNull(),
    code: text('code'),
    name: text('name').notNull(),
    type: text('type'),
    taxType: text('tax_type'),
    accountClass: text('account_class'),
    status: text('status'),
    description: text('description'),
    reportingCode: text('reporting_code'),
    sourceProvider: text('source_provider').notNull().default('xero'),
    sourceSyncedAt: timestamp('source_synced_at', { withTimezone: true }),
    sourceImportJobId: uuid('source_import_job_id').references(() => integrationSyncJobs.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyAccountUnique: unique('xero_accounts_company_account_unique').on(
      table.companyId,
      table.xeroAccountId,
    ),
    companyCodeIdx: index('xero_accounts_company_code_idx').on(table.companyId, table.code),
  }),
);

export const xeroTrackingCategories = pgTable(
  'xero_tracking_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    integrationConnectionId: uuid('integration_connection_id')
      .notNull()
      .references(() => integrationConnections.id, { onDelete: 'cascade' }),
    xeroTrackingCategoryId: text('xero_tracking_category_id').notNull(),
    name: text('name').notNull(),
    status: text('status'),
    sourceProvider: text('source_provider').notNull().default('xero'),
    sourceSyncedAt: timestamp('source_synced_at', { withTimezone: true }),
    sourceImportJobId: uuid('source_import_job_id').references(() => integrationSyncJobs.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCategoryUnique: unique('xero_tracking_categories_company_category_unique').on(
      table.companyId,
      table.xeroTrackingCategoryId,
    ),
  }),
);

export const xeroTrackingOptions = pgTable(
  'xero_tracking_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    trackingCategoryId: uuid('tracking_category_id')
      .notNull()
      .references(() => xeroTrackingCategories.id, { onDelete: 'cascade' }),
    xeroTrackingOptionId: text('xero_tracking_option_id').notNull(),
    name: text('name').notNull(),
    status: text('status'),
    sourceSyncedAt: timestamp('source_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyOptionUnique: unique('xero_tracking_options_company_option_unique').on(
      table.companyId,
      table.xeroTrackingOptionId,
    ),
  }),
);

/**
 * Supplier bills (ACCPAY). Held separately from TITAN `invoices` (which are sales-side) so the
 * expense ledger is never confused with revenue.
 */
export const xeroBills = pgTable(
  'xero_bills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    integrationConnectionId: uuid('integration_connection_id')
      .notNull()
      .references(() => integrationConnections.id, { onDelete: 'cascade' }),
    xeroInvoiceId: text('xero_invoice_id').notNull(),
    xeroContactId: text('xero_contact_id'),
    supplierName: text('supplier_name'),
    billNumber: text('bill_number'),
    reference: text('reference'),
    /** Xero status verbatim, including VOIDED and DELETED — history explains, it does not hide. */
    status: text('status'),
    subtotalCents: integer('subtotal_cents').notNull().default(0),
    taxCents: integer('tax_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull().default(0),
    amountDueCents: integer('amount_due_cents').notNull().default(0),
    amountPaidCents: integer('amount_paid_cents').notNull().default(0),
    currency: text('currency'),
    issueDate: date('issue_date'),
    dueDate: date('due_date'),
    sourceProvider: text('source_provider').notNull().default('xero'),
    sourceSyncedAt: timestamp('source_synced_at', { withTimezone: true }),
    sourceImportJobId: uuid('source_import_job_id').references(() => integrationSyncJobs.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyBillUnique: unique('xero_bills_company_invoice_unique').on(
      table.companyId,
      table.xeroInvoiceId,
    ),
    companyIssueDateIdx: index('xero_bills_company_issue_date_idx').on(
      table.companyId,
      table.issueDate,
    ),
    companyContactIdx: index('xero_bills_company_contact_idx').on(
      table.companyId,
      table.xeroContactId,
    ),
  }),
);

export const xeroBillLineItems = pgTable(
  'xero_bill_line_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    billId: uuid('bill_id')
      .notNull()
      .references(() => xeroBills.id, { onDelete: 'cascade' }),
    xeroLineItemId: text('xero_line_item_id'),
    position: integer('position').notNull().default(0),
    description: text('description'),
    quantity: integer('quantity').notNull().default(1),
    unitAmountCents: integer('unit_amount_cents').notNull().default(0),
    lineAmountCents: integer('line_amount_cents').notNull().default(0),
    taxAmountCents: integer('tax_amount_cents').notNull().default(0),
    accountCode: text('account_code'),
    taxType: text('tax_type'),
    /** Tracking option references as Xero holds them on the line. */
    tracking: jsonb('tracking').$type<Array<Record<string, unknown>>>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    billIdx: index('xero_bill_line_items_bill_idx').on(table.companyId, table.billId),
    accountCodeIdx: index('xero_bill_line_items_account_code_idx').on(
      table.companyId,
      table.accountCode,
    ),
  }),
);

export const xeroCreditNotes = pgTable(
  'xero_credit_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    integrationConnectionId: uuid('integration_connection_id')
      .notNull()
      .references(() => integrationConnections.id, { onDelete: 'cascade' }),
    xeroCreditNoteId: text('xero_credit_note_id').notNull(),
    creditNoteNumber: text('credit_note_number'),
    xeroContactId: text('xero_contact_id'),
    contactName: text('contact_name'),
    /** ACCRECCREDIT (customer) or ACCPAYCREDIT (supplier). */
    type: text('type'),
    status: text('status'),
    subtotalCents: integer('subtotal_cents').notNull().default(0),
    taxCents: integer('tax_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull().default(0),
    remainingCreditCents: integer('remaining_credit_cents').notNull().default(0),
    currency: text('currency'),
    issueDate: date('issue_date'),
    reference: text('reference'),
    sourceProvider: text('source_provider').notNull().default('xero'),
    sourceSyncedAt: timestamp('source_synced_at', { withTimezone: true }),
    sourceImportJobId: uuid('source_import_job_id').references(() => integrationSyncJobs.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCreditNoteUnique: unique('xero_credit_notes_company_note_unique').on(
      table.companyId,
      table.xeroCreditNoteId,
    ),
    companyContactIdx: index('xero_credit_notes_company_contact_idx').on(
      table.companyId,
      table.xeroContactId,
    ),
  }),
);

export const xeroCreditNoteAllocations = pgTable(
  'xero_credit_note_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    creditNoteId: uuid('credit_note_id')
      .notNull()
      .references(() => xeroCreditNotes.id, { onDelete: 'cascade' }),
    xeroInvoiceId: text('xero_invoice_id'),
    amountCents: integer('amount_cents').notNull().default(0),
    allocatedOn: date('allocated_on'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    creditNoteIdx: index('xero_credit_note_allocations_note_idx').on(
      table.companyId,
      table.creditNoteId,
    ),
  }),
);

/**
 * Payment → invoice/bill allocation as Xero records it, including part-payments, overpayments
 * and prepayments. Stored rather than inferred so allocation can be shown, not guessed.
 */
export const xeroPaymentAllocations = pgTable(
  'xero_payment_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    integrationConnectionId: uuid('integration_connection_id')
      .notNull()
      .references(() => integrationConnections.id, { onDelete: 'cascade' }),
    xeroPaymentId: text('xero_payment_id').notNull(),
    xeroInvoiceId: text('xero_invoice_id'),
    /** invoice | bill | overpayment | prepayment | credit_note | unallocated */
    targetType: text('target_type').notNull().default('invoice'),
    amountCents: integer('amount_cents').notNull().default(0),
    currency: text('currency'),
    paidOn: date('paid_on'),
    reference: text('reference'),
    status: text('status'),
    /** True when the payment could not be tied to an imported parent record. */
    unresolved: boolean('unresolved').notNull().default(false),
    unresolvedReason: text('unresolved_reason'),
    sourceSyncedAt: timestamp('source_synced_at', { withTimezone: true }),
    sourceImportJobId: uuid('source_import_job_id').references(() => integrationSyncJobs.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyPaymentUnique: unique('xero_payment_allocations_company_payment_unique').on(
      table.companyId,
      table.xeroPaymentId,
    ),
    companyInvoiceIdx: index('xero_payment_allocations_company_invoice_idx').on(
      table.companyId,
      table.xeroInvoiceId,
    ),
  }),
);

/**
 * Attachment metadata only. File bytes stay in Xero and are fetched on demand through the
 * access-controlled document path — financial attachments are never world-readable.
 */
export const xeroAttachments = pgTable(
  'xero_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    integrationConnectionId: uuid('integration_connection_id')
      .notNull()
      .references(() => integrationConnections.id, { onDelete: 'cascade' }),
    xeroAttachmentId: text('xero_attachment_id').notNull(),
    /** invoice | bill | credit_note | bank_transaction | contact */
    parentType: text('parent_type').notNull(),
    parentXeroId: text('parent_xero_id').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type'),
    contentLength: integer('content_length'),
    /** Xero API URL for on-demand retrieval. Not a public link. */
    xeroUrl: text('xero_url'),
    includeOnline: boolean('include_online').notNull().default(false),
    /** Set only where a real link to a TITAN document exists — never inferred. */
    documentId: uuid('document_id'),
    sourceProvider: text('source_provider').notNull().default('xero'),
    sourceSyncedAt: timestamp('source_synced_at', { withTimezone: true }),
    sourceImportJobId: uuid('source_import_job_id').references(() => integrationSyncJobs.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyAttachmentUnique: unique('xero_attachments_company_attachment_unique').on(
      table.companyId,
      table.xeroAttachmentId,
    ),
    parentIdx: index('xero_attachments_parent_idx').on(
      table.companyId,
      table.parentType,
      table.parentXeroId,
    ),
  }),
);

/**
 * Per-entity import coverage. This is the evidence behind every "complete / partial /
 * unavailable" claim on Finance, Customer 360 and AURA — coverage is read from here, never
 * assumed.
 */
export const xeroEntityCoverage = pgTable(
  'xero_entity_coverage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    integrationConnectionId: uuid('integration_connection_id')
      .notNull()
      .references(() => integrationConnections.id, { onDelete: 'cascade' }),
    /** Matches XeroImportStage. */
    entity: text('entity').notNull(),
    /** Null once a full historical pull has completed with no date floor. */
    modifiedSinceWatermark: timestamp('modified_since_watermark', { withTimezone: true }),
    fullHistorySyncedAt: timestamp('full_history_synced_at', { withTimezone: true }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    lastSyncJobId: uuid('last_sync_job_id').references(() => integrationSyncJobs.id, {
      onDelete: 'set null',
    }),
    importedCount: integer('imported_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    skippedCount: integer('skipped_count').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyEntityUnique: unique('xero_entity_coverage_company_entity_unique').on(
      table.companyId,
      table.entity,
    ),
  }),
);

export type XeroAccountRow = typeof xeroAccounts.$inferSelect;
export type XeroBillRow = typeof xeroBills.$inferSelect;
export type XeroBillLineItemRow = typeof xeroBillLineItems.$inferSelect;
export type XeroCreditNoteRow = typeof xeroCreditNotes.$inferSelect;
export type XeroPaymentAllocationRow = typeof xeroPaymentAllocations.$inferSelect;
export type XeroAttachmentRow = typeof xeroAttachments.$inferSelect;
export type XeroEntityCoverageDbRow = typeof xeroEntityCoverage.$inferSelect;
