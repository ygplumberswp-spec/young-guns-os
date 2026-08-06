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
import { jobs } from './jobs';

/**
 * Fleet AI Recommendations (Department 8.3) — recommendation drafts, settings, AURA handoffs.
 * Extends fleet / Cartrack / Vehicle Intelligence / costs / maintenance; recommendations only.
 */

export const farRecommendationKindEnum = pgEnum('far_recommendation_kind', [
  'maintenance_suggestion',
  'cost_reduction',
  'route_improvement',
  'fleet_efficiency',
  'replacement_planning',
]);

export const farRecommendationStatusEnum = pgEnum('far_recommendation_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
  'acknowledged',
]);

export const farAuraInsightTargetEnum = pgEnum('far_aura_insight_target', [
  'command_centre',
  'executive_dashboard',
  'fleet',
  'fleet_intelligence',
  'vehicle_intelligence',
  'driver_intelligence',
  'operations',
  'jobs',
  'scheduling',
  'technicians',
]);

export const farAuraInsightStatusEnum = pgEnum('far_aura_insight_status', [
  'open',
  'acknowledged',
  'dismissed',
]);

export const farSettings = pgTable('far_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  /** Invariant: always false. */
  autoVehicleDecisionEnabled: boolean('auto_vehicle_decision_enabled').notNull().default(false),
  /** Invariant: always false. */
  inventGpsEnabled: boolean('invent_gps_enabled').notNull().default(false),
  /** Invariant: always false. */
  inventCostsEnabled: boolean('invent_costs_enabled').notNull().default(false),
  recommendationDraftsEnabled: boolean('recommendation_drafts_enabled').notNull().default(true),
  maintenanceSuggestionsEnabled: boolean('maintenance_suggestions_enabled').notNull().default(true),
  costReductionEnabled: boolean('cost_reduction_enabled').notNull().default(true),
  routeImprovementsEnabled: boolean('route_improvements_enabled').notNull().default(true),
  efficiencyInsightsEnabled: boolean('efficiency_insights_enabled').notNull().default(true),
  replacementPlanningEnabled: boolean('replacement_planning_enabled').notNull().default(true),
  notes: text('notes'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const farRecommendationDrafts = pgTable('far_recommendation_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: farRecommendationKindEnum('kind').notNull(),
  status: farRecommendationStatusEnum('status').notNull().default('draft'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  vehicleId: uuid('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  /** Invariant: always false. */
  autoVehicleDecision: boolean('auto_vehicle_decision').notNull().default(false),
  /** Invariant: always false. */
  inventedGps: boolean('invented_gps').notNull().default(false),
  /** Invariant: always false. */
  inventedCosts: boolean('invented_costs').notNull().default(false),
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

export const farAuraInsights = pgTable('far_aura_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  target: farAuraInsightTargetEnum('target').notNull(),
  status: farAuraInsightStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  insight: text('insight').notNull(),
  href: text('href'),
  sourceRecommendationId: uuid('source_recommendation_id').references(
    () => farRecommendationDrafts.id,
    { onDelete: 'set null' },
  ),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
