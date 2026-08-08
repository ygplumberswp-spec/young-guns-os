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
import { boqImportRows, boqImports } from './boq-workbook-import';

export const supplierQuoteImports = pgTable(
  'supplier_quote_imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    boqImportId: uuid('boq_import_id')
      .notNull()
      .references(() => boqImports.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id'),
    supplierName: text('supplier_name'),
    sourceDocumentId: uuid('source_document_id'),
    originalFilename: text('original_filename').notNull(),
    fileHashSha256: text('file_hash_sha256').notNull(),
    revisionLabel: text('revision_label'),
    mimeType: text('mime_type').notNull().default('application/pdf'),
    storageKey: text('storage_key'),
    status: text('status').notNull().default('REVIEW_REQUIRED'),
    warnings: jsonb('warnings').notNull().default([]),
    auraNarrativeFacts: jsonb('aura_narrative_facts').notNull().default([]),
    idempotencyKey: text('idempotency_key'),
    clientActionId: text('client_action_id'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idempotencyUidx: uniqueIndex('supplier_quote_imports_company_idempotency_uidx')
      .on(table.companyId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    clientActionUidx: uniqueIndex('supplier_quote_imports_company_client_action_uidx')
      .on(table.companyId, table.clientActionId)
      .where(sql`${table.clientActionId} IS NOT NULL`),
    companyBoqIdx: index('supplier_quote_imports_company_boq_idx').on(
      table.companyId,
      table.boqImportId,
    ),
  }),
);

export const supplierQuoteImportLines = pgTable(
  'supplier_quote_import_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    importId: uuid('import_id')
      .notNull()
      .references(() => supplierQuoteImports.id, { onDelete: 'cascade' }),
    clientKey: text('client_key').notNull(),
    sourceLineOrder: integer('source_line_order').notNull(),
    pageNumber: integer('page_number'),
    supplierSku: text('supplier_sku'),
    manufacturerCode: text('manufacturer_code'),
    description: text('description'),
    unit: text('unit'),
    quantity: numeric('quantity', { precision: 18, scale: 4 }),
    packSize: numeric('pack_size', { precision: 18, scale: 4 }),
    unitPriceCents: integer('unit_price_cents'),
    vatBasis: text('vat_basis').notNull().default('UNKNOWN'),
    currency: text('currency'),
    priceValidTo: text('price_valid_to'),
    sourceReference: text('source_reference'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    importOrderIdx: index('supplier_quote_import_lines_import_order_idx').on(
      table.importId,
      table.sourceLineOrder,
    ),
  }),
);

export const supplierQuoteBoqMatchProposals = pgTable(
  'supplier_quote_boq_match_proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    supplierQuoteImportId: uuid('supplier_quote_import_id')
      .notNull()
      .references(() => supplierQuoteImports.id, { onDelete: 'cascade' }),
    supplierLineId: uuid('supplier_line_id').references(() => supplierQuoteImportLines.id, {
      onDelete: 'set null',
    }),
    boqImportId: uuid('boq_import_id')
      .notNull()
      .references(() => boqImports.id, { onDelete: 'cascade' }),
    boqImportRowId: uuid('boq_import_row_id').references(() => boqImportRows.id, {
      onDelete: 'set null',
    }),
    proposalKey: text('proposal_key').notNull(),
    matchState: text('match_state').notNull(),
    signalsUsed: jsonb('signals_used').notNull().default([]),
    confidenceScore: integer('confidence_score').notNull().default(0),
    warnings: jsonb('warnings').notNull().default([]),
    supplierSku: text('supplier_sku'),
    manufacturerCode: text('manufacturer_code'),
    description: text('description'),
    unit: text('unit'),
    quantity: numeric('quantity', { precision: 18, scale: 4 }),
    packSize: numeric('pack_size', { precision: 18, scale: 4 }),
    unitPriceCents: integer('unit_price_cents'),
    vatBasis: text('vat_basis').notNull().default('UNKNOWN'),
    currency: text('currency'),
    priceValidTo: text('price_valid_to'),
    humanConfirmed: boolean('human_confirmed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    importKeyUidx: uniqueIndex('supplier_quote_boq_match_proposals_import_key_uidx').on(
      table.supplierQuoteImportId,
      table.proposalKey,
    ),
    boqIdx: index('supplier_quote_boq_match_proposals_boq_idx').on(
      table.companyId,
      table.boqImportId,
    ),
  }),
);

export type SupplierQuoteImport = typeof supplierQuoteImports.$inferSelect;
export type SupplierQuoteImportLine = typeof supplierQuoteImportLines.$inferSelect;
export type SupplierQuoteBoqMatchProposal = typeof supplierQuoteBoqMatchProposals.$inferSelect;
