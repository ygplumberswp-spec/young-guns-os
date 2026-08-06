import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { suppliers } from './procurement';
import { users } from './users';

export const supplierPriceImportStatusEnum = pgEnum('supplier_price_import_status', [
  'pending',
  'processing',
  'completed',
  'failed',
  'review_required',
]);

export const supplierPriceLineStatusEnum = pgEnum('supplier_price_line_status', [
  'raw',
  'matched',
  'review',
  'approved',
  'rejected',
  'uncertain',
]);

export const supplierPriceDedupVerdictEnum = pgEnum('supplier_price_dedup_verdict', [
  'new',
  'duplicate',
  'variant',
  'uncertain',
]);

export const supplierPriceImportJobs = pgTable('supplier_price_import_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  sourceFilename: text('source_filename'),
  sourceType: text('source_type').notNull().default('manual'),
  status: supplierPriceImportStatusEnum('status').notNull().default('pending'),
  lineCount: integer('line_count').notNull().default(0),
  reviewCount: integer('review_count').notNull().default(0),
  errorMessage: text('error_message'),
  resultSummary: jsonb('result_summary').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const supplierPriceImportLines = pgTable('supplier_price_import_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  importJobId: uuid('import_job_id')
    .notNull()
    .references(() => supplierPriceImportJobs.id, { onDelete: 'cascade' }),
  supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  lineNumber: integer('line_number').notNull().default(1),
  supplierCode: text('supplier_code'),
  description: text('description').notNull(),
  unit: text('unit'),
  packSize: text('pack_size'),
  unitCostCents: integer('unit_cost_cents').notNull().default(0),
  vatIncluded: boolean('vat_included').notNull().default(false),
  effectiveDate: timestamp('effective_date', { withTimezone: true }),
  status: supplierPriceLineStatusEnum('status').notNull().default('raw'),
  dedupVerdict: supplierPriceDedupVerdictEnum('dedup_verdict').notNull().default('uncertain'),
  catalogueItemId: uuid('catalogue_item_id'),
  rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const supplierPriceCatalogueItems = pgTable('supplier_price_catalogue_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  canonicalCode: text('canonical_code'),
  description: text('description').notNull(),
  normalizedDescription: text('normalized_description').notNull(),
  unit: text('unit'),
  packSize: text('pack_size'),
  unitCostCents: integer('unit_cost_cents').notNull().default(0),
  vatIncluded: boolean('vat_included').notNull().default(false),
  version: integer('version').notNull().default(1),
  previousVersionId: uuid('previous_version_id'),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const supplierPriceReviewQueue = pgTable('supplier_price_review_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  importLineId: uuid('import_line_id')
    .notNull()
    .references(() => supplierPriceImportLines.id, { onDelete: 'cascade' }),
  candidateCatalogueItemId: uuid('candidate_catalogue_item_id').references(
    () => supplierPriceCatalogueItems.id,
    { onDelete: 'set null' },
  ),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('pending'),
  marginImpactCents: integer('margin_impact_cents'),
  resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SupplierPriceImportJob = typeof supplierPriceImportJobs.$inferSelect;
export type SupplierPriceImportLine = typeof supplierPriceImportLines.$inferSelect;
export type SupplierPriceCatalogueItem = typeof supplierPriceCatalogueItems.$inferSelect;
export type SupplierPriceReviewQueueItem = typeof supplierPriceReviewQueue.$inferSelect;
