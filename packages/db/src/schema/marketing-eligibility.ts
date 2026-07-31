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

export const buyerClassificationEnum = pgEnum('buyer_classification', [
  'contact_record',
  'accrec_buyer',
  'paid_buyer',
  'repeat_buyer',
  'inactive_reactivation_candidate',
  'supplier_only',
  'prospect_lead',
  'uncertain_manual_review',
]);

export const contactFieldKeyEnum = pgEnum('contact_field_key', [
  'name',
  'contact_person',
  'email',
  'phone',
]);

export const contactVerificationStateEnum = pgEnum('contact_verification_state', [
  'unknown',
  'unverified',
  'verified',
  'placeholder',
  'bounced',
]);

export const marketingConsentChannelEnum = pgEnum('marketing_consent_channel', [
  'whatsapp',
  'email',
  'sms',
  'phone',
]);

export const marketingConsentStatusEnum = pgEnum('marketing_consent_status', [
  'unknown',
  'granted',
  'denied',
  'withdrawn',
  'do_not_contact',
]);

export const reactivationEligibilityStatusEnum = pgEnum('reactivation_eligibility_status', [
  'eligible',
  'excluded',
  'blocked',
  'awaiting_verification',
]);

export const marketingAudienceRequestStatusEnum = pgEnum('marketing_audience_request_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
]);

export const xeroSyncBackRequestStatusEnum = pgEnum('xero_sync_back_request_status', [
  'requested',
  'approved_pending_provider',
  'cancelled',
  'blocked_no_provider',
]);

export const customerBuyerClassifications = pgTable('customer_buyer_classifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  primaryClassification: buyerClassificationEnum('primary_classification')
    .notNull()
    .default('contact_record'),
  isAccrecBuyer: boolean('is_accrec_buyer').notNull().default(false),
  isPaidBuyer: boolean('is_paid_buyer').notNull().default(false),
  isRepeatBuyer: boolean('is_repeat_buyer').notNull().default(false),
  isSupplierOnly: boolean('is_supplier_only').notNull().default(false),
  qualifyingInvoiceCount: integer('qualifying_invoice_count').notNull().default(0),
  paidInvoiceCount: integer('paid_invoice_count').notNull().default(0),
  lastPaidAt: timestamp('last_paid_at', { withTimezone: true }),
  lastQualifyingAt: timestamp('last_qualifying_at', { withTimezone: true }),
  xeroContactId: text('xero_contact_id'),
  evidence: jsonb('evidence').$type<Array<Record<string, unknown>>>().notNull().default([]),
  reason: text('reason').notNull().default(''),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  clientActionId: text('client_action_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const customerContactFields = pgTable('customer_contact_fields', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  fieldKey: contactFieldKeyEnum('field_key').notNull(),
  value: text('value'),
  source: text('source').notNull().default('unknown'),
  verificationState: contactVerificationStateEnum('verification_state')
    .notNull()
    .default('unknown'),
  isSharedCompanyEmail: boolean('is_shared_company_email').notNull().default(false),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  verifiedByUserId: uuid('verified_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const customerContactCorrections = pgTable('customer_contact_corrections', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  fieldKey: contactFieldKeyEnum('field_key').notNull(),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  reason: text('reason').notNull().default(''),
  changedByUserId: uuid('changed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const customerMarketingConsents = pgTable('customer_marketing_consents', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  channel: marketingConsentChannelEnum('channel').notNull(),
  status: marketingConsentStatusEnum('status').notNull().default('unknown'),
  lawfulBasis: text('lawful_basis'),
  captureSource: text('capture_source'),
  wordingVersion: text('wording_version'),
  capturedAt: timestamp('captured_at', { withTimezone: true }),
  capturedByUserId: uuid('captured_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const customerMarketingConsentAudits = pgTable('customer_marketing_consent_audits', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  channel: marketingConsentChannelEnum('channel').notNull(),
  previousStatus: marketingConsentStatusEnum('previous_status'),
  newStatus: marketingConsentStatusEnum('new_status').notNull(),
  reason: text('reason').notNull().default(''),
  changedByUserId: uuid('changed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const marketingReactivationEligibility = pgTable('marketing_reactivation_eligibility', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  eligibilityStatus: reactivationEligibilityStatusEnum('eligibility_status')
    .notNull()
    .default('excluded'),
  preferredChannel: marketingConsentChannelEnum('preferred_channel'),
  reasons: jsonb('reasons').$type<Array<Record<string, unknown>>>().notNull().default([]),
  evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const marketingAudienceRequests = pgTable('marketing_audience_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  criteria: jsonb('criteria').$type<Record<string, unknown>>().notNull().default({}),
  exclusions: jsonb('exclusions').$type<Record<string, unknown>>().notNull().default({}),
  memberCustomerIds: jsonb('member_customer_ids').$type<string[]>().notNull().default([]),
  memberCount: integer('member_count').notNull().default(0),
  status: marketingAudienceRequestStatusEnum('status').notNull().default('draft'),
  deliveryState: text('delivery_state').notNull().default('not_sent'),
  requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  notes: text('notes'),
  clientActionId: text('client_action_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const xeroContactSyncBackRequests = pgTable('xero_contact_sync_back_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  requestedFields: jsonb('requested_fields').$type<string[]>().notNull().default([]),
  status: xeroSyncBackRequestStatusEnum('status').notNull().default('requested'),
  requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  notes: text('notes'),
  clientActionId: text('client_action_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
