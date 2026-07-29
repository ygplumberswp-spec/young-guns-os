import { boolean, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

export const digitalTwinSimulationTypeEnum = pgEnum('digital_twin_simulation_type', [
  'job_scheduling',
  'technician_allocation',
  'dispatch_optimization',
  'fleet_utilization',
  'inventory_demand',
  'purchasing',
  'cash_flow',
  'staffing',
  'customer_demand',
  'growth',
]);

export const digitalTwinScenarioStatusEnum = pgEnum('digital_twin_scenario_status', [
  'draft',
  'active',
  'archived',
]);

export const digitalTwinSimulationStatusEnum = pgEnum('digital_twin_simulation_status', [
  'pending',
  'running',
  'completed',
  'failed',
]);

export const digitalTwinHeatMapTypeEnum = pgEnum('digital_twin_heat_map_type', [
  'technician_workload',
  'fleet_activity',
  'job_density',
  'customer_demand',
  'inventory_pressure',
  'financial_hotspots',
  'branch_performance',
]);

export const digitalTwinRecommendationStatusEnum = pgEnum('digital_twin_recommendation_status', [
  'pending',
  'accepted',
  'dismissed',
  'completed',
]);

export const digitalTwinActionTypeEnum = pgEnum('digital_twin_action_type', [
  'operational_improvement',
  'scenario_recommendation',
  'bottleneck_fix',
  'optimization_plan',
  'executive_recommendation',
]);

export const digitalTwinActionStatusEnum = pgEnum('digital_twin_action_status', [
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);

export const digitalTwinReplayEventTypeEnum = pgEnum('digital_twin_replay_event_type', [
  'job_event',
  'dispatch_event',
  'fleet_event',
  'inventory_event',
  'finance_event',
  'workflow_event',
  'decision_event',
]);

export const digitalTwinStateSnapshots = pgTable('digital_twin_state_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  label: text('label'),
  operationalState: jsonb('operational_state').$type<Record<string, unknown>>().notNull().default({}),
  summary: text('summary'),
  capturedByUserId: uuid('captured_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const digitalTwinScenarios = pgTable('digital_twin_scenarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  simulationType: digitalTwinSimulationTypeEnum('simulation_type').notNull(),
  status: digitalTwinScenarioStatusEnum('status').notNull().default('draft'),
  assumptions: jsonb('assumptions').$type<Record<string, unknown>>().notNull().default({}),
  variables: jsonb('variables').$type<Record<string, unknown>>().notNull().default({}),
  baselineSnapshotId: uuid('baseline_snapshot_id').references(() => digitalTwinStateSnapshots.id, {
    onDelete: 'set null',
  }),
  clonedFromScenarioId: uuid('cloned_from_scenario_id'),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const digitalTwinSimulations = pgTable('digital_twin_simulations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  scenarioId: uuid('scenario_id')
    .notNull()
    .references(() => digitalTwinScenarios.id, { onDelete: 'cascade' }),
  simulationType: digitalTwinSimulationTypeEnum('simulation_type').notNull(),
  status: digitalTwinSimulationStatusEnum('status').notNull().default('pending'),
  inputState: jsonb('input_state').$type<Record<string, unknown>>().notNull().default({}),
  projectedOutcomes: jsonb('projected_outcomes').$type<Record<string, unknown>>().notNull().default({}),
  comparisonMetrics: jsonb('comparison_metrics').$type<Record<string, unknown>>().notNull().default({}),
  resultSummary: text('result_summary'),
  isReadOnly: boolean('is_read_only').notNull().default(true),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const digitalTwinScenarioComparisons = pgTable('digital_twin_scenario_comparisons', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  scenarioIds: jsonb('scenario_ids').$type<string[]>().notNull().default([]),
  comparisonResults: jsonb('comparison_results').$type<Record<string, unknown>>().notNull().default({}),
  summary: text('summary'),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const digitalTwinReplayEvents = pgTable('digital_twin_replay_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  eventType: digitalTwinReplayEventTypeEnum('event_type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  eventAt: timestamp('event_at', { withTimezone: true }).notNull(),
  stateDelta: jsonb('state_delta').$type<Record<string, unknown>>().notNull().default({}),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const digitalTwinHeatMapSnapshots = pgTable('digital_twin_heat_map_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  heatMapType: digitalTwinHeatMapTypeEnum('heat_map_type').notNull(),
  dataPoints: jsonb('data_points').$type<Array<Record<string, unknown>>>().notNull().default([]),
  summary: text('summary'),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const digitalTwinRecommendations = pgTable('digital_twin_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  scenarioId: uuid('scenario_id').references(() => digitalTwinScenarios.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  recommendation: text('recommendation').notNull(),
  priority: text('priority').notNull().default('medium'),
  status: digitalTwinRecommendationStatusEnum('status').notNull().default('pending'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const digitalTwinPlatformActions = pgTable('digital_twin_platform_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  actionType: digitalTwinActionTypeEnum('action_type').notNull(),
  status: digitalTwinActionStatusEnum('status').notNull().default('pending_approval'),
  subject: text('subject').notNull(),
  recommendation: text('recommendation').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  scenarioId: uuid('scenario_id').references(() => digitalTwinScenarios.id, { onDelete: 'set null' }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type DigitalTwinStateSnapshotRow = typeof digitalTwinStateSnapshots.$inferSelect;
export type DigitalTwinScenarioRow = typeof digitalTwinScenarios.$inferSelect;
export type DigitalTwinSimulationRow = typeof digitalTwinSimulations.$inferSelect;
export type DigitalTwinScenarioComparisonRow = typeof digitalTwinScenarioComparisons.$inferSelect;
export type DigitalTwinReplayEventRow = typeof digitalTwinReplayEvents.$inferSelect;
export type DigitalTwinHeatMapSnapshotRow = typeof digitalTwinHeatMapSnapshots.$inferSelect;
export type DigitalTwinRecommendationRow = typeof digitalTwinRecommendations.$inferSelect;
export type DigitalTwinPlatformActionRow = typeof digitalTwinPlatformActions.$inferSelect;
