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

export const smWorkflowStatusEnum = pgEnum('sm_workflow_status', [
  'draft',
  'review',
  'published',
  'deprecated',
  'archived',
]);

export const smAlertSeverityEnum = pgEnum('sm_alert_severity', ['info', 'warning', 'critical']);

export const smAlertStatusEnum = pgEnum('sm_alert_status', [
  'open',
  'acknowledged',
  'resolved',
  'dismissed',
]);

export const smAccountTypeEnum = pgEnum('sm_account_type', [
  'trial',
  'active',
  'suspended',
  'cancelled',
  'expired_trial',
  'enterprise',
  'lifetime',
  'internal',
]);

export const smLicenseStatusEnum = pgEnum('sm_license_status', [
  'pending',
  'active',
  'suspended',
  'expired',
  'transferred',
  'revoked',
]);

export const smNotificationStatusEnum = pgEnum('sm_notification_status', [
  'pending',
  'sent',
  'failed',
  'dismissed',
]);

export const smPlatformConfig = pgTable('sm_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  billingPolicy: jsonb('billing_policy').$type<Record<string, unknown>>().notNull().default({}),
  provisioningPolicy: jsonb('provisioning_policy')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  licensingPolicy: jsonb('licensing_policy').$type<Record<string, unknown>>().notNull().default({}),
  partnerPolicy: jsonb('partner_policy').$type<Record<string, unknown>>().notNull().default({}),
  usagePolicy: jsonb('usage_policy').$type<Record<string, unknown>>().notNull().default({}),
  auditRetentionDays: integer('audit_retention_days').notNull().default(365),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smAccountTypeCatalog = pgTable('sm_account_type_catalog', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  accountTypeKey: smAccountTypeEnum('account_type_key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isSystemType: boolean('is_system_type').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smLicenseRecords = pgTable('sm_license_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  targetCompanyId: uuid('target_company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  licenseKey: text('license_key').notNull(),
  licenseType: text('license_type').notNull(),
  status: smLicenseStatusEnum('status').notNull().default('pending'),
  seatLimit: integer('seat_limit'),
  seatsUsed: integer('seats_used').notNull().default(0),
  deviceTrackingEnabled: boolean('device_tracking_enabled').notNull().default(false),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smLicenseHistory = pgTable('sm_license_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  licenseId: uuid('license_id')
    .notNull()
    .references(() => smLicenseRecords.id, { onDelete: 'cascade' }),
  changeType: text('change_type').notNull(),
  previousStatus: text('previous_status'),
  newStatus: text('new_status'),
  notes: text('notes'),
  changedByUserId: uuid('changed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smLicenseSeats = pgTable('sm_license_seats', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  licenseId: uuid('license_id')
    .notNull()
    .references(() => smLicenseRecords.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  deviceId: text('device_id'),
  allocatedAt: timestamp('allocated_at', { withTimezone: true }).notNull().defaultNow(),
  releasedAt: timestamp('released_at', { withTimezone: true }),
});

export const smPaymentProviderConfigs = pgTable('sm_payment_provider_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  providerKey: text('provider_key').notNull(),
  name: text('name').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  supportedCurrencies: jsonb('supported_currencies').$type<string[]>().notNull().default(['USD']),
  workflowStatus: smWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smBillingPolicies = pgTable('sm_billing_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  policyKey: text('policy_key').notNull(),
  name: text('name').notNull(),
  retryPolicy: jsonb('retry_policy').$type<Record<string, unknown>>().notNull().default({}),
  prorationPolicy: jsonb('proration_policy').$type<Record<string, unknown>>().notNull().default({}),
  taxPolicy: jsonb('tax_policy').$type<Record<string, unknown>>().notNull().default({}),
  currencyPolicy: jsonb('currency_policy').$type<Record<string, unknown>>().notNull().default({}),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  workflowStatus: smWorkflowStatusEnum('workflow_status').notNull().default('published'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smCoupons = pgTable('sm_coupons', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  couponCode: text('coupon_code').notNull(),
  name: text('name').notNull(),
  discountType: text('discount_type').notNull(),
  discountValue: integer('discount_value').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  maxRedemptions: integer('max_redemptions'),
  redemptionCount: integer('redemption_count').notNull().default(0),
  validFrom: timestamp('valid_from', { withTimezone: true }),
  validUntil: timestamp('valid_until', { withTimezone: true }),
  workflowStatus: smWorkflowStatusEnum('workflow_status').notNull().default('published'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smAddOnCatalog = pgTable('sm_add_on_catalog', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  addOnKey: text('add_on_key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  priceCents: integer('price_cents').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  billingInterval: text('billing_interval').notNull().default('monthly'),
  features: jsonb('features').$type<string[]>().notNull().default([]),
  limits: jsonb('limits').$type<Record<string, unknown>>().notNull().default({}),
  workflowStatus: smWorkflowStatusEnum('workflow_status').notNull().default('published'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smTenantAddOns = pgTable('sm_tenant_add_ons', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  targetCompanyId: uuid('target_company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  addOnCatalogId: uuid('add_on_catalog_id')
    .notNull()
    .references(() => smAddOnCatalog.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('active'),
  purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

export const smPartnerAccounts = pgTable('sm_partner_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  partnerCompanyId: uuid('partner_company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  partnerType: text('partner_type').notNull(),
  name: text('name').notNull(),
  pricingPolicy: jsonb('pricing_policy').$type<Record<string, unknown>>().notNull().default({}),
  whiteLabelEnabled: boolean('white_label_enabled').notNull().default(false),
  workflowStatus: smWorkflowStatusEnum('workflow_status').notNull().default('published'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smPartnerCommissions = pgTable('sm_partner_commissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  partnerAccountId: uuid('partner_account_id')
    .notNull()
    .references(() => smPartnerAccounts.id, { onDelete: 'cascade' }),
  targetCompanyId: uuid('target_company_id').references(() => companies.id, {
    onDelete: 'set null',
  }),
  amountCents: integer('amount_cents').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  commissionType: text('commission_type').notNull(),
  status: text('status').notNull().default('pending'),
  earnedAt: timestamp('earned_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smManagedTenantLinks = pgTable('sm_managed_tenant_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  partnerAccountId: uuid('partner_account_id')
    .notNull()
    .references(() => smPartnerAccounts.id, { onDelete: 'cascade' }),
  managedCompanyId: uuid('managed_company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  managementLevel: text('management_level').notNull().default('full'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smUsageThresholds = pgTable('sm_usage_thresholds', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  targetCompanyId: uuid('target_company_id').references(() => companies.id, {
    onDelete: 'cascade',
  }),
  metricKey: text('metric_key').notNull(),
  warningPercent: integer('warning_percent').notNull().default(80),
  criticalPercent: integer('critical_percent').notNull().default(95),
  limitValue: integer('limit_value'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smUsageMonitoringSnapshots = pgTable('sm_usage_monitoring_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  targetCompanyId: uuid('target_company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smNotifications = pgTable('sm_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  targetCompanyId: uuid('target_company_id').references(() => companies.id, {
    onDelete: 'cascade',
  }),
  notificationType: text('notification_type').notNull(),
  title: text('title').notNull(),
  message: text('message'),
  status: smNotificationStatusEnum('status').notNull().default('pending'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
});

export const smFeatureAccessRules = pgTable('sm_feature_access_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  featureKey: text('feature_key').notNull(),
  scopeType: text('scope_type').notNull(),
  scopeRef: text('scope_ref'),
  enabled: boolean('enabled').notNull().default(true),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smSaasAlerts = pgTable('sm_saas_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  alertType: text('alert_type').notNull(),
  severity: smAlertSeverityEnum('severity').notNull().default('warning'),
  status: smAlertStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  description: text('description'),
  targetCompanyId: uuid('target_company_id').references(() => companies.id, {
    onDelete: 'set null',
  }),
  sourceModule: text('source_module'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smActionDrafts = pgTable('sm_action_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  draftType: text('draft_type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  sourceRecords: jsonb('source_records').$type<Record<string, unknown>>().notNull().default({}),
  aiGenerated: boolean('ai_generated').notNull().default(false),
  workflowStatus: smWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smAnalyticsSnapshots = pgTable('sm_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smAuditLogs = pgTable('sm_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  actionType: text('action_type').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SmPlatformConfig = typeof smPlatformConfig.$inferSelect;
export type SmSaasAlert = typeof smSaasAlerts.$inferSelect;
