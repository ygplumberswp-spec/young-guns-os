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

/**
 * Market Intelligence — the Owner's source register, controls, publication
 * decisions, approval-gated recommendations and audit trail.
 *
 * No market observation is copied here. Insights are measured live from the
 * market records already captured in Enterprise Marketing Intelligence
 * (`mi_market_intelligence_records`), connected search keyword data
 * (`mi_seo_keywords`), the supplier price catalogue and the company's own
 * leads, quotes and jobs — so an insight can never drift from the rows behind
 * it. Only the Owner's decisions persist.
 */

export const mktTopicEnum = pgEnum('mkt_topic', [
  'competitor_activity',
  'industry_trend',
  'pricing_position',
  'demand_trend',
  'seasonal_demand',
  'search_trend',
  'service_area_demand',
  'new_service_opportunity',
  'supplier_product_signal',
  'marketing_opportunity',
]);

export const mktEvidenceOriginEnum = pgEnum('mkt_evidence_origin', [
  'own_records',
  'connected_provider',
  'public_source',
  'manual_entry',
]);

export const mktInsightStatusEnum = pgEnum('mkt_insight_status', [
  'draft',
  'approved',
  'rejected',
  'archived',
]);

export const mktOpportunityStatusEnum = pgEnum('mkt_opportunity_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'acknowledged',
]);

export const mktEventKindEnum = pgEnum('mkt_event_kind', [
  'settings_updated',
  'source_registered',
  'source_updated',
  'insight_approved',
  'insight_rejected',
  'insight_archived',
  'insight_reopened',
  'opportunity_created',
  'opportunity_decided',
  'opportunity_refreshed',
]);

export const mktSettings = pgTable('mkt_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  /** Invariant: always false — this layer never acts on the business. */
  autoActionsEnabled: boolean('auto_actions_enabled').notNull().default(false),
  /** Invariant: always false — a market figure is never generated. */
  inventMarketDataEnabled: boolean('invent_market_data_enabled').notNull().default(false),
  /** Invariant: always false — nothing is fetched or scraped from here. */
  externalFetchEnabled: boolean('external_fetch_enabled').notNull().default(false),
  lookbackDays: integer('lookback_days').notNull().default(365),
  stalenessDays: integer('staleness_days').notNull().default(30),
  minEvidenceRecords: integer('min_evidence_records').notNull().default(5),
  requireRegisteredSource: boolean('require_registered_source').notNull().default(true),
  publishApprovedOnly: boolean('publish_approved_only').notNull().default(true),
  notes: text('notes'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The sources the Owner has registered as supported and lawfully accessible.
 * An observation citing a source that is not registered here is reported as
 * needing verification rather than being trusted.
 */
export const mktSources = pgTable('mkt_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  sourceKey: text('source_key').notNull(),
  label: text('label').notNull(),
  origin: mktEvidenceOriginEnum('origin').notNull(),
  /** The Owner attests this source is supported and lawfully accessible. */
  permitted: boolean('permitted').notNull().default(false),
  verified: boolean('verified').notNull().default(false),
  reference: text('reference'),
  notes: text('notes'),
  registeredByUserId: uuid('registered_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per insight the Owner has decided on. The insight itself is not
 * stored — its key is derived from the real rows behind it on every read, so a
 * published insight cannot drift from its evidence.
 */
export const mktInsightStates = pgTable('mkt_insight_states', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  insightKey: text('insight_key').notNull(),
  topic: mktTopicEnum('topic').notNull(),
  status: mktInsightStatusEnum('status').notNull().default('draft'),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  notes: text('notes'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mktOpportunityDrafts = pgTable('mkt_opportunity_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  insightKey: text('insight_key'),
  topic: mktTopicEnum('topic'),
  status: mktOpportunityStatusEnum('status').notNull().default('draft'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  confidence: text('confidence').notNull().default('insufficient'),
  /** Invariant: always false — an approved recommendation is a decision only. */
  autoExecuted: boolean('auto_executed').notNull().default(false),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionNotes: text('decision_notes'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Append-only history. An archived insight is hidden, never erased. */
export const mktSignalEvents = pgTable('mkt_signal_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  insightKey: text('insight_key'),
  kind: mktEventKindEnum('kind').notNull(),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  notes: text('notes'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

export type MktSettingsRow = typeof mktSettings.$inferSelect;
export type MktSourceRow = typeof mktSources.$inferSelect;
export type MktInsightStateRow = typeof mktInsightStates.$inferSelect;
export type MktOpportunityDraftRow = typeof mktOpportunityDrafts.$inferSelect;
export type MktSignalEventRow = typeof mktSignalEvents.$inferSelect;
