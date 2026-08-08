import {
  integer,
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
import { customers } from './customers';
import { users } from './users';
import { jobs } from './jobs';
import { quotes } from './quotes';

export const planEstimates = pgTable(
  'plan_estimates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    propertyId: uuid('property_id'),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'set null' }),
    sourceDocumentId: uuid('source_document_id'),
    sourceFilename: text('source_filename'),
    sourceFileHash: text('source_file_hash'),
    sourceRevisionLabel: text('source_revision_label'),
    sourceUploadedAt: timestamp('source_uploaded_at', { withTimezone: true }),
    estimateVersion: integer('estimate_version').notNull().default(1),
    status: text('status').notNull().default('DRAFT_TAKEOFF'),
    scaleStatus: text('scale_status').notNull().default('SCALE_NOT_PROVIDED'),
    scaleProvenance: text('scale_provenance'),
    currency: text('currency').notNull().default('ZAR'),
    proposedSellExVatCents: integer('proposed_sell_ex_vat_cents'),
    sellSource: text('sell_source').notNull().default('MISSING'),
    clientActionId: text('client_action_id'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    supersededBy: uuid('superseded_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index('plan_estimates_company_status_idx').on(table.companyId, table.status),
    companyCustomerIdx: index('plan_estimates_company_customer_idx').on(
      table.companyId,
      table.customerId,
    ),
    companyQuoteIdx: index('plan_estimates_company_quote_idx').on(table.companyId, table.quoteId),
    clientActionUidx: uniqueIndex('plan_estimates_company_client_action_uidx')
      .on(table.companyId, table.clientActionId)
      .where(sql`${table.clientActionId} IS NOT NULL`),
  }),
);

export const planEstimateItems = pgTable(
  'plan_estimate_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    estimateId: uuid('estimate_id')
      .notNull()
      .references(() => planEstimates.id, { onDelete: 'cascade' }),
    pointType: text('point_type').notNull(),
    subtypeLabel: text('subtype_label'),
    description: text('description').notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull().default('0'),
    unit: text('unit').notNull().default('each'),
    quantityOrigin: text('quantity_origin').notNull(),
    pageReference: text('page_reference'),
    planAnnotationRef: text('plan_annotation_ref'),
    confidence: text('confidence').notNull().default('CONFIRMED'),
    customerVisibleScopeText: text('customer_visible_scope_text'),
    enteredBy: uuid('entered_by').references(() => users.id, { onDelete: 'set null' }),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    estimateIdx: index('plan_estimate_items_estimate_idx').on(table.companyId, table.estimateId),
  }),
);

export const planEstimateCostComponents = pgTable(
  'plan_estimate_cost_components',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    estimateId: uuid('estimate_id')
      .notNull()
      .references(() => planEstimates.id, { onDelete: 'cascade' }),
    estimateItemId: uuid('estimate_item_id').references(() => planEstimateItems.id, {
      onDelete: 'set null',
    }),
    componentType: text('component_type').notNull(),
    description: text('description').notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull().default('0'),
    unit: text('unit').notNull().default('each'),
    unitCostCents: integer('unit_cost_cents'),
    costProvenance: text('cost_provenance').notNull().default('MISSING'),
    catalogueItemId: uuid('catalogue_item_id'),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    estimateIdx: index('plan_estimate_cost_components_estimate_idx').on(
      table.companyId,
      table.estimateId,
    ),
  }),
);

export type PlanEstimate = typeof planEstimates.$inferSelect;
export type PlanEstimateItem = typeof planEstimateItems.$inferSelect;
export type PlanEstimateCostComponent = typeof planEstimateCostComponents.$inferSelect;
