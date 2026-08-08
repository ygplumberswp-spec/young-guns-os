import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies } from './companies';
import { users } from './users';
import { quotes } from './quotes';
import { boqDocuments } from './boq';

export const boqImports = pgTable(
  'boq_imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    sourceDocumentId: uuid('source_document_id'),
    originalFilename: text('original_filename').notNull(),
    fileHashSha256: text('file_hash_sha256').notNull(),
    revisionLabel: text('revision_label'),
    importVersion: integer('import_version').notNull().default(1),
    workbookIdentity: text('workbook_identity'),
    mimeType: text('mime_type')
      .notNull()
      .default('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    storageKey: text('storage_key'),
    status: text('status').notNull().default('REVIEW_REQUIRED'),
    sheetOrder: jsonb('sheet_order').notNull().default([]),
    warnings: jsonb('warnings').notNull().default([]),
    auraNarrativeFacts: jsonb('aura_narrative_facts').notNull().default([]),
    quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'set null' }),
    boqDocumentId: uuid('boq_document_id').references(() => boqDocuments.id, {
      onDelete: 'set null',
    }),
    supersededBy: uuid('superseded_by'),
    clientActionId: text('client_action_id'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyHashVersionUidx: uniqueIndex('boq_imports_company_hash_version_uidx').on(
      table.companyId,
      table.fileHashSha256,
      table.importVersion,
    ),
    clientActionUidx: uniqueIndex('boq_imports_company_client_action_uidx')
      .on(table.companyId, table.clientActionId)
      .where(sql`${table.clientActionId} IS NOT NULL`),
    companyStatusIdx: index('boq_imports_company_status_idx').on(table.companyId, table.status),
  }),
);

export const boqImportSheets = pgTable(
  'boq_import_sheets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    importId: uuid('import_id')
      .notNull()
      .references(() => boqImports.id, { onDelete: 'cascade' }),
    sheetName: text('sheet_name').notNull(),
    sheetOrder: integer('sheet_order').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    importOrderUidx: uniqueIndex('boq_import_sheets_import_order_uidx').on(
      table.importId,
      table.sheetOrder,
    ),
    companyImportIdx: index('boq_import_sheets_company_import_idx').on(
      table.companyId,
      table.importId,
    ),
  }),
);

export const boqImportRows = pgTable(
  'boq_import_rows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    importId: uuid('import_id')
      .notNull()
      .references(() => boqImports.id, { onDelete: 'cascade' }),
    sheetId: uuid('sheet_id')
      .notNull()
      .references(() => boqImportSheets.id, { onDelete: 'cascade' }),
    sheetName: text('sheet_name').notNull(),
    sheetOrder: integer('sheet_order').notNull(),
    originalRowNumber: integer('original_row_number').notNull(),
    originalRowOrder: integer('original_row_order').notNull(),
    sectionLabel: text('section_label'),
    sectionKnown: boolean('section_known').notNull().default(false),
    rowKind: text('row_kind').notNull().default('UNKNOWN'),
    itemCode: text('item_code'),
    description: text('description'),
    unit: text('unit'),
    quantity: numeric('quantity', { precision: 18, scale: 4 }),
    rawValue: text('raw_value'),
    displayValue: text('display_value'),
    formulaText: text('formula_text'),
    cellAddress: text('cell_address'),
    warnings: jsonb('warnings').notNull().default([]),
    reviewState: text('review_state').notNull().default('REVIEW_REQUIRED'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    importOrderIdx: index('boq_import_rows_import_order_idx').on(
      table.importId,
      table.sheetOrder,
      table.originalRowOrder,
    ),
    companyImportIdx: index('boq_import_rows_company_import_idx').on(
      table.companyId,
      table.importId,
    ),
  }),
);

export type BoqImport = typeof boqImports.$inferSelect;
export type BoqImportSheet = typeof boqImportSheets.$inferSelect;
export type BoqImportRow = typeof boqImportRows.$inferSelect;
