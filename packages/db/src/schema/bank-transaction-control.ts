import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies } from './companies';
import { users } from './users';
import { suppliers } from './procurement';
import { jobs } from './jobs';
import { documents } from './documents';
import { jobDirectCostEntries } from './job-profitability';
import {
  bankStatementImportBatches,
  bankStatementImportRows,
} from './bank-statement-import';

export const bankTransactionDirectionEnum = pgEnum('bank_transaction_direction', [
  'debit',
  'credit',
]);

export const bankTransactionAllocationStatusEnum = pgEnum(
  'bank_transaction_allocation_status',
  ['unallocated', 'suggested', 'partially_allocated', 'allocated', 'ignored', 'needs_review'],
);

export const bankTransactionReconciliationStatusEnum = pgEnum(
  'bank_transaction_reconciliation_status',
  ['unreconciled', 'partially_reconciled', 'reconciled'],
);

export const bankTransactionReceiptStatusEnum = pgEnum('bank_transaction_receipt_status', [
  'receipt_not_required',
  'receipt_missing',
  'receipt_attached',
  'receipt_verified',
  'receipt_needs_review',
]);

export const bankTransactionAllocationTypeEnum = pgEnum('bank_transaction_allocation_type', [
  'direct_job_cost',
  'overhead',
  'transfer',
  'supplier_settlement',
  'customer_payment',
  'owner_director',
  'tax',
  'other',
]);

export const bankAccounts = pgTable(
  'bank_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    bankAccountCode: text('bank_account_code'),
    currency: text('currency').notNull().default('ZAR'),
    provider: text('provider').notNull().default('manual'),
    xeroAccountId: text('xero_account_id'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyActiveIdx: index('bank_accounts_company_active_idx').on(
      table.companyId,
      table.isActive,
      table.name,
    ),
  }),
);

