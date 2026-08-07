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

export const whatsappMatchClassificationEnum = pgEnum('whatsapp_match_classification', [
  'exact_verified',
  'high_confidence',
  'review_required',
  'conflicting',
  'no_match',
]);

export const contactSourceKindEnum = pgEnum('contact_source_kind', [
  'whatsapp_conversation',
  'manual_review',
  'xero_import',
  'crm',
]);

export const whatsappMatchReviewStatusEnum = pgEnum('whatsapp_match_review_status', [
  'pending',
  'approved',
  'rejected',
  'superseded',
  'blocked_xero_import',
]);

export const customerContactSources = pgTable('customer_contact_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  normalizedMobile: text('normalized_mobile'),
  originalFormat: text('original_format'),
  source: contactSourceKindEnum('source').notNull().default('whatsapp_conversation'),
  conversationRef: text('conversation_ref'),
  evidence: jsonb('evidence').$type<Array<Record<string, unknown>>>().notNull().default([]),
  confidenceScore: integer('confidence_score').notNull().default(0),
  matchClassification: whatsappMatchClassificationEnum('match_classification')
    .notNull()
    .default('no_match'),
  history: jsonb('history').$type<Array<Record<string, unknown>>>().notNull().default([]),
  isVerified: boolean('is_verified').notNull().default(false),
  isServiceSafe: boolean('is_service_safe').notNull().default(false),
  marketingConsentStatus: text('marketing_consent_status').notNull().default('unknown'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  verifiedByUserId: uuid('verified_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const whatsappMatchReviews = pgTable('whatsapp_match_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  whatsappWaId: text('whatsapp_wa_id').notNull(),
  whatsappDisplayName: text('whatsapp_display_name'),
  proposedMobile: text('proposed_mobile'),
  proposedMobileNormalized: text('proposed_mobile_normalized'),
  matchClassification: whatsappMatchClassificationEnum('match_classification')
    .notNull()
    .default('review_required'),
  confidenceScore: integer('confidence_score').notNull().default(0),
  evidence: jsonb('evidence').$type<Array<Record<string, unknown>>>().notNull().default([]),
  status: whatsappMatchReviewStatusEnum('status').notNull().default('pending'),
  priorityRank: integer('priority_rank').notNull().default(99),
  conversationRef: text('conversation_ref'),
  conflictingCustomerIds: jsonb('conflicting_customer_ids').$type<string[]>().notNull().default([]),
  reviewNotes: text('review_notes'),
  titanSaved: boolean('titan_saved').notNull().default(false),
  xeroSyncBackRequested: boolean('xero_sync_back_requested').notNull().default(false),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CustomerContactSource = typeof customerContactSources.$inferSelect;
export type NewCustomerContactSource = typeof customerContactSources.$inferInsert;
export type WhatsappMatchReview = typeof whatsappMatchReviews.$inferSelect;
export type NewWhatsappMatchReview = typeof whatsappMatchReviews.$inferInsert;
