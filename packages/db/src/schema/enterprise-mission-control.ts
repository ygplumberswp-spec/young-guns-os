import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid, doublePrecision } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

export const missionControlAlertCategoryEnum = pgEnum('mission_control_alert_category', [
  'critical',
  'operational',
  'financial',
  'fleet',
  'inventory',
  'ai',
  'security',
  'integration',
]);

export const missionControlAlertSeverityEnum = pgEnum('mission_control_alert_severity', [
  'low',
  'medium',
  'high',
  'critical',
]);

export const missionControlAlertStatusEnum = pgEnum('mission_control_alert_status', [
  'pending',
  'acknowledged',
  'escalated',
  'resolved',
]);

export const missionControlIncidentSeverityEnum = pgEnum('mission_control_incident_severity', [
  'low',
  'medium',
  'high',
  'critical',
]);

export const missionControlIncidentStatusEnum = pgEnum('mission_control_incident_status', [
  'open',
  'investigating',
  'resolved',
  'closed',
]);

export const missionControlTimelineEventTypeEnum = pgEnum('mission_control_timeline_event_type', [
  'job_event',
  'dispatch_event',
  'fleet_event',
  'finance_event',
  'workflow_event',
  'security_event',
  'integration_event',
  'ai_event',
  'executive_action',
  'incident_event',
]);

export const missionControlCommandActionTypeEnum = pgEnum('mission_control_command_action_type', [
  'executive_task',
  'workflow_launch',
  'approval_request',
  'investigation',
  'incident_escalation',
  'department_coordination',
  'executive_briefing',
]);

export const missionControlCommandActionStatusEnum = pgEnum('mission_control_command_action_status', [
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);

export const missionControlRecommendationStatusEnum = pgEnum('mission_control_recommendation_status', [
  'pending',
  'accepted',
  'dismissed',
  'completed',
]);

export const missionControlAlerts = pgTable('mission_control_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  category: missionControlAlertCategoryEnum('category').notNull(),
  severity: missionControlAlertSeverityEnum('severity').notNull().default('medium'),
  status: missionControlAlertStatusEnum('status').notNull().default('pending'),
  escalationLevel: integer('escalation_level').notNull().default(0),
  title: text('title').notNull(),
  description: text('description').notNull(),
  sourceModule: text('source_module'),
  sourceEntityType: text('source_entity_type'),
  sourceEntityId: uuid('source_entity_id'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  acknowledgedByUserId: uuid('acknowledged_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const missionControlAlertHistory = pgTable('mission_control_alert_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  alertId: uuid('alert_id')
    .notNull()
    .references(() => missionControlAlerts.id, { onDelete: 'cascade' }),
  changeType: text('change_type').notNull(),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull().default({}),
  changedByUserId: uuid('changed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const missionControlIncidents = pgTable('mission_control_incidents', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull(),
  severity: missionControlIncidentSeverityEnum('severity').notNull().default('medium'),
  status: missionControlIncidentStatusEnum('status').notNull().default('open'),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  rootCause: text('root_cause'),
  resolutionSummary: text('resolution_summary'),
  linkedEntities: jsonb('linked_entities').$type<Array<Record<string, unknown>>>().notNull().default([]),
  branchKey: text('branch_key'),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const missionControlIncidentTimeline = pgTable('mission_control_incident_timeline', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  incidentId: uuid('incident_id')
    .notNull()
    .references(() => missionControlIncidents.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  eventAt: timestamp('event_at', { withTimezone: true }).notNull().defaultNow(),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const missionControlOperationsMap = pgTable('mission_control_operations_map', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  mapType: text('map_type').notNull(),
  label: text('label').notNull(),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const missionControlTimelineEvents = pgTable('mission_control_timeline_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  eventType: missionControlTimelineEventTypeEnum('event_type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  sourceModule: text('source_module'),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  branchKey: text('branch_key'),
  eventAt: timestamp('event_at', { withTimezone: true }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const missionControlDepartmentHealth = pgTable('mission_control_department_health', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  departmentKey: text('department_key').notNull(),
  departmentName: text('department_name').notNull(),
  healthScore: integer('health_score'),
  status: text('status').notNull().default('unknown'),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const missionControlRecommendations = pgTable('mission_control_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  recommendation: text('recommendation').notNull(),
  priority: text('priority').notNull().default('medium'),
  status: missionControlRecommendationStatusEnum('status').notNull().default('pending'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const missionControlCommandActions = pgTable('mission_control_command_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  actionType: missionControlCommandActionTypeEnum('action_type').notNull(),
  status: missionControlCommandActionStatusEnum('status').notNull().default('pending_approval'),
  subject: text('subject').notNull(),
  recommendation: text('recommendation').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  incidentId: uuid('incident_id').references(() => missionControlIncidents.id, { onDelete: 'set null' }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type MissionControlAlertRow = typeof missionControlAlerts.$inferSelect;
export type MissionControlIncidentRow = typeof missionControlIncidents.$inferSelect;
