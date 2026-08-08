import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  date,
  unique,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

export const bankStatementImportBatches = pgTable(
  'bank_statement_import_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    bankAccountCode: text('bank_account_code').notNull(),
    bankAccountName: text('bank_account_name').notNull(),
    status: text('status').notNull().default('preview_ready'),
    originalFilename: text('original_filename').notNull(),
    sanitizedFilename: text('sanitized_filename').notNull(),
    storageKey: text('storage_key').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSizeBytes: integer('file_size_bytes').notNull(),
    fileChecksumSha256: text('file_checksum_sha256').notNull(),
    sourceProvider: text('source_provider').notNull().default('manual_statement'),
    maskedAccountIdentity: text('masked_account_identity'),
    statementPeriodFrom: date('statement_period_from'),
    statementPeriodTo: date('statement_period_to'),
    columnMapping: jsonb('column_mapping').$type<Record<string, string>>().notNull().default({}),
    rowCount: integer('row_count').notNull().default(0),
    readyCount: integer('ready_count').notNull().default(0),
    duplicateCount: integer('duplicate_count').notNull().default(0),
    invalidCount: integer('invalid_count').notNull().default(0),
    reviewRequiredCount: integer('review_required_count').notNull().default(0),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    revertedAt: timestamp('reverted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index('bank_statement_import_batches_company_status_idx').on(
      table.companyId,
      table.status,
      table.createdAt,
    ),
  }),
);

export const bankStatementImportRows = pgTable(
  'bank_statement_import_rows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => bankStatementImportBatches.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    rowIndex: integer('row_index').notNull(),
    transactionDate: date('transaction_date'),
    amountCents: integer('amount_cents'),
    currency: text('currency').notNull().default('ZAR'),
    reference: text('reference'),
    description: text('description'),
    rowFingerprint: text('row_fingerprint').notNull(),
    classification: text('classification').notNull(),
    reviewStatus: text('review_status').notNull().default('imported_awaiting_review'),
    suggestedMatchType: text('suggested_match_type'),
    suggestedMatchLabel: text('suggested_match_label'),
    rawData: jsonb('raw_data').$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyFingerprintUnique: unique('bank_statement_import_rows_company_fingerprint_unique').on(
      table.companyId,
      table.rowFingerprint,
    ),
    batchIdx: index('bank_statement_import_rows_batch_idx').on(table.batchId, table.rowIndex),
    companyClassificationIdx: index('bank_statement_import_rows_company_classification_idx').on(
      table.companyId,
      table.classification,
    ),
  }),
);

export const bankStatementImportAuditLogs = pgTable(
  'bank_statement_import_audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => bankStatementImportBatches.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    batchIdx: index('bank_statement_import_audit_batch_idx').on(table.batchId, table.createdAt),
  }),
);

export type BankStatementImportBatch = typeof bankStatementImportBatches.$inferSelect;
export type BankStatementImportRow = typeof bankStatementImportRows.$inferSelect;
