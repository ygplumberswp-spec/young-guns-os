import { boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communications } from './communications';
import { companies } from './companies';
import { customerSupportConversations } from './customer-support';
import { customers } from './customers';
import { invoices } from './invoices';
import { jobs } from './jobs';
import { messageTemplates } from './message-templates';
import { quotes } from './quotes';
import { users } from './users';
import { voiceSessions } from './voice';

export const commIntelChannelEnum = pgEnum('comm_intel_channel', [
  'phone',
  'whatsapp',
  'email',
  'sms',
  'portal',
  'support',
  'internal',
]);

export const commIntelCallTypeEnum = pgEnum('comm_intel_call_type', [
  'inbound',
  'outbound',
  'missed',
  'transferred',
  'voicemail',
  'callback',
]);

export const commIntelCallOutcomeEnum = pgEnum('comm_intel_call_outcome', [
  'answered',
  'missed',
  'voicemail',
  'transferred',
  'resolved',
  'unresolved',
  'callback_requested',
]);

export const commIntelSentimentEnum = pgEnum('comm_intel_sentiment', [
  'positive',
  'neutral',
  'negative',
  'mixed',
]);

export const commIntelRecordingStatusEnum = pgEnum('comm_intel_recording_status', [
  'pending',
  'available',
  'archived',
  'deleted',
]);

export const commIntelTranscriptionStatusEnum = pgEnum('comm_intel_transcription_status', [
  'pending',
  'processing',
  'completed',
  'failed',
  'unavailable',
]);

export const commIntelConsentStatusEnum = pgEnum('comm_intel_consent_status', [
  'granted',
  'denied',
  'unknown',
  'revoked',
]);

export const commIntelSourceTypeEnum = pgEnum('comm_intel_source_type', [
  'voice_session',
  'whatsapp_message',
  'communication',
  'support_conversation',
  'portal_request',
]);

export const commIntelSmsStatusEnum = pgEnum('comm_intel_sms_status', [
  'sent',
  'delivered',
  'failed',
  'replied',
]);

export const commIntelDraftTypeEnum = pgEnum('comm_intel_draft_type', ['customer_reply', 'follow_up']);

export const commIntelDraftStatusEnum = pgEnum('comm_intel_draft_status', [
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);

export const commIntelRecordings = pgTable('comm_intel_recordings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  voiceSessionId: uuid('voice_session_id').references(() => voiceSessions.id, { onDelete: 'set null' }),
  storageReference: text('storage_reference'),
  retentionPolicyDays: integer('retention_policy_days'),
  consentStatus: commIntelConsentStatusEnum('consent_status').notNull().default('unknown'),
  recordingStatus: commIntelRecordingStatusEnum('recording_status').notNull().default('pending'),
  transcriptionStatus: commIntelTranscriptionStatusEnum('transcription_status')
    .notNull()
    .default('unavailable'),
  transcriptReference: text('transcript_reference'),
  aiSummary: text('ai_summary'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const commIntelCallIntelligence = pgTable('comm_intel_call_intelligence', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  voiceSessionId: uuid('voice_session_id')
    .notNull()
    .references(() => voiceSessions.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  callType: commIntelCallTypeEnum('call_type').notNull(),
  queueName: text('queue_name'),
  assignedStaffId: uuid('assigned_staff_id').references(() => users.id, { onDelete: 'set null' }),
  outcome: commIntelCallOutcomeEnum('outcome'),
  sentiment: commIntelSentimentEnum('sentiment'),
  intent: text('intent'),
  followUpStatus: text('follow_up_status').notNull().default('none'),
  recordingId: uuid('recording_id').references(() => commIntelRecordings.id, { onDelete: 'set null' }),
  durationSeconds: integer('duration_seconds'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const commIntelConversationInsights = pgTable('comm_intel_conversation_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  sourceType: commIntelSourceTypeEnum('source_type').notNull(),
  sourceId: uuid('source_id').notNull(),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  channel: commIntelChannelEnum('channel').notNull(),
  sentiment: commIntelSentimentEnum('sentiment').notNull().default('neutral'),
  urgencyScore: integer('urgency_score').notNull().default(0),
  hasComplaint: boolean('has_complaint').notNull().default(false),
  hasCompliment: boolean('has_compliment').notNull().default(false),
  buyingIntent: boolean('buying_intent').notNull().default(false),
  cancellationRisk: boolean('cancellation_risk').notNull().default(false),
  escalationRisk: boolean('escalation_risk').notNull().default(false),
  followUpRecommendation: text('follow_up_recommendation'),
  aiSummary: text('ai_summary'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const commIntelEmailThreads = pgTable('comm_intel_email_threads', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  subject: text('subject').notNull(),
  threadKey: text('thread_key').notNull(),
  communicationIds: jsonb('communication_ids').$type<string[]>().notNull().default([]),
  sentiment: commIntelSentimentEnum('sentiment').notNull().default('neutral'),
  priority: text('priority').notNull().default('normal'),
  aiSummary: text('ai_summary'),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const commIntelSmsRecords = pgTable('comm_intel_sms_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  communicationId: uuid('communication_id').references(() => communications.id, { onDelete: 'set null' }),
  templateId: uuid('template_id').references(() => messageTemplates.id, { onDelete: 'set null' }),
  campaignKey: text('campaign_key'),
  direction: text('direction').notNull(),
  status: commIntelSmsStatusEnum('status').notNull().default('sent'),
  bodyPreview: text('body_preview').notNull(),
  replyToId: uuid('reply_to_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const commIntelDraftActions = pgTable('comm_intel_draft_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  draftType: commIntelDraftTypeEnum('draft_type').notNull(),
  status: commIntelDraftStatusEnum('status').notNull().default('pending_approval'),
  channel: commIntelChannelEnum('channel').notNull(),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  subject: text('subject'),
  body: text('body').notNull(),
  sourceType: commIntelSourceTypeEnum('source_type'),
  sourceId: uuid('source_id'),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'set null' }),
  invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
  supportConversationId: uuid('support_conversation_id').references(() => customerSupportConversations.id, {
    onDelete: 'set null',
  }),
  leadId: uuid('lead_id'),
  technicianId: uuid('technician_id').references(() => users.id, { onDelete: 'set null' }),
  staffUserId: uuid('staff_user_id').references(() => users.id, { onDelete: 'set null' }),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CommIntelRecording = typeof commIntelRecordings.$inferSelect;
export type CommIntelCallIntelligence = typeof commIntelCallIntelligence.$inferSelect;
export type CommIntelConversationInsight = typeof commIntelConversationInsights.$inferSelect;
export type CommIntelEmailThread = typeof commIntelEmailThreads.$inferSelect;
export type CommIntelSmsRecord = typeof commIntelSmsRecords.$inferSelect;
export type CommIntelDraftAction = typeof commIntelDraftActions.$inferSelect;
