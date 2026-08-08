import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { quoteLineItems, quotes } from './quotes';
import { users } from './users';

/** Row 96 — internal quote cost components (never customer-visible). */
export const quoteCostComponents = pgTable('quote_cost_components', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  quoteId: uuid('quote_id')
    .notNull()
    .references(() => quotes.id, { onDelete: 'cascade' }),
  quoteLineId: uuid('quote_line_id').references(() => quoteLineItems.id, {
    onDelete: 'set null',
  }),
  componentType: text('component_type').notNull(),
  description: text('description').notNull(),
  quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull().default('0'),
  unit: text('unit').notNull().default('each'),
  unitCostCents: integer('unit_cost_cents'),
  totalCostCents: integer('total_cost_cents'),
  vatBasis: text('vat_basis').notNull().default('UNKNOWN'),
  provenance: text('provenance').notNull().default('COST_SOURCE_MISSING'),
  confidence: text('confidence').notNull().default('INSUFFICIENT_INFORMATION'),
  customerVisible: boolean('customer_visible').notNull().default(false),
  optionTier: text('option_tier'),
  wastagePercentBps: integer('wastage_percent_bps'),
  percentOfBaseBps: integer('percent_of_base_bps'),
  percentBase: text('percent_base'),
  sourceRef: text('source_ref'),
  catalogueItemId: uuid('catalogue_item_id'),
  planEstimateCostComponentId: uuid('plan_estimate_cost_component_id'),
  clientActionId: text('client_action_id'),
  position: integer('position').notNull().default(0),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const quoteCostSnapshots = pgTable('quote_cost_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  quoteId: uuid('quote_id')
    .notNull()
    .references(() => quotes.id, { onDelete: 'cascade' }),
  snapshotVersion: integer('snapshot_version').notNull().default(1),
  lifecycleStatus: text('lifecycle_status').notNull(),
  sellExVatCents: integer('sell_ex_vat_cents'),
  totalEstimatedCostCents: integer('total_estimated_cost_cents'),
  estimatedGrossProfitCents: integer('estimated_gross_profit_cents'),
  confidence: text('confidence').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  clientActionId: text('client_action_id'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const quoteCostWarnings = pgTable('quote_cost_warnings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  quoteId: uuid('quote_id')
    .notNull()
    .references(() => quotes.id, { onDelete: 'cascade' }),
  warningCode: text('warning_code').notNull(),
  severity: text('severity').notNull().default('WARNING'),
  message: text('message').notNull(),
  componentId: uuid('component_id').references(() => quoteCostComponents.id, {
    onDelete: 'set null',
  }),
  resolved: boolean('resolved').notNull().default(false),
  resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const quoteCostAuditEvents = pgTable('quote_cost_audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  quoteId: uuid('quote_id')
    .notNull()
    .references(() => quotes.id, { onDelete: 'cascade' }),
  componentId: uuid('component_id'),
  eventType: text('event_type').notNull(),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  beforeJson: jsonb('before_json').$type<Record<string, unknown> | null>(),
  afterJson: jsonb('after_json').$type<Record<string, unknown> | null>(),
  provenance: text('provenance'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