export const bankTransactions = pgTable(
  'bank_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    bankAccountId: uuid('bank_account_id')
      .notNull()
      .references(() => bankAccounts.id, { onDelete: 'restrict' }),
    provider: text('provider').notNull().default('manual_import'),
    externalTransactionId: text('external_transaction_id'),
    transactionDate: date('transaction_date').notNull(),
    postedDate: date('posted_date'),
    description: text('description'),
    reference: text('reference'),
    amountCents: integer('amount_cents').notNull(),
    direction: bankTransactionDirectionEnum('direction').notNull(),
    currency: text('currency').notNull().default('ZAR'),
    runningBalanceCents: integer('running_balance_cents'),
    merchantName: text('merchant_name'),
    suggestedSupplierId: uuid('suggested_supplier_id').references(() => suppliers.id, {
      onDelete: 'set null',
    }),
    confirmedSupplierId: uuid('confirmed_supplier_id').references(() => suppliers.id, {
      onDelete: 'set null',
    }),
    allocationStatus: bankTransactionAllocationStatusEnum('allocation_status')
      .notNull()
      .default('unallocated'),
    reconciliationStatus: bankTransactionReconciliationStatusEnum('reconciliation_status')
      .notNull()
      .default('unreconciled'),
    receiptStatus: bankTransactionReceiptStatusEnum('receipt_status')
      .notNull()
      .default('receipt_missing'),
    receiptDocumentId: uuid('receipt_document_id').references(() => documents.id, {
      onDelete: 'set null',
    }),
    sourceFingerprint: text('source_fingerprint').notNull(),
    sourceFileHash: text('source_file_hash'),
    maskedAccountIdentity: text('masked_account_identity'),
    /** Exact signed amount (credit +, debit -). Never fabricated. */
    signedAmountCents: integer('signed_amount_cents'),
    /** Row 111 vocabulary — null until projected/reviewed. */
    reconState: text('recon_state'),
    reconReviewedBy: uuid('recon_reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reconReviewedAt: timestamp('recon_reviewed_at', { withTimezone: true }),
    reconReviewEvidence: jsonb('recon_review_evidence').$type<Record<string, unknown>>().notNull().default({}),
    sourceIdempotencyKey: text('source_idempotency_key'),
    supersedesTransactionId: uuid('supersedes_transaction_id'),
    reversalOfTransactionId: uuid('reversal_of_transaction_id'),
    isHistoricalVersion: boolean('is_historical_version').notNull().default(false),
    economicEventKey: text('economic_event_key'),
    financeFeedStatus: text('finance_feed_status').notNull().default('not_eligible'),
    jpeFeedStatus: text('jpe_feed_status').notNull().default('not_eligible'),
    importBatchId: uuid('import_batch_id').references(() => bankStatementImportBatches.id, {
      onDelete: 'set null',
    }),
    importRowId: uuid('import_row_id').references(() => bankStatementImportRows.id, {
      onDelete: 'set null',
    }),
    xeroBankTransactionId: text('xero_bank_transaction_id'),
    rawProviderMetadata: jsonb('raw_provider_metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    allocatedAmountCents: integer('allocated_amount_cents').notNull().default(0),
    importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyFingerprintUnique: uniqueIndex('bank_transactions_company_account_fingerprint_unique').on(
      table.companyId,
      table.bankAccountId,
      table.sourceFingerprint,
    ),
    companyProviderExternalUnique: uniqueIndex(
      'bank_transactions_company_account_provider_external_unique',
    )
      .on(table.companyId, table.bankAccountId, table.provider, table.externalTransactionId)
      .where(sql`${table.externalTransactionId} IS NOT NULL`),
    companyStatusDateIdx: index('bank_transactions_company_status_date_idx').on(
      table.companyId,
      table.allocationStatus,
      table.transactionDate,
    ),
    companyDirectionIdx: index('bank_transactions_company_direction_idx').on(
      table.companyId,
      table.direction,
      table.transactionDate,
    ),
    bankAccountDateIdx: index('bank_transactions_bank_account_date_idx').on(
      table.bankAccountId,
      table.transactionDate,
    ),
  }),
);

export const bankTransactionAllocations = pgTable(
  'bank_transaction_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => bankTransactions.id, { onDelete: 'cascade' }),
    amountCents: integer('amount_cents').notNull(),
    allocationType: bankTransactionAllocationTypeEnum('allocation_type').notNull(),
    category: text('category'),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
    directCostId: uuid('direct_cost_id').references(() => jobDirectCostEntries.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    idempotencyKey: text('idempotency_key'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    supersededByAllocationId: uuid('superseded_by_allocation_id'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    transactionActiveIdx: index('bank_transaction_allocations_transaction_active_idx').on(
      table.transactionId,
      table.isActive,
    ),
    idempotencyUnique: uniqueIndex('bank_transaction_allocations_idempotency_unique')
      .on(table.companyId, table.transactionId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    companyJobIdx: index('bank_transaction_allocations_company_job_idx').on(
      table.companyId,
      table.jobId,
    ),
  }),
);

export const bankTransactionAuditLogs = pgTable(
  'bank_transaction_audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    transactionId: uuid('transaction_id').references(() => bankTransactions.id, {
      onDelete: 'set null',
    }),
    importBatchId: uuid('import_batch_id').references(() => bankStatementImportBatches.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCreatedIdx: index('bank_transaction_audit_company_created_idx').on(
      table.companyId,
      table.createdAt,
    ),
    transactionIdx: index('bank_transaction_audit_transaction_idx').on(
      table.transactionId,
      table.createdAt,
    ),
  }),
);

export type BankAccount = typeof bankAccounts.$inferSelect;
export type BankTransaction = typeof bankTransactions.$inferSelect;
export type BankTransactionAllocation = typeof bankTransactionAllocations.$inferSelect;
export type BankTransactionAuditLog = typeof bankTransactionAuditLogs.$inferSelect;
