import { boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { users } from './users';
import { whatsappConnections } from './whatsapp-connections';
import { whatsappMessages } from './whatsapp-messages';

export const personalCommAccountTypeEnum = pgEnum('personal_comm_account_type', ['personal', 'business']);

export const personalCommClassificationEnum = pgEnum('personal_comm_classification', [
  'business_customer',
  'existing_customer',
  'new_lead',
  'supplier',
  'employee',
  'personal',
  'family',
  'friend',
  'marketing',
  'spam',
  'unknown',
]);

export const personalCommMediaTypeEnum = pgEnum('personal_comm_media_type', ['voice', 'image', 'video', 'document']);

export const personalCommSignalTypeEnum = pgEnum('personal_comm_signal_type', [
  'new_lead',
  'quote_request',
  'emergency_request',
  'payment_confirmation',
  'invoice_request',
  'booking_request',
  'support_request',
  'complaint',
  'compliment',
]);

export const personalCommActionTypeEnum = pgEnum('personal_comm_action_type', ['customer_reply', 'business_action']);
export const personalCommActionStatusEnum = pgEnum('personal_comm_action_status', [
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);

export const personalCommFollowUpTypeEnum = pgEnum('personal_comm_follow_up_type', [
  'unread_business',
  'awaiting_reply',
  'quote_request',
  'overdue_follow_up',
  'missed_whatsapp_call',
  'missed_voice_call',
]);

export const personalCommAnalysisStatusEnum = pgEnum('personal_comm_analysis_status', [
  'pending',
  'completed',
  'unavailable',
  'failed',
]);

export const personalCommAccounts = pgTable('personal_comm_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  accountType: personalCommAccountTypeEnum('account_type').notNull(),
  label: text('label').notNull(),
  phoneNumber: text('phone_number'),
  whatsappConnectionId: uuid('whatsapp_connection_id').references(() => whatsappConnections.id, {
    onDelete: 'set null',
  }),
  isActive: boolean('is_active').notNull().default(true),
  syncEnabled: boolean('sync_enabled').notNull().default(true),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const personalCommConversations = pgTable('personal_comm_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').references(() => personalCommAccounts.id, { onDelete: 'set null' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  contactPhone: text('contact_phone'),
  contactName: text('contact_name'),
  threadKey: text('thread_key').notNull(),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  messageCount: integer('message_count').notNull().default(0),
  classification: personalCommClassificationEnum('classification').notNull().default('unknown'),
  classificationConfidence: integer('classification_confidence').notNull().default(0),
  manualClassificationOverride: personalCommClassificationEnum('manual_classification_override'),
  privacyMode: text('privacy_mode').notNull().default('business'),
  isHidden: boolean('is_hidden').notNull().default(false),
  isLocked: boolean('is_locked').notNull().default(false),
  excludedFromReports: boolean('excluded_from_reports').notNull().default(false),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const personalCommClassificationCorrections = pgTable('personal_comm_classification_corrections', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => personalCommConversations.id, { onDelete: 'cascade' }),
  previousClassification: personalCommClassificationEnum('previous_classification').notNull(),
  correctedClassification: personalCommClassificationEnum('corrected_classification').notNull(),
  notes: text('notes'),
  correctedByUserId: uuid('corrected_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const personalCommMediaItems = pgTable('personal_comm_media_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').references(() => personalCommConversations.id, { onDelete: 'set null' }),
  whatsappMessageId: uuid('whatsapp_message_id').references(() => whatsappMessages.id, { onDelete: 'set null' }),
  mediaType: personalCommMediaTypeEnum('media_type').notNull(),
  externalMediaId: text('external_media_id'),
  mimeType: text('mime_type'),
  fileName: text('file_name'),
  excluded: boolean('excluded').notNull().default(false),
  indexedAt: timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
});

export const personalCommVoiceAnalyses = pgTable('personal_comm_voice_analyses', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  mediaItemId: uuid('media_item_id').references(() => personalCommMediaItems.id, { onDelete: 'set null' }),
  whatsappMessageId: uuid('whatsapp_message_id').references(() => whatsappMessages.id, { onDelete: 'set null' }),
  transcription: text('transcription'),
  summary: text('summary'),
  keyPoints: jsonb('key_points').$type<string[]>().notNull().default([]),
  actionItems: jsonb('action_items').$type<string[]>().notNull().default([]),
  customerIntent: text('customer_intent'),
  urgencyScore: integer('urgency_score'),
  sentiment: text('sentiment'),
  languageDetected: text('language_detected'),
  routingProviderKey: text('routing_provider_key'),
  routingModelKey: text('routing_model_key'),
  status: personalCommAnalysisStatusEnum('status').notNull().default('pending'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const personalCommMediaAnalyses = pgTable('personal_comm_media_analyses', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  mediaItemId: uuid('media_item_id')
    .notNull()
    .references(() => personalCommMediaItems.id, { onDelete: 'cascade' }),
  issueSummary: text('issue_summary'),
  confidenceScore: integer('confidence_score'),
  recommendedServiceCategory: text('recommended_service_category'),
  detectedIssues: jsonb('detected_issues').$type<string[]>().notNull().default([]),
  routingProviderKey: text('routing_provider_key'),
  routingModelKey: text('routing_model_key'),
  status: personalCommAnalysisStatusEnum('status').notNull().default('pending'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const personalCommDocumentAnalyses = pgTable('personal_comm_document_analyses', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  mediaItemId: uuid('media_item_id')
    .notNull()
    .references(() => personalCommMediaItems.id, { onDelete: 'cascade' }),
  documentType: text('document_type'),
  extractedData: jsonb('extracted_data').$type<Record<string, unknown>>().notNull().default({}),
  routingProviderKey: text('routing_provider_key'),
  routingModelKey: text('routing_model_key'),
  status: personalCommAnalysisStatusEnum('status').notNull().default('pending'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const personalCommLeadSignals = pgTable('personal_comm_lead_signals', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').references(() => personalCommConversations.id, { onDelete: 'set null' }),
  signalType: personalCommSignalTypeEnum('signal_type').notNull(),
  subject: text('subject').notNull(),
  recommendation: text('recommendation').notNull(),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  draftType: text('draft_type'),
  confidence: integer('confidence').notNull().default(50),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const personalCommFollowUps = pgTable('personal_comm_follow_ups', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').references(() => personalCommConversations.id, { onDelete: 'set null' }),
  followUpType: personalCommFollowUpTypeEnum('follow_up_type').notNull(),
  status: text('status').notNull().default('pending'),
  subject: text('subject').notNull(),
  recommendation: text('recommendation').notNull(),
  waitingSince: timestamp('waiting_since', { withTimezone: true }),
  priority: integer('priority').notNull().default(50),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const personalCommPrivacySettings = pgTable('personal_comm_privacy_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' })
    .unique(),
  businessOnlyMode: boolean('business_only_mode').notNull().default(false),
  personalOnlyMode: boolean('personal_only_mode').notNull().default(false),
  excludedContacts: jsonb('excluded_contacts').$type<string[]>().notNull().default([]),
  excludedGroups: jsonb('excluded_groups').$type<string[]>().notNull().default([]),
  excludedMediaTypes: jsonb('excluded_media_types').$type<string[]>().notNull().default([]),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const personalCommActions = pgTable('personal_comm_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  actionType: personalCommActionTypeEnum('action_type').notNull(),
  status: personalCommActionStatusEnum('status').notNull().default('pending_approval'),
  subject: text('subject').notNull(),
  recommendation: text('recommendation').notNull(),
  conversationId: uuid('conversation_id').references(() => personalCommConversations.id, { onDelete: 'set null' }),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
