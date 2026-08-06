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
import { users } from './users';
import { voiceSessions } from './voice';

/**
 * Call Intelligence Engine — analysis records, lead drafts, settings.
 * Extends VAIR call sessions + core voice sessions. No fake calls.
 * Lead drafts never auto-execute / auto-send.
 * `callSessionId` links logically to `vair_call_sessions` when Dept 9.1 is applied
 * (no hard FK — concurrent migration ordering may journal VAIR separately).
 */

export const ciLeadKindEnum = pgEnum('ci_lead_kind', [
  'new_enquiry',
  'service_request',
  'potential_job',
  'urgent_opportunity',
  'other',
]);

export const ciLeadDraftStatusEnum = pgEnum('ci_lead_draft_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
]);

export const ciSettings = pgTable('ci_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  summariesEnabled: boolean('summaries_enabled').notNull().default(true),
  sentimentEnabled: boolean('sentiment_enabled').notNull().default(true),
  insightsEnabled: boolean('insights_enabled').notNull().default(true),
  leadExtractionEnabled: boolean('lead_extraction_enabled').notNull().default(true),
  /** Invariant: always false — never auto customer communication. */
  autoSendEnabled: boolean('auto_send_enabled').notNull().default(false),
  /** Invariant: always true — lead drafts require Owner approval. */
  leadDraftsRequireOwnerApproval: boolean('lead_drafts_require_owner_approval')
    .notNull()
    .default(true),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ciCallAnalyses = pgTable('ci_call_analyses', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  /** Logical link to vair_call_sessions.id when present. */
  callSessionId: uuid('call_session_id'),
  voiceSessionId: uuid('voice_session_id').references(() => voiceSessions.id, {
    onDelete: 'set null',
  }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  availability: text('availability').notNull().default('unavailable'),
  summary: text('summary'),
  keyPoints: jsonb('key_points').$type<string[]>().notNull().default([]),
  customerRequests: jsonb('customer_requests').$type<string[]>().notNull().default([]),
  requiredActions: jsonb('required_actions').$type<string[]>().notNull().default([]),
  followUpRecommendations: jsonb('follow_up_recommendations')
    .$type<string[]>()
    .notNull()
    .default([]),
  transcriptTurnCount: integer('transcript_turn_count').notNull().default(0),
  sentiment: text('sentiment').notNull().default('unavailable'),
  sentimentAvailability: text('sentiment_availability').notNull().default('unavailable'),
  urgency: text('urgency').notNull().default('unavailable'),
  priority: text('priority').notNull().default('unavailable'),
  sentimentRationale: text('sentiment_rationale'),
  /** Invariant: always false. */
  invented: boolean('invented').notNull().default(false),
  sourceTextHash: text('source_text_hash'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ciLeadDrafts = pgTable('ci_lead_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: ciLeadKindEnum('kind').notNull().default('other'),
  status: ciLeadDraftStatusEnum('status').notNull().default('draft'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  /** Logical link to vair_call_sessions.id when present. */
  callSessionId: uuid('call_session_id'),
  voiceSessionId: uuid('voice_session_id').references(() => voiceSessions.id, {
    onDelete: 'set null',
  }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  contactName: text('contact_name'),
  contactPhone: text('contact_phone'),
  contactEmail: text('contact_email'),
  /** Invariant: always false. */
  autoExecuted: boolean('auto_executed').notNull().default(false),
  /** Invariant: always false. */
  autoSend: boolean('auto_send').notNull().default(false),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
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

export type CiSettingsRow = typeof ciSettings.$inferSelect;
export type NewCiSettingsRow = typeof ciSettings.$inferInsert;
export type CiCallAnalysisRow = typeof ciCallAnalyses.$inferSelect;
export type NewCiCallAnalysisRow = typeof ciCallAnalyses.$inferInsert;
export type CiLeadDraftRow = typeof ciLeadDrafts.$inferSelect;
export type NewCiLeadDraftRow = typeof ciLeadDrafts.$inferInsert;
