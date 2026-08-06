import {
  boolean,
  date,
  doublePrecision,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { documents } from './documents';
import { jobs } from './jobs';
import { portalUsers } from './portal-users';

export const cxBookingStatusEnum = pgEnum('cx_booking_status', [
  'draft',
  'pending_approval',
  'approved',
  'confirmed',
  'rejected',
  'cancelled',
  'completed',
]);

export const cxBookingTypeEnum = pgEnum('cx_booking_type', [
  'standard',
  'emergency',
  'reschedule',
  'cancellation',
]);

export const cxReviewTypeEnum = pgEnum('cx_review_type', [
  'satisfaction_survey',
  'job_rating',
  'technician_rating',
  'business_review',
  'complaint',
  'internal_feedback',
]);

export const cxReviewStatusEnum = pgEnum('cx_review_status', [
  'submitted',
  'acknowledged',
  'resolved',
  'closed',
]);

export const cxReferralStatusEnum = pgEnum('cx_referral_status', [
  'invited',
  'registered',
  'converted',
  'rewarded',
  'expired',
]);

export const cxLoyaltyTierEnum = pgEnum('cx_loyalty_tier', [
  'bronze',
  'silver',
  'gold',
  'platinum',
  'custom',
]);

export const cxDocumentAccessTypeEnum = pgEnum('cx_document_access_type', [
  'invoice',
  'quotation',
  'certificate',
  'compliance_report',
  'job_card',
  'warranty',
  'upload',
]);

export const cxPlatformConfig = pgTable('cx_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  globalPolicies: jsonb('global_policies').$type<Record<string, unknown>>().notNull().default({}),
  brandingTemplates: jsonb('branding_templates')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  portalDefaults: jsonb('portal_defaults').$type<Record<string, unknown>>().notNull().default({}),
  communicationPolicies: jsonb('communication_policies')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  engagementRules: jsonb('engagement_rules').$type<Record<string, unknown>>().notNull().default({}),
  loyaltySettings: jsonb('loyalty_settings').$type<Record<string, unknown>>().notNull().default({}),
  trackingEnabled: boolean('tracking_enabled').notNull().default(false),
  pwaEnabled: boolean('pwa_enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cxCustomerProperties = pgTable('cx_customer_properties', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  portalUserId: uuid('portal_user_id').references(() => portalUsers.id, { onDelete: 'set null' }),
  propertyName: text('property_name').notNull(),
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  suburb: text('suburb'),
  city: text('city'),
  province: text('province'),
  postalCode: text('postal_code'),
  unitNumber: text('unit_number'),
  isPrimary: boolean('is_primary').notNull().default(false),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  placeId: text('place_id'),
  formattedAddress: text('formatted_address'),
  geocodedAt: timestamp('geocoded_at', { withTimezone: true }),
  geocodeStatus: text('geocode_status'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cxAppointmentBookings = pgTable('cx_appointment_bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  portalUserId: uuid('portal_user_id').references(() => portalUsers.id, { onDelete: 'set null' }),
  propertyId: uuid('property_id').references(() => cxCustomerProperties.id, {
    onDelete: 'set null',
  }),
  bookingType: cxBookingTypeEnum('booking_type').notNull().default('standard'),
  status: cxBookingStatusEnum('status').notNull().default('pending_approval'),
  subject: text('subject').notNull(),
  preferredDate: date('preferred_date'),
  preferredTimeWindow: text('preferred_time_window'),
  jobNotes: text('job_notes'),
  photoUrls: jsonb('photo_urls').$type<string[]>().notNull().default([]),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cxCustomerDocuments = pgTable('cx_customer_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  accessType: cxDocumentAccessTypeEnum('access_type').notNull(),
  title: text('title').notNull(),
  fileName: text('file_name'),
  version: integer('version').notNull().default(1),
  uploadedByPortalUserId: uuid('uploaded_by_portal_user_id').references(() => portalUsers.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cxReviewsFeedback = pgTable('cx_reviews_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  portalUserId: uuid('portal_user_id').references(() => portalUsers.id, { onDelete: 'set null' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  reviewType: cxReviewTypeEnum('review_type').notNull(),
  status: cxReviewStatusEnum('status').notNull().default('submitted'),
  rating: integer('rating'),
  subject: text('subject').notNull(),
  feedback: text('feedback').notNull(),
  resolutionNotes: text('resolution_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cxLoyaltyPrograms = pgTable('cx_loyalty_programs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tier: cxLoyaltyTierEnum('tier').notNull().default('bronze'),
  pointsRequired: integer('points_required').notNull().default(0),
  rewardDescription: text('reward_description'),
  discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }),
  isActive: boolean('is_active').notNull().default(false),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cxLoyaltyReferrals = pgTable('cx_loyalty_referrals', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  referrerCustomerId: uuid('referrer_customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  referrerPortalUserId: uuid('referrer_portal_user_id').references(() => portalUsers.id, {
    onDelete: 'set null',
  }),
  referredEmail: text('referred_email').notNull(),
  referredCustomerId: uuid('referred_customer_id').references(() => customers.id, {
    onDelete: 'set null',
  }),
  status: cxReferralStatusEnum('status').notNull().default('invited'),
  rewardApplied: boolean('reward_applied').notNull().default(false),
  invitedAt: timestamp('invited_at', { withTimezone: true }).notNull().defaultNow(),
  convertedAt: timestamp('converted_at', { withTimezone: true }),
});

export const cxEngagementPreferences = pgTable('cx_engagement_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  portalUserId: uuid('portal_user_id')
    .notNull()
    .references(() => portalUsers.id, { onDelete: 'cascade' }),
  pushEnabled: boolean('push_enabled').notNull().default(true),
  smsEnabled: boolean('sms_enabled').notNull().default(true),
  emailEnabled: boolean('email_enabled').notNull().default(true),
  whatsappEnabled: boolean('whatsapp_enabled').notNull().default(true),
  marketingEnabled: boolean('marketing_enabled').notNull().default(false),
  trackingConsent: boolean('tracking_consent').notNull().default(false),
  preferences: jsonb('preferences').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cxAnalyticsSnapshots = pgTable('cx_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  portalUsageCount: integer('portal_usage_count').notNull().default(0),
  mobileUsageCount: integer('mobile_usage_count').notNull().default(0),
  bookingConversionRate: numeric('booking_conversion_rate', { precision: 5, scale: 2 }),
  customerSatisfactionScore: numeric('customer_satisfaction_score', { precision: 5, scale: 2 }),
  avgResponseTimeHours: numeric('avg_response_time_hours', { precision: 10, scale: 2 }),
  technicianArrivalAccuracy: numeric('technician_arrival_accuracy', { precision: 5, scale: 2 }),
  referralCount: integer('referral_count').notNull().default(0),
  loyaltyParticipationCount: integer('loyalty_participation_count').notNull().default(0),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cxAuditLogs = pgTable('cx_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  portalUserId: uuid('portal_user_id').references(() => portalUsers.id, { onDelete: 'set null' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  actionType: text('action_type').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CxPlatformConfig = typeof cxPlatformConfig.$inferSelect;
export type CxCustomerProperty = typeof cxCustomerProperties.$inferSelect;
export type CxAppointmentBooking = typeof cxAppointmentBookings.$inferSelect;
export type CxCustomerDocument = typeof cxCustomerDocuments.$inferSelect;
export type CxReviewFeedback = typeof cxReviewsFeedback.$inferSelect;
export type CxLoyaltyProgram = typeof cxLoyaltyPrograms.$inferSelect;
export type CxLoyaltyReferral = typeof cxLoyaltyReferrals.$inferSelect;
export type CxEngagementPreference = typeof cxEngagementPreferences.$inferSelect;
export type CxAnalyticsSnapshot = typeof cxAnalyticsSnapshots.$inferSelect;
export type CxAuditLog = typeof cxAuditLogs.$inferSelect;
