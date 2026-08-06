import {
  boolean,
  integer,
  jsonb,
  numeric,
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
import { piPurchaseRecommendations } from './procurement-intelligence';

/**
 * Stock Forecasting & Automation — item forecasts, reorder recommendation drafts,
 * settings, AURA insight handoffs. Extends inventory + procurement intelligence.
 * Recommendations only. No auto-reorder / auto-purchase. No invented demand.
 */

export const sfRecommendationKindEnum = pgEnum('sf_recommendation_kind', [
  'reorder',
  'buy_now',
  'buy_soon',
  'watch',
  'maintenance_demand',
  'job_demand',
  'aura_handoff',
]);

export const sfRecommendationStatusEnum = pgEnum('sf_recommendation_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
  'accepted',
]);

export const sfInsightTargetEnum = pgEnum('sf_insight_target', [
  'command_centre',
  'executive_dashboard',
  'inventory_intelligence',
  'procurement_intelligence',
  'procurement',
  'maintenance',
  'jobs',
  'inventory',
  'operations',
]);

export const sfInsightStatusEnum = pgEnum('sf_insight_status', [
  'open',
  'acknowledged',
  'dismissed',
]);

export const sfShortageRiskEnum = pgEnum('sf_shortage_risk', [
  'none',
  'watch',
  'high',
  'unavailable',
]);

export const sfTrendEnum = pgEnum('sf_trend', ['up', 'flat', 'down', 'unavailable']);

export const sfSettings = pgTable('sf_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  /** Invariant: always false. */
  autoReorderEnabled: boolean('auto_reorder_enabled').notNull().default(false),
  /** Invariant: always false. */
  autoPurchaseEnabled: boolean('auto_purchase_enabled').notNull().default(false),
  forecastingEnabled: boolean('forecasting_enabled').notNull().default(true),
  recommendationsEnabled: boolean('recommendations_enabled').notNull().default(true),
  minIssueEvents: integer('min_issue_events').notNull().default(3),
  windowDays: integer('window_days').notNull().default(30),
  notes: text('notes'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sfItemForecasts = pgTable('sf_item_forecasts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  inventoryItemId: uuid('inventory_item_id')
    .notNull()
    .references(() => inventoryItems.id, { onDelete: 'cascade' }),
  availability: text('availability').notNull().default('unavailable'),
  quantityOnHand: integer('quantity_on_hand').notNull().default(0),
  reorderLevel: integer('reorder_level').notNull().default(0),
  windowDays: integer('window_days').notNull().default(30),
  issueEventCount: integer('issue_event_count').notNull().default(0),
  totalConsumed: integer('total_consumed').notNull().default(0),
  avgDailyDemand: numeric('avg_daily_demand', { precision: 12, scale: 4 }),
  projectedDaysOfCover: numeric('projected_days_of_cover', { precision: 12, scale: 2 }),
  suggestedReorderQty: integer('suggested_reorder_qty'),
  suggestedReorderBy: text('suggested_reorder_by'),
  leadTimeDays: integer('lead_time_days'),
  shortageRisk: sfShortageRiskEnum('shortage_risk').notNull().default('unavailable'),
  trend: sfTrendEnum('trend').notNull().default('unavailable'),
  /** Honest seasonal snapshot JSON — unavailable when history insufficient. */
  seasonal: jsonb('seasonal').$type<Record<string, unknown>>().notNull().default({}),
  assumptions: jsonb('assumptions').$type<string[]>().notNull().default([]),
  rationale: text('rationale').notNull(),
  jobLinkedConsumption: integer('job_linked_consumption').notNull().default(0),
  maintenanceSignalCount: integer('maintenance_signal_count').notNull().default(0),
  sourceAlertId: uuid('source_alert_id').references(() => iiAlertDrafts.id, {
    onDelete: 'set null',
  }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sfReorderRecommendations = pgTable('sf_reorder_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: sfRecommendationKindEnum('kind').notNull(),
  status: sfRecommendationStatusEnum('status').notNull().default('draft'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  inventoryItemId: uuid('inventory_item_id').references(() => inventoryItems.id, {
    onDelete: 'set null',
  }),
  supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  forecastId: uuid('forecast_id').references(() => sfItemForecasts.id, {
    onDelete: 'set null',
  }),
  suggestedQuantity: integer('suggested_quantity'),
  suggestedReorderBy: text('suggested_reorder_by'),
  whyNeeded: text('why_needed').notNull(),
  whenToBuy: text('when_to_buy').notNull(),
  whatToBuy: text('what_to_buy').notNull(),
  expectedUsage: text('expected_usage').notNull().default(''),
  sourceProcurementRecommendationId: uuid('source_procurement_recommendation_id').references(
    () => piPurchaseRecommendations.id,
    { onDelete: 'set null' },
  ),
  draftPurchaseOrderId: uuid('draft_purchase_order_id').references(() => purchaseOrders.id, {
    onDelete: 'set null',
  }),
  /** Invariant: always false. */
  autoReorder: boolean('auto_reorder').notNull().default(false),
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

export const sfAuraInsights = pgTable('sf_aura_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  target: sfInsightTargetEnum('target').notNull(),
  status: sfInsightStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  insight: text('insight').notNull(),
  href: text('href'),
  sourceForecastId: uuid('source_forecast_id').references(() => sfItemForecasts.id, {
    onDelete: 'set null',
  }),
  sourceRecommendationId: uuid('source_recommendation_id').references(
    () => sfReorderRecommendations.id,
    { onDelete: 'set null' },
  ),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
