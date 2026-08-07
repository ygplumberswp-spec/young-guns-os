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
import { users } from './users';
import { customers } from './customers';
import { leads } from './leads';
import { jobs } from './jobs';
import { commPlatformPersonalThreads } from './communications-platform';
import { personalCommConversations } from './personal-communications-intelligence';

/**
 * Personal WhatsApp Intelligence — bridges owner-scoped personal threads
 * (Communications Platform) into classification / extraction / approval queues.
 * Does not store fabricated messages. Private by default until Owner approves links.
 */

export const personalWaIntelClassificationEnum = pgEnum('personal_wa_intel_classification', [
  'customer',
  'supplier',
  'employee',
  'business_opportunity',
  'private_personal',
]);

export const personalWaIntelProposalStatusEnum = pgEnum('personal_wa_intel_proposal_status', [
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);

export const personalWaIntelLinkTargetEnum = pgEnum('personal_wa_intel_link_target', [
  'customer',
  'lead',
  'job',
  'quote',
  'invoice',
  'property',
  'supplier',
  'staff',
  'timeline',
]);

export const personalWaIntelAuraTypeEnum = pgEnum('personal_wa_intel_aura_type', [
  'next_action',
  'draft_reply',
  'approval_request',
]);

export const personalWaIntelClassifications = pgTable('personal_wa_intel_classifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  personalThreadId: uuid('personal_thread_id')
    .notNull()
    .references(() => commPlatformPersonalThreads.id, { onDelete: 'cascade' }),
  /** Optional projection into PCI conversation after Owner-approved business import. */
  personalCommConversationId: uuid('personal_comm_conversation_id').references(
    () => personalCommConversations.id,
    { onDelete: 'set null' },
  ),
  classification: personalWaIntelClassificationEnum('classification')
    .notNull()
    .default('private_personal'),
  classificationConfidence: integer('classification_confidence').notNull().default(0),
  manualOverride: personalWaIntelClassificationEnum('manual_override'),
  rationale: text('rationale'),
  privacyExcluded: boolean('privacy_excluded').notNull().default(true),
  excludedFromBusinessSearch: boolean('excluded_from_business_search').notNull().default(true),
  extraction: jsonb('extraction').$type<Record<string, unknown>>().notNull().default({}),
  linkedCustomerId: uuid('linked_customer_id').references(() => customers.id, {
    onDelete: 'set null',
  }),
  linkedLeadId: uuid('linked_lead_id').references(() => leads.id, { onDelete: 'set null' }),
  linkedJobId: uuid('linked_job_id').references(() => jobs.id, { onDelete: 'set null' }),
  linkedPropertyId: uuid('linked_property_id'),
  timelineLinked: boolean('timeline_linked').notNull().default(false),
  classifiedByUserId: uuid('classified_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const personalWaIntelLinkProposals = pgTable('personal_wa_intel_link_proposals', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  personalThreadId: uuid('personal_thread_id').references(() => commPlatformPersonalThreads.id, {
    onDelete: 'set null',
  }),
  classificationId: uuid('classification_id').references(() => personalWaIntelClassifications.id, {
    onDelete: 'set null',
  }),
  linkTargetType: personalWaIntelLinkTargetEnum('link_target_type').notNull(),
  linkTargetId: uuid('link_target_id'),
  status: personalWaIntelProposalStatusEnum('status').notNull().default('pending_approval'),
  subject: text('subject').notNull(),
  recommendation: text('recommendation').notNull(),
  notes: text('notes'),
  /** Invariant: always false — never auto-link. */
  autoLinked: boolean('auto_linked').notNull().default(false),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const personalWaIntelAuraSuggestions = pgTable('personal_wa_intel_aura_suggestions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  personalThreadId: uuid('personal_thread_id').references(() => commPlatformPersonalThreads.id, {
    onDelete: 'set null',
  }),
  suggestionType: personalWaIntelAuraTypeEnum('suggestion_type').notNull(),
  status: personalWaIntelProposalStatusEnum('status').notNull().default('pending_approval'),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  /** Invariant: always false — AURA never auto-sends. */
  autoSend: boolean('auto_send').notNull().default(false),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PersonalWaIntelClassificationRow = typeof personalWaIntelClassifications.$inferSelect;
export type PersonalWaIntelLinkProposalRow = typeof personalWaIntelLinkProposals.$inferSelect;
export type PersonalWaIntelAuraSuggestionRow = typeof personalWaIntelAuraSuggestions.$inferSelect;
