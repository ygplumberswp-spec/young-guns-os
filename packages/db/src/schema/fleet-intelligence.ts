import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';
import { vehicles } from './vehicles';

export const fleetCostTypeEnum = pgEnum('fleet_cost_type', [
  'fuel',
  'maintenance',
  'tyre',
  'licensing',
  'insurance',
  'repair',
  'other',
]);

export const fleetRecommendationTypeEnum = pgEnum('fleet_recommendation_type', [
  'maintenance_planning',
  'route_optimization',
  'vehicle_replacement',
  'fleet_balancing',
  'technician_allocation',
  'operating_cost_reduction',
  'excessive_travel_reduction',
  'comeback_travel_reduction',
]);

export const fleetBehaviourEventTypeEnum = pgEnum('fleet_behaviour_event_type', [
  'speeding',
  'harsh_braking',
  'harsh_acceleration',
  'excessive_idling',
  'route_deviation',
]);

export const fleetActionTypeEnum = pgEnum('fleet_action_type', [
  'fleet_action',
  'vehicle_replacement',
]);
export const fleetActionStatusEnum = pgEnum('fleet_action_status', [
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);

export const fleetMonthlyReports = pgTable('fleet_monthly_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  periodYear: integer('period_year').notNull(),
  periodMonth: integer('period_month').notNull(),
  totalKilometres: integer('total_kilometres').notNull().default(0),
  totalTrips: integer('total_trips').notNull().default(0),
  drivingHours: integer('driving_hours').notNull().default(0),
  idleHours: integer('idle_hours').notNull().default(0),
  averageTripDistanceKm: integer('average_trip_distance_km'),
  averageTripDurationMinutes: integer('average_trip_duration_minutes'),
  vehicleSummaries: jsonb('vehicle_summaries')
    .$type<
      Array<{
        vehicleId: string | null;
        vehicleName: string | null;
        kilometres: number;
        trips: number;
      }>
    >()
    .notNull()
    .default([]),
  exportMetadata: jsonb('export_metadata').$type<Record<string, unknown>>().notNull().default({}),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fleetDriverBehaviourEvents = pgTable('fleet_driver_behaviour_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  vehicleId: uuid('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),
  eventType: fleetBehaviourEventTypeEnum('event_type').notNull(),
  severity: integer('severity').notNull().default(1),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fleetOperatingCosts = pgTable('fleet_operating_costs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  vehicleId: uuid('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),
  costType: fleetCostTypeEnum('cost_type').notNull(),
  amountCents: integer('amount_cents').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  notes: text('notes'),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fleetRecommendations = pgTable('fleet_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  recommendationType: fleetRecommendationTypeEnum('recommendation_type').notNull(),
  subject: text('subject').notNull(),
  recommendation: text('recommendation').notNull(),
  vehicleId: uuid('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),
  branchKey: text('branch_key'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fleetActions = pgTable('fleet_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  actionType: fleetActionTypeEnum('action_type').notNull(),
  status: fleetActionStatusEnum('status').notNull().default('pending_approval'),
  subject: text('subject').notNull(),
  recommendation: text('recommendation').notNull(),
  vehicleId: uuid('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
