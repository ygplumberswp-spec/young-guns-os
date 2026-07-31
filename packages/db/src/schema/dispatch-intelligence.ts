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
import { commIntelCallIntelligence } from './communications-intelligence';
import { companies } from './companies';
import { customers } from './customers';
import { jobs } from './jobs';
import { users } from './users';
import { voiceSessions } from './voice';

export const dispatchEmergencyTypeEnum = pgEnum('dispatch_emergency_type', [
  'burst_pipe',
  'flooding',
  'blocked_drain',
  'gas_leak',
  'water_leak',
  'no_water',
  'sewer_overflow',
  'other',
]);

export const dispatchRoutingTypeEnum = pgEnum('dispatch_routing_type', [
  'branch',
  'region',
  'department',
  'emergency',
  'technician',
  'office',
  'service_type',
]);

export const dispatchCallbackStatusEnum = pgEnum('dispatch_callback_status', [
  'pending_approval',
  'approved',
  'scheduled',
  'completed',
  'cancelled',
  'missed',
]);

export const dispatchActionTypeEnum = pgEnum('dispatch_action_type', [
  'dispatch_action',
  'callback_action',
]);

export const dispatchActionStatusEnum = pgEnum('dispatch_action_status', [
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);

export const dispatchRecommendationTypeEnum = pgEnum('dispatch_recommendation_type', [
  'technician_reassignment',
  'overtime_reduction',
  'travel_optimization',
  'workload_balancing',
  'emergency_prioritization',
  'branch_balancing',
  'staffing_shortage',
  'call_routing',
]);

export const dispatchReceptionistSummaries = pgTable('dispatch_receptionist_summaries', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  voiceSessionId: uuid('voice_session_id').references(() => voiceSessions.id, {
    onDelete: 'set null',
  }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  serviceIntent: text('service_intent'),
  emergencyDetected: boolean('emergency_detected').notNull().default(false),
  afterHours: boolean('after_hours').notNull().default(false),
  branchKey: text('branch_key'),
  languagePreference: text('language_preference'),
  priorityScore: integer('priority_score').notNull().default(0),
  summary: text('summary').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dispatchRoutingRecommendations = pgTable('dispatch_routing_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  voiceSessionId: uuid('voice_session_id').references(() => voiceSessions.id, {
    onDelete: 'set null',
  }),
  callIntelligenceId: uuid('call_intelligence_id').references(() => commIntelCallIntelligence.id, {
    onDelete: 'set null',
  }),
  routingType: dispatchRoutingTypeEnum('routing_type').notNull(),
  targetBranch: text('target_branch'),
  targetDepartment: text('target_department'),
  priority: integer('priority').notNull().default(100),
  recommendation: text('recommendation').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dispatchCallbackRequests = pgTable('dispatch_callback_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  voiceSessionId: uuid('voice_session_id').references(() => voiceSessions.id, {
    onDelete: 'set null',
  }),
  phoneNumber: text('phone_number'),
  status: dispatchCallbackStatusEnum('status').notNull().default('pending_approval'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  outcome: text('outcome'),
  missedCallTracked: boolean('missed_call_tracked').notNull().default(false),
  notes: text('notes'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dispatchEmergencyAssessments = pgTable('dispatch_emergency_assessments', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  voiceSessionId: uuid('voice_session_id').references(() => voiceSessions.id, {
    onDelete: 'set null',
  }),
  emergencyType: dispatchEmergencyTypeEnum('emergency_type').notNull(),
  priority: integer('priority').notNull().default(100),
  recommendedResponseMinutes: integer('recommended_response_minutes'),
  escalationRecommendation: text('escalation_recommendation'),
  branchRecommendation: text('branch_recommendation'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dispatchRecommendations = pgTable('dispatch_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  recommendationType: dispatchRecommendationTypeEnum('recommendation_type').notNull(),
  subject: text('subject').notNull(),
  recommendation: text('recommendation').notNull(),
  technicianId: uuid('technician_id').references(() => users.id, { onDelete: 'set null' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  branchKey: text('branch_key'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dispatchActions = pgTable('dispatch_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  actionType: dispatchActionTypeEnum('action_type').notNull(),
  status: dispatchActionStatusEnum('status').notNull().default('pending_approval'),
  subject: text('subject').notNull(),
  recommendation: text('recommendation').notNull(),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  technicianId: uuid('technician_id').references(() => users.id, { onDelete: 'set null' }),
  callbackRequestId: uuid('callback_request_id').references(() => dispatchCallbackRequests.id, {
    onDelete: 'set null',
  }),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
