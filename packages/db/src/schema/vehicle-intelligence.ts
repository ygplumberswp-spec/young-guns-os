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
 * Vehicle Intelligence Foundation — insight drafts, settings, AURA handoffs.
 * Extends existing fleet / Cartrack / job-vehicle modules; no fake GPS/fuel.
 */

export const viInsightKindEnum = pgEnum('vi_insight_kind', [
  'maintenance_need',
  'cost_trend',
  'fleet_risk',
  'fuel_attention',
  'usage_gap',
]);

export const viInsightDraftStatusEnum = pgEnum('vi_insight_draft_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
  'acknowledged',
]);

export const viAuraInsightTargetEnum = pgEnum('vi_aura_insight_target', [
  'command_centre',
  'executive_dashboard',
  'fleet',
  'fleet_intelligence',
  'operations',
  'jobs',
  'scheduling',
  'technicians',
]);

export const viAuraInsightStatusEnum = pgEnum('vi_aura_insight_status', [
  'open',
  'acknowledged',
  'dismissed',
]);

export const viSettings = pgTable('vi_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  /** Invariant: always false. */
  autoFleetMutationEnabled: boolean('auto_fleet_mutation_enabled').notNull().default(false),
  /** Invariant: always false. */
  inventTrackingEnabled: boolean('invent_tracking_enabled').notNull().default(false),
  insightDraftsEnabled: boolean('insight_drafts_enabled').notNull().default(true),
  fuelSignalsEnabled: boolean('fuel_signals_enabled').notNull().default(true),
  maintenanceSignalsEnabled: boolean('maintenance_signals_enabled').notNull().default(true),
  notes: text('notes'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const viInsightDrafts = pgTable('vi_insight_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: viInsightKindEnum('kind').notNull(),
  status: viInsightDraftStatusEnum('status').notNull().default('draft'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  vehicleId: uuid('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  /** Invariant: always false. */
  autoFleetMutation: boolean('auto_fleet_mutation').notNull().default(false),
  /** Invariant: always false. */
  inventedTracking: boolean('invented_tracking').notNull().default(false),
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

export const viAuraInsights = pgTable('vi_aura_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  target: viAuraInsightTargetEnum('target').notNull(),
  status: viAuraInsightStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  insight: text('insight').notNull(),
  href: text('href'),
  sourceInsightDraftId: uuid('source_insight_draft_id').references(() => viInsightDrafts.id, {
    onDelete: 'set null',
  }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
