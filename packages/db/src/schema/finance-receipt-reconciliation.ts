import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies } from './companies';
import { users } from './users';
import { suppliers, purchaseOrders } from './procurement';
import { jobs } from './jobs';
import { documents } from './documents';
import { jobDirectCostEntries } from './job-profitability';
import {
  bankTransactionAllocations,
  bankTransactions,
} from './bank-transaction-control';

export const supplierAliases = pgTable(
  'supplier_aliases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'cascade' }),
    aliasText: text('alias_text').notNull(),
    normalisedAlias: text('normalised_alias').notNull(),
    isEnabled: boolean('is_enabled').notNull().default(true),
    approvedByUserId: uuid('approved_by_user_id')
      .notNull()
      .references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().defaultNow(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyNormalisedUnique: uniqueIndex('supplier_aliases_company_normalised_unique').on(
      table.companyId,
      table.normalisedAlias,
    ),
    companySupplierIdx: index('supplier_aliases_company_supplier_idx').on(
      table.companyId,
      table.supplierId,
      table.isEnabled,
    ),
  }),
);

export const financeReceiptRecords = pgTable(
  'finance_receipt_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    evidenceSource: text('evidence_source').notNull().default('document'),
    evidenceSourceId: uuid('evidence_source_id'),
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
    receiptNumber: text('receipt_number'),
    documentDate: date('document_date'),
    totalAmountCents: integer('total_amount_cents'),
    vatAmountCents: integer('vat_amount_cents'),
    taxRateBps: integer('tax_rate_bps'),
    exclusiveTotalCents: integer('exclusive_total_cents'),
    currency: text('currency').notNull().default('ZAR'),
    matchStatus: text('match_status').notNull().default('awaiting_transaction_match'),
    verificationStatus: text('verification_status').notNull().default('not_verified'),
    verifiedByUserId: uuid('verified_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    directCostId: uuid('direct_cost_id').references(() => jobDirectCostEntries.id, {
      onDelete: 'set null',
    }),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    duplicateFlag: text('duplicate_flag'),
    fileChecksumSha256: text('file_checksum_sha256'),
    linkMethod: text('link_method'),
    linkedByUserId: uuid('linked_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    linkedAt: timestamp('linked_at', { withTimezone: true }),
    sourceFingerprint: text('source_fingerprint'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyMatchIdx: index('finance_receipt_records_company_match_idx').on(
      table.companyId,
      table.matchStatus,
      table.createdAt,
    ),
    companySupplierIdx: index('finance_receipt_records_company_supplier_idx').on(
      table.companyId,
      table.supplierId,
    ),
    checksumIdx: index('finance_receipt_records_checksum_idx')
      .on(table.companyId, table.fileChecksumSha256)
      .where(sql`${table.fileChecksumSha256} IS NOT NULL`),
  }),
);

export const financeReceiptTransactionLinks = pgTable(
  'finance_receipt_transaction_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    receiptRecordId: uuid('receipt_record_id')
      .notNull()
      .references(() => financeReceiptRecords.id, { onDelete: 'cascade' }),
    bankTransactionId: uuid('bank_transaction_id').references(() => bankTransactions.id, {
      onDelete: 'set null',
    }),
    bankAllocationId: uuid('bank_allocation_id').references(() => bankTransactionAllocations.id, {
      onDelete: 'set null',
    }),
    amountCents: integer('amount_cents'),
    relationshipType: text('relationship_type').notNull().default('evidence'),
    linkMethod: text('link_method').notNull().default('manual'),
    linkedByUserId: uuid('linked_by_user_id')
      .notNull()
      .references(() => users.id),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    receiptActiveIdx: index('finance_receipt_tx_links_receipt_active_idx').on(
      table.receiptRecordId,
      table.isActive,
    ),
    transactionActiveIdx: index('finance_receipt_tx_links_transaction_active_idx')
      .on(table.bankTransactionId, table.isActive)
      .where(sql`${table.bankTransactionId} IS NOT NULL`),
  }),
);

export const financeReceiptAuditLogs = pgTable(
  'finance_receipt_audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    receiptRecordId: uuid('receipt_record_id').references(() => financeReceiptRecords.id, {
      onDelete: 'set null',
    }),
    bankTransactionId: uuid('bank_transaction_id').references(() => bankTransactions.id, {
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
    companyCreatedIdx: index('finance_receipt_audit_company_created_idx').on(
      table.companyId,
      table.createdAt,
    ),
  }),
);

export type SupplierAlias = typeof supplierAliases.$inferSelect;
export type FinanceReceiptRecord = typeof financeReceiptRecords.$inferSelect;
export type FinanceReceiptTransactionLink = typeof financeReceiptTransactionLinks.$inferSelect;
export type FinanceReceiptAuditLog = typeof financeReceiptAuditLogs.$inferSelect;
