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

export const saasTenantKindEnum = pgEnum('saas_tenant_kind', ['platform_owner', 'customer']);

export const saasTenantLifecycleEnum = pgEnum('saas_tenant_lifecycle', [
  'provisioning',
  'active',
  'suspended',
  'cancelled',
]);

export const saasSubscriptionStatusEnum = pgEnum('saas_subscription_status', [
  'trial',
  'active',
  'grace_period',
  'suspended',
  'cancelled',
]);

export const saasPlanTierEnum = pgEnum('saas_plan_tier', [
  'free_trial',
  'starter',
  'professional',
  'enterprise',
]);

export const saasBillingIntervalEnum = pgEnum('saas_billing_interval', ['monthly', 'annual']);

export const saasBillingRecordTypeEnum = pgEnum('saas_billing_record_type', [
  'invoice',
  'payment',
  'renewal',
  'credit',
  'coupon',
  'tax',
]);

export const saasBillingRecordStatusEnum = pgEnum('saas_billing_record_status', [
  'draft',
  'pending',
  'paid',
  'failed',
  'void',
]);

export const saasPlatformActionTypeEnum = pgEnum('saas_platform_action_type', [
  'tenant_provision',
  'tenant_suspend',
  'tenant_reactivate',
  'plan_upgrade',
  'plan_downgrade',
  'subscription_cancel',
  'branding_update',
  'feature_flag_update',
]);

export const saasPlatformActionStatusEnum = pgEnum('saas_platform_action_status', [
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);

export const saasTenantProfiles = pgTable('saas_tenant_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  tenantKind: saasTenantKindEnum('tenant_kind').notNull().default('customer'),
  lifecycleStatus: saasTenantLifecycleEnum('lifecycle_status').notNull().default('provisioning'),
  branchLabel: text('branch_label'),
  storageAllocationMb: integer('storage_allocation_mb').notNull().default(1024),
  aiConfig: jsonb('ai_config').$type<Record<string, unknown>>().notNull().default({}),
  auditConfig: jsonb('audit_config').$type<Record<string, unknown>>().notNull().default({}),
  securityPolicyConfig: jsonb('security_policy_config')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  provisionedAt: timestamp('provisioned_at', { withTimezone: true }),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  /** Platform Owner / entitlement suspension reason (not a data purge). */
  suspensionReason: text('suspension_reason'),
  lastAccessAction: text('last_access_action'),
  lastAccessActionAt: timestamp('last_access_action_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const saasTenantBranches = pgTable('saas_tenant_branches', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  branchKey: text('branch_key').notNull(),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const saasSubscriptionPlans = pgTable('saas_subscription_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerCompanyId: uuid('owner_company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  planKey: text('plan_key').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  tier: saasPlanTierEnum('tier').notNull(),
  priceCents: integer('price_cents').notNull().default(0),
  billingInterval: saasBillingIntervalEnum('billing_interval').notNull().default('monthly'),
  features: jsonb('features').$type<string[]>().notNull().default([]),
  limits: jsonb('limits')
    .$type<{
      users?: number;
      storageMb?: number;
      apiRequests?: number;
      aiTokens?: number;
      integrations?: number;
    }>()
    .notNull()
    .default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const saasSubscriptions = pgTable('saas_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id').references(() => saasSubscriptionPlans.id, { onDelete: 'set null' }),
  status: saasSubscriptionStatusEnum('status').notNull().default('trial'),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
  /** Paid-through entitlement end — access remains until this timestamp. */
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  gracePeriodEndsAt: timestamp('grace_period_ends_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  lastPaymentFailedAt: timestamp('last_payment_failed_at', { withTimezone: true }),
  lastPaymentFailureReason: text('last_payment_failure_reason'),
  lastSuccessfulPaymentAt: timestamp('last_successful_payment_at', { withTimezone: true }),
  /** Provider reference for idempotent payment/renewal events. */
  paymentProviderRef: text('payment_provider_ref'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const saasBillingRecords = pgTable('saas_billing_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  subscriptionId: uuid('subscription_id').references(() => saasSubscriptions.id, {
    onDelete: 'set null',
  }),
  recordType: saasBillingRecordTypeEnum('record_type').notNull(),
  status: saasBillingRecordStatusEnum('status').notNull().default('draft'),
  amountCents: integer('amount_cents').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  description: text('description').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const saasBrandingProfiles = pgTable('saas_branding_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  logoUrl: text('logo_url'),
  companyDisplayName: text('company_display_name'),
  primaryColor: text('primary_color'),
  secondaryColor: text('secondary_color'),
  accentColor: text('accent_color'),
  emailBranding: jsonb('email_branding').$type<Record<string, unknown>>().notNull().default({}),
  pdfBranding: jsonb('pdf_branding').$type<Record<string, unknown>>().notNull().default({}),
  invoiceBranding: jsonb('invoice_branding').$type<Record<string, unknown>>().notNull().default({}),
  portalBranding: jsonb('portal_branding').$type<Record<string, unknown>>().notNull().default({}),
  loginBranding: jsonb('login_branding').$type<Record<string, unknown>>().notNull().default({}),
  mobileBranding: jsonb('mobile_branding').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const saasFeatureEntitlements = pgTable('saas_feature_entitlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  featureKey: text('feature_key').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  limitValue: integer('limit_value'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const saasFeatureFlags = pgTable('saas_feature_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerCompanyId: uuid('owner_company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  flagKey: text('flag_key').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  defaultEnabled: boolean('default_enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const saasTenantFeatureFlags = pgTable('saas_tenant_feature_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  flagKey: text('flag_key').notNull(),
  enabled: boolean('enabled').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const saasUsageSnapshots = pgTable('saas_usage_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userCount: integer('user_count').notNull().default(0),
  storageBytes: integer('storage_bytes').notNull().default(0),
  apiRequestCount: integer('api_request_count').notNull().default(0),
  aiUsageCount: integer('ai_usage_count').notNull().default(0),
  integrationCount: integer('integration_count').notNull().default(0),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const saasPlatformAudits = pgTable('saas_platform_audits', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  actionType: text('action_type').notNull(),
  subject: text('subject').notNull(),
  details: text('details'),
  performedByUserId: uuid('performed_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  performedAt: timestamp('performed_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const saasPlatformActions = pgTable('saas_platform_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  actionType: saasPlatformActionTypeEnum('action_type').notNull(),
  status: saasPlatformActionStatusEnum('status').notNull().default('pending_approval'),
  subject: text('subject').notNull(),
  recommendation: text('recommendation').notNull(),
  targetCompanyId: uuid('target_company_id').references(() => companies.id, {
    onDelete: 'set null',
  }),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SaasTenantProfileRow = typeof saasTenantProfiles.$inferSelect;
