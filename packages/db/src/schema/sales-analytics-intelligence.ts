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
import { customers } from './customers';
import { leads } from './leads';
import { quotes } from './quotes';
import { salesOpportunities } from './sales';
import { users } from './users';

/**
 * Sales Analytics Intelligence — settings, snapshots, insight drafts, AURA handoffs.
 * Metrics are derived from real leads/quotes/opportunities/jobs/finance aggregates.
 * No invented conversion rates or revenue. No auto outreach.
 */

export const saiInsightKindEnum = pgEnum('sai_insight_kind', [
  'sales_trend',
  'lost_opportunity',
  'improvement_area',
  'conversion_signal',
  'revenue_opportunity',
  'performance_signal',
]);

export const saiInsightStatusEnum = pgEnum('sai_insight_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
  'acknowledged',
]);

export const saiAuraInsightTargetEnum = pgEnum('sai_aura_insight_target', [
  'command_centre',
  'executive_dashboard',
  'sales_intelligence_agent',
  'sales_followup_intelligence',
  'sales_intelligence',
  'crm',
  'quotes',
  'jobs',
  'finance',
  'leads',
]);

export const saiAuraInsightStatusEnum = pgEnum('sai_aura_insight_status', [
  'open',
  'acknowledged',
  'dismissed',
]);

export const saiSettings = pgTable('sai_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  insightsEnabled: boolean('insights_enabled').notNull().default(true),
  minConversionSample: integer('min_conversion_sample').notNull().default(5),
  /** Invariant: always false. */
  inventRatesEnabled: boolean('invent_rates_enabled').notNull().default(false),
  /** Invariant: always false. */
  autoOutreachEnabled: boolean('auto_outreach_enabled').notNull().default(false),
  notes: text('notes'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const saiAnalyticsSnapshots = pgTable('sai_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  leadsCreated: integer('leads_created').notNull().default(0),
  quotesSent: integer('quotes_sent').notNull().default(0),
  quotesAccepted: integer('quotes_accepted').notNull().default(0),
  quotesDeclined: integer('quotes_declined').notNull().default(0),
  openOpportunityCount: integer('open_opportunity_count').notNull().default(0),
  wonOpportunityCount: integer('won_opportunity_count').notNull().default(0),
  lostOpportunityCount: integer('lost_opportunity_count').notNull().default(0),
  pipelineValueCents: integer('pipeline_value_cents'),
  acceptedQuoteValueCents: integer('accepted_quote_value_cents'),
  currency: text('currency').notNull().default('ZAR'),
  quoteConversionRatePercent: numeric('quote_conversion_rate_percent', {
    precision: 6,
    scale: 2,
  }),
  leadToQuoteRatePercent: numeric('lead_to_quote_rate_percent', { precision: 6, scale: 2 }),
  winRatePercent: numeric('win_rate_percent', { precision: 6, scale: 2 }),
  conversionAvailability: text('conversion_availability').notNull().default('unavailable'),
  revenueAvailability: text('revenue_availability').notNull().default('unavailable'),
  rationale: text('rationale').notNull(),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const saiInsightDrafts = pgTable('sai_insight_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: saiInsightKindEnum('kind').notNull(),
  status: saiInsightStatusEnum('status').notNull().default('draft'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  sourceQuoteId: uuid('source_quote_id').references(() => quotes.id, { onDelete: 'set null' }),
  sourceLeadId: uuid('source_lead_id').references(() => leads.id, { onDelete: 'set null' }),
  sourceOpportunityId: uuid('source_opportunity_id').references(() => salesOpportunities.id, {
    onDelete: 'set null',
  }),
  sourceCustomerId: uuid('source_customer_id').references(() => customers.id, {
    onDelete: 'set null',
  }),
  /** Invariant: always false. */
  inventedRates: boolean('invented_rates').notNull().default(false),
  /** Invariant: always false. */
  autoOutreach: boolean('auto_outreach').notNull().default(false),
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

export const saiAuraInsights = pgTable('sai_aura_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  target: saiAuraInsightTargetEnum('target').notNull(),
  status: saiAuraInsightStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  insight: text('insight').notNull(),
  href: text('href'),
  sourceInsightDraftId: uuid('source_insight_draft_id').references(() => saiInsightDrafts.id, {
    onDelete: 'set null',
  }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SaiSettingsRow = typeof saiSettings.$inferSelect;
export type NewSaiSettingsRow = typeof saiSettings.$inferInsert;
export type SaiAnalyticsSnapshotRow = typeof saiAnalyticsSnapshots.$inferSelect;
export type NewSaiAnalyticsSnapshotRow = typeof saiAnalyticsSnapshots.$inferInsert;
export type SaiInsightDraftRow = typeof saiInsightDrafts.$inferSelect;
export type NewSaiInsightDraftRow = typeof saiInsightDrafts.$inferInsert;
export type SaiAuraInsightRow = typeof saiAuraInsights.$inferSelect;
export type NewSaiAuraInsightRow = typeof saiAuraInsights.$inferInsert;
