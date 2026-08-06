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
import { users } from './users';
import { inventoryItems } from './inventory-items';
import { purchaseOrders, suppliers } from './procurement';
import { iiAlertDrafts } from './inventory-intelligence';

/**
 * Supplier & Procurement Intelligence — recommendation drafts, cost comparisons,
 * settings, AURA insight handoffs. Extends procurement + inventory intelligence.
 * No automatic purchasing. No fake suppliers/prices.
 */

export const piRecommendationKindEnum = pgEnum('pi_recommendation_kind', [
  'purchase_suggestion',
  'supplier_opportunity',
  'cost_saving',
  'reorder_follow_up',
  'price_advantage',
  'aura_handoff',
]);

export const piRecommendationStatusEnum = pgEnum('pi_recommendation_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
  'accepted',
]);

export const piInsightTargetEnum = pgEnum('pi_insight_target', [
  'command_centre',
  'executive_dashboard',
  'inventory_intelligence',
  'procurement',
  'operations',
  'inventory',
]);

export const piInsightStatusEnum = pgEnum('pi_insight_status', [
  'open',
  'acknowledged',
  'dismissed',
]);

export const piSettings = pgTable('pi_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  /** Invariant: always false. */
  autoPurchaseEnabled: boolean('auto_purchase_enabled').notNull().default(false),
  recommendationsEnabled: boolean('recommendations_enabled').notNull().default(true),
  costComparisonsEnabled: boolean('cost_comparisons_enabled').notNull().default(true),
  notes: text('notes'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const piCostComparisons = pgTable('pi_cost_comparisons', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  productKey: text('product_key').notNull(),
  inventoryItemId: uuid('inventory_item_id').references(() => inventoryItems.id, {
    onDelete: 'set null',
  }),
  availability: text('availability').notNull().default('unavailable'),
  lowestUnitCostCents: integer('lowest_unit_cost_cents'),
  highestUnitCostCents: integer('highest_unit_cost_cents'),
  savingsOpportunityCents: integer('savings_opportunity_cents'),
  lineCount: integer('line_count').notNull().default(0),
  lines: jsonb('lines').$type<Record<string, unknown>[]>().notNull().default([]),
  rationale: text('rationale').notNull(),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const piPurchaseRecommendations = pgTable('pi_purchase_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: piRecommendationKindEnum('kind').notNull(),
  status: piRecommendationStatusEnum('status').notNull().default('draft'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  inventoryItemId: uuid('inventory_item_id').references(() => inventoryItems.id, {
    onDelete: 'set null',
  }),
  suggestedQuantity: integer('suggested_quantity'),
  estimatedUnitCostCents: integer('estimated_unit_cost_cents'),
  estimatedTotalCostCents: integer('estimated_total_cost_cents'),
  sourceInventoryAlertId: uuid('source_inventory_alert_id').references(() => iiAlertDrafts.id, {
    onDelete: 'set null',
  }),
  draftPurchaseOrderId: uuid('draft_purchase_order_id').references(() => purchaseOrders.id, {
    onDelete: 'set null',
  }),
  /** Invariant: always false. */
  autoPurchase: boolean('auto_purchase').notNull().default(false),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionNotes: text('decision_notes'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const piAuraInsights = pgTable('pi_aura_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  target: piInsightTargetEnum('target').notNull(),
  status: piInsightStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  insight: text('insight').notNull(),
  href: text('href'),
  sourceRecommendationId: uuid('source_recommendation_id').references(
    () => piPurchaseRecommendations.id,
    { onDelete: 'set null' },
  ),
  sourceCostComparisonId: uuid('source_cost_comparison_id').references(() => piCostComparisons.id, {
    onDelete: 'set null',
  }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
