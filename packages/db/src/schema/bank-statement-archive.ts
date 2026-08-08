import { boolean, date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';
import { bankStatementImportBatches } from './bank-statement-import';

export const bankStatementArchiveEvents = pgTable(
  'bank_statement_archive_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    importBatchId: uuid('import_batch_id')
      .notNull()
      .references(() => bankStatementImportBatches.id, { onDelete: 'cascade' }),
    originalFilename: text('original_filename').notNull(),
    fileSourceHash: text('file_source_hash').notNull(),
    sourceProvider: text('source_provider').notNull().default('manual_statement'),
    maskedAccountIdentity: text('masked_account_identity'),
    importedAt: timestamp('imported_at', { withTimezone: true }).notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    statementPeriodFrom: date('statement_period_from'),
    statementPeriodTo: date('statement_period_to'),
    inventedMetadata: boolean('invented_metadata').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index('bank_statement_archive_company_idx').on(table.companyId, table.importedAt),
  }),
);

export type BankStatementArchiveEvent = typeof bankStatementArchiveEvents.$inferSelect;
