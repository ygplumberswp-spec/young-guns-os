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
import { agentProfiles } from './agent-profiles';
import { companies } from './companies';
import { customers } from './customers';
import { users } from './users';

export const voiceSessionStatusEnum = pgEnum('voice_session_status', [
  'active',
  'completed',
  'missed',
  'abandoned',
  'failed',
]);

export const voiceChannelEnum = pgEnum('voice_channel', ['phone', 'web_voice']);

export const voiceEnquiryTypeEnum = pgEnum('voice_enquiry_type', [
  'new_enquiry',
  'existing_customer',
  'service_request',
  'quote_request',
  'appointment_request',
  'other',
]);

export const voiceSpeakerEnum = pgEnum('voice_speaker', ['caller', 'agent', 'system']);

export const voiceOutcomeTypeEnum = pgEnum('voice_outcome_type', [
  'qualified',
  'appointment_requested',
  'quote_requested',
  'follow_up_required',
  'transferred',
  'resolved',
  'unresolved',
  'other',
]);

export const voiceFollowUpTypeEnum = pgEnum('voice_follow_up_type', [
  'customer_note',
  'lead_draft',
  'sales_follow_up',
  'appointment_request',
  'communication_draft',
]);

export const voiceFollowUpStatusEnum = pgEnum('voice_follow_up_status', [
  'pending',
  'accepted',
  'dismissed',
  'completed',
]);

export const voiceSessions = pgTable('voice_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  agentProfileId: uuid('agent_profile_id').references(() => agentProfiles.id, {
    onDelete: 'set null',
  }),
  status: voiceSessionStatusEnum('status').notNull().default('active'),
  channel: voiceChannelEnum('channel').notNull().default('phone'),
  enquiryType: voiceEnquiryTypeEnum('enquiry_type').notNull().default('other'),
  callerName: text('caller_name'),
  callerPhone: text('caller_phone'),
  callerEmail: text('caller_email'),
  durationSeconds: integer('duration_seconds'),
  summary: text('summary'),
  followUpRequired: boolean('follow_up_required').notNull().default(false),
  qualification: jsonb('qualification').$type<Record<string, unknown>>().notNull().default({}),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const voiceConversations = pgTable('voice_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => voiceSessions.id, { onDelete: 'cascade' }),
  speaker: voiceSpeakerEnum('speaker').notNull(),
  content: text('content').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const voiceOutcomes = pgTable('voice_outcomes', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => voiceSessions.id, { onDelete: 'cascade' }),
  outcomeType: voiceOutcomeTypeEnum('outcome_type').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const voiceFollowUps = pgTable('voice_follow_ups', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => voiceSessions.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  followUpType: voiceFollowUpTypeEnum('follow_up_type').notNull(),
  status: voiceFollowUpStatusEnum('status').notNull().default('pending'),
  title: text('title').notNull(),
  description: text('description').notNull(),
  priority: text('priority').notNull().default('medium'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type VoiceSession = typeof voiceSessions.$inferSelect;
export type VoiceConversation = typeof voiceConversations.$inferSelect;
export type VoiceOutcome = typeof voiceOutcomes.$inferSelect;
export type VoiceFollowUp = typeof voiceFollowUps.$inferSelect;
