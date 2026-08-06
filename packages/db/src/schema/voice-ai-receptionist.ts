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
import { jobs } from './jobs';
import { leads } from './leads';
import { users } from './users';
import { voiceSessions } from './voice';

/**
 * Voice AI Receptionist Foundation — settings, call sessions, routing,
 * approval drafts, takeover events. Extends voice / enterprise voice reception.
 * No fake calls. Human takeover always available.
 */

export const vairCallSessionStatusEnum = pgEnum('vair_call_session_status', [
  'ringing',
  'active',
  'human_takeover',
  'completed',
  'missed',
  'failed',
  'abandoned',
]);

export const vairCallDirectionEnum = pgEnum('vair_call_direction', ['inbound', 'outbound']);

export const vairRoutingDestinationEnum = pgEnum('vair_routing_destination', [
  'ai_receptionist',
  'human_queue',
  'extension',
  'voicemail',
  'callback',
]);

export const vairApprovalKindEnum = pgEnum('vair_approval_kind', [
  'lead_create',
  'booking_draft',
  'routing_change',
  'other',
]);

export const vairApprovalStatusEnum = pgEnum('vair_approval_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
  'executed',
]);

export const vairTakeoverReasonEnum = pgEnum('vair_takeover_reason', [
  'caller_request',
  'low_confidence',
  'emergency',
  'operator_initiated',
  'policy',
]);

export const vairSaLocaleEnum = pgEnum('vair_sa_locale', [
  'en-ZA',
  'af-ZA',
  'zu-ZA',
  'xh-ZA',
  'other',
]);

export const vairSettings = pgTable('vair_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  receptionistEnabled: boolean('receptionist_enabled').notNull().default(true),
  humanTakeoverAlwaysAvailable: boolean('human_takeover_always_available').notNull().default(true),
  leadCreateRequiresApproval: boolean('lead_create_requires_approval').notNull().default(true),
  bookingExecuteRequiresApproval: boolean('booking_execute_requires_approval')
    .notNull()
    .default(true),
  defaultLocale: vairSaLocaleEnum('default_locale').notNull().default('en-ZA'),
  preferredVoiceLabel: text('preferred_voice_label'),
  welcomeMessage: text('welcome_message'),
  afterHoursMessage: text('after_hours_message'),
  telephonyProviderKey: text('telephony_provider_key'),
  ttsProviderKey: text('tts_provider_key'),
  sttProviderKey: text('stt_provider_key'),
  notes: text('notes'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vairCallSessions = pgTable('vair_call_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  status: vairCallSessionStatusEnum('status').notNull().default('ringing'),
  direction: vairCallDirectionEnum('direction').notNull().default('inbound'),
  callerPhone: text('caller_phone'),
  callerName: text('caller_name'),
  normalizedPhone: text('normalized_phone'),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  voiceSessionId: uuid('voice_session_id').references(() => voiceSessions.id, {
    onDelete: 'set null',
  }),
  routingDestination: vairRoutingDestinationEnum('routing_destination'),
  humanTakeoverActive: boolean('human_takeover_active').notNull().default(false),
  summary: text('summary'),
  invented: boolean('invented').notNull().default(false),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vairRoutingRules = pgTable('vair_routing_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  ruleKey: text('rule_key').notNull(),
  name: text('name').notNull(),
  priority: integer('priority').notNull().default(100),
  destination: vairRoutingDestinationEnum('destination').notNull().default('ai_receptionist'),
  matchCriteria: jsonb('match_criteria').$type<Record<string, unknown>>().notNull().default({}),
  enabled: boolean('enabled').notNull().default(true),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vairApprovalDrafts = pgTable('vair_approval_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: vairApprovalKindEnum('kind').notNull(),
  status: vairApprovalStatusEnum('status').notNull().default('draft'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  callSessionId: uuid('call_session_id').references(() => vairCallSessions.id, {
    onDelete: 'set null',
  }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  autoExecuted: boolean('auto_executed').notNull().default(false),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionNotes: text('decision_notes'),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vairTakeoverEvents = pgTable('vair_takeover_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  callSessionId: uuid('call_session_id')
    .notNull()
    .references(() => vairCallSessions.id, { onDelete: 'cascade' }),
  reason: vairTakeoverReasonEnum('reason').notNull().default('operator_initiated'),
  notes: text('notes'),
  takenOverByUserId: uuid('taken_over_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  takenOverAt: timestamp('taken_over_at', { withTimezone: true }).notNull().defaultNow(),
  releasedAt: timestamp('released_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type VairSettingsRow = typeof vairSettings.$inferSelect;
export type NewVairSettingsRow = typeof vairSettings.$inferInsert;
export type VairCallSessionRow = typeof vairCallSessions.$inferSelect;
export type NewVairCallSessionRow = typeof vairCallSessions.$inferInsert;
export type VairRoutingRuleRow = typeof vairRoutingRules.$inferSelect;
export type NewVairRoutingRuleRow = typeof vairRoutingRules.$inferInsert;
export type VairApprovalDraftRow = typeof vairApprovalDrafts.$inferSelect;
export type NewVairApprovalDraftRow = typeof vairApprovalDrafts.$inferInsert;
export type VairTakeoverEventRow = typeof vairTakeoverEvents.$inferSelect;
export type NewVairTakeoverEventRow = typeof vairTakeoverEvents.$inferInsert;
