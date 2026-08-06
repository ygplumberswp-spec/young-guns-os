import {
  boolean,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';
import { vehicles } from './vehicles';

/**
 * Driver Intelligence (Department 8.2) — recommendation drafts, settings, AURA handoffs.
 * Extends fleet / Cartrack / Vehicle Intelligence / job-vehicle; no fake GPS; no auto-discipline.
 */

export const driRecommendationKindEnum = pgEnum('dri_recommendation_kind', [
  'efficiency_opportunity',
  'risk_pattern',
  'training_opportunity',
]);

export const driRecommendationStatusEnum = pgEnum('dri_recommendation_status', [
  'draft',
  'acknowledged',
  'dismissed',
]);

export const driAuraInsightTargetEnum = pgEnum('dri_aura_insight_target', [
  'command_centre',
  'executive_dashboard',
  'fleet',
  'fleet_intelligence',
  'vehicle_intelligence',
  'operations',
  'jobs',
  'scheduling',
  'technicians',
  'hr',
]);

export const driAuraInsightStatusEnum = pgEnum('dri_aura_insight_status', [
  'open',
  'acknowledged',
  'dismissed',
]);

export const driSettings = pgTable('dri_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  recommendationDraftsEnabled: boolean('recommendation_drafts_enabled').notNull().default(true),
  behaviourSignalsEnabled: boolean('behaviour_signals_enabled').notNull().default(true),
  tripSignalsEnabled: boolean('trip_signals_enabled').notNull().default(true),
  autoDisciplineEnabled: boolean('auto_discipline_enabled').notNull().default(false),
  inventGpsEnabled: boolean('invent_gps_enabled').notNull().default(false),
  notes: text('notes'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const driRecommendationDrafts = pgTable('dri_recommendation_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: driRecommendationKindEnum('kind').notNull(),
  status: driRecommendationStatusEnum('status').notNull().default('draft'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  driverUserId: uuid('driver_user_id').references(() => users.id, { onDelete: 'set null' }),
  vehicleId: uuid('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),
  autoDiscipline: boolean('auto_discipline').notNull().default(false),
  inventedGps: boolean('invented_gps').notNull().default(false),
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

export const driAuraInsights = pgTable('dri_aura_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  target: driAuraInsightTargetEnum('target').notNull(),
  status: driAuraInsightStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  insight: text('insight').notNull(),
  href: text('href'),
  sourceRecommendationId: uuid('source_recommendation_id').references(
    () => driRecommendationDrafts.id,
    { onDelete: 'set null' },
  ),
  driverUserId: uuid('driver_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type DriSettingsRow = typeof driSettings.$inferSelect;
export type DriRecommendationDraftRow = typeof driRecommendationDrafts.$inferSelect;
export type DriAuraInsightRow = typeof driAuraInsights.$inferSelect;
