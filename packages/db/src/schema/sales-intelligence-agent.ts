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
import { customers } from './customers';
import { leadSources, leads } from './leads';
import { quotes } from './quotes';
import { salesOpportunities } from './sales';
import { users } from './users';

/**
 * Sales Intelligence Agent Foundation — recommendations, insights, opportunity signals.
 * Owner approval required before any outreach or external action.
 * No auto-execute. No spam. Grounded in real TITAN CRM / leads / pipeline / quotes only.
 */

export const siaRecommendationKindEnum = pgEnum('sia_recommendation_kind', [
  'outreach_draft',
  'follow_up',
  'lead_priority',
  'quote_follow_up',
  'pipeline_advance',
  'revenue_opportunity',
  'best_next_action',
  'owner_decision',
  'aura_handoff',
]);

export const siaRecommendationStatusEnum = pgEnum('sia_recommendation_status', [
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
]);

export const siaInsightKindEnum = pgEnum('sia_insight_kind', [
  'lead_hunting_summary',
  'qualification_summary',
  'pipeline_summary',
  'conversion_tracking',
  'revenue_opportunity',
  'best_next_action',
  'lead_priority',
  'business_sales_context',
]);

export const siaSignalKindEnum = pgEnum('sia_signal_kind', [
  'lead_source',
  'unconverted_quote',
  'open_opportunity',
  'stale_follow_up',
  'high_score_lead',
  'comms_signal',
  'market_opportunity',
  'conversion',
]);

export const siaRecommendations = pgTable('sia_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: siaRecommendationKindEnum('kind').notNull(),
  status: siaRecommendationStatusEnum('status').notNull().default('pending_approval'),
  title: text('title').notNull(),
  recommendation: text('recommendation').notNull(),
  draftOutreach: text('draft_outreach'),
  sourceLeadId: uuid('source_lead_id').references(() => leads.id, { onDelete: 'set null' }),
  sourceOpportunityId: uuid('source_opportunity_id').references(() => salesOpportunities.id, {
    onDelete: 'set null',
  }),
  sourceQuoteId: uuid('source_quote_id').references(() => quotes.id, { onDelete: 'set null' }),
  sourceCustomerId: uuid('source_customer_id').references(() => customers.id, {
    onDelete: 'set null',
  }),
  /** Invariant: always false — never auto-send outreach. */
  autoExecuted: boolean('auto_executed').notNull().default(false),
  /** Invariant: always false — never send outreach without Owner approval. */
  outreachSent: boolean('outreach_sent').notNull().default(false),
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

export const siaInsights = pgTable('sia_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: siaInsightKindEnum('kind').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  metricLabel: text('metric_label'),
  metricValue: integer('metric_value'),
  metricValueCents: integer('metric_value_cents'),
  currency: text('currency'),
  sourceLeadCount: integer('source_lead_count').notNull().default(0),
  sourceOpportunityCount: integer('source_opportunity_count').notNull().default(0),
  sourceQuoteCount: integer('source_quote_count').notNull().default(0),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siaOpportunitySignals = pgTable('sia_opportunity_signals', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: siaSignalKindEnum('kind').notNull(),
  title: text('title').notNull(),
  detail: text('detail').notNull(),
  priority: text('priority').notNull().default('medium'),
  sourceLeadId: uuid('source_lead_id').references(() => leads.id, { onDelete: 'set null' }),
  sourceOpportunityId: uuid('source_opportunity_id').references(() => salesOpportunities.id, {
    onDelete: 'set null',
  }),
  sourceQuoteId: uuid('source_quote_id').references(() => quotes.id, { onDelete: 'set null' }),
  sourceCustomerId: uuid('source_customer_id').references(() => customers.id, {
    onDelete: 'set null',
  }),
  sourceLeadSourceId: uuid('source_lead_source_id').references(() => leadSources.id, {
    onDelete: 'set null',
  }),
  estimatedValueCents: integer('estimated_value_cents'),
  currency: text('currency'),
  dismissed: boolean('dismissed').notNull().default(false),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SiaRecommendationRow = typeof siaRecommendations.$inferSelect;
export type SiaInsightRow = typeof siaInsights.$inferSelect;
export type SiaOpportunitySignalRow = typeof siaOpportunitySignals.$inferSelect;
